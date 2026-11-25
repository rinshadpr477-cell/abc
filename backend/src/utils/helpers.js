const crypto = require('crypto');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const slugify = (s) =>
  s
    .toString()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const isDuplicateKey = (err, indexHint) =>
  !!err &&
  (err.code === 11000 || (err.cause && err.cause.code === 11000)) &&
  (!indexHint || String(err.message).includes(indexHint));

/** True for absolute http/https URLs only (rejects javascript:, data:, ftp:, file:, relative paths). */
const isHttpUrl = (value) => {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
  } catch {
    return false;
  }
};

module.exports = { escapeRegex, slugify, sha256, isDuplicateKey, isHttpUrl };
