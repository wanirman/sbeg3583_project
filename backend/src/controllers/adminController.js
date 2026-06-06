const User    = require('../models/User');
const Species  = require('../models/Species');
const Category = require('../models/Category');
const BiodiversityReport = require('../models/BiodiversityReport');

/* ── Users ─────────────────────────────────────────────── */

async function listUsers(req, res) {
  try {
    const { user_type, limit = 50, offset = 0 } = req.query;
    const filter = user_type ? { user_type } : {};
    const users = await User.find(filter)
      .select('-password_hash')
      .sort({ join_date: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .lean();

    const result = await Promise.all(users.map(async u => ({
      user_id:        u._id,
      user_name:      u.user_name,
      email:          u.email,
      user_type:      u.user_type,
      points:         u.points,
      join_date:      u.join_date,
      total_reports:  await BiodiversityReport.countDocuments({ user_id: u._id }),
    })));

    return res.json({ users: result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function updateUser(req, res) {
  try {
    const { user_type } = req.body;
    if (!['villager', 'tourist', 'admin'].includes(user_type)) {
      return res.status(422).json({ error: 'user_type must be villager, tourist, or admin' });
    }
    const user = await User.findByIdAndUpdate(req.params.user_id, { user_type }, { new: true }).select('-password_hash').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user_id: user._id, user_name: user.user_name, user_type: user.user_type });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/* ── Species ────────────────────────────────────────────── */

async function createSpecies(req, res) {
  try {
    const { species_name, scientific_name, category_id, description } = req.body;
    if (!species_name || !category_id) {
      return res.status(422).json({ error: 'species_name and category_id are required' });
    }
    const cat = await Category.findById(category_id);
    if (!cat) return res.status(422).json({ error: 'Category not found' });

    const species = await Species.create({ species_name, scientific_name: scientific_name || '', category_id, description: description || '' });
    return res.status(201).json({ species_id: species._id, species_name: species.species_name, scientific_name: species.scientific_name, category_id: species.category_id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function updateSpecies(req, res) {
  try {
    const { species_name, scientific_name, category_id, description } = req.body;
    const update = {};
    if (species_name)    update.species_name    = species_name;
    if (scientific_name !== undefined) update.scientific_name = scientific_name;
    if (category_id)     update.category_id     = category_id;
    if (description !== undefined)     update.description     = description;

    const species = await Species.findByIdAndUpdate(req.params.species_id, update, { new: true }).lean();
    if (!species) return res.status(404).json({ error: 'Species not found' });
    return res.json({ species_id: species._id, species_name: species.species_name, scientific_name: species.scientific_name });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function deleteSpecies(req, res) {
  try {
    const inUse = await BiodiversityReport.exists({ species_id: req.params.species_id });
    if (inUse) {
      return res.status(409).json({ error: 'Cannot delete species that is referenced by existing reports' });
    }
    const species = await Species.findByIdAndDelete(req.params.species_id);
    if (!species) return res.status(404).json({ error: 'Species not found' });
    return res.json({ message: 'Species deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/* ── Categories ─────────────────────────────────────────── */

async function createCategory(req, res) {
  try {
    const { category_name, description } = req.body;
    if (!category_name) return res.status(422).json({ error: 'category_name is required' });

    const cat = await Category.create({ category_name, description: description || '' });
    return res.status(201).json({ category_id: cat._id, category_name: cat.category_name });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Category name already exists' });
    return res.status(500).json({ error: err.message });
  }
}

/* ── Pending report queue ───────────────────────────────── */

async function getPendingReports(req, res) {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const reports = await BiodiversityReport.find({ report_status: 'pending' })
      .populate('user_id',     'user_name user_type')
      .populate('species_id',  'species_name scientific_name')
      .populate('category_id', 'category_name')
      .sort({ timestamp: 1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .lean();

    const sightings = reports.map(r => ({
      report_id:       r._id,
      user_id:         r.user_id?._id,
      user_name:       r.user_id?.user_name,
      user_type:       r.user_id?.user_type,
      species_name:    r.species_id?.species_name,
      scientific_name: r.species_id?.scientific_name,
      category_name:   r.category_id?.category_name,
      photo_url:       r.photo_url,
      notes:           r.notes,
      timestamp:       r.timestamp,
      latitude:        r.location?.coordinates[1],
      longitude:       r.location?.coordinates[0],
    }));
    return res.json({ sightings, total: sightings.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/* ── System stats for admin ─────────────────────────────── */

async function getAdminStats(req, res) {
  try {
    const [totalUsers, totalReports, pendingCount, verifiedCount, rejectedCount] = await Promise.all([
      User.countDocuments({ user_type: { $ne: 'admin' } }),
      BiodiversityReport.countDocuments(),
      BiodiversityReport.countDocuments({ report_status: 'pending' }),
      BiodiversityReport.countDocuments({ report_status: 'verified' }),
      BiodiversityReport.countDocuments({ report_status: 'rejected' }),
    ]);
    return res.json({ total_users: totalUsers, total_reports: totalReports, pending: pendingCount, verified: verifiedCount, rejected: rejectedCount });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { listUsers, updateUser, createSpecies, updateSpecies, deleteSpecies, createCategory, getPendingReports, getAdminStats };
