const userService = require('../services/user.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok, pageMeta } = require('../utils/ApiResponse');

exports.list = asyncHandler(async (req, res) => {
  const { items, total } = await userService.list(req.validQuery);
  return ok(res, items, { meta: pageMeta({ ...req.validQuery, total }) });
});

exports.get = asyncHandler(async (req, res) => ok(res, await userService.getById(req.params.id)));

exports.setStatus = asyncHandler(async (req, res) =>
  ok(res, await userService.setStatus(req.user, req.params.id, req.body.isActive), {
    message: req.body.isActive ? 'User activated' : 'User deactivated',
  })
);
