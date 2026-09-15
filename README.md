<div align="center">
  <img src="https://assets.hackclub.com/flag-standalone.svg" width="100" alt="Hack Club flag" />
  <h2><a href="https://github.com/hackclub/beest">Beest</a></h2>
  <p>The NestJS + SvelteKit + PostgreSQL codebase powering Beest, a hackathon in the Netherlands</p>
</div>

---

# Beest

The Beest codebase is what runs on https://beest.hackclub.com. That website is the You Ship We Ship platform allowing participants to sign in, create and share projects, recieve feedback and earn prizes through the shop. 


## Architecture

This is a monorepo with two applications:

| Layer | Stack | Role |
|-------|-------|------|
| **`backend/`** | NestJS 11, TypeORM, PostgreSQL | Single source of truth - all auth, business logic, and data access |
| **`frontend/`** | SvelteKit 2, Svelte 5 | Thin proxy - renders UI, sets cookies, forwards requests to the backend |



## Development Setup

```bash
git clone https://github.com/hackclub/beest
cd beest

# Start the database
docker compose -f docker-compose.dev.yml up -d

# Backend
cd backend
npm install
cp .env.example .env   # fill in credentials
npm run migration:run
npm run start:dev       # runs on :3001

# Frontend (in a second terminal)
cd frontend
npm install
npm run dev             # runs on :5173
```

## Environment Variables

### Backend (`backend/.env`)

```bash
# Airtable
AIRTABLE_API_KEY=
AIRTABLE_BASE_ID=
AIRTABLE_TABLE_NAME=

# Hack Club Auth OAuth
CLIENT_ID=
CLIENT_SECRET=
REDIRECT_URI=http://localhost:5173/oauth/callback

# JWT & encryption
JWT_SECRET=
DB_ENCRYPTION_KEY=       # 32-byte hex string for AES-256-GCM

# Hackatime OAuth
HACKATIME_CLIENT_ID=
HACKATIME_CLIENT_SECRET=
HACKATIME_REDIRECT_URI=http://localhost:5173/auth/hackatime/callback
HACKATIME_BASE_URL=https://hackatime.hackclub.com

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/postgres

# Slack
SLACK_BOT_TOKEN=
```

### Frontend (`frontend/.env`)

```bash
BACKEND_URL=http://localhost:3001
```

## Deployment

### Docker Compose

```bash
docker compose up --build
```

### Dockerfile (standalone)

Both `backend/` and `frontend/` have their own multi-stage Dockerfiles (Node 22 Alpine). Point `DATABASE_URL` at your PostgreSQL instance and set all backend env vars.

| Service | Internal Port |
|---------|---------------|
| Frontend | 3000 |
| Backend | 3001 |
| PostgreSQL | 5432 |

## API

All endpoints live under the backend at `/api`. Auth-protected routes require a `Bearer` JWT in the `Authorization` header.

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/health` | GET | — | Health check |
| `/api/auth/start` | POST | — | Begin OAuth flow |
| `/api/auth/handle-callback` | POST | — | Complete OAuth, issue tokens |
| `/api/auth/refresh` | POST | — | Rotate refresh token |
| `/api/auth/me` | GET | JWT | Current user claims |
| `/api/auth/logout` | POST | — | Invalidate session |
| `/api/auth/rsvp` | POST | JWT | RSVP using authenticated session |
| `/api/auth/scope` | GET | JWT | Check user permissions |
| `/api/rsvp` | POST | — | Submit an RSVP |
| `/api/hackatime/start` | POST | JWT | Begin Hackatime OAuth |
| `/api/hackatime/callback` | POST | JWT | Complete Hackatime OAuth |
| `/api/hackatime/projects` | GET | JWT | User's Hackatime projects with eligible time |
| `/api/projects` | GET | JWT | List user's projects |
| `/api/projects` | POST | JWT | Create a project |
| `/api/projects/:id` | PATCH | JWT | Update a project |
| `/api/projects/:id` | DELETE | JWT | Delete a project |
| `/api/projects/hours` | GET | JWT | Hackatime hours breakdown |
| `/api/leaderboard` | GET | JWT | Top 10 users by approved hours |
| `/api/onboarding/status` | GET | JWT | Onboarding step completion |
| `/api/onboarding/two-emails` | POST | JWT | Confirm different Slack email |
| `/api/audit-log` | GET | JWT | User's audit log entries |
| `/api/admin/users` | GET | Admin | List all users |
| `/api/admin/users/:id` | GET | Admin | Get specific user |
| `/api/admin/users/:id/ban` | POST | Admin | Ban a user |
| `/api/admin/users/:id/perms` | PATCH | Admin | Update user permissions |

---

## Certificates

This repository includes a certificates feature used to generate, persist and verify participation/fulfilment certificates.

- Generation: certificates are created server-side when an order is fulfilled (idempotent per order).
- Storage: certificates are persisted in the database with a unique `certificate_number` (format `CERT-<YEAR>-<random-id>`), `recipient_name`, `approved_hours`, `award_item`, and `certificate_text`.
- PDF: certificates are rendered server-side from HTML to PDF (Puppeteer) in landscape A4.

Key files and routes:
- Backend service: `backend/src/certificates/certificate.service.ts` (generation, HTML/PDF renderer, `syncCertificatesForUser`).
- Backend controller: `backend/src/certificates/certificate.controller.ts` — public verify endpoint `GET /api/certificates/verify/:certificateNumber` and authenticated sync `POST /api/certificates/sync`.
- Frontend verify page: `frontend/src/routes/verify/+page.svelte` and proxy `frontend/src/routes/api/certificates/verify/[certificateNumber]/+server.ts` (public lookup UI).
- Preview template: `frontend/static/example-certificate.html` (visual template used for previewing the certificate design).

How to use locally:
- Fulfil an order via the backend `ShopService` flow to trigger certificate generation. Generation is idempotent (re-running for the same order will not create duplicates).
- To backfill certificates for an existing user, sign in on the frontend; the site layout calls `POST /api/certificates/sync` to create any missing certificates for fulfilled orders.
- Public verification: open the frontend verify page and enter a certificate number, or call the backend `GET /api/certificates/verify/:certificateNumber` directly.

Optional: signature images
- The certificate template and generator support swapping the stylized handwritten signature text for actual signature images. Provide image URLs and I can wire them into `example-certificate.html` and `backend/src/certificates/certificate.service.ts`.

Made with &#60;3 by [euan](https://github.com/EDRipper) , give it a ⭐
