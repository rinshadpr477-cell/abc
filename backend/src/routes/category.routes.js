const router = require('express').Router();
const c = require('../controllers/category.controller');
const v = require('../validators/category.validator');
const { idParams } = require('../validators/common');
const validate = require('../middleware/validate');
const { authenticate, optionalAuthenticate } = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

const admin = [authenticate, authorize('ADMIN')];

// Public read: the storefront needs the category tree for navigation (active categories only).
router.get('/tree', optionalAuthenticate, validate({ query: v.tree }), c.tree);

router.post('/', admin, validate({ body: v.create }), c.create);
router.get('/', admin, validate({ query: v.list }), c.list);
router.get('/:id', admin, validate({ params: idParams }), c.get);
router.get('/:id/descendants', admin, validate({ params: idParams }), c.descendants);
router.get('/:id/ancestors', admin, validate({ params: idParams }), c.ancestors);
router.patch('/:id', admin, validate({ params: idParams, body: v.update }), c.update);
router.delete('/:id', admin, validate({ params: idParams }), c.remove);

module.exports = router;
