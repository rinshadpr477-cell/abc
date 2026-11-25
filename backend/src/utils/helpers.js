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

module.exports = { escapeRegex, slugify, sha256, isDuplicateKey };
