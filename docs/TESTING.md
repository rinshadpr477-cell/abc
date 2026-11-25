# Testing

## Commands

```bash
# Backend (Vitest + Supertest; spins up an in-memory MongoDB REPLICA SET, no Docker or local MongoDB needed)
cd backend
npm test            # whole suite (147 tests, 11 files)
npm run lint        # ESLint 10 flat config (eslint.config.js)

# Frontend (Vitest, plain Node)
cd frontend
npm test            # 73 unit tests, 4 files
npm run typecheck   # tsc --noEmit
npm run lint        # eslint (Next.js + TypeScript rules)
NEXT_PUBLIC_API_URL=https://api.example.com/api/v1 npm run build
```

The first backend run downloads a MongoDB binary (cached afterwards). Each backend test file uses its own database on one shared in-memory replica set and runs files one after another.

## What the backend tests cover (automated)

| File | Area |
|---|---|
| `auth.test.js` | registration (no hash leaked, HttpOnly cookie, no admin self-registration, duplicate email, weak password), generic invalid-login errors, inactive accounts, missing/garbage/forged JWTs, customer blocked from admin routes, profile/password rules, admin user search/filter, NoSQL operator bodies |
| `auth.refresh.test.js` | refresh rotation and the grace period: normal refresh, **concurrent** refresh with one cookie, **lost-response retry**, reuse inside/after the grace window, grace bounded by `REFRESH_GRACE_SECONDS`, refresh after logout / deactivation / password change, invalid and legacy tokens, **independent devices (token families)**, family scoping, tokens never stored in clear; refresh cookie flags (`HttpOnly`, `SameSite=Lax`, scoped `Path`, `Secure` only in production), cookie cleared on logout |
| `ratelimit.*.test.js` (2 files) | login/register limiter; **separate** refresh limiter (per IP and per token cookie); exhausting one does not consume the other (both directions); 429 body carries no tokens/cookies/session data |
| `cors.health.test.js` | CORS allow/deny (allowed origin + credentials, preflight, other port, look-alike suffix, scheme mismatch, `null` origin, no wildcard, no-Origin clients); `/health` 200 when connected, 503 when disconnected / ping fails / ping hangs, no connection details leaked, read-only |
| `unit/secrets.test.js` | production JWT secret validation (the real `.env.example` values, placeholder prefixes/wording, identical, short, repetitive, strong accepted), error output never contains secrets, development stays compatible |
| `docs.test.js` | OpenAPI JSON and Swagger UI; Basic auth on both docs endpoints in production mode; production config guard (localhost in CORS/Mongo/Swagger URL); development unaffected |
| `category.test.js` | tree, unlimited depth (60 levels), descendants/ancestors, cycle prevention, subtree re-pathing, cascade deactivation, deletion rules |
| `product.test.js` | create/validate/duplicate SKU, descendant-aware category filter, search + price + sort + pagination, visibility rules, delete-vs-deactivate, **product image URL** (valid/optional/replace/clear/invalid forms/legacy products) |
| `order.test.js` | backend price calculation, sale prices, snapshots, insufficient stock, rollback, **concurrent orders cannot oversell**, idempotency, ownership, status workflow, **cancellation restores stock once**, dashboard stats |
| `hardening.test.js` | **concurrent category moves never create a cycle** (repeated runs), category/product deletion and assignment races, ordered-product deletion race, **idempotency key + different payload → 409**, concurrent same-key requests, retry after failure, search safety (regex metacharacters, length cap, indexed order-number lookup, bounded customer pre-lookup) |

The concurrency tests were verified to be meaningful by mutation: with a safeguard temporarily removed (move-target touch, product-assignment touch, idempotency fingerprint, refresh grace period) the corresponding tests fail.

## What the frontend tests cover (automated)

| File | Area |
|---|---|
| `redirect.test.ts` | `safeNextPath`: accepts `/admin`, `/products`, encoded internal paths; rejects `//evil.com`, `/\evil.com`, `/%5Cevil.com`, absolute URLs, `javascript:`/`data:`, control characters, malformed encodings; includes a regression proof that the previous check accepted `/\evil.com` |
| `checkout-key.test.ts` | one Idempotency-Key per distinct cart, reused on retries and re-ordered lines, new key when the cart changes or after success, ids and quantities only |
| `session-notice.test.ts` | the `?reason=expired|deactivated` message shown on `/login` after a session ended (unknown values ignored, no prototype lookups) |
| `api.test.ts` | refresh **single-flight** (one request for concurrent callers), failed refresh does not poison later attempts, 401 → one refresh → replay, several expiring requests → one refresh, no replay loop, **session-expired handling** (state cleared, toast, redirect with a validated `?next=`), deactivated account, requests that must not refresh (login 401, anonymous), error normalisation and toasts, network errors, caller-side retry, order request sends ids/quantities + `Idempotency-Key` only |

These run against a scripted HTTP layer (no network, no browser).

## Manual / browser verification (not part of the repository)

During development the application was also exercised in a real Chrome (headless) against the running API and MongoDB with throw-away scripts that are **not committed**. Treat these as manual verification, not as regression tests:

* Admin product create/edit/clear with image URLs, invalid and broken image links, storefront cards and detail pages, light/dark/system theme persistence without a flash.
* Login redirects with hostile `?next=` values (`/\evil.com`, `/%5Cevil.com`, `//evil.com`, absolute URLs): the browser stayed on the application and no external request was attempted.
* Customer journey in the UI: register, add to cart, checkout, order history and details, cancel (stock restored once); customer redirected away from `/admin` and receiving `403` from admin APIs; invalid login and deactivated-account messages.
* Three tabs loading and reloading at the same time with one refresh cookie all stayed signed in.
* Expired session (API `401` plus rejected refresh): redirect to `/login?next=…&reason=expired` with the notice visible, and sign-in returns the user to the original page. (This check found that the toast was lost by the full-page reload; the reason is now carried in the URL.)
* A live API pass: refresh rotation with the real 10 s grace window and reuse detection, concurrent category moves, idempotent order retries and mismatches, 8 concurrent buyers for 3 units, cancellation, access boundaries, CORS, and `/health` while the MongoDB container was paused and resumed.

## Known limitations

* No component, end-to-end or visual tests are committed; the UI (forms, guards, theme toggle, images) is covered only by the manual checks above, by `tsc` and by lint.
* The refresh/session logic in the browser is tested through its API-client unit tests, not in a real multi-tab browser.
* Rate-limit tests set small limits through environment variables; the production defaults are not load-tested. Counters are in memory, so limits are per API process (not shared between instances).
* MongoDB **authentication** is not exercised by the automated suite (tests use an unauthenticated in-memory replica set). It was validated manually on a throw-away container; see [SETUP_AND_INSTALLATION.md](SETUP_AND_INSTALLATION.md).
* Race tests increase confidence but cannot prove absence of races; they exercise the transactional conflict paths repeatedly.
* **Windows:** run frontend tests from a shell whose current directory starts with an **upper-case** drive letter (`C:\…`). With a lower-case `c:\…` Vitest loads the same file under two module ids and fails with "Vitest failed to find the current suite" (or mocks silently miss). Most terminals and VS Code use the upper-case form.
