# Database Schema

MongoDB database `ecommerce` (set by `MONGODB_URI`), accessed through Mongoose 9. Four collections. A **replica set** is required because orders, cancellations and category moves use multi-document transactions. Model files: `api/src/models/`.

## `users`

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `name` | String | required, 2–80, trimmed |
| `email` | String | required, trimmed, **lower-cased**, **unique** |
| `password` | String | bcrypt hash, `select: false`, never serialised |
| `role` | `ADMIN` \| `CUSTOMER` | default `CUSTOMER`; only settable by the seed script |
| `isActive` | Boolean | default `true` |
| `sessions` | `[{ fid, jtiHash, expiresAt, previous: [{ jtiHash, rotatedAt }] }]` | one entry per login = one refresh-token family (max 5 kept): the family id, the SHA-256 of the **current** token id, and recently rotated ids honoured only during the grace period. Token values are never stored. `select: false`, never serialised |
| `createdAt`, `updatedAt` | Date | |

Indexes: unique `email`; `role`; `isActive`.

## `categories`

| Field | Type | Notes |
|---|---|---|
| `name` | String | required, ≤ 100 |
| `slug` | String | derived from name |
| `description` | String | ≤ 1000 |
| `parent` | ObjectId → `categories` | `null` for roots |
| `ancestors` | `[ObjectId]` | materialised path, root → direct parent |
| `level` | Number | derived: `ancestors.length` (root = 0) |
| `isActive` | Boolean | default `true` |
| `rev` | Number | internal counter bumped inside transactions that depend on the category (creating a child, moving something under it, assigning a product to it). It makes a concurrent delete / move / deactivate **conflict** instead of both passing their checks. Never serialised |

Indexes: **unique `(parent, slug)`** (sibling names are unique, same name allowed under different parents); multikey **`ancestors`**.

### Hierarchy design

Adjacency (`parent`) plus a materialised path (`ancestors`), no depth limit.

* **Descendants** of X: `find({ ancestors: X })` — one indexed query at any depth. Used for the admin descendants endpoint and for product filtering (`category ∈ {X} ∪ descendants`).
* **Tree**: one query for all categories, nested in memory via an id→node map (no per-node queries).
* **Create**: `ancestors = parent.ancestors + [parent]`; parent must exist and be active.
* **Move** (`PATCH parent`) inside a transaction: reject `parent == self` (`SELF_PARENT`) and any new parent whose `ancestors` contain the node (`CIRCULAR_PARENT`); then rewrite `ancestors`/`level` of the node and its whole subtree with one `bulkWrite`. The new parent is also written to (`rev`), so two concurrent opposing moves (A under B and B under A) write the same documents: one transaction conflicts and is retried, and on retry the cycle check rejects it. At most one of two incompatible moves can succeed.
* **Create child / delete / assign product** are transactional for the same reason: deleting a category re-checks "no children, no products" inside the transaction, and creating a child or assigning a product touches the category, so a concurrent insert cannot slip in beside the delete and leave an orphan.
* **Deactivate** cascades to every descendant; **activate** requires an active parent. **Delete** only empty leaves (no children, no products).

## `products`

| Field | Type | Notes |
|---|---|---|
| `name` | String | required, 2–200 |
| `sku` | String | required, **unique**, upper-cased |
| `description` | String | ≤ 5000 |
| `price` | Number | ≥ 0 |
| `salePrice` | Number \| null | must be `< price` to be valid |
| `imageUrl` | String \| null | optional external image link, absolute `http`/`https` only, ≤ 2048 chars; absent on products created before the field existed (serialised as `null`). No image is uploaded or stored by the API |
| `effectivePrice` | Number | maintained by a pre-validate hook: `salePrice` when `0 ≤ salePrice < price`, else `price`. This is the price charged and the field used for price filters/sorting |
| `stock` | Integer | ≥ 0 |
| `category` | ObjectId → `categories` | required; must reference an active category on create/move |
| `status` | `ACTIVE` \| `INACTIVE` | default `ACTIVE` |

Indexes: unique `sku`; `(category, status)`; `(status, effectivePrice)`; `createdAt`; `name`. Search is a case-insensitive, regex-escaped **substring** match on `name` and `sku` (max 100 characters). Unanchored substring regexes cannot use an index, so these queries scan the collection; they are bounded by a 5-second server-side `maxTimeMS`. See "Known limitations" in the README.

## `orders`

| Field | Type | Notes |
|---|---|---|
| `orderNumber` | String | **unique**, `ORD-YYYYMMDD-XXXXXXXX` |
| `customer` | ObjectId → `users` | |
| `idempotencyKey` | String | optional, never serialised |
| `idempotencyHash` | String | SHA-256 of the normalised cart (product ids + quantities) the key was first used with; a reused key with a different cart is rejected. Never serialised |
| `items[]` | `{ product, name, sku, unitPrice, quantity, lineTotal }` | name/SKU/price **snapshots** taken in the transaction |
| `subtotal`, `total` | Number | computed by the API (`total = subtotal`) |
| `status` | `PENDING`, `CONFIRMED`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED` | default `PENDING` |
| `statusHistory[]` | `{ status, at, by, note? }` | appended on every change |
| `stockRestored` | Boolean | internal guard making stock restoration at-most-once; not serialised |

Indexes: unique `orderNumber`; `(customer, createdAt desc)`; `(status, createdAt desc)`; `createdAt desc`; **unique partial `(customer, idempotencyKey)`** (only where the key is a string).

## Relationships

```
users 1 ──< orders >── items ──> products >── 1 categories ──< categories (parent / ancestors)
```

Orders reference products only as history (plus snapshots), so editing or deactivating a product never changes past orders; deleting an ordered product is replaced by deactivation.
