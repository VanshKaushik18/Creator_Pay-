const router = require('express').Router();
const stripeMock = require('../utils/stripeMock');
const razorpayMock = require('../utils/razorpayMock');
const isDevMode = stripeMock.isDevMode;
const stripe = isDevMode() ? stripeMock : require('stripe')(process.env.STRIPE_SECRET_KEY);
const Razorpay = isDevMode() ? razorpayMock : require('razorpay');
const crypto = require('crypto');
const PaymentLink = require('../models/PaymentLink');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const logger = require('../utils/logger');
const { getRates } = require('../utils/priceOracle');
const { settleTransaction, refundTransaction } = require('../utils/transactionSettlement');
const { validateAmount, validateRequired, sanitizeInput } = require('../utils/validation');

const razorpay = isDevMode() ? razorpayMock : new (require('razorpay'))({
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

// ✅ Stripe checkout - with validation
router.post('/stripe/checkout', async (req, res) => {
  try {
    const { slug, email, name, customAmount } = req.body;
    
    // Validate inputs
    validateRequired({ slug, email, name }, ['slug', 'email', 'name']);
    validateAmount(customAmount || 100, 50);
    
    const link = await getLink(slug);
    const amountCents = link.pricing.type === 'custom' ? Math.round(customAmount * 100) : link.pricing.amount;
    
    if (!amountCents || amountCents < 50) {
      return res.status(400).json({ success: false, message: 'Invalid amount - minimum $0.50' });
    }
    
    const fees = calcFees(amountCents, 'stripe');
    const txn = await Transaction.create({
      creator: link.creator._id, 
      paymentLink: link._id,
      payer: { name: sanitizeInput(name), email: email.toLowerCase(), ip: req.ip },
      amount: { value: amountCents, currency: link.pricing.currency || 'USD', usdEquivalent: amountCents },
      fees, 
      netAmount: amountCents - fees.total, 
      method: 'stripe', 
      status: 'initiated',
    });
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: (link.pricing.currency || 'USD').toLowerCase(),
          product_data: { name: sanitizeInput(link.name) },
          unit_amount: amountCents
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/payment/success?txn=${txn._id}`,
      cancel_url: `${process.env.FRONTEND_URL}/pay/${slug}?cancelled=1`,
      metadata: { transactionId: txn._id.toString() },
    });
    
    await Transaction.findByIdAndUpdate(txn._id, { 
      'gateway.stripe.paymentIntentId': session.payment_intent, 
      status: 'pending' 
    });
    
    res.json({ success: true, checkoutUrl: session.url, transactionId: txn._id });
  } catch (err) {
    logger.error(`Stripe checkout error: ${err.message}`);
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// ✅ Stripe webhook - with atomic settlement
router.post('/stripe/webhook', async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body, 
      req.headers['stripe-signature'], 
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    logger.warn(`Stripe webhook signature verification failed: ${err.message}`);
    return res.status(400).json({ error: 'Invalid signature' });
  }
  
  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const txnId = session.metadata?.transactionId;
      
      if (!txnId) {
        logger.error('Stripe webhook: missing transactionId in metadata');
        return res.status(400).json({ error: 'Missing transaction ID' });
      }
      
      // ✅ Use atomic settlement instead of separate updates
      await settleTransaction(txnId, {
        'gateway.stripe.chargeId': session.payment_intent
      });
    }
    
    res.json({ received: true });
  } catch (error) {
    logger.error(`Stripe webhook settlement failed: ${error.message}`);
    // Return success to prevent Stripe retries, but log for manual review
    res.json({ received: true });
  }
});

// ✅ Razorpay order - with validation
router.post('/razorpay/order', async (req, res) => {
  try {
    const { slug, email, name, phone, customAmount } = req.body;
    
    validateRequired({ slug, email, name, phone }, ['slug', 'email', 'name', 'phone']);
    validateAmount(customAmount || 100, 100); // INR minimum ₹1
    
    const link = await getLink(slug);
    const amountPaise = link.pricing.type === 'custom' ? Math.round(customAmount * 100) : link.pricing.amount;
    const fees = calcFees(amountPaise, 'razorpay');
    
    const txn = await Transaction.create({
      creator: link.creator._id, 
      paymentLink: link._id,
      payer: { 
        name: sanitizeInput(name), 
        email: email.toLowerCase(), 
        phone,
        ip: req.ip 
      },
      amount: { 
        value: amountPaise, 
        currency: 'INR', 
        usdEquivalent: Math.round(amountPaise * 0.012) 
      },
      fees, 
      netAmount: amountPaise - fees.total, 
      method: 'razorpay', 
      status: 'initiated',
    });
    
    const order = await razorpay.orders.create({ 
      amount: amountPaise, 
      currency: 'INR', 
      receipt: txn._id.toString() 
    });
    
    await Transaction.findByIdAndUpdate(txn._id, { 
      'gateway.razorpay.orderId': order.id, 
      status: 'pending' 
    });
    
    res.json({ 
      success: true, 
      orderId: order.id, 
      transactionId: txn._id, 
      amount: amountPaise, 
      currency: 'INR', 
      keyId: process.env.RAZORPAY_KEY_ID 
    });
  } catch (err) {
    logger.error(`Razorpay order error: ${err.message}`);
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// ✅ Razorpay verify - with atomic settlement
router.post('/razorpay/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, transactionId } = req.body;
    
    validateRequired({ razorpay_order_id, razorpay_payment_id, razorpay_signature, transactionId },
      ['razorpay_order_id', 'razorpay_payment_id', 'razorpay_signature', 'transactionId']);
    
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    
    if (expectedSig !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }
    
    // ✅ Use atomic settlement
    await settleTransaction(transactionId, {
      'gateway.razorpay.paymentId': razorpay_payment_id
    });
    
    res.json({ success: true, message: 'Payment verified' });
  } catch (err) {
    logger.error(`Razorpay verify error: ${err.message}`);
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// ✅ Crypto initiate - with live rates and validation
router.post('/crypto/initiate', async (req, res) => {
  try {
    const { slug, currency = 'ETH', customAmountUsd } = req.body;
    
    validateRequired({ slug, currency }, ['slug', 'currency']);
    
    const link = await getLink(slug);
    
    // ✅ FIX: Get live rates instead of hardcoded
    const rates = await getRates();
    const usdAmount = customAmountUsd || (link.pricing.amount / 100);
    const rate = rates[currency];
    
    if (!rate) {
      return res.status(400).json({
        success: false,
        message: `Price feed unavailable for ${currency}. Supported: ${Object.keys(rates).join(', ')}`
      });
    }
    
    validateAmount(Math.round(usdAmount * 100), 100);
    
    // Validate platform wallet address configured
    const depositAddress = process.env.PLATFORM_WALLET_ADDRESS;
    if (!depositAddress || !depositAddress.startsWith('0x')) {
      logger.error('Platform wallet address not properly configured');
      return res.status(500).json({ success: false, message: 'Payment processing unavailable' });
    }
    
    const expectedAmount = usdAmount / rate;
    const fees = { platform: Math.ceil(usdAmount * PLATFORM_FEE * 100), gateway: 0, total: Math.ceil(usdAmount * PLATFORM_FEE * 100) };
    
    const txn = await Transaction.create({
      creator: link.creator._id, 
      paymentLink: link._id,
      payer: { ip: req.ip },
      amount: {
        value: Math.round(expectedAmount * 1e18),
        currency,
        usdEquivalent: Math.round(usdAmount * 100),
        exchangeRate: rate
      },
      fees,
      netAmount: Math.round(usdAmount * (1 - PLATFORM_FEE) * 100),
      method: currency === 'USDT' ? 'usdt' : currency === 'MATIC' ? 'polygon' : currency.toLowerCase(),
      status: 'initiated',
      'gateway.crypto': {
        toAddress: depositAddress,
        network: currency === 'MATIC' ? 'polygon' : currency === 'BTC' ? 'bitcoin' : 'ethereum',
        requiredConfirmations: currency === 'BTC' ? 3 : 12
      },
    });
    
    res.json({
      success: true,
      depositAddress,
      currency,
      expectedAmount: expectedAmount.toFixed(8),
      usdEquivalent: usdAmount,
      rate: rate,
      transactionId: txn._id,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    });
  } catch (err) {
    logger.error(`Crypto initiate error: ${err.message}`);
    res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// Crypto status polling
router.get('/crypto/status/:txnId', async (req, res) => {
  try {
    const txn = await Transaction.findById(req.params.txnId).select('status gateway.crypto amount');
    if (!txn) return res.status(404).json({ success: false, message: 'Transaction not found' });
    res.json({
      success: true,
      status: txn.status,
      confirmations: txn.gateway?.crypto?.confirmations || 0,
      required: txn.gateway?.crypto?.requiredConfirmations || 12
    });
  } catch (err) {
    logger.error(`Crypto status error: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ NEW: Refund endpoint
router.post('/refund/:txnId', async (req, res) => {
  try {
    const { txnId } = req.params;
    const { reason = 'Customer requested refund' } = req.body;
    
    const result = await refundTransaction(txnId, sanitizeInput(reason));
    res.json(result);
  } catch (err) {
    logger.error(`Refund error: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ DEV: Development payment confirmation (simulates Stripe webhook for dev mode)
router.get('/dev/payment-confirm/:sessionId', async (req, res) => {
  try {
    if (!isDevMode()) {
      return res.status(403).json({ success: false, message: 'Dev endpoint not available in production' });
    }
    
    const { txn } = req.query;
    
    if (!txn) {
      return res.status(400).json({ success: false, message: 'Missing transaction ID' });
    }
    
    // Get transaction
    const transaction = await Transaction.findById(txn);
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    
    // Try to settle with atomic transaction first
    let settled = false;
    try {
      await settleTransaction(txn, {
        'gateway.stripe.chargeId': `dev_charge_${Date.now()}`,
        'gateway.stripe.sessionId': req.params.sessionId,
      });
      settled = true;
    } catch (txnErr) {
      // Fallback for standalone MongoDB (no replica set)
      if (txnErr.message.includes('Transaction numbers are only allowed')) {
        // Manually complete the payment without transaction
        const updatedTxn = await Transaction.findByIdAndUpdate(txn, {
          $set: {
            status: 'confirmed',
            settledAt: new Date(),
            'gateway.stripe.chargeId': `dev_charge_${Date.now()}`,
            'gateway.stripe.sessionId': req.params.sessionId,
          }
        }, { new: true });
        
        // Add balance to creator manually
        await User.findByIdAndUpdate(
          transaction.creator, 
          { 
            $inc: { 
              'balance.available': transaction.netAmount,
              'stats.totalTransactions': 1 
            }
          }
        );
        
        // Update payment link stats
        await PaymentLink.findByIdAndUpdate(
          transaction.paymentLink,
          { 
            $inc: { 
              'stats.payments': 1,
              'stats.totalRevenue': transaction.netAmount 
            }
          }
        );
        
        settled = true;
        logger.info(`Dev payment confirmed for txn ${txn} (fallback mode)`);
      } else {
        throw txnErr;
      }
    }
    
    if (!settled) {
      return res.status(400).json({ success: false, message: 'Payment settlement failed' });
    }
    
    // Redirect to success page
    const redirectUrl = `${process.env.FRONTEND_URL}/payment/success?txn=${txn}`;
    res.redirect(redirectUrl);
  } catch (err) {
    logger.error(`Dev payment confirmation error: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
