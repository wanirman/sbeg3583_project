const { pool } = require('../config/database');

async function getStats(req, res) {
  try {
    const [[{ total }]]    = await pool.query('SELECT COUNT(*) AS total FROM biodiversity_reports');
    const [[{ verified }]] = await pool.query("SELECT COUNT(*) AS verified FROM biodiversity_reports WHERE report_status = 'verified'");
    const [[{ pending }]]  = await pool.query("SELECT COUNT(*) AS pending FROM biodiversity_reports WHERE report_status = 'pending'");

    const [[observer]]  = await pool.query('SELECT COUNT(DISTINCT user_id) AS c FROM biodiversity_reports');
    const [[speciesCt]] = await pool.query('SELECT COUNT(DISTINCT species_id) AS c FROM biodiversity_reports');

    const [byCategory] = await pool.query(
      `SELECT c.category_name, COUNT(*) AS count
       FROM biodiversity_reports r
       JOIN categories c ON c.category_id = r.category_id
       WHERE r.report_status = 'verified'
       GROUP BY r.category_id, c.category_name`
    );

    const [monthlyTrend] = await pool.query(
      `SELECT DATE_FORMAT(timestamp, '%Y-%m') AS month, COUNT(*) AS count
       FROM biodiversity_reports
       WHERE report_status = 'verified'
       GROUP BY month
       ORDER BY month DESC
       LIMIT 12`
    );

    const [[sdg14row]] = await pool.query(
      `SELECT COUNT(*) AS c
       FROM biodiversity_reports r
       JOIN categories c ON c.category_id = r.category_id
       WHERE r.report_status = 'verified' AND c.category_name = 'Aquatic'`
    );

    return res.json({
      totals: {
        total_reports:   total,
        verified_reports: verified,
        pending_reports:  pending,
        total_observers:  observer.c,
        species_count:    speciesCt.c,
      },
      byCategory: byCategory.map(c => ({ category_name: c.category_name, count: c.count })),
      monthlyTrend: monthlyTrend.map(m => ({ month: m.month, count: m.count })).reverse(),
      sdg14: { sdg14_count: sdg14row.c },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getLeaderboard(req, res) {
  try {
    const [leaderboard] = await pool.query(
      `SELECT u.user_id, u.user_name, u.user_type, u.points,
              (SELECT COUNT(*) FROM biodiversity_reports r
               WHERE r.user_id = u.user_id AND r.report_status = 'verified') AS verified_count
       FROM users u
       WHERE u.user_type <> 'admin'
       ORDER BY u.points DESC
       LIMIT 20`
    );
    return res.json({ leaderboard });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getCategories(req, res) {
  try {
    const [categories] = await pool.query('SELECT * FROM categories ORDER BY category_name ASC');
    return res.json({
      categories: categories.map(c => ({
        category_id:   c.category_id,
        category_name: c.category_name,
        description:   c.description,
        icon:          c.icon || '',
        sdg_goal:      c.sdg_goal || '',
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getSpecies(req, res) {
  try {
    const where = [];
    const params = [];
    if (req.query.category_id) { where.push('s.category_id = ?'); params.push(req.query.category_id); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT s.species_id, s.species_name, s.scientific_name, s.description,
              s.category_id, c.category_name
       FROM species s
       LEFT JOIN categories c ON c.category_id = s.category_id
       ${whereSql}
       ORDER BY s.species_name ASC`,
      params
    );
    return res.json({
      species: rows.map(s => ({
        species_id:      s.species_id,
        species_name:    s.species_name,
        scientific_name: s.scientific_name,
        category_id:     s.category_id,
        category_name:   s.category_name,
        description:     s.description,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getTripleHelix(req, res) {
  try {
    const [[{ total_verified }]] = await pool.query("SELECT COUNT(*) AS total_verified FROM biodiversity_reports WHERE report_status = 'verified'");
    const [[{ species_diversity }]] = await pool.query("SELECT COUNT(DISTINCT species_id) AS species_diversity FROM biodiversity_reports WHERE report_status = 'verified'");
    const [[sdg14row]] = await pool.query(
      `SELECT COUNT(*) AS c
       FROM biodiversity_reports r
       JOIN categories c ON c.category_id = r.category_id
       WHERE r.report_status = 'verified' AND c.category_name = 'Aquatic'`
    );

    const [community] = await pool.query(
      `SELECT u.user_id, u.user_name, u.user_type, u.points,
              (SELECT COUNT(*) FROM biodiversity_reports r
               WHERE r.user_id = u.user_id AND r.report_status = 'verified') AS sightings
       FROM users u
       WHERE u.user_type <> 'admin'
       ORDER BY u.points DESC
       LIMIT 5`
    );

    return res.json({
      academic:   { total_verified, species_diversity_index: species_diversity },
      community,
      government: { sdg14_count: sdg14row.c },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { getStats, getLeaderboard, getCategories, getSpecies, getTripleHelix };
