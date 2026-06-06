const mongoose = require('mongoose');

const badgeSchema = new mongoose.Schema({
  badge_name:  { type: String, required: true, unique: true },
  description: { type: String, default: '' },
  icon_url:    { type: String, default: '' },
  threshold:   { type: Number, required: true, default: 1 },
});

module.exports = mongoose.model('Badge', badgeSchema);
