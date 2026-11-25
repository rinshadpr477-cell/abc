const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Category = require('../models/Category');
const User = require('../models/User');
const { ORDER_STATUS } = require('../models/Order');
const { PRODUCT_STATUS } = require('../models/Product');
const ApiError = require('../utils/ApiError');
const { escapeRegex, isDuplicateKey, sha256 } = require('../utils/helpers');

const S = ORDER_STATUS;

const CUSTOMER_SEARCH_CAP = 200;
const SEARCH_MAX_TIME_MS = 5000;

/** Forward workflow. CANCELLED is reachable only through the cancellation rules below. */
const TRANSITIONS = Object.freeze({
  [S.PENDING]: [S.CONFIRMED, S.CANCELLED],
  [S.CONFIRMED]: [S.PROCESSING, S.CANCELLED],
  [S.PROCESSING]: [S.SHIPPED, S.CANCELLED],
  [S.SHIPPED]: [S.DELIVERED],
  [S.DELIVERED]: [],
  [S.CANCELLED]: [],
});

/**
 * Cancellation policy
 *  - CUSTOMER: only their own order, only while PENDING.
 *  - ADMIN: any order up to (and including) PROCESSING; never once SHIPPED/DELIVERED.
 *  - Stock reserved at placement is restored exactly once, in the same transaction as the status change.
 */
const CUSTOMER_CANCELLABLE = [S.PENDING];

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const newOrderNumber = () => {
  const d = new Date();
  const day = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `ORD-${day}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
};

/** Explains why a conditional stock decrement matched nothing. */
async function explainStockFailure(productId, quantity, session) {
  const p = await Product.findById(productId).session(session);
  if (!p) return ApiError.unprocessable('A product in your order no longer exists', { code: 'PRODUCT_NOT_FOUND' });
  if (p.status !== PRODUCT_STATUS.ACTIVE) {
    return ApiError.unprocessable(`"${p.name}" is not available`, { code: 'PRODUCT_UNAVAILABLE' });
  }
  return ApiError.conflict(`Insufficient stock for "${p.name}" (requested ${quantity}, available ${p.stock})`, {
    code: 'INSUFFICIENT_STOCK',
  });
}

/** Same key + same cart returns the original order; same key + different cart is a client error. */
function replayFor(existing, idempotencyHash) {
  // Orders stored before the hash existed have none; they are treated as a match.
  if (existing.idempotencyHash && existing.idempotencyHash !== idempotencyHash) {
    throw ApiError.conflict('This Idempotency-Key was already used with a different order. Use a new key for a new order.', {
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
  }
  return { order: existing, replayed: true };
}

async function placeOrder(customerId, rawItems, idempotencyKey) {
  // Merge duplicate lines for the same product (ids compared case-insensitively).
  const wanted = new Map();
  for (const { productId, quantity } of rawItems) {
    const id = productId.toLowerCase();
    wanted.set(id, (wanted.get(id) || 0) + quantity);
  }
  // Deterministic order avoids lock-order deadlocks between concurrent multi-product orders.
  const lines = [...wanted.entries()].sort(([a], [b]) => a.localeCompare(b));
  // Fingerprint of the normalised cart (order of lines and duplicate lines do not matter).
  const idempotencyHash = sha256(lines.map(([id, qty]) => id + ':' + qty).join('|'));

  if (idempotencyKey) {
    const existing = await Order.findOne({ customer: customerId, idempotencyKey });
    if (existing) return replayFor(existing, idempotencyHash);
  }

  const session = await mongoose.startSession();
  try {
    let order;
    await session.withTransaction(async () => {
      const items = [];
      for (const [productId, quantity] of lines) {
        // Atomic check-and-decrement: matches only if the product is ACTIVE and has enough stock,
        // so concurrent buyers can never push stock below zero.
        const product = await Product.findOneAndUpdate(
          { _id: productId, status: PRODUCT_STATUS.ACTIVE, stock: { $gte: quantity } },
          { $inc: { stock: -quantity } },
          { returnDocument: 'after', session }
        );
        if (!product) throw await explainStockFailure(productId, quantity, session);

        const category = await Category.findById(product.category).session(session);
        if (!category || !category.isActive) {
          throw ApiError.unprocessable(`"${product.name}" is not available`, { code: 'PRODUCT_UNAVAILABLE' });
        }

        // Price comes from the database, never from the client.
        items.push({
          product: product._id,
          name: product.name,
          sku: product.sku,
          unitPrice: product.effectivePrice,
          quantity,
          lineTotal: round2(product.effectivePrice * quantity),
        });
      }
      const subtotal = round2(items.reduce((sum, i) => sum + i.lineTotal, 0));

      // withTransaction may retry this callback, so a fresh order number is generated each attempt.
      const [doc] = await Order.create(
        [
          {
            orderNumber: newOrderNumber(),
            customer: customerId,
            idempotencyKey,
            idempotencyHash: idempotencyKey ? idempotencyHash : undefined,
            items,
            subtotal,
            total: subtotal,
            status: S.PENDING,
            statusHistory: [{ status: S.PENDING, by: customerId }],
          },
        ],
        { session }
      );
      order = doc;
    });
    return { order, replayed: false };
  } catch (err) {
    // Two simultaneous submissions with the same key: the loser's transaction (incl. its stock
    // decrement) rolled back; return the winner's order.
    if (idempotencyKey && isDuplicateKey(err, 'idempotencyKey')) {
      const existing = await Order.findOne({ customer: customerId, idempotencyKey });
      if (existing) return replayFor(existing, idempotencyHash);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

async function listMine(customerId, { page, limit, status }) {
  const filter = { customer: customerId };
  if (status) filter.status = status;
  const [items, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments(filter),
  ]);
  return { items, total };
}

async function listAll({ page, limit, status, search }) {
  const filter = {};
  if (status) filter.status = status;
  if (search) {
    if (/^ord-/i.test(search)) {
      // Looks like an order number: anchored prefix match, served by the unique orderNumber index.
      filter.orderNumber = new RegExp('^' + escapeRegex(search), 'i');
    } else {
      const rx = new RegExp(escapeRegex(search), 'i');
      // Bounded pre-lookup: at most CUSTOMER_SEARCH_CAP (most recent) matching customers are considered,
      // so a broad term cannot load every user into memory. Refine the search to narrow further.
      const users = await User.find({ $or: [{ name: rx }, { email: rx }] }, { _id: 1 })
        .sort({ createdAt: -1 })
        .limit(CUSTOMER_SEARCH_CAP)
        .maxTimeMS(SEARCH_MAX_TIME_MS)
        .lean();
      filter.$or = [{ orderNumber: rx }, { customer: { $in: users.map((u) => u._id) } }];
    }
  }
  const find = Order.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('customer', 'name email');
  const count = Order.countDocuments(filter);
  if (search) {
    find.maxTimeMS(SEARCH_MAX_TIME_MS);
    count.maxTimeMS(SEARCH_MAX_TIME_MS);
  }
  const [items, total] = await Promise.all([find, count]);
  return { items, total };
}

/** Customers only get their own orders; someone else's order is indistinguishable from a missing one. */
async function getForViewer(id, viewer) {
  const order = await Order.findById(id).populate('customer', 'name email');
  const ownerId = order && (order.customer._id || order.customer);
  if (!order || (viewer.role !== 'ADMIN' && String(ownerId) !== String(viewer._id))) {
    throw ApiError.notFound('Order not found');
  }
  return order;
}

/**
 * Atomic status change. The update only matches while the order is still in `from`, so two racing
 * requests cannot both apply, and (for cancellations) stockRestored guards a second restore.
 */
async function transition(orderId, to, actor, note) {
  const session = await mongoose.startSession();
  try {
    let updated;
    await session.withTransaction(async () => {
      const current = await Order.findById(orderId).session(session);
      if (!current) throw ApiError.notFound('Order not found');

      const isAdmin = actor.role === 'ADMIN';
      if (!isAdmin && String(current.customer) !== String(actor._id)) throw ApiError.notFound('Order not found');
      if (!isAdmin && (to !== S.CANCELLED || !CUSTOMER_CANCELLABLE.includes(current.status))) {
        throw ApiError.forbidden(
          to === S.CANCELLED
            ? 'This order can no longer be cancelled by the customer'
            : 'Customers cannot change order status'
        );
      }
      if (!TRANSITIONS[current.status].includes(to)) {
        throw ApiError.conflict(`Cannot change order status from ${current.status} to ${to}`, {
          code: 'INVALID_TRANSITION',
        });
      }

      const cancelling = to === S.CANCELLED;
      const guard = { _id: current._id, status: current.status };
      if (cancelling) guard.stockRestored = { $ne: true };

      const historyEntry = { status: to, at: new Date(), by: actor._id };
      if (note) historyEntry.note = note;
      updated = await Order.findOneAndUpdate(
        guard,
        { $set: { status: to, ...(cancelling ? { stockRestored: true } : {}) }, $push: { statusHistory: historyEntry } },
        { returnDocument: 'after', session }
      );
      if (!updated) {
        throw ApiError.conflict('Order was modified by another request, please retry', { code: 'ORDER_CONFLICT' });
      }

      if (cancelling) {
        await Product.bulkWrite(
          current.items.map((i) => ({ updateOne: { filter: { _id: i.product }, update: { $inc: { stock: i.quantity } } } })),
          { session }
        );
      }
    });
    return updated;
  } finally {
    await session.endSession();
  }
}

const adminUpdateStatus = (orderId, to, actor, note) => transition(orderId, to, actor, note);
const customerCancel = (orderId, actor) => transition(orderId, S.CANCELLED, actor);

module.exports = {
  TRANSITIONS,
  placeOrder,
  listMine,
  listAll,
  getForViewer,
  adminUpdateStatus,
  customerCancel,
};
