require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const PaymentLink = require('../models/PaymentLink');
const Transaction = require('../models/Transaction');
const logger = require('./logger');

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  logger.info('Connected to MongoDB for seeding...');

  // Clear existing
  await User.deleteMany({});
  await PaymentLink.deleteMany({});
  await Transaction.deleteMany({});

  // Admin
  const admin = await User.create({
    name: 'Admin',
    email: process.env.ADMIN_EMAIL || 'admin@creatorpay.io',
    password: process.env.ADMIN_PASSWORD || 'Admin123!',
    role: 'admin',
    plan: 'enterprise',
    'kyc.status': 'verified',
  });

  // Creator
  const creator = await User.create({
    name: 'Aryan Kumar',
    email: 'aryan@example.com',
    password: 'Creator123!',
    username: 'aryan',
    role: 'creator',
    plan: 'pro',
    'kyc.status': 'verified',
    bio: 'Designer & developer. I build things.',
    'balance.available': 320000,
    'balance.totalEarned': 2483000,
  });

  // Payment links
  const links = await PaymentLink.insertMany([
    {
      creator: creator._id,
      slug: 'aryan-design',
      name: 'Design Consultation',
      description: '1-hour design session',
      pricing: { type: 'fixed', amount: 15000, currency: 'USD' },
      acceptedMethods: { stripe: true, razorpay: true, eth: true },
      'stats.payments': 42,
      'stats.totalRevenue': 630000,
    },
    {
      creator: creator._id,
      slug: 'aryan-logo',
      name: 'Logo Package',
      description: 'Full brand kit · 3 revisions',
      pricing: { type: 'fixed', amount: 35000, currency: 'USD' },
      acceptedMethods: { stripe: true, razorpay: true, eth: true, btc: true },
      'stats.payments': 18,
      'stats.totalRevenue': 630000,
    },
    {
      creator: creator._id,
      slug: 'aryan-tip',
      name: 'Tip / Support',
      description: 'Send any amount',
      pricing: { type: 'custom', currency: 'USD' },
      acceptedMethods: { stripe: true, razorpay: true, eth: true, btc: true },
      'stats.payments': 134,
      'stats.totalRevenue': 420000,
    },
  ]);

  // Sample transactions
  await Transaction.insertMany([
    {
      creator: creator._id,
      paymentLink: links[0]._id,
      payer: { name: 'Sam Wilson', email: 'sam@example.com' },
      amount: { value: 15000, currency: 'USD', usdEquivalent: 15000 },
      fees: { platform: 300, gateway: 465, total: 765 },
      netAmount: 14235,
      method: 'stripe',
      status: 'confirmed',
      'gateway.stripe.paymentIntentId': 'pi_mock_001',
    },
    {
      creator: creator._id,
      paymentLink: links[1]._id,
      payer: { walletAddress: '0x3f4a...a91c' },
      amount: { value: 25000000000000000, currency: 'ETH', usdEquivalent: 8000 },
      fees: { platform: 160, gateway: 0, total: 160 },
      netAmount: 7840,
      method: 'eth',
      status: 'confirmed',
      'gateway.crypto.txHash': '0xabc123',
    },
    {
      creator: creator._id,
      paymentLink: links[2]._id,
      payer: { name: 'Priya M.', email: 'priya@example.com' },
      amount: { value: 500000, currency: 'INR', usdEquivalent: 6000 },
      fees: { platform: 120, gateway: 120, total: 240 },
      netAmount: 5760,
      method: 'razorpay',
      status: 'pending',
    },
  ]);

  logger.info('Seed complete!');
  logger.info(`Admin: ${admin.email} / ${process.env.ADMIN_PASSWORD || 'Admin123!'}`);
  logger.info(`Creator: aryan@example.com / Creator123!`);
  await mongoose.disconnect();
};

seed().catch(err => { logger.error(err); process.exit(1); });
