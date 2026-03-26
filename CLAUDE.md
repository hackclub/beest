## Monorepo Architecture

This is a monorepo with two separate applications:

- **`backend/`** — NestJS API server. Owns **all** business logic, auth, and data access.
- **`frontend/`** — SvelteKit app. A **thin, untrusted proxy layer** that renders UI and shuttles requests to the backend.

## The Golden Rule

**The NestJS backend is the single source of truth for all logic.** The SvelteKit layer is a dumb pass-through. It may:

- Set/read httpOnly cookies (token storage, OAuth state)
- Forward requests to the backend and relay responses
- Redirect the browser to URLs the backend specifies

It must **never**:

- Generate OAuth state, verify state, or make auth decisions
- Decide where to redirect users based on business logic
- Validate tokens or check authorization
- Store secrets or make direct calls to third-party APIs (Airtable, Hack Club, etc.)
- Perform any logic that, if tampered with, would compromise security or correctness

If you find yourself writing an `if` statement in a SvelteKit `+page.server.ts` or `+server.ts` that isn't "did the backend return an error?", it belongs in the NestJS backend instead.

## Auth Flow

1. User clicks RSVP → browser navigates to `/api/auth/login?email=...`
2. SvelteKit `+server.ts` calls backend `POST /api/auth/start` → backend returns `{ url, state }`
3. SvelteKit sets `oauth_state` + `rsvp_email` as httpOnly cookies, redirects browser to `url`
4. Hack Club redirects to `/oauth/callback?code=...&state=...`
5. SvelteKit `+page.server.ts` reads cookies, forwards to backend `POST /api/auth/handle-callback`
6. Backend verifies state, exchanges code, fetches userinfo, submits RSVP, returns `{ token, redirectTo }`
7. SvelteKit sets `auth_token` httpOnly cookie, redirects to `redirectTo`

## Auth-Guarded Pages

`/home` and `/tutorial` have `+page.server.ts` files that read the `auth_token` cookie and call backend `GET /api/auth/me` to validate. The backend verifies the JWT and returns user data, or 401. On 401, the cookie is cleared and the user is redirected to `/`. The `.svelte` page only renders data already validated by the backend.

## PII and Data Privacy

**Users are identified by their HCA subject ID or Slack ID. Never by email.**

The Airtable database currently uses email as its primary key — this is a backend-internal detail and emails must still never be exposed to the frontend or other users.

The following fields are **private PII** and must never be sent to the frontend or exposed in any API response visible to other users:

- Email address
- Physical address
- Birthdate
- YSWS eligibility
- Verification status

The following are **safe to display publicly**:

- Slack username / display name (not unique — do not use for lookups)
- HCA subject ID
- Slack ID

For looking up or referencing a specific user, use the **HCA subject ID** or **Slack ID** — never email, and never Slack username (which is not unique).

All data access must enforce **row-level security** — a user can only read/write their own data. Backend endpoints that return user data must scope queries to the authenticated user's ID. Never build endpoints that return lists of users with PII attached.

When logging or writing error messages, use HCA subject ID or Slack ID as the identifier — not email.

## Backend API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth/start` | POST | Generate HMAC-signed OAuth state + authorize URL (rate limited: 10/min) |
| `/api/auth/handle-callback` | POST | Verify state HMAC + cookie, exchange code, RSVP, issue JWT, return redirect (rate limited: 10/min) |
| `/api/auth/me` | GET | Validate JWT, return user claims (requires Bearer token) |
| `/api/auth/logout` | POST | Server-side logout hook (proxy clears auth_token cookie) |
| `/api/rsvp` | POST | Create RSVP in Airtable |
