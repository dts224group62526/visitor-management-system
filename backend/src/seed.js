/**
 * Seed script — inserts Covenant University demo data.
 * Run:  npm run seed
 *
 * Matches the mock data used in the frontend (App.tsx MOCK_DB).
 * All passwords are bcrypt-hashed.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool   = require('./db');

const HASH_ROUNDS = 10;
const h = pwd => bcrypt.hashSync(pwd, HASH_ROUNDS);

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. Institution ────────────────────────────────────────
    const { rows: [cu] } = await client.query(`
      INSERT INTO institutions (name, abbreviation, type, city, state, contact_email, matric_format, portal_open)
      VALUES ('Covenant University', 'CU', 'Private University', 'Ota', 'Ogun State',
              'admin@cu.edu.ng', 'cu', TRUE)
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    const instId = cu?.id ?? (await client.query(`SELECT id FROM institutions WHERE abbreviation='CU'`)).rows[0].id;
    console.log(`Institution: ${instId}`);

    // ── 2. Barricade ──────────────────────────────────────────
    await client.query(`
      INSERT INTO barricades (institution_id, label) VALUES ($1, 'Main Gate')
      ON CONFLICT (institution_id) DO NOTHING`, [instId]);

    // ── 3. Halls of Residence ─────────────────────────────────
    const hallNames = ['Paul Hall', 'Peter Hall', 'Daniel Hall', 'Joseph Hall'];
    const hallIds   = {};
    for (const name of hallNames) {
      const { rows: [hall] } = await client.query(`
        INSERT INTO halls_of_residence (institution_id, name) VALUES ($1, $2)
        ON CONFLICT (institution_id, name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id`, [instId, name]);
      hallIds[name] = hall.id;
    }
    console.log('Halls:', Object.keys(hallIds).join(', '));

    // ── 4. Admin user ─────────────────────────────────────────
    await client.query(`
      INSERT INTO users (institution_id, role, identifier, password_hash, name, email)
      VALUES ($1, 'admin', 'admin', $2, 'CU Administrator', 'admin@cu.edu.ng')
      ON CONFLICT (institution_id, role, identifier) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [instId, h('CUADMIN2026')]);

    // ── 5. Students ───────────────────────────────────────────
    const students = [
      { matric: '24CG036190', pwd: 'welcome24', name: 'Emmanuel Adewale', hall: 'Paul Hall',   room: 'C204', level: '400', dept: 'Computer Science' },
      { matric: '23CS021456', pwd: 'student23', name: 'Blessing Okeke',   hall: 'Peter Hall',  room: 'A108', level: '300', dept: 'Computer Science' },
      { matric: '22EE018003', pwd: 'pass2022',  name: 'Tunde Adesanya',   hall: 'Daniel Hall', room: 'B310', level: '200', dept: 'Electrical Engineering' },
    ];
    for (const s of students) {
      const { rows: [u] } = await client.query(`
        INSERT INTO users (institution_id, role, identifier, password_hash, name)
        VALUES ($1, 'student', $2, $3, $4)
        ON CONFLICT (institution_id, role, identifier) DO UPDATE SET password_hash = EXCLUDED.password_hash
        RETURNING id`, [instId, s.matric, h(s.pwd), s.name]);
      await client.query(`
        INSERT INTO students (user_id, hall_id, room, level, department)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id) DO UPDATE SET room = EXCLUDED.room`,
        [u.id, hallIds[s.hall], s.room, s.level, s.dept]);
    }
    console.log(`${students.length} students seeded.`);

    // ── 6. Security personnel ─────────────────────────────────
    const { rows: [sec] } = await client.query(`
      INSERT INTO users (institution_id, role, identifier, password_hash, name, email)
      VALUES ($1, 'security', 'SEC-0042', $2, 'Sgt. Bello Musa', 'bello@cu.edu.ng')
      ON CONFLICT (institution_id, role, identifier) DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id`, [instId, h('SHIFT2026')]);
    await client.query(`
      INSERT INTO security_personnel (user_id, shift_days, shift_start, shift_end)
      VALUES ($1, ARRAY['SAT','SUN'], '08:00', '17:00')
      ON CONFLICT (user_id) DO NOTHING`, [sec.id]);
    console.log('Security personnel seeded.');

    // ── 7. Hall Officers ──────────────────────────────────────
    const officers = [
      { staffId: 'HOF-0021', pwd: 'officer21', name: 'Mrs. Amaka Okafor', hall: 'Paul Hall' },
      { staffId: 'HOF-0022', pwd: 'officer22', name: 'Mr. Kunle Adebayo', hall: 'Peter Hall' },
    ];
    for (const o of officers) {
      const { rows: [u] } = await client.query(`
        INSERT INTO users (institution_id, role, identifier, password_hash, name)
        VALUES ($1, 'hall_officer', $2, $3, $4)
        ON CONFLICT (institution_id, role, identifier) DO UPDATE SET password_hash = EXCLUDED.password_hash
        RETURNING id`, [instId, o.staffId, h(o.pwd), o.name]);
      await client.query(`
        INSERT INTO hall_officers (user_id, hall_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO NOTHING`, [u.id, hallIds[o.hall]]);
    }
    console.log(`${officers.length} hall officers seeded.`);

    await client.query('COMMIT');
    console.log('\n✅  Seed complete!');
    console.log('\n── Demo credentials ─────────────────────────────────');
    console.log('  Admin:        password = CUADMIN2026');
    console.log('  Student:      24CG036190 / welcome24');
    console.log('  Security:     SEC-0042   / SHIFT2026  (SAT & SUN, 08:00–17:00)');
    console.log('  Hall Officer: HOF-0021   / officer21  (Paul Hall)');
    console.log('────────────────────────────────────────────────────');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌  Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
