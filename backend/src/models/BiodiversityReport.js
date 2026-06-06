const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  user_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  species_id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Species', required: true },
  category_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  location: {
    type: { type: String, enum: ['Point'], required: true, default: 'Point' },
    coordinates: { type: [Number], required: true }, // [longitude, latitude]
  },
  photo_url:     { type: String, default: null },
  notes:         { type: String, default: '' },
  report_status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
  timestamp:     { type: Date, default: Date.now },
  reviewed_by:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewed_at:   { type: Date, default: null },
  admin_comment: { type: String, default: '' },
  sync_status:   { type: String, enum: ['synced', 'pending', 'failed'], default: 'synced' },
});

reportSchema.index({ location: '2dsphere' });
reportSchema.index({ report_status: 1 });
reportSchema.index({ user_id: 1 });
reportSchema.index({ category_id: 1 });
reportSchema.index({ timestamp: -1 });

module.exports = mongoose.model('BiodiversityReport', reportSchema);
