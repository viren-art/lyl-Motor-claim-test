const express = require('express');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('../../database/connection');

const router = express.Router();

/**
 * Audit Event Types
 */
const AUDIT_EVENT_TYPES = {
  FNOL_SUBMITTED: 'FNOL_SUBMITTED',
  LLM_EXTRACTION: 'LLM_EXTRACTION',
  QUESTION_GENERATED: 'QUESTION_GENERATED',
  COVERAGE_VALIDATED: 'COVERAGE_VALIDATED',
  TRIAGE_ROUTED: 'TRIAGE_ROUTED',
  HUMAN_ESCALATED: 'HUMAN_ESCALATED',
  CLAIM_UPDATED: 'CLAIM_UPDATED'
};

/**
 * Calculate SHA-256 hash for hash chain integrity
 */
function calculateHash(eventData, previousHash) {
  const hashInput = JSON.stringify({
    eventId: eventData.eventId,
    claimId: eventData.claimId,
    eventType: eventData.eventType,
    eventTimestamp: eventData.eventTimestamp,
    inputSnapshot: eventData.inputSnapshot,
    outputData: eventData.outputData,
    previousHash: previousHash || 'GENESIS'
  });
  
  return crypto.createHash('sha256').update(hashInput).digest('hex');
}

/**
 * Get the last audit event hash for a claim
 */
async function getLastEventHash(claimId) {
  const result = await db.pool.query(
    `SELECT hash_chain FROM audit_log 
     WHERE claim_id = $1 
     ORDER BY event_timestamp DESC 
     LIMIT 1`,
    [claimId]
  );
  
  return result.rows.length > 0 ? result.rows[0].hash_chain : null;
}

/**
 * Log an audit event with hash chain integrity
 */
async function logAuditEvent({
  claimId,
  eventType,
  llmModelVersion = null,
  confidenceScore = null,
  rationale = null,
  inputSnapshot = null,
  outputData = null,
  evidenceQuotes = null,
  userId = null,
  userRole = null,
  processingTimeMs = null
}) {
  const eventId = `evt_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
  const eventTimestamp = new Date();
  
  // Get previous hash for chain
  const previousHash = await getLastEventHash(claimId);
  
  // Calculate current hash
  const eventData = {
    eventId,
    claimId,
    eventType,
    eventTimestamp,
    inputSnapshot,
    outputData
  };
  const hashChain = calculateHash(eventData, previousHash);
  
  // Insert audit log entry
  const result = await db.pool.query(
    `INSERT INTO audit_log (
      event_id, claim_id, event_type, llm_model_version, confidence_score,
      rationale, input_snapshot, output_data, evidence_quotes,
      user_id, user_role, processing_time_ms, event_timestamp, hash_chain
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *`,
    [
      eventId,
      claimId,
      eventType,
      llmModelVersion,
      confidenceScore,
      rationale,
      inputSnapshot ? JSON.stringify(inputSnapshot) : null,
      outputData ? JSON.stringify(outputData) : null,
      evidenceQuotes,
      userId,
      userRole,
      processingTimeMs,
      eventTimestamp,
      hashChain
    ]
  );
  
  return result.rows[0];
}

/**
 * Verify hash chain integrity for a claim
 */
async function verifyHashChain(claimId) {
  const result = await db.pool.query(
    `SELECT event_id, claim_id, event_type, event_timestamp, 
            input_snapshot, output_data, hash_chain
     FROM audit_log 
     WHERE claim_id = $1 
     ORDER BY event_timestamp ASC`,
    [claimId]
  );
  
  const events = result.rows;
  if (events.length === 0) {
    return { valid: true, message: 'No events to verify' };
  }
  
  let previousHash = null;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const expectedHash = calculateHash({
      eventId: event.event_id,
      claimId: event.claim_id,
      eventType: event.event_type,
      eventTimestamp: event.event_timestamp,
      inputSnapshot: event.input_snapshot,
      outputData: event.output_data
    }, previousHash);
    
    if (event.hash_chain !== expectedHash) {
      return {
        valid: false,
        message: `Hash chain broken at event ${event.event_id}`,
        eventId: event.event_id,
        expected: expectedHash,
        actual: event.hash_chain
      };
    }
    
    previousHash = event.hash_chain;
  }
  
  return { valid: true, message: 'Hash chain integrity verified' };
}

/**
 * POST /api/v1/audit/log
 * Create a new audit log entry
 */
router.post('/log', async (req, res) => {
  const traceId = `aud_${uuidv4()}`;
  const startTime = Date.now();
  
  try {
    const {
      claimId,
      eventType,
      llmModelVersion,
      confidenceScore,
      rationale,
      inputSnapshot,
      outputData,
      evidenceQuotes,
      userId,
      userRole,
      processingTimeMs
    } = req.body;
    
    // Validate required fields
    if (!claimId || !eventType) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'claimId and eventType are required',
        instance: req.path,
        traceId
      });
    }
    
    // Validate event type
    if (!Object.values(AUDIT_EVENT_TYPES).includes(eventType)) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/invalid-event-type',
        title: 'Invalid Event Type',
        status: 400,
        detail: `Event type must be one of: ${Object.values(AUDIT_EVENT_TYPES).join(', ')}`,
        instance: req.path,
        traceId
      });
    }
    
    const auditEvent = await logAuditEvent({
      claimId,
      eventType,
      llmModelVersion,
      confidenceScore,
      rationale,
      inputSnapshot,
      outputData,
      evidenceQuotes,
      userId,
      userRole,
      processingTimeMs
    });
    
    const totalTime = Date.now() - startTime;
    
    res.status(201).json({
      eventId: auditEvent.event_id,
      claimId: auditEvent.claim_id,
      eventType: auditEvent.event_type,
      eventTimestamp: auditEvent.event_timestamp,
      hashChain: auditEvent.hash_chain,
      processingTimeMs: totalTime
    });
    
  } catch (error) {
    console.error('Audit log creation error:', {
      traceId,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      type: 'https://api.roojai.com/errors/internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Failed to create audit log entry',
      instance: req.path,
      traceId
    });
  }
});

/**
 * GET /api/v1/audit/claims/:claimId
 * Retrieve complete audit trail for a claim
 */
router.get('/claims/:claimId', async (req, res) => {
  const { claimId } = req.params;
  const { cursor, limit = 50 } = req.query;
  const traceId = `aud_${uuidv4()}`;
  const startTime = Date.now();
  
  try {
    // Build query with cursor-based pagination
    let query = `
      SELECT event_id, event_type, llm_model_version, confidence_score,
             rationale, input_snapshot, output_data, evidence_quotes,
             user_id, user_role, processing_time_ms, event_timestamp, hash_chain
      FROM audit_log
      WHERE claim_id = $1
    `;
    const params = [claimId];
    
    if (cursor) {
      query += ` AND event_timestamp < $2`;
      params.push(new Date(cursor));
    }
    
    query += ` ORDER BY event_timestamp DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit) + 1); // Fetch one extra to check if more exist
    
    const result = await db.pool.query(query, params);
    
    const hasMore = result.rows.length > parseInt(limit);
    const events = hasMore ? result.rows.slice(0, -1) : result.rows;
    
    const nextCursor = hasMore 
      ? events[events.length - 1].event_timestamp.toISOString()
      : null;
    
    const processingTime = Date.now() - startTime;
    
    res.json({
      claimId,
      events: events.map(event => ({
        eventId: event.event_id,
        eventType: event.event_type,
        llmModelVersion: event.llm_model_version,
        confidenceScore: event.confidence_score ? parseFloat(event.confidence_score) : null,
        rationale: event.rationale,
        inputSnapshot: event.input_snapshot,
        outputData: event.output_data,
        evidenceQuotes: event.evidence_quotes,
        userId: event.user_id,
        userRole: event.user_role,
        processingTimeMs: event.processing_time_ms,
        eventTimestamp: event.event_timestamp.toISOString()
      })),
      pagination: {
        nextCursor,
        hasMore
      },
      processingTimeMs: processingTime
    });
    
  } catch (error) {
    console.error('Audit log retrieval error:', {
      traceId,
      claimId,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      type: 'https://api.roojai.com/errors/internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Failed to retrieve audit log',
      instance: req.path,
      traceId
    });
  }
});

/**
 * GET /api/v1/audit/claims/:claimId/verify
 * Verify hash chain integrity for a claim
 */
router.get('/claims/:claimId/verify', async (req, res) => {
  const { claimId } = req.params;
  const traceId = `aud_${uuidv4()}`;
  const startTime = Date.now();
  
  try {
    const verification = await verifyHashChain(claimId);
    const processingTime = Date.now() - startTime;
    
    res.json({
      claimId,
      verification,
      processingTimeMs: processingTime
    });
    
  } catch (error) {
    console.error('Hash chain verification error:', {
      traceId,
      claimId,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      type: 'https://api.roojai.com/errors/internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Failed to verify hash chain',
      instance: req.path,
      traceId
    });
  }
});

/**
 * GET /api/v1/audit/stats
 * Get audit log statistics (admin only)
 */
router.get('/stats', async (req, res) => {
  const traceId = `aud_${uuidv4()}`;
  
  try {
    const stats = await db.pool.query(`
      SELECT 
        event_type,
        COUNT(*) as event_count,
        AVG(processing_time_ms) as avg_processing_time,
        MAX(event_timestamp) as last_event_time
      FROM audit_log
      WHERE event_timestamp > NOW() - INTERVAL '24 hours'
      GROUP BY event_type
      ORDER BY event_count DESC
    `);
    
    const totalEvents = await db.pool.query(`
      SELECT COUNT(*) as total FROM audit_log
    `);
    
    const oldestEvent = await db.pool.query(`
      SELECT MIN(event_timestamp) as oldest FROM audit_log
    `);
    
    res.json({
      eventTypeStats: stats.rows.map(row => ({
        eventType: row.event_type,
        eventCount: parseInt(row.event_count),
        avgProcessingTimeMs: row.avg_processing_time ? parseFloat(row.avg_processing_time) : null,
        lastEventTime: row.last_event_time
      })),
      totalEvents: parseInt(totalEvents.rows[0].total),
      oldestEvent: oldestEvent.rows[0].oldest,
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Audit stats error:', {
      traceId,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      type: 'https://api.roojai.com/errors/internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Failed to retrieve audit statistics',
      instance: req.path,
      traceId
    });
  }
});

/**
 * DELETE /api/v1/audit/purge
 * Purge expired audit logs per PDPA retention policy (admin only)
 */
router.delete('/purge', async (req, res) => {
  const traceId = `aud_${uuidv4()}`;
  const startTime = Date.now();
  
  try {
    const { retentionDays = 2555 } = req.body; // Default 7 years for claim records
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const result = await db.pool.query(
      `DELETE FROM audit_log 
       WHERE event_timestamp < $1
       RETURNING event_id`,
      [cutoffDate]
    );
    
    const processingTime = Date.now() - startTime;
    
    res.json({
      purgedCount: result.rowCount,
      cutoffDate: cutoffDate.toISOString(),
      retentionDays,
      processingTimeMs: processingTime
    });
    
  } catch (error) {
    console.error('Audit purge error:', {
      traceId,
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      type: 'https://api.roojai.com/errors/internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Failed to purge audit logs',
      instance: req.path,
      traceId
    });
  }
});

module.exports = router;
module.exports.logAuditEvent = logAuditEvent;
module.exports.verifyHashChain = verifyHashChain;
module.exports.AUDIT_EVENT_TYPES = AUDIT_EVENT_TYPES;