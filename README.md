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
| `/api/auth/start` | POST | — | Begin OAuth flow |
| `/api/auth/handle-callback` | POST | — | Complete OAuth, issue tokens |
| `/api/auth/refresh` | POST | — | Rotate refresh token |
| `/api/auth/me` | GET | JWT | Current user claims |
| `/api/auth/logout` | POST | — | Invalidate session |
| `/api/projects` | GET | JWT | List user's projects |
| `/api/projects` | POST | JWT | Create a project |
| `/api/projects/:id` | PATCH | JWT | Update a project |
| `/api/projects/:id` | DELETE | JWT | Delete a project |
| `/api/projects/hours` | GET | JWT | Hackatime hours breakdown |
| `/api/hackatime/start` | POST | JWT | Begin Hackatime OAuth |
| `/api/hackatime/callback` | POST | JWT | Complete Hackatime OAuth |
| `/api/onboarding/status` | GET | JWT | Onboarding step completion |
| `/api/rsvp` | POST | — | Submit an RSVP |
| `/api/health` | GET | — | Health check |

---

Made with &#60;3 by [euan](https://github.com/EDRipper) , give it a ⭐