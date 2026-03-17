const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { enforceTLS, validateTLSVersion } = require('./middleware/security/tls-enforcement');
const intakeRouter = require('./modules/intake');
const extractionRouter = require('./modules/extraction');

const app = express();

// Security middleware
app.use(helmet());
app.use(enforceTLS);
app.use(validateTLSVersion);

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint (no auth required)
app.get('/api/v1/health', async (req, res) => {
  try {
    // Check database connection
    const db = require('./database/connection');
    await db.pool.query('SELECT 1');

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'up',
        api: 'up'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// API routes
app.use('/api/v1/claims', intakeRouter);
app.use('/api/v1/extraction', extractionRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    type: 'https://api.roojai.com/errors/not-found',
    title: 'Not Found',
    status: 404,
    detail: `Route ${req.method} ${req.path} not found`,
    instance: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    type: 'https://api.roojai.com/errors/internal-error',
    title: 'Internal Server Error',
    status: err.status || 500,
    detail: err.message || 'An unexpected error occurred',
    instance: req.path
  });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Roojai Claims API listening on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app;