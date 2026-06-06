const Species  = require('../models/Species');
const Category = require('../models/Category');
const inatAuth = require('../services/inatAuth');

const INAT_API = 'https://api.inaturalist.org/v1';

/* Map iNaturalist "iconic taxon" → a local Category name.
   Unmapped groups fall back to 'Other'. Categories are found-or-created. */
const ICONIC_TO_CATEGORY = {
  Aves:           'Birds',
  Reptilia:       'Reptiles',
  Amphibia:       'Aquatic',
  Actinopterygii: 'Aquatic',
  Mollusca:       'Aquatic',
  Plantae:        'Plants',
  Mammalia:       'Mammals',
  Insecta:        'Insects',
  Arachnida:      'Insects',
  Fungi:          'Fungi',
};

/* Find a Category by name (case-insensitive), creating it if absent. */
async function findOrCreateCategory(name) {
  let cat = await Category.findOne({ category_name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
  if (!cat) cat = await Category.create({ category_name: name });
  return cat;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ── Resolve an iNaturalist taxon to a local species_id (find-or-create) ──
   POST /api/external/resolve-species
   body: { inat_taxon_id, species_name, scientific_name, iconic_taxon_name, default_photo_url } */
async function resolveSpecies(req, res) {
  try {
    const { inat_taxon_id, species_name, scientific_name, iconic_taxon_name, default_photo_url } = req.body;

    if (!scientific_name && !inat_taxon_id) {
      return res.status(422).json({ error: 'scientific_name or inat_taxon_id is required' });
    }

    // 1. Try to find an existing local species (by iNat ID first, then scientific name)
    let species = null;
    if (inat_taxon_id) species = await Species.findOne({ inat_taxon_id });
    if (!species && scientific_name) {
      species = await Species.findOne({ scientific_name: new RegExp(`^${escapeRegex(scientific_name)}$`, 'i') });
    }

    // 2. Otherwise create it, mapping the iconic taxon to a category
    if (!species) {
      const catName = ICONIC_TO_CATEGORY[iconic_taxon_name] || 'Other';
      const category = await findOrCreateCategory(catName);
      species = await Species.create({
        species_name:      species_name || scientific_name,
        scientific_name:   scientific_name || '',
        category_id:       category._id,
        inat_taxon_id:     inat_taxon_id || null,
        default_photo_url: default_photo_url || '',
      });
    } else if (inat_taxon_id && !species.inat_taxon_id) {
      // Backfill the iNat ID on a pre-existing local species
      species.inat_taxon_id = inat_taxon_id;
      if (default_photo_url && !species.default_photo_url) species.default_photo_url = default_photo_url;
      await species.save();
    }

    const category = await Category.findById(species.category_id).lean();
    return res.json({
      species_id:      species._id,
      species_name:    species.species_name,
      scientific_name: species.scientific_name,
      category_id:     species.category_id,
      category_name:   category?.category_name || '',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/* ── Identify species from a photo via iNaturalist computer vision ──
   POST /api/external/identify  (multipart: photo, optional lat, lng)
   Requires INAT_API_TOKEN in env (the token is never exposed to the client). */
// Build the multipart body once; it can be re-sent on a token retry
function buildCvForm(req) {
  const form = new FormData();
  const blob = new Blob([req.file.buffer], { type: req.file.mimetype || 'image/jpeg' });
  form.append('image', blob, req.file.originalname || 'photo.jpg');
  if (req.body.lat) form.append('lat', req.body.lat);
  if (req.body.lng) form.append('lng', req.body.lng);
  return form;
}

async function scoreImage(req, token) {
  return fetch(`${INAT_API}/computervision/score_image`, {
    method: 'POST',
    headers: { Authorization: token },
    body: buildCvForm(req),
  });
}

async function identifyPhoto(req, res) {
  try {
    if (!req.file) {
      return res.status(422).json({ error: 'A photo is required.' });
    }

    let token;
    try {
      token = await inatAuth.getApiToken();
    } catch (e) {
      return res.status(502).json({ error: 'iNaturalist authentication failed: ' + e.message });
    }
    if (!token) {
      return res.status(503).json({ error: 'Photo identification is not configured on the server.' });
    }

    let inatRes = await scoreImage(req, token);

    // Token may have expired right at the boundary — refresh once and retry
    if (inatRes.status === 401) {
      inatAuth.invalidate();
      try {
        const fresh = await inatAuth.getApiToken();
        if (fresh) inatRes = await scoreImage(req, fresh);
      } catch (e) {
        return res.status(502).json({ error: 'iNaturalist token refresh failed: ' + e.message });
      }
    }

    if (inatRes.status === 401) {
      return res.status(502).json({ error: 'iNaturalist rejected the token. Check OAuth credentials.' });
    }
    if (!inatRes.ok) {
      return res.status(502).json({ error: `iNaturalist returned ${inatRes.status}` });
    }

    const data = await inatRes.json();
    const suggestions = (data.results || []).slice(0, 5).map(r => ({
      inat_taxon_id:     r.taxon?.id,
      scientific_name:   r.taxon?.name,
      species_name:      r.taxon?.preferred_common_name || r.taxon?.name,
      iconic_taxon_name: r.taxon?.iconic_taxon_name,
      default_photo_url: r.taxon?.default_photo?.square_url || r.taxon?.default_photo?.url || '',
      score:             Math.round((r.combined_score || 0) * 10) / 10,
    }));

    return res.json({ suggestions });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Report whether photo-ID is configured and the token's remaining validity
function inatStatus(req, res) {
  return res.json(inatAuth.status());
}

module.exports = { resolveSpecies, identifyPhoto, inatStatus };
