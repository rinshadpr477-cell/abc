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
const MAX_PREVIOUS = 25; // safety bound only: entries are pruned by age (grace window) on every rotation
const MAX_ROTATION_ATTEMPTS = 4;
// Compared against when the email is unknown, so login timing does not reveal valid emails.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_ROUNDS);

const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);

function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.ACCESS_TOKEN_TTL,
  });
}

function signRefreshToken(userId, fid, jti) {
  return jwt.sign({ sub: String(userId), fid, jti }, env.JWT_REFRESH_SECRET, {
    algorithm: 'HS256',
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });
}

const refreshExpiry = () => new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000);

/** Starts a NEW token family (one per login). Expired families are pruned; at most MAX_SESSIONS are kept. */
async function startFamily(userId) {
  const fid = crypto.randomUUID();
  const jti = crypto.randomUUID();
  await User.updateOne({ _id: userId }, { $pull: { sessions: { expiresAt: { $lt: new Date() } } } });
  await User.updateOne(
    { _id: userId },
    { $push: { sessions: { $each: [{ fid, jtiHash: sha256(jti), expiresAt: refreshExpiry(), previous: [] }], $slice: -MAX_SESSIONS } } }
  );
  return signRefreshToken(userId, fid, jti);
}

async function startSession(user) {
  return { accessToken: signAccessToken(user), refreshToken: await startFamily(user._id), user: user.toJSON() };
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

const invalidRefresh = () => ApiError.unauthorized('Invalid or expired refresh token', { code: 'REFRESH_INVALID' });

/**
 * Refresh-token rotation with a short grace period.
 *
 * Each login owns one token FAMILY (`fid`). The current token id is stored hashed. Using the current
 * token rotates it (compare-and-swap on the stored hash) and remembers the old id in `previous`.
 *
 *  - current token                          -> rotate
 *  - a previous id used within the grace    -> rotate again (concurrent tab / lost response). The
 *    period (REFRESH_GRACE_SECONDS)            retry gets a fresh valid token and the family continues.
 *  - a previous id used AFTER the grace     -> reuse = possible theft: revoke THIS family only
 *    period, or an id the family never had     (other devices stay signed in)
 *  - family unknown (logged out / revoked / password changed / deactivated) -> plain 401, nothing else revoked
 *
 * A grace-period token is only accepted for REFRESH_GRACE_SECONDS after it was rotated, so a
 * stolen-then-replayed token stops working shortly after the legitimate client moved on.
 */
async function refresh(token) {
  if (!token) throw ApiError.unauthorized('Refresh token missing', { code: 'REFRESH_INVALID' });
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
  } catch {
    throw invalidRefresh();
  }
  const { sub: userId, fid, jti } = payload;
  if (!fid || !jti) throw invalidRefresh(); // tokens issued before families existed
  const presented = sha256(jti);

  for (let attempt = 0; attempt < MAX_ROTATION_ATTEMPTS; attempt++) {
    const user = await User.findById(userId).select('+sessions');
    const session = user && user.sessions.find((s) => s.fid === fid);
    if (!session || session.expiresAt < new Date()) throw invalidRefresh();

    const now = Date.now();
    const isCurrent = session.jtiHash === presented;
    const inGrace = (session.previous || []).some((p) => p.jtiHash === presented && now - p.rotatedAt.getTime() <= env.refreshGraceMs);

    if (!isCurrent && !inGrace) {
      await User.updateOne({ _id: userId }, { $pull: { sessions: { fid } } }); // this family only
      throw ApiError.unauthorized('Refresh token is no longer valid', { code: 'REFRESH_REUSED' });
    }
    if (!user.isActive) throw ApiError.forbidden('Your account has been deactivated', { code: 'ACCOUNT_INACTIVE' });

    const newJti = crypto.randomUUID();
    const previous = [
      ...(session.previous || []).filter((p) => now - p.rotatedAt.getTime() <= env.refreshGraceMs),
      { jtiHash: session.jtiHash, rotatedAt: new Date(now) },
    ].slice(-MAX_PREVIOUS);

    // Compare-and-swap: only succeeds if nobody rotated this family since we read it.
    const swapped = await User.updateOne(
      { _id: userId, sessions: { $elemMatch: { fid, jtiHash: session.jtiHash } } },
      { $set: { 'sessions.$.jtiHash': sha256(newJti), 'sessions.$.expiresAt': refreshExpiry(), 'sessions.$.previous': previous } }
    );
    if (swapped.modifiedCount === 1) {
      return { accessToken: signAccessToken(user), refreshToken: signRefreshToken(userId, fid, newJti), user: user.toJSON() };
    }
    // Lost the race to a concurrent refresh: re-read; our token is now a "previous" id inside the grace window.
  }
  throw invalidRefresh();
}

async function logout(token) {
  if (!token) return;
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'], ignoreExpiration: true });
    if (payload.fid) await User.updateOne({ _id: payload.sub }, { $pull: { sessions: { fid: payload.fid } } });
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
