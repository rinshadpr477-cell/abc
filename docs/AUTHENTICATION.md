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

1. The `jti` of every issued refresh token is stored (SHA-256 hashed) in `users.sessions` (max 5 devices).
2. Refresh verifies the cookie, then atomically **removes** that `jti` from the user (`findOneAndUpdate … $pull`) and issues a fresh access + refresh pair with a new `jti`.
3. If the `jti` is not found (already used, logged out or revoked) the token is treated as stolen: **all** the user's sessions are cleared and the API answers `401 REFRESH_REUSED`; the cookie is cleared.
4. Deactivated accounts cannot refresh (`403`).

### Logout, password change, deactivation

* `POST /auth/logout` removes the presented refresh `jti` and clears the cookie (already-expired tokens are still revoked).
* `PATCH /auth/change-password` verifies the current password, sets the new one, **clears every session** (other devices are signed out) and returns a fresh token pair for the caller.
* An admin deactivating a customer clears that customer's sessions; their existing access token stops working on the next request.

## Hardening summary

helmet headers; CORS allow-list (`CORS_ORIGIN`, comma separated) with credentials; rate limits (600/15 min general, 30/15 min on register/login/refresh; disabled only when `NODE_ENV=test`); 100 kB body limit; `$`/`.` keys stripped from bodies and params; flat-string query parser plus zod coercion; escaped regex searches; central error handler without stack traces in responses.

## Verified by automated tests

`api/src/tests/integration/auth.test.js`: registration (no hash leaked, HttpOnly cookie), admin-role registration rejected, duplicate email, weak password, generic invalid-credential errors, inactive user (login + existing token), missing/garbage/forged JWT, customer blocked from admin routes, role not changeable via profile, password change, refresh rotation + reuse detection revoking all sessions, user admin list/search and self/admin protection, NoSQL operator bodies rejected.
