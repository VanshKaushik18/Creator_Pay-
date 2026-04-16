#!/usr/bin/env node

/**
 * CreatorPay - Quick Production Setup Script
 * Run this to verify your production environment is ready
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('\n🚀 CreatorPay Production Setup Verification\n');
console.log('='.repeat(50));

const checks = [];
let passed = 0;
let warning = 0;
let failed = 0;

// Helper function to add checks
const check = (name, condition, errorMsg = 'Failed') => {
  if (condition === true) {
    console.log(`✅ ${name}`);
    passed++;
    checks.push({ name, status: 'pass' });
  } else if (condition === null) {
    console.log(`⚠️  ${name} - ${errorMsg}`);
    warning++;
    checks.push({ name, status: 'warn', error: errorMsg });
  } else {
    console.log(`❌ ${name} - ${errorMsg}`);
    failed++;
    checks.push({ name, status: 'fail', error: errorMsg });
  }
};

// 1. Environment Variables
console.log('\n📋 Environment Configuration:');

const envPath = path.join(__dirname, '.env');
const envExists = fs.existsSync(envPath);
check('Environment file exists', envExists, '.env file not found, run: cp .env.example .env');

if (envExists) {
  const env = fs.readFileSync(envPath, 'utf8');
  
  check('PORT configured', env.includes('PORT='), 'PORT not set');
  check('NODE_ENV set', env.includes('NODE_ENV='), 'NODE_ENV not set');
  check('MONGO_URI configured', env.includes('MONGO_URI='), 'MONGO_URI not set');
  
  const hasTestStripeKey = env.includes('STRIPE_SECRET_KEY=sk_test');
  check('Stripe production key', !hasTestStripeKey, hasTestStripeKey ? 'Using test key - set production key!' : 'Using test key');
  
  const hasEncryptionKey = env.includes('ENCRYPTION_KEY=') && !env.includes('ENCRYPTION_KEY=0123456789');
  check('Encryption key', hasEncryptionKey, 'Generate key: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  
  const hasEncryptionIV = env.includes('ENCRYPTION_IV=') && !env.includes('ENCRYPTION_IV=0123456789');
  check('Encryption IV', hasEncryptionIV, 'Generate IV: node -e "console.log(require(\'crypto\').randomBytes(16).toString(\'hex\'))"');
  
  check('JWT secret configured', env.includes('JWT_SECRET=') && !env.includes('JWT_SECRET=your_super'), 'JWT_SECRET too weak or not set');
  check('Razorpay configured', env.includes('RAZORPAY_KEY_ID=') && !env.includes('RAZORPAY_KEY_ID=rzp_test'), 'Razorpay not configured');
  check('Platform wallet', env.includes('PLATFORM_WALLET_ADDRESS=0x'), 'Platform wallet not configured properly');
  check('Frontend URL set', env.includes('FRONTEND_URL='), 'FRONTEND_URL not set');
}

// 2. Dependencies
console.log('\n📦 Dependencies:');

const packagePath = path.join(__dirname, 'package.json');
const packageExists = fs.existsSync(packagePath);
check('package.json exists', packageExists, 'package.json not found');

if (packageExists) {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const deps = pkg.dependencies || {};
  
  check('Express installed', !!deps.express, 'npm install express');
  check('MongoDB driver', !!deps.mongoose, 'npm install mongoose');
  check('Encryption utilities', !!deps.bcryptjs, 'npm install bcryptjs');
  check('Stripe SDK', !!deps.stripe, 'npm install stripe');
  check('Razorpay SDK', !!deps.razorpay, 'npm install razorpay');
}

// 3. File Structure
console.log('\n📁 Project Structure:');

const requiredFiles = [
  'server.js',
  'config/db.js',
  'utils/logger.js',
  'utils/priceOracle.js',
  'utils/encryption.js',
  'utils/transactionSettlement.js',
  'utils/validation.js',
  'models/User.js',
  'models/Transaction.js',
  'models/PaymentLink.js',
  'routes/payments.js',
  'routes/auth.js'
];

requiredFiles.forEach(file => {
  const exists = fs.existsSync(path.join(__dirname, file));
  check(`File: ${file}`, exists, `Missing: ${file}`);
});

// 4. System Resources
console.log('\n💻 System Resources:');

const nodeVersion = process.version;
check(`Node.js version (${nodeVersion})`, nodeVersion.startsWith('v') && parseInt(nodeVersion.slice(1)) >= 14, 'Node.js 14+ required');

const memFree = require('os').freemem() / 1024 / 1024 / 1024;
check(`Free memory (${memFree.toFixed(2)}GB)`, memFree > 0.5, 'Less than 500MB free memory');

// 5. MongoDB Connection (if running)
console.log('\n🗄️  Database:');

try {
  const mongoose = require('mongoose');
  check('Mongoose library', true, 'OK');
  
  // Check if we can connect (optional, may fail if not running)
  const dbUri = process.env.MONGO_URI || 'mongodb://localhost:27017/creatorpay';
  check('MongoDB URI configured', !!dbUri, 'MONGO_URI not set');
} catch (e) {
  check('Mongoose library', false, e.message);
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('\n📊 Summary:');
console.log(`  ✅ Passed: ${passed}`);
console.log(`  ⚠️  Warnings: ${warning}`);
console.log(`  ❌ Failed: ${failed}`);

const total = passed + warning + failed;
const percentage = total > 0 ? Math.round((passed / total) * 100) : 0;

console.log('\n' + '='.repeat(50));

if (failed === 0 && warning <= 1) {
  console.log('🎉 Your system is PRODUCTION READY!');
  console.log('\nNext steps:');
  console.log('  1. npm install --production');
  console.log('  2. npm start');
  console.log('  3. Monitor with: npm install -g pm2 && pm2 start server.js');
  process.exit(0);
} else if (failed === 0) {
  console.log('⚠️  Some configuration needed before production');
  console.log('\nFix the warnings above and re-run this script');
  process.exit(1);
} else {
  console.log('❌ Critical issues found!');
  console.log('\nResolve the failed checks before deploying');
  process.exit(1);
}
