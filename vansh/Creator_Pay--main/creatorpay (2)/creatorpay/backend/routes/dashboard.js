const router = require('express').Router();
const { protect } = require('../middleware/auth');
const Transaction = require('../models/Transaction');
const PaymentLink = require('../models/PaymentLink');

router.get('/', protect, async (req, res) => {
  try {
    const [recentTxns, links, analytics, summary, totalLinks, totalActiveLinks] = await Promise.all([
      Transaction.find({ creator: req.user._id }).sort('-createdAt').limit(5).populate('paymentLink', 'name'),
      PaymentLink.find({ creator: req.user._id, isActive: true, isArchived: false }).sort('-createdAt').limit(5),
      Transaction.getRevenueAnalytics(req.user._id, 8 * 7),
      Transaction.aggregate([
        { $match: { creator: req.user._id, status: { $in: ['confirmed', 'settled'] } } },
        { $group: { _id: '$method', total: { $sum: '$amount.usdEquivalent' }, count: { $sum: 1 } } },
      ]),
      PaymentLink.countDocuments({ creator: req.user._id }),
      PaymentLink.countDocuments({ creator: req.user._id, isActive: true, isArchived: false }),
    ]);
    
    // Calculate pending transactions (confirmed but not settled)
    const pendingTxns = await Transaction.aggregate([
      { $match: { creator: req.user._id, status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$amount.usdEquivalent' } } },
    ]);
    const pendingAmount = (pendingTxns[0]?.total || 0);
    
    res.json({ 
      success: true, 
      recentTxns, 
      links, 
      analytics, 
      paymentMethodSplit: summary, 
      user: req.user.toPublic(),
      stats: {
        available: req.user.balance.available,
        pending: req.user.balance.pending || pendingAmount,
        totalEarned: req.user.balance.totalEarned,
        totalLinks,
        activeLinks: totalActiveLinks,
      }
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
