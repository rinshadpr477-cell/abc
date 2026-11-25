const router = require('express').Router();
const c = require('../controllers/auth.controller');
const v = require('../validators/auth.validator');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/authenticate');
const { authLimiter, refreshLimiter } = require('../middleware/rateLimiter');

router.post('/register', authLimiter, validate({ body: v.register }), c.register);
router.post('/login', authLimiter, validate({ body: v.login }), c.login);
router.post('/refresh', ...refreshLimiter, c.refresh);
router.post('/logout', c.logout);
router.get('/me', authenticate, c.me);
router.patch('/profile', authenticate, validate({ body: v.updateProfile }), c.updateProfile);
router.patch('/change-password', authenticate, validate({ body: v.changePassword }), c.changePassword);

module.exports = router;
