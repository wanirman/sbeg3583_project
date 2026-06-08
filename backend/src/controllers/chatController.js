const { pool } = require('../config/database');

async function getMessages(req, res) {
  try {
    const { limit = 50, before } = req.query;
    const lim = Math.max(1, parseInt(limit) || 50);

    let rows;
    if (before) {
      [rows] = await pool.query(
        `SELECT * FROM chat_messages WHERE timestamp < ? ORDER BY timestamp DESC LIMIT ${lim}`,
        [new Date(before)]
      );
    } else {
      [rows] = await pool.query(`SELECT * FROM chat_messages ORDER BY timestamp DESC LIMIT ${lim}`);
    }
    return res.json({ messages: rows.reverse() });
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

    const text = message_text.trim().slice(0, 1000);
    const ts   = timestamp ? new Date(timestamp) : new Date();
    const ref  = sighting_ref_id || null;

    const [result] = await pool.query(
      `INSERT INTO chat_messages (sender_id, sender_name, message_text, timestamp, sighting_ref_id)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.user_id, req.user.user_name, text, ts, ref]
    );

    const msg = {
      message_id:      result.insertId,
      sender_id:       req.user.user_id,
      sender_name:     req.user.user_name,
      message_text:    text,
      timestamp:       ts,
      sighting_ref_id: ref,
    };

    req.app.get('io').emit('chat:message', msg);
    return res.status(201).json(msg);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { getMessages, postMessage };
