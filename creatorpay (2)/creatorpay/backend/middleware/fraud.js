const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');

/**
 * Fraud detection middleware — scores incoming payment requests
 * Attaches req.fraudScore and req.fraudFlags before payment processing
 */
const detectFraud = async (req, res, next) => {
  const flags = [];
  let score = 0;

  try {
    const ip = req.ip || req.connection.remoteAddress;
    const { email, walletAddress } = req.body;
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    // ── Rule 1: Velocity — too many requests from same IP ──────────
    const recentByIp = await Transaction.countDocuments({
      'payer.ip': ip,
      createdAt: { $gte: new Date(now - oneHour) },
    });
    if (recentByIp > 20) {
      score += 40;
      flags.push(`velocity_ip:${recentByIp}_per_hour`);
    } else if (recentByIp > 10) {
      score += 15;
      flags.push(`moderate_velocity_ip`);
    }

    // ── Rule 2: Same email, multiple failures ──────────────────────
    if (email) {
      const failedByEmail = await Transaction.countDocuments({
        'payer.email': email,
        status: 'failed',
        createdAt: { $gte: new Date(now - 24 * oneHour) },
      });
      if (failedByEmail >= 3) {
        score += 25;
        flags.push(`repeated_failures:${failedByEmail}`);
      }
    }

    // ── Rule 3: Unusually large amount ────────────────────────────
    const amount = req.body.amount?.value || req.body.amount;
    if (amount > 500000) { // > $5000 USD equivalent (in cents)
      score += 20;
      flags.push('large_amount');
    }

    // ── Rule 4: Mismatched geo (simplified check) ─────────────────
    // In production, integrate with MaxMind or ip-api.com
    const suspiciousIpRanges = ['103.21.244', '185.220.101']; // example Tor exit nodes
    if (suspiciousIpRanges.some(range => ip.startsWith(range))) {
      score += 30;
      flags.push('suspicious_ip_range');
    }

    // ── Rule 5: New wallet address with large tx ──────────────────
    if (walletAddress) {
      const priorTxByWallet = await Transaction.countDocuments({
        'payer.walletAddress': walletAddress,
        status: 'confirmed',
      });
      if (priorTxByWallet === 0 && amount > 100000) {
        score += 15;
        flags.push('new_wallet_large_amount');
      }
    }

    req.fraudScore = Math.min(score, 100);
    req.fraudFlags = flags;

    // Block if score is critically high
    if (score >= 80) {
      logger.warn(`Fraud blocked: score=${score} ip=${ip} flags=${flags.join(',')}`);
      return res.status(403).json({
        success: false,
        message: 'Transaction blocked due to suspicious activity. Contact support if this is a mistake.',
      });
    }

    next();
  } catch (error) {
    // Don't block payments if fraud check itself errors
    logger.error(`Fraud check error: ${error.message}`);
    req.fraudScore = 0;
    req.fraudFlags = [];
    next();
  }
};

module.exports = { detectFraud };
