const svc = require('../services/order.service');
const dashboard = require('../services/dashboard.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, pageMeta } = require('../utils/ApiResponse');

exports.create = asyncHandler(async (req, res) => {
  const key = req.validHeaders && req.validHeaders['idempotency-key'];
  const { order, replayed } = await svc.placeOrder(req.user._id, req.body.items, key);
  const send = replayed ? ok : created;
  return send(res, order, { message: replayed ? 'Order already placed' : 'Order placed' });
});

exports.myOrders = asyncHandler(async (req, res) => {
  const { items, total } = await svc.listMine(req.user._id, req.validQuery);
  return ok(res, items, { meta: pageMeta({ ...req.validQuery, total }) });
});

exports.get = asyncHandler(async (req, res) => ok(res, await svc.getForViewer(req.params.id, req.user)));

exports.cancel = asyncHandler(async (req, res) =>
  ok(res, await svc.customerCancel(req.params.id, req.user), { message: 'Order cancelled' })
);

exports.adminList = asyncHandler(async (req, res) => {
  const { items, total } = await svc.listAll(req.validQuery);
  return ok(res, items, { meta: pageMeta({ ...req.validQuery, total }) });
});

exports.adminUpdateStatus = asyncHandler(async (req, res) =>
  ok(res, await svc.adminUpdateStatus(req.params.id, req.body.status, req.user, req.body.note), {
    message: 'Order status updated',
  })
);

exports.dashboardStats = asyncHandler(async (_req, res) => ok(res, await dashboard.stats()));
