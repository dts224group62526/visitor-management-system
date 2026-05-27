const express = require('express');
const bcrypt  = require('bcryptjs');
const multer  = require('multer');
const csv     = require('csv-parser');
const stream  = require('stream');
const pool    = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC — no auth required
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/admin/institutions
// Called from the Register Institution wizard (login page, no session needed).
// Creates: institution row + admin user + barricade.
router.post('/institutions', async (req, res) => {
  const {
    name, abbreviation, type, city, state,
    contactEmail, phone, matricFormat,
    adminPassword,
  } = req.body;

  if (!name || !abbreviation || !type || !city || !state || !contactEmail || !adminPassword) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  if (adminPassword.length < 8) {
    return res.status(400).json({ error: 'Admin password must be at least 8 characters.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create institution
    const { rows: [inst] } = await client.query(
      `INSERT INTO institutions
         (name, abbreviation, type, city, state, contact_email, phone, matric_format)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, name, abbreviation`,
      [name, abbreviation, type, city, state, contactEmail, phone ?? null, matricFormat ?? 'custom']
    );

    // 2. Create admin user (password stored in users table, NOT institutions)
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await client.query(
      `INSERT INTO users (institution_id, role, identifier, password_hash, name, email)
       VALUES ($1, 'admin', 'admin', $2, $3, $4)`,
      [inst.id, passwordHash, `${abbreviation} Administrator`, contactEmail]
    );

    // 3. Create the institution's barricade (R10: exactly one per institution)
    await client.query(
      `INSERT INTO barricades (institution_id, label) VALUES ($1, 'Main Gate')`,
      [inst.id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      ok: true,
      institution: {
        id:           inst.id,
        name:         inst.name,
        abbreviation: inst.abbreviation,
      },
      message: `${name} has been registered. You can now sign in with your admin password.`,
    });

  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An institution with that name or abbreviation already exists.' });
    }
    console.error('Register institution error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

// GET /api/admin/institutions  — list all institutions (for the login dropdown)
router.get('/institutions', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, abbreviation, city, state, matric_format FROM institutions ORDER BY name`
    );
    res.json({ institutions: rows });
  } catch (err) {
    console.error('List institutions error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// All routes below require an admin session
// ─────────────────────────────────────────────────────────────────────────────
router.use(requireAuth('admin'));

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  const { institutionId } = req.session;
  try {
    const [students, activeVisitors, visitsToday, portalStatus] = await Promise.all([

      // Total students
      pool.query(
        `SELECT COUNT(*) FROM users WHERE institution_id=$1 AND role='student'`,
        [institutionId]
      ),

      // Active visitor-student links (code_active = true AND link is_active = true)
      pool.query(
        `SELECT COUNT(DISTINCT av.id)
         FROM approved_visitors av
         JOIN visitor_student_link vsl ON vsl.visitor_id = av.id
         WHERE av.institution_id = $1
           AND av.code_active   = TRUE
           AND vsl.is_active    = TRUE`,
        [institutionId]
      ),

      // Visits today
      pool.query(
        `SELECT COUNT(*) FROM actual_visits
         WHERE institution_id = $1
           AND is_archived     = FALSE
           AND DATE(check_in_barricade_time AT TIME ZONE 'Africa/Lagos') = CURRENT_DATE`,
        [institutionId]
      ),

      pool.query(`SELECT portal_open FROM institutions WHERE id=$1`, [institutionId]),
    ]);

    res.json({
      registeredStudents: parseInt(students.rows[0].count),
      activeVisitors:     parseInt(activeVisitors.rows[0].count),
      visitsToday:        parseInt(visitsToday.rows[0].count),
      portalOpen:         portalStatus.rows[0]?.portal_open ?? true,
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── PUT /api/admin/portal-status — open or close registration portal ──────────
router.put('/portal-status', async (req, res) => {
  const { open } = req.body;
  if (typeof open !== 'boolean') {
    return res.status(400).json({ error: '"open" must be a boolean.' });
  }
  try {
    await pool.query(
      `UPDATE institutions SET portal_open=$1 WHERE id=$2`,
      [open, req.session.institutionId]
    );
    res.json({ ok: true, portalOpen: open });
  } catch (err) {
    console.error('Portal toggle error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /api/admin/semester-reset ────────────────────────────────────────────
// Prepares the system for a fresh semester:
//   1. Archives ALL visits for the institution (R34 — never hard-delete).
//   2. Deletes ALL visitor–student links so students re-register next semester.
//
// approved_visitors rows are KEPT (actual_visits.visitor_id references them and
// R34 prohibits destroying the audit chain).  Students simply re-register the
// same visitors next semester; R4 dedup will reuse the existing approved_visitor
// record and its code.
router.post('/semester-reset', async (req, res) => {
  const { institutionId } = req.session;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Archive every visit for this institution (R34: no hard-deletes)
    const { rowCount: archivedVisits } = await client.query(
      `UPDATE actual_visits SET is_archived=TRUE
       WHERE institution_id=$1 AND is_archived=FALSE`,
      [institutionId]
    );

    // 2. Delete all visitor–student links — students re-link next semester
    const { rowCount: deletedLinks } = await client.query(
      `DELETE FROM visitor_student_link WHERE institution_id=$1`,
      [institutionId]
    );

    await client.query('COMMIT');
    res.json({
      ok:             true,
      archivedVisits,
      deletedLinks,
      message:        'Semester reset complete. All visits archived and visitor links cleared. Students can re-register their visitors for the new semester.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Semester reset error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

// ── Admin: deactivate or reactivate a visitor by code ────────────────────────
// PATCH /api/admin/visitors/:code/status
router.patch('/visitors/:code/status', async (req, res) => {
  const { code }   = req.params;
  const { active } = req.body;   // boolean
  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: '"active" must be a boolean.' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE approved_visitors
       SET code_active = $1
       WHERE verification_code = $2 AND institution_id = $3
       RETURNING id, name, verification_code, code_active`,
      [active, code.toUpperCase(), req.session.institutionId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Visitor not found with that code.' });
    }
    res.json({ ok: true, visitor: rows[0] });
  } catch (err) {
    console.error('Visitor status toggle error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/admin/visitors/:code — look up visitor by code ──────────────────
router.get('/visitors/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT av.id, av.name, av.email, av.photo_url, av.verification_code,
              av.code_active, av.created_at,
              ARRAY_AGG(DISTINCT vpn.phone) FILTER (WHERE vpn.phone IS NOT NULL) AS phones,
              ARRAY_AGG(DISTINCT u.name)    FILTER (WHERE u.name   IS NOT NULL) AS registered_by
       FROM approved_visitors av
       LEFT JOIN visitor_phone_numbers vpn ON vpn.visitor_id = av.id
       LEFT JOIN visitor_student_link  vsl ON vsl.visitor_id = av.id
       LEFT JOIN users u ON u.id = vsl.student_id
       WHERE av.verification_code = $1 AND av.institution_id = $2
       GROUP BY av.id`,
      [code.toUpperCase(), req.session.institutionId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'No visitor found with that code.' });
    }
    res.json({ visitor: rows[0] });
  } catch (err) {
    console.error('Visitor lookup error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CSV Upload helpers
// ─────────────────────────────────────────────────────────────────────────────
function parseCSVBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const results  = [];
    const readable = stream.Readable.from(buffer.toString());
    readable
      .pipe(csv({ mapHeaders: ({ header }) => header.trim().toLowerCase().replace(/\s+/g, '_') }))
      .on('data',  row => results.push(row))
      .on('end',   ()  => resolve(results))
      .on('error', err => reject(err));
  });
}

// Resolve or create a hall by name for this institution
async function resolveHall(client, institutionId, hallName) {
  const { rows } = await client.query(
    `INSERT INTO halls_of_residence (institution_id, name)
     VALUES ($1, $2)
     ON CONFLICT (institution_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [institutionId, hallName]
  );
  return rows[0].id;
}

// ── POST /api/admin/upload/students ──────────────────────────────────────────
// CSV columns: matric_number, first_name, last_name, email, hall, room, level, department
router.post('/upload/students', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  let rows;
  try { rows = await parseCSVBuffer(req.file.buffer); }
  catch { return res.status(400).json({ error: 'Could not parse CSV.' }); }

  const { institutionId } = req.session;
  const client = await pool.connect();
  let inserted = 0, updated = 0;
  const errors = [];

  try {
    await client.query('BEGIN');

    for (const row of rows) {
      const matric = (row.matric_number || '').trim().toUpperCase();
      const first  = (row.first_name    || '').trim();
      const last   = (row.last_name     || '').trim();
      const email  = (row.email         || '').trim().toLowerCase() || null;
      const hall   = (row.hall          || '').trim();
      const room   = (row.room          || '').trim();
      const level  = (row.level         || '').trim() || null;
      const dept   = (row.department    || '').trim() || null;

      if (!matric || !first || !last || !hall || !room) {
        errors.push(`Skipped (missing fields): ${JSON.stringify(row)}`);
        continue;
      }

      // Resolve hall → hall_id (creates hall if not exists)
      let hallId;
      try { hallId = await resolveHall(client, institutionId, hall); }
      catch (e) { errors.push(`Bad hall "${hall}": ${e.message}`); continue; }

      const passwordHash = await bcrypt.hash(matric, 10);  // default pwd = matric number
      const name         = `${first} ${last}`;

      const { rows: [u] } = await client.query(
        `INSERT INTO users (institution_id, role, identifier, password_hash, name, email)
         VALUES ($1,'student',$2,$3,$4,$5)
         ON CONFLICT (institution_id, role, identifier)
         DO UPDATE SET name=$4, email=$5
         RETURNING id, (xmax = 0) AS inserted`,
        [institutionId, matric, passwordHash, name, email]
      );

      await client.query(
        `INSERT INTO students (user_id, hall_id, room, level, department)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (user_id)
         DO UPDATE SET hall_id=$2, room=$3, level=$4, department=$5`,
        [u.id, hallId, room, level, dept]
      );

      u.inserted ? inserted++ : updated++;
    }

    await client.query('COMMIT');
    res.json({ ok: true, inserted, updated, skipped: errors.length, errors: errors.slice(0, 20) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Student upload error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

// ── POST /api/admin/upload/security ──────────────────────────────────────────
// CSV columns: staff_id, first_name, last_name, email, shift_days, shift_start, shift_end
// shift_days format: SAT|SUN  or  SAT,SUN
router.post('/upload/security', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  let rows;
  try { rows = await parseCSVBuffer(req.file.buffer); }
  catch { return res.status(400).json({ error: 'Could not parse CSV.' }); }

  const { institutionId } = req.session;
  const client = await pool.connect();
  let inserted = 0, updated = 0;
  const errors = [];

  try {
    await client.query('BEGIN');

    for (const row of rows) {
      const staffId    = (row.staff_id    || '').trim().toUpperCase();
      const first      = (row.first_name  || '').trim();
      const last       = (row.last_name   || '').trim();
      const email      = (row.email       || '').trim().toLowerCase() || null;
      const rawDays    = (row.shift_days  || 'SAT|SUN').replace(/,/g, '|');
      const shiftDays  = rawDays.split('|').map(d => d.trim().toUpperCase()).filter(Boolean);
      const shiftStart = (row.shift_start || '08:00').trim();
      const shiftEnd   = (row.shift_end   || '17:00').trim();

      if (!staffId || !first || !last) {
        errors.push(`Skipped (missing fields): ${JSON.stringify(row)}`);
        continue;
      }

      const passwordHash = await bcrypt.hash(staffId, 10);  // default pwd = staff ID
      const name         = `${first} ${last}`;

      const { rows: [u] } = await client.query(
        `INSERT INTO users (institution_id, role, identifier, password_hash, name, email)
         VALUES ($1,'security',$2,$3,$4,$5)
         ON CONFLICT (institution_id, role, identifier)
         DO UPDATE SET name=$4, email=$5
         RETURNING id, (xmax = 0) AS inserted`,
        [institutionId, staffId, passwordHash, name, email]
      );

      await client.query(
        `INSERT INTO security_personnel (user_id, shift_days, shift_start, shift_end)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id)
         DO UPDATE SET shift_days=$2, shift_start=$3, shift_end=$4`,
        [u.id, shiftDays, shiftStart, shiftEnd]
      );

      u.inserted ? inserted++ : updated++;
    }

    await client.query('COMMIT');
    res.json({ ok: true, inserted, updated, skipped: errors.length, errors: errors.slice(0, 20) });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Security upload error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

// ── POST /api/admin/upload/hall-officers ─────────────────────────────────────
// CSV columns: staff_id, first_name, last_name, email, hall_assigned
router.post('/upload/hall-officers', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  let rows;
  try { rows = await parseCSVBuffer(req.file.buffer); }
  catch { return res.status(400).json({ error: 'Could not parse CSV.' }); }

  const { institutionId } = req.session;
  const client = await pool.connect();
  let inserted = 0, updated = 0;
  const errors = [];

  try {
    await client.query('BEGIN');

    for (const row of rows) {
      const staffId = (row.staff_id      || '').trim().toUpperCase();
      const first   = (row.first_name    || '').trim();
      const last    = (row.last_name     || '').trim();
      const email   = (row.email         || '').trim().toLowerCase() || null;
      const hall    = (row.hall_assigned || '').trim();

      if (!staffId || !first || !last || !hall) {
        errors.push(`Skipped (missing fields): ${JSON.stringify(row)}`);
        continue;
      }

      let hallId;
      try { hallId = await resolveHall(client, institutionId, hall); }
      catch (e) { errors.push(`Bad hall "${hall}": ${e.message}`); continue; }

      const passwordHash = await bcrypt.hash(staffId, 10);
      const name         = `${first} ${last}`;

      const { rows: [u] } = await client.query(
        `INSERT INTO users (institution_id, role, identifier, password_hash, name, email)
         VALUES ($1,'hall_officer',$2,$3,$4,$5)
         ON CONFLICT (institution_id, role, identifier)
         DO UPDATE SET name=$4, email=$5
         RETURNING id, (xmax = 0) AS inserted`,
        [institutionId, staffId, passwordHash, name, email]
      );

      // Multiple officers allowed per hall — conflict only on user_id (re-upload same staff)
      await client.query(
        `INSERT INTO hall_officers (user_id, hall_id)
         VALUES ($1,$2)
         ON CONFLICT (user_id) DO UPDATE SET hall_id=$2`,
        [u.id, hallId]
      );

      u.inserted ? inserted++ : updated++;
    }

    await client.query('COMMIT');
    res.json({ ok: true, inserted, updated, skipped: errors.length, errors: errors.slice(0, 20) });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505' && err.constraint === 'hall_officers_hall_id_key') {
      return res.status(409).json({
        error: 'One of the halls already has an assigned officer. Each hall can only have one hall officer.',
      });
    }
    console.error('Hall officer upload error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

// ── POST /api/admin/reset-password ───────────────────────────────────────────
// Resets a user's password to their default (matric number for students,
// staff ID for hall officers and security personnel).
router.post('/reset-password', async (req, res) => {
  const { institutionId } = req.session;
  const { role, identifier } = req.body;

  if (!role || !identifier)
    return res.status(400).json({ error: 'role and identifier are required.' });
  if (!['student', 'security', 'hall_officer'].includes(role))
    return res.status(400).json({ error: 'Invalid role. Must be student, security, or hall_officer.' });

  try {
    const id = identifier.trim().toUpperCase();
    const { rows: [user] } = await pool.query(
      `SELECT id FROM users WHERE institution_id=$1 AND role=$2 AND identifier=$3`,
      [institutionId, role, id]
    );
    if (!user) return res.status(404).json({ error: `No ${role.replace('_', ' ')} found with identifier "${id}".` });

    // Default password = identifier (matric number / staff ID)
    const newHash = await bcrypt.hash(id, 10);
    await pool.query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [newHash, user.id]);

    res.json({ ok: true, message: `Password reset to default (${id}).` });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
