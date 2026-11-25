const mongoose = require('mongoose');

const ROLES = Object.freeze({ ADMIN: 'ADMIN', CUSTOMER: 'CUSTOMER' });

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    // Normalised (trimmed + lower-cased) so the unique index is case-insensitive in practice.
    email: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 254 },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.CUSTOMER, index: true },
    isActive: { type: Boolean, default: true, index: true },
    // One entry per login (device) = one refresh-token FAMILY. Never serialised.
    //  - fid: family id, embedded in every refresh token of that login
    //  - jtiHash: SHA-256 of the CURRENT token id (token values themselves are never stored)
    //  - previous: recently rotated ids, kept only for the short grace period so concurrent
    //    refreshes / a lost response do not look like token theft
    sessions: {
      type: [
        {
          _id: false,
          fid: { type: String, required: true },
          jtiHash: { type: String, required: true },
          expiresAt: { type: Date, required: true },
          previous: { type: [{ _id: false, jtiHash: String, rotatedAt: Date }], default: [] },
        },
      ],
      select: false,
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        delete ret.sessions;
        return ret;
      },
    },
  }
);

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
