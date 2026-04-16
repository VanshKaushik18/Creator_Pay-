const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { ethers } = require('ethers');

const PaymentLink = require('../models/PaymentLink');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { getEthProvider, ERC20_ABI, getTokenConfig } = require('../config/web3');
const logger = require('../utils/logger');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const PLATFORM_FEE = parseFloat(process.env.PLATFORM_FEE_PERCENT || 2) / 100;

// ─── Helper: fee calculation ───────────────────────────────
const calcFees = (amountCents, method) => {
  const platform = Math.ceil(amountCents * PLATFORM_FEE);
  // Stripe: 2.9% + 30¢  |  Razorpay: 2% + GST  |  Crypto: gas only (negligible)
  const gateway = method === 'stripe'
    ? Math.ceil(amountCents * 0.029 + 30)
    : method === 'razorpay'
    ? Math.ceil(amountCents * 0.02)
    : 0;
  return { platform, gateway, total: platform + gateway };
};

// ─── Helper: get + validate payment link ──────────────────
const getLink = async (slug) => {
  const link = await PaymentLink.findOne({ slug, isActive: true }).populate('creator');
  if (!link) throw Object.assign(new Error('Payment link not found or inactive'), { status: 404 });
  if (link.isExpired()) throw Object.assign(new Error('This payment link has expired'), { status: 410 });
  if (link.isFull()) throw Object.assign(new Error('This payment link has reached its limit'), { status: 410 });
  return link;
};

// ═══════════════════════════════════════════════════════════
// STRIPE
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/payments/stripe/checkout
 * Creates a Stripe Checkout Session and returns the URL
 */
const stripeCheckout = async (req, res) => {
  try {
    const { slug, email, name, customAmount } = req.body;
    const link = await getLink(slug);

    const amountCents = link.pricing.type === 'custom'
      ? Math.round(customAmount * 100)
      : link.pricing.amount;

    if (!amountCents || amountCents < 50) {
      return res.status(400).json({ success: false, message: 'Invalid amount. Minimum is $0.50' });
    }

    const fees = calcFees(amountCents, 'stripe');

    // Create pending transaction record first
    const txn = await Transaction.create({
      creator: link.creator._id,
      paymentLink: link._id,
      payer: { name, email, ip: req.ip, userAgent: req.headers['user-agent'] },
      amount: { value: amountCents, currency: link.pricing.currency, usdEquivalent: amountCents },
      fees,
      netAmount: amountCents - fees.total,
      method: 'stripe',
      status: 'initiated',
      fraud: { score: req.fraudScore || 0, flags: req.fraudFlags || [] },
    });

    // Create Stripe session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: link.pricing.currency.toLowerCase(),
          product_data: {
            name: link.name,
            description: link.description || `Payment to ${link.creator.name}`,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/payment/success?txn=${txn._id}&session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/pay/${slug}?cancelled=1`,
      metadata: {
        transactionId: txn._id.toString(),
        creatorId: link.creator._id.toString(),
        linkSlug: slug,
      },
    });

    // Save session ID to transaction
    await Transaction.findByIdAndUpdate(txn._id, {
      'gateway.stripe.paymentIntentId': session.payment_intent,
      status: 'pending',
    });

    res.json({ success: true, checkoutUrl: session.url, transactionId: txn._id });
  } catch (error) {
    logger.error(`Stripe checkout error: ${error.message}`);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/payments/stripe/webhook
 * Stripe sends payment events here
 */
const stripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error(`Stripe webhook signature failed: ${err.message}`);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const txnId = session.metadata?.transactionId;

        await Transaction.findByIdAndUpdate(txnId, {
          status: 'confirmed',
          'gateway.stripe.chargeId': session.payment_intent,
          settledAt: new Date(),
        });

        // Credit creator balance
        const txn = await Transaction.findById(txnId);
        if (txn) {
          await User.findByIdAndUpdate(txn.creator, {
            $inc: {
              'balance.available': txn.netAmount,
              'balance.totalEarned': txn.netAmount,
              'stats.totalTransactions': 1,
            },
          });
          await PaymentLink.findByIdAndUpdate(txn.paymentLink, {
            $inc: { 'stats.payments': 1, 'stats.totalRevenue': txn.amount.usdEquivalent },
          });
        }
        logger.info(`Stripe payment confirmed: ${txnId}`);
        break;
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object;
        logger.warn(`Chargeback dispute: ${dispute.id} for charge ${dispute.charge}`);
        await Transaction.findOneAndUpdate(
          { 'gateway.stripe.chargeId': dispute.charge },
          { status: 'disputed', 'fraud.action': 'flagged' }
        );
        break;
      }
    }

    res.json({ received: true });
  } catch (error) {
    logger.error(`Webhook processing error: ${error.message}`);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// ═══════════════════════════════════════════════════════════
// RAZORPAY
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/payments/razorpay/order
 * Creates a Razorpay order
 */
const razorpayOrder = async (req, res) => {
  try {
    const { slug, email, name, phone, customAmount } = req.body;
    const link = await getLink(slug);

    const amountPaise = link.pricing.type === 'custom'
      ? Math.round(customAmount * 100)
      : link.pricing.amount;

    const fees = calcFees(amountPaise, 'razorpay');

    const txn = await Transaction.create({
      creator: link.creator._id,
      paymentLink: link._id,
      payer: { name, email, phone, ip: req.ip },
      amount: { value: amountPaise, currency: 'INR', usdEquivalent: Math.round(amountPaise * 0.012) },
      fees,
      netAmount: amountPaise - fees.total,
      method: 'razorpay',
      status: 'initiated',
      fraud: { score: req.fraudScore || 0, flags: req.fraudFlags || [] },
    });

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: txn._id.toString(),
      notes: {
        transactionId: txn._id.toString(),
        creatorName: link.creator.name,
        linkName: link.name,
      },
    });

    await Transaction.findByIdAndUpdate(txn._id, {
      'gateway.razorpay.orderId': order.id,
      status: 'pending',
    });

    res.json({
      success: true,
      orderId: order.id,
      transactionId: txn._id,
      amount: amountPaise,
      currency: 'INR',
      keyId: process.env.RAZORPAY_KEY_ID,
      prefill: { name, email, contact: phone },
    });
  } catch (error) {
    logger.error(`Razorpay order error: ${error.message}`);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/payments/razorpay/verify
 * Verifies Razorpay payment signature
 */
const razorpayVerify = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, transactionId } = req.body;

    // Verify signature (HMAC-SHA256)
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      await Transaction.findByIdAndUpdate(transactionId, { status: 'failed' });
      return res.status(400).json({ success: false, message: 'Invalid payment signature.' });
    }

    const txn = await Transaction.findByIdAndUpdate(transactionId, {
      status: 'confirmed',
      'gateway.razorpay.paymentId': razorpay_payment_id,
      'gateway.razorpay.signature': razorpay_signature,
      settledAt: new Date(),
    }, { new: true });

    // Credit creator
    await User.findByIdAndUpdate(txn.creator, {
      $inc: {
        'balance.available': txn.netAmount,
        'balance.totalEarned': txn.netAmount,
        'stats.totalTransactions': 1,
      },
    });

    res.json({ success: true, message: 'Payment verified!', transactionId });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ═══════════════════════════════════════════════════════════
// CRYPTO (ETH / ERC-20 / Polygon)
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/payments/crypto/initiate
 * Returns a deposit address and expected amount for crypto payment
 */
const cryptoInitiate = async (req, res) => {
  try {
    const { slug, currency = 'ETH', customAmountUsd } = req.body;
    const link = await getLink(slug);

    let expectedAmount;
    let depositAddress = process.env.PLATFORM_WALLET_ADDRESS;
    const network = currency === 'MATIC' ? 'polygon' : 'ethereum';

    // Get current exchange rates (in production, use CoinGecko/Chainlink oracle)
    // Simplified mock rates here
    const rates = { ETH: 3200, BTC: 67000, MATIC: 0.98, USDT: 1 };
    const usdAmount = customAmountUsd || (link.pricing.amount / 100);
    const rate = rates[currency] || 1;
    expectedAmount = usdAmount / rate;

    const txn = await Transaction.create({
      creator: link.creator._id,
      paymentLink: link._id,
      payer: { ip: req.ip, userAgent: req.headers['user-agent'] },
      amount: {
        value: Math.round(expectedAmount * 1e18), // wei
        currency,
        usdEquivalent: Math.round(usdAmount * 100), // cents
        exchangeRate: rate,
      },
      fees: { platform: Math.ceil(usdAmount * PLATFORM_FEE * 100), gateway: 0 },
      netAmount: Math.round(usdAmount * (1 - PLATFORM_FEE) * 100),
      method: currency === 'USDT' ? 'usdt' : currency === 'MATIC' ? 'polygon' : currency.toLowerCase(),
      status: 'initiated',
      'gateway.crypto': {
        toAddress: depositAddress,
        network,
        requiredConfirmations: currency === 'BTC' ? 3 : 12,
      },
      fraud: { score: req.fraudScore || 0, flags: req.fraudFlags || [] },
    });

    res.json({
      success: true,
      depositAddress,
      currency,
      expectedAmount: expectedAmount.toFixed(8),
      usdEquivalent: usdAmount,
      exchangeRate: rate,
      transactionId: txn._id,
      // QR code data
      qrData: currency === 'ETH'
        ? `ethereum:${depositAddress}?value=${Math.round(expectedAmount * 1e18)}`
        : `bitcoin:${depositAddress}?amount=${expectedAmount}`,
      // Poll URL for frontend to check status
      statusUrl: `/api/payments/crypto/status/${txn._id}`,
      // Expires in 30 minutes
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
  } catch (error) {
    logger.error(`Crypto initiate error: ${error.message}`);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/payments/crypto/verify
 * Verifies an on-chain transaction by tx hash
 */
const cryptoVerify = async (req, res) => {
  try {
    const { transactionId, txHash } = req.body;

    const txn = await Transaction.findById(transactionId);
    if (!txn) return res.status(404).json({ success: false, message: 'Transaction not found' });
    if (txn.status === 'confirmed') {
      return res.json({ success: true, message: 'Already confirmed', transactionId });
    }

    const provider = getEthProvider();
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      return res.json({ success: false, message: 'Transaction not yet mined. Please wait.' });
    }

    const currentBlock = await provider.getBlockNumber();
    const confirmations = currentBlock - receipt.blockNumber;
    const required = txn.gateway.crypto.requiredConfirmations;

    await Transaction.findByIdAndUpdate(transactionId, {
      'gateway.crypto.txHash': txHash,
      'gateway.crypto.blockNumber': receipt.blockNumber,
      'gateway.crypto.confirmations': confirmations,
      'gateway.crypto.fromAddress': receipt.from,
      status: confirmations >= required ? 'confirmed' : 'pending',
      ...(confirmations >= required && { settledAt: new Date() }),
    });

    if (confirmations >= required) {
      // Credit creator balance
      await User.findByIdAndUpdate(txn.creator, {
        $inc: {
          'balance.available': txn.netAmount,
          'balance.totalEarned': txn.netAmount,
          'stats.totalTransactions': 1,
        },
      });
      logger.info(`Crypto payment confirmed: ${txHash}`);
    }

    res.json({
      success: true,
      confirmed: confirmations >= required,
      confirmations,
      required,
      txHash,
    });
  } catch (error) {
    logger.error(`Crypto verify error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/payments/crypto/status/:transactionId
 * Polling endpoint for frontend to check confirmation status
 */
const cryptoStatus = async (req, res) => {
  try {
    const txn = await Transaction.findById(req.params.transactionId)
      .select('status gateway.crypto amount fraud createdAt');

    if (!txn) return res.status(404).json({ success: false, message: 'Not found' });

    res.json({
      success: true,
      status: txn.status,
      confirmations: txn.gateway?.crypto?.confirmations || 0,
      required: txn.gateway?.crypto?.requiredConfirmations || 12,
      txHash: txn.gateway?.crypto?.txHash,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  stripeCheckout,
  stripeWebhook,
  razorpayOrder,
  razorpayVerify,
  cryptoInitiate,
  cryptoVerify,
  cryptoStatus,
};
