# Order Workflow

Implementation: `api/src/services/order.service.js`. Tests: `api/src/tests/integration/order.test.js`.

## 1. Cart (admin app, storefront side)

The cart lives in the browser and stores only `{ productId, quantity }` pairs. Prices, names and stock shown in the cart and at checkout are re-fetched from the API (`GET /products/:id`) and are display-only. They are never sent to the API, and the API rejects any order body that contains them.

## 2. Placing an order — `POST /orders` (CUSTOMER)

Request: `{ "items": [{ "productId": "…", "quantity": 2 }] }` (1–50 lines, quantity 1–1000, unknown fields → `422`) with optional header `Idempotency-Key`.

1. Duplicate lines for the same product are merged; lines are sorted by product id so concurrent multi-product orders touch documents in the same order.
2. If an `Idempotency-Key` was supplied and an order already exists for `(customer, key)`: the same normalised cart returns that order with `200`; a **different** cart is rejected with `409 IDEMPOTENCY_KEY_REUSED` (see below). Product ids are compared case-insensitively.
3. One MongoDB transaction (`session.withTransaction`, which retries transient write conflicts) runs, per line:
   * **Atomic stock decrement:** `findOneAndUpdate({ _id, status: 'ACTIVE', stock: { $gte: quantity } }, { $inc: { stock: -quantity } })`. If it matches nothing the line fails: product missing → `422 PRODUCT_NOT_FOUND`; inactive → `422 PRODUCT_UNAVAILABLE`; not enough stock → `409 INSUFFICIENT_STOCK` (message states requested vs available). Because check and decrement are one atomic operation, concurrent buyers can never push stock below zero.
   * The product's category must still be active (else `422 PRODUCT_UNAVAILABLE`).
   * Unit price = the product's current `effectivePrice` (sale price only when valid). `lineTotal = round2(unitPrice × quantity)`.
4. `subtotal` = sum of line totals; `total = subtotal` (no tax/shipping). The order is created `PENDING` with a history entry and name/SKU/unit-price snapshots.
5. Any error aborts the transaction: **all stock decrements roll back and no order exists.** (Covered by tests: failure on a later line; failure while creating the order document.)

Response `201` with the order. Order numbers look like `ORD-20261125-A21AC30D` (unique index).

### Duplicate submission protection

`Idempotency-Key` + unique partial index `(customer, idempotencyKey)`, plus a stored fingerprint of the cart (`idempotencyHash` = SHA-256 of the normalised product ids and quantities; line order and duplicate lines do not matter).

* Same key, same cart: the original order is returned (`200`), also for sequential retries.
* If several identical requests race, one transaction commits and the others hit the unique index; they roll back (including their stock decrement) and the API answers with the committed order.
* Same key, **different** cart: `409 IDEMPOTENCY_KEY_REUSED`, nothing is created and no stock changes. When requests with the same key but different carts race, exactly one order is created and the others get `409`.
* A failed attempt (for example `INSUFFICIENT_STOCK`) does not consume the key; the retry can succeed once the problem is fixed.

The storefront derives one key per distinct cart (`frontend/src/lib/checkout-key.ts`), reuses it when the same cart is retried, creates a new one when the cart changes, and clears it after a successful order.

## 3. Lifecycle

```
PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED
   │          │           │
   └──────────┴───────────┴──→ CANCELLED
```

| From | Allowed next |
|---|---|
| PENDING | CONFIRMED, CANCELLED |
| CONFIRMED | PROCESSING, CANCELLED |
| PROCESSING | SHIPPED, CANCELLED |
| SHIPPED | DELIVERED |
| DELIVERED, CANCELLED | – (terminal) |

Anything else (skipping, going backwards, leaving a terminal state) → `409 INVALID_TRANSITION`. Each change is a guarded atomic update `findOneAndUpdate({ _id, status: <expected> })` that also pushes `{ status, at, by, note? }` onto `statusHistory`; if another request changed the order first it fails with `409 ORDER_CONFLICT`.

Who may change status:

* **Admin:** `PATCH /admin/orders/:id/status` — any allowed transition above.
* **Customer:** only `PATCH /orders/:id/cancel`, only on their own order, only while `PENDING` (`403` otherwise; someone else's order is `404`). Customers cannot call the admin endpoint (`403`).

## 4. Cancellation and stock restoration

Cancelling (by admin up to PROCESSING, or by the customer while PENDING) runs in one transaction that (a) moves the order to `CANCELLED` using the guarded update, which additionally requires `stockRestored != true` and sets it to `true`, and (b) `$inc`s every line's quantity back onto its product. Both the status guard (CANCELLED is terminal) and the flag mean stock is restored **exactly once**: repeated or concurrent cancels get `409`, and a test fires four simultaneous cancels and asserts one success and stock back to its original value. Orders that are SHIPPED or DELIVERED cannot be cancelled.

## 5. Visibility

* Customers: `GET /orders/my-orders`, `GET /orders/:id` (ownership enforced in the service).
* Admins: `GET /admin/orders` (filter by status, search by number/customer) and any order by id.
* Revenue on the dashboard = sum of `total` of non-cancelled orders.
