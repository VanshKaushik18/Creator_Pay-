const axios = require('axios');
const logger = require('./logger');

const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price';
const CACHE_TTL = 60000; // 1 minute cache

let priceCache = {
  ETH: 3200,
  BTC: 67000,
  MATIC: 0.98,
  USDT: 1
};
let cacheTime = Date.now();

/**
 * Get live crypto exchange rates from CoinGecko
 * Falls back to cached rates if API fails
 */
const getRates = async (currencies = ['ethereum', 'bitcoin', 'matic-network', 'tether']) => {
  const now = Date.now();
  
  // Return cached if fresh
  if (cacheTime + CACHE_TTL > now && Object.keys(priceCache).length === 4) {
    return priceCache;
  }

  try {
    const res = await axios.get(COINGECKO_API, {
      params: {
        ids: currencies.join(','),
        vs_currencies: 'usd'
      },
      timeout: 5000
    });
    
    priceCache = {
      ETH: res.data.ethereum?.usd || 3200,
      BTC: res.data.bitcoin?.usd || 67000,
      MATIC: res.data['matic-network']?.usd || 0.98,
      USDT: res.data.tether?.usd || 1
    };
    cacheTime = now;
    logger.info(`Price rates updated: ${JSON.stringify(priceCache)}`);
    return priceCache;
  } catch (err) {
    logger.warn(`Price oracle API failed: ${err.message}, using cached rates`);
    return priceCache;
  }
};

module.exports = { getRates };
