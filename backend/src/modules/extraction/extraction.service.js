const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const db = require('../../database/connection');
const { maskPII } = require('../../middleware/security/pii-encryption');

const LLM_SERVICE_URL = process.env.LLM_SERVICE_URL || 'http://localhost:8001';
const EXTRACTION_TIMEOUT_MS = 30000; // 30-second SLA

/**
 * Coordinates LLM extraction and database updates
 */
class ExtractionService {
  /**
   * Extract claim data from FNOL narrative using LLM
   * @param {Object} params - Extraction parameters
   * @returns {Object} - Extracted claim data with confidence scores
   */
  async extractClaimData({
    claimId,
    narrative,
    language = 'th',
    channel = 'web',
    incidentDate = null,
    location = null,
    policeReportFiled = null
  }) {
    const startTime = Date.now();
    const traceId = `extract_${uuidv4()}`;

    try {
      console.log(`[${traceId}] Starting extraction for claim ${claimId}`);

      // Call LLM service with timeout
      const response = await axios.post(
        `${LLM_SERVICE_URL}/api/v1/llm/extract`,
        {
          narrative,
          language,
          channel,
          incident_date: incidentDate,
          location,
          police_report_filed: policeReportFiled
        },
        {
          timeout: EXTRACTION_TIMEOUT_MS,
          headers: {
            'Content-Type': 'application/json',
            'X-Trace-ID': traceId
          }
        }
      );

      const extractedData = response.data;
      const processingTime = Date.now() - startTime;

      console.log(`[${traceId}] Extraction completed in ${processingTime}ms (confidence: ${extractedData.overall_confidence})`);

      // Update claim record with extracted data
      await this.updateClaimWithExtraction(claimId, extractedData, traceId);

      // Log to audit trail
      await this.logExtractionAudit(claimId, {
        narrative,
        language,
        channel
      }, extractedData, processingTime, traceId);

      return {
        claimId,
        extractedData,
        processingTimeMs: processingTime,
        traceId
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;

      if (error.code === 'ECONNABORTED' || processingTime >= EXTRACTION_TIMEOUT_MS) {
        console.error(`[${traceId}] Extraction timeout after ${processingTime}ms`);
        
        // Escalate to manual queue on timeout
        await this.escalateToManualQueue(claimId, 'LLM_TIMEOUT', {
          processingTime,
          error: 'Extraction exceeded 30-second SLA'
        });

        throw new Error(`Extraction timeout after ${processingTime}ms (SLA: 30s)`);
      }

      console.error(`[${traceId}] Extraction failed:`, error.message);
      
      // Escalate to manual queue on LLM service failure
      await this.escalateToManualQueue(claimId, 'LLM_SERVICE_ERROR', {
        processingTime,
        error: error.message
      });

      throw new Error(`LLM extraction failed: ${error.message}`);
    }
  }

  /**
   * Update claim record with extracted data
   * @param {string} claimId - Claim reference ID
   * @param {Object} extractedData - Extracted claim data from LLM
   * @param {string} traceId - Trace ID for logging
   */
  async updateClaimWithExtraction(claimId, extractedData, traceId) {
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Update main claim record
      await client.query(`
        UPDATE claims
        SET 
          fnol_summary = $1,
          confidence_score = $2,
          llm_model_version = $3,
          language = $4,
          status = CASE 
            WHEN $2 >= 0.75 THEN 'TRIAGE_PENDING'
            ELSE 'INTAKE'
          END,
          updated_at = NOW()
        WHERE claim_id = $5
      `, [
        extractedData.incident_details.narrative_summary,
        extractedData.overall_confidence,
        extractedData.metadata.llm_model_version,
        extractedData.language_detected,
        claimId
      ]);

      // Get database claim ID
      const claimResult = await client.query(
        'SELECT id FROM claims WHERE claim_id = $1',
        [claimId]
      );
      const claimDbId = claimResult.rows[0].id;

      // Insert vehicle records
      for (const vehicle of extractedData.vehicles) {
        await client.query(`
          INSERT INTO vehicles (
            claim_id, vehicle_type, make, model, license_plate, vin, damage_description
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          claimDbId,
          vehicle.vehicle_type,
          vehicle.make === 'unknown' ? null : vehicle.make,
          vehicle.model === 'unknown' ? null : vehicle.model,
          vehicle.license_plate === 'unknown' ? null : vehicle.license_plate,
          vehicle.vin === 'unknown' ? null : vehicle.vin,
          vehicle.damage_description === 'unknown' ? null : vehicle.damage_description
        ]);
      }

      // Update incident location if extracted
      if (extractedData.incident_details.location.lat && extractedData.incident_details.location.lng) {
        await client.query(`
          UPDATE claims
          SET 
            incident_location_lat = $1,
            incident_location_lng = $2,
            incident_address = $3
          WHERE claim_id = $4
        `, [
          extractedData.incident_details.location.lat,
          extractedData.incident_details.location.lng,
          extractedData.incident_details.location.address,
          claimId
        ]);
      }

      // Update police report info if extracted
      if (extractedData.police_report.report_filed !== 'unknown') {
        await client.query(`
          UPDATE claims
          SET 
            police_report_filed = $1,
            police_report_number = $2
          WHERE claim_id = $3
        `, [
          extractedData.police_report.report_filed,
          extractedData.police_report.report_number === 'unknown' ? null : extractedData.police_report.report_number,
          claimId
        ]);
      }

      // Update injury status
      await client.query(`
        UPDATE claims
        SET injuries_reported = $1
        WHERE claim_id = $2
      `, [
        extractedData.injuries.injuries_reported,
        claimId
      ]);

      // Store missing fields for clarification
      if (extractedData.missing_critical_fields.length > 0) {
        await client.query(`
          UPDATE claims
          SET missing_fields = $1
          WHERE claim_id = $2
        `, [
          extractedData.missing_critical_fields,
          claimId
        ]);
      }

      await client.query('COMMIT');
      console.log(`[${traceId}] Claim ${claimId} updated with extraction data`);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`[${traceId}] Failed to update claim:`, error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Log extraction to audit trail
   * @param {string} claimId - Claim reference ID
   * @param {Object} inputData - Input data snapshot
   * @param {Object} outputData - Extracted data
   * @param {number} processingTime - Processing time in ms
   * @param {string} traceId - Trace ID
   */
  async logExtractionAudit(claimId, inputData, outputData, processingTime, traceId) {
    const client = await db.pool.connect();

    try {
      // Get database claim ID
      const claimResult = await client.query(
        'SELECT id FROM claims WHERE claim_id = $1',
        [claimId]
      );
      const claimDbId = claimResult.rows[0].id;

      // Mask PII in input data for audit log
      const maskedInput = {
        ...inputData,
        narrative: maskPII(inputData.narrative)
      };

      await client.query(`
        INSERT INTO audit_log (
          claim_id, event_type, llm_model_version, input_data_snapshot,
          output_data, confidence_score, processing_duration_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        claimDbId,
        'EXTRACTION',
        outputData.metadata.llm_model_version,
        JSON.stringify(maskedInput),
        JSON.stringify(outputData),
        outputData.overall_confidence,
        processingTime
      ]);

      console.log(`[${traceId}] Extraction audit logged for claim ${claimId}`);

    } catch (error) {
      console.error(`[${traceId}] Failed to log extraction audit:`, error.message);
      // Don't throw - audit logging failure should not break extraction flow
    } finally {
      client.release();
    }
  }

  /**
   * Escalate claim to manual queue on extraction failure
   * @param {string} claimId - Claim reference ID
   * @param {string} reason - Escalation reason
   * @param {Object} metadata - Additional metadata
   */
  async escalateToManualQueue(claimId, reason, metadata) {
    const client = await db.pool.connect();

    try {
      // Get database claim ID
      const claimResult = await client.query(
        'SELECT id FROM claims WHERE claim_id = $1',
        [claimId]
      );
      const claimDbId = claimResult.rows[0].id;

      // Update claim status
      await client.query(`
        UPDATE claims
        SET 
          status = 'ADJUSTER_REVIEW',
          human_review_required = true,
          updated_at = NOW()
        WHERE claim_id = $1
      `, [claimId]);

      // Insert into human review queue
      await client.query(`
        INSERT INTO human_review_queue (
          claim_id, escalation_reason, queued_at
        ) VALUES ($1, $2, NOW())
      `, [
        claimDbId,
        reason
      ]);

      console.log(`Claim ${claimId} escalated to manual queue (reason: ${reason})`);

    } catch (error) {
      console.error(`Failed to escalate claim ${claimId}:`, error.message);
    } finally {
      client.release();
    }
  }

  /**
   * Check LLM service health
   * @returns {Object} - Health status
   */
  async checkLLMHealth() {
    try {
      const response = await axios.get(`${LLM_SERVICE_URL}/api/v1/llm/health`, {
        timeout: 5000
      });
      return {
        status: 'up',
        ...response.data
      };
    } catch (error) {
      return {
        status: 'down',
        error: error.message
      };
    }
  }
}

module.exports = new ExtractionService();