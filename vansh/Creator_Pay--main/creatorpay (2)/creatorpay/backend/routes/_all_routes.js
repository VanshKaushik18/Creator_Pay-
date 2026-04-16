// ── routes/payments.js ─────────────────────────────────────
const express = require('express');
const { detectFraud } = require('../middleware/fraud');
const {
  stripeCheckout, stripeWebhook,
  razorpayOrder, razorpayVerify,
  cryptoInitiate, cryptoVerify, cryptoStatus,
} = require('../controllers/paymentController');

const paymentRouter = express.Router();

// Stripe (webhook uses raw body — handled in server.js before json parser)
paymentRouter.post('/stripe/checkout', detectFraud, stripeCheckout);
paymentRouter.post('/stripe/webhook', stripeWebhook);

// Razorpay
paymentRouter.post('/razorpay/order', detectFraud, razorpayOrder);
paymentRouter.post('/razorpay/verify', razorpayVerify);

// Crypto
paymentRouter.post('/crypto/initiate', detectFraud, cryptoInitiate);
paymentRouter.post('/crypto/verify', cryptoVerify);
paymentRouter.get('/crypto/status/:transactionId', cryptoStatus);

module.exports = paymentRouter;


// ── routes/transactions.js ─────────────────────────────────
const txRouter = express.Router();
const { protect } = require('../middleware/auth');
const Transaction = require('../models/Transaction');

// GET /api/transactions — creator's transaction history
txRouter.get('/', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, method, from, to } = req.query;
    const query = { creator: req.user._id };
    if (status) query.status = status;
    if (method) query.method = method;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .populate('paymentLink', 'name slug')
        .lean(),
      Transaction.countDocuments(query),
    ]);

    // Summary stats
    const summary = await Transaction.aggregate([
      { $match: { creator: req.user._id, status: { $in: ['confirmed', 'settled'] } } },
      { $group: {
        _id: null,
        totalRevenue: { $sum: '$amount.usdEquivalent' },
        totalNet: { $sum: '$netAmount' },
        count: { $sum: 1 },
      }},
    ]);

    res.json({
      success: true,
      transactions,
      total,
      page: Number(page),
      summary: summary[0] || { totalRevenue: 0, totalNet: 0, count: 0 },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/transactions/analytics — dashboard chart data
txRouter.get('/analytics', protect, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const analytics = await Transaction.getRevenueAnalytics(req.user._id, Number(days));
    res.json({ success: true, analytics });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = { paymentRouter, txRouter };


// ── routes/withdraw.js ─────────────────────────────────────
const wdRouter = express.Router();
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');

wdRouter.use(protect);

// GET /api/withdraw — withdrawal history
wdRouter.get('/', async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ creator: req.user._id }).sort('-createdAt').limit(20);
    res.json({ success: true, withdrawals, balance: req.user.balance });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/withdraw — request withdrawal
wdRouter.post('/', async (req, res) => {
  try {
    const { amount, method, destination } = req.body;

    // Cents
    const amountCents = Math.round(amount * 100);

    if (amountCents < 1000) {
      return res.status(400).json({ success: false, message: 'Minimum withdrawal is $10.00' });
    }

    if (amountCents > req.user.balance.available) {
      return res.status(400).json({ success: false, message: 'Insufficient balance.' });
    }

    // KYC check for large withdrawals
    if (amountCents > 100000 && req.user.kyc.status !== 'verified') {
      return res.status(403).json({ success: false, message: 'KYC verification required for withdrawals over $1,000.' });
    }

    // Deduct from available balance
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { 'balance.available': -amountCents, 'balance.pending': amountCents },
    });

    const platformFee = Math.ceil(amountCents * 0.005); // 0.5% withdrawal fee
    const withdrawal = await Withdrawal.create({
      creator: req.user._id,
      amount: { value: amountCents, currency: 'USD' },
      method,
      destination,
      fees: { platform: platformFee, total: platformFee },
      netAmount: amountCents - platformFee,
      status: 'pending',
    });

    // TODO: Trigger actual payout via Stripe Transfers / Razorpay Payouts / ethers.js transfer
    // This would be handled by a background job in production

    res.status(201).json({ success: true, withdrawal, message: 'Withdrawal request submitted. Processing in 1-2 business days.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = { wdRouter };


// ── routes/admin.js ────────────────────────────────────────
const adminRouter = express.Router();
const { protect: adminProtect, adminOnly } = require('../middleware/auth');
const {
  getDashboardStats, getUsers, suspendUser,
  getTransactions, getFraudAlerts, fraudAction, getAnalytics,
} = require('../controllers/adminController');

adminRouter.use(adminProtect, adminOnly);

adminRouter.get('/stats', getDashboardStats);
adminRouter.get('/users', getUsers);
adminRouter.put('/users/:userId/suspend', suspendUser);
adminRouter.get('/transactions', getTransactions);
adminRouter.get('/fraud-alerts', getFraudAlerts);
adminRouter.put('/fraud/:transactionId', fraudAction);
adminRouter.get('/analytics', getAnalytics);

module.exports = adminRouter;
