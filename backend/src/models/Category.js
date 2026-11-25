const mongoose = require('mongoose');

/**
 * Unlimited-depth tree using a parent reference PLUS a materialised `ancestors` path
 * (root -> direct parent). Descendants of X are exactly `{ ancestors: X }`, resolved with
 * one indexed query, so there is no recursion and no N+1. `level` is derived metadata
 * (ancestors.length) kept in sync by the service.
 */
const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
    slug: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    ancestors: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }], default: [] },
    level: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    // Bumped inside transactions that depend on this category (child create, move target, product assignment)
    // so that a concurrent delete/move/deactivate CONFLICTS instead of both passing their checks (write skew).
    rev: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        delete ret.rev;
        return ret;
      },
    },
  }
);

// Slug is unique among siblings (also serves parent lookups via its prefix).
categorySchema.index({ parent: 1, slug: 1 }, { unique: true });
// Multikey index: descendant lookup `{ ancestors: id }`.
categorySchema.index({ ancestors: 1 });

module.exports = mongoose.model('Category', categorySchema);
