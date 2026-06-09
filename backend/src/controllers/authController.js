const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const mailer = require('../services/mailer');

const CODE_TTL_MIN = 15; // verification code validity in minutes

function signToken(user) {
  return jwt.sign(
    { user_id: user.user_id, user_name: user.user_name, user_type: user.user_type, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

// Issue a fresh code for a user, persist it, and try to email it.
// Returns { sent, dev_code } — dev_code is set only when no SMTP is configured.
async function issueCode(user_id, email) {
  const code = genCode();
  const expires = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000);
  await pool.query(
    'UPDATE users SET verification_code = ?, verification_expires = ? WHERE user_id = ?',
    [code, expires, user_id]
  );
  let sent = false;
  try {
    sent = await mailer.sendVerificationCode(email, code);
  } catch (e) {
    console.warn('[auth] verification email failed, falling back to dev mode:', e.message);
    sent = false;
  }
  return { sent, dev_code: sent ? undefined : code };
}

async function register(req, res) {
  try {
    const { user_name, email, password, user_type = 'villager' } = req.body;
    if (!user_name || !email || !password) {
      return res.status(422).json({ error: 'user_name, email, and password are required' });
    }
    if (password.length < 6) return res.status(422).json({ error: 'Password must be at least 6 characters' });

    const uname   = user_name.trim();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(uname)) {
      return res.status(422).json({ error: 'Username must be 3–20 characters: letters, numbers, or underscore only (no spaces).' });
    }
    const emailLc = email.toLowerCase().trim();
    const type    = ['villager', 'tourist', 'admin'].includes(user_type) ? user_type : 'villager';

    const [existing] = await pool.query(
      'SELECT user_id FROM users WHERE email = ? OR user_name = ? LIMIT 1',
      [emailLc, uname]
    );
    if (existing.length) return res.status(409).json({ error: 'Username or email already exists' });

    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      'INSERT INTO users (user_name, email, password_hash, user_type, is_verified) VALUES (?, ?, ?, ?, 0)',
      [uname, emailLc, hash, type]
    );

    const { sent, dev_code } = await issueCode(result.insertId, emailLc);
    return res.status(201).json({
      requires_verification: true,
      email: emailLc,
      message: sent
        ? 'Account created. Check your email for a 6-digit verification code.'
        : 'Account created. Enter the verification code shown below to activate your account.',
      email_sent: sent,
      ...(dev_code ? { dev_code } : {}),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Confirm a 6-digit code → activates the account and returns a session token.
async function verifyEmail(req, res) {
  try {
    const { identifier, email, code } = req.body;
    const ident = (identifier || email || '').toLowerCase().trim();
    if (!ident || !code) return res.status(422).json({ error: 'identifier and code are required' });

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? OR user_name = ? LIMIT 1', [ident, ident]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Account not found' });
    if (user.is_verified) return res.status(409).json({ error: 'Account is already verified. Please log in.' });

    if (!user.verification_code || String(code).trim() !== user.verification_code) {
      return res.status(401).json({ error: 'Incorrect verification code' });
    }
    if (!user.verification_expires || new Date(user.verification_expires) < new Date()) {
      return res.status(410).json({ error: 'Verification code has expired. Request a new one.' });
    }

    await pool.query(
      'UPDATE users SET is_verified = 1, verification_code = NULL, verification_expires = NULL WHERE user_id = ?',
      [user.user_id]
    );
    return res.json({
      token: signToken(user),
      user_id: user.user_id,
      user_name: user.user_name,
      user_type: user.user_type,
      points: user.points,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Re-send a verification code to an unverified account.
async function resendCode(req, res) {
  try {
    const { identifier, email } = req.body;
    const ident = (identifier || email || '').toLowerCase().trim();
    if (!ident) return res.status(422).json({ error: 'identifier is required' });

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? OR user_name = ? LIMIT 1', [ident, ident]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Account not found' });
    if (user.is_verified) return res.status(409).json({ error: 'Account is already verified. Please log in.' });

    const { sent, dev_code } = await issueCode(user.user_id, user.email);
    return res.json({
      message: sent ? 'A new code has been emailed to you.' : 'A new code has been generated.',
      email: user.email,
      email_sent: sent,
      ...(dev_code ? { dev_code } : {}),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function login(req, res) {
  try {
    // Accept either a username or an email in `identifier` (legacy: `email`).
    const { identifier, email, password } = req.body;
    const ident = (identifier || email || '').toLowerCase().trim();
    if (!ident || !password) return res.status(422).json({ error: 'username/email and password are required' });

    const [rows] = await pool.query('SELECT * FROM users WHERE email = ? OR user_name = ? LIMIT 1', [ident, ident]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_verified) {
      // Re-issue a code so the user can complete verification from the login screen.
      const { sent, dev_code } = await issueCode(user.user_id, user.email);
      return res.status(403).json({
        error: 'Please verify your email before logging in.',
        requires_verification: true,
        email: user.email,
        email_sent: sent,
        ...(dev_code ? { dev_code } : {}),
      });
    }

    return res.json({ token: signToken(user), user_id: user.user_id, user_name: user.user_name, user_type: user.user_type, points: user.points });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getProfile(req, res) {
  try {
    const [users] = await pool.query('SELECT * FROM users WHERE user_id = ?', [req.user.user_id]);
    const user = users[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [[{ total_reports }]] = await pool.query(
      "SELECT COUNT(*) AS total_reports FROM biodiversity_reports WHERE user_id = ? AND report_status = 'verified'",
      [req.user.user_id]
    );

    const [badges] = await pool.query(
      `SELECT b.badge_name, b.description, ub.awarded_at
       FROM user_badges ub
       JOIN badges b ON b.badge_id = ub.badge_id
       WHERE ub.user_id = ?
       ORDER BY ub.awarded_at ASC`,
      [req.user.user_id]
    );

    return res.json({
      user_id:       user.user_id,
      user_name:     user.user_name,
      user_type:     user.user_type,
      email:         user.email,
      points:        user.points,
      join_date:     user.join_date,
      total_reports,
      badges: badges.map(b => ({
        badge_name:  b.badge_name,
        description: b.description,
        awarded_at:  b.awarded_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Change the logged-in user's email (requires current password to confirm identity)
async function updateEmail(req, res) {
  try {
    const { new_email, current_password } = req.body;
    if (!new_email || !current_password) {
      return res.status(422).json({ error: 'new_email and current_password are required' });
    }
    const email = new_email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(422).json({ error: 'Please enter a valid email address' });
    }

    const [users] = await pool.query('SELECT * FROM users WHERE user_id = ?', [req.user.user_id]);
    const user = users[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!(await bcrypt.compare(current_password, user.password_hash))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (email === user.email) {
      return res.status(422).json({ error: 'That is already your email address' });
    }

    const [taken] = await pool.query('SELECT user_id FROM users WHERE email = ? LIMIT 1', [email]);
    if (taken.length) return res.status(409).json({ error: 'That email is already in use' });

    await pool.query('UPDATE users SET email = ? WHERE user_id = ?', [email, user.user_id]);
    // Re-issue a token so the embedded email claim stays current
    const refreshed = { user_id: user.user_id, user_name: user.user_name, user_type: user.user_type, email };
    return res.json({ message: 'Email updated', email, token: signToken(refreshed) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Change the logged-in user's password (requires current password)
async function updatePassword(req, res) {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(422).json({ error: 'current_password and new_password are required' });
    }
    if (new_password.length < 6) {
      return res.status(422).json({ error: 'New password must be at least 6 characters' });
    }

    const [users] = await pool.query('SELECT * FROM users WHERE user_id = ?', [req.user.user_id]);
    const user = users[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!(await bcrypt.compare(current_password, user.password_hash))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (await bcrypt.compare(new_password, user.password_hash)) {
      return res.status(422).json({ error: 'New password must be different from the current one' });
    }

    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [hash, user.user_id]);
    return res.json({ message: 'Password updated' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// Permanently delete the logged-in user's own account (requires password).
async function deleteAccount(req, res) {
  try {
    const { password } = req.body;
    if (!password) return res.status(422).json({ error: 'Your password is required to delete your account' });

    const [users] = await pool.query('SELECT * FROM users WHERE user_id = ?', [req.user.user_id]);
    const user = users[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Password is incorrect' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // Detach references the user owns elsewhere, then remove their own rows.
      await conn.query('UPDATE biodiversity_reports SET reviewed_by = NULL WHERE reviewed_by = ?', [user.user_id]);
      await conn.query('DELETE FROM chat_messages WHERE sender_id = ?', [user.user_id]);
      await conn.query('DELETE FROM biodiversity_reports WHERE user_id = ?', [user.user_id]);
      await conn.query('DELETE FROM user_badges WHERE user_id = ?', [user.user_id]);
      await conn.query('DELETE FROM users WHERE user_id = ?', [user.user_id]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    return res.json({ message: 'Account deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { register, verifyEmail, resendCode, login, getProfile, updateEmail, updatePassword, deleteAccount };
