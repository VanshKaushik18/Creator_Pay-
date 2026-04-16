/**
 * Stripe Mock for Development Mode
 * Simulates Stripe API responses without requiring live API keys
 * Remove this in production and use real Stripe SDK
 */

const { v4: uuidv4 } = require('uuid');

// Check if we're in dev mode with invalid keys
const isDevMode = () => {
  const key = process.env.STRIPE_SECRET_KEY || '';
  return key.includes('sk_test_') && (key.length < 50 || key.includes('placeholder'));
};

const stripeMock = {
  // Mock checkout sessions
  checkout: {
    sessions: {
      create: async (params) => {
        if (!isDevMode()) {
          throw new Error('stripeMock should only be used in dev mode');
        }
        
        const sessionId = `cs_${uuidv4().replace(/-/g, '').substring(0, 24)}`;
        // In dev mode, return a confirmation URL that will auto-complete the payment
        const devCheckoutUrl = `http://localhost:5000/api/payments/dev/payment-confirm/${sessionId}?txn=${params.metadata?.transactionId}`;
        
        return {
          id: sessionId,
          url: devCheckoutUrl,
          payment_intent: `pi_${uuidv4().replace(/-/g, '').substring(0, 24)}`,
          payment_method_types: params.payment_method_types,
          line_items: {
            object: 'list',
            data: params.line_items || [],
          },
          mode: params.mode,
          success_url: params.success_url,
          cancel_url: params.cancel_url,
          customer_email: params.customer_email,
          metadata: params.metadata,
          status: 'open',
        };
      },
      
      retrieve: async (sessionId) => {
        if (!isDevMode()) {
          throw new Error('stripeMock should only be used in dev mode');
        }
        
        return {
          id: sessionId,
          object: 'checkout.session',
          payment_intent: `pi_test_${uuidv4().replace(/-/g, '').substring(0, 20)}`,
          payment_status: 'paid',
          amount_total: 5000,
          currency: 'usd',
          status: 'complete',
        };
      },
    },
  },

  // Mock payment intents
  paymentIntents: {
    retrieve: async (intentId) => {
      if (!isDevMode()) {
        throw new Error('stripeMock should only be used in dev mode');
      }
      
      return {
        id: intentId,
        object: 'payment_intent',
        status: 'succeeded',
        charges: {
          data: [
            {
              id: `ch_${uuidv4().replace(/-/g, '').substring(0, 24)}`,
              amount: 5000,
              currency: 'usd',
              receipt_email: 'test@example.com',
            },
          ],
        },
      };
    },
  },

  // Mock webhook constructor (no-op for dev)
  webhooks: {
    constructEvent: (body, sig, secret) => {
      if (!isDevMode()) {
        throw new Error('stripeMock should only be used in dev mode');
      }
      
      return JSON.parse(body);
    },
  },
};

module.exports = stripeMock;
module.exports.isDevMode = isDevMode;
