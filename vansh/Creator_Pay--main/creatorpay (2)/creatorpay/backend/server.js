require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const logger = require('./utils/logger');

const app = express();

// ✅ Connect to MongoDB
connectDB();

// ✅ Security middleware
app.use(helmet({ 
  contentSecurityPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
}));

app.use(cors({ 
  origin: process.env.FRONTEND_URL || 'http://localhost:5173', 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ✅ Rate limiting (more aggressive on payment endpoints)
const limiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, 
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const paymentLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
});

app.use('/api/', limiter);
app.use('/api/payments/', paymentLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ✅ Body parsing (raw for Stripe webhooks)
app.use('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ✅ Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ✅ Request ID tracking
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || Math.random().toString(36).substr(2, 9);
  res.setHeader('X-Request-ID', req.id);
  next();
});

// ✅ Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'CreatorPay API running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// ✅ API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/links', require('./routes/links'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/withdraw', require('./routes/withdraw'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/dashboard', require('./routes/dashboard'));

// ✅ 404 handler
app.use((req, res) => {
  logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    success: false, 
    message: `Route ${req.originalUrl} not found`,
    requestId: req.id
  });
});

// ✅ Global error handler
app.use((err, req, res, next) => {
  const status = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';
  
  // Log error details
  logger.error(`${status} - ${message} | ${req.method} ${req.originalUrl} | Request ID: ${req.id}`, {
    error: err.stack,
    body: process.env.NODE_ENV === 'development' ? req.body : undefined
  });
  
  // Prevent sensitive info leakage
  const clientMessage = status === 500 ? 'Internal server error' : message;
  
  res.status(status).json({
    success: false,
    message: clientMessage,
    requestId: req.id,
    ...(process.env.NODE_ENV === 'development' && { details: message })
  });
});

// ✅ Server initialization
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  logger.info(`✅ CreatorPay API running on port ${PORT} | Environment: ${process.env.NODE_ENV}`);
});

// ✅ Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('✓ Server closed');
    process.exit(0);
  });
  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  server.close(() => {
    logger.info('✓ Server closed');
    process.exit(0);
  });
});

// ✅ Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
  // Exit on unhandled rejection to restart via process manager
  process.exit(1);
});

module.exports = app;
