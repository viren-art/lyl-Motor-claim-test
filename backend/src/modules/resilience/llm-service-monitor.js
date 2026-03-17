const { CircuitBreaker, CIRCUIT_STATE } = require('./circuit-breaker');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

/**
 * LLM Service Configuration
 */
const LLM_SERVICE_CONFIG = {
  PRIMARY_URL: process.env.TRIAGE_SERVICE_URL || 'http://localhost:8001',
  SECONDARY_URL: process.env.TRIAGE_SERVICE_SECONDARY_URL || null,
  HEALTH_CHECK_INTERVAL: 30000,  // 30 seconds
  HEALTH_CHECK_TIMEOUT: 5000,    // 5 seconds
  CIRCUIT_BREAKER_CONFIG: {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 10000,
    resetTimeout: 30000,
    halfOpenMaxAttempts: 5
  }
};

/**
 * Service Health Status
 */
const HEALTH_STATUS = {
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  UNAVAILABLE: 'UNAVAILABLE'
};

/**
 * LLM Service Monitor with Circuit Breaker
 */
class LLMServiceMonitor {
  constructor() {
    // Circuit breakers for each service
    this.primaryCircuit = new CircuitBreaker(
      'LLM_PRIMARY',
      LLM_SERVICE_CONFIG.CIRCUIT_BREAKER_CONFIG
    );
    
    this.secondaryCircuit = LLM_SERVICE_CONFIG.SECONDARY_URL 
      ? new CircuitBreaker('LLM_SECONDARY', LLM_SERVICE_CONFIG.CIRCUIT_BREAKER_CONFIG)
      : null;

    // Service health tracking
    this.serviceHealth = {
      primary: {
        status: HEALTH_STATUS.HEALTHY,
        lastCheck: null,
        lastSuccess: null,
        lastFailure: null,
        consecutiveFailures: 0
      },
      secondary: this.secondaryCircuit ? {
        status: HEALTH_STATUS.HEALTHY,
        lastCheck: null,
        lastSuccess: null,
        lastFailure: null,
        consecutiveFailures: 0
      } : null
    };

    // Alert tracking
    this.alerts = {
      lastOutageAlert: null,
      lastRecoveryAlert: null,
      outageCount: 0
    };

    // Setup event listeners
    this.setupEventListeners();

    // Start health check interval
    this.startHealthChecks();
  }

  /**
   * Setup circuit breaker event listeners
   */
  setupEventListeners() {
    this.primaryCircuit.on('stateChange', (event) => {
      console.log(`[LLM Monitor] Primary circuit state changed: ${event.from} → ${event.to}`);
      
      if (event.to === CIRCUIT_STATE.OPEN) {
        this.handleServiceOutage('primary');
      } else if (event.to === CIRCUIT_STATE.CLOSED && event.from === CIRCUIT_STATE.HALF_OPEN) {
        this.handleServiceRecovery('primary');
      }
    });

    if (this.secondaryCircuit) {
      this.secondaryCircuit.on('stateChange', (event) => {
        console.log(`[LLM Monitor] Secondary circuit state changed: ${event.from} → ${event.to}`);
        
        if (event.to === CIRCUIT_STATE.OPEN) {
          this.handleServiceOutage('secondary');
        } else if (event.to === CIRCUIT_STATE.CLOSED && event.from === CIRCUIT_STATE.HALF_OPEN) {
          this.handleServiceRecovery('secondary');
        }
      });
    }
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    this.healthCheckInterval = setInterval(async () => {
      await this.checkPrimaryHealth();
      
      if (this.secondaryCircuit) {
        await this.checkSecondaryHealth();
      }
    }, LLM_SERVICE_CONFIG.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Stop health checks
   */
  stopHealthChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  /**
   * Check primary service health
   */
  async checkPrimaryHealth() {
    const now = Date.now();
    this.serviceHealth.primary.lastCheck = now;

    try {
      const response = await axios.get(
        `${LLM_SERVICE_CONFIG.PRIMARY_URL}/health`,
        { timeout: LLM_SERVICE_CONFIG.HEALTH_CHECK_TIMEOUT }
      );

      if (response.status === 200) {
        this.serviceHealth.primary.status = HEALTH_STATUS.HEALTHY;
        this.serviceHealth.primary.lastSuccess = now;
        this.serviceHealth.primary.consecutiveFailures = 0;
      }
    } catch (error) {
      this.serviceHealth.primary.consecutiveFailures++;
      this.serviceHealth.primary.lastFailure = now;
      
      if (this.serviceHealth.primary.consecutiveFailures >= 3) {
        this.serviceHealth.primary.status = HEALTH_STATUS.UNAVAILABLE;
      } else {
        this.serviceHealth.primary.status = HEALTH_STATUS.DEGRADED;
      }
    }
  }

  /**
   * Check secondary service health
   */
  async checkSecondaryHealth() {
    if (!this.secondaryCircuit) return;

    const now = Date.now();
    this.serviceHealth.secondary.lastCheck = now;

    try {
      const response = await axios.get(
        `${LLM_SERVICE_CONFIG.SECONDARY_URL}/health`,
        { timeout: LLM_SERVICE_CONFIG.HEALTH_CHECK_TIMEOUT }
      );

      if (response.status === 200) {
        this.serviceHealth.secondary.status = HEALTH_STATUS.HEALTHY;
        this.serviceHealth.secondary.lastSuccess = now;
        this.serviceHealth.secondary.consecutiveFailures = 0;
      }
    } catch (error) {
      this.serviceHealth.secondary.consecutiveFailures++;
      this.serviceHealth.secondary.lastFailure = now;
      
      if (this.serviceHealth.secondary.consecutiveFailures >= 3) {
        this.serviceHealth.secondary.status = HEALTH_STATUS.UNAVAILABLE;
      } else {
        this.serviceHealth.secondary.status = HEALTH_STATUS.DEGRADED;
      }
    }
  }

  /**
   * Execute LLM request with automatic failover
   */
  async executeLLMRequest(requestFn, fallbackFn = null) {
    const requestId = `llm_${uuidv4().substring(0, 8)}`;
    
    // Try primary service first
    try {
      const result = await this.primaryCircuit.execute(
        async () => await requestFn(LLM_SERVICE_CONFIG.PRIMARY_URL),
        null // No fallback yet, will try secondary
      );
      
      return {
        success: true,
        data: result,
        service: 'primary',
        requestId
      };
    } catch (primaryError) {
      console.log(`[LLM Monitor] Primary service failed: ${primaryError.message}`);
      
      // Try secondary service if available
      if (this.secondaryCircuit) {
        try {
          const result = await this.secondaryCircuit.execute(
            async () => await requestFn(LLM_SERVICE_CONFIG.SECONDARY_URL),
            null
          );
          
          return {
            success: true,
            data: result,
            service: 'secondary',
            requestId,
            failover: true
          };
        } catch (secondaryError) {
          console.log(`[LLM Monitor] Secondary service also failed: ${secondaryError.message}`);
        }
      }
      
      // Both services failed, use fallback if provided
      if (fallbackFn) {
        const fallbackResult = await fallbackFn();
        return {
          success: false,
          data: fallbackResult,
          service: 'fallback',
          requestId,
          error: primaryError.message
        };
      }
      
      throw new Error(`All LLM services unavailable. Primary: ${primaryError.message}`);
    }
  }

  /**
   * Handle service outage
   */
  handleServiceOutage(service) {
    const now = Date.now();
    
    // Update health status
    if (this.serviceHealth[service]) {
      this.serviceHealth[service].status = HEALTH_STATUS.UNAVAILABLE;
    }

    // Send alert if not recently alerted
    if (!this.alerts.lastOutageAlert || now - this.alerts.lastOutageAlert > 300000) {
      this.sendOutageAlert(service);
      this.alerts.lastOutageAlert = now;
      this.alerts.outageCount++;
    }
  }

  /**
   * Handle service recovery
   */
  handleServiceRecovery(service) {
    const now = Date.now();
    
    // Update health status
    if (this.serviceHealth[service]) {
      this.serviceHealth[service].status = HEALTH_STATUS.HEALTHY;
      this.serviceHealth[service].consecutiveFailures = 0;
    }

    // Send recovery alert
    this.sendRecoveryAlert(service);
    this.alerts.lastRecoveryAlert = now;
  }

  /**
   * Send outage alert
   */
  sendOutageAlert(service) {
    const alert = {
      type: 'LLM_SERVICE_OUTAGE',
      service,
      timestamp: new Date().toISOString(),
      message: `LLM ${service} service is unavailable. Circuit breaker opened.`,
      severity: 'CRITICAL',
      action: 'Claims are being routed to manual adjuster queue'
    };

    console.error(`[ALERT] ${JSON.stringify(alert)}`);
    
    // In production, send to Slack/PagerDuty
    // await notificationService.sendAlert(alert);
  }

  /**
   * Send recovery alert
   */
  sendRecoveryAlert(service) {
    const alert = {
      type: 'LLM_SERVICE_RECOVERY',
      service,
      timestamp: new Date().toISOString(),
      message: `LLM ${service} service has recovered. Circuit breaker closed.`,
      severity: 'INFO',
      action: 'Automatic claim processing resumed'
    };

    console.log(`[ALERT] ${JSON.stringify(alert)}`);
    
    // In production, send to Slack
    // await notificationService.sendAlert(alert);
  }

  /**
   * Get overall service status
   */
  getServiceStatus() {
    const primaryStatus = this.primaryCircuit.getStatus();
    const secondaryStatus = this.secondaryCircuit 
      ? this.secondaryCircuit.getStatus() 
      : null;

    // Determine overall availability
    let overallStatus = HEALTH_STATUS.UNAVAILABLE;
    
    if (this.serviceHealth.primary.status === HEALTH_STATUS.HEALTHY) {
      overallStatus = HEALTH_STATUS.HEALTHY;
    } else if (this.secondaryCircuit && this.serviceHealth.secondary.status === HEALTH_STATUS.HEALTHY) {
      overallStatus = HEALTH_STATUS.DEGRADED;
    }

    return {
      overall: overallStatus,
      primary: {
        health: this.serviceHealth.primary,
        circuit: primaryStatus
      },
      secondary: secondaryStatus ? {
        health: this.serviceHealth.secondary,
        circuit: secondaryStatus
      } : null,
      alerts: this.alerts,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Force circuit breaker state (for testing)
   */
  forceCircuitState(service, state) {
    if (service === 'primary') {
      if (state === 'open') {
        this.primaryCircuit.forceOpen();
      } else if (state === 'closed') {
        this.primaryCircuit.forceClose();
      }
    } else if (service === 'secondary' && this.secondaryCircuit) {
      if (state === 'open') {
        this.secondaryCircuit.forceOpen();
      } else if (state === 'closed') {
        this.secondaryCircuit.forceClose();
      }
    }
  }
}

// Singleton instance
let monitorInstance = null;

function getLLMServiceMonitor() {
  if (!monitorInstance) {
    monitorInstance = new LLMServiceMonitor();
  }
  return monitorInstance;
}

module.exports = {
  LLMServiceMonitor,
  getLLMServiceMonitor,
  HEALTH_STATUS,
  LLM_SERVICE_CONFIG
};