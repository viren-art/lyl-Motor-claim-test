const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getLLMServiceMonitor, HEALTH_STATUS } = require('./llm-service-monitor');
const { shouldEscalate, createReviewQueueEntry } = require('../escalation');
const db = require('../../database/connection');
const { logAuditEvent, AUDIT_EVENT_TYPES } = require('../audit');

const router = express.Router();

/**
 * Fallback Configuration
 */
const FALLBACK_CONFIG = {
  MANUAL_QUEUE_REASON: 'LLM service unavailable - automatic fallback to manual processing',
  DEGRADED_CONFIDENCE: 0.0,
  FALLBACK_ROUTE: 'ADJUSTER_REVIEW'
};

/**
 * GET /api/v1/resilience/status
 * Get LLM service health and circuit breaker status
 */
router.get('/status', async (req, res) => {
  const traceId = `res_${uuidv4()}`;
  const startTime = Date.now();

  try {
    const monitor = getLLMServiceMonitor();
    const status = monitor.getServiceStatus();
    
    const processingTime = Date.now() - startTime;

    res.status(200).json({
      traceId,
      status: status.overall,
      services: {
        primary: status.primary,
        secondary: status.secondary
      },
      alerts: status.alerts,
      timestamp: status.timestamp,
      processingTimeMs: processingTime
    });
  } catch (error) {
    console.error(`[Resilience] Status check failed: ${error.message}`, { traceId, error: error.stack });
    
    res.status(500).json({
      type: 'https://api.roojai.com/errors/resilience-status-error',
      title: 'Resilience Status Error',
      status: 500,
      detail: error.message,
      instance: req.path,
      traceId
    });
  }
});

/**
 * POST /api/v1/resilience/execute
 * Execute LLM request with automatic failover and fallback
 */
router.post('/execute', async (req, res) => {
  const traceId = `res_${uuidv4()}`;
  const startTime = Date.now();

  try {
    const { claimId, operation, payload } = req.body;

    // Validate required fields
    if (!claimId || !operation || !payload) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'Missing required fields: claimId, operation, payload',
        instance: req.path,
        traceId
      });
    }

    const monitor = getLLMServiceMonitor();

    // Define the LLM request function
    const llmRequestFn = async (serviceUrl) => {
      const axios = require('axios');
      const response = await axios.post(
        `${serviceUrl}/${operation}`,
        payload,
        { 
          timeout: 10000,
          headers: { 'X-Trace-ID': traceId }
        }
      );
      return response.data;
    };

    // Define the fallback function
    const fallbackFn = async () => {
      console.log(`[Resilience] Executing fallback for claim ${claimId}`);
      
      // Create manual review queue entry
      const escalationReasons = [{
        type: 'LLM_SERVICE_UNAVAILABLE',
        detail: FALLBACK_CONFIG.MANUAL_QUEUE_REASON,
        severity: 'high'
      }];

      await createReviewQueueEntry(claimId, escalationReasons, {
        fallbackTriggered: true,
        operation,
        traceId
      });

      // Update claim status
      await db.pool.query(
        `UPDATE claims 
         SET status = 'TRIAGE_PENDING',
             triage_route = $1,
             confidence_score = $2,
             human_review_required = true,
             updated_at = now()
         WHERE claim_id = $3`,
        [FALLBACK_CONFIG.FALLBACK_ROUTE, FALLBACK_CONFIG.DEGRADED_CONFIDENCE, claimId]
      );

      // Log audit event
      await logAuditEvent({
        claimId,
        eventType: AUDIT_EVENT_TYPES.HUMAN_ESCALATED,
        rationale: FALLBACK_CONFIG.MANUAL_QUEUE_REASON,
        confidenceScore: FALLBACK_CONFIG.DEGRADED_CONFIDENCE,
        inputSnapshot: { operation, payload },
        outputData: { fallback: true, route: FALLBACK_CONFIG.FALLBACK_ROUTE },
        userId: 'system',
        userRole: 'automated_fallback'
      });

      return {
        fallback: true,
        route: FALLBACK_CONFIG.FALLBACK_ROUTE,
        confidenceScore: FALLBACK_CONFIG.DEGRADED_CONFIDENCE,
        rationale: FALLBACK_CONFIG.MANUAL_QUEUE_REASON
      };
    };

    // Execute with automatic failover
    const result = await monitor.executeLLMRequest(llmRequestFn, fallbackFn);
    
    const processingTime = Date.now() - startTime;

    res.status(result.success ? 200 : 202).json({
      traceId,
      claimId,
      success: result.success,
      service: result.service,
      failover: result.failover || false,
      data: result.data,
      processingTimeMs: processingTime
    });

  } catch (error) {
    console.error(`[Resilience] Execute failed: ${error.message}`, { traceId, error: error.stack });
    
    res.status(500).json({
      type: 'https://api.roojai.com/errors/resilience-execute-error',
      title: 'Resilience Execute Error',
      status: 500,
      detail: error.message,
      instance: req.path,
      traceId
    });
  }
});

/**
 * POST /api/v1/resilience/circuit/:service/:action
 * Manually control circuit breaker state (admin only)
 */
router.post('/circuit/:service/:action', async (req, res) => {
  const traceId = `res_${uuidv4()}`;
  const startTime = Date.now();

  try {
    const { service, action } = req.params;
    const { userId, userRole } = req.body;

    // Validate admin role
    if (userRole !== 'Admin') {
      return res.status(403).json({
        type: 'https://api.roojai.com/errors/forbidden',
        title: 'Forbidden',
        status: 403,
        detail: 'Admin role required for circuit breaker control',
        instance: req.path,
        traceId
      });
    }

    // Validate service and action
    if (!['primary', 'secondary'].includes(service)) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'Service must be "primary" or "secondary"',
        instance: req.path,
        traceId
      });
    }

    if (!['open', 'closed'].includes(action)) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'Action must be "open" or "closed"',
        instance: req.path,
        traceId
      });
    }

    const monitor = getLLMServiceMonitor();
    monitor.forceCircuitState(service, action);

    // Log audit event
    await logAuditEvent({
      claimId: null,
      eventType: AUDIT_EVENT_TYPES.CLAIM_UPDATED,
      rationale: `Circuit breaker ${service} manually ${action} by admin`,
      inputSnapshot: { service, action },
      userId,
      userRole
    });

    const processingTime = Date.now() - startTime;

    res.status(200).json({
      traceId,
      service,
      action,
      status: monitor.getServiceStatus(),
      processingTimeMs: processingTime
    });

  } catch (error) {
    console.error(`[Resilience] Circuit control failed: ${error.message}`, { traceId, error: error.stack });
    
    res.status(500).json({
      type: 'https://api.roojai.com/errors/resilience-circuit-error',
      title: 'Resilience Circuit Error',
      status: 500,
      detail: error.message,
      instance: req.path,
      traceId
    });
  }
});

/**
 * GET /api/v1/resilience/metrics
 * Get circuit breaker metrics and statistics
 */
router.get('/metrics', async (req, res) => {
  const traceId = `res_${uuidv4()}`;
  const startTime = Date.now();

  try {
    const monitor = getLLMServiceMonitor();
    const status = monitor.getServiceStatus();

    // Calculate aggregate metrics
    const primaryMetrics = status.primary.circuit.metrics;
    const secondaryMetrics = status.secondary?.circuit.metrics;

    const aggregateMetrics = {
      totalRequests: primaryMetrics.totalRequests + (secondaryMetrics?.totalRequests || 0),
      successfulRequests: primaryMetrics.successfulRequests + (secondaryMetrics?.successfulRequests || 0),
      failedRequests: primaryMetrics.failedRequests + (secondaryMetrics?.failedRequests || 0),
      rejectedRequests: primaryMetrics.rejectedRequests + (secondaryMetrics?.rejectedRequests || 0),
      timeouts: primaryMetrics.timeouts + (secondaryMetrics?.timeouts || 0),
      successRate: 0,
      failureRate: 0
    };

    if (aggregateMetrics.totalRequests > 0) {
      aggregateMetrics.successRate = (aggregateMetrics.successfulRequests / aggregateMetrics.totalRequests * 100).toFixed(2);
      aggregateMetrics.failureRate = (aggregateMetrics.failedRequests / aggregateMetrics.totalRequests * 100).toFixed(2);
    }

    const processingTime = Date.now() - startTime;

    res.status(200).json({
      traceId,
      aggregate: aggregateMetrics,
      primary: primaryMetrics,
      secondary: secondaryMetrics,
      alerts: status.alerts,
      processingTimeMs: processingTime
    });

  } catch (error) {
    console.error(`[Resilience] Metrics retrieval failed: ${error.message}`, { traceId, error: error.stack });
    
    res.status(500).json({
      type: 'https://api.roojai.com/errors/resilience-metrics-error',
      title: 'Resilience Metrics Error',
      status: 500,
      detail: error.message,
      instance: req.path,
      traceId
    });
  }
});

module.exports = router;