const router = require('express').Router();
const c = require('../controllers/user.controller');
const v = require('../validators/user.validator');
const { idParams } = require('../validators/common');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.use(authenticate, authorize('ADMIN'));
router.get('/', validate({ query: v.list }), c.list);
router.get('/:id', validate({ params: idParams }), c.get);
router.patch('/:id/status', validate({ params: idParams, body: v.setStatus }), c.setStatus);

module.exports = router;
