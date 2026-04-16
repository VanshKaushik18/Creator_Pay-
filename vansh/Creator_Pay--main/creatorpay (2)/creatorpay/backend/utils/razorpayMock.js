/**
 * Razorpay Mock for Development Mode
 * Simulates Razorpay API responses without requiring live API keys
 */

const { v4: uuidv4 } = require('uuid');

// Check if we're in dev mode with invalid keys
const isDevMode = () => {
  const key = process.env.RAZORPAY_KEY_ID || '';
  return key.includes('rzp_test_') && (key.length < 30 || key.includes('placeholder'));
};

const razorpayMock = {
  // Mock orders
  orders: {
    create: async (params) => {
      if (!isDevMode()) {
        throw new Error('razorpayMock should only be used in dev mode');
      }
      
      return {
        id: `order_${uuidv4().replace(/-/g, '').substring(0, 14)}`,
        entity: 'order',
        amount: params.amount,
        amount_paid: 0,
        amount_due: params.amount,
        currency: params.currency || 'INR',
        receipt: params.receipt,
        status: 'created',
        attempts: 0,
        notes: params.notes || {},
        created_at: Math.floor(Date.now() / 1000),
      };
    },

    fetch: async (orderId) => {
      if (!isDevMode()) {
        throw new Error('razorpayMock should only be used in dev mode');
      }
      
      return {
        id: orderId,
        entity: 'order',
        amount: 50000,
        amount_paid: 0,
        amount_due: 50000,
        currency: 'INR',
        status: 'created',
        created_at: Math.floor(Date.now() / 1000),
      };
    },
  },

  // Mock payments
  payments: {
    fetch: async (paymentId) => {
      if (!isDevMode()) {
        throw new Error('razorpayMock should only be used in dev mode');
      }
      
      return {
        id: paymentId,
        entity: 'payment',
        amount: 50000,
        currency: 'INR',
        status: 'captured',
        method: 'card',
        description: 'Test payment',
        email: 'test@example.com',
        contact: '+919876543210',
        fee: 1000,
        tax: 0,
        notes: {},
        created_at: Math.floor(Date.now() / 1000),
      };
    },

    refund: async (paymentId, params) => {
      if (!isDevMode()) {
        throw new Error('razorpayMock should only be used in dev mode');
      }
      
      return {
        id: `rfnd_${uuidv4().replace(/-/g, '').substring(0, 14)}`,
        entity: 'refund',
        payment_id: paymentId,
        amount: params.amount,
        currency: 'INR',
        status: 'processed',
        receipt: null,
        notes: params.notes || {},
        created_at: Math.floor(Date.now() / 1000),
      };
    },
  },

  // Mock transfers
  transfers: {
    create: async (params) => {
      if (!isDevMode()) {
        throw new Error('razorpayMock should only be used in dev mode');
      }
      
      return {
        id: `trf_${uuidv4().replace(/-/g, '').substring(0, 14)}`,
        entity: 'transfer',
        source: 'payment',
        receipt: params.receipt,
        amount: params.amount,
        payout_id: `pout_${uuidv4().replace(/-/g, '').substring(0, 14)}`,
        status: 'processed',
        created_at: Math.floor(Date.now() / 1000),
      };
    },
  },
};

module.exports = razorpayMock;
module.exports.isDevMode = isDevMode;
