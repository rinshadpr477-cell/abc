const router = require('express').Router();
const adminRouter = require('express').Router();
const c = require('../controllers/order.controller');
const v = require('../validators/order.validator');
const { idParams } = require('../validators/common');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// Customer-facing: /api/v1/orders
router.use(authenticate);
router.post('/', authorize('CUSTOMER'), validate({ body: v.create, headers: v.idempotencyHeader }), c.create);
router.get('/my-orders', authorize('CUSTOMER'), validate({ query: v.list }), c.myOrders);
router.get('/:id', validate({ params: idParams }), c.get); // ownership enforced in the service
router.patch('/:id/cancel', authorize('CUSTOMER'), validate({ params: idParams }), c.cancel);

// Admin: /api/v1/admin/...
adminRouter.use(authenticate, authorize('ADMIN'));
adminRouter.get('/orders', validate({ query: v.adminList }), c.adminList);
adminRouter.patch('/orders/:id/status', validate({ params: idParams, body: v.updateStatus }), c.adminUpdateStatus);
adminRouter.get('/dashboard/stats', c.dashboardStats);

module.exports = router;
module.exports.adminRouter = adminRouter;
