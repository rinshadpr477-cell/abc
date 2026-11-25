# API Documentation

Base URL: `http://localhost:4000/api/v1` (local) · `https://<deployed-api-domain>/api/v1` (production).
Source of truth for schemas: [`api/docs/openapi.yaml`](../api/docs/openapi.yaml) (served live by Swagger, see below).

## Swagger / OpenAPI access

| | URL |
|---|---|
| Local Swagger UI | `http://localhost:4000/api-docs` |
| Local OpenAPI JSON | `http://localhost:4000/api-docs.json` |
| Production Swagger UI | `https://<deployed-api-domain>/api-docs` |
| Production OpenAPI JSON | `https://<deployed-api-domain>/api-docs.json` |

Swagger is mounted inside the Express API (`api/src/config/swagger.js`) and configured by environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `SWAGGER_ENABLED` | `true` outside production, **`false` in production** | `true`/`false` explicitly overrides the default. When disabled, `/api-docs` and `/api-docs.json` return 404. |
| `SWAGGER_SERVER_URL` | unset | Public origin of the deployed API (e.g. `https://api.example.com`). The spec's server becomes `<url>/api/v1`. When unset the spec uses the **relative** server `/api/v1`, so "Try it out" calls whichever host serves the docs. No host is hardcoded. |
| `SWAGGER_USER` / `SWAGGER_PASSWORD` | unset | When both are set, `/api-docs` and `/api-docs.json` are protected with HTTP Basic auth (constant-time comparison). |

**Giving reviewers access in production:** set `SWAGGER_ENABLED=true`, `SWAGGER_SERVER_URL=https://<api-domain>`, and (recommended) `SWAGGER_USER`/`SWAGGER_PASSWORD`; share those credentials with reviewers out of band. They open `https://<api-domain>/api-docs`, enter the Basic credentials, then use **Authorize** and paste an access token (see below). The spec contains no secrets; it only describes endpoints.

**Using Authorize:** call `POST /auth/login` (in Swagger or any client), copy `data.accessToken`, click **Authorize**, paste the token (without `Bearer `). Authorization persists across page reloads. Access tokens last 15 minutes.

The served spec is `openapi.yaml` completed at startup: every operation gets the shared error responses (`401/403` for secured routes, `422` when it takes a body/query, `429`, `500`) and 2xx responses without a schema get the standard envelope.

## Conventions

* JSON in/out. Success: `{ "success": true, "message"?, "data", "meta"? }`.
* Error: `{ "success": false, "message", "code"?, "errors"? }` where `errors` is `[{ "in": "body|query|params|headers", "field", "message" }]` for validation failures.
* Pagination (`page` ≥ 1, `limit` 1–100, default 10): `meta = { page, limit, total, totalPages, hasNextPage, hasPreviousPage }`.
* IDs are 24-hex MongoDB ObjectIds. Unknown body fields are rejected (`422`).
* Auth: `Authorization: Bearer <accessToken>`. Roles: `ADMIN`, `CUSTOMER`.
* Health: `GET /health` (outside `/api/v1`, no auth, read-only). `200 { success: true, data: { status: "ok", database: "up" } }` when MongoDB answers a ping. `503 { success: false, code: "SERVICE_UNAVAILABLE", data: { status: "unavailable", database: "down" } }` when it is disconnected, errors or does not answer within 2 seconds. The body never contains connection strings, credentials or driver errors.

## Status codes and error codes

| HTTP | `code` | When |
|---|---|---|
| 400 | `WRONG_PASSWORD`, `INVALID_ID` | Wrong current password; malformed id cast |
| 401 | `AUTH_REQUIRED`, `TOKEN_INVALID`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS`, `REFRESH_INVALID`, `REFRESH_REUSED` | Missing/invalid/expired token, bad login, bad/reused refresh token |
| 403 | `ACCOUNT_INACTIVE` (or none) | Deactivated account; role not allowed; customer cancelling a non-PENDING order |
| 404 | – | Unknown route/resource; also another customer's order; inactive product for non-admins |
| 409 | `EMAIL_TAKEN`, `DUPLICATE_CATEGORY`, `DUPLICATE_SKU`, `DUPLICATE_KEY`, `CATEGORY_HAS_CHILDREN`, `CATEGORY_HAS_PRODUCTS`, `INSUFFICIENT_STOCK`, `IDEMPOTENCY_KEY_REUSED`, `INVALID_TRANSITION`, `ORDER_CONFLICT` | Conflicts with current state |
| 413 | – | Body > 100 kB |
| 422 | `VALIDATION_ERROR`, `INVALID_PARENT`, `INACTIVE_PARENT`, `SELF_PARENT`, `CIRCULAR_PARENT`, `INVALID_CATEGORY`, `INACTIVE_CATEGORY`, `PRODUCT_NOT_FOUND`, `PRODUCT_UNAVAILABLE` | Validation / business-rule failures |
| 429 | `RATE_LIMITED` | Rate limit per client IP per 15 min: 600 on `/api/v1`, 30 on login/register, and a **separate** 120 (IP) / 30 (per refresh cookie) on `/auth/refresh`. All configurable, see [AUTHENTICATION.md](AUTHENTICATION.md) |
| 500 | `INTERNAL_ERROR` | Unexpected error; details are never returned in production |

## Endpoints

Legend: 🌐 public · 🔑 any signed-in user · 👤 CUSTOMER · 🛡 ADMIN.

### Auth

| Method & path | Access | Body | Success |
|---|---|---|---|
| `POST /auth/register` | 🌐 | `{ name (2–80), email, password (8–72, upper+lower+digit) }` — `role` etc. are rejected | `201 { accessToken, user }` + refresh cookie |
| `POST /auth/login` | 🌐 | `{ email, password }` | `200 { accessToken, user }` + refresh cookie. `401 INVALID_CREDENTIALS`, `403 ACCOUNT_INACTIVE` |
| `POST /auth/refresh` | 🌐 (cookie) | – | `200 { accessToken, user }`, cookie rotated (a just-rotated cookie keeps working for `REFRESH_GRACE_SECONDS`). `401 REFRESH_INVALID` (missing, invalid or unknown session) or `REFRESH_REUSED` (stale token replayed after the grace window; that one session is revoked). Has its own rate limiter |
| `POST /auth/logout` | 🌐 (cookie) | – | `200`, cookie cleared, token revoked |
| `GET /auth/me` | 🔑 | – | `200 user` |
| `PATCH /auth/profile` | 🔑 | `{ name?, email? }` (≥ 1 field) | `200 user` |
| `PATCH /auth/change-password` | 🔑 | `{ currentPassword, newPassword }` | `200 { accessToken, user }` (all other sessions revoked) |

`user` = `{ id, name, email, role, isActive, createdAt, updatedAt }`.

### Users (🛡)

| Method & path | Query / body | Notes |
|---|---|---|
| `GET /users` | `page, limit, search (name/email), role, isActive` | Paginated, newest first |
| `GET /users/:id` | – | `404` if missing |
| `PATCH /users/:id/status` | `{ isActive: boolean }` | Only CUSTOMER accounts; not yourself (`400`); deactivating revokes refresh sessions (`403` for admin targets) |

### Categories

| Method & path | Access | Notes |
|---|---|---|
| `GET /categories/tree?includeInactive=true` | 🌐 | Nested tree `{ id, name, slug, description, parent, level, isActive, children[] }` from a single query. `includeInactive` honoured only for admins |
| `POST /categories` | 🛡 | `{ name, description?, parent?, isActive? }`. Parent must exist and be active. `409 DUPLICATE_CATEGORY` for a sibling with the same slug |
| `GET /categories` | 🛡 | `page, limit, search, parent (id or "root"), isActive` — flat list ordered by level, name |
| `GET /categories/:id` | 🛡 | Includes `parent`, `ancestors[]`, `level` |
| `GET /categories/:id/descendants` | 🛡 | All descendants (any depth), by level |
| `GET /categories/:id/ancestors` | 🛡 | Root → direct parent |
| `PATCH /categories/:id` | 🛡 | `{ name?, description?, parent? (null = make root), isActive? }`. `422 SELF_PARENT`, `422 CIRCULAR_PARENT`; moves re-path the subtree transactionally; `isActive:false` cascades to descendants; activating needs an active parent |
| `DELETE /categories/:id` | 🛡 | Only for an empty leaf. `409 CATEGORY_HAS_CHILDREN` / `CATEGORY_HAS_PRODUCTS` otherwise |

### Products

| Method & path | Access | Notes |
|---|---|---|
| `GET /products` | 🌐 (admins get extra visibility) | Query: `page, limit, search (name or SKU, case-insensitive substring), category (includes ALL descendants), minPrice, maxPrice (effective price), sortBy = price|name|createdAt (default createdAt), order = asc|desc (default desc), inStock=true, status (admin only)`. Non-admins only see ACTIVE products in active categories; out-of-stock ones are returned with `inStock:false`. `422` if `minPrice > maxPrice` |
| `GET /products/:id` | 🌐 | Populated `category`. Inactive product or inactive category → `404` for non-admins |
| `POST /products` | 🛡 | `{ name, sku, description?, price, salePrice? (null/omit, must be < price), stock (int ≥ 0), category, imageUrl? (absolute http/https URL ≤ 2048 chars; `null` or `""` clears it), status? }`. `409 DUPLICATE_SKU`; `422 INVALID_CATEGORY / INACTIVE_CATEGORY` |
| `PATCH /products/:id` | 🛡 | Any subset of the create fields (also used for stock changes) |
| `DELETE /products/:id` | 🛡 | `{ deleted, deactivated }` — hard delete when never ordered, otherwise sets `INACTIVE` |

Product JSON: `{ id, name, sku, description, price, salePrice, effectivePrice, onSale, inStock, stock, category, imageUrl (string or null), status, createdAt, updatedAt }`.

### Orders

| Method & path | Access | Notes |
|---|---|---|
| `POST /orders` | 👤 | Header `Idempotency-Key` (optional, 8–128 chars). Body `{ items: [{ productId, quantity (1–1000) }] }` (1–50 lines). `201` new order. `200` when the key was already used **with the same cart** (the original order is returned; line order and duplicate lines do not matter). `409 IDEMPOTENCY_KEY_REUSED` when the key was used with a different cart. `409 INSUFFICIENT_STOCK`, `422 PRODUCT_UNAVAILABLE / PRODUCT_NOT_FOUND`. Any price/total/name field → `422` |
| `GET /orders/my-orders` | 👤 | `page, limit, status` |
| `GET /orders/:id` | 🔑 | Owner or admin; otherwise `404` |
| `PATCH /orders/:id/cancel` | 👤 | Own order, PENDING only (else `403`/`409`). Restores stock once |
| `GET /admin/orders` | 🛡 | `page, limit, status, search (order number, customer name/email)`; `customer` populated with `{ name, email }` |
| `PATCH /admin/orders/:id/status` | 🛡 | `{ status, note? }`. `409 INVALID_TRANSITION` |
| `GET /admin/dashboard/stats` | 🛡 | `{ totalCustomers, activeCustomers, totalProducts, activeProducts, totalCategories, totalOrders, pendingOrders, revenue, ordersByStatus }` (revenue excludes CANCELLED) |

Order JSON: `{ id, orderNumber, customer, items: [{ product, name, sku, unitPrice, quantity, lineTotal }], subtotal, total, status, statusHistory: [{ status, at, by, note? }], createdAt, updatedAt }`. See [ORDER_WORKFLOW.md](ORDER_WORKFLOW.md).
