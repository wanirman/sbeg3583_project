const router = require('express').Router();
const { register, login, getProfile, updateEmail, updatePassword } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/register',   register);
router.post('/login',      login);
router.get('/profile',     authenticate, getProfile);
router.patch('/email',     authenticate, updateEmail);
router.patch('/password',  authenticate, updatePassword);

module.exports = router;
