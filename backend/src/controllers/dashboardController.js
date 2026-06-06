const BiodiversityReport = require('../models/BiodiversityReport');
const Category = require('../models/Category');
const Species  = require('../models/Species');
const User     = require('../models/User');

async function getStats(req, res) {
  try {
    const [total, verified, pending, aquaticCat] = await Promise.all([
      BiodiversityReport.countDocuments(),
      BiodiversityReport.countDocuments({ report_status: 'verified' }),
      BiodiversityReport.countDocuments({ report_status: 'pending' }),
      Category.findOne({ category_name: 'Aquatic' }).lean(),
    ]);

    const [observerCount, speciesCount, byCategory, monthlyTrend, sdg14] = await Promise.all([
      BiodiversityReport.distinct('user_id').then(ids => ids.length),
      BiodiversityReport.distinct('species_id').then(ids => ids.length),
      BiodiversityReport.aggregate([
        { $match: { report_status: 'verified' } },
        { $group: { _id: '$category_id', count: { $sum: 1 } } },
        { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'cat' } },
        { $unwind: '$cat' },
        { $project: { category_name: '$cat.category_name', count: 1 } },
      ]),
      BiodiversityReport.aggregate([
        { $match: { report_status: 'verified' } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$timestamp' } }, count: { $sum: 1 } } },
        { $sort: { _id: -1 } },
        { $limit: 12 },
        { $project: { month: '$_id', count: 1, _id: 0 } },
      ]),
      aquaticCat ? BiodiversityReport.countDocuments({ report_status: 'verified', category_id: aquaticCat._id }) : 0,
    ]);

    return res.json({
      totals: { total_reports: total, verified_reports: verified, pending_reports: pending, total_observers: observerCount, species_count: speciesCount },
      byCategory: byCategory.map(c => ({ category_name: c.category_name, count: c.count })),
      monthlyTrend: monthlyTrend.reverse(),
      sdg14: { sdg14_count: sdg14 },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getLeaderboard(req, res) {
  try {
    const users = await User.find({ user_type: { $ne: 'admin' } })
      .sort({ points: -1 })
      .limit(20)
      .lean();

    const leaderboard = await Promise.all(users.map(async u => ({
      user_id:        u._id,
      user_name:      u.user_name,
      user_type:      u.user_type,
      points:         u.points,
      verified_count: await BiodiversityReport.countDocuments({ user_id: u._id, report_status: 'verified' }),
    })));

    return res.json({ leaderboard });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getCategories(req, res) {
  try {
    const categories = await Category.find().sort({ category_name: 1 }).lean();
    return res.json({ categories: categories.map(c => ({ category_id: c._id, category_name: c.category_name, description: c.description, icon: c.icon || '', sdg_goal: c.sdg_goal || '' })) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getSpecies(req, res) {
  try {
    const filter = req.query.category_id ? { category_id: req.query.category_id } : {};
    const rows = await Species.find(filter).populate('category_id', 'category_name').sort({ species_name: 1 }).lean();
    return res.json({ species: rows.map(s => ({ species_id: s._id, species_name: s.species_name, scientific_name: s.scientific_name, category_id: s.category_id?._id, category_name: s.category_id?.category_name, description: s.description })) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getTripleHelix(req, res) {
  try {
    const [totalVerified, aquaticCat] = await Promise.all([
      BiodiversityReport.countDocuments({ report_status: 'verified' }),
      Category.findOne({ category_name: 'Aquatic' }).lean(),
    ]);

    const [speciesDiversity, topCommunity, sdg14Count] = await Promise.all([
      BiodiversityReport.distinct('species_id', { report_status: 'verified' }).then(ids => ids.length),
      User.find({ user_type: { $ne: 'admin' } }).sort({ points: -1 }).limit(5).lean(),
      aquaticCat ? BiodiversityReport.countDocuments({ report_status: 'verified', category_id: aquaticCat._id }) : 0,
    ]);

    const community = await Promise.all(topCommunity.map(async u => ({
      user_id:   u._id,
      user_name: u.user_name,
      user_type: u.user_type,
      points:    u.points,
      sightings: await BiodiversityReport.countDocuments({ user_id: u._id, report_status: 'verified' }),
    })));

    return res.json({
      academic:   { total_verified: totalVerified, species_diversity_index: speciesDiversity },
      community,
      government: { sdg14_count: sdg14Count },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { getStats, getLeaderboard, getCategories, getSpecies, getTripleHelix };
