const express   = require('express');
const bcrypt    = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const pool      = require('../db');

// WAT = Africa/Lagos = UTC+1
function watDay() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
  return ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()];
}

const loginLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,   // 15 minutes
  max:             10,                // 10 attempts per IP per window
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

const router = express.Router();

// ── POST /api/auth/login ──────────────────────────────────────────────────────
// Students:      { institutionId, role: 'student',      identifier: matric, password }
// Security:      { institutionId, role: 'security',     identifier: staffId, password }
// Hall Officer:  { institutionId, role: 'hall_officer', identifier: staffId, password }
// Admin:         { institutionId, role: 'admin',        password }  ← no identifier
router.post('/login', loginLimiter, async (req, res) => {
  const { institutionId, role, identifier, password } = req.body;

  if (!institutionId || !role || !password) {
    return res.status(400).json({ error: 'institutionId, role, and password are required.' });
  }
  if (!['student', 'security', 'hall_officer', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }

  try {
    // ── Admin: no identifier — just institution + password ────────────────────
    if (role === 'admin') {
      const { rows } = await pool.query(
        `SELECT u.id, u.password_hash, i.name AS institution_name
         FROM users u
         JOIN institutions i ON i.id = u.institution_id
         WHERE u.institution_id = $1 AND u.role = 'admin'
         LIMIT 1`,
        [institutionId]
      );
      if (!rows.length) {
        return res.status(404).json({ error: 'No admin account found for this institution.' });
      }
      const admin = rows[0];
      const match = await bcrypt.compare(password, admin.password_hash);
      if (!match) return res.status(401).json({ error: 'Incorrect admin password.' });

      req.session.userId        = admin.id;
      req.session.institutionId = institutionId;
      req.session.role          = 'admin';
      req.session.name          = 'Administrator';
      return res.json({ ok: true, role: 'admin', name: 'Administrator', institutionId, institutionName: admin.institution_name });
    }

    // ── All other roles require an identifier ─────────────────────────────────
    if (!identifier) {
      return res.status(400).json({ error: 'identifier is required.' });
    }

    // Build the query depending on role — join the role-specific table
    let query, params;

    if (role === 'student') {
      query = `
        SELECT u.id, u.name, u.password_hash, u.role,
               h.name AS hall_name, s.room, s.level, s.department,
               h.id   AS hall_id
        FROM users u
        JOIN students            s ON s.user_id = u.id
        JOIN halls_of_residence  h ON h.id      = s.hall_id
        WHERE u.institution_id = $1
          AND u.role           = 'student'
          AND u.identifier     = $2`;
      params = [institutionId, identifier];

    } else if (role === 'security') {
      query = `
        SELECT u.id, u.name, u.password_hash, u.role,
               sp.shift_days, sp.shift_start, sp.shift_end
        FROM users u
        JOIN security_personnel sp ON sp.user_id = u.id
        WHERE u.institution_id = $1
          AND u.role           = 'security'
          AND u.identifier     = $2`;
      params = [institutionId, identifier];

    } else if (role === 'hall_officer') {
      query = `
        SELECT u.id, u.name, u.password_hash, u.role,
               h.name AS hall_name, h.id AS hall_id
        FROM users u
        JOIN hall_officers       ho ON ho.user_id = u.id
        JOIN halls_of_residence  h  ON h.id       = ho.hall_id
        WHERE u.institution_id = $1
          AND u.role           = 'hall_officer'
          AND u.identifier     = $2`;
      params = [institutionId, identifier];
    }

    const { rows } = await pool.query(query, params);
    if (!rows.length) {
      return res.status(401).json({ error: 'Identifier not found in institution database.' });
    }
    const user = rows[0];

    // ── Password check ────────────────────────────────────────────────────────
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Incorrect password.' });

    // ── Hall Officer: visiting days only (Sat/Sun WAT) ───────────────────────
    if (role === 'hall_officer' && !process.env.BYPASS_VISITING_HOURS) {
      const today = watDay();
      if (!['SAT', 'SUN'].includes(today)) {
        return res.status(403).json({
          error: `Hall officer portal is only available on visiting days (Saturdays & Sundays). Today is ${today}.`,
        });
      }
    }

    // ── Security: server-side shift-lock check (R11) using WAT ───────────────
    if (role === 'security') {
      const todayAbbr  = watDay();
      const shiftDays  = user.shift_days ?? [];

      if (!shiftDays.includes(todayAbbr)) {
        return res.status(403).json({
          error: `You are not scheduled today (${todayAbbr}). Your shift days: ${shiftDays.join(', ') || 'none'}.`,
        });
      }

      // WAT time for shift window check
      const watNow     = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
      const pad        = n => String(n).padStart(2, '0');
      const nowTime    = `${pad(watNow.getHours())}:${pad(watNow.getMinutes())}`;
      const shiftStart = user.shift_start?.slice(0, 5);
      const shiftEnd   = user.shift_end?.slice(0, 5);

      if (nowTime < shiftStart || nowTime > shiftEnd) {
        return res.status(403).json({
          error: `Outside your shift window (${shiftStart}–${shiftEnd}). Current WAT: ${nowTime}.`,
        });
      }
    }

    // ── Build session ─────────────────────────────────────────────────────────
    req.session.userId        = user.id;
    req.session.institutionId = institutionId;
    req.session.role          = user.role;
    req.session.name          = user.name;
    req.session.identifier    = identifier;

    if (role === 'student') {
      req.session.hallId   = user.hall_id;
      req.session.hallName = user.hall_name;
      req.session.room     = user.room;
    }
    if (role === 'hall_officer') {
      req.session.hallId   = user.hall_id;
      req.session.hallName = user.hall_name;
    }

    return res.json({
      ok:            true,
      role:          user.role,
      name:          user.name,
      institutionId,
      hallName:      req.session.hallName ?? null,
      room:          req.session.room     ?? null,
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Could not log out.' });
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

// ── PUT /api/auth/password ────────────────────────────────────────────────────
// Changes the password for the currently authenticated user.
router.put('/password', async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated.' });
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'currentPassword and newPassword are required.' });
  if (newPassword.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  if (currentPassword === newPassword)
    return res.status(400).json({ error: 'New password must be different from the current one.' });

  try {
    const { rows: [user] } = await pool.query(
      `SELECT id, password_hash FROM users WHERE id=$1`, [req.session.userId]
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const match = await bcrypt.compare(currentPassword, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [newHash, user.id]);

    res.json({ ok: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated.' });
  res.json({
    userId:        req.session.userId,
    institutionId: req.session.institutionId,
    role:          req.session.role,
    name:          req.session.name,
    identifier:    req.session.identifier,
    hallName:      req.session.hallName ?? null,
    room:          req.session.room     ?? null,
  });
});

module.exports = router;
