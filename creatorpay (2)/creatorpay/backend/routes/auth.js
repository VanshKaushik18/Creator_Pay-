const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect, generateToken } = require('../middleware/auth');

router.post('/register', [
  body('name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  try {
    const { name, email, password, username } = req.body;
    if (await User.findOne({ email })) return res.status(409).json({ success: false, message: 'Email already registered' });
    const user = await User.create({ name, email, password, username });
    const token = generateToken(user._id);
    res.status(201).json({ success: true, token, user: user.toPublic() });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');
    if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password' });
    if (user.isLocked) return res.status(423).json({ success: false, message: 'Account locked. Try again later.' });
    const match = await user.comparePassword(password);
    if (!match) { await user.incLoginAttempts(); return res.status(401).json({ success: false, message: 'Invalid email or password' }); }
    if (user.isSuspended) return res.status(403).json({ success: false, message: 'Account suspended' });
    await user.updateOne({ $set: { loginAttempts: 0, lastLogin: new Date() }, $unset: { lockUntil: 1 } });
    res.json({ success: true, token: generateToken(user._id), user: user.toPublic() });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/me', protect, (req, res) => res.json({ success: true, user: req.user.toPublic() }));

router.put('/profile', protect, async (req, res) => {
  try {
    const allowed = ['name', 'bio', 'website', 'username', 'avatarUrl'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    res.json({ success: true, user: user.toPublic() });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
