# Authentication & Authorization

Implementation: `api/src/services/auth.service.js`, `api/src/middleware/{authenticate,authorize,validate,rateLimiter}.js`, `api/src/controllers/auth.controller.js`.

## Roles

| Role | How it is created | Can do |
|---|---|---|
| `CUSTOMER` | `POST /auth/register` (always this role) | Browse, order, cancel own PENDING orders, manage own profile |
| `ADMIN` | **Only** `npm run seed:admin` (reads `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` from the environment; idempotent) | Everything under users, categories, products, admin orders, dashboard |

There is no public admin registration and no role-change endpoint. Registration, login and profile bodies are `.strict()` zod schemas, so `role`, `isActive` or any other unexpected key is rejected with `422`.

## Registration & login

* `POST /auth/register` — validates `name`, `email` (normalised to lower-case, unique), and password (8–72 chars with upper-case, lower-case and a digit). Password is hashed with **bcrypt** (12 rounds). Duplicate email → `409 EMAIL_TAKEN`.
* `POST /auth/login` — constant-time-ish: for an unknown email a dummy bcrypt hash is compared, so timing does not reveal which emails exist; the error is always `401 INVALID_CREDENTIALS`. Deactivated accounts get `403 ACCOUNT_INACTIVE`.
* Responses contain `{ accessToken, user }`; password hashes and session data are never serialised.

## Tokens

| Token | Lifetime | Where | Contents |
|---|---|---|---|
| Access (JWT HS256, `JWT_ACCESS_SECRET`) | `ACCESS_TOKEN_TTL` (default 15 min) | JSON response; held **in memory** by the admin app, sent as `Authorization: Bearer` | `sub`, `role` |
| Refresh (JWT HS256, `JWT_REFRESH_SECRET`) | `REFRESH_TOKEN_TTL_DAYS` (default 7) | `HttpOnly` cookie `refreshToken`, `SameSite=Lax`, `Secure` when `NODE_ENV=production`, path `/api/v1/auth` | `sub`, `jti` |

The two secrets must differ and be ≥ 32 characters; the API refuses to start otherwise.

### Every protected request

`authenticate` verifies the signature/expiry (algorithm pinned to HS256) **and re-loads the user from MongoDB**, so a deactivated or deleted account is rejected immediately (`403 ACCOUNT_INACTIVE` / `401`) even with an unexpired token. `authorize('ADMIN' | 'CUSTOMER')` then checks the role server-side. Frontend route guards are only UX.

### Refresh-token rotation (`POST /auth/refresh`)

Each login (device) starts a **token family** with its own id (`fid`, embedded in every refresh token of that login). `users.sessions` holds one entry per family (max 5): the SHA-256 hash of the **current** token id, a short list of recently rotated ids (`previous`) and the expiry. Token values are never stored.

1. **Normal refresh:** the presented id matches the family's current id. It is rotated with a compare-and-swap on the stored hash (two requests can never both consume the same id), a new refresh token is issued, and the old id is remembered in `previous`.
2. **Grace period (`REFRESH_GRACE_SECONDS`, default 10):** a *previous* id presented within the grace window is accepted and rotated again. This covers two tabs refreshing at the same moment and a response lost on the network (the client retries with the old cookie). Every token issued this way stays usable inside its own grace window, so whichever `Set-Cookie` the browser kept still works.
3. **Reuse after the grace period = theft:** a previous id presented *after* the window (or an id the family never had) revokes **that family only** and answers `401 REFRESH_REUSED`. Other devices stay signed in; the revoked device must sign in again.
4. **Unknown family** (logged out, revoked, password changed, expired) gives a plain `401 REFRESH_INVALID`. Nothing else is revoked, so replaying a logged-out token cannot sign anyone out.
5. Deactivated accounts cannot refresh (`403`). Tokens issued before families existed (no `fid`) are rejected, so affected users sign in once after upgrading.

`REFRESH_GRACE_SECONDS=0` disables the grace period (strict single use). `auth.refresh.test.js` demonstrates the grace behaviour, that it ends after the window, and that theft detection still revokes the affected family.

### Logout, password change, deactivation

* `POST /auth/logout` removes the presented token's **family** and clears the cookie (already-expired tokens are still revoked); other devices are unaffected.
* `PATCH /auth/change-password` verifies the current password, sets the new one, **clears every session** (other devices are signed out) and returns a fresh token pair for the caller.
* An admin deactivating a customer clears that customer's sessions; their existing access token stops working on the next request.

## Rate limits

Per client IP, 15-minute windows, all configurable (see `backend/.env.example`):

| Limiter | Applies to | Default |
|---|---|---|
| API | every `/api/v1` request | 600 |
| Auth | `POST /auth/login`, `POST /auth/register` | 30 |
| Refresh (IP) | `POST /auth/refresh` | 120 |
| Refresh (token) | `POST /auth/refresh`, keyed by a hash of the refresh cookie (no client-supplied identifier is trusted) | 30 |

The refresh limits are separate from the login limits, so normal page reloads and several tabs do not interfere with logging in, and a login brute-force does not stop sessions from refreshing. A throttled request gets `429` with `{ success:false, code:"RATE_LIMITED", message }` and nothing else (no tokens, cookies or session data). Limiting is off under `NODE_ENV=test` unless `RATE_LIMIT_ENABLED=true`.

## Production secret validation

With `NODE_ENV=production` the API refuses to start if `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` is shorter than 32 characters, identical to the other, one of the public example values from `.env.example`, starts with a placeholder prefix (`change-me`, `your-`, `secret`, `password`, `test-`, …), contains placeholder wording (`example`, `placeholder`, …) or has fewer than 12 distinct characters. Error messages name the setting and the reason only; values are never printed. Generate each secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Development accepts the example values so local setup stays simple.

## Hardening summary

helmet headers; CORS allow-list (`CORS_ORIGIN`, comma separated, exact match) with credentials; rate limits (see above); 100 kB body limit; `$`/`.` keys stripped from bodies and params; flat-string query parser plus zod coercion; escaped regex searches; central error handler without stack traces in responses.

## Verified by automated tests

`api/src/tests/integration/auth.test.js`: registration (no hash leaked, HttpOnly cookie), admin-role registration rejected, duplicate email, weak password, generic invalid-credential errors, inactive user (login + existing token), missing/garbage/forged JWT, customer blocked from admin routes, role not changeable via profile, password change, refresh rotation + reuse detection revoking all sessions, user admin list/search and self/admin protection, NoSQL operator bodies rejected.
