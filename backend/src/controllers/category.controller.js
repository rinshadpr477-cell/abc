const svc = require('../services/category.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, pageMeta } = require('../utils/ApiResponse');

exports.create = asyncHandler(async (req, res) =>
  created(res, await svc.create(req.body), { message: 'Category created' })
);

exports.list = asyncHandler(async (req, res) => {
  const { items, total } = await svc.list(req.validQuery);
  return ok(res, items, { meta: pageMeta({ ...req.validQuery, total }) });
});

exports.tree = asyncHandler(async (req, res) => {
  // Anonymous and customer callers only ever see active categories.
  const includeInactive = !!req.user && req.user.role === 'ADMIN' && req.validQuery.includeInactive === true;
  return ok(res, await svc.tree({ includeInactive }));
});

exports.get = asyncHandler(async (req, res) => ok(res, await svc.getById(req.params.id)));
exports.descendants = asyncHandler(async (req, res) => ok(res, await svc.descendants(req.params.id)));
exports.ancestors = asyncHandler(async (req, res) => ok(res, await svc.ancestors(req.params.id)));

exports.update = asyncHandler(async (req, res) =>
  ok(res, await svc.update(req.params.id, req.body), { message: 'Category updated' })
);

exports.remove = asyncHandler(async (req, res) => {
  await svc.remove(req.params.id);
  return ok(res, null, { message: 'Category deleted' });
});
