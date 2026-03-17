const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../../database/connection');
const { logAuditEvent, AUDIT_EVENT_TYPES } = require('../audit');

const router = express.Router();

/**
 * Escalation Configuration
 */
const ESCALATION_CONFIG = {
  CONFIDENCE_THRESHOLD: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.75'),
  HIGH_VALUE_THRESHOLD_THB: parseFloat(process.env.HIGH_VALUE_THRESHOLD_THB || '500000'),
  SLA_INTAKE_SUMMARY_MS: parseInt(process.env.SLA_INTAKE_SUMMARY_MS || '30000'),
  SLA_ROUTING_DECISION_MS: parseInt(process.env.SLA_ROUTING_DECISION_MS || '60000'),
  ALERT_WEBHOOK_URL: process.env.ALERT_WEBHOOK_URL || null,
  PAGERDUTY_INTEGRATION_KEY: process.env.PAGERDUTY_INTEGRATION_KEY || null
};

/**
 * Review Status Enum
 */
const REVIEW_STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED'
};

/**
 * Escalation Reason Types
 */
const ESCALATION_REASONS = {
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  HIGH_VALUE: 'HIGH_VALUE',
  MISSING_CRITICAL_FIELDS: 'MISSING_CRITICAL_FIELDS',
  FRAUD_INDICATORS: 'FRAUD_INDICATORS',
  POLICY_VALIDATION_FAILED: 'POLICY_VALIDATION_FAILED',
  SLA_TIMEOUT: 'SLA_TIMEOUT',
  LLM_SERVICE_UNAVAILABLE: 'LLM_SERVICE_UNAVAILABLE'
};

/**
 * Check if claim should be escalated to human review
 */
function shouldEscalate(claimData) {
  const reasons = [];
  
  // Check confidence threshold
  if (claimData.confidenceScore !== null && 
      claimData.confidenceScore < ESCALATION_CONFIG.CONFIDENCE_THRESHOLD) {
    reasons.push({
      type: ESCALATION_REASONS.LOW_CONFIDENCE,
      detail: `Confidence score ${claimData.confidenceScore.toFixed(2)} below threshold ${ESCALATION_CONFIG.CONFIDENCE_THRESHOLD}`
    });
  }
  
  // Check high value threshold
  if (claimData.estimatedValue && 
      claimData.estimatedValue > ESCALATION_CONFIG.HIGH_VALUE_THRESHOLD_THB) {
    reasons.push({
      type: ESCALATION_REASONS.HIGH_VALUE,
      detail: `Claim value ฿${claimData.estimatedValue.toLocaleString()} exceeds threshold ฿${ESCALATION_CONFIG.HIGH_VALUE_THRESHOLD_THB.toLocaleString()}`
    });
  }
  
  // Check for missing critical fields
  const criticalFields = ['policy_number', 'incident_date', 'incident_location_lat', 'incident_location_lng'];
  const missingCritical = criticalFields.filter(field => !claimData[field]);
  if (missingCritical.length > 0) {
    reasons.push({
      type: ESCALATION_REASONS.MISSING_CRITICAL_FIELDS,
      detail: `Missing critical fields: ${missingCritical.join(', ')}`
    });
  }
  
  // Check fraud risk score
  if (claimData.fraudRiskScore && claimData.fraudRiskScore > 70) {
    reasons.push({
      type: ESCALATION_REASONS.FRAUD_INDICATORS,
      detail: `High fraud risk score: ${claimData.fraudRiskScore.toFixed(1)}/100`
    });
  }
  
  // Check policy validation status
  if (claimData.policyActive === false) {
    reasons.push({
      type: ESCALATION_REASONS.POLICY_VALIDATION_FAILED,
      detail: 'Policy is not active or validation failed'
    });
  }
  
  return {
    shouldEscalate: reasons.length > 0,
    reasons
  };
}

/**
 * Create human review queue entry
 */
async function createReviewQueueEntry(claimId, escalationReasons, metadata = {}) {
  const reasonText = escalationReasons.map(r => `${r.type}: ${r.detail}`).join('; ');
  
  const result = await db.pool.query(
    `INSERT INTO human_review_queue 
     (claim_id, escalation_reason, status, created_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING id, claim_id, escalation_reason, status, created_at`,
    [claimId, reasonText, REVIEW_STATUS.PENDING]
  );
  
  // Log audit event
  await logAuditEvent({
    claimId,
    eventType: AUDIT_EVENT_TYPES.HUMAN_ESCALATED,
    rationale: reasonText,
    inputSnapshot: metadata,
    outputData: {
      reviewQueueId: result.rows[0].id,
      escalationReasons
    }
  });
  
  return result.rows[0];
}

/**
 * Send alert notification for escalation
 */
async function sendEscalationAlert(claimId, escalationReasons, urgency = 'medium') {
  const alert = {
    timestamp: new Date().toISOString(),
    claimId,
    urgency,
    reasons: escalationReasons,
    message: `Claim ${claimId} escalated to human review`
  };
  
  // Log alert (in production, send to Slack/PagerDuty)
  console.log('[ESCALATION ALERT]', JSON.stringify(alert, null, 2));
  
  // TODO: Implement actual webhook/PagerDuty integration
  // if (ESCALATION_CONFIG.ALERT_WEBHOOK_URL) {
  //   await axios.post(ESCALATION_CONFIG.ALERT_WEBHOOK_URL, alert);
  // }
  
  return alert;
}

/**
 * POST /api/v1/escalation/evaluate
 * Evaluate if a claim should be escalated
 */
router.post('/evaluate', async (req, res) => {
  const traceId = `esc_${uuidv4()}`;
  const startTime = Date.now();
  
  try {
    const { claimId, confidenceScore, estimatedValue, fraudRiskScore, policyActive, missingFields } = req.body;
    
    // Validate required fields
    if (!claimId) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'claimId is required',
        instance: req.path,
        traceId
      });
    }
    
    const claimData = {
      claimId,
      confidenceScore,
      estimatedValue,
      fraudRiskScore,
      policyActive,
      missingFields
    };
    
    const evaluation = shouldEscalate(claimData);
    
    const processingTime = Date.now() - startTime;
    
    res.status(200).json({
      claimId,
      shouldEscalate: evaluation.shouldEscalate,
      escalationReasons: evaluation.reasons,
      processingTimeMs: processingTime,
      traceId
    });
    
  } catch (error) {
    console.error('[ESCALATION ERROR]', { traceId, error: error.message, stack: error.stack });
    res.status(500).json({
      type: 'https://api.roojai.com/errors/internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Failed to evaluate escalation criteria',
      instance: req.path,
      traceId
    });
  }
});

/**
 * POST /api/v1/escalation/escalate
 * Escalate a claim to human review queue
 */
router.post('/escalate', async (req, res) => {
  const traceId = `esc_${uuidv4()}`;
  const startTime = Date.now();
  
  try {
    const { claimId, reasons, urgency = 'medium', metadata } = req.body;
    
    // Validate required fields
    if (!claimId || !reasons || !Array.isArray(reasons)) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'claimId and reasons array are required',
        instance: req.path,
        traceId
      });
    }
    
    // Create review queue entry
    const queueEntry = await createReviewQueueEntry(claimId, reasons, metadata);
    
    // Update claim status
    await db.pool.query(
      `UPDATE claims 
       SET status = 'ADJUSTER_REVIEW', 
           human_review_required = true,
           updated_at = NOW()
       WHERE claim_id = $1`,
      [claimId]
    );
    
    // Send alert notification
    await sendEscalationAlert(claimId, reasons, urgency);
    
    const processingTime = Date.now() - startTime;
    
    res.status(201).json({
      claimId,
      reviewQueueId: queueEntry.id,
      status: queueEntry.status,
      escalationReason: queueEntry.escalation_reason,
      createdAt: queueEntry.created_at,
      processingTimeMs: processingTime,
      traceId
    });
    
  } catch (error) {
    console.error('[ESCALATION ERROR]', { traceId, error: error.message, stack: error.stack });
    res.status(500).json({
      type: 'https://api.roojai.com/errors/internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Failed to escalate claim to human review',
      instance: req.path,
      traceId
    });
  }
});

/**
 * GET /api/v1/escalation/queue
 * Retrieve human review queue with filtering
 */
router.get('/queue', async (req, res) => {
  const traceId = `esc_${uuidv4()}`;
  const startTime = Date.now();
  
  try {
    const { status = 'PENDING', assignedTo, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        hrq.id,
        hrq.claim_id,
        hrq.escalation_reason,
        hrq.status,
        hrq.assigned_to,
        hrq.assigned_at,
        hrq.completed_at,
        hrq.reviewer_notes,
        hrq.created_at,
        c.policy_number,
        c.incident_date,
        c.confidence_score,
        c.fraud_risk_score
      FROM human_review_queue hrq
      JOIN claims c ON hrq.claim_id = c.claim_id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (status) {
      query += ` AND hrq.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (assignedTo) {
      query += ` AND hrq.assigned_to = $${paramIndex}`;
      params.push(assignedTo);
      paramIndex++;
    }
    
    query += ` ORDER BY hrq.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await db.pool.query(query, params);
    
    // Get total count
    const countResult = await db.pool.query(
      `SELECT COUNT(*) FROM human_review_queue WHERE status = $1`,
      [status]
    );
    
    const processingTime = Date.now() - startTime;
    
    res.status(200).json({
      queue: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: parseInt(offset) + result.rows.length < parseInt(countResult.rows[0].count)
      },
      processingTimeMs: processingTime,
      traceId
    });
    
  } catch (error) {
    console.error('[ESCALATION ERROR]', { traceId, error: error.message, stack: error.stack });
    res.status(500).json({
      type: 'https://api.roojai.com/errors/internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Failed to retrieve review queue',
      instance: req.path,
      traceId
    });
  }
});

/**
 * PATCH /api/v1/escalation/queue/:id/assign
 * Assign a review queue item to an adjuster
 */
router.patch('/queue/:id/assign', async (req, res) => {
  const traceId = `esc_${uuidv4()}`;
  const startTime = Date.now();
  
  try {
    const { id } = req.params;
    const { assignedTo, userId, userRole } = req.body;
    
    if (!assignedTo) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'assignedTo is required',
        instance: req.path,
        traceId
      });
    }
    
    const result = await db.pool.query(
      `UPDATE human_review_queue 
       SET assigned_to = $1, 
           assigned_at = NOW(),
           status = 'IN_PROGRESS'
       WHERE id = $2
       RETURNING id, claim_id, assigned_to, assigned_at, status`,
      [assignedTo, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        type: 'https://api.roojai.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Review queue item ${id} not found`,
        instance: req.path,
        traceId
      });
    }
    
    // Log audit event
    await logAuditEvent({
      claimId: result.rows[0].claim_id,
      eventType: AUDIT_EVENT_TYPES.CLAIM_UPDATED,
      userId,
      userRole,
      rationale: `Assigned to ${assignedTo} for human review`,
      outputData: {
        reviewQueueId: id,
        assignedTo,
        assignedAt: result.rows[0].assigned_at
      }
    });
    
    const processingTime = Date.now() - startTime;
    
    res.status(200).json({
      ...result.rows[0],
      processingTimeMs: processingTime,
      traceId
    });
    
  } catch (error) {
    console.error('[ESCALATION ERROR]', { traceId, error: error.message, stack: error.stack });
    res.status(500).json({
      type: 'https://api.roojai.com/errors/internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Failed to assign review queue item',
      instance: req.path,
      traceId
    });
  }
});

/**
 * PATCH /api/v1/escalation/queue/:id/complete
 * Complete a review queue item with adjuster decision
 */
router.patch('/queue/:id/complete', async (req, res) => {
  const traceId = `esc_${uuidv4()}`;
  const startTime = Date.now();
  
  try {
    const { id } = req.params;
    const { reviewerNotes, newRoute, userId, userRole } = req.body;
    
    if (!reviewerNotes || !newRoute) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'reviewerNotes and newRoute are required',
        instance: req.path,
        traceId
      });
    }
    
    // Validate newRoute
    const validRoutes = ['STRAIGHT_THROUGH', 'ADJUSTER_REVIEW', 'FRAUD_REVIEW'];
    if (!validRoutes.includes(newRoute)) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: `newRoute must be one of: ${validRoutes.join(', ')}`,
        instance: req.path,
        traceId
      });
    }
    
    const result = await db.pool.query(
      `UPDATE human_review_queue 
       SET reviewer_notes = $1,
           status = 'COMPLETED',
           completed_at = NOW()
       WHERE id = $2
       RETURNING id, claim_id, reviewer_notes, status, completed_at`,
      [reviewerNotes, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        type: 'https://api.roojai.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Review queue item ${id} not found`,
        instance: req.path,
        traceId
      });
    }
    
    const claimId = result.rows[0].claim_id;
    
    // Update claim with adjuster decision
    await db.pool.query(
      `UPDATE claims 
       SET triage_route = $1,
           status = $2,
           human_review_required = false,
           updated_at = NOW()
       WHERE claim_id = $3`,
      [newRoute, newRoute, claimId]
    );
    
    // Log audit event
    await logAuditEvent({
      claimId,
      eventType: AUDIT_EVENT_TYPES.CLAIM_UPDATED,
      userId,
      userRole,
      rationale: `Human review completed: ${reviewerNotes}`,
      outputData: {
        reviewQueueId: id,
        newRoute,
        reviewerNotes,
        completedAt: result.rows[0].completed_at
      }
    });
    
    const processingTime = Date.now() - startTime;
    
    res.status(200).json({
      ...result.rows[0],
      newRoute,
      processingTimeMs: processingTime,
      traceId
    });
    
  } catch (error) {
    console.error('[ESCALATION ERROR]', { traceId, error: error.message, stack: error.stack });
    res.status(500).json({
      type: 'https://api.roojai.com/errors/internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Failed to complete review queue item',
      instance: req.path,
      traceId
    });
  }
});

/**
 * GET /api/v1/escalation/stats
 * Get escalation statistics
 */
router.get('/stats', async (req, res) => {
  const traceId = `esc_${uuidv4()}`;
  const startTime = Date.now();
  
  try {
    const { period = '7d' } = req.query;
    
    // Calculate date range
    const periodMap = {
      '24h': '1 day',
      '7d': '7 days',
      '30d': '30 days'
    };
    const interval = periodMap[period] || '7 days';
    
    // Get escalation counts by reason
    const reasonStats = await db.pool.query(`
      SELECT 
        CASE 
          WHEN escalation_reason LIKE '%LOW_CONFIDENCE%' THEN 'LOW_CONFIDENCE'
          WHEN escalation_reason LIKE '%HIGH_VALUE%' THEN 'HIGH_VALUE'
          WHEN escalation_reason LIKE '%MISSING_CRITICAL_FIELDS%' THEN 'MISSING_CRITICAL_FIELDS'
          WHEN escalation_reason LIKE '%FRAUD_INDICATORS%' THEN 'FRAUD_INDICATORS'
          WHEN escalation_reason LIKE '%POLICY_VALIDATION_FAILED%' THEN 'POLICY_VALIDATION_FAILED'
          ELSE 'OTHER'
        END as reason_type,
        COUNT(*) as count
      FROM human_review_queue
      WHERE created_at > NOW() - INTERVAL '${interval}'
      GROUP BY reason_type
      ORDER BY count DESC
    `);
    
    // Get status distribution
    const statusStats = await db.pool.query(`
      SELECT status, COUNT(*) as count
      FROM human_review_queue
      WHERE created_at > NOW() - INTERVAL '${interval}'
      GROUP BY status
    `);
    
    // Get average review time
    const reviewTimeStats = await db.pool.query(`
      SELECT 
        AVG(EXTRACT(EPOCH FROM (completed_at - assigned_at))) as avg_review_time_seconds,
        COUNT(*) as completed_count
      FROM human_review_queue
      WHERE status = 'COMPLETED' 
        AND completed_at > NOW() - INTERVAL '${interval}'
        AND assigned_at IS NOT NULL
    `);
    
    // Get escalation rate
    const escalationRate = await db.pool.query(`
      SELECT 
        COUNT(DISTINCT hrq.claim_id)::float / NULLIF(COUNT(DISTINCT c.claim_id), 0) as escalation_rate
      FROM claims c
      LEFT JOIN human_review_queue hrq ON c.claim_id = hrq.claim_id
      WHERE c.created_at > NOW() - INTERVAL '${interval}'
    `);
    
    const processingTime = Date.now() - startTime;
    
    res.status(200).json({
      period,
      reasonDistribution: reasonStats.rows,
      statusDistribution: statusStats.rows,
      averageReviewTimeSeconds: parseFloat(reviewTimeStats.rows[0]?.avg_review_time_seconds || 0),
      completedReviews: parseInt(reviewTimeStats.rows[0]?.completed_count || 0),
      escalationRate: parseFloat(escalationRate.rows[0]?.escalation_rate || 0),
      processingTimeMs: processingTime,
      traceId
    });
    
  } catch (error) {
    console.error('[ESCALATION ERROR]', { traceId, error: error.message, stack: error.stack });
    res.status(500).json({
      type: 'https://api.roojai.com/errors/internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Failed to retrieve escalation statistics',
      instance: req.path,
      traceId
    });
  }
});

module.exports = router;
module.exports.shouldEscalate = shouldEscalate;
module.exports.createReviewQueueEntry = createReviewQueueEntry;
module.exports.ESCALATION_CONFIG = ESCALATION_CONFIG;
module.exports.ESCALATION_REASONS = ESCALATION_REASONS;
module.exports.REVIEW_STATUS = REVIEW_STATUS;