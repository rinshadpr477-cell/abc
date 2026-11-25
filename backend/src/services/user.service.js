const User = require('../models/User');
const { ROLES } = require('../models/User');
const ApiError = require('../utils/ApiError');
const { escapeRegex } = require('../utils/helpers');

async function list({ page, limit, search, role, isActive }) {
  const filter = {};
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);
  return { items, total };
}

async function getById(id) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

async function setStatus(actor, id, isActive) {
  const user = await getById(id);
  if (String(user._id) === String(actor._id)) throw ApiError.badRequest('You cannot change your own status');
  if (user.role !== ROLES.CUSTOMER) throw ApiError.forbidden('Only customer accounts can be activated or deactivated');
  user.isActive = isActive;
  if (!isActive) user.sessions = []; // revoke refresh tokens; access tokens die at next request
  await user.save();
  return user;
}

module.exports = { list, getById, setStatus };
