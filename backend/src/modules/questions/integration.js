/**
 * Questions Service Integration
 * Node.js wrapper for calling Python FastAPI questions service
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const QUESTIONS_SERVICE_URL = process.env.QUESTIONS_SERVICE_URL || 'http://localhost:8000';
const QUESTIONS_TIMEOUT_MS = parseInt(process.env.QUESTIONS_TIMEOUT_MS || '25000');

// Circuit breaker state
const circuitBreakerState = {
  failures: 0,
  lastFailureTime: null,
  state: 'CLOSED' // CLOSED, OPEN, HALF_OPEN
};

const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds

/**
 * Check circuit breaker state
 */
function checkCircuitBreaker() {
  if (circuitBreakerState.state === 'OPEN') {
    const timeSinceFailure = Date.now() - circuitBreakerState.lastFailureTime;
    if (timeSinceFailure > CIRCUIT_BREAKER_TIMEOUT) {
      circuitBreakerState.state = 'HALF_OPEN';
      console.log('Circuit breaker entering HALF_OPEN state');
    } else {
      throw new Error('Questions service circuit breaker is OPEN');
    }
  }
}

/**
 * Record circuit breaker failure
 */
function recordFailure() {
  circuitBreakerState.failures++;
  circuitBreakerState.lastFailureTime = Date.now();
  
  if (circuitBreakerState.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreakerState.state = 'OPEN';
    console.error('Circuit breaker opened after', circuitBreakerState.failures, 'failures');
  }
}

/**
 * Record circuit breaker success
 */
function recordSuccess() {
  circuitBreakerState.failures = 0;
  circuitBreakerState.state = 'CLOSED';
}

/**
 * Generate clarifying questions for missing fields
 * @param {string} claimId - Claim identifier
 * @param {string} language - Target language (th or en)
 * @param {Array} missingFields - Array of missing field objects
 * @param {Object} claimContext - Claim context for question generation
 * @returns {Promise<Object>} Generated questions response
 */
async function generateQuestions(claimId, language, missingFields, claimContext) {
  const startTime = Date.now();
  const traceId = `req_${uuidv4()}`;
  
  try {
    // Check circuit breaker
    checkCircuitBreaker();
    
    console.log(`[${traceId}] Generating questions for claim ${claimId}, language: ${language}`);
    
    // Call Python FastAPI service
    const response = await axios.post(
      `${QUESTIONS_SERVICE_URL}/api/v1/questions/generate`,
      {
        claim_id: claimId,
        language: language,
        missing_fields: missingFields,
        claim_context: claimContext
      },
      {
        timeout: QUESTIONS_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          'X-Trace-ID': traceId
        }
      }
    );
    
    recordSuccess();
    
    const processingTime = Date.now() - startTime;
    console.log(`[${traceId}] Questions generated in ${processingTime}ms`);
    
    return {
      success: true,
      data: response.data,
      processingTimeMs: processingTime
    };
    
  } catch (error) {
    recordFailure();
    
    const processingTime = Date.now() - startTime;
    console.error(`[${traceId}] Questions generation failed after ${processingTime}ms:`, error.message);
    
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      throw new Error('Questions service timeout');
    }
    
    if (error.response) {
      throw new Error(`Questions service error: ${error.response.status} - ${error.response.data?.detail || error.message}`);
    }
    
    throw new Error(`Questions service unavailable: ${error.message}`);
  }
}

/**
 * Get questions service health status
 * @returns {Promise<Object>} Health status
 */
async function getHealthStatus() {
  try {
    const response = await axios.get(`${QUESTIONS_SERVICE_URL}/health`, {
      timeout: 5000
    });
    
    return {
      status: 'healthy',
      ...response.data
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

/**
 * Get circuit breaker status
 * @returns {Object} Circuit breaker state
 */
function getCircuitBreakerStatus() {
  return {
    state: circuitBreakerState.state,
    failures: circuitBreakerState.failures,
    lastFailureTime: circuitBreakerState.lastFailureTime
  };
}

/**
 * Reset circuit breaker (admin function)
 */
function resetCircuitBreaker() {
  circuitBreakerState.failures = 0;
  circuitBreakerState.lastFailureTime = null;
  circuitBreakerState.state = 'CLOSED';
  console.log('Circuit breaker manually reset');
}

module.exports = {
  generateQuestions,
  getHealthStatus,
  getCircuitBreakerStatus,
  resetCircuitBreaker
};