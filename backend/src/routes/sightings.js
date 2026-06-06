const router = require('express').Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
  submitSighting, syncBatch, getSightings, getMyReports, getSightingById, getSightingsGeoJSON, verifySighting,
} = require('../controllers/sightingController');

router.post('/',                    authenticate, upload.single('photo'), submitSighting);
router.post('/sync',                authenticate, syncBatch);
router.get('/my-reports',           authenticate, getMyReports);
router.get('/geojson',              getSightingsGeoJSON);
router.get('/',                     authenticate, getSightings);
router.get('/:report_id',           authenticate, getSightingById);
router.patch('/:report_id/verify',  authenticate, requireAdmin, verifySighting);

module.exports = router;
