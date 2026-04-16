const router = require('express').Router();
const { protect } = require('../middleware/auth');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ creator: req.user._id }).sort('-createdAt').limit(20);
    res.json({ success: true, withdrawals, balance: req.user.balance });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { amount, method, destination } = req.body;
    const amountCents = Math.round(amount * 100);
    if (amountCents < 1000) return res.status(400).json({ success: false, message: 'Minimum withdrawal is $10' });
    if (amountCents > req.user.balance.available) return res.status(400).json({ success: false, message: 'Insufficient balance' });
    if (amountCents > 100000 && req.user.kyc.status !== 'verified') return res.status(403).json({ success: false, message: 'KYC required for withdrawals over $1,000' });
    await User.findByIdAndUpdate(req.user._id, { $inc: { 'balance.available': -amountCents, 'balance.pending': amountCents } });
    const fee = Math.ceil(amountCents * 0.005);
    const withdrawal = await Withdrawal.create({ creator: req.user._id, amount: { value: amountCents }, method, destination, fees: { platform: fee, total: fee }, netAmount: amountCents - fee });
    res.status(201).json({ success: true, withdrawal, message: 'Withdrawal submitted. Processing in 1-2 business days.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
