/**
 * Intake Summary API
 * Dedicated endpoint for retrieving FNOL intake summary with missing field detection
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../../database/connection');
const { validateMandatoryFields, prioritizeMissingFields } = require('../validation');

const router = express.Router();

/**
 * GET /api/v1/claims/:claimId/intake-summary
 * Retrieve intake summary with missing field detection
 * 
 * This is the dedicated "intake summary API" mentioned in AC-3.
 * Returns extraction results, missing fields, and confidence score.
 */
router.get('/:claimId/intake-summary', async (req, res) => {
  const { claimId } = req.params;
  const traceId = `req_${uuidv4()}`;
  
  try {
    // Fetch claim with all related data
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
    
    // Reconstruct extracted data for validation
    const extractedData = {
      policyNumber: claim.policy_number,
      incidentDate: claim.incident_date,
      incidentLocation: {
        lat: claim.incident_location_lat,
        lng: claim.incident_location_lng,
        address: claim.incident_address,
      },
      narrative: claim.narrative,
      vehicles: claim.vehicles || [],
      injuriesReported: claim.injuries_reported,
      policeReportFiled: claim.police_report_filed,
      policeReportNumber: claim.police_report_number,
    };
    
    // Validate mandatory fields
    const validation = validateMandatoryFields(extractedData, {
      narrative: claim.narrative,
      injuriesReported: claim.injuries_reported,
      policeReportFiled: claim.police_report_filed,
    });
    
    // Prioritize missing fields
    const prioritizedMissingFields = prioritizeMissingFields(validation.missingFields);
    
    // Return intake summary with missing field list (AC-3)
    res.status(200).json({
      claimId: claim.claim_id,
      status: claim.status,
      language: claim.language,
      
      // Extracted data summary
      fnolSummary: claim.fnol_summary,
      extractedData: {
        policyNumber: claim.policy_number,
        incidentDate: claim.incident_date,
        incidentLocation: {
          lat: claim.incident_location_lat,
          lng: claim.incident_location_lng,
          address: claim.incident_address,
        },
        vehicles: claim.vehicles || [],
        injuriesReported: claim.injuries_reported,
        policeReportFiled: claim.police_report_filed,
        policeReportNumber: claim.police_report_number,
      },
      
      // Missing field detection (AC-1, AC-3)
      missingFields: validation.missingFields,
      prioritizedMissingFields,
      
      // Validation status
      validation: {
        isValid: validation.isValid,
        readyForTriage: validation.readyForTriage,
        criticalFieldsMissing: validation.criticalFieldsMissing,
        summary: validation.summary,
      },
      
      // Confidence score (AC-4)
      confidenceScore: claim.confidence_score,
      
      // Processing metadata
      processingTimeMs: claim.processing_time_ms,
      humanReviewRequired: claim.human_review_required,
      llmModelVersion: claim.llm_model_version,
      
      traceId,
    });
  } catch (error) {
    console.error('[Intake Summary] Retrieval error', {
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

module.exports = router;