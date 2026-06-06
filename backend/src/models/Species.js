const mongoose = require('mongoose');

const speciesSchema = new mongoose.Schema({
  species_name:    { type: String, required: true },
  scientific_name: { type: String, default: '' },
  category_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  description:     { type: String, default: '' },
});

module.exports = mongoose.model('Species', speciesSchema);
