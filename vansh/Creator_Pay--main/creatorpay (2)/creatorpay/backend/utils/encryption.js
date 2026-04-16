const crypto = require('crypto');
const logger = require('./logger');

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ENCRYPTION_IV = process.env.ENCRYPTION_IV;

// Validate encryption keys on load
if (!ENCRYPTION_KEY || !ENCRYPTION_IV) {
  logger.error('⚠️  Missing ENCRYPTION_KEY or ENCRYPTION_IV - sensitive data will be unencrypted!');
  // In production, should crash: process.exit(1);
}

/**
 * Encrypt sensitive data (payout details, private keys, etc)
 */
const encrypt = (text) => {
  try {
    if (!ENCRYPTION_KEY || !ENCRYPTION_IV) {
      logger.warn('Encryption keys not configured, storing plaintext');
      return text;
    }
    
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
    // Fail open - return plaintext rather than losing data
    return text;
  }
};

/**
 * Decrypt sensitive data
 */
const decrypt = (encrypted) => {
  try {
    if (!ENCRYPTION_KEY || !ENCRYPTION_IV) {
      logger.warn('Encryption keys not configured, assuming plaintext');
      return typeof encrypted === 'string' ? JSON.parse(encrypted) : encrypted;
    }
    
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
    // If decryption fails, try parsing as plaintext (for migration)
    try {
      return typeof encrypted === 'string' ? JSON.parse(encrypted) : encrypted;
    } catch {
      return encrypted;
    }
  }
};

module.exports = { encrypt, decrypt };
