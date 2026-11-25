const svc = require('../services/product.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, pageMeta } = require('../utils/ApiResponse');

exports.create = asyncHandler(async (req, res) =>
  created(res, await svc.create(req.body), { message: 'Product created' })
);

exports.list = asyncHandler(async (req, res) => {
  const { items, total } = await svc.list(req.validQuery, req.user);
  return ok(res, items, { meta: pageMeta({ ...req.validQuery, total }) });
});

exports.get = asyncHandler(async (req, res) => ok(res, await svc.getById(req.params.id, req.user)));

exports.update = asyncHandler(async (req, res) =>
  ok(res, await svc.update(req.params.id, req.body), { message: 'Product updated' })
);

exports.remove = asyncHandler(async (req, res) => {
  const result = await svc.remove(req.params.id);
  return ok(res, result, {
    message: result.deleted ? 'Product deleted' : 'Product has order history, so it was deactivated instead',
  });
});
