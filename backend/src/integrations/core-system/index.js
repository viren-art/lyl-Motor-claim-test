const axios = require('axios');

// Core system stub configuration
const CORE_SYSTEM_URL = process.env.CORE_SYSTEM_URL || 'http://localhost:3001';
const DEFAULT_TIMEOUT = 5000;

/**
 * Stub policy database for MVP demo
 * In production, this would be replaced with actual core system API calls
 */
const STUB_POLICIES = {
  '1234567890': {
    policy_number: '1234567890',
    holder_name: 'สมชาย ใจดี',
    active: true,
    coverage_type: 'TYPE_1',
    deductible_thb: 5000,
    effective_date: '2025-01-01',
    expiry_date: '2026-01-01'
  },
  '9876543210': {
    policy_number: '9876543210',
    holder_name: 'สุภาพ รักษ์ดี',
    active: true,
    coverage_type: 'TYPE_2',
    deductible_thb: 10000,
    effective_date: '2025-06-01',
    expiry_date: '2026-06-01'
  },
  '5555555555': {
    policy_number: '5555555555',
    holder_name: 'วิชัย สมบูรณ์',
    active: false, // Lapsed policy
    coverage_type: 'TYPE_1',
    deductible_thb: 5000,
    effective_date: '2024-01-01',
    expiry_date: '2025-01-01'
  },
  '1111111111': {
    policy_number: '1111111111',
    holder_name: 'ประยุทธ์ มั่นคง',
    active: true,
    coverage_type: 'TYPE_3',
    deductible_thb: 0,
    effective_date: '2025-03-01',
    expiry_date: '2026-03-01'
  }
};

/**
 * Validate policy against core system
 * @param {string} policyNumber - 10-digit policy number
 * @param {object} options - Request options (timeout, traceId)
 * @returns {Promise<object>} Policy validation result
 */
async function validatePolicy(policyNumber, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, traceId = 'unknown' } = options;
  
  console.log(`[${traceId}] Validating policy ${policyNumber} against core system`);
  
  // Validate policy number format
  if (!/^\d{10}$/.test(policyNumber)) {
    throw new Error(`Invalid policy number format: ${policyNumber}`);
  }
  
  // In MVP, use stub data
  // In production, this would be an actual API call:
  // const response = await axios.get(
  //   `${CORE_SYSTEM_URL}/api/policies/${policyNumber}`,
  //   { timeout, headers: { 'X-Trace-ID': traceId } }
  // );
  
  // Simulate network delay (50-200ms)
  await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 150));
  
  const policyData = STUB_POLICIES[policyNumber];
  
  if (!policyData) {
    throw new Error(`Policy not found: ${policyNumber}`);
  }
  
  // Check if policy is expired
  const expiryDate = new Date(policyData.expiry_date);
  const now = new Date();
  
  if (expiryDate < now) {
    policyData.active = false;
  }
  
  console.log(`[${traceId}] Policy ${policyNumber} validation result: active=${policyData.active}`);
  
  return {
    policy_number: policyData.policy_number,
    holder_name: policyData.holder_name,
    active: policyData.active,
    coverage_type: policyData.coverage_type,
    deductible_thb: policyData.deductible_thb,
    effective_date: policyData.effective_date,
    expiry_date: policyData.expiry_date
  };
}

/**
 * Batch validate multiple policies
 * @param {string[]} policyNumbers - Array of policy numbers
 * @param {object} options - Request options
 * @returns {Promise<object[]>} Array of validation results
 */
async function batchValidatePolicies(policyNumbers, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, traceId = 'unknown' } = options;
  
  console.log(`[${traceId}] Batch validating ${policyNumbers.length} policies`);
  
  const results = await Promise.allSettled(
    policyNumbers.map(policyNumber => 
      validatePolicy(policyNumber, { timeout, traceId })
    )
  );
  
  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        policy_number: policyNumbers[index],
        error: result.reason.message,
        active: false
      };
    }
  });
}

/**
 * Get policy coverage details
 * @param {string} policyNumber - 10-digit policy number
 * @param {object} options - Request options
 * @returns {Promise<object>} Coverage details
 */
async function getCoverageDetails(policyNumber, options = {}) {
  const policyData = await validatePolicy(policyNumber, options);
  
  // Define coverage limits by type
  const coverageLimits = {
    TYPE_1: {
      property_damage: 1000000,
      bodily_injury_per_person: 100000,
      bodily_injury_per_accident: 1000000,
      medical_expenses: 100000,
      bail_bond: 200000
    },
    TYPE_2: {
      property_damage: 500000,
      bodily_injury_per_person: 100000,
      bodily_injury_per_accident: 1000000,
      medical_expenses: 50000,
      bail_bond: 200000
    },
    TYPE_3: {
      property_damage: 0, // Third-party only
      bodily_injury_per_person: 100000,
      bodily_injury_per_accident: 1000000,
      medical_expenses: 0,
      bail_bond: 200000
    }
  };
  
  return {
    ...policyData,
    coverage_limits: coverageLimits[policyData.coverage_type] || {}
  };
}

module.exports = {
  validatePolicy,
  batchValidatePolicies,
  getCoverageDetails,
  STUB_POLICIES // Export for testing
};