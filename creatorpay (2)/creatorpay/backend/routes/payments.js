const router = require('express').Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const PaymentLink = require('../models/PaymentLink');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const logger = require('../utils/logger');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'placeholder',
});

const PLATFORM_FEE = parseFloat(process.env.PLATFORM_FEE_PERCENT || 2) / 100;

const calcFees = (amount, method) => {
  const platform = Math.ceil(amount * PLATFORM_FEE);
  const gateway = method === 'stripe' ? Math.ceil(amount * 0.029 + 30) : method === 'razorpay' ? Math.ceil(amount * 0.02) : 0;
  return { platform, gateway, total: platform + gateway };
};

const getLink = async (slug) => {
  const link = await PaymentLink.findOne({ slug, isActive: true }).populate('creator');
  if (!link) throw Object.assign(new Error('Payment link not found'), { status: 404 });
  if (link.isExpired()) throw Object.assign(new Error('Link expired'), { status: 410 });
  if (link.isFull()) throw Object.assign(new Error('Link reached limit'), { status: 410 });
  return link;
};

// Stripe checkout
router.post('/stripe/checkout', async (req, res) => {
  try {
    const { slug, email, name, customAmount } = req.body;
    const link = await getLink(slug);
    const amountCents = link.pricing.type === 'custom' ? Math.round(customAmount * 100) : link.pricing.amount;
    if (!amountCents || amountCents < 50) return res.status(400).json({ success: false, message: 'Invalid amount' });
    const fees = calcFees(amountCents, 'stripe');
    const txn = await Transaction.create({
      creator: link.creator._id, paymentLink: link._id,
      payer: { name, email, ip: req.ip },
      amount: { value: amountCents, currency: link.pricing.currency || 'USD', usdEquivalent: amountCents },
      fees, netAmount: amountCents - fees.total, method: 'stripe', status: 'initiated',
    });
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{ price_data: { currency: (link.pricing.currency || 'USD').toLowerCase(), product_data: { name: link.name }, unit_amount: amountCents }, quantity: 1 }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/payment/success?txn=${txn._id}`,
      cancel_url: `${process.env.FRONTEND_URL}/pay/${slug}?cancelled=1`,
      metadata: { transactionId: txn._id.toString() },
    });
    await Transaction.findByIdAndUpdate(txn._id, { 'gateway.stripe.paymentIntentId': session.payment_intent, status: 'pending' });
    res.json({ success: true, checkoutUrl: session.url, transactionId: txn._id });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
});

// Stripe webhook
router.post('/stripe/webhook', async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) { return res.status(400).json({ error: err.message }); }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const txn = await Transaction.findByIdAndUpdate(session.metadata?.transactionId, { status: 'confirmed', settledAt: new Date() }, { new: true });
    if (txn) {
      await User.findByIdAndUpdate(txn.creator, { $inc: { 'balance.available': txn.netAmount, 'balance.totalEarned': txn.netAmount, 'stats.totalTransactions': 1 } });
      await PaymentLink.findByIdAndUpdate(txn.paymentLink, { $inc: { 'stats.payments': 1, 'stats.totalRevenue': txn.amount.usdEquivalent } });
    }
  }
  res.json({ received: true });
});

// Razorpay order
router.post('/razorpay/order', async (req, res) => {
  try {
    const { slug, email, name, phone, customAmount } = req.body;
    const link = await getLink(slug);
    const amountPaise = link.pricing.type === 'custom' ? Math.round(customAmount * 100) : link.pricing.amount;
    const fees = calcFees(amountPaise, 'razorpay');
    const txn = await Transaction.create({
      creator: link.creator._id, paymentLink: link._id,
      payer: { name, email, phone, ip: req.ip },
      amount: { value: amountPaise, currency: 'INR', usdEquivalent: Math.round(amountPaise * 0.012) },
      fees, netAmount: amountPaise - fees.total, method: 'razorpay', status: 'initiated',
    });
    const order = await razorpay.orders.create({ amount: amountPaise, currency: 'INR', receipt: txn._id.toString() });
    await Transaction.findByIdAndUpdate(txn._id, { 'gateway.razorpay.orderId': order.id, status: 'pending' });
    res.json({ success: true, orderId: order.id, transactionId: txn._id, amount: amountPaise, currency: 'INR', keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
});

// Razorpay verify
router.post('/razorpay/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, transactionId } = req.body;
    const expectedSig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '').update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
    if (expectedSig !== razorpay_signature) return res.status(400).json({ success: false, message: 'Invalid signature' });
    const txn = await Transaction.findByIdAndUpdate(transactionId, { status: 'confirmed', 'gateway.razorpay.paymentId': razorpay_payment_id, settledAt: new Date() }, { new: true });
    if (txn) await User.findByIdAndUpdate(txn.creator, { $inc: { 'balance.available': txn.netAmount, 'balance.totalEarned': txn.netAmount, 'stats.totalTransactions': 1 } });
    res.json({ success: true, message: 'Payment verified' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Crypto initiate
router.post('/crypto/initiate', async (req, res) => {
  try {
    const { slug, currency = 'ETH', customAmountUsd } = req.body;
    const link = await getLink(slug);
    const rates = { ETH: 3200, BTC: 67000, MATIC: 0.98, USDT: 1 };
    const usdAmount = customAmountUsd || (link.pricing.amount / 100);
    const rate = rates[currency] || 1;
    const expectedAmount = usdAmount / rate;
    const depositAddress = process.env.PLATFORM_WALLET_ADDRESS || '0xPlatformWallet';
    const txn = await Transaction.create({
      creator: link.creator._id, paymentLink: link._id,
      payer: { ip: req.ip },
      amount: { value: Math.round(expectedAmount * 1e18), currency, usdEquivalent: Math.round(usdAmount * 100), exchangeRate: rate },
      fees: { platform: Math.ceil(usdAmount * PLATFORM_FEE * 100), gateway: 0, total: Math.ceil(usdAmount * PLATFORM_FEE * 100) },
      netAmount: Math.round(usdAmount * (1 - PLATFORM_FEE) * 100),
      method: currency === 'USDT' ? 'usdt' : currency === 'MATIC' ? 'polygon' : currency.toLowerCase(),
      status: 'initiated',
      'gateway.crypto': { toAddress: depositAddress, network: currency === 'MATIC' ? 'polygon' : 'ethereum', requiredConfirmations: currency === 'BTC' ? 3 : 12 },
    });
    res.json({ success: true, depositAddress, currency, expectedAmount: expectedAmount.toFixed(8), usdEquivalent: usdAmount, transactionId: txn._id, expiresAt: new Date(Date.now() + 30 * 60 * 1000) });
  } catch (err) { res.status(err.status || 500).json({ success: false, message: err.message }); }
});

// Crypto status polling
router.get('/crypto/status/:txnId', async (req, res) => {
  try {
    const txn = await Transaction.findById(req.params.txnId).select('status gateway.crypto amount');
    if (!txn) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, status: txn.status, confirmations: txn.gateway?.crypto?.confirmations || 0, required: txn.gateway?.crypto?.requiredConfirmations || 12 });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
