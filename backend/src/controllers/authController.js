const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User  = require('../models/User');
const Badge = require('../models/Badge');
const BiodiversityReport = require('../models/BiodiversityReport');

function signToken(user) {
  return jwt.sign(
    { user_id: user._id, user_name: user.user_name, user_type: user.user_type, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

async function register(req, res) {
  try {
    const { user_name, email, password, user_type = 'villager' } = req.body;
    if (!user_name || !email || !password) {
      return res.status(422).json({ error: 'user_name, email, and password are required' });
    }
    if (password.length < 6) return res.status(422).json({ error: 'Password must be at least 6 characters' });

    const existing = await User.findOne({ $or: [{ email: email.toLowerCase() }, { user_name }] });
    if (existing) return res.status(409).json({ error: 'Username or email already exists' });

    const hash = await bcrypt.hash(password, 12);
    const user = await User.create({ user_name, email, password_hash: hash, user_type });
    return res.status(201).json({ token: signToken(user), user_id: user._id, user_name: user.user_name, user_type: user.user_type });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(422).json({ error: 'email and password are required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    return res.json({ token: signToken(user), user_id: user._id, user_name: user.user_name, user_type: user.user_type, points: user.points });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function getProfile(req, res) {
  try {
    const user = await User.findById(req.user.user_id)
      .populate('badges.badge_id', 'badge_name description icon_url')
      .lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const total_reports = await BiodiversityReport.countDocuments({ user_id: req.user.user_id, report_status: 'verified' });

    return res.json({
      user_id:       user._id,
      user_name:     user.user_name,
      user_type:     user.user_type,
      email:         user.email,
      points:        user.points,
      join_date:     user.join_date,
      total_reports,
      badges: user.badges.map(b => ({
        badge_name:  b.badge_id?.badge_name,
        description: b.badge_id?.description,
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

    const user = await User.findById(req.user.user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!(await bcrypt.compare(current_password, user.password_hash))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (email === user.email) {
      return res.status(422).json({ error: 'That is already your email address' });
    }

    const taken = await User.findOne({ email });
    if (taken) return res.status(409).json({ error: 'That email is already in use' });

    user.email = email;
    await user.save();
    // Re-issue a token so the embedded email claim stays current
    return res.json({ message: 'Email updated', email: user.email, token: signToken(user) });
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

    const user = await User.findById(req.user.user_id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!(await bcrypt.compare(current_password, user.password_hash))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    if (await bcrypt.compare(new_password, user.password_hash)) {
      return res.status(422).json({ error: 'New password must be different from the current one' });
    }

    user.password_hash = await bcrypt.hash(new_password, 12);
    await user.save();
    return res.json({ message: 'Password updated' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { register, login, getProfile, updateEmail, updatePassword };
