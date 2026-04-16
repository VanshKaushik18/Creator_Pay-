const router = require('express').Router();
const { protect } = require('../middleware/auth');
const PaymentLink = require('../models/PaymentLink');

router.get('/', protect, async (req, res) => {
  try {
    const links = await PaymentLink.find({ creator: req.user._id, isArchived: false }).sort('-createdAt');
    res.json({ success: true, links });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/:slug/public', async (req, res) => {
  try {
    const link = await PaymentLink.findOne({ slug: req.params.slug, isActive: true })
      .populate('creator', 'name username avatarUrl bio');
    if (!link) return res.status(404).json({ success: false, message: 'Link not found' });
    await PaymentLink.findByIdAndUpdate(link._id, { $inc: { 'stats.views': 1 } });
    res.json({ success: true, link });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', protect, async (req, res) => {
  try {
    if (req.user.plan === 'free') {
      const count = await PaymentLink.countDocuments({ creator: req.user._id, isActive: true });
      if (count >= 3) return res.status(403).json({ success: false, message: 'Free plan: max 3 links. Upgrade to Pro.' });
    }
    const link = await PaymentLink.create({ creator: req.user._id, ...req.body });
    await req.user.updateOne({ $inc: { 'stats.totalLinks': 1 } });
    res.status(201).json({ success: true, link });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id', protect, async (req, res) => {
  try {
    const link = await PaymentLink.findOneAndUpdate(
      { _id: req.params.id, creator: req.user._id },
      req.body, { new: true, runValidators: true }
    );
    if (!link) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, link });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/:id', protect, async (req, res) => {
  try {
    await PaymentLink.findOneAndUpdate({ _id: req.params.id, creator: req.user._id }, { isArchived: true, isActive: false });
    res.json({ success: true, message: 'Link archived' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
