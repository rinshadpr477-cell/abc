const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');
const { PRODUCT_STATUS } = require('../models/Product');
const ApiError = require('../utils/ApiError');
const { escapeRegex, isDuplicateKey } = require('../utils/helpers');
const { inTransaction } = require('../utils/transaction');
const categoryService = require('./category.service');

const dupSku = () => ApiError.conflict('A product with this SKU already exists', { code: 'DUPLICATE_SKU' });

// Upper bound for a search query (regex scans are not indexable); a runaway scan is aborted by the server.
const SEARCH_MAX_TIME_MS = 5000;

/**
 * Validates the category AND touches it inside the caller's transaction. The touch makes this
 * assignment conflict with a concurrent delete / deactivate / move of the same category, so a product
 * can never be committed against a category that was removed at the same moment.
 */
async function assertAndLockCategory(categoryId, session) {
  const cat = await Category.findById(categoryId).session(session);
  if (!cat) throw ApiError.unprocessable('Category does not exist', { code: 'INVALID_CATEGORY' });
  if (!cat.isActive) throw ApiError.unprocessable('Category is inactive', { code: 'INACTIVE_CATEGORY' });
  await Category.updateOne({ _id: cat._id }, { $inc: { rev: 1 } }, { session });
}

async function create(data) {
  try {
    return await inTransaction(async (session) => {
      await assertAndLockCategory(data.category, session);
      const [product] = await Product.create([data], { session });
      return product;
    });
  } catch (err) {
    if (isDuplicateKey(err)) throw dupSku();
    throw err;
  }
}

// Loaded + saved (not findOneAndUpdate) so the pre-validate hook keeps effectivePrice correct.
async function update(id, changes) {
  try {
    return await inTransaction(async (session) => {
      const product = await Product.findById(id).session(session);
      if (!product) throw ApiError.notFound('Product not found');
      if (changes.category && String(changes.category) !== String(product.category)) {
        await assertAndLockCategory(changes.category, session);
      }
      product.set(changes);
      return product.save({ session });
    });
  } catch (err) {
    if (isDuplicateKey(err)) throw dupSku();
    throw err;
  }
}

/**
 * Customers (and anonymous visitors) only ever see ACTIVE products in active categories.
 * Out-of-stock products stay visible (flagged inStock:false, not orderable) unless inStock=true.
 * Admins may filter by status and see everything.
 */
async function list(query, viewer) {
  const isAdmin = viewer && viewer.role === 'ADMIN';
  const { page, limit, search, category, minPrice, maxPrice, sortBy, order, status, inStock } = query;
  const filter = {};

  if (isAdmin) {
    if (status) filter.status = status;
  } else {
    filter.status = PRODUCT_STATUS.ACTIVE;
  }

  const categoryCond = {};
  if (category) {
    // Descendant-aware: the category itself plus its whole subtree, resolved server-side.
    categoryCond.$in = await categoryService.subtreeIds(category);
  }
  if (!isAdmin) {
    const hidden = await categoryService.inactiveIds();
    if (hidden.length) categoryCond.$nin = hidden;
  }
  if (Object.keys(categoryCond).length) filter.category = categoryCond;

  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { sku: rx }];
  }
  if (minPrice != null || maxPrice != null) {
    filter.effectivePrice = {};
    if (minPrice != null) filter.effectivePrice.$gte = minPrice;
    if (maxPrice != null) filter.effectivePrice.$lte = maxPrice;
  }
  if (inStock === true) filter.stock = { $gt: 0 };

  const sortField = sortBy === 'price' ? 'effectivePrice' : sortBy;
  const dir = order === 'asc' ? 1 : -1;
  const sort = { [sortField]: dir, _id: dir }; // _id tiebreaker keeps pagination stable

  const find = Product.find(filter)
    .sort(sort)
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('category', 'name slug');
  const count = Product.countDocuments(filter);
  if (search) {
    find.maxTimeMS(SEARCH_MAX_TIME_MS);
    count.maxTimeMS(SEARCH_MAX_TIME_MS);
  }
  const [items, total] = await Promise.all([find, count]);
  return { items, total };
}

async function getById(id, viewer) {
  const product = await Product.findById(id).populate('category', 'name slug isActive ancestors');
  const isAdmin = viewer && viewer.role === 'ADMIN';
  if (!product || (!isAdmin && (product.status !== PRODUCT_STATUS.ACTIVE || !product.category || !product.category.isActive))) {
    throw ApiError.notFound('Product not found');
  }
  return product;
}

/**
 * Hard delete when never ordered; otherwise deactivate so order history stays intact.
 * Runs in one transaction and writes the product document either way, so it CONFLICTS with a
 * concurrent order (which decrements this product's stock): the loser re-checks. A product can
 * therefore not be hard-deleted in the same instant an order for it commits.
 */
async function remove(id) {
  return inTransaction(async (session) => {
    const product = await Product.findById(id).session(session);
    if (!product) throw ApiError.notFound('Product not found');
    const ordered = await Order.exists({ 'items.product': product._id }).session(session);
    if (ordered) {
      product.status = PRODUCT_STATUS.INACTIVE;
      await product.save({ session });
      return { deleted: false, deactivated: true };
    }
    await Product.deleteOne({ _id: product._id }, { session });
    return { deleted: true, deactivated: false };
  });
}

module.exports = { create, update, list, getById, remove };
