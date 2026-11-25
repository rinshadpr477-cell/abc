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
    // Hashed jti of each live refresh token (rotation + revocation). Never serialised.
    sessions: {
      type: [{ _id: false, jtiHash: String, expiresAt: Date }],
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
