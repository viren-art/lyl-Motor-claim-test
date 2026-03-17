const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { 
  trackSLAMetric, 
  getSLAComplianceReport, 
  getSLADashboard,
  METRIC_TYPES 
} = require('./sla-tracker');

const router = express.Router();

/**
 * GET /api/v1/monitoring/sla/dashboard
 * Get real-time SLA compliance dashboard
 */
router.get('/sla/dashboard', async (req, res) => {
  const traceId = `mon_${uuidv4()}`;
  const startTime = Date.now();
  
  try {
    const dashboard = await getSLADashboard();
    const processingTime = Date.now() - startTime;
    
    res.status(200).json({
      ...dashboard,
      processingTimeMs: processingTime,
      traceId
    });
    
  } catch (error) {
    console.error('[MONITORING ERROR]', { traceId, error: error.message, stack: error.stack });
    res.status(500).json({
      type: 'https://api.roojai.com/errors/internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Failed to retrieve SLA dashboard',
      instance: req.path,
      traceId
    });
  }
});

/**
 * GET /api/v1/monitoring/sla/report/:metricType
 * Get detailed SLA compliance report for a specific metric
 */
router.get('/sla/report/:metricType', async (req, res) => {
  const traceId = `mon_${uuidv4()}`;
  const startTime = Date.now();
  
  try {
    const { metricType } = req.params;
    const { periodHours = 24 } = req.query;
    
    // Validate metric type
    if (!Object.values(METRIC_TYPES).includes(metricType)) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: `Invalid metric type. Must be one of: ${Object.values(METRIC_TYPES).join(', ')}`,
        instance: req.path,
        traceId
      });
    }
    
    const report = await getSLAComplianceReport(metricType, parseInt(periodHours));
    const processingTime = Date.now() - startTime;
    
    res.status(200).json({
      ...report,
      processingTimeMs: processingTime,
      traceId
    });
    
  } catch (error) {
    console.error('[MONITORING ERROR]', { traceId, error: error.message, stack: error.stack });
    res.status(500).json({
      type: 'https://api.roojai.com/errors/internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Failed to retrieve SLA report',
      instance: req.path,
      traceId
    });
  }
});

/**
 * POST /api/v1/monitoring/sla/track
 * Manually track an SLA metric (for testing/debugging)
 */
router.post('/sla/track', async (req, res) => {
  const traceId = `mon_${uuidv4()}`;
  const startTime = Date.now();
  
  try {
    const { metricType, processingTimeMs, metadata } = req.body;
    
    // Validate required fields
    if (!metricType || processingTimeMs === undefined) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'metricType and processingTimeMs are required',
        instance: req.path,
        traceId
      });
    }
    
    // Validate metric type
    if (!Object.values(METRIC_TYPES).includes(metricType)) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: `Invalid metric type. Must be one of: ${Object.values(METRIC_TYPES).join(', ')}`,
        instance: req.path,
        traceId
      });
    }
    
    const metricId = await trackSLAMetric(metricType, processingTimeMs, metadata || {});
    const totalTime = Date.now() - startTime;
    
    res.status(201).json({
      metricId,
      metricType,
      processingTimeMs,
      tracked: true,
      processingTimeMs: totalTime,
      traceId
    });
    
  } catch (error) {
    console.error('[MONITORING ERROR]', { traceId, error: error.message, stack: error.stack });
    res.status(500).json({
      type: 'https://api.roojai.com/errors/internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Failed to track SLA metric',
      instance: req.path,
      traceId
    });
  }
});

/**
 * GET /api/v1/monitoring/health
 * System health check with component status
 */
router.get('/health', async (req, res) => {
  const traceId = `mon_${uuidv4()}`;
  const startTime = Date.now();
  
  try {
    const db = require('../database/connection');
    
    // Check database connectivity
    let dbStatus = 'up';
    try {
      await db.pool.query('SELECT 1');
    } catch (error) {
      dbStatus = 'down';
      console.error('[HEALTH CHECK] Database down:', error.message);
    }
    
    // Check LLM service (basic connectivity)
    let llmStatus = 'up';
    const TRIAGE_SERVICE_URL = process.env.TRIAGE_SERVICE_URL || 'http://localhost:8001';
    try {
      const axios = require('axios');
      await axios.get(`${TRIAGE_SERVICE_URL}/health`, { timeout: 2000 });
    } catch (error) {
      llmStatus = 'down';
      console.error('[HEALTH CHECK] LLM service down:', error.message);
    }
    
    // Overall status
    const overallStatus = (dbStatus === 'up' && llmStatus === 'up') ? 'healthy' : 'degraded';
    
    const processingTime = Date.now() - startTime;
    
    res.status(overallStatus === 'healthy' ? 200 : 503).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        llmApi: llmStatus,
        redis: 'up', // TODO: Add Redis health check
        s3: 'up' // TODO: Add S3 health check
      },
      version: process.env.API_VERSION || '1.0.0',
      processingTimeMs: processingTime,
      traceId
    });
    
  } catch (error) {
    console.error('[HEALTH CHECK ERROR]', { traceId, error: error.message, stack: error.stack });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      traceId
    });
  }
});

module.exports = router;