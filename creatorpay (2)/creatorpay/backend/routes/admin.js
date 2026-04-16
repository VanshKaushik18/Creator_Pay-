const router = require('express').Router();
const { protect, adminOnly } = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Withdrawal = require('../models/Withdrawal');

router.use(protect, adminOnly);

router.get('/stats', async (req, res) => {
  try {
    const [totalUsers, kycPending, proUsers, totalTxns, fraudAlerts] = await Promise.all([
      User.countDocuments({ role: 'creator' }),
      User.countDocuments({ 'kyc.status': 'pending' }),
      User.countDocuments({ plan: 'pro' }),
      Transaction.countDocuments({ status: { $in: ['confirmed', 'settled'] } }),
      Transaction.countDocuments({ 'fraud.score': { $gte: 60 }, 'fraud.action': 'none' }),
    ]);
    const vol = await Transaction.aggregate([{ $match: { status: { $in: ['confirmed','settled'] } } }, { $group: { _id: null, total: { $sum: '$amount.usdEquivalent' } } }]);
    res.json({ success: true, stats: { totalUsers, kycPending, proUsers, totalTxns, fraudAlerts, totalVolumeCents: vol[0]?.total || 0 } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const query = { role: 'creator' };
    if (search) query.$or = [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];
    const [users, total] = await Promise.all([User.find(query).sort('-createdAt').skip((page-1)*limit).limit(Number(limit)), User.countDocuments(query)]);
    res.json({ success: true, users, total });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/users/:id/suspend', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isSuspended: req.body.suspend, suspendReason: req.body.reason }, { new: true });
    res.json({ success: true, user: user.toPublic() });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/transactions', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, minFraud } = req.query;
    const query = {};
    if (status) query.status = status;
    if (minFraud) query['fraud.score'] = { $gte: Number(minFraud) };
    const [transactions, total] = await Promise.all([
      Transaction.find(query).sort('-createdAt').skip((page-1)*limit).limit(Number(limit)).populate('creator', 'name email').lean(),
      Transaction.countDocuments(query),
    ]);
    res.json({ success: true, transactions, total });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/fraud-alerts', async (req, res) => {
  try {
    const alerts = await Transaction.find({ 'fraud.score': { $gte: 50 }, 'fraud.action': 'none' }).sort('-fraud.score').limit(50).populate('creator', 'name email').lean();
    res.json({ success: true, alerts });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/fraud/:id', async (req, res) => {
  try {
    const txn = await Transaction.findByIdAndUpdate(req.params.id, { 'fraud.action': req.body.action, 'fraud.reviewed': true }, { new: true });
    res.json({ success: true, transaction: txn });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/analytics', async (req, res) => {
  try {
    const [volumeByMethod, topCreators] = await Promise.all([
      Transaction.aggregate([{ $match: { status: { $in: ['confirmed','settled'] } } }, { $group: { _id: '$method', total: { $sum: '$amount.usdEquivalent' }, count: { $sum: 1 } } }, { $sort: { total: -1 } }]),
      Transaction.aggregate([{ $match: { status: { $in: ['confirmed','settled'] } } }, { $group: { _id: '$creator', revenue: { $sum: '$amount.usdEquivalent' } } }, { $sort: { revenue: -1 } }, { $limit: 10 }, { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'creator' } }, { $unwind: '$creator' }, { $project: { 'creator.name': 1, 'creator.email': 1, revenue: 1 } }]),
    ]);
    res.json({ success: true, volumeByMethod, topCreators });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
