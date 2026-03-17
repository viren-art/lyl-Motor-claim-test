const { Pool } = require('pg');
const crypto = require('crypto');
const config = require('../../config/database.config');

class AuditService {
  constructor() {
    this.pool = new Pool(config.postgres);
  }

  /**
   * Log event to immutable audit trail
   * Hash-chain ensures integrity
   */
  async logEvent(eventData) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get previous hash for this claim
      const previousHashQuery = `
        SELECT current_hash FROM audit_log
        WHERE claim_id = $1
        ORDER BY event_timestamp DESC
        LIMIT 1
      `;
      const previousResult = await client.query(previousHashQuery, [eventData.claimId]);
      const previousHash = previousResult.rows.length > 0 
        ? previousResult.rows[0].current_hash 
        : '0000000000000000000000000000000000000000000000000000000000000000';

      // Calculate current hash
      const hashInput = `${previousHash}${eventData.claimId}${eventData.eventType}${eventData.eventTimestamp}${JSON.stringify(eventData.outputData)}`;
      const currentHash = crypto.createHash('sha256').update(hashInput).digest('hex');

      // Insert audit log entry
      const insertQuery = `
        INSERT INTO audit_log (
          audit_id,
          claim_id,
          event_type,
          event_timestamp,
          llm_model_version,
          input_data_snapshot,
          output_data,
          confidence_score,
          rationale,
          processing_duration_ms,
          user_id,
          previous_hash,
          current_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `;

      const { v4: uuidv4 } = require('uuid');
      const values = [
        uuidv4(),
        eventData.claimId,
        eventData.eventType,
        eventData.eventTimestamp,
        eventData.llmModelVersion || null,
        eventData.inputDataSnapshot,
        eventData.outputData,
        eventData.confidenceScore || null,
        eventData.rationale || null,
        eventData.processingDurationMs || null,
        eventData.userId || null,
        previousHash,
        currentHash
      ];

      const result = await client.query(insertQuery, values);
      
      await client.query('COMMIT');
      
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Verify audit log integrity for a claim
   */
  async verifyIntegrity(claimId) {
    const query = `
      SELECT audit_id, claim_id, event_type, event_timestamp, 
             output_data, previous_hash, current_hash
      FROM audit_log
      WHERE claim_id = $1
      ORDER BY event_timestamp ASC
    `;
    
    const result = await this.pool.query(query, [claimId]);
    const entries = result.rows;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const expectedPreviousHash = i === 0 
        ? '0000000000000000000000000000000000000000000000000000000000000000'
        : entries[i - 1].current_hash;

      if (entry.previous_hash !== expectedPreviousHash) {
        return {
          valid: false,
          message: `Hash chain broken at entry ${entry.audit_id}`,
          entryIndex: i
        };
      }

      // Recalculate hash
      const hashInput = `${entry.previous_hash}${entry.claim_id}${entry.event_type}${entry.event_timestamp}${JSON.stringify(entry.output_data)}`;
      const calculatedHash = crypto.createHash('sha256').update(hashInput).digest('hex');

      if (calculatedHash !== entry.current_hash) {
        return {
          valid: false,
          message: `Hash mismatch at entry ${entry.audit_id}`,
          entryIndex: i
        };
      }
    }

    return {
      valid: true,
      message: 'Audit log integrity verified',
      entriesChecked: entries.length
    };
  }
}

module.exports = new AuditService();