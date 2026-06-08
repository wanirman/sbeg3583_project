const router = require('express').Router();
const { register, verifyEmail, resendCode, login, getProfile, updateEmail, updatePassword, deleteAccount } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/register',   register);
router.post('/verify',     verifyEmail);
router.post('/resend',     resendCode);
router.post('/login',      login);
router.get('/profile',     authenticate, getProfile);
router.patch('/email',     authenticate, updateEmail);
router.patch('/password',  authenticate, updatePassword);
router.delete('/account',  authenticate, deleteAccount);

module.exports = router;
