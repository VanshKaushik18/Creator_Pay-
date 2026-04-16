const logger = require('./logger');

/**
 * Validate and sanitize payment amounts
 */
const validateAmount = (amount, minCents = 100, maxCents = 999999900) => {
  const amt = parseInt(amount);
  
  if (isNaN(amt)) {
    throw new Error('Amount must be a number');
  }
  
  if (amt < minCents) {
    throw new Error(`Minimum amount is $${minCents / 100}`);
  }
  
  if (amt > maxCents) {
    throw new Error(`Maximum amount is $${maxCents / 100}`);
  }
  
  return amt;
};

/**
 * Validate crypto addresses
 */
const validateCryptoAddress = (address, currency) => {
  if (!address || typeof address !== 'string') {
    throw new Error('Invalid address format');
  }
  
  const sanitized = address.trim().toLowerCase();
  
  switch (currency.toUpperCase()) {
    case 'ETH':
    case 'MATIC':
    case 'USDT':
      // Ethereum-compatible addresses
      if (!/^0x[a-f0-9]{40}$/.test(sanitized)) {
        throw new Error('Invalid Ethereum address');
      }
      return sanitized;
      
    case 'BTC':
      // Bitcoin addresses (P2PKH, P2SH, Segwit)
      if (!/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{22,41}$/.test(address)) {
        throw new Error('Invalid Bitcoin address');
      }
      return address;
      
    default:
      throw new Error('Unsupported currency');
  }
};

/**
 * Validate email format
 */
const validateEmail = (email) => {
  const sanitized = String(email).toLowerCase().trim();
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!regex.test(sanitized) || sanitized.length > 255) {
    throw new Error('Invalid email format');
  }
  
  return sanitized;
};

/**
 * Validate URL slug (alphanumeric + hyphens)
 */
const validateSlug = (slug) => {
  if (!/^[a-z0-9-]{3,50}$/.test(slug)) {
    throw new Error('Slug must be 3-50 characters, alphanumeric and hyphens only');
  }
  return slug;
};

/**
 * Sanitize user input to prevent XSS
 */
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .substring(0, 500); // Limit length
};

/**
 * Validate required fields
 */
const validateRequired = (obj, fields) => {
  for (const field of fields) {
    if (!obj[field] || (typeof obj[field] === 'string' && !obj[field].trim())) {
      throw new Error(`${field} is required`);
    }
  }
};

/**
 * Generate idempotency key for payment operations
 */
const generateIdempotencyKey = (creator, amount, description) => {
  const crypto = require('crypto');
  return crypto
    .createHash('sha256')
    .update(`${creator}-${amount}-${description}-${Date.now()}`)
    .digest('hex');
};

module.exports = {
  validateAmount,
  validateCryptoAddress,
  validateEmail,
  validateSlug,
  sanitizeInput,
  validateRequired,
  generateIdempotencyKey
};
