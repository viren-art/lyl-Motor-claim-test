const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { enforceTLS, validateTLSVersion } = require('./middleware/security/tls-enforcement');
const intakeRouter = require('./modules/intake');
const extractionRouter = require('./modules/extraction');
const policyRouter = require('./modules/policy');
const fraudRouter = require('./modules/fraud');
const axios = require('axios');

const app = express();

// Security middleware
app.use(helmet());
app.use(enforceTLS);
app.use(validateTLSVersion);

// CORS configuration
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API routes
app.use('/api/v1/intake', intakeRouter);
app.use('/api/v1/extraction', extractionRouter);
app.use('/api/v1/policy', policyRouter);
app.use('/api/v1/fraud', fraudRouter);

// Triage routing endpoint (proxies to Python service)
app.post('/api/v1/triage/execute', async (req, res, next) => {
  const TRIAGE_SERVICE_URL = process.env.TRIAGE_SERVICE_URL || 'http://localhost:8001';
  const TRIAGE_TIMEOUT_MS = parseInt(process.env.TRIAGE_TIMEOUT_MS || '60000');
  
  try {
    const response = await axios.post(
      `${TRIAGE_SERVICE_URL}/api/v1/triage/route`,
      req.body,
      {
        timeout: TRIAGE_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          'X-