const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
  username: { type: String, unique: true, sparse: true, trim: true, lowercase: true },
  bio: { type: String, maxlength: 300 },
  avatarUrl: String,
  website: String,

  // Balances (in USD cents to avoid floating point)
  balance: {
    available: { type: Number, default: 0 },   // cents
    pending: { type: Number, default: 0 },      // cents
    totalEarned: { type: Number, default: 0 },  // cents
  },

  // Payout info
  payoutMethods: [{
    type: { type: String, enum: ['bank', 'razorpay', 'eth', 'btc', 'usdt'] },
    details: mongoose.Schema.Types.Mixed, // encrypted in production
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

// ─── Indexes ───────────────────────────────────────────────
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });

// ─── Virtual: isLocked ─────────────────────────────────────
userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// ─── Pre-save: hash password ───────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

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
