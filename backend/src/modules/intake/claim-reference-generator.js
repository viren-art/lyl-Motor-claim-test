const { v4: uuidv4 } = require('uuid');

/**
 * Generates unique claim reference number
 * Format: clm_{uuid_first_12_chars}
 * @returns {string} - Claim reference ID
 */
function generateClaimReference() {
  const uuid = uuidv4().replace(/-/g, '');
  return `clm_${uuid.substring(0, 12)}`;
}

module.exports = {
  generateClaimReference
};