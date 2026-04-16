const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { encrypt, decrypt } = require('../utils/encryption');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [80, 'Name cannot exceed 80 characters'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    index: true,
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false, // Never return password in queries by default
  },
  role: {
    type: String,
    enum: ['creator', 'admin'],
    default: 'creator',
    index: true,
  },
  plan: {
    type: String,
    enum: ['free', 'pro', 'enterprise'],
    default: 'free',
  },

  // KYC
  kyc: {
    status: { type: String, enum: ['unverified', 'pending', 'verified', 'rejected'], default: 'unverified' },
    submittedAt: Date,
    verifiedAt: Date,
    documentType: String,
    documentUrl: String,
  },

  // Profile
  username: { 
    type: String, 
    unique: true, 
    sparse: true, 
    trim: true, 
    lowercase: true,
    index: true,
  },
  bio: { type: String, maxlength: 300 },
  avatarUrl: String,
  website: String,

  // Balances (in USD cents to avoid floating point)
  balance: {
    available: { type: Number, default: 0 },   // cents
    pending: { type: Number, default: 0 },      // cents
    totalEarned: { type: Number, default: 0 },  // cents
  },

  // Payout info (encrypted)
  payoutMethods: [{
    type: { type: String, enum: ['bank', 'razorpay', 'eth', 'btc', 'usdt'] },
    details: { type: String, default: '' }, // JSON string, encrypted
    isDefault: Boolean,
    addedAt: { type: Date, default: Date.now },
  }],

  // Security
  isActive: { type: Boolean, default: true },
  isSuspended: { type: Boolean, default: false },
  suspendReason: String,
  lastLogin: Date,
  loginAttempts: { type: Number, default: 0 },
  lockUntil: Date,

  // Stats (denormalized for fast dashboard reads)
  stats: {
    totalLinks: { type: Number, default: 0 },
    totalTransactions: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// ─── Only declare indexes on fields with index: true ─────
// (unique constraints already create indexes automatically)

// ─── Virtual: isLocked ─────────────────────────────────────
userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// ─── Pre-save: encrypt payout details ──────────────────────
userSchema.pre('save', async function (next) {
  // Hash password
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  }
  
  // Encrypt payout details
  if (this.isModified('payoutMethods')) {
    this.payoutMethods = this.payoutMethods.map(m => ({
      ...m,
      details: m.details ? encrypt(m.details) : ''
    }));
  }
  
  next();
});

// ─── Post-find: decrypt payout details ────────────────────
const decryptPayoutMethods = function() {
  if (this.payoutMethods && Array.isArray(this.payoutMethods)) {
    this.payoutMethods = this.payoutMethods.map(m => ({
      ...m,
      details: m.details ? decrypt(m.details) : {}
    }));
  }
};

userSchema.post('find', function(docs) {
  if (Array.isArray(docs)) {
    docs.forEach(decryptPayoutMethods);
  }
});

userSchema.post('findOne', decryptPayoutMethods);
userSchema.post('findOneAndUpdate', decryptPayoutMethods);

// ─── Method: compare password ──────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ─── Method: handle failed login attempt ──────────────────
userSchema.methods.incLoginAttempts = async function () {
  // Reset lock if expired
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({ $set: { loginAttempts: 1 }, $unset: { lockUntil: 1 } });
  }
  const updates = { $inc: { loginAttempts: 1 } };
  // Lock after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 };
  }
  return this.updateOne(updates);
};

// ─── Method: sanitize for response ────────────────────────
userSchema.methods.toPublic = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    username: this.username,
    role: this.role,
    plan: this.plan,
    kyc: this.kyc,
    balance: this.balance,
    stats: this.stats,
    avatarUrl: this.avatarUrl,
    bio: this.bio,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
