# Visitor Management — Backend

Express + PostgreSQL API for the university visitor management system.

## Stack
- **Runtime**: Node.js 18+
- **Framework**: Express
- **Database**: PostgreSQL (sessions also stored in Postgres via connect-pg-simple)
- **Auth**: Cookie-based sessions (express-session)
- **Hosting**: Railway

---

## Local setup

### 1. Install dependencies
```bash
cd backend
npm install
```

### 2. Create a local Postgres database
```bash
createdb visitor_management
```

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env — set DATABASE_URL and SESSION_SECRET
```

### 4. Run the database migration
```bash
npm run migrate
```

### 5. Start the dev server
```bash
npm run dev   # uses nodemon — auto-restarts on file changes
```

The API will be available at `http://localhost:4000`.

---

## API reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | — | Log in (any role) |
| POST | `/api/auth/logout` | any | Log out |
| GET  | `/api/auth/me` | any | Current session info |
| POST | `/api/admin/institutions` | — | Register a new institution |
| GET  | `/api/admin/stats` | admin | Dashboard stats |
| PUT  | `/api/admin/portal-status` | admin | Open/close registration portal |
| POST | `/api/admin/semester-reset` | admin | Clear all visitor data |
| POST | `/api/admin/upload/students` | admin | Upload student CSV |
| POST | `/api/admin/upload/security` | admin | Upload security CSV |
| POST | `/api/admin/upload/hall-officers` | admin | Upload hall officers CSV |
| GET  | `/api/student/visitors` | student | List registered visitors |
| POST | `/api/student/visitors` | student | Register a visitor |
| DELETE | `/api/student/visitors/:id` | student | Deactivate a visitor |
| GET  | `/api/security/verify/:code` | security | Look up visitor by code |
| POST | `/api/security/visits` | security | Check in a visitor |
| PUT  | `/api/security/visits/:id/checkout` | security | Check out a visitor |
| GET  | `/api/security/stats` | security | Today's check-in stats |
| GET  | `/api/hall-officer/alerts` | hall_officer | List arrival alerts |
| PUT  | `/api/hall-officer/alerts/:id/acknowledge` | hall_officer | Acknowledge an alert |

### Login request body
```json
// Students
{ "institutionId": "uuid", "role": "student", "identifier": "24CG036190", "password": "..." }

// Security / Hall Officer
{ "institutionId": "uuid", "role": "security", "identifier": "SEC-0042", "password": "..." }

// Admin (no identifier)
{ "institutionId": "uuid", "role": "admin", "password": "CUADMIN2026" }
```

### Default passwords (CSV uploads)
- Students: their matric number
- Security / Hall Officers: their staff ID

---

## CSV formats

### Students
```
matric_number,first_name,last_name,email,hall,room,level,department
24CG036190,Emmanuel,Adewale,emma@cu.edu.ng,Paul Hall,C204,400,Computer Science
```

### Security Personnel
```
staff_id,first_name,last_name,email,shift_days,shift_start,shift_end
SEC-0042,Bello,Musa,bello@cu.edu.ng,SAT|SUN,08:00,17:00
```

### Hall Officers
```
staff_id,first_name,last_name,email,hall_assigned
HOF-0021,Amaka,Okafor,amaka@cu.edu.ng,Paul Hall
```

---

## Deploy to Railway

1. Push the `backend/` folder to a GitHub repo (or the whole monorepo).
2. Create a new Railway project → **Deploy from GitHub**.
3. Add a **PostgreSQL** plugin — Railway auto-injects `DATABASE_URL`.
4. Add environment variables in Railway dashboard:
   - `SESSION_SECRET` — long random string
   - `FRONTEND_URL` — your deployed frontend URL
   - `NODE_ENV=production`
5. Railway will run `node src/index.js` (from `railway.json`).
6. Run the migration once: `railway run npm run migrate`.
