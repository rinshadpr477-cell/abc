# Setup and Installation

## Prerequisites

* Node.js 20 or newer and npm (developed on Node 20.20 / npm 10).
* Docker (for MongoDB). A MongoDB **replica set** is required; Compose provides a single-node one.
* Git.

## 1. MongoDB

The default `docker-compose.yml` runs `mongo:7` as a single-node replica set (`rs0`) with a named volume `mongo-data`, and publishes the port on **127.0.0.1 only** (never on your network).

```bash
docker compose up -d mongo          # first start initiates the replica set; wait until healthy (~15 s)
docker compose ps
```

### Port already in use?

If something else already listens on `127.0.0.1:27017` (for example a locally installed MongoDB Windows service), choose another host port in a root `.env` file (git-ignored; start from `.env.example`):

```
MONGO_HOST_PORT=27018
```

and use the same port in `backend/.env` (`MONGODB_URI=mongodb://127.0.0.1:27018/ecommerce?replicaSet=rs0&directConnection=true`). Do not skip this: if the Docker port clashes with another MongoDB, the API could connect to the wrong database.

### Authentication (recommended) — what is and is not enabled by default

By default the database has **no authentication**; the only protection is loopback binding. To require credentials use the override file:

```bash
docker compose -f docker-compose.yml -f docker-compose.auth.yml up -d
```

It needs three values in the root `.env` (never commit it):

| Variable | Meaning | How to create |
|---|---|---|
| `MONGO_ROOT_USERNAME` | admin account name | any name |
| `MONGO_ROOT_PASSWORD` | admin account password | `openssl rand -base64 24` |
| `MONGO_REPLICA_KEY` | replica-set keyfile content (internal member authentication), 6–1024 base64 characters on one line | `openssl rand -base64 48 \| tr -d '\n'` |

The entrypoint (`docker/mongo/entrypoint-auth.sh`) writes the keyfile inside the container's `/tmp` (not into the data volume, not on a published port), starts MongoDB with `--keyFile --auth`, and on every start makes sure the root user exists: if it already works nothing changes; if no user exists yet it initiates the replica set when needed and creates the root user; if users exist but the credentials do not match it stops with an error and changes nothing.

Then put the credentials in `backend/.env` (URL-encode special characters):

```
MONGODB_URI=mongodb://<MONGO_ROOT_USERNAME>:<MONGO_ROOT_PASSWORD>@127.0.0.1:27017/ecommerce?replicaSet=rs0&directConnection=true&authSource=admin
```

**Fresh installation (empty volume):** just run the command above; the root user is created on first start.

**Existing development volume (already holds data, no users): manual one-time step.** Compose's `MONGO_INITDB_ROOT_*` variables only act on an empty data directory, so they would silently do nothing here. The override's entrypoint handles this case, but it performs a **one-time write of the root user to the `admin` database** (your application data is not modified), so it is not done automatically by this project. Steps:

1. Back up first (optional but sensible). Find the volume with `docker volume ls` (for this project it is `ecommerce-machine-test_mongo-data`), then:
   `docker run --rm -v ecommerce-machine-test_mongo-data:/data:ro -v "$PWD":/backup alpine tar czf /backup/mongo-backup.tgz -C /data .`
2. Add the three variables to the root `.env`.
3. `docker compose -f docker-compose.yml -f docker-compose.auth.yml up -d` (recreates the container on the **same volume**; do not use `down -v`).
4. Update `MONGODB_URI` in `backend/.env` as above and restart the API.
5. Verify: an unauthenticated `mongosh` command is rejected, and `npm run dev` in `backend/` connects.

To return to the unauthenticated setup run `docker compose up -d mongo` without the override (the stored users are simply not enforced).

This procedure was validated on a throw-away instance (fresh start, restart, and an initiated no-auth replica set with data switched to auth); it has **not** been applied to the developer's existing volume.

## 2. Backend

```bash
cd backend
cp .env.example .env          # then edit (see below)
npm install
npm run seed:admin            # creates the first ADMIN from ADMIN_EMAIL / ADMIN_PASSWORD (idempotent)
npm run seed:demo             # optional: sample category tree and products
npm run dev                   # http://localhost:4000   (Swagger UI: /api-docs)
```

### Environment variables (`backend/.env`)

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` enables the strict start-up checks below |
| `PORT` | `4000` | |
| `MONGODB_URI` | – (required) | must be a replica set; no localhost in production |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | – (required) | ≥ 32 chars and different from each other. **Production additionally rejects** the public example values, placeholder prefixes/wording and repetitive values |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL_DAYS` | `15m` / `7` | |
| `REFRESH_GRACE_SECONDS` | `10` | grace window for a just-rotated refresh token (`0` = strict single use) |
| `CORS_ORIGIN` | `http://localhost:3000` | comma-separated exact origins; use `http://localhost:3100` for the local frontend; no localhost/`*` in production |
| `AUTH_RATE_LIMIT_MAX`, `REFRESH_RATE_LIMIT_MAX`, `REFRESH_TOKEN_RATE_LIMIT_MAX`, `API_RATE_LIMIT_MAX` | `30`, `120`, `30`, `600` | per 15 minutes |
| `SWAGGER_ENABLED`, `SWAGGER_SERVER_URL`, `SWAGGER_USER`, `SWAGGER_PASSWORD` | on outside production / off in production | see [API_DOCUMENTATION.md](API_DOCUMENTATION.md) |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | – | used only by `npm run seed:admin` |

### Generating JWT secrets

Create two different values (run the command twice):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Keep them out of Git (`.env` is ignored) and store production secrets in your host's secret manager. Rotating a secret signs every user out.

### Health

`GET http://localhost:4000/health` → `200` with `database: "up"` when MongoDB answers a ping, `503` when it does not. Use it as the readiness probe.

## 3. Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev                   # http://localhost:3100
```

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_API_URL` | API base URL including `/api/v1`. Optional in development (falls back to `http://localhost:4000/api/v1`). **Required for a production build** (it is inlined at build time; the build fails if missing) |

Make sure `CORS_ORIGIN` in `backend/.env` includes the frontend origin (`http://localhost:3100`). Sign in at `/login` with the seeded admin; customers register at `/register`.

## 4. Quality checks and production build

```bash
# backend
cd backend && npm test && npm run lint

# frontend  (Windows: run from a shell whose path starts with an upper-case drive letter, see TESTING.md)
cd frontend && npm test && npm run typecheck && npm run lint
NEXT_PUBLIC_API_URL=https://api.example.com/api/v1 npm run build    # PowerShell: $env:NEXT_PUBLIC_API_URL="..."; npm run build
npm start                     # serves the build on :3100
```

## Safe production start-up (checklist)

The API refuses to start in `NODE_ENV=production` when: `CORS_ORIGIN`, `MONGODB_URI` or `SWAGGER_SERVER_URL` point at localhost, `CORS_ORIGIN` is `*`, or the JWT secrets are weak/placeholder/identical. Also: serve both apps over HTTPS (the refresh cookie is `Secure` in production), keep Swagger off or Basic-auth protected, use an authenticated MongoDB, and provide `NEXT_PUBLIC_API_URL` at build time. Deployment itself is not covered or configured here.
