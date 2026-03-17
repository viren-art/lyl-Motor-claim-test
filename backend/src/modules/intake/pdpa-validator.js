const { v4: uuidv4 } = require('uuid');

/**
 * Validates PDPA consent value
 * @param {boolean} consent - PDPA consent flag
 * @returns {boolean} - True if valid consent given
 */
function validatePDPAConsent(consent) {
  // Consent must be explicitly true (not null, undefined, or false)
  return consent === true;
}

/**
 * Logs PDPA consent record to database
 * @param {Object} client - PostgreSQL client (transaction context)
 * @param {Object} consentData - Consent details
 * @returns {string} - Consent ID
 */
async function logConsentRecord(client, consentData) {
  const {
    claimId,
    pdpaConsentGiven,
    consentTimestamp,
    purposeOfProcessing,
    retentionPeriodDays
  } = consentData;

  const consentId = `cns_${uuidv4()}`;

  await client.query(`
    INSERT INTO consent_records (
      consent_id, claim_id, pdpa_consent_given,
      consent_timestamp, purpose_of_processing,
      retention_period_days, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
  `, [
    consentId,
    claimId,
    pdpaConsentGiven,
    consentTimestamp,
    purposeOfProcessing,
    retentionPeriodDays
  ]);

  return consentId;
}

module.exports = {
  validatePDPAConsent,
  logConsentRecord
};