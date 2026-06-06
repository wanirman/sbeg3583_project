const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  sender_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sender_name:     { type: String, required: true },
  message_text:    { type: String, required: true, maxlength: 1000 },
  timestamp:       { type: Date, default: Date.now },
  sighting_ref_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BiodiversityReport', default: null },
});

chatMessageSchema.index({ timestamp: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
