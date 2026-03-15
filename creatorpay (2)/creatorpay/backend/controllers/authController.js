const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

// ─── Register ──────────────────────────────────────────────
const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { name, email, password, username } = req.body;

    // Check existing
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      const field = existing.email === email ? 'Email' : 'Username';
      return res.status(409).json({ success: false, message: `${field} is already registered.` });
    }

    const user = await User.create({ name, email, password, username });
    const token = generateToken(user._id);

    logger.info(`New creator registered: ${email}`);

    res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: user.toPublic(),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Login ─────────────────────────────────────────────────
const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      // Don't reveal whether email exists
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Check lockout
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message: 'Account temporarily locked due to too many failed attempts. Try again in 2 hours.',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.incLoginAttempts();
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Suspended?
    if (user.isSuspended) {
      return res.status(403).json({ success: false, message: 'Account suspended. Contact support@creatorpay.io' });
    }

    // Reset failed attempts on success
    await user.updateOne({
      $set: { loginAttempts: 0, lastLogin: new Date() },
      $unset: { lockUntil: 1 },
    });

    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: user.toPublic(),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Get current user ──────────────────────────────────────
const getMe = async (req, res) => {
  res.json({ success: true, user: req.user.toPublic() });
};

// ─── Update profile ────────────────────────────────────────
const updateProfile = async (req, res) => {
  try {
    const allowed = ['name', 'bio', 'website', 'username'];
    const updates = {};
    allowed.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ success: true, user: user.toPublic() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Change password ───────────────────────────────────────
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { register, login, getMe, updateProfile, changePassword };
