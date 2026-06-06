const router = require('express').Router();
const { getStats, getLeaderboard, getCategories, getSpecies, getTripleHelix } = require('../controllers/dashboardController');

router.get('/stats',       getStats);
router.get('/leaderboard', getLeaderboard);
router.get('/categories',  getCategories);
router.get('/species',     getSpecies);
router.get('/triple-helix',getTripleHelix);

module.exports = router;
