const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  amount: {
    value: { type: Number, required: true }, // in cents (USD)
    currency: { type: String, default: 'USD' },
  },

  method: {
    type: String,
    enum: ['bank', 'razorpay', 'eth', 'btc', 'usdt'],
    required: true,
  },

  destination: {
    // Bank
    bankName: String,
    accountNumber: String, // masked in responses
    ifsc: String,
    // Crypto
    walletAddress: String,
    network: String,
    // Razorpay
    razorpayContactId: String,
    razorpayFundAccountId: String,
  },

  // Payout execution
  payout: {
    txHash: String,    // for crypto payouts
    razorpayPayoutId: String,
    stripeTransferId: String,
    executedAt: Date,
  },

  fees: {
    platform: { type: Number, default: 0 },
    network: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },

  netAmount: Number, // after fees

  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending',
    index: true,
  },

  failureReason: String,
  notes: String,
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // admin
}, {
  timestamps: true,
});

withdrawalSchema.index({ creator: 1, createdAt: -1 });
withdrawalSchema.index({ status: 1 });

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
