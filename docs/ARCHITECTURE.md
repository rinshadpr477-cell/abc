# Architecture

ABC Ecommerce is two applications and a database, run locally with Docker only for MongoDB:

```
┌──────────────────────────┐   HTTPS/JSON + cookie    ┌───────────────────────────┐        ┌──────────────────────────┐
│ frontend/  (Next.js 16)  │ ───────────────────────▶ │ backend/  (Express 5 API) │ ─────▶ │ MongoDB 7 replica set    │
│ storefront + admin UI    │   Authorization: Bearer  │ /api/v1  ·  /health       │ Mongoose│ (transactions required) │
│ http://localhost:3100    │ ◀─────────────────────── │ http://localhost:4000     │        │ 127.0.0.1:<MONGO_HOST_PORT>
└──────────────────────────┘                          └───────────────────────────┘        └──────────────────────────┘
```

## Repository layout

```
.
├─ backend/                 Express API (CommonJS, JavaScript)
│  ├─ src/
│  │  ├─ config/            environment.js (validated settings), database.js, secretStrength.js, swagger.js
│  │  ├─ models/            User, Category, Product, Order (Mongoose schemas + indexes)
│  │  ├─ routes/            URL wiring and middleware order only
│  │  ├─ controllers/       HTTP in/out only (parse, call a service, shape the response)
│  │  ├─ services/          all business rules and transactions
│  │  ├─ middleware/        authenticate, authorize, validate (zod), sanitize, rateLimiter, errorHandler
│  │  ├─ validators/        zod request schemas
│  │  ├─ utils/             ApiError, ApiResponse, asyncHandler, helpers, transaction, health
│  │  ├─ app.js             Express app (security middleware, routes, Swagger)
│  │  ├─ server.js          connects MongoDB, builds indexes, listens, graceful shutdown
│  │  └─ tests/             unit/ and integration/ (Vitest + Supertest)
│  ├─ scripts/              seed-admin.js, seed-demo.js
│  ├─ docs/openapi.yaml     OpenAPI source for Swagger UI
│  └─ Dockerfile            API image (not wired into Compose)
├─ frontend/                Next.js App Router (TypeScript)
│  └─ src/
│     ├─ app/               routes: (auth) login/register, (store) storefront, admin/
│     ├─ components/        ui/ (design-system primitives), layout/, catalog/, auth/, common/
│     ├─ lib/               api.ts (axios + refresh), redirect.ts, checkout-key.ts, utils.ts, query-client.ts
│     ├─ stores/            auth (in-memory token), cart (persists ids + quantities only)
│     ├─ services/          typed API calls; hooks/, providers/, types/
├─ docker/mongo/            entrypoint-auth.sh (authenticated replica set bootstrap)
├─ docker-compose.yml       MongoDB replica set, loopback only
├─ docker-compose.auth.yml  optional override: database authentication + keyfile
└─ docs/                    this documentation
```

## Request flow (API)

`routes` → rate limiters → `validate` (zod; strict, unknown keys rejected) → `authenticate` (JWT + DB lookup) → `authorize(role)` → `controller` → `service` → `model`. Errors of any kind go to one `errorHandler` that maps them to the standard error envelope and never leaks stack traces or driver messages in production.

Layer rules that keep the code maintainable: controllers contain no business logic; services never touch `req`/`res`; every multi-document invariant is enforced in a service inside a MongoDB transaction.

## Frontend ↔ API communication

* One axios instance (`frontend/src/lib/api.ts`) with `baseURL = NEXT_PUBLIC_API_URL` and `withCredentials: true` (for the refresh cookie). In development, if the variable is unset it falls back to `http://localhost:4000/api/v1`; in a production build a missing variable makes the build fail.
* The **access token lives only in memory** (zustand, not persisted). On page load the app calls `POST /auth/refresh`; the HttpOnly refresh cookie restores the session.
* A `401` triggers one shared ("single-flight") refresh and replays the failed request; if the refresh fails the session is cleared and the user is sent to `/login?next=…&reason=expired` (a full page load, so the reason travels in the URL and the login page shows it; a toast alone would be lost by the reload). `?next=` is validated by `safeNextPath` (same-origin paths only). A deactivated account (`403 ACCOUNT_INACTIVE`) ends the session the same way.
* The cart (localStorage) stores **only `{ productId, quantity }`**. Prices, names and stock shown in the cart/checkout are re-fetched and display-only; the order request sends ids and quantities plus an `Idempotency-Key` header and the server computes everything else.
* Route guards in the frontend are UX only; the API enforces roles on every request.

## Data and consistency

* MongoDB must run as a **replica set** because several operations are multi-document transactions: placing an order (stock decrement + order), cancelling (status + stock restore), moving/creating/deleting categories, assigning products to categories, deleting products. `utils/transaction.js` wraps `session.withTransaction`, which retries transient write conflicts.
* Where two operations could each pass their checks against an older snapshot ("write skew"), they are made to **write a shared document** so MongoDB aborts one and it re-validates: category moves touch the new parent, child creation and product assignment touch the category (`rev` counter), product deletion writes the product that orders decrement. See [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).
* Orders keep snapshots (name, SKU, unit price) and are idempotent per `(customer, Idempotency-Key)` with a fingerprint of the cart. See [ORDER_WORKFLOW.md](ORDER_WORKFLOW.md).

## Security architecture (summary)

JWT access tokens (15 min) re-validated against the database on every request; rotating refresh-token families in an HttpOnly cookie with a short grace period; role checks in the API; strict zod validation; separate rate limiters for login/register and refresh; CORS allow-list; helmet; body/param sanitiser; escaped regex search with a server-side time limit; production start-up checks (no localhost URLs, no placeholder/weak JWT secrets); database-aware `/health`; MongoDB bound to loopback with optional authentication. Details: [AUTHENTICATION.md](AUTHENTICATION.md), [SETUP_AND_INSTALLATION.md](SETUP_AND_INSTALLATION.md).

## What is not here (yet)

* No Docker image or Compose service for the frontend; Compose only runs MongoDB (a `backend/Dockerfile` exists but is not part of Compose).
* No CI configuration, no deployment configuration, no email/payment/shipping integrations.
* Directory names are `backend/` and `frontend/` (a rename to `api/` and `admin/` was discussed but not done).
