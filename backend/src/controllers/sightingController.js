const BiodiversityReport = require('../models/BiodiversityReport');
const User    = require('../models/User');
const Badge   = require('../models/Badge');

async function awardPoints(user_id) {
  await User.findByIdAndUpdate(user_id, { $inc: { points: 10 } });
  const user = await User.findById(user_id);

  const totalReports = await BiodiversityReport.countDocuments({ user_id, report_status: { $ne: 'rejected' } });

  const milestones = [
    { threshold: 1,  name: 'First Sighting' },
    { threshold: 10, name: 'Nature Explorer' },
    { threshold: 50, name: 'Biodiversity Champion' },
  ];
  for (const m of milestones) {
    if (totalReports >= m.threshold) {
      const badge = await Badge.findOne({ badge_name: m.name });
      if (badge && !user.badges.some(b => b.badge_id.equals(badge._id))) {
        await User.findByIdAndUpdate(user_id, { $push: { badges: { badge_id: badge._id } } });
      }
    }
  }

  const catCount = await BiodiversityReport.distinct('category_id', { user_id, report_status: { $ne: 'rejected' } });
  if (catCount.length >= 4) {
    const badge = await Badge.findOne({ badge_name: 'Species Diversity' });
    if (badge) {
      const u = await User.findById(user_id);
      if (!u.badges.some(b => b.badge_id.equals(badge._id))) {
        await User.findByIdAndUpdate(user_id, { $push: { badges: { badge_id: badge._id } } });
      }
    }
  }
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

    const report = await BiodiversityReport.create({
      user_id, species_id, category_id,
      location: { type: 'Point', coordinates: [lng, lat] },
      photo_url, notes: notes || '',
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      sync_status: 'synced',
    });

    await awardPoints(user_id);
    return res.status(201).json({ report_id: report._id, message: 'Sighting submitted successfully' });
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
        const report = await BiodiversityReport.create({
          user_id:     req.user.user_id,
          species_id:  s.species_id,
          category_id: s.category_id,
          location: { type: 'Point', coordinates: [lng, lat] },
          photo_url:   s.photo_url || null,
          notes:       s.notes || '',
          timestamp:   s.timestamp ? new Date(s.timestamp) : new Date(),
          sync_status: 'synced',
        });
        await awardPoints(req.user.user_id);
        results.push({ local_id: s.local_id, report_id: report._id, status: 'synced' });
      } catch (err) {
        results.push({ local_id: s.local_id, status: 'failed', error: err.message });
      }
    }
    return res.status(207).json({ results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getSightings(req, res) {
  try {
    const { category_id, status, user_id, limit = 100, offset = 0 } = req.query;
    const filter = {};
    if (category_id) filter.category_id = category_id;
    if (status)      filter.report_status = status;
    if (user_id)     filter.user_id = user_id;

    const reports = await BiodiversityReport.find(filter)
      .populate('user_id',     'user_name')
      .populate('species_id',  'species_name scientific_name')
      .populate('category_id', 'category_name')
      .sort({ timestamp: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .lean();

    const sightings = reports.map(r => ({
      report_id:       r._id,
      user_id:         r.user_id?._id,
      user_name:       r.user_id?.user_name,
      species_id:      r.species_id?._id,
      species_name:    r.species_id?.species_name,
      scientific_name: r.species_id?.scientific_name,
      category_id:     r.category_id?._id,
      category_name:   r.category_id?.category_name,
      photo_url:       r.photo_url,
      notes:           r.notes,
      report_status:   r.report_status,
      timestamp:       r.timestamp,
      latitude:        r.location?.coordinates[1],
      longitude:       r.location?.coordinates[0],
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
    const filter = { user_id: req.user.user_id };
    if (status) filter.report_status = status;

    const reports = await BiodiversityReport.find(filter)
      .populate('species_id',  'species_name scientific_name')
      .populate('category_id', 'category_name')
      .sort({ timestamp: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .lean();

    const sightings = reports.map(r => ({
      report_id:       r._id,
      species_name:    r.species_id?.species_name,
      scientific_name: r.species_id?.scientific_name,
      category_name:   r.category_id?.category_name,
      photo_url:       r.photo_url,
      notes:           r.notes,
      report_status:   r.report_status,
      timestamp:       r.timestamp,
      latitude:        r.location?.coordinates[1],
      longitude:       r.location?.coordinates[0],
      admin_comment:   r.admin_comment,
    }));
    return res.json({ sightings });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getSightingById(req, res) {
  try {
    const report = await BiodiversityReport.findById(req.params.report_id)
      .populate('user_id',     'user_name')
      .populate('species_id',  'species_name scientific_name description')
      .populate('category_id', 'category_name description')
      .lean();

    if (!report) return res.status(404).json({ error: 'Report not found' });

    return res.json({
      report_id:       report._id,
      user_id:         report.user_id?._id,
      user_name:       report.user_id?.user_name,
      species_name:    report.species_id?.species_name,
      scientific_name: report.species_id?.scientific_name,
      category_name:   report.category_id?.category_name,
      photo_url:       report.photo_url,
      notes:           report.notes,
      report_status:   report.report_status,
      timestamp:       report.timestamp,
      latitude:        report.location?.coordinates[1],
      longitude:       report.location?.coordinates[0],
      admin_comment:   report.admin_comment,
      reviewed_at:     report.reviewed_at,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getSightingsGeoJSON(req, res) {
  try {
    const reports = await BiodiversityReport.find({ report_status: 'verified' })
      .populate('user_id',     'user_name')
      .populate('species_id',  'species_name')
      .populate('category_id', 'category_name')
      .lean();

    const geojson = {
      type: 'FeatureCollection',
      features: reports.map(r => ({
        type: 'Feature',
        geometry: r.location,
        properties: {
          report_id:     r._id,
          user_name:     r.user_id?.user_name,
          species_name:  r.species_id?.species_name,
          category_name: r.category_id?.category_name,
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

    const report = await BiodiversityReport.findByIdAndUpdate(report_id, {
      report_status,
      reviewed_by:   req.user.user_id,
      reviewed_at:   new Date(),
      admin_comment: admin_comment || '',
    }, { new: true });

    if (!report) return res.status(404).json({ error: 'Report not found' });

    if (report_status === 'verified') {
      await User.findByIdAndUpdate(report.user_id, { $inc: { points: 5 } });
    }
    return res.json({ message: `Sighting ${report_status}` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { submitSighting, syncBatch, getSightings, getMyReports, getSightingById, getSightingsGeoJSON, verifySighting };
