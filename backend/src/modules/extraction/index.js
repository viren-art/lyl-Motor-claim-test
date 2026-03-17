const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const db = require('../../database/connection');
const { decryptPII } = require('../../middleware/security/pii-encryption');
const {
  validateMandatoryFields,
  markUnknownFields,
  prioritizeMissingFields,
  detectHallucination,
} = require('../validation');

const router = express.Router();

// LLM Service Configuration
const LLM_SERVICE_URL = process.env.LLM_SERVICE_URL || 'http://localhost:8000';
const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '30000');
const CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.75');

// Circuit breaker state
let circuitBreakerState = {
  isOpen: false,
  failureCount: 0,
  lastFailureTime: null,
  successCount: 0,
};

const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds
const CIRCUIT_BREAKER_HALF_OPEN_RETRY = 30000; // 30 seconds

/**
 * Check circuit breaker state
 */
function checkCircuitBreaker() {
  if (!circuitBreakerState.isOpen) {
    return { allowed: true };
  }
  
  const timeSinceFailure = Date.now() - circuitBreakerState.lastFailureTime;
  
  if (timeSinceFailure > CIRCUIT_BREAKER_HALF_OPEN_RETRY) {
    // Half-open state: allow one retry
    return { allowed: true, halfOpen: true };
  }
  
  return { allowed: false, reason: 'Circuit breaker open' };
}

/**
 * Record circuit breaker failure
 */
function recordCircuitBreakerFailure() {
  circuitBreakerState.failureCount++;
  circuitBreakerState.lastFailureTime = Date.now();
  
  if (circuitBreakerState.failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreakerState.isOpen = true;
    console.error('[Circuit Breaker] OPEN - LLM service failures exceeded threshold');
  }
}

/**
 * Record circuit breaker success
 */
function recordCircuitBreakerSuccess() {
  circuitBreakerState.successCount++;
  
  if (circuitBreakerState.isOpen) {
    // Reset circuit breaker after successful call
    circuitBreakerState.isOpen = false;
    circuitBreakerState.failureCount = 0;
    console.info('[Circuit Breaker] CLOSED - LLM service recovered');
  }
}

/**
 * Call LLM service with circuit breaker and timeout
 */
async function callLLMService(claimData, traceId) {
  const circuitCheck = checkCircuitBreaker();
  
  if (!circuitCheck.allowed) {
    throw new Error('LLM service unavailable - circuit breaker open');
  }
  
  try {
    const response = await axios.post(
      `${LLM_SERVICE_URL}/extract`,
      claimData,
      {
        timeout: LLM_TIMEOUT_MS,
        headers: {
          'X-Trace-ID': traceId,
          'Content-Type': 'application/json',
        },
      }
    );
    
    recordCircuitBreakerSuccess();
    return response.data;
  } catch (error) {
    recordCircuitBreakerFailure();
    throw error;
  }
}

/**
 * Adjust confidence score based on missing critical fields
 * Implements AC-4: Confidence score reduced when critical fields are unknown
 */
function adjustConfidenceScore(baseConfidence, validation) {
  let adjustedConfidence = baseConfidence;
  
  // Count critical and high priority missing fields
  const criticalMissing = validation.missingFields.filter(f => f.criticality === 'CRITICAL').length;
  const highMissing = validation.missingFields.filter(f => f.criticality === 'HIGH').length;
  
  // Apply penalties for missing fields
  // Each critical field missing: -0.25 (cap at 0.5 max confidence)
  // Each high field missing: -0.10
  const criticalPenalty = criticalMissing * 0.25;
  const highPenalty = highMissing * 0.10;
  
  adjustedConfidence = Math.max(0.0, baseConfidence - criticalPenalty - highPenalty);
  
  // If any critical field is missing, cap confidence at 0.5
  if (criticalMissing > 0) {
    adjustedConfidence = Math.min(0.5, adjustedConfidence);
  }
  
  // If more than 3 high-priority fields missing, cap at 0.6
  if (highMissing > 3) {
    adjustedConfidence = Math.min(0.6, adjustedConfidence);
  }
  
  return Math.round(adjustedConfidence * 100) / 100; // Round to 2 decimals
}

/**
 * Validate extracted data and mark unknown fields
 */
function validateExtractedData(extractedData, originalInput, baseConfidence) {
  // Detect hallucination
  const hallucinatedFields = detectHallucination(extractedData, originalInput);
  
  if (hallucinatedFields.length > 0) {
    console.warn('[Hallucination Detection]', {
      count: hallucinatedFields.length,
      fields: hallucinatedFields,
    });
    
    // Mark hallucinated fields as unknown
    for (const hallucination of hallucinatedFields) {
      const fieldPath = hallucination.field;
      const keys = fieldPath.split('.');
      let target = extractedData;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!target[keys[i]]) break;
        target = target[keys[i]];
      }
      
      if (target) {
        target[keys[keys.length - 1]] = 'unknown';
      }
    }
  }
  
  // Validate mandatory fields
  const validation = validateMandatoryFields(extractedData, originalInput);
  
  // Mark unknown fields explicitly
  const markedData = markUnknownFields(extractedData, validation.unknownFields);
  
  // Prioritize missing fields for clarifying questions
  const prioritizedFields = prioritizeMissingFields(validation.missingFields);
  
  // Adjust confidence score based on missing fields (AC-4)
  const adjustedConfidence = adjustConfidenceScore(baseConfidence, validation);
  
  return {
    extractedData: markedData,
    validation,
    prioritizedMissingFields: prioritizedFields,
    hallucinatedFields,
    readyForTriage: validation.readyForTriage,
    adjustedConfidence,
    confidenceAdjustment: {
      original: baseConfidence,
      adjusted: adjustedConfidence,
      reduction: Math.round((baseConfidence - adjustedConfidence) * 100) / 100,
      reason: validation.criticalFieldsMissing 
        ? `Critical fields missing (${validation.summary.critical}), confidence capped at 0.5`
        : validation.summary.high > 3
        ? `Multiple high-priority fields missing (${validation.summary.high})`
        : 'No significant field gaps',
    },
  };
}

/**
 * POST /api/v1/claims/:claimId/extract
 * Extract structured data from claim narrative
 */
router.post('/:claimId/extract', async (req, res) => {
  const { claimId } = req.params;
  const startTime = Date.now();
  const traceId = `req_${uuidv4()}`;
  
  try {
    console.info('[Extraction] Starting extraction', { claimId, traceId });
    
    // Fetch claim from database
    const claimResult = await db.pool.query(
      'SELECT * FROM claims WHERE claim_id = $1',
      [claimId]
    );
    
    if (claimResult.rows.length === 0) {
      return res.status(404).json({
        type: 'https://api.roojai.com/errors/claim-not-found',
        title: 'Claim Not Found',
        status: 404,
        detail: `Claim ${claimId} does not exist`,
        instance: req.path,
        traceId,
      });
    }
    
    const claim = claimResult.rows[0];
    
    // Prepare additional context for LLM
    const additionalContext = {
      language: claim.language,
      injuriesReported: claim.injuries_reported,
      policeReportFiled: claim.police_report_filed,
    };
    
    // Call LLM service
    let llmResponse;
    try {
      llmResponse = await callLLMService({
        narrative: claim.narrative,
        incidentDate: claim.incident_date,
        incidentLocation: {
          lat: claim.incident_location_lat,
          lng: claim.incident_location_lng,
          address: claim.incident_address,
        },
        additionalContext,
      }, traceId);
    } catch (error) {
      // Handle LLM service failures
      console.error('[Extraction] LLM service error', {
        claimId,
        error: error.message,
        traceId,
      });
      
      // Escalate to manual queue
      await db.pool.query(
        `INSERT INTO human_review_queue (claim_id, escalation_reason, status)
         VALUES ($1, $2, 'PENDING')`,
        [claimId, `LLM service unavailable: ${error.message}`]
      );
      
      return res.status(503).json({
        type: 'https://api.roojai.com/errors/llm-service-unavailable',
        title: 'LLM Service Unavailable',
        status: 503,
        detail: 'Claim escalated to manual review queue',
        instance: req.path,
        traceId,
      });
    }
    
    // Validate extracted data and detect missing fields
    const validationResult = validateExtractedData(
      llmResponse,
      {
        narrative: claim.narrative,
        incidentDate: claim.incident_date,
        incidentLocation: {
          lat: claim.incident_location_lat,
          lng: claim.incident_location_lng,
          address: claim.incident_address,
        },
        injuriesReported: claim.injuries_reported,
        policeReportFiled: claim.police_report_filed,
      },
      llmResponse.confidenceScore
    );
    
    const { 
      extractedData, 
      validation, 
      prioritizedMissingFields, 
      hallucinatedFields,
      adjustedConfidence,
      confidenceAdjustment,
    } = validationResult;
    
    // Update claim with extracted data
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Update main claim record with adjusted confidence
      await client.query(
        `UPDATE claims SET
          policy_number = $1,
          fnol_summary = $2,
          missing_fields = $3,
          confidence_score = $4,
          llm_model_version = $5,
          processing_time_ms = $6,
          human_review_required = $7,
          updated_at = now()
         WHERE claim_id = $8`,
        [
          extractedData.policyNumber === 'unknown' ? null : extractedData.policyNumber,
          extractedData.summary,
          validation.missingFields.map(f => f.key),
          adjustedConfidence, // Use adjusted confidence instead of raw LLM score
          llmResponse.modelVersion,
          Date.now() - startTime,
          !validation.readyForTriage,
          claimId,
        ]
      );
      
      // Insert vehicle records
      if (extractedData.vehicles && Array.isArray(extractedData.vehicles)) {
        for (const vehicle of extractedData.vehicles) {
          await client.query(
            `INSERT INTO vehicles (claim_id, role, license_plate, make, model, year, vin, color, damage_description)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              claimId,
              vehicle.role,
              vehicle.licensePlate === 'unknown' ? null : vehicle.licensePlate,
              vehicle.make === 'unknown' ? null : vehicle.make,
              vehicle.model === 'unknown' ? null : vehicle.model,
              vehicle.year === 'unknown' ? null : vehicle.year,
              vehicle.vin === 'unknown' ? null : vehicle.vin,
              vehicle.color === 'unknown' ? null : vehicle.color,
              vehicle.damageDescription === 'unknown' ? null : vehicle.damageDescription,
            ]
          );
        }
      }
      
      // Create audit log entry with confidence adjustment details
      await client.query(
        `INSERT INTO audit_log (event_id, claim_id, event_type, llm_model_version, confidence_score, 
                                rationale, input_snapshot, output_data, processing_time_ms)
         VALUES ($1, $2, 'LLM_EXTRACTION', $3, $4, $5, $6, $7, $8)`,
        [
          `evt_${uuidv4()}`,
          claimId,
          llmResponse.modelVersion,
          adjustedConfidence,
          `Extracted ${Object.keys(extractedData).length} fields. Missing: ${validation.missingFields.length}. Hallucinated: ${hallucinatedFields.length}. Confidence adjusted from ${llmResponse.confidenceScore} to ${adjustedConfidence} (${confidenceAdjustment.reason}).`,
          JSON.stringify({ narrative: claim.narrative }),
          JSON.stringify(extractedData),
          Date.now() - startTime,
        ]
      );
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
    const totalProcessingTime = Date.now() - startTime;
    
    console.info('[Extraction] Completed', {
      claimId,
      processingTime: totalProcessingTime,
      missingFieldsCount: validation.missingFields.length,
      readyForTriage: validation.readyForTriage,
      confidenceAdjustment: confidenceAdjustment.reduction,
      traceId,
    });
    
    // Return response with adjusted confidence
    res.status(200).json({
      claimId,
      extractedData,
      validation: {
        isValid: validation.isValid,
        readyForTriage: validation.readyForTriage,
        missingFields: validation.missingFields,
        summary: validation.summary,
      },
      prioritizedMissingFields,
      hallucinatedFields,
      confidenceScore: adjustedConfidence, // Return adjusted confidence
      confidenceAdjustment, // Include adjustment details for transparency
      processingTimeMs: totalProcessingTime,
      traceId,
    });
  } catch (error) {
    console.error('[Extraction] Error', {
      claimId,
      error: error.message,
      stack: error.stack,
      traceId,
    });
    
    res.status(500).json({
      type: 'https://api.roojai.com/errors/extraction-failed',
      title: 'Extraction Failed',
      status: 500,
      detail: error.message,
      instance: req.path,
      traceId,
    });
  }
});

/**
 * GET /api/v1/claims/:claimId/extraction
 * Retrieve extraction results
 */
router.get('/:claimId/extraction', async (req, res) => {
  const { claimId } = req.params;
  const traceId = `req_${uuidv4()}`;
  
  try {
    // Fetch claim with extraction data
    const result = await db.pool.query(
      `SELECT c.*, 
              array_agg(json_build_object(
                'role', v.role,
                'licensePlate', v.license_plate,
                'make', v.make,
                'model', v.model,
                'year', v.year,
                'vin', v.vin,
                'color', v.color,
                'damageDescription', v.damage_description
              )) FILTER (WHERE v.id IS NOT NULL) as vehicles
       FROM claims c
       LEFT JOIN vehicles v ON c.claim_id = v.claim_id
       WHERE c.claim_id = $1
       GROUP BY c.id`,
      [claimId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        type: 'https://api.roojai.com/errors/claim-not-found',
        title: 'Claim Not Found',
        status: 404,
        detail: `Claim ${claimId} does not exist`,
        instance: req.path,
        traceId,
      });
    }
    
    const claim = result.rows[0];
    
    res.status(200).json({
      claimId: claim.claim_id,
      policyNumber: claim.policy_number,
      fnolSummary: claim.fnol_summary,
      missingFields: claim.missing_fields || [],
      confidenceScore: claim.confidence_score,
      vehicles: claim.vehicles || [],
      processingTimeMs: claim.processing_time_ms,
      humanReviewRequired: claim.human_review_required,
      traceId,
    });
  } catch (error) {
    console.error('[Extraction] Retrieval error', {
      claimId,
      error: error.message,
      traceId,
    });
    
    res.status(500).json({
      type: 'https://api.roojai.com/errors/retrieval-failed',
      title: 'Retrieval Failed',
      status: 500,
      detail: error.message,
      instance: req.path,
      traceId,
    });
  }
});

/**
 * GET /api/v1/extraction/circuit-breaker/status
 * Get circuit breaker status (admin endpoint)
 */
router.get('/circuit-breaker/status', (req, res) => {
  res.status(200).json({
    circuitBreakerState,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/extraction/circuit-breaker/reset
 * Reset circuit breaker (admin endpoint)
 */
router.post('/circuit-breaker/reset', (req, res) => {
  circuitBreakerState = {
    isOpen: false,
    failureCount: 0,
    lastFailureTime: null,
    successCount: 0,
  };
  
  console.info('[Circuit Breaker] Manually reset');
  
  res.status(200).json({
    message: 'Circuit breaker reset successfully',
    circuitBreakerState,
  });
});

module.exports = router;