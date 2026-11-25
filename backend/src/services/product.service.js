const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');
const { PRODUCT_STATUS } = require('../models/Product');
const ApiError = require('../utils/ApiError');
const { escapeRegex, isDuplicateKey } = require('../utils/helpers');
const categoryService = require('./category.service');

const dupSku = () => ApiError.conflict('A product with this SKU already exists', { code: 'DUPLICATE_SKU' });

async function assertAssignableCategory(categoryId) {
  const cat = await Category.findById(categoryId);
  if (!cat) throw ApiError.unprocessable('Category does not exist', { code: 'INVALID_CATEGORY' });
  if (!cat.isActive) throw ApiError.unprocessable('Category is inactive', { code: 'INACTIVE_CATEGORY' });
}

async function create(data) {
  await assertAssignableCategory(data.category);
  try {
    return await Product.create(data);
  } catch (err) {
    if (isDuplicateKey(err)) throw dupSku();
    throw err;
  }
}

// Loaded + saved (not findOneAndUpdate) so the pre-validate hook keeps effectivePrice correct.
async function update(id, changes) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');
  if (changes.category && String(changes.category) !== String(product.category)) {
    await assertAssignableCategory(changes.category);
  }
  product.set(changes);
  try {
    return await product.save();
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

  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('category', 'name slug'),
    Product.countDocuments(filter),
  ]);
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

/** Hard delete when never ordered; otherwise deactivate so order history stays intact. */
async function remove(id) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound('Product not found');
  const ordered = await Order.exists({ 'items.product': product._id });
  if (ordered) {
    product.status = PRODUCT_STATUS.INACTIVE;
    await product.save();
    return { deleted: false, deactivated: true };
  }
  await Product.deleteOne({ _id: product._id });
  return { deleted: true, deactivated: false };
}

module.exports = { create, update, list, getById, remove };
