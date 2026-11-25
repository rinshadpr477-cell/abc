# ABC Ecommerce

**ABC Ecommerce** is a full-stack e-commerce application: an **Express 5 + MongoDB (Mongoose) + JWT** API and a **Next.js 16 / React 19 / Tailwind 4** frontend with a customer storefront and an admin console. Roles: `ADMIN` and `CUSTOMER`.

```
backend/            Express API (CommonJS): routes → controllers → services → models
frontend/           Next.js App Router (TypeScript): storefront + admin
docker-compose.yml  MongoDB single-node REPLICA SET (needed for transactions), loopback only
docker-compose.auth.yml  optional override that enables MongoDB authentication
docs/               project documentation
```

## Quick start

Prerequisites: Node 20+, Docker (for MongoDB), Git.

```bash
# 1. MongoDB replica set (published on 127.0.0.1 only)
docker compose up -d mongo            # wait until healthy (~15 s)
#    Port 27017 already used (e.g. a local MongoDB service)? Put MONGO_HOST_PORT=27018 in a root .env
#    (see .env.example) and use that port in backend/.env.

# 2. Backend
cd backend
cp .env.example .env                  # review values; see "Secrets" below
npm install
npm run seed:admin                    # first ADMIN from ADMIN_EMAIL / ADMIN_PASSWORD
npm run seed:demo                     # optional sample categories + products
npm run dev                           # http://localhost:4000   (Swagger UI: /api-docs)

# 3. Frontend (new terminal)
cd frontend
cp .env.example .env.local
npm install
npm run dev                           # http://localhost:3100
```

Sign in at `http://localhost:3100/login` with the seeded admin; customers self-register at `/register`. There is **no public admin registration**: admins exist only through `npm run seed:admin`. Make sure `CORS_ORIGIN` in `backend/.env` includes `http://localhost:3100`.

Full instructions, every environment variable and the MongoDB authentication procedure: [docs/SETUP_AND_INSTALLATION.md](docs/SETUP_AND_INSTALLATION.md).

## Secure local setup — what is and is not protected

| Area | Status |
|---|---|
| MongoDB network exposure | Bound to **127.0.0.1 only** by default (not reachable from the LAN) |
| MongoDB authentication | **Optional, not on by default.** Enable with `docker-compose.auth.yml` (keyfile + root user from environment variables). Enabling it on an **existing** data volume is a manual one-time step, described in the setup guide; nothing in this repository does it automatically |
| Existing data volume | Never deleted or recreated by these files; don't run `docker compose down -v` unless you want to wipe the data |
| JWT secrets | Production start-up **refuses** placeholder/weak/identical secrets; generate them with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| Secrets in Git | `.env` files and keyfiles are git-ignored; only `.env.example` files (placeholders) are committed |

## Tests, lint and build

```bash
cd backend  && npm test && npm run lint          # 147 tests (in-memory MongoDB replica set, no Docker needed)
cd frontend && npm test && npm run typecheck && npm run lint    # 73 unit tests
cd frontend && NEXT_PUBLIC_API_URL=https://api.example.com/api/v1 npm run build
```

What is and is not covered: [docs/TESTING.md](docs/TESTING.md).

## Features

**Customer:** register / sign in, nested category browsing, search, price filter, sorting, pagination, product pages with images, cart, checkout (server-side prices, atomic stock), order history and details, cancel while `PENDING`, profile and password change, light/dark/system theme.

**Admin:** dashboard with real metrics, user directory with activate/deactivate, unlimited-depth category tree (create, move, deactivate, safe delete), product management with optional image URL, order management with the valid status workflow.

## API and docs

Base URL `http://localhost:4000/api/v1`. Swagger UI: `http://localhost:4000/api-docs` (OpenAPI JSON: `/api-docs.json`, source `backend/docs/openapi.yaml`). In production Swagger is **off by default**; see [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) for `SWAGGER_ENABLED`, `SWAGGER_SERVER_URL` and Basic-auth access for reviewers. `GET /health` is database-aware (`200` up / `503` down).

Responses: `{ success, message?, data, meta? }`; errors `{ success:false, message, code?, errors? }`.

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | components, layers, frontend↔API flow, consistency model |
| [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) | endpoints, errors, rate limits, health, Swagger access (local and production) |
| [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) | collections, fields, indexes, category hierarchy |
| [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) | tokens, refresh rotation with grace period, rate limits, secret validation |
| [docs/ORDER_WORKFLOW.md](docs/ORDER_WORKFLOW.md) | cart, checkout, pricing, transactions, idempotency, lifecycle, cancellation |
| [docs/SETUP_AND_INSTALLATION.md](docs/SETUP_AND_INSTALLATION.md) | prerequisites, env variables, MongoDB loopback/auth, existing volume, run, build |
| [docs/TESTING.md](docs/TESTING.md) | commands, coverage, manual checks, limitations |

## Known limitations

* **MongoDB auth is opt-in** and not applied to existing volumes automatically (see above). Default Compose runs MongoDB without credentials, bound to loopback.
* **Search** is a case-insensitive substring match on product name/SKU, user name/email, category name and customer name for order search. Unanchored regexes cannot use an index, so these queries scan; they are bounded by a 5 s server-side limit, a 100-character term limit, and (for order search by customer) at most the 200 most recent matching customers. Admin order search by order number (`ORD-…`) uses the index. A real search index (Atlas Search, text index, …) would be the next step at larger scale.
* **Rate-limit counters are in memory**, per API process; running several instances would need a shared store.
* Compose runs only MongoDB; there is no frontend/API container configuration, CI or deployment setup. Directory names are `backend/` and `frontend/`.
* Payments, shipping, taxes and email are out of scope (`total = subtotal`).
* Tokens issued before refresh-token families were introduced are rejected once, so such sessions must sign in again.
