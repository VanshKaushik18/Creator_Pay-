const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Withdrawal = require('../models/Withdrawal');
const PaymentLink = require('../models/PaymentLink');

// ─── Dashboard stats ───────────────────────────────────────
const getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers,
      activeToday,
      kycPending,
      proUsers,
      totalTransactions,
      totalVolume,
      fraudAlerts,
    ] = await Promise.all([
      User.countDocuments({ role: 'creator' }),
      User.countDocuments({ lastLogin: { $gte: new Date(Date.now() - 86400000) } }),
      User.countDocuments({ 'kyc.status': 'pending' }),
      User.countDocuments({ plan: 'pro' }),
      Transaction.countDocuments({ status: 'confirmed' }),
      Transaction.aggregate([{
        $match: { status: { $in: ['confirmed', 'settled'] } }
      }, {
        $group: { _id: null, total: { $sum: '$amount.usdEquivalent' } }
      }]),
      Transaction.countDocuments({ 'fraud.score': { $gte: 60 }, 'fraud.action': 'none' }),
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        activeToday,
        kycPending,
        proUsers,
        totalTransactions,
        totalVolumeCents: totalVolume[0]?.total || 0,
        fraudAlerts,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── List all users ────────────────────────────────────────
const getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, plan, kyc, sort = '-createdAt' } = req.query;
    const query = { role: 'creator' };

    if (search) query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
    if (plan) query.plan = plan;
    if (kyc) query['kyc.status'] = kyc;

    const [users, total] = await Promise.all([
      User.find(query).sort(sort).skip((page - 1) * limit).limit(Number(limit)).lean(),
      User.countDocuments(query),
    ]);

    res.json({ success: true, users, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Suspend / unsuspend user ──────────────────────────────
const suspendUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { suspend, reason } = req.body;

    const user = await User.findByIdAndUpdate(userId, {
      isSuspended: suspend,
      suspendReason: suspend ? reason : null,
    }, { new: true });

    res.json({ success: true, message: `User ${suspend ? 'suspended' : 'reinstated'}`, user: user.toPublic() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── All transactions ──────────────────────────────────────
const getTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, method, minFraud } = req.query;
    const query = {};
    if (status) query.status = status;
    if (method) query.method = method;
    if (minFraud) query['fraud.score'] = { $gte: Number(minFraud) };

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .populate('creator', 'name email')
        .populate('paymentLink', 'name slug')
        .lean(),
      Transaction.countDocuments(query),
    ]);

    res.json({ success: true, transactions, total });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Fraud alerts ──────────────────────────────────────────
const getFraudAlerts = async (req, res) => {
  try {
    const alerts = await Transaction.find({
      'fraud.score': { $gte: 50 },
      'fraud.action': 'none',
    })
      .sort('-fraud.score')
      .limit(50)
      .populate('creator', 'name email')
      .lean();

    res.json({ success: true, alerts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Take fraud action ─────────────────────────────────────
const fraudAction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { action } = req.body; // 'block', 'refund', 'clear'

    const txn = await Transaction.findByIdAndUpdate(transactionId, {
      'fraud.action': action === 'clear' ? 'none' : action,
      'fraud.reviewed': true,
      ...(action === 'block' && { status: 'failed' }),
    }, { new: true });

    res.json({ success: true, transaction: txn });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Platform analytics ────────────────────────────────────
const getAnalytics = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [volumeByDay, volumeByMethod, topCreators, chainDist] = await Promise.all([
      // Daily volume
      Transaction.aggregate([
        { $match: { status: { $in: ['confirmed', 'settled'] }, createdAt: { $gte: since } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          total: { $sum: '$amount.usdEquivalent' },
          count: { $sum: 1 },
        }},
        { $sort: { _id: 1 } },
      ]),
      // By method
      Transaction.aggregate([
        { $match: { status: { $in: ['confirmed', 'settled'] }, createdAt: { $gte: since } } },
        { $group: { _id: '$method', total: { $sum: '$amount.usdEquivalent' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      // Top 10 creators by revenue
      Transaction.aggregate([
        { $match: { status: { $in: ['confirmed', 'settled'] } } },
        { $group: { _id: '$creator', revenue: { $sum: '$amount.usdEquivalent' }, txns: { $sum: 1 } } },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'creator' } },
        { $unwind: '$creator' },
        { $project: { 'creator.name': 1, 'creator.email': 1, revenue: 1, txns: 1 } },
      ]),
      // Crypto chain distribution
      Transaction.aggregate([
        { $match: { method: { $in: ['eth', 'btc', 'polygon', 'usdt'] }, status: 'confirmed' } },
        { $group: { _id: '$method', volume: { $sum: '$amount.usdEquivalent' } } },
      ]),
    ]);

    res.json({ success: true, volumeByDay, volumeByMethod, topCreators, chainDist });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getDashboardStats,
  getUsers,
  suspendUser,
  getTransactions,
  getFraudAlerts,
  fraudAction,
  getAnalytics,
};
