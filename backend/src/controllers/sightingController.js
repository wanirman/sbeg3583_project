const { pool } = require('../config/database');

// Insert (user_id, badge_id) once; the composite PK makes re-awards a no-op.
async function awardBadge(user_id, badge_name) {
  const [rows] = await pool.query('SELECT badge_id FROM badges WHERE badge_name = ? LIMIT 1', [badge_name]);
  if (!rows.length) return;
  await pool.query('INSERT IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)', [user_id, rows[0].badge_id]);
}

async function awardPoints(user_id) {
  await pool.query('UPDATE users SET points = points + 10 WHERE user_id = ?', [user_id]);

  const [[{ total_reports }]] = await pool.query(
    "SELECT COUNT(*) AS total_reports FROM biodiversity_reports WHERE user_id = ? AND report_status <> 'rejected'",
    [user_id]
  );

  const milestones = [
    { threshold: 1,  name: 'First Sighting' },
    { threshold: 10, name: 'Nature Explorer' },
    { threshold: 50, name: 'Biodiversity Champion' },
  ];
  for (const m of milestones) {
    if (total_reports >= m.threshold) await awardBadge(user_id, m.name);
  }

  const [[{ cat_count }]] = await pool.query(
    "SELECT COUNT(DISTINCT category_id) AS cat_count FROM biodiversity_reports WHERE user_id = ? AND report_status <> 'rejected'",
    [user_id]
  );
  if (cat_count >= 4) await awardBadge(user_id, 'Species Diversity');
}

async function insertReport({ user_id, species_id, category_id, lat, lng, photo_url, notes, timestamp }) {
  const [result] = await pool.query(
    `INSERT INTO biodiversity_reports
       (user_id, species_id, category_id, latitude, longitude, photo_url, notes, timestamp, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced')`,
    [user_id, species_id, category_id, lat, lng, photo_url, notes || '', timestamp ? new Date(timestamp) : new Date()]
  );
  return result.insertId;
}

async function submitSighting(req, res) {
  try {
    const { species_id, category_id, latitude, longitude, notes, timestamp } = req.body;
    const user_id = req.user.user_id;

    if (!species_id || !category_id || !latitude || !longitude) {
      return res.status(422).json({ error: 'species_id, category_id, latitude, and longitude are required' });
    }
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(422).json({ error: 'Invalid latitude or longitude' });
    }

    const photo_url = req.file ? `/uploads/${req.file.filename}` : null;
    const report_id = await insertReport({ user_id, species_id, category_id, lat, lng, photo_url, notes, timestamp });

    await awardPoints(user_id);
    return res.status(201).json({ report_id, message: 'Sighting submitted successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function syncBatch(req, res) {
  try {
    const { sightings } = req.body;
    if (!Array.isArray(sightings) || sightings.length === 0) {
      return res.status(422).json({ error: 'sightings array is required' });
    }

    const results = [];
    for (const s of sightings) {
      try {
        const lat = parseFloat(s.latitude);
        const lng = parseFloat(s.longitude);
        const report_id = await insertReport({
          user_id:     req.user.user_id,
          species_id:  s.species_id,
          category_id: s.category_id,
          lat, lng,
          photo_url:   s.photo_url || null,
          notes:       s.notes || '',
          timestamp:   s.timestamp,
        });
        await awardPoints(req.user.user_id);
        results.push({ local_id: s.local_id, report_id, status: 'synced' });
      } catch (err) {
        results.push({ local_id: s.local_id, status: 'failed', error: err.message });
      }
    }
    return res.status(207).json({ results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Shared SELECT joining the lookup tables; callers append WHERE/ORDER/LIMIT.
const REPORT_SELECT = `
  SELECT r.report_id, r.user_id, r.species_id, r.category_id, r.latitude, r.longitude,
         r.photo_url, r.notes, r.report_status, r.timestamp, r.reviewed_at, r.admin_comment,
         u.user_name, u.user_type,
         s.species_name, s.scientific_name,
         c.category_name
  FROM biodiversity_reports r
  LEFT JOIN users u      ON u.user_id     = r.user_id
  LEFT JOIN species s    ON s.species_id  = r.species_id
  LEFT JOIN categories c ON c.category_id = r.category_id`;

async function getSightings(req, res) {
  try {
    const { category_id, status, user_id, limit = 100, offset = 0 } = req.query;
    const where = [];
    const params = [];
    if (category_id) { where.push('r.category_id = ?');   params.push(category_id); }
    if (status)      { where.push('r.report_status = ?'); params.push(status); }
    if (user_id)     { where.push('r.user_id = ?');       params.push(user_id); }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const lim = Math.max(0, parseInt(limit)  || 100);
    const off = Math.max(0, parseInt(offset) || 0);

    const [rows] = await pool.query(
      `${REPORT_SELECT} ${whereSql} ORDER BY r.timestamp DESC LIMIT ${lim} OFFSET ${off}`,
      params
    );

    const sightings = rows.map(r => ({
      report_id:       r.report_id,
      user_id:         r.user_id,
      user_name:       r.user_name,
      species_id:      r.species_id,
      species_name:    r.species_name,
      scientific_name: r.scientific_name,
      category_id:     r.category_id,
      category_name:   r.category_name,
      photo_url:       r.photo_url,
      notes:           r.notes,
      report_status:   r.report_status,
      timestamp:       r.timestamp,
      latitude:        r.latitude,
      longitude:       r.longitude,
      admin_comment:   r.admin_comment,
    }));
    return res.json({ sightings });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getMyReports(req, res) {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    const where = ['r.user_id = ?'];
    const params = [req.user.user_id];
    if (status) { where.push('r.report_status = ?'); params.push(status); }

    const lim = Math.max(0, parseInt(limit)  || 50);
    const off = Math.max(0, parseInt(offset) || 0);

    const [rows] = await pool.query(
      `${REPORT_SELECT} WHERE ${where.join(' AND ')} ORDER BY r.timestamp DESC LIMIT ${lim} OFFSET ${off}`,
      params
    );

    const sightings = rows.map(r => ({
      report_id:       r.report_id,
      species_name:    r.species_name,
      scientific_name: r.scientific_name,
      category_name:   r.category_name,
      photo_url:       r.photo_url,
      notes:           r.notes,
      report_status:   r.report_status,
      timestamp:       r.timestamp,
      latitude:        r.latitude,
      longitude:       r.longitude,
      admin_comment:   r.admin_comment,
    }));
    return res.json({ sightings });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getSightingById(req, res) {
  try {
    const [rows] = await pool.query(`${REPORT_SELECT} WHERE r.report_id = ? LIMIT 1`, [req.params.report_id]);
    const r = rows[0];
    if (!r) return res.status(404).json({ error: 'Report not found' });

    return res.json({
      report_id:       r.report_id,
      user_id:         r.user_id,
      user_name:       r.user_name,
      species_name:    r.species_name,
      scientific_name: r.scientific_name,
      category_name:   r.category_name,
      photo_url:       r.photo_url,
      notes:           r.notes,
      report_status:   r.report_status,
      timestamp:       r.timestamp,
      latitude:        r.latitude,
      longitude:       r.longitude,
      admin_comment:   r.admin_comment,
      reviewed_at:     r.reviewed_at,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getSightingsGeoJSON(req, res) {
  try {
    const [rows] = await pool.query(`${REPORT_SELECT} WHERE r.report_status = 'verified'`);

    const geojson = {
      type: 'FeatureCollection',
      features: rows.map(r => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.longitude, r.latitude] },
        properties: {
          report_id:     r.report_id,
          user_name:     r.user_name,
          species_name:  r.species_name,
          category_name: r.category_name,
          photo_url:     r.photo_url,
          timestamp:     r.timestamp,
        },
      })),
    };
    return res.json(geojson);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function verifySighting(req, res) {
  try {
    const { report_id } = req.params;
    const { report_status, admin_comment } = req.body;

    if (!['verified', 'rejected'].includes(report_status)) {
      return res.status(422).json({ error: 'report_status must be verified or rejected' });
    }

    const [reports] = await pool.query('SELECT user_id FROM biodiversity_reports WHERE report_id = ? LIMIT 1', [report_id]);
    if (!reports.length) return res.status(404).json({ error: 'Report not found' });

    await pool.query(
      `UPDATE biodiversity_reports
       SET report_status = ?, reviewed_by = ?, reviewed_at = ?, admin_comment = ?
       WHERE report_id = ?`,
      [report_status, req.user.user_id, new Date(), admin_comment || '', report_id]
    );

    if (report_status === 'verified') {
      await pool.query('UPDATE users SET points = points + 5 WHERE user_id = ?', [reports[0].user_id]);
    }
    return res.json({ message: `Sighting ${report_status}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { submitSighting, syncBatch, getSightings, getMyReports, getSightingById, getSightingsGeoJSON, verifySighting };
