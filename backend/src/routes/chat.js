const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { getMessages, postMessage } = require('../controllers/chatController');

router.get('/',  authenticate, getMessages);
router.post('/', authenticate, (req, res) => {
  req.io = req.app.get('io');
  return postMessage(req, res);
});

module.exports = router;
