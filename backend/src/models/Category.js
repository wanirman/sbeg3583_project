const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  category_name: { type: String, required: true, unique: true },
  description:   { type: String, default: '' },
  icon:          { type: String, default: '' },
  sdg_goal:      { type: String, default: '' },
});

module.exports = mongoose.model('Category', categorySchema);
