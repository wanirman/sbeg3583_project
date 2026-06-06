const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  user_name:     { type: String, required: true, unique: true, trim: true },
  user_type:     { type: String, enum: ['villager', 'tourist', 'admin'], default: 'villager' },
  email:         { type: String, required: true, unique: true, lowercase: true, trim: true },
  password_hash: { type: String, required: true },
  points:        { type: Number, default: 0 },
  badges:        [{ badge_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Badge' }, awarded_at: { type: Date, default: Date.now } }],
  join_date:     { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema);
