const express = require('express');
const pool    = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth('hall_officer'));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/hall-officer/alerts
//
// Returns all alerts for this officer's hall, newest first.
// Three-stage flow per alert:
//   Stage 1 — status='pending'               hallCheckoutDone=false  → Acknowledge
//   Stage 2 — status='acknowledged'          hallCheckoutDone=false  → Hall Checkout
//   Stage 3 — status='acknowledged'          hallCheckoutDone=true   → Done (security takes over)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/alerts', async (req, res) => {
  const { userId } = req.session;
  try {
    const { rows } = await pool.query(
      `SELECT
         al.id                   AS alert_id,
         al.status               AS alert_status,
         al.hall_checkout_done,
         al.created_at,
         -- Visitor
         av.id                   AS visitor_id,
         av.name                 AS visitor_name,
         av.email                AS visitor_email,
         -- Primary host student (R29)
         u_s.name                AS student_name,
         u_s.identifier          AS matric_no,
         stu.room,
         h.name                  AS hall_name,
         -- Visit
         act.id                  AS visit_id,
         act.status              AS visit_status,
         TO_CHAR(act.check_in_barricade_time  AT TIME ZONE 'Africa/Lagos', 'HH12:MI AM')
                                 AS arrival_time,
         TO_CHAR(act.hall_checkout_time       AT TIME ZONE 'Africa/Lagos', 'HH12:MI AM')
                                 AS hall_checkout_time,
         -- Security officer who checked in
         u_sec.name              AS security_officer_name
       FROM alerts              al
       JOIN actual_visits       act  ON act.id     = al.visit_id
       JOIN approved_visitors   av   ON av.id      = act.visitor_id
       -- Primary host student
       JOIN visit_hosts         vh   ON vh.visit_id = act.id AND vh.is_primary = TRUE
       JOIN users               u_s  ON u_s.id     = vh.student_id
       JOIN students            stu  ON stu.user_id = vh.student_id
       JOIN halls_of_residence  h    ON h.id        = stu.hall_id
       -- Security officer
       LEFT JOIN users          u_sec ON u_sec.id  = act.security_officer_id
       WHERE al.hall_officer_id = $1
         AND act.is_archived    = FALSE
       ORDER BY al.created_at DESC`,
      [userId]
    );

    const pendingHallCheckouts = rows.filter(
      r => r.alert_status === 'acknowledged' && !r.hall_checkout_done
    ).length;

    res.json({
      pendingHallCheckouts,
      alerts: rows.map(r => ({
        alertId:             r.alert_id,
        alertStatus:         r.alert_status,        // 'pending' | 'acknowledged'
        hallCheckoutDone:    r.hall_checkout_done,
        createdAt:           r.created_at,
        visitorId:           r.visitor_id,
        visitorName:         r.visitor_name,
        visitorEmail:        r.visitor_email,
        studentName:         r.student_name,
        matricNo:            r.matric_no,
        room:                r.room,
        hall:                r.hall_name,
        visitId:             r.visit_id,
        visitStatus:         r.visit_status,
        arrivalTime:         r.arrival_time,
        hallCheckoutTime:    r.hall_checkout_time   ?? null,
        securityOfficerName: r.security_officer_name ?? 'Unknown',
      })),
    });
  } catch (err) {
    console.error('GET alerts error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/hall-officer/alerts/:alertId/acknowledge
// R22 — moves alert from 'pending' → 'acknowledged'
// ─────────────────────────────────────────────────────────────────────────────
router.put('/alerts/:alertId/acknowledge', async (req, res) => {
  const { userId } = req.session;
  const { alertId } = req.params;

  try {
    const { rows: [alert] } = await pool.query(
      `SELECT id, status, visit_id FROM alerts WHERE id=$1 AND hall_officer_id=$2`,
      [alertId, userId]
    );
    if (!alert) return res.status(404).json({ error: 'Alert not found.' });
    if (alert.status === 'acknowledged') return res.status(409).json({ error: 'Alert already acknowledged.' });

    // Acknowledge this officer's alert
    await pool.query(`UPDATE alerts SET status='acknowledged' WHERE id=$1`, [alertId]);

    // Auto-dismiss all other pending alerts for the same visit (other officers)
    // so they don't see a stale "pending" after someone else has handled it
    await pool.query(
      `UPDATE alerts SET status='acknowledged'
       WHERE visit_id=$1 AND status='pending' AND id!=$2`,
      [alert.visit_id, alertId]
    );

    res.json({ ok: true, alertId, status: 'acknowledged' });
  } catch (err) {
    console.error('Acknowledge error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/hall-officer/alerts/:alertId/hall-checkout
// R20 — hall officer records visitor leaving the hall.
//        Sets actual_visits.status → 'at_hall' so security can do barricade checkout.
//
// Rules enforced:
//   Must be acknowledged first (stage 2 only)
//   Cannot hall-checkout if already done
//   Cannot hall-checkout if visit is already completed/archived
// ─────────────────────────────────────────────────────────────────────────────
router.put('/alerts/:alertId/hall-checkout', async (req, res) => {
  const { userId } = req.session;
  const { alertId } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch alert + visit in one go
    const { rows: [alert] } = await client.query(
      `SELECT
         al.id, al.status, al.hall_checkout_done, al.visit_id,
         act.status AS visit_status
       FROM alerts al
       JOIN actual_visits act ON act.id = al.visit_id
       WHERE al.id=$1 AND al.hall_officer_id=$2`,
      [alertId, userId]
    );

    if (!alert) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Alert not found.' });
    }
    if (alert.status !== 'acknowledged') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'You must acknowledge the alert before recording hall checkout.',
      });
    }
    if (alert.hall_checkout_done) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Hall checkout already recorded for this visit.' });
    }
    if (alert.visit_status !== 'checked_in') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `Visit is in '${alert.visit_status}' state — hall checkout not applicable.`,
      });
    }

    // R20: Mark hall checkout done on the alert
    await client.query(
      `UPDATE alerts SET hall_checkout_done=TRUE WHERE id=$1`,
      [alertId]
    );

    // Advance visit status to 'at_hall' — visitor has left the hall, heading to barricade
    const { rows: [updated] } = await client.query(
      `UPDATE actual_visits
       SET status='at_hall', hall_checkout_time=NOW()
       WHERE id=$1
       RETURNING
         TO_CHAR(hall_checkout_time AT TIME ZONE 'Africa/Lagos','HH12:MI AM') AS hall_checkout_time`,
      [alert.visit_id]
    );

    await client.query('COMMIT');

    res.json({
      ok:               true,
      alertId,
      hallCheckoutDone: true,
      hallCheckoutTime: updated.hall_checkout_time,
      visitStatus:      'at_hall',
      message:          'Hall checkout recorded. Security will complete the barricade checkout.',
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Hall checkout error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

module.exports = router;
