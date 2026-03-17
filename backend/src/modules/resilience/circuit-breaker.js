const EventEmitter = require('events');

/**
 * Circuit Breaker States
 */
const CIRCUIT_STATE = {
  CLOSED: 'CLOSED',     // Normal operation
  OPEN: 'OPEN',         // Failing, reject all requests
  HALF_OPEN: 'HALF_OPEN' // Testing if service recovered
};

/**
 * Circuit Breaker Configuration
 */
const DEFAULT_CONFIG = {
  failureThreshold: 3,           // Open circuit after 3 consecutive failures
  successThreshold: 2,           // Close circuit after 2 consecutive successes in half-open
  timeout: 10000,                // Request timeout in ms
  resetTimeout: 30000,           // Time before attempting half-open from open (30s)
  halfOpenMaxAttempts: 5,        // Max concurrent requests in half-open state
  monitoringWindow: 60000,       // Rolling window for failure rate calculation (1 min)
  volumeThreshold: 10            // Minimum requests before calculating failure rate
};

/**
 * Circuit Breaker Implementation
 */
class CircuitBreaker extends EventEmitter {
  constructor(name, config = {}) {
    super();
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // State management
    this.state = CIRCUIT_STATE.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.halfOpenAttempts = 0;
    
    // Metrics tracking
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rejectedRequests: 0,
      timeouts: 0,
      lastStateChange: Date.now(),
      stateHistory: []
    };
    
    // Rolling window for failure rate
    this.requestWindow = [];
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute(fn, fallback = null) {
    // Check if circuit is open
    if (this.state === CIRCUIT_STATE.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        this.metrics.rejectedRequests++;
        this.emit('rejected', { 
          name: this.name, 
          state: this.state,
          nextAttempt: this.nextAttemptTime 
        });
        
        if (fallback) {
          return await fallback();
        }
        
        throw new Error(`Circuit breaker [${this.name}] is OPEN. Next attempt at ${new Date(this.nextAttemptTime).toISOString()}`);
      }
      
      // Transition to half-open
      this.transitionTo(CIRCUIT_STATE.HALF_OPEN);
    }

    // Check half-open concurrent limit
    if (this.state === CIRCUIT_STATE.HALF_OPEN) {
      if (this.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
        this.metrics.rejectedRequests++;
        
        if (fallback) {
          return await fallback();
        }
        
        throw new Error(`Circuit breaker [${this.name}] is HALF_OPEN with max concurrent attempts`);
      }
      this.halfOpenAttempts++;
    }

    this.metrics.totalRequests++;
    const startTime = Date.now();

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn);
      
      // Record success
      this.onSuccess(Date.now() - startTime);
      
      return result;
    } catch (error) {
      // Record failure
      this.onFailure(error, Date.now() - startTime);
      
      if (fallback) {
        return await fallback();
      }
      
      throw error;
    } finally {
      if (this.state === CIRCUIT_STATE.HALF_OPEN) {
        this.halfOpenAttempts--;
      }
    }
  }

  /**
   * Execute function with timeout
   */
  async executeWithTimeout(fn) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.metrics.timeouts++;
        reject(new Error(`Request timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);

      try {
        const result = await fn();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Handle successful request
   */
  onSuccess(duration) {
    this.metrics.successfulRequests++;
    this.failureCount = 0;
    
    // Add to rolling window
    this.addToWindow({ success: true, timestamp: Date.now(), duration });

    if (this.state === CIRCUIT_STATE.HALF_OPEN) {
      this.successCount++;
      
      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo(CIRCUIT_STATE.CLOSED);
      }
    }

    this.emit('success', { 
      name: this.name, 
      state: this.state, 
      duration 
    });
  }

  /**
   * Handle failed request
   */
  onFailure(error, duration) {
    this.metrics.failedRequests++;
    this.lastFailureTime = Date.now();
    
    // Add to rolling window
    this.addToWindow({ success: false, timestamp: Date.now(), duration, error: error.message });

    if (this.state === CIRCUIT_STATE.HALF_OPEN) {
      // Immediate transition to open on any failure in half-open
      this.transitionTo(CIRCUIT_STATE.OPEN);
    } else if (this.state === CIRCUIT_STATE.CLOSED) {
      this.failureCount++;
      
      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionTo(CIRCUIT_STATE.OPEN);
      }
    }

    this.emit('failure', { 
      name: this.name, 
      state: this.state, 
      error: error.message,
      failureCount: this.failureCount 
    });
  }

  /**
   * Transition to new state
   */
  transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    
    // Reset counters
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenAttempts = 0;

    // Set next attempt time for open state
    if (newState === CIRCUIT_STATE.OPEN) {
      this.nextAttemptTime = Date.now() + this.config.resetTimeout;
    }

    // Record state change
    this.metrics.lastStateChange = Date.now();
    this.metrics.stateHistory.push({
      from: oldState,
      to: newState,
      timestamp: Date.now()
    });

    // Keep history manageable
    if (this.metrics.stateHistory.length > 100) {
      this.metrics.stateHistory = this.metrics.stateHistory.slice(-50);
    }

    this.emit('stateChange', { 
      name: this.name, 
      from: oldState, 
      to: newState,
      nextAttempt: this.nextAttemptTime 
    });
  }

  /**
   * Add request to rolling window
   */
  addToWindow(request) {
    const now = Date.now();
    this.requestWindow.push(request);
    
    // Remove old requests outside monitoring window
    this.requestWindow = this.requestWindow.filter(
      req => now - req.timestamp < this.config.monitoringWindow
    );
  }

  /**
   * Get current failure rate
   */
  getFailureRate() {
    if (this.requestWindow.length < this.config.volumeThreshold) {
      return 0;
    }

    const failures = this.requestWindow.filter(req => !req.success).length;
    return failures / this.requestWindow.length;
  }

  /**
   * Get circuit breaker status
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      failureRate: this.getFailureRate(),
      nextAttemptTime: this.nextAttemptTime,
      metrics: {
        ...this.metrics,
        recentRequests: this.requestWindow.length
      },
      config: this.config
    };
  }

  /**
   * Force open the circuit (for testing/maintenance)
   */
  forceOpen() {
    this.transitionTo(CIRCUIT_STATE.OPEN);
  }

  /**
   * Force close the circuit (for testing/recovery)
   */
  forceClose() {
    this.transitionTo(CIRCUIT_STATE.CLOSED);
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.state = CIRCUIT_STATE.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.halfOpenAttempts = 0;
    this.requestWindow = [];
    
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rejectedRequests: 0,
      timeouts: 0,
      lastStateChange: Date.now(),
      stateHistory: []
    };
  }
}

module.exports = {
  CircuitBreaker,
  CIRCUIT_STATE,
  DEFAULT_CONFIG
};