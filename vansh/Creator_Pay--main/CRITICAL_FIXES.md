# CreatorPay - Specific Code Fixes (Phase 0 - Critical)

## 1. FIX: HARDCODED EXCHANGE RATES → LIVE API

**File:** `backend/routes/payments.js` (duplicate in `backend/controllers/paymentController.js`)

**Current (Lines 112-114):**
```javascript
const rates = { ETH: 3200, BTC: 67000, MATIC: 0.98, USDT: 1 };
const usdAmount = customAmountUsd || (link.pricing.amount / 100);
const rate = rates[currency] || 1;
```

**Replace with:**
```javascript
// Create a new file: backend/utils/priceOracle.js
const axios = require('axios');
const logger = require('./logger');

const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price';
const CACHE_TTL = 60000; // 1 minute cache

let priceCache = {};
let cacheTime = 0;

const getRates = async (currencies = ['ethereum', 'bitcoin', 'matic', 'tether']) => {
  const now = Date.now();
  
  // Return cached if fresh
  if (cacheTime + CACHE_TTL > now) {
    return priceCache;
  }

  try {
    const res = await axios.get(COINGECKO_API, {
      params: {
        ids: currencies.join(','),
        vs_currencies: 'usd',
        timeout: 5000
      }
    });
    
    priceCache = {
      ETH: res.data.ethereum.usd,
      BTC: res.data.bitcoin.usd,
      MATIC: res.data.matic.usd,
      USDT: res.data.tether.usd
    };
    cacheTime = now;
    return priceCache;
  } catch (err) {
    logger.error(`Price oracle error: ${err.message}`);
    // Return last known rates on API failure
    return priceCache;
  }
};

module.exports = { getRates };
```

**Then in payments.js:**
```javascript
const { getRates } = require('../utils/priceOracle');

const cryptoInitiate = async (req, res) => {
  try {
    const { slug, currency = 'ETH', customAmountUsd } = req.body;
    const link = await getLink(slug);
    
    // ✅ FIX: Get live rates instead of hardcoded
    const rates = await getRates();
    const usdAmount = customAmountUsd || (link.pricing.amount / 100);
    const rate = rates[currency] || 1;
    
    if (!rate || rate === 1) {
      return res.status(400).json({ 
        success: false, 
        message: 'Price feed unavailable for this currency' 
      });
    }
    
    // ... rest of logic
  } catch (error) {
    // ...
  }
};
```

---

## 2. FIX: BALANCE RACE CONDITION → ATOMIC TRANSACTIONS

**Files:** All payment confirmation handlers in `paymentController.js` and `routes/payments.js`

**Current Problem:**
```javascript
// Multiple places do this independently:
await Transaction.findByIdAndUpdate(txn._id, { status: 'confirmed' });
await User.findByIdAndUpdate(txn.creator, { $inc: { 'balance.available': ... } });
await PaymentLink.findByIdAndUpdate(txn.paymentLink, { $inc: { 'stats.payments': 1 } });
// If multiple webhooks/verifications race, all execute!
```

**Fix - Create helper file: `backend/utils/transactionSettlement.js`**
```javascript
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const PaymentLink = require('../models/PaymentLink');
const logger = require('./logger');

/**
 * Atomically settle a transaction:
 * 1. Mark as confirmed
 * 2. Credit creator balance
 * 3. Update payment link stats
 * Uses MongoDB transaction for atomicity
 */
const settleTransaction = async (transactionId, updateData = {}) => {
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      // Get current transaction state
      const txn = await Transaction.findById(transactionId).session(session);
      
      if (!txn) {
        throw new Error('Transaction not found');
      }
      
      // Prevent double-settlement
      if (txn.status === 'confirmed' || txn.status === 'settled') {
        logger.warn(`Transaction ${transactionId} already settled`);
        return { success: false, message: 'Already settled' };
      }
      
      // Atomically update transaction
      await Transaction.findByIdAndUpdate(
        transactionId,
        {
          $set: {
            status: 'confirmed',
            settledAt: new Date(),
            ...updateData
          }
        },
        { session, new: true }
      );
      
      // Atomically credit creator balance
      const updatedUser = await User.findByIdAndUpdate(
        txn.creator,
        {
          $inc: {
            'balance.available': txn.netAmount,
            'balance.totalEarned': txn.netAmount,
            'stats.totalTransactions': 1
          }
        },
        { session, new: true }
      );
      
      if (!updatedUser) {
        throw new Error('Creator not found');
      }
      
      // Atomically update payment link stats
      if (txn.paymentLink) {
        await PaymentLink.findByIdAndUpdate(
          txn.paymentLink,
          {
            $inc: {
              'stats.payments': 1,
              'stats.totalRevenue': txn.amount.usdEquivalent
            }
          },
          { session }
        );
      }
      
      logger.info(`Transaction settled: ${transactionId}`);
      return { success: true, transaction: txn };
    });
    
  } catch (error) {
    logger.error(`Settlement failed: ${error.message}`);
    throw error;
  } finally {
    await session.endSession();
  }
};

module.exports = { settleTransaction };
```

**Then update Stripe webhook handler:**
```javascript
const { settleTransaction } = require('../utils/transactionSettlement');

const stripeWebhook = async (req, res) => {
  // ... signature verification code ...
  
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const txnId = session.metadata?.transactionId;
    
    try {
      // ✅ FIX: Use atomic settlement instead of separate updates
      await settleTransaction(txnId, {
        'gateway.stripe.chargeId': session.payment_intent
      });
      res.json({ received: true });
    } catch (error) {
      logger.error(`Webhook settlement failed: ${error.message}`);
      // Add to dead letter queue for retry
      res.status(500).json({ error: 'Processing failed' });
    }
  }
};
```

---

## 3. FIX: UNENCRYPTED PAYOUT DETAILS → ENCRYPTION

**File:** `backend/models/User.js`

**Current:**
```javascript
details: mongoose.Schema.Types.Mixed, // encrypted in production
```

**Fix - Add encryption utility: `backend/utils/encryption.js`**
```javascript
const crypto = require('crypto');
const logger = require('./logger');

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ENCRYPTION_IV = process.env.ENCRYPTION_IV;

if (!ENCRYPTION_KEY || !ENCRYPTION_IV) {
  logger.error('Missing ENCRYPTION_KEY or ENCRYPTION_IV env vars');
  process.exit(1);
}

const encrypt = (text) => {
  try {
    const cipher = crypto.createCipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, 'hex'),
      Buffer.from(ENCRYPTION_IV, 'hex')
    );
    let encrypted = cipher.update(JSON.stringify(text), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  } catch (error) {
    logger.error(`Encryption error: ${error.message}`);
    throw error;
  }
};

const decrypt = (encrypted) => {
  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, 'hex'),
      Buffer.from(ENCRYPTION_IV, 'hex')
    );
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (error) {
    logger.error(`Decryption error: ${error.message}`);
    throw error;
  }
};

module.exports = { encrypt, decrypt };
```

**Then update User.js:**
```javascript
const { encrypt, decrypt } = require('../utils/encryption');

const userSchema = new mongoose.Schema({
  // ... other fields ...
  
  payoutMethods: [{
    type: { type: String, enum: ['bank', 'razorpay', 'eth', 'btc', 'usdt'] },
    details: String, // Encrypted JSON string
    isDefault: Boolean,
    addedAt: { type: Date, default: Date.now },
  }],
  
  // ... rest of schema ...
});

// ✅ Pre-save: encrypt sensitive data
userSchema.pre('save', function(next) {
  if (!this.isModified('payoutMethods')) return next();
  
  this.payoutMethods = this.payoutMethods.map(method => ({
    ...method,
    details: method.details ? encrypt(method.details) : undefined
  }));
  next();
});

// ✅ Post-find hooks: decrypt sensitive data
const decryptMethods = (doc) => {
  if (doc && doc.payoutMethods) {
    doc.payoutMethods = doc.payoutMethods.map(method => ({
      ...method,
      details: method.details ? decrypt(method.details) : undefined
    }));
  }
  return doc;
};

userSchema.post('findOne', decryptMethods);
userSchema.post('find', function(docs) {
  return docs.map(decryptMethods);
});
userSchema.post('findOneAndUpdate', decryptMethods);

// ✅ Update to response serialization
userSchema.methods.toPublic = function() {
  const obj = this.toObject();
  // Never expose payout details in public response
  obj.payoutMethods = (obj.payoutMethods || []).map(m => ({
    type: m.type,
    isDefault: m.isDefault,
    addedAt: m.addedAt,
    // details: CUT
  }));
  return {
    id: obj._id,
    name: obj.name,
    email: obj.email,
    // ... other safe fields ...
    payoutMethods: obj.payoutMethods
  };
};

module.exports = mongoose.model('User', userSchema);
```

**Add to .env.example:**
```
# Encryption for sensitive data (payout methods, etc)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your_32_byte_hex_key_here
ENCRYPTION_IV=your_16_byte_hex_iv_here
```

---

## 4. FIX: NO CRYPTO MONITORING → IMPLEMENT POLLING JOB

**File:** Create `backend/jobs/monitorCryptoPayments.js`

```javascript
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { getEthProvider, formatEth } = require('../config/web3');
const logger = require('../utils/logger');
const { settleTransaction } = require('../utils/transactionSettlement');

/**
 * Background job to monitor pending crypto transactions
 * Runs every 30 seconds
 */
const monitorCryptoPayments = async () => {
  try {
    const provider = getEthProvider();
    
    // Find all pending Ethereum/ERC-20 transactions
    const pendingTxns = await Transaction.find({
      status: 'pending',
      method: { $in: ['eth', 'polygon', 'usdt'] },
      'gateway.crypto.txHash': { $exists: true }
    });
    
    for (const txn of pendingTxns) {
      try {
        const txHash = txn.gateway.crypto.txHash;
        const receipt = await provider.getTransactionReceipt(txHash);
        
        if (!receipt) {
          // Transaction not yet mined
          continue;
        }
        
        const currentBlock = await provider.getBlockNumber();
        const confirmations = currentBlock - receipt.blockNumber;
        const required = txn.gateway.crypto.requiredConfirmations || 12;
        
        // Update confirmation count
        await Transaction.findByIdAndUpdate(txn._id, {
          'gateway.crypto.confirmations': confirmations,
          'gateway.crypto.blockNumber': receipt.blockNumber
        });
        
        // Settle if enough confirmations
        if (confirmations >= required) {
          await settleTransaction(txn._id);
          logger.info(`Crypto payment auto-settled: ${txHash}`);
        }
      } catch (error) {
        logger.error(`Error monitoring txn ${txn._id}: ${error.message}`);
        // Continue to next transaction
      }
    }
  } catch (error) {
    logger.error(`Crypto monitoring job failed: ${error.message}`);
  }
};

module.exports = { monitorCryptoPayments };
```

**Add to server.js:**
```javascript
const { monitorCryptoPayments } = require('./jobs/monitorCryptoPayments');

// ✅ Start monitoring job
setInterval(() => {
  monitorCryptoPayments().catch(err => logger.error(`Job error: ${err.message}`));
}, 30000); // Every 30 seconds
```

---

## 5. FIX: NO REFUND MECHANISM → ADD ENDPOINT

**File:** Create `backend/routes/refunds.js`**

```javascript
const router = require('express').Router();
const { protect, adminOnly } = require('../middleware/auth');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Razorpay = require('razorpay');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * POST /api/refunds/:transactionId
 * Refund a transaction (admin only or creator if owns it)
 */
router.post('/:transactionId', protect, async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { reason } = req.body;
    
    if (!reason || reason.length < 10) {
      return res.status(400).json({ 
        success: false, 
        message: 'Reason required (min 10 chars)' 
      });
    }
    
    const txn = await Transaction.findById(req.params.transactionId);
    
    if (!txn) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    
    // Check permissions: admin or creator who owns the transaction
    const isAdmin = req.user.role === 'admin';
    const isCreator = txn.creator.toString() === req.user._id.toString();
    
    if (!isAdmin && !isCreator) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    
    if (txn.status === 'refunded') {
      return res.status(400).json({ success: false, message: 'Already refunded' });
    }
    
    if (!['confirmed', 'settled'].includes(txn.status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Can only refund confirmed payments' 
      });
    }
    
    await session.withTransaction(async () => {
      // Dispatch refund based on payment method
      let refundId;
      
      if (txn.method === 'stripe') {
        const refund = await stripe.refunds.create({
          payment_intent: txn.gateway.stripe.paymentIntentId,
          reason: 'requested_by_customer'
        });
        refundId = refund.id;
        
      } else if (txn.method === 'razorpay') {
        const refund = await razorpay.payments.refund(
          txn.gateway.razorpay.paymentId,
          {
            notes: { reason }
          }
        );
        refundId = refund.id;
        
      } else if (['eth', 'polygon', 'usdt'].includes(txn.method)) {
        // ✅ TODO: Implement crypto refund (send funds back to payer wallet)
        // This is complex and requires hot wallet transfer
        logger.warn(`Crypto refund initiated - requires manual processing: ${txn._id}`);
      }
      
      // Update transaction
      const updatedTxn = await Transaction.findByIdAndUpdate(
        txn._id,
        {
          status: 'refunded',
          refundReason: reason,
          'gateway.refundId': refundId,
          refundedAt: new Date()
        },
        { session, new: true }
      );
      
      // Reverse creator balance (move back to pending so they can't spend it)
      await User.findByIdAndUpdate(
        txn.creator,
        {
          $inc: {
            'balance.available': -txn.netAmount,
            'balance.pending': txn.netAmount  // Back to pending
          }
        },
        { session }
      );
      
      logger.info(`Transaction refunded: ${txn._id} - ${refundId}`);
    });
    
    res.json({ 
      success: true, 
      message: 'Refund initiated',
      transactionId: req.params.transactionId 
    });
    
  } catch (error) {
    logger.error(`Refund error: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    await session.endSession();
  }
});

module.exports = router;
```

**Add to server.js:**
```javascript
app.use('/api/refunds', require('./routes/refunds'));
```

---

## 6. FIX: NO IDEMPOTENCY KEYS → PREVENT DUPLICATE CHARGES

**File:** Create `backend/middleware/idempotency.js`

```javascript
const crypto = require('crypto');
const ProcessedRequest = require('../models/ProcessedRequest');

const idempotencyKey = async (req, res, next) => {
  // Only for state-changing requests
  if (!['POST', 'PUT', 'DELETE'].includes(req.method)) {
    return next();
  }
  
  const key = req.headers['idempotency-key'];
  
  if (!key) {
    return res.status(400).json({ 
      success: false, 
      message: 'Idempotency-Key header required for state-changing requests' 
    });
  }
  
  // Check if we've already processed this
  const existing = await ProcessedRequest.findOne({ idempotencyKey: key });
  
  if (existing) {
    return res.status(200).json(existing.response);
  }
  
  // Store original res.json to intercept response
  const originalJson = res.json.bind(res);
  
  res.json = function(response) {
    // Cache the successful response
    if (res.statusCode < 400) {
      ProcessedRequest.create({
        idempotencyKey: key,
        method: req.method,
        path: req.path,
        response,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h expiry
      }).catch(err => console.error('Idempotency cache error:', err));
    }
    
    return originalJson(response);
  };
  
  next();
};

module.exports = { idempotencyKey };
```

**Create new model: `backend/models/ProcessedRequest.js`**
```javascript
const mongoose = require('mongoose');

const processedRequestSchema = new mongoose.Schema({
  idempotencyKey: { type: String, required: true, unique: true },
  method: String,
  path: String,
  response: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now, expires: 86400 } // TTL: 24h
});

module.exports = mongoose.model('ProcessedRequest', processedRequestSchema);
```

**Add to server.js before routes:**
```javascript
const { idempotencyKey } = require('./middleware/idempotency');
app.use(idempotencyKey);
```

**Client usage in frontend:**
```javascript
// In api.js
import { v4 as uuidv4 } from 'uuid';

api.interceptors.request.use((config) => {
  if (['POST', 'PUT', 'DELETE'].includes(config.method?.toUpperCase())) {
    config.headers['Idempotency-Key'] = uuidv4();
  }
  return config;
});
```

---

## 7. FIX: MONGOOSE DUPLICATE INDEX WARNING

**Run in MongoDB shell:**
```javascript
// Connect to your database first
use creatorpay;

// Drop all indexes (they'll be recreated from schema)
db.users.dropIndexes();
db.paymentlinks.dropIndexes();
db.transactions.dropIndexes();
db.withdrawals.dropIndexes();
```

**Add to server.js startup:**
```javascript
connectDB();

// On "connected" event
const db = mongoose.connection;
db.on('connected', async () => {
  try {
    // Ensure indexes exist
    await Promise.all([
      require('./models/User').collection.createIndexes(),
      require('./models/PaymentLink').collection.createIndexes(),
      require('./models/Transaction').collection.createIndexes(),
      require('./models/Withdrawal').collection.createIndexes(),
    ]);
    logger.info('Database indexes verified');
  } catch (err) {
    logger.error(`Index verification failed: ${err.message}`);
  }
});
```

---

## 8. FIX: INPUT VALIDATION → ADD VALIDATORS

**File:** `backend/routes/links.js`

**Current:**
```javascript
router.post('/', protect, async (req, res) => {
  try {
    // ... missing validation
    const link = await PaymentLink.create({ creator: req.user._id, ...req.body });
```

**Fix:**
```javascript
const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const PaymentLink = require('../models/PaymentLink');

router.post('/', protect, [
  body('name')
    .trim()
    .notEmpty().withMessage('Name required')
    .isLength({ max: 100 }).withMessage('Name max 100 chars'),
  body('description')
    .optional()
    .isLength({ max: 500 }).withMessage('Description max 500 chars'),
  body('pricing.type')
    .isIn(['fixed', 'custom', 'suggested']).withMessage('Invalid pricing type'),
  body('pricing.amount')
    .if(() => body('pricing.type').value === 'fixed')
    .isInt({ min: 50 }).withMessage('Amount min $0.50'),
  body('pricing.currency')
    .isIn(['USD', 'INR', 'EUR']).withMessage('Unsupported currency'),
  body('acceptedMethods')
    .optional()
    .isObject().withMessage('acceptedMethods must be object'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  
  try {
    const link = await PaymentLink.create({ 
      creator: req.user._id, 
      ...req.body 
    });
    res.status(201).json({ success: true, link });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
```

---

## 9. FIX: ADMIN AUDIT LOGGING

**Create model: `backend/models/AuditLog.js`**
```javascript
const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    enum: ['SUSPEND_USER', 'UNSUSPEND_USER', 'FRAUD_ACTION', 'REFUND', 'EXPORT_DATA'],
    required: true
  },
  targetUser: mongoose.Schema.Types.ObjectId,
  targetTransaction: mongoose.Schema.Types.ObjectId,
  details: mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now, index: true }
});

auditLogSchema.index({ admin: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
```

**Update admin routes:**
```javascript
const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

router.put('/users/:id/suspend', async (req, res) => {
  try {
    const { suspend, reason } = req.body;
    
    // ✅ Log the action
    await AuditLog.create({
      admin: req.user._id,
      action: suspend ? 'SUSPEND_USER' : 'UNSUSPEND_USER',
      targetUser: req.params.id,
      details: { reason, timestamp: new Date() }
    });
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        isSuspended: suspend,
        suspendReason: suspend ? reason : null
      },
      { new: true }
    );
    
    logger.warn(`Admin ${req.user._id} ${suspend ? 'suspended' : 'unsuspended'} user ${req.params.id}`);
    
    res.json({ success: true, user: user.toPublic() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
```

---

## 10. FIX: RATE LIMITING ON PAYMENT ENDPOINTS

**File:** `backend/server.js`

**Current:**
```javascript
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
```

**Fix:**
```javascript
const rateLimit = require('express-rate-limit');

// Global limit
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests' }
});

// Strict limit for payment creation
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // per hour
  max: 20,
  keyGenerator: (req) => req.user?._id || req.ip,
  message: { success: false, message: 'Too many payment requests' }
});

// Strict limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // per 15 min
  max: 5,
  keyGenerator: (req) => req.body?.email || req.ip,
  message: { success: false, message: 'Too many login attempts' }
});

app.use('/api/', globalLimiter);
app.use('/api/payments/stripe/checkout', paymentLimiter);
app.use('/api/payments/razorpay/order', paymentLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
```

---

These 10 critical fixes address the main production issues. Implement in this order:
1. Exchange rates
2. Balance transactions
3. Encryption
4. Crypto monitoring + settlement
5. Refunds
6. Idempotency
7. Index warning
8. Input validation
9. Audit logging
10. Rate limiting

Estimated time: 2-3 days for experienced developer, 5-7 days for team.
