const { Pool } = require('pg');
const config = require('../../config/database.config');

class ConsentService {
  constructor() {
    this.pool = new Pool(config.postgres);
  }

  /**
   * Validate PDPA consent in request body
   */
  async validateConsent(requestBody) {
    // Check if pdpaConsent field exists and is true
    if (!requestBody.pdpaConsent) {
      return {
        valid: false,
        message: 'PDPA consent must be explicitly granted before processing claim data'
      };
    }

    if (requestBody.pdpaConsent !== true) {
      return {
        valid: false,
        message: 'PDPA consent must be set to true'
      };
    }

    return {
      valid: true,
      message: 'PDPA consent validated successfully'
    };
  }

  /**
   * Log PDPA consent to database
   */
  async logConsent(consentData) {
    const query = `
      INSERT INTO consent_records (
        consent_id,
        claim_id,
        pdpa_consent_given,
        consent_timestamp,
        purpose_of_processing,
        retention_period_days
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const { v4: uuidv4 } = require('uuid');
    const values = [
      uuidv4(),
      consentData.claimId,
      consentData.pdpaConsentGiven,
      consentData.consentTimestamp,
      consentData.purposeOfProcessing,
      consentData.retentionPeriodDays
    ];

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Verify consent exists for claim before processing
   */
  async verifyConsentExists(claimId) {
    const query = `
      SELECT * FROM consent_records 
      WHERE claim_id = $1 AND pdpa_consent_given = true
      ORDER BY consent_timestamp DESC
      LIMIT 1
    `;
    
    const result = await this.pool.query(query, [claimId]);
    
    if (result.rows.length === 0) {
      return {
        exists: false,
        message: 'No valid PDPA consent found for this claim'
      };
    }

    return {
      exists: true,
      consent: result.rows[0]
    };
  }
}

module.exports = new ConsentService();