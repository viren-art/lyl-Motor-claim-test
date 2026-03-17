const express = require('express');
const { v4: uuidv4 } = require('uuid');
const extractionService = require('./extraction.service');

const router = express.Router();

/**
 * POST /api/v1/extraction/extract
 * Trigger LLM extraction for a claim
 */
router.post('/extract', async (req, res) => {
  const traceId = `req_${uuidv4()}`;
  const startTime = Date.now();

  try {
    const {
      claimId,
      narrative,
      language = 'th',
      channel = 'web',
      incidentDate = null,
      location = null,
      policeReportFiled = null
    } = req.body;

    // Validate required fields
    if (!claimId || !narrative) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'claimId and narrative are required',
        instance: req.path,
        traceId
      });
    }

    if (narrative.length < 20) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'Narrative must be at least 20 characters',
        instance: req.path,
        traceId
      });
    }

    // Call extraction service
    const result = await extractionService.extractClaimData({
      claimId,
      narrative,
      language,
      channel,
      incidentDate,
      location,
      policeReportFiled
    });

    const processingTime = Date.now() - startTime;

    res.status(200).json({
      claimId: result.claimId,
      fnolSummary: result.extractedData.incident_details.narrative_summary,
      vehicles: result.extractedData.vehicles,
      incidentDetails: result.extractedData.incident_details,
      parties: result.extractedData.parties,
      injuries: result.extractedData.injuries,
      policeReport: result.extractedData.police_report,
      confidenceScore: result.extractedData.overall_confidence,
      missingFields: result.extractedData.missing_critical_fields,
      ambiguousInformation: result.extractedData.ambiguous_information,
      languageDetected: result.extractedData.language_detected,
      processingTimeMs: processingTime,
      traceId
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;

    console.error(`[${traceId}] Extraction request failed:`, error.message);

    if (error.message.includes('timeout')) {
      return res.status(504).json({
        type: 'https://api.roojai.com/errors/extraction-timeout',
        title: 'Extraction Timeout',
        status: 504,
        detail: error.message,
        instance: req.path,
        traceId,
        processingTimeMs: processingTime
      });
    }

    res.status(500).json({
      type: 'https://api.roojai.com/errors/extraction-failed',
      title: 'Extraction Failed',
      status: 500,
      detail: error.message,
      instance: req.path,
      traceId,
      processingTimeMs: processingTime
    });
  }
});

/**
 * GET /api/v1/extraction/health
 * Check extraction service and LLM service health
 */
router.get('/health', async (req, res) => {
  try {
    const llmHealth = await extractionService.checkLLMHealth();

    res.status(200).json({
      status: llmHealth.status === 'up' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        llm: llmHealth.status,
        llmProvider: llmHealth.provider || 'unknown',
        llmModel: llmHealth.model_version || 'unknown'
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

module.exports = router;