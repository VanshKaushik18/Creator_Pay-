# 🚀 CreatorPay - Production Deployment Guide

## ✅ What's Been Fixed for Production

### Critical Fixes Implemented:
1. ✅ **Live Exchange Rates** - CoinGecko API integration
2. ✅ **Atomic Transactions** - MongoDB sessions prevent race conditions
3. ✅ **Encryption** - AES-256-CBC for sensitive data
4. ✅ **Refund System** - Full refund mechanism with audit trail
5. ✅ **Input Validation** - Comprehensive validation utilities
6. ✅ **Schema Indexes** - Fixed duplicate indexes (Mongoose warnings resolved)
7. ✅ **Error Handling** - Global error handler + graceful shutdown
8. ✅ **Rate Limiting** - Aggressive limits on payment endpoints
9. ✅ **Security Headers** - Helmet.js + CORS properly configured
10. ✅ **Request Tracking** - Request IDs for debugging

### New Production Files Created:
- `/backend/utils/priceOracle.js` - Live crypto rates
- `/backend/utils/encryption.js` - AES-256 encryption
- `/backend/utils/transactionSettlement.js` - Atomic settlement
- `/backend/utils/validation.js` - Input validation
- `/backend/check-production-ready.sh` - Deployment checklist

---

## 📋 Pre-Deployment Checklist

### 1. Environment Configuration

```bash
# Generate strong encryption keys:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"

# Copy to production .env:
ENCRYPTION_KEY=<your-32-byte-hex>
ENCRYPTION_IV=<your-16-byte-hex>
```

### 2. Database Setup

```bash
# MongoDB production configuration:
- Enable authentication
- Use connection pooling (maxPoolSize=50)
- Enable backups
- Configure user accounts with granular permissions
- Run indexes rebuild:
  db.getCollection('users').reIndex()
  db.getCollection('transactions').reIndex()
  db.getCollection('paymentlinks').reIndex()
```

### 3. API Keys

Required before going live:
- ✅ Stripe (Live keys, not test)
- ✅ Razorpay (Production credentials)
- ✅ Infura/Alchemy (Ethereum RPC)
- ✅ Polygon RPC URL
- ✅ BlockCypher (Bitcoin monitoring)
- ✅ JWT_SECRET (50+ character minimum)

### 4. Security Setup

```bash
# Install PM2 for process management
npm install -g pm2

# Start with PM2
pm2 start server.js --name creatorpay --max-memory-restart 500M

# Configure reverse proxy (NGINX example):
server {
    listen 443 ssl http2;
    server_name api.creatorpay.com;
    
    ssl_certificate /etc/ssl/certs/your-cert.crt;
    ssl_certificate_key /etc/ssl/private/your-key.key;
    
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 5. Monitoring & Logging

```bash
# Recommended services:
- DataDog (APM + log aggregation)
- Sentry (Error tracking)
- Prometheus (Metrics)
- Grafana (Dashboards)

# Local logging:
- Logs written to /var/log/creatorpay/
- Rotated daily via logrotate
```

---

## 🧪 Testing Before Launch

### 1. Payment Flow Test

```bash
# 1. Test Stripe payment:
POST /api/payments/stripe/checkout
{
  "slug": "test-link",
  "email": "test@example.com",
  "name": "Test User",
  "customAmount": 10
}

# 2. Test Razorpay payment:
POST /api/payments/razorpay/order
{
  "slug": "test-link",
  "email": "test@example.com",
  "name": "Test User",
  "phone": "9999999999",
  "customAmount": 500  // INR
}

# 3. Test crypto payment:
POST /api/payments/crypto/initiate
{
  "slug": "test-link",
  "currency": "ETH",
  "customAmountUsd": 10
}
```

### 2. Withdrawal Test

```bash
POST /api/withdraw
{
  "method": "bank",
  "amount": 10000,  // cents = $100
  "details": {
    "accountNumber": "1234567890",
    "ifscCode": "SBIN0000001",
    "accountHolder": "Test User"
  }
}
```

### 3. Load Testing

```bash
# Using Apache Bench:
ab -n 1000 -c 10 http://localhost:5000/api/health

# Using autocannon:
npm install -g autocannon
autocannon -c 10 -d 30 http://localhost:5000/api/health
```

### 4. Security Testing

```bash
# Test rate limiting:
for i in {1..20}; do curl http://localhost:5000/api/auth/login -X POST; done

# Check security headers:
curl -I http://localhost:5000/api/health
# Should include: Strict-Transport-Security, X-Content-Type-Options, X-Frame-Options

# Verify HTTPS:
# All traffic should redirect to HTTPS in production
```

---

## 🚀 Deployment Steps

### Step 1: Build & Prepare

```bash
cd backend
npm install --production
npm prune --production
```

### Step 2: Environment Setup

```bash
# Copy production environment
cp .env.production .env
chmod 600 .env  # Restrict file permissions
```

### Step 3: Database Migration

```bash
# Verify MongoDB connectivity
node -e "require('./config/db')()" 

# Seed admin user if needed
node utils/seed.js
```

### Step 4: Start Services

```bash
# Using PM2:
pm2 start ecosystem.config.js --env production

# Monitor:
pm2 monit
pm2 logs
```

### Step 5: Verify Health

```bash
curl https://your-api-domain.com/api/health
# Should return: { success: true, message: "CreatorPay API running", environment: "production" }
```

---

## 📊 Post-Launch Monitoring

### Critical Metrics to Track:

1. **API Response Time** - Should be <200ms p95
2. **Error Rate** - Should be <0.1%
3. **Database Connection Pool** - Monitor usage
4. **Payment Success Rate** - Should be >99%
5. **Webhook Delivery** - Monitor Stripe/Razorpay webhooks

### Daily Checks:

```bash
# Verify MongoDB backups were created:
ls -lh /var/backups/mongodb/

# Check error logs:
tail -f /var/log/creatorpay/error.log

# Monitor system resources:
pm2 monit
```

---

## 🔄 Continuous Improvement

### Phase 1 Monitoring (Week 1):
- [ ] Monitor all payment flows
- [ ] Check webhook delivery rates
- [ ] Verify encryption working
- [ ] Monitor API response times
- [ ] Check rate limiting effectiveness

### Phase 2 Optimization (Week 2-4):
- [ ] Implement caching for payment rates
- [ ] Add database query optimization
- [ ] Setup CDN for frontend
- [ ] Implement token refresh mechanism
- [ ] Add KYC verification

### Phase 3 Features (Month 2):
- [ ] Email notifications
- [ ] Withdrawal automation
- [ ] Analytics dashboard
- [ ] Advanced fraud detection
- [ ] Multi-currency support

---

## 🆘 Troubleshooting

### Issue: "Cannot find module" errors

```bash
Solution: npm install --save-dev
```

### Issue: MongoDB connection timeout

```bash
Solution: Check MONGO_URI, network connectivity
Also verify connection pooling: 
  MONGO_URI=mongodb://user:pass@host:27017/dbname?maxPoolSize=50
```

### Issue: Stripe webhook failing

```bash
Solution: Verify STRIPE_WEBHOOK_SECRET matches Stripe dashboard
Check that endpoint is publicly accessible
Verify X-Stripe-Signature header is being passed
```

### Issue: Encryption not working

```bash
Solution: Verify ENCRYPTION_KEY and ENCRYPTION_IV are set to 32-byte hex strings
Test locally: node -e "const e = require('./utils/encryption'); const d = e.encrypt({test: 'data'}); console.log(e.decrypt(d))"
```

---

## 📞 Support

For issues or questions:
- Check logs: `pm2 logs creatorpay`
- Review error tracking: Sentry dashboard
- Check API errors: Each response includes requestId for tracing

---

**Last Updated:** April 2026
**Status:** ✅ Production Ready
