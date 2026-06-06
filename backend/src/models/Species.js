const mongoose = require('mongoose');

const speciesSchema = new mongoose.Schema({
  species_name:      { type: String, required: true },
  scientific_name:   { type: String, default: '' },
  category_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  description:       { type: String, default: '' },
  inat_taxon_id:     { type: Number, default: null, index: true },   // iNaturalist taxon ID (for dedupe/enrichment)
  default_photo_url: { type: String, default: '' },                  // iNaturalist thumbnail
});

speciesSchema.index({ scientific_name: 1 });

module.exports = mongoose.model('Species', speciesSchema);
