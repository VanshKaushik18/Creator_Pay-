const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const paymentLinkSchema = new mongoose.Schema({
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  // Link identity
  slug: {
    type: String,
    unique: true,
    default: () => uuidv4().split('-')[0] + uuidv4().split('-')[0],
  },
  name: {
    type: String,
    required: [true, 'Link name is required'],
    trim: true,
    maxlength: 100,
  },
  description: { type: String, maxlength: 500 },
  image: String,

  // Pricing
  pricing: {
    type: {
      type: String,
      enum: ['fixed', 'custom', 'suggested'],
      default: 'fixed',
    },
    amount: { type: Number, min: 0 },       // in smallest unit (cents for USD, paise for INR)
    currency: { type: String, default: 'USD' },
    minAmount: Number,
    maxAmount: Number,
    // Crypto: amount in wei / satoshis or a USD-equivalent that gets converted at checkout
    cryptoAmounts: {
      ETH: Number,   // in wei
      BTC: Number,   // in satoshis
      MATIC: Number, // in wei
      USDT: Number,  // in micro-USDT (6 decimals)
    },
  },

  // Accepted payment methods
  acceptedMethods: {
    stripe: { type: Boolean, default: true },
    razorpay: { type: Boolean, default: true },
    eth: { type: Boolean, default: true },
    btc: { type: Boolean, default: false },
    polygon: { type: Boolean, default: false },
    usdt: { type: Boolean, default: false },
  },

  // Limits
  limits: {
    maxPayments: Number,         // null = unlimited
    expiresAt: Date,             // null = never
    onePerCustomer: { type: Boolean, default: false },
  },

  // Redirect
  successUrl: String,
  cancelUrl: String,

  // Stats (denormalized)
  stats: {
    views: { type: Number, default: 0 },
    payments: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 }, // cents USD equivalent
  },

  isActive: { type: Boolean, default: true },
  isArchived: { type: Boolean, default: false },
}, {
  timestamps: true,
});

// ─── Indexes ───────────────────────────────────────────────
paymentLinkSchema.index({ slug: 1 });
paymentLinkSchema.index({ creator: 1, isActive: 1 });
paymentLinkSchema.index({ createdAt: -1 });

// ─── Virtual: public URL ────────────────────────────────────
paymentLinkSchema.virtual('url').get(function () {
  return `${process.env.FRONTEND_URL}/pay/${this.slug}`;
});

// ─── Method: check if expired ──────────────────────────────
paymentLinkSchema.methods.isExpired = function () {
  if (!this.limits.expiresAt) return false;
  return new Date() > this.limits.expiresAt;
};

paymentLinkSchema.methods.isFull = function () {
  if (!this.limits.maxPayments) return false;
  return this.stats.payments >= this.limits.maxPayments;
};

module.exports = mongoose.model('PaymentLink', paymentLinkSchema);
