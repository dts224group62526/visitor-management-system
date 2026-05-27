-- ============================================================
-- Visitor Management System — full schema (Rules 1–35)
-- ============================================================

-- ── 1. Institutions (multi-tenant root) ──────────────────────
CREATE TABLE IF NOT EXISTS institutions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT        NOT NULL,
  abbreviation        TEXT        NOT NULL,
  type                TEXT        NOT NULL,
  city                TEXT        NOT NULL,
  state               TEXT        NOT NULL,
  contact_email       TEXT        NOT NULL,
  phone               TEXT,
  matric_format       TEXT        NOT NULL DEFAULT 'custom',
  portal_open         BOOLEAN     NOT NULL DEFAULT TRUE,   -- R1: admin opens/closes
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name),
  UNIQUE (abbreviation)
);

-- ── 2. Halls of Residence ────────────────────────────────────
--   R8/R9: halls must be registered and active before use
CREATE TABLE IF NOT EXISTS halls_of_residence (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID        NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_id, name)
);

-- ── 3. Barricades ────────────────────────────────────────────
--   R10: exactly ONE barricade per institution (UNIQUE enforces it)
CREATE TABLE IF NOT EXISTS barricades (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID        NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  label           TEXT        NOT NULL DEFAULT 'Main Gate',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_id)   -- R10: one barricade per institution
);

-- ── 4. Users (all roles share this table) ────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID        NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL CHECK (role IN ('student','security','hall_officer','admin')),
  identifier      TEXT        NOT NULL,   -- matric_no for students, staff_id for others
  password_hash   TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  email           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_id, role, identifier)
);

-- ── 5. Students ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  user_id         UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hall_id         UUID        NOT NULL REFERENCES halls_of_residence(id),
  room            TEXT        NOT NULL,
  level           TEXT,
  department      TEXT
);

-- ── 6. Security Personnel ────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_personnel (
  user_id         UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  shift_days      TEXT[]      NOT NULL DEFAULT '{}',   -- e.g. ARRAY['SAT','SUN']
  shift_start     TIME        NOT NULL,
  shift_end       TIME        NOT NULL
);

-- ── 7. Hall Officers ─────────────────────────────────────────
--   R17: exactly ONE hall officer per hall (UNIQUE enforces it)
CREATE TABLE IF NOT EXISTS hall_officers (
  user_id         UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  hall_id         UUID        NOT NULL REFERENCES halls_of_residence(id),
  UNIQUE (hall_id)    -- R17: one officer per hall
);

-- ── 8. Approved Visitors ─────────────────────────────────────
--   R4: deduped by (email + institution_id) — same visitor same code for all students
--   R5: 10-char alphanumeric verification code, server-generated
--   R6: code can be active or inactive (deactivated by student or admin)
CREATE TABLE IF NOT EXISTS approved_visitors (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id      UUID        NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name                TEXT        NOT NULL,
  email               TEXT        NOT NULL,
  photo_url           TEXT,
  verification_code   TEXT        NOT NULL,
  code_active         BOOLEAN     NOT NULL DEFAULT TRUE,   -- R6
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_id, email),          -- R4: dedup by email + institution
  UNIQUE (verification_code)               -- R5: codes are globally unique
);

-- ── 9. Visitor Phone Numbers ─────────────────────────────────
--   R3: at least one phone number required; visitor can have many
CREATE TABLE IF NOT EXISTS visitor_phone_numbers (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id  UUID    NOT NULL REFERENCES approved_visitors(id) ON DELETE CASCADE,
  phone       TEXT    NOT NULL
);

-- ── 10. Visitor–Student Link ─────────────────────────────────
--   R2: many students can register the same visitor (e.g. siblings)
--   is_active: student can deactivate their own link (R6)
CREATE TABLE IF NOT EXISTS visitor_student_link (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id    UUID        NOT NULL REFERENCES approved_visitors(id) ON DELETE CASCADE,
  student_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id UUID       NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (visitor_id, student_id)   -- one link per visitor-student pair
);

-- ── 11. Actual Visits ────────────────────────────────────────
--   R33: check_in_barricade_time set automatically on check-in
--   R34: visits are NEVER deleted — use is_archived flag
--   status flow: checked_in → at_hall → completed
CREATE TABLE IF NOT EXISTS actual_visits (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id              UUID        NOT NULL REFERENCES approved_visitors(id),
  institution_id          UUID        NOT NULL REFERENCES institutions(id),
  security_officer_id     UUID        REFERENCES users(id),           -- who checked in at barricade
  check_in_barricade_time TIMESTAMPTZ,   -- R33: set on barricade check-in
  hall_checkout_time      TIMESTAMPTZ,   -- R20: set when hall officer records hall exit
  check_out_barricade_time TIMESTAMPTZ,  -- R15: set when security does final barricade checkout
  status                  TEXT        NOT NULL DEFAULT 'checked_in'
                            CHECK (status IN ('checked_in','at_hall','completed')),
  is_archived             BOOLEAN     NOT NULL DEFAULT FALSE,   -- R34: soft delete only
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 12. Visit Hosts ──────────────────────────────────────────
--   R27/R28: a visit can have multiple host students
--   R29: one host is marked as primary (the student who the visitor came to see)
CREATE TABLE IF NOT EXISTS visit_hosts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id    UUID        NOT NULL REFERENCES actual_visits(id) ON DELETE CASCADE,
  student_id  UUID        NOT NULL REFERENCES users(id),
  is_primary  BOOLEAN     NOT NULL DEFAULT FALSE,   -- R29
  UNIQUE (visit_id, student_id)
);

-- ── 13. Alerts ───────────────────────────────────────────────
--   One alert row per (visit, hall_officer) pair — multiple officers per hall are supported.
--   When any officer acknowledges, all other officers' pending alerts for the same visit
--   are auto-dismissed so they don't see stale notifications.
--   R22: status = pending | acknowledged
--   R23: alert goes to every hall officer assigned to the student's hall
CREATE TABLE IF NOT EXISTS alerts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id        UUID        NOT NULL REFERENCES actual_visits(id) ON DELETE CASCADE,
  hall_officer_id UUID        NOT NULL REFERENCES users(id),
  status          TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','acknowledged')),
  hall_checkout_done BOOLEAN  NOT NULL DEFAULT FALSE,   -- R20
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (visit_id, hall_officer_id)   -- one alert per officer per visit
);

-- ── 14. Session store (connect-pg-simple) ────────────────────
CREATE TABLE IF NOT EXISTS session (
  sid     VARCHAR      NOT NULL COLLATE "default",
  sess    JSON         NOT NULL,
  expire  TIMESTAMP(6) NOT NULL
);
ALTER TABLE session DROP CONSTRAINT IF EXISTS session_pkey;
ALTER TABLE session ADD CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);

-- ── Indexes for common lookups ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_institution       ON users (institution_id, role);
CREATE INDEX IF NOT EXISTS idx_visitors_code           ON approved_visitors (verification_code);
CREATE INDEX IF NOT EXISTS idx_visitors_institution    ON approved_visitors (institution_id);
CREATE INDEX IF NOT EXISTS idx_vsl_student             ON visitor_student_link (student_id);
CREATE INDEX IF NOT EXISTS idx_vsl_visitor             ON visitor_student_link (visitor_id);
CREATE INDEX IF NOT EXISTS idx_visits_visitor          ON actual_visits (visitor_id);
CREATE INDEX IF NOT EXISTS idx_visits_status           ON actual_visits (status) WHERE NOT is_archived;
CREATE INDEX IF NOT EXISTS idx_alerts_officer          ON alerts (hall_officer_id);
