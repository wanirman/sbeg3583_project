const ChatMessage = require('../models/ChatMessage');

async function getMessages(req, res) {
  try {
    const { limit = 50, before } = req.query;
    const query = before ? { timestamp: { $lt: new Date(before) } } : {};
    const messages = await ChatMessage.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .lean();
    return res.json({ messages: messages.reverse() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function postMessage(req, res) {
  try {
    const { message_text, timestamp, sighting_ref_id } = req.body;
    if (!message_text || message_text.trim().length === 0) {
      return res.status(422).json({ error: 'message_text is required' });
    }

    const msg = await ChatMessage.create({
      sender_id:       req.user.user_id,
      sender_name:     req.user.user_name,
      message_text:    message_text.trim(),
      timestamp:       timestamp ? new Date(timestamp) : new Date(),
      sighting_ref_id: sighting_ref_id || null,
    });

    req.app.get('io').emit('chat:message', msg);
    return res.status(201).json(msg);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { getMessages, postMessage };
