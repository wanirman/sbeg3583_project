const express = require('express');
const multer  = require('multer');
const { authenticate } = require('../middleware/auth');
const { resolveSpecies, identifyPhoto, inatStatus } = require('../controllers/externalController');

const router = express.Router();

// In-memory upload — identify photos are forwarded to iNaturalist, never stored on disk
const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 },
});

router.post('/resolve-species', authenticate, resolveSpecies);
router.post('/identify',        authenticate, memUpload.single('photo'), identifyPhoto);
router.get('/inat-status',      authenticate, inatStatus);

module.exports = router;
