const express = require('express');
const pool    = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendVisitorRegistrationEmail } = require('../lib/email');

const router = express.Router();
router.use(requireAuth('student'));

// ── Code generator ────────────────────────────────────────────────────────────
// R5: 10-char alphanumeric (uppercase letters + digits), server-side only.
// Excludes visually ambiguous chars (0/O, 1/I) for easier manual entry.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

async function generateUniqueCode(client) {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 10; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    const { rows } = await client.query(
      'SELECT 1 FROM approved_visitors WHERE verification_code = $1',
      [code]
    );
    if (!rows.length) return code;
  }
  throw new Error('Could not generate a unique verification code. Please try again.');
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/student/visitors
// Returns all this student's visitor registrations with phones + link status.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/visitors', async (req, res) => {
  const { userId, institutionId } = req.session;
  try {
    const [instResult, visitorsResult] = await Promise.all([
      pool.query('SELECT portal_open FROM institutions WHERE id=$1', [institutionId]),
      pool.query(
        `SELECT
           vsl.id              AS link_id,
           vsl.is_active,
           vsl.created_at      AS registered_at,
           av.id               AS visitor_id,
           av.name,
           av.email,
           av.photo_url,
           av.code_active,
           COALESCE(
             ARRAY_AGG(vpn.phone ORDER BY vpn.id) FILTER (WHERE vpn.phone IS NOT NULL),
             '{}'::TEXT[]
           ) AS phones
         FROM visitor_student_link vsl
         JOIN approved_visitors    av  ON av.id  = vsl.visitor_id
         LEFT JOIN visitor_phone_numbers vpn ON vpn.visitor_id = av.id
         WHERE vsl.student_id    = $1
           AND vsl.institution_id = $2
         GROUP BY vsl.id, av.id
         ORDER BY vsl.created_at DESC`,
        [userId, institutionId]
      ),
    ]);

    res.json({
      portalOpen: instResult.rows[0]?.portal_open ?? true,
      slotsUsed:  visitorsResult.rows.length,        // counts active + inactive (hard cap)
      slotsMax:   4,
      visitors:   visitorsResult.rows,
    });
  } catch (err) {
    console.error('GET visitors error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/student/visitors
// Body: { name, email, phones: string[], photoUrl? }
//
// Rules enforced:
//   R1  — portal must be open
//   R3  — at least one phone number required
//   R4  — dedup by (email + institution_id); reuses existing visitor + code
//   R5  — 10-char alphanumeric code generated server-side
//   Cap — 4 total registrations per student per semester (active + inactive)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/visitors', async (req, res) => {
  const { userId, institutionId, name: studentName } = req.session;
  const { name, email, phones, photoUrl } = req.body;

  // Basic validation
  if (!name?.trim())  return res.status(400).json({ error: 'Visitor name is required.' });
  if (!email?.trim()) return res.status(400).json({ error: 'Visitor email is required.' });
  if (!Array.isArray(phones) || phones.filter(p => p?.trim()).length === 0) {
    return res.status(400).json({ error: 'At least one phone number is required (R3).' });
  }

  const cleanEmail  = email.trim().toLowerCase();
  const cleanPhones = phones.map(p => p.trim()).filter(Boolean);

  // R1: Portal must be open
  const { rows: [inst] } = await pool.query(
    'SELECT portal_open, name AS institution_name FROM institutions WHERE id=$1',
    [institutionId]
  );
  if (!inst?.portal_open) {
    return res.status(403).json({ error: 'The visitor registration portal is currently closed.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Hard cap: count ALL links for this student this semester (active + inactive)
    const { rows: [cap] } = await client.query(
      `SELECT COUNT(*) FROM visitor_student_link
       WHERE student_id = $1 AND institution_id = $2`,
      [userId, institutionId]
    );
    if (parseInt(cap.count) >= 4) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'You have reached the maximum of 4 visitors for this semester.',
      });
    }

    // R4: Check if this visitor already exists for this institution (dedup by email)
    const { rows: [existing] } = await client.query(
      `SELECT id, verification_code FROM approved_visitors
       WHERE institution_id = $1 AND email = $2`,
      [institutionId, cleanEmail]
    );

    let visitorId, verificationCode, isNewVisitor;

    if (existing) {
      // Visitor already exists for this institution (R4 dedup)
      visitorId        = existing.id;
      verificationCode = existing.verification_code;
      isNewVisitor     = false;

      // Check this student hasn't already linked this visitor this semester
      const { rows: [myLink] } = await client.query(
        `SELECT id, is_active FROM visitor_student_link
         WHERE student_id = $1 AND visitor_id = $2`,
        [userId, visitorId]
      );
      if (myLink) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: myLink.is_active
            ? 'This visitor is already registered on your account.'
            : 'This visitor is on your account but deactivated. Use Reactivate instead.',
        });
      }

      // Check if ANY student has already linked this visitor this semester.
      // If yes  → visitor is active this semester; reuse their existing code and data as-is.
      //           A second email will be sent so they receive confirmation, but same code.
      // If no   → post-semester-reset first registration; generate a fresh code and update details.
      const { rows: anyLinks } = await client.query(
        `SELECT id FROM visitor_student_link WHERE visitor_id = $1 LIMIT 1`,
        [visitorId]
      );

      if (anyLinks.length === 0) {
        // First registration this semester — refresh code and visitor details
        verificationCode = await generateUniqueCode(client);
        await client.query(
          `UPDATE approved_visitors
           SET name=$1, photo_url=$2, verification_code=$3
           WHERE id=$4`,
          [name.trim(), photoUrl?.trim() || null, verificationCode, visitorId]
        );
        await client.query(`DELETE FROM visitor_phone_numbers WHERE visitor_id=$1`, [visitorId]);
        for (const phone of cleanPhones) {
          await client.query(
            `INSERT INTO visitor_phone_numbers (visitor_id, phone) VALUES ($1,$2)`,
            [visitorId, phone]
          );
        }
      }
      // else: another student already registered this visitor this semester.
      // The code stays the same — visitor already has the correct code in their email.
    } else {
      // Brand new visitor — generate code and create record
      verificationCode = await generateUniqueCode(client);
      isNewVisitor     = true;

      const { rows: [av] } = await client.query(
        `INSERT INTO approved_visitors
           (institution_id, name, email, photo_url, verification_code)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id`,
        [institutionId, name.trim(), cleanEmail, photoUrl?.trim() || null, verificationCode]
      );
      visitorId = av.id;

      // R3: Insert all phone numbers
      for (const phone of cleanPhones) {
        await client.query(
          `INSERT INTO visitor_phone_numbers (visitor_id, phone) VALUES ($1,$2)`,
          [visitorId, phone]
        );
      }
    }

    // Create the visitor–student link
    const { rows: [link] } = await client.query(
      `INSERT INTO visitor_student_link (visitor_id, student_id, institution_id)
       VALUES ($1,$2,$3)
       RETURNING id, created_at`,
      [visitorId, userId, institutionId]
    );

    await client.query('COMMIT');

    // ── Email notification ────────────────────────────────────────────────────
    sendVisitorRegistrationEmail({
      visitorEmail:     cleanEmail,
      visitorName:      name.trim(),
      studentName,
      institutionName:  inst.institution_name,
      verificationCode,
    }).catch(err => console.error('📧  Registration email failed:', err.message));

    // Return the full visitor record
    const { rows: [result] } = await pool.query(
      `SELECT
         vsl.id              AS link_id,
         vsl.is_active,
         vsl.created_at      AS registered_at,
         av.id               AS visitor_id,
         av.name,
         av.email,
         av.photo_url,
         av.verification_code,
         av.code_active,
         COALESCE(
           ARRAY_AGG(vpn.phone ORDER BY vpn.id) FILTER (WHERE vpn.phone IS NOT NULL),
           '{}'::TEXT[]
         ) AS phones
       FROM visitor_student_link vsl
       JOIN approved_visitors    av  ON av.id = vsl.visitor_id
       LEFT JOIN visitor_phone_numbers vpn ON vpn.visitor_id = av.id
       WHERE vsl.id = $1
       GROUP BY vsl.id, av.id`,
      [link.id]
    );

    res.status(201).json({
      ok:          true,
      isNewVisitor,
      visitor:     result,
      message:     isNewVisitor
        ? `${name.trim()} has been registered. Their verification code has been emailed to them.`
        : `${name.trim()} was already registered. Their existing code has been linked to your account.`,
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST visitors error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/student/visitors/:linkId
// Deactivates this student's link to a visitor.
//
// Rules enforced:
//   R7 — cannot deactivate if the visitor currently has an open visit
//          (status = 'checked_in' or 'at_hall') linked to this student
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/visitors/:linkId', async (req, res) => {
  const { userId } = req.session;
  const { linkId } = req.params;

  try {
    // Confirm this link belongs to this student and is currently active
    const { rows: [link] } = await pool.query(
      `SELECT vsl.id, vsl.visitor_id, vsl.is_active
       FROM visitor_student_link vsl
       WHERE vsl.id = $1 AND vsl.student_id = $2`,
      [linkId, userId]
    );
    if (!link) {
      return res.status(404).json({ error: 'Visitor link not found.' });
    }
    if (!link.is_active) {
      return res.status(409).json({ error: 'This visitor is already deactivated.' });
    }

    // R7: Block deactivation if visitor has an open visit linked to this student
    const { rows: openVisits } = await pool.query(
      `SELECT av2.id FROM actual_visits av2
       JOIN visit_hosts vh ON vh.visit_id = av2.id
       WHERE av2.visitor_id = $1
         AND vh.student_id  = $2
         AND av2.status    IN ('checked_in','at_hall')
         AND av2.is_archived = FALSE`,
      [link.visitor_id, userId]
    );
    if (openVisits.length) {
      return res.status(409).json({
        error: 'This visitor is currently inside the premises. You cannot deactivate their code during an active visit.',
      });
    }

    await pool.query(
      `UPDATE visitor_student_link SET is_active = FALSE WHERE id = $1`,
      [linkId]
    );

    res.json({ ok: true, message: 'Visitor deactivated. You can reactivate them at any time.' });
  } catch (err) {
    console.error('DELETE visitors error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/student/visitors/:linkId/reactivate
// Reactivates a previously deactivated visitor link.
// Blocked if admin has globally deactivated the visitor's code.
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/visitors/:linkId/reactivate', async (req, res) => {
  const { userId } = req.session;
  const { linkId } = req.params;

  try {
    const { rows: [link] } = await pool.query(
      `SELECT vsl.id, vsl.is_active, av.code_active, av.name
       FROM visitor_student_link vsl
       JOIN approved_visitors av ON av.id = vsl.visitor_id
       WHERE vsl.id = $1 AND vsl.student_id = $2`,
      [linkId, userId]
    );
    if (!link) {
      return res.status(404).json({ error: 'Visitor link not found.' });
    }
    if (link.is_active) {
      return res.status(409).json({ error: 'This visitor is already active.' });
    }
    if (!link.code_active) {
      return res.status(403).json({
        error: `${link.name}'s verification code has been deactivated by your institution's admin. Contact them to reactivate.`,
      });
    }

    await pool.query(
      `UPDATE visitor_student_link SET is_active = TRUE WHERE id = $1`,
      [linkId]
    );

    res.json({ ok: true, message: 'Visitor reactivated successfully.' });
  } catch (err) {
    console.error('PATCH reactivate error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
