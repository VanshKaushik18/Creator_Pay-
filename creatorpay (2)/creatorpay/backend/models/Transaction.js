const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // Parties
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  paymentLink: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PaymentLink',
  },

  // Payer info (may be anonymous for crypto)
  payer: {
    name: String,
    email: String,
    phone: String,
    walletAddress: String,  // for crypto
    ip: String,
    userAgent: String,
    country: String,
  },

  // Amounts
  amount: {
    value: { type: Number, required: true },     // in smallest unit
    currency: { type: String, required: true },  // USD, INR, ETH, BTC, etc.
    usdEquivalent: Number,                       // always stored for analytics
    exchangeRate: Number,                        // rate at time of payment
  },

  // Fees
  fees: {
    platform: { type: Number, default: 0 },     // CreatorPay fee (cents)
    gateway: { type: Number, default: 0 },       // Stripe/Razorpay fee (cents)
    total: { type: Number, default: 0 },
  },

  // Net amount credited to creator
  netAmount: Number, // cents USD equivalent

  // Payment method
  method: {
    type: String,
    enum: ['stripe', 'razorpay', 'eth', 'btc', 'polygon', 'usdt'],
    required: true,
  },

  // Gateway-specific data
  gateway: {
    stripe: {
      paymentIntentId: String,
      chargeId: String,
      customerId: String,
    },
    razorpay: {
      orderId: String,
      paymentId: String,
      signature: String,
    },
    crypto: {
      txHash: String,
      blockNumber: Number,
      fromAddress: String,
      toAddress: String,
      confirmations: { type: Number, default: 0 },
      requiredConfirmations: { type: Number, default: 3 },
      network: String,   // mainnet, sepolia, polygon, etc.
      tokenContract: String, // for ERC-20 tokens
    },
  },

  // Status
  status: {
    type: String,
    enum: ['initiated', 'pending', 'confirmed', 'settled', 'failed', 'refunded', 'disputed'],
    default: 'initiated',
    index: true,
  },

  // Fraud score
  fraud: {
    score: { type: Number, default: 0 },  // 0-100
    flags: [String],
    reviewed: { type: Boolean, default: false },
    action: { type: String, enum: ['none', 'flagged', 'blocked', 'refunded'], default: 'none' },
  },

  // Metadata
  note: String,        // payer's note
  refundReason: String,
  settledAt: Date,     // when credited to creator balance
}, {
  timestamps: true,
});

// ─── Indexes ───────────────────────────────────────────────
transactionSchema.index({ creator: 1, status: 1 });
transactionSchema.index({ 'gateway.crypto.txHash': 1 });
transactionSchema.index({ 'gateway.stripe.paymentIntentId': 1 });
transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ 'fraud.score': -1 });

// ─── Static: get creator revenue analytics ─────────────────
transactionSchema.statics.getRevenueAnalytics = async function (creatorId, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return this.aggregate([
    {
      $match: {
        creator: creatorId,
        status: 'settled',
        createdAt: { $gte: since },
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          method: '$method',
        },
        total: { $sum: '$amount.usdEquivalent' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.date': 1 } },
  ]);
};

module.exports = mongoose.model('Transaction', transactionSchema);
