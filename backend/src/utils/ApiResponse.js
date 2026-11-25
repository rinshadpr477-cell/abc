/** Standard success envelope: { success, message?, data, meta? } */
function send(res, statusCode, data, { message, meta } = {}) {
  const body = { success: true };
  if (message) body.message = message;
  body.data = data === undefined ? null : data;
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

const ok = (res, data, opts) => send(res, 200, data, opts);
const created = (res, data, opts) => send(res, 201, data, opts);

function pageMeta({ page, limit, total }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 };
}

module.exports = { send, ok, created, pageMeta };
