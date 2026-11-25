const router = require('express').Router();
const c = require('../controllers/product.controller');
const v = require('../validators/product.validator');
const { idParams } = require('../validators/common');
const validate = require('../middleware/validate');
const { authenticate, optionalAuthenticate } = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

const admin = [authenticate, authorize('ADMIN')];

// Browsing is public; admins additionally see inactive products.
router.get('/', optionalAuthenticate, validate({ query: v.list }), c.list);
router.get('/:id', optionalAuthenticate, validate({ params: idParams }), c.get);

router.post('/', admin, validate({ body: v.create }), c.create);
router.patch('/:id', admin, validate({ params: idParams, body: v.update }), c.update);
router.delete('/:id', admin, validate({ params: idParams }), c.remove);

module.exports = router;
