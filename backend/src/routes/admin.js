const router = require('express').Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  listUsers, updateUser, deleteUser,
  createSpecies, updateSpecies, deleteSpecies,
  createCategory,
  getPendingReports, getAdminStats,
} = require('../controllers/adminController');

router.use(authenticate, requireAdmin);

router.get('/stats',                 getAdminStats);
router.get('/pending',               getPendingReports);

router.get('/users',                 listUsers);
router.patch('/users/:user_id',      updateUser);
router.delete('/users/:user_id',     deleteUser);

router.post('/species',              createSpecies);
router.patch('/species/:species_id', updateSpecies);
router.delete('/species/:species_id',deleteSpecies);

router.post('/categories',           createCategory);

module.exports = router;
