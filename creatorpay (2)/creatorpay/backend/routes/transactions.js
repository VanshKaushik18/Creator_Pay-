const router = require('express').Router();
const { protect } = require('../middleware/auth');
const Transaction = require('../models/Transaction');

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, method } = req.query;
    const query = { creator: req.user._id };
    if (status) query.status = status;
    if (method) query.method = method;
    const [transactions, total] = await Promise.all([
      Transaction.find(query).sort('-createdAt').skip((page - 1) * limit).limit(Number(limit)).populate('paymentLink', 'name slug').lean(),
      Transaction.countDocuments(query),
    ]);
    const summary = await Transaction.aggregate([
      { $match: { creator: req.user._id, status: { $in: ['confirmed', 'settled'] } } },
      { $group: { _id: null, totalRevenue: { $sum: '$amount.usdEquivalent' }, count: { $sum: 1 } } },
    ]);
    res.json({ success: true, transactions, total, page: Number(page), summary: summary[0] || { totalRevenue: 0, count: 0 } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/analytics', async (req, res) => {
  try {
    const analytics = await Transaction.getRevenueAnalytics(req.user._id, Number(req.query.days || 30));
    res.json({ success: true, analytics });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
