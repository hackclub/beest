# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Beest is the "You Ship We Ship" platform behind https://beest.hackclub.com — a hackathon site where participants sign in, submit projects, receive review feedback, and spend earned currency in a shop. It's a two-app monorepo (no root workspace tooling): `backend/` (NestJS) and `frontend/` (SvelteKit). Each has its own `package.json` and is installed/built/run independently.

## Commands

Run these from within `backend/` or `frontend/` respectively — there is no root package script.

**Backend** (`cd backend`):
- `npm run start:dev` — dev server with watch, port 3001
- `npm test` — Jest unit tests (`*.spec.ts`)
- `npx jest src/sidekick/sidekick.service.spec.ts` — run a single test file
- `npm run lint` / `npm run format` — ESLint (autofix) / Prettier
- `npm run build` — `nest build`
- `npm run migration:generate -- src/migrations/<Name>` — generate a migration from entity diff
- `npm run migration:run` / `npm run migration:revert` — apply / undo migrations

**Frontend** (`cd frontend`):
- `npm run dev` — Vite dev server, port 5173
- `npm run check` — `svelte-check` type checking (this repo's "test" — there is no test runner)
- `npm run lint` / `npm run format` — Prettier check / write
- `npm run build`

CI (`.github/workflows/ci.yml`) runs backend `npm test` + `npm run build`, and frontend `npm run build` only. Node 22.

Local DB: `docker compose -f docker-compose.dev.yml up -d` from repo root, then set `DATABASE_URL` in `backend/.env` (copy from `backend/.env.example`).

## Architecture

**The backend is the single source of truth.** All authentication, business logic, and data access live in NestJS. The frontend is a *thin proxy* — SvelteKit `+server.ts` routes under `frontend/src/routes/api/**` forward to the backend's `/api/**` endpoints; `+page.server.ts` loaders fetch backend data server-side. The frontend holds no business logic and no direct DB access.

**Auth flow.** Hack Club OAuth (`auth.hackclub.com`) → backend issues a JWT (1h) + refresh token (90d). The frontend stores both in `httpOnly` cookies and injects them via `frontend/src/lib/server/auth.ts`:
- `proxyWithRefresh(cookies, url, init)` — the standard way every proxy route calls the backend; attaches the Bearer token, transparently refreshes + retries once on 401, and persists any rotated JWT the backend returns.
- `getAuthenticatedUser(cookies)` — used by page loaders to resolve current-user claims; returns `null` (not an error) if the backend is unreachable so pages degrade instead of 500ing.
- New backend routes that need auth almost always need a matching frontend proxy route using these helpers — don't call the backend directly from client code.

**Roles/permissions come from Airtable, not the database.** `RsvpService.getPerms(email)` queries Airtable; NestJS guards (`backend/src/admin/*.guard.ts`) gate routes on the returned role string. Roles: `Super Admin`, `Reviewer`, `Fraud Reviewer`, `Fulfiller`. Guards verify the JWT *and* the Airtable role, then attach `request.user`.

**Persistence.** TypeORM + PostgreSQL. Entities in `backend/src/entities/`. `synchronize` is off and `migrationsRun` is on — migrations in `backend/src/migrations/` run automatically at boot. Any schema change requires a hand-checked migration; never rely on entity sync. Entities must also be registered in the `entities: [...]` array in `backend/src/app.module.ts`.

**Encryption at rest.** Sensitive tokens (e.g. Hackatime/HCB credentials) are AES-256-GCM encrypted via TypeORM column transformers using `backend/src/crypto.util.ts` (`encrypt`/`decrypt`) keyed by `DB_ENCRYPTION_KEY` (32-byte hex). Look for `transformer:` on entity columns.

**Backend module map** (each is a standard NestJS module/controller/service):
- Core domain: `projects` (statuses: `unshipped → unreviewed → fraud_pending / changes_needed → approved`), `shop` + `Order`/`FulfillmentUpdate`, `fraud-review`, `devlogs`, `news`, `rsvp`, `onboarding`, `admin`, `audit-log`.
- External integrations: `hackatime` (coding-hours tracking, drives payout hours), `hcb` / `hca`, `identity` (identity.hackclub.com verification — note *eligible* ≠ merely *verified*; only `verified_eligible` earns rewards), `slack`, `lookout`, `lapse`, `sidekick` (external audit/HQ integration — has its own auth guard and mappers; the best-tested module).

Domain reviewer conventions (what counts as a good project review, fraud handling) are documented in `docs/good-review.md`.
