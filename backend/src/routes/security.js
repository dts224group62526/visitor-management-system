const express = require('express');
const pool    = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendVisitCompletedEmail } = require('../lib/email');

const router = express.Router();
router.use(requireAuth('security'));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/security/verify/:code
//
// Looks up a visitor by their 10-char verification code.
// Returns:
//   - visitor details (name, photo, phones)
//   - code_active status  (R6 — deactivated code shown but blocked)
//   - list of eligible host students with their current visit status
//   - whether the visitor has an open visit right now (R7)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/verify/:code', async (req, res) => {
  const { institutionId } = req.session;
  const code = req.params.code.trim().toUpperCase();

  try {
    // 1. Find the visitor
    const { rows: [visitor] } = await pool.query(
      `SELECT
         av.id, av.name, av.email, av.photo_url,
         av.verification_code, av.code_active,
         COALESCE(
           ARRAY_AGG(vpn.phone ORDER BY vpn.id) FILTER (WHERE vpn.phone IS NOT NULL),
           '{}'::TEXT[]
         ) AS phones
       FROM approved_visitors av
       LEFT JOIN visitor_phone_numbers vpn ON vpn.visitor_id = av.id
       WHERE av.verification_code = $1 AND av.institution_id = $2
       GROUP BY av.id`,
      [code, institutionId]
    );

    if (!visitor) {
      return res.status(404).json({ error: 'No visitor found with that verification code.' });
    }

    // 2. Find all active student links for this visitor + their visit status today
    const { rows: hosts } = await pool.query(
      `SELECT
         vsl.id              AS link_id,
         vsl.student_id,
         vsl.is_active       AS link_active,
         u.name              AS student_name,
         u.identifier        AS matric_no,
         h.name              AS hall_name,
         s.room,
         -- Current open visit for this visitor (not archived, status not completed)
         av2.id              AS visit_id,
         av2.status          AS visit_status,
         TO_CHAR(av2.check_in_barricade_time AT TIME ZONE 'Africa/Lagos', 'HH12:MI AM')
                             AS check_in_time
       FROM visitor_student_link vsl
       JOIN users               u   ON u.id   = vsl.student_id
       JOIN students            s   ON s.user_id = vsl.student_id
       JOIN halls_of_residence  h   ON h.id   = s.hall_id
       -- Look for any open (non-completed, non-archived) visit for this visitor
       LEFT JOIN actual_visits  av2
         ON av2.visitor_id   = $1
         AND av2.institution_id = $2
         AND av2.status      IN ('checked_in','at_hall')
         AND av2.is_archived = FALSE
       WHERE vsl.visitor_id    = $1
         AND vsl.institution_id = $2
       ORDER BY h.name, s.room`,
      [visitor.id, institutionId]
    );

    // R7: visitor has an open visit if any row has a visit_id
    const openVisit = hosts.find(h => h.visit_id);

    res.json({
      visitor: {
        id:               visitor.id,
        name:             visitor.name,
        email:            visitor.email,
        photoUrl:         visitor.photo_url,
        verificationCode: visitor.verification_code,
        codeActive:       visitor.code_active,
        phones:           visitor.phones,
      },
      hasOpenVisit: !!openVisit,
      openVisitId:  openVisit?.visit_id   ?? null,
      openStatus:   openVisit?.visit_status ?? null,
      hosts: hosts.map(h => ({
        linkId:      h.link_id,
        studentId:   h.student_id,
        studentName: h.student_name,
        matricNo:    h.matric_no,
        hall:        h.hall_name,
        room:        h.room,
        linkActive:  h.link_active,
        visitId:     h.visit_id     ?? null,
        visitStatus: h.visit_status ?? null,
        checkInTime: h.check_in_time ?? null,
      })),
    });

  } catch (err) {
    console.error('Verify code error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/security/visits  — barricade check-in
// Body: { visitorId, primaryStudentId }
//
// Rules enforced:
//   R6  — code must be active AND student link must be active
//   R7  — visitor must not have an existing open visit
//   R21 — exactly one alert per visit
//   R22 — alert goes to hall officer of the primary student's hall
//   R33 — check_in_barricade_time set automatically (NOW())
// ─────────────────────────────────────────────────────────────────────────────
router.post('/visits', async (req, res) => {
  const { userId: officerId, institutionId, name: officerName } = req.session;
  const { visitorId, primaryStudentId } = req.body;

  if (!visitorId || !primaryStudentId) {
    return res.status(400).json({ error: 'visitorId and primaryStudentId are required.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify visitor belongs to this institution
    const { rows: [visitor] } = await client.query(
      `SELECT id, name, code_active FROM approved_visitors
       WHERE id=$1 AND institution_id=$2`,
      [visitorId, institutionId]
    );
    if (!visitor) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Visitor not found.' });
    }

    // R6: code must be globally active
    if (!visitor.code_active) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'This visitor\'s code has been deactivated.' });
    }

    // R6: student link must be active
    const { rows: [link] } = await client.query(
      `SELECT id, is_active FROM visitor_student_link
       WHERE visitor_id=$1 AND student_id=$2 AND institution_id=$3`,
      [visitorId, primaryStudentId, institutionId]
    );
    if (!link) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No registration found for this visitor and student.' });
    }
    if (!link.is_active) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'The student has deactivated this visitor\'s link.' });
    }

    // R7: visitor must not already have an open visit
    const { rows: openVisits } = await client.query(
      `SELECT id, status FROM actual_visits
       WHERE visitor_id=$1 AND institution_id=$2
         AND status IN ('checked_in','at_hall') AND is_archived=FALSE`,
      [visitorId, institutionId]
    );
    if (openVisits.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'This visitor is already inside the premises. Check them out before checking in again.',
        existingVisitId: openVisits[0].id,
        status:          openVisits[0].status,
      });
    }

    // Get the primary student's hall for the alert
    const { rows: [studentInfo] } = await client.query(
      `SELECT u.name AS student_name, h.id AS hall_id, h.name AS hall_name, s.room
       FROM users u
       JOIN students s ON s.user_id = u.id
       JOIN halls_of_residence h ON h.id = s.hall_id
       WHERE u.id=$1`,
      [primaryStudentId]
    );
    if (!studentInfo) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Student not found.' });
    }

    // R33: Create the visit — check_in_barricade_time set to NOW()
    const { rows: [visit] } = await client.query(
      `INSERT INTO actual_visits
         (visitor_id, institution_id, security_officer_id, check_in_barricade_time, status)
       VALUES ($1,$2,$3,NOW(),'checked_in')
       RETURNING id, status,
         TO_CHAR(check_in_barricade_time AT TIME ZONE 'Africa/Lagos','HH12:MI AM') AS check_in_time`,
      [visitorId, institutionId, officerId]
    );

    // R29: Add primary host
    await client.query(
      `INSERT INTO visit_hosts (visit_id, student_id, is_primary) VALUES ($1,$2,TRUE)`,
      [visit.id, primaryStudentId]
    );

    // R21/R22: Create one alert per hall officer assigned to the primary student's hall
    const { rows: hallOfficers } = await client.query(
      `SELECT u.id AS officer_id, u.name AS officer_name
       FROM hall_officers ho
       JOIN users u ON u.id = ho.user_id
       WHERE ho.hall_id=$1`,
      [studentInfo.hall_id]
    );

    if (hallOfficers.length > 0) {
      for (const officer of hallOfficers) {
        await client.query(
          `INSERT INTO alerts (visit_id, hall_officer_id, status)
           VALUES ($1,$2,'pending')`,
          [visit.id, officer.officer_id]
        );
        // R23: Real-time alert stub (replace with WebSocket/SSE push in production)
        console.log(`\n🔔  Hall Officer Alert (STUB):
  To:      ${officer.officer_name} (${studentInfo.hall_name})
  Message: ${visitor.name} is coming to your hall.
           Call ${studentInfo.student_name} in Room ${studentInfo.room} to wait at the visit room.
  `);
      }
    } else {
      console.warn(`⚠️  No hall officer found for ${studentInfo.hall_name} — alert not sent.`);
    }

    await client.query('COMMIT');

    res.status(201).json({
      ok:          true,
      visitId:     visit.id,
      status:      visit.status,
      checkInTime: visit.check_in_time,
      hall:        studentInfo.hall_name,
      room:        studentInfo.room,
      studentName: studentInfo.student_name,
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Check-in error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/security/visits/:visitId/checkout  — barricade checkout
//
// Rules enforced:
//   R15/R25 — can ONLY checkout when status = 'at_hall'
//             (hall officer must have done hall checkout first)
//   R34     — visit is NEVER deleted; status set to 'completed'
//   Email   — visitor receives checkout summary (stub)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/visits/:visitId/checkout', async (req, res) => {
  const { institutionId, name: officerName } = req.session;
  const { visitId } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch visit + visitor + hall officer name + institution name for the email.
    // Use DISTINCT ON to get one row even when multiple alert rows exist (one per officer).
    const { rows: [visit] } = await client.query(
      `SELECT DISTINCT ON (av2.id)
         av2.id, av2.status, av2.visitor_id,
         av2.check_in_barricade_time,
         av_vis.name  AS visitor_name,
         av_vis.email AS visitor_email,
         u_ho.name    AS hall_officer_name,
         inst.name    AS institution_name
       FROM actual_visits av2
       JOIN approved_visitors av_vis ON av_vis.id = av2.visitor_id
       JOIN institutions inst ON inst.id = av2.institution_id
       LEFT JOIN alerts   al ON al.visit_id = av2.id
       LEFT JOIN users u_ho ON u_ho.id = al.hall_officer_id
       WHERE av2.id=$1 AND av2.institution_id=$2
       ORDER BY av2.id`,
      [visitId, institutionId]
    );

    if (!visit) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Visit not found.' });
    }

    // R15/R25: Only allow checkout when hall officer has recorded hall exit
    if (visit.status !== 'at_hall') {
      await client.query('ROLLBACK');
      const hint = visit.status === 'checked_in'
        ? 'The hall officer has not yet recorded the visitor leaving the hall.'
        : 'This visit is already completed.';
      return res.status(409).json({
        error: `Cannot checkout: visitor status is '${visit.status}'. ${hint}`,
        status: visit.status,
      });
    }

    // R34: Update status to 'completed' — never hard-delete
    const { rows: [updated] } = await client.query(
      `UPDATE actual_visits
       SET status='completed', check_out_barricade_time=NOW()
       WHERE id=$1
       RETURNING
         TO_CHAR(check_in_barricade_time     AT TIME ZONE 'Africa/Lagos','HH12:MI AM') AS check_in_time,
         TO_CHAR(check_out_barricade_time    AT TIME ZONE 'Africa/Lagos','HH12:MI AM') AS check_out_time`,
      [visitId]
    );

    await client.query('COMMIT');

    // ── Email to visitor ──────────────────────────────────────────────────────
    sendVisitCompletedEmail({
      visitorEmail:        visit.visitor_email,
      visitorName:         visit.visitor_name,
      institutionName:     visit.institution_name,
      checkInTime:         updated.check_in_time,
      checkOutTime:        updated.check_out_time,
      securityOfficerName: officerName,
      hallOfficerName:     visit.hall_officer_name ?? null,
    }).catch(err => console.error('📧  Checkout email failed:', err.message));

    res.json({
      ok:           true,
      visitId,
      status:       'completed',
      checkInTime:  updated.check_in_time,
      checkOutTime: updated.check_out_time,
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/security/stats  — today's visit counts for the dashboard
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  const { institutionId } = req.session;
  try {
    const { rows: [counts] } = await pool.query(
      `SELECT
         COUNT(*)                                              AS total_today,
         SUM(CASE WHEN status='checked_in' THEN 1 ELSE 0 END) AS currently_inside,
         SUM(CASE WHEN status='at_hall'    THEN 1 ELSE 0 END) AS awaiting_barricade_checkout,
         SUM(CASE WHEN status='completed'  THEN 1 ELSE 0 END) AS completed_today
       FROM actual_visits
       WHERE institution_id = $1
         AND is_archived = FALSE
         AND DATE(check_in_barricade_time AT TIME ZONE 'Africa/Lagos') = CURRENT_DATE`,
      [institutionId]
    );
    res.json({
      totalToday:               parseInt(counts.total_today               || 0),
      currentlyInside:          parseInt(counts.currently_inside          || 0),
      awaitingBarricadeCheckout: parseInt(counts.awaiting_barricade_checkout || 0),
      completedToday:           parseInt(counts.completed_today           || 0),
    });
  } catch (err) {
    console.error('Security stats error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
