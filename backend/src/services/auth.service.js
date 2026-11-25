const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/environment');
const User = require('../models/User');
const { ROLES } = require('../models/User');
const ApiError = require('../utils/ApiError');
const { sha256, isDuplicateKey } = require('../utils/helpers');

const BCRYPT_ROUNDS = env.isTest ? 4 : 12;
const MAX_SESSIONS = 5;
// Compared against when the email is unknown, so login timing does not reveal valid emails.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);

function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.ACCESS_TOKEN_TTL,
  });
}

/** Issues a refresh token and records its hashed jti on the user (rotation bookkeeping). */
async function issueRefreshToken(userId) {
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000);
  const token = jwt.sign({ sub: String(userId), jti }, env.JWT_REFRESH_SECRET, {
    algorithm: 'HS256',
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });
  await User.updateOne(
    { _id: userId },
    { $push: { sessions: { $each: [{ jtiHash: sha256(jti), expiresAt }], $slice: -MAX_SESSIONS } } }
  );
  return token;
}

async function startSession(user) {
  const [accessToken, refreshToken] = [signAccessToken(user), await issueRefreshToken(user._id)];
  return { accessToken, refreshToken, user: user.toJSON() };
}

async function register({ name, email, password }) {
  try {
    const user = await User.create({ name, email, password: await hashPassword(password), role: ROLES.CUSTOMER });
    return startSession(user);
  } catch (err) {
    if (isDuplicateKey(err)) throw ApiError.conflict('An account with this email already exists', { code: 'EMAIL_TAKEN' });
    throw err;
  }
}

async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+password');
  const ok = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
  if (!user || !ok) throw ApiError.unauthorized('Invalid email or password', { code: 'INVALID_CREDENTIALS' });
  if (!user.isActive) throw ApiError.forbidden('Your account has been deactivated', { code: 'ACCOUNT_INACTIVE' });
  return startSession(user);
}

/**
 * Rotating refresh: the presented jti must be a live session; it is consumed atomically and a
 * new one issued. A valid-signature token whose jti is NOT live means reuse of a rotated/revoked
 * token — every session of that user is revoked.
 */
async function refresh(token) {
  if (!token) throw ApiError.unauthorized('Refresh token missing', { code: 'REFRESH_INVALID' });
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token', { code: 'REFRESH_INVALID' });
  }

  const consumed = await User.findOneAndUpdate(
    { _id: payload.sub, 'sessions.jtiHash': sha256(payload.jti) },
    { $pull: { sessions: { jtiHash: sha256(payload.jti) } } },
    { returnDocument: 'after' }
  );
  if (!consumed) {
    await User.updateOne({ _id: payload.sub }, { $set: { sessions: [] } });
    throw ApiError.unauthorized('Refresh token is no longer valid', { code: 'REFRESH_REUSED' });
  }
  if (!consumed.isActive) throw ApiError.forbidden('Your account has been deactivated', { code: 'ACCOUNT_INACTIVE' });
  return startSession(consumed);
}

async function logout(token) {
  if (!token) return;
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'], ignoreExpiration: true });
    await User.updateOne({ _id: payload.sub }, { $pull: { sessions: { jtiHash: sha256(payload.jti) } } });
  } catch {
    /* invalid token: nothing to revoke */
  }
}

async function updateProfile(user, { name, email }) {
  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
  try {
    await user.save();
  } catch (err) {
    if (isDuplicateKey(err)) throw ApiError.conflict('An account with this email already exists', { code: 'EMAIL_TAKEN' });
    throw err;
  }
  return user.toJSON();
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+password');
  if (!(await bcrypt.compare(currentPassword, user.password))) {
    throw ApiError.badRequest('Current password is incorrect', { code: 'WRONG_PASSWORD' });
  }
  user.password = await hashPassword(newPassword);
  user.sessions = []; // sign out every other device
  await user.save();
  return startSession(user);
}

module.exports = { register, login, refresh, logout, updateProfile, changePassword, hashPassword };
