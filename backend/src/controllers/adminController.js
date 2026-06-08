const { pool } = require('../config/database');

/* ── Users ─────────────────────────────────────────────── */

async function listUsers(req, res) {
  try {
    const { user_type, limit = 50, offset = 0 } = req.query;
    const where = [];
    const params = [];
    if (user_type) { where.push('user_type = ?'); params.push(user_type); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const lim = Math.max(0, parseInt(limit)  || 50);
    const off = Math.max(0, parseInt(offset) || 0);

    const [users] = await pool.query(
      `SELECT u.user_id, u.user_name, u.email, u.user_type, u.points, u.join_date,
              (SELECT COUNT(*) FROM biodiversity_reports r WHERE r.user_id = u.user_id) AS total_reports
       FROM users u ${whereSql}
       ORDER BY u.join_date DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );

    return res.json({ users });
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
    const [result] = await pool.query('UPDATE users SET user_type = ? WHERE user_id = ?', [user_type, req.params.user_id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'User not found' });

    const [[user]] = await pool.query('SELECT user_id, user_name, user_type FROM users WHERE user_id = ?', [req.params.user_id]);
    return res.json({ user_id: user.user_id, user_name: user.user_name, user_type: user.user_type });
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
    const [cats] = await pool.query('SELECT category_id FROM categories WHERE category_id = ? LIMIT 1', [category_id]);
    if (!cats.length) return res.status(422).json({ error: 'Category not found' });

    const [result] = await pool.query(
      'INSERT INTO species (species_name, scientific_name, category_id, description) VALUES (?, ?, ?, ?)',
      [species_name, scientific_name || '', category_id, description || '']
    );
    return res.status(201).json({ species_id: result.insertId, species_name, scientific_name: scientific_name || '', category_id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function updateSpecies(req, res) {
  try {
    const { species_name, scientific_name, category_id, description } = req.body;
    const sets = [];
    const params = [];
    if (species_name)                  { sets.push('species_name = ?');    params.push(species_name); }
    if (scientific_name !== undefined) { sets.push('scientific_name = ?'); params.push(scientific_name); }
    if (category_id)                   { sets.push('category_id = ?');     params.push(category_id); }
    if (description !== undefined)     { sets.push('description = ?');     params.push(description); }

    if (!sets.length) return res.status(422).json({ error: 'No fields to update' });

    params.push(req.params.species_id);
    const [result] = await pool.query(`UPDATE species SET ${sets.join(', ')} WHERE species_id = ?`, params);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Species not found' });

    const [[species]] = await pool.query('SELECT species_id, species_name, scientific_name FROM species WHERE species_id = ?', [req.params.species_id]);
    return res.json({ species_id: species.species_id, species_name: species.species_name, scientific_name: species.scientific_name });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function deleteSpecies(req, res) {
  try {
    const [inUse] = await pool.query('SELECT 1 FROM biodiversity_reports WHERE species_id = ? LIMIT 1', [req.params.species_id]);
    if (inUse.length) {
      return res.status(409).json({ error: 'Cannot delete species that is referenced by existing reports' });
    }
    const [result] = await pool.query('DELETE FROM species WHERE species_id = ?', [req.params.species_id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Species not found' });
    return res.json({ message: 'Species deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/* ── Categories ─────────────────────────────────────────── */

async function createCategory(req, res) {
  try {
    const { category_name, description, icon, sdg_goal } = req.body;
    if (!category_name) return res.status(422).json({ error: 'category_name is required' });

    const [result] = await pool.query(
      'INSERT INTO categories (category_name, description, icon, sdg_goal) VALUES (?, ?, ?, ?)',
      [category_name, description || '', icon || '', sdg_goal || '']
    );
    return res.status(201).json({ category_id: result.insertId, category_name, icon: icon || '', sdg_goal: sdg_goal || '' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Category name already exists' });
    return res.status(500).json({ error: err.message });
  }
}

/* ── Pending report queue ───────────────────────────────── */

async function getPendingReports(req, res) {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const lim = Math.max(0, parseInt(limit)  || 50);
    const off = Math.max(0, parseInt(offset) || 0);

    const [rows] = await pool.query(
      `SELECT r.report_id, r.user_id, r.latitude, r.longitude, r.photo_url, r.notes, r.timestamp,
              u.user_name, u.user_type,
              s.species_name, s.scientific_name,
              c.category_name
       FROM biodiversity_reports r
       LEFT JOIN users u      ON u.user_id     = r.user_id
       LEFT JOIN species s    ON s.species_id  = r.species_id
       LEFT JOIN categories c ON c.category_id = r.category_id
       WHERE r.report_status = 'pending'
       ORDER BY r.timestamp ASC
       LIMIT ${lim} OFFSET ${off}`
    );

    const sightings = rows.map(r => ({
      report_id:       r.report_id,
      user_id:         r.user_id,
      user_name:       r.user_name,
      user_type:       r.user_type,
      species_name:    r.species_name,
      scientific_name: r.scientific_name,
      category_name:   r.category_name,
      photo_url:       r.photo_url,
      notes:           r.notes,
      timestamp:       r.timestamp,
      latitude:        r.latitude,
      longitude:       r.longitude,
    }));
    return res.json({ sightings, total: sightings.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/* ── System stats for admin ─────────────────────────────── */

async function getAdminStats(req, res) {
  try {
    const [[{ total_users }]]   = await pool.query("SELECT COUNT(*) AS total_users FROM users WHERE user_type <> 'admin'");
    const [[{ total_reports }]] = await pool.query('SELECT COUNT(*) AS total_reports FROM biodiversity_reports');
    const [[{ pending }]]       = await pool.query("SELECT COUNT(*) AS pending FROM biodiversity_reports WHERE report_status = 'pending'");
    const [[{ verified }]]      = await pool.query("SELECT COUNT(*) AS verified FROM biodiversity_reports WHERE report_status = 'verified'");
    const [[{ rejected }]]      = await pool.query("SELECT COUNT(*) AS rejected FROM biodiversity_reports WHERE report_status = 'rejected'");
    const [[{ total_species }]] = await pool.query('SELECT COUNT(*) AS total_species FROM species');

    return res.json({
      reports: { total: total_reports, pending, verified, rejected },
      users:   { total: total_users },
      species: { total: total_species },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { listUsers, updateUser, createSpecies, updateSpecies, deleteSpecies, createCategory, getPendingReports, getAdminStats };
