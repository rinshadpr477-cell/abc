# ABC Ecommerce

**ABC Ecommerce** is a full-stack e-commerce application: **Express + MongoDB (Mongoose) + JWT** backend and a **Next.js 16 / React 19 / Tailwind 4** frontend (design language borrowed from an existing admin UI). Roles: `ADMIN` and `CUSTOMER`.

```
ecommerce-machine-test/
  backend/            Express API (CommonJS) — routes → controllers → services → models
  frontend/           Next.js App Router (TypeScript): storefront + admin
  docker-compose.yml  MongoDB single-node REPLICA SET (needed for transactions)
```

## Quick start

Prerequisites: Node 20+, Docker (for MongoDB).

```bash
# 1. MongoDB as a replica set (transactions require one)
docker compose up -d mongo            # waits until healthy (~15s)

# 2. Backend
cd backend
cp .env.example .env                  # then set the two JWT secrets (see below) and ADMIN_* values
npm install
npm run seed:admin                    # creates the first ADMIN from ADMIN_EMAIL / ADMIN_PASSWORD
npm run seed:demo                     # optional: Electronics/Fashion category tree + sample products
npm run dev                           # http://localhost:4000  (Swagger UI: /api-docs)

# 3. Frontend (new terminal)
cd frontend
cp .env.example .env.local
npm install
npm run dev                           # http://localhost:3000
```

Generate secrets: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` (the two JWT secrets must differ, ≥ 32 chars).

Sign in as the seeded admin at `/login`; customers self-register at `/register`. There is **no public admin registration** — admins exist only via `npm run seed:admin`.

## Tests

```bash
cd backend && npm test      # Vitest + Supertest, in-memory MongoDB REPLICA SET (no Docker needed)
cd frontend && npm run typecheck && npm run lint && npm run build
```

The first backend test run downloads a MongoDB binary (cached afterwards). Tests cover auth, categories (unlimited depth, cycle prevention, subtree moves, deletion rules), products (search/price/sort/pagination, descendant-aware category filter, visibility) and orders (backend pricing, atomic stock, rollback, concurrent orders, idempotency, ownership, status workflow, cancellation restoring stock exactly once).

> Why Vitest and not Jest? Jest's VM sandbox breaks the MongoDB driver's handshake (`Missing required sub-document 'driver'`), reproducible with the raw driver. Vitest is API-compatible (`describe/test/expect`) and works.

## API

Base URL `http://localhost:4000/api/v1` · interactive docs at `/api-docs` (source: `backend/docs/openapi.yaml`).

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/profile`, `PATCH /auth/change-password` |
| Users (admin) | `GET /users`, `GET /users/:id`, `PATCH /users/:id/status` |
| Categories | `GET /categories/tree` (public), `GET/POST /categories`, `GET/PATCH/DELETE /categories/:id`, `GET /categories/:id/descendants`, `GET /categories/:id/ancestors` |
| Products | `GET /products`, `GET /products/:id` (public; admins also see inactive), `POST/PATCH/DELETE` (admin) |
| Orders | `POST /orders`, `GET /orders/my-orders`, `GET /orders/:id`, `PATCH /orders/:id/cancel` |
| Admin | `GET /admin/orders`, `PATCH /admin/orders/:id/status`, `GET /admin/dashboard/stats` |

Responses: `{ success, message?, data, meta? }` / errors `{ success:false, message, code?, errors? }`; list `meta` = `{ page, limit, total, totalPages, hasNextPage, hasPreviousPage }`.

## Architecture & key decisions

**Layering.** `routes` (wiring + middleware) → `controllers` (HTTP only) → `services` (business logic) → `models`. Cross-cutting: `middleware/` (authenticate, authorize, validate, sanitize, rateLimiter, errorHandler), `validators/` (zod), `utils/` (ApiError, ApiResponse, asyncHandler).

**Authentication.** Short-lived JWT access token (15 min, held in browser *memory* only) + rotating refresh token in an `HttpOnly; SameSite=Lax` cookie scoped to `/api/v1/auth`. Refresh tokens are tracked server-side by hashed `jti`; each use consumes it and issues a new one. Presenting an already-used token is treated as theft and revokes **all** sessions of that user. `authenticate` re-reads the user on every request, so deactivation takes effect immediately. Login uses constant-time comparison against a dummy hash for unknown emails; passwords are bcrypt-hashed and never serialised.

**Authorization.** Enforced in the backend (`authorize('ADMIN')` etc.). Frontend guards are UX only. `.strict()` zod schemas reject unknown keys, so `role`/`isActive`/prices can never be smuggled in via registration, profile update or order bodies.

**Categories (unlimited depth).** Each category stores `parent` **and** a materialised `ancestors` path plus derived `level`.
- Descendants of X = one indexed query `{ ancestors: X }` — no recursion, no N+1; this also powers product filtering.
- The tree endpoint loads all categories in **one** query and nests them in memory.
- Moving a category runs in a transaction: self-parent and "move under own descendant" are rejected, and the whole subtree's `ancestors`/`level` are rewritten in one `bulkWrite`.
- Safe removal policy: **delete** only empty leaf categories (409 with `CATEGORY_HAS_CHILDREN` / `CATEGORY_HAS_PRODUCTS` otherwise). **Deactivate** instead: it cascades to descendants (so no visible node hangs under a hidden parent), hides them and their products from customers, and reactivation requires an active parent.

**Products.** `effectivePrice` (= sale price when valid, i.e. `0 ≤ salePrice < price`, else price) is maintained by a pre-validate hook so price filtering/sorting uses a plain indexed field. Selecting a parent category returns products from the category **and all descendants**, resolved server-side. Customers/anonymous users see only `ACTIVE` products in active categories; out-of-stock products remain visible with `inStock:false` (not orderable), or can be hidden with `inStock=true`. Deleting a product that appears in orders deactivates it instead, preserving history.

**Orders (transactional).** `POST /orders` accepts only `{productId, quantity}` pairs. Inside one MongoDB transaction, for every line: `findOneAndUpdate({_id, status:'ACTIVE', stock:{$gte:qty}}, {$inc:{stock:-qty}})` — an atomic check-and-decrement that makes overselling impossible under concurrency — then the order is created with name/SKU/unit-price **snapshots** taken from the database. Any failure aborts the transaction, so partial stock updates cannot persist. Lines are processed in a deterministic order to avoid lock-order conflicts. `withTransaction` retries transient write conflicts.
- **Idempotency:** `Idempotency-Key` header + unique partial index `(customer, idempotencyKey)`. A repeat (even concurrent) submission returns the original order with `200`; the loser's transaction (including its stock decrement) rolls back.
- **Order number:** `ORD-YYYYMMDD-XXXXXXXX` (random suffix, unique index) — avoids a contended global counter.
- **Workflow:** `PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED`; invalid jumps/backwards moves → `409 INVALID_TRANSITION`. Each change is a guarded atomic update (`{_id, status: <expected>}`) with history appended.
- **Cancellation policy:** a customer may cancel their own order only while `PENDING`; an admin may cancel up to and including `PROCESSING`; never after `SHIPPED`. Cancelling restores stock in the **same transaction**, guarded by both the status check and a `stockRestored` flag, so concurrent or repeated cancels restore exactly once.

**Security.** helmet, CORS allow-list with credentials, rate limits (stricter on auth routes), 100 kB body limit, body/param sanitiser dropping `$`/`.` keys, Express `simple` query parser plus zod coercion (operator objects can't reach Mongo), regex-escaped searches, centralised error handler that never leaks stack traces/DB errors in production, secrets validated at boot.

**Indexes.** users: unique `email`, `role`, `isActive` · categories: unique `(parent, slug)`, multikey `ancestors` · products: unique `sku`, `(category, status)`, `(status, effectivePrice)`, `createdAt`, `name` · orders: unique `orderNumber`, `(customer, createdAt)`, `(status, createdAt)`, `createdAt`, unique partial `(customer, idempotencyKey)`.

## Known limitations / notes

- Transactions need a replica set; `docker-compose.yml` provides one (`replicaSet=rs0&directConnection=true`).
- Payments, shipping costs, taxes and email are out of scope; `total = subtotal`.
- Refresh-cookie auth relies on `SameSite=Lax` + a CORS allow-list; set `CORS_ORIGIN` to your real frontend origin(s) in production and serve over HTTPS (`NODE_ENV=production` marks the cookie `Secure`).
