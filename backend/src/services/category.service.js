const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const { escapeRegex, slugify, isDuplicateKey } = require('../utils/helpers');
const { inTransaction } = require('../utils/transaction');

const dupSlug = () =>
  ApiError.conflict('A sibling category with this name already exists', { code: 'DUPLICATE_CATEGORY' });

async function getOrThrow(id, session) {
  const cat = await Category.findById(id).session(session || null);
  if (!cat) throw ApiError.notFound('Category not found');
  return cat;
}

async function loadParent(parentId, session) {
  const parent = await Category.findById(parentId).session(session || null);
  if (!parent) throw ApiError.unprocessable('Parent category does not exist', { code: 'INVALID_PARENT' });
  if (!parent.isActive) throw ApiError.unprocessable('Parent category is inactive', { code: 'INACTIVE_PARENT' });
  return parent;
}

async function create({ name, description = '', parent = null, isActive = true }) {
  try {
    // Transactional so that creating a child CONFLICTS with a concurrent delete/move/deactivate of the
    // parent (the parent document is touched), instead of leaving a child under a missing parent.
    return await inTransaction(async (session) => {
      let ancestors = [];
      let level = 0;
      if (parent) {
        const p = await loadParent(parent, session);
        await Category.updateOne({ _id: p._id }, { $inc: { rev: 1 } }, { session });
        ancestors = [...p.ancestors, p._id];
        level = ancestors.length;
      }
      const [created] = await Category.create(
        [{ name, slug: slugify(name) || 'category', description, parent, ancestors, level, isActive }],
        { session }
      );
      return created;
    });
  } catch (err) {
    if (isDuplicateKey(err)) throw dupSlug();
    throw err;
  }
}

async function list({ page, limit, search, parent, isActive }) {
  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive;
  if (parent === 'root') filter.parent = null;
  else if (parent) filter.parent = parent;
  if (search) filter.name = new RegExp(escapeRegex(search), 'i');
  const find = Category.find(filter)
    .sort({ level: 1, name: 1 })
    .skip((page - 1) * limit)
    .limit(limit);
  const count = Category.countDocuments(filter);
  if (search) {
    find.maxTimeMS(5000);
    count.maxTimeMS(5000);
  }
  const [items, total] = await Promise.all([find, count]);
  return { items, total };
}

/** Nested tree from ONE query: index nodes by id, then attach each to its parent. */
async function tree({ includeInactive = false } = {}) {
  const filter = includeInactive ? {} : { isActive: true };
  const rows = await Category.find(filter).sort({ name: 1 }).lean();
  const nodes = new Map();
  for (const r of rows) {
    nodes.set(String(r._id), {
      id: String(r._id),
      name: r.name,
      slug: r.slug,
      description: r.description,
      parent: r.parent ? String(r.parent) : null,
      level: r.level,
      isActive: r.isActive,
      children: [],
    });
  }
  const roots = [];
  for (const node of nodes.values()) {
    const parentNode = node.parent && nodes.get(node.parent);
    if (parentNode) parentNode.children.push(node);
    else if (!node.parent) roots.push(node);
  }
  return roots;
}

const getById = (id) => getOrThrow(id);

async function descendants(id) {
  await getOrThrow(id);
  return Category.find({ ancestors: id }).sort({ level: 1, name: 1 });
}

async function ancestors(id) {
  const cat = await getOrThrow(id);
  const rows = await Category.find({ _id: { $in: cat.ancestors } });
  const byId = new Map(rows.map((r) => [String(r._id), r]));
  return cat.ancestors.map((a) => byId.get(String(a))).filter(Boolean); // root -> parent order
}

/** Ids of the category and all of its descendants (used for product filtering). */
async function subtreeIds(id) {
  const rows = await Category.find({ ancestors: id }, { _id: 1 }).lean();
  return [new mongoose.Types.ObjectId(String(id)), ...rows.map((r) => r._id)];
}

/** Ids of every inactive category (products in them are hidden from customers). */
async function inactiveIds() {
  const rows = await Category.find({ isActive: false }, { _id: 1 }).lean();
  return rows.map((r) => r._id);
}

async function update(id, changes) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const cat = await getOrThrow(id, session);
      const moving = changes.parent !== undefined && String(changes.parent ?? '') !== String(cat.parent ?? '');

      if (changes.name !== undefined && changes.name !== cat.name) {
        cat.name = changes.name;
        cat.slug = slugify(changes.name) || 'category';
      }
      if (changes.description !== undefined) cat.description = changes.description;

      const oldDepth = cat.ancestors.length;
      let newAncestors = [...cat.ancestors];

      if (moving) {
        if (changes.parent && String(changes.parent) === String(cat._id)) {
          throw ApiError.unprocessable('A category cannot be its own parent', { code: 'SELF_PARENT' });
        }
        if (changes.parent) {
          const p = await loadParent(changes.parent, session);
          // Cycle check: the new parent must not live inside this node's own subtree.
          if (p.ancestors.some((a) => String(a) === String(cat._id))) {
            throw ApiError.unprocessable('A category cannot be moved under its own descendant', {
              code: 'CIRCULAR_PARENT',
            });
          }
          // Write-skew guard: two concurrent moves (A under B, B under A) each read the other's OLD
          // position and would both pass the check above. Touching the new parent makes any pair of
          // opposing moves write the same documents, so one transaction aborts and is retried; on retry
          // it sees the committed move and the cycle check rejects it.
          await Category.updateOne({ _id: p._id }, { $inc: { rev: 1 } }, { session });
          newAncestors = [...p.ancestors, p._id];
          cat.parent = p._id;
        } else {
          newAncestors = [];
          cat.parent = null;
        }
      }

      if (changes.isActive !== undefined) {
        if (changes.isActive && cat.parent) {
          const p = await Category.findById(cat.parent).session(session);
          if (!p || !p.isActive) {
            throw ApiError.unprocessable('Activate the parent category first', { code: 'INACTIVE_PARENT' });
          }
        }
        cat.isActive = changes.isActive;
      }

      cat.ancestors = newAncestors;
      cat.level = newAncestors.length;
      await cat.save({ session });

      // Re-path / deactivate the whole subtree in one bulk write (no per-node queries).
      const needsSubtree = moving || changes.isActive === false;
      const subtree = needsSubtree ? await Category.find({ ancestors: cat._id }).session(session) : [];
      if (subtree.length) {
        const ops = subtree.map((d) => {
          const set = {};
          if (moving) {
            const tail = d.ancestors.slice(oldDepth + 1); // path below the moved node
            set.ancestors = [...newAncestors, cat._id, ...tail];
            set.level = set.ancestors.length;
          }
          // Deactivation cascades so a visible node never hangs under a hidden parent.
          if (changes.isActive === false) set.isActive = false;
          return { updateOne: { filter: { _id: d._id }, update: { $set: set } } };
        });
        await Category.bulkWrite(ops, { session });
      }
      result = cat;
    });
    return result;
  } catch (err) {
    if (isDuplicateKey(err)) throw dupSlug();
    throw err;
  } finally {
    await session.endSession();
  }
}

/**
 * Hard delete only for an empty leaf. Otherwise the caller is told to deactivate instead.
 * The emptiness check and the delete run in one transaction; creating a child or assigning a product
 * touches this document (see create / product service), so a concurrent insert CONFLICTS with the
 * delete and the loser re-checks, rather than leaving an orphan behind a deleted category.
 */
async function remove(id) {
  await inTransaction(async (session) => {
    const cat = await getOrThrow(id, session);
    const [children, products] = await Promise.all([
      Category.countDocuments({ parent: cat._id }).session(session),
      Product.countDocuments({ category: cat._id }).session(session),
    ]);
    if (children > 0) {
      throw ApiError.conflict(
        `Category has ${children} sub-categor${children === 1 ? 'y' : 'ies'}. Move or delete them first, or deactivate this category.`,
        { code: 'CATEGORY_HAS_CHILDREN' }
      );
    }
    if (products > 0) {
      throw ApiError.conflict(
        `Category has ${products} product${products === 1 ? '' : 's'}. Reassign them first, or deactivate this category.`,
        { code: 'CATEGORY_HAS_PRODUCTS' }
      );
    }
    await Category.deleteOne({ _id: cat._id }, { session });
  });
}

module.exports = {
  create,
  list,
  tree,
  getById,
  descendants,
  ancestors,
  subtreeIds,
  inactiveIds,
  update,
  remove,
};
