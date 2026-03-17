const { LLMServiceMonitor, HEALTH_STATUS } = require('../../../src/modules/resilience/llm-service-monitor');
const { CIRCUIT_STATE } = require('../../../src/modules/resilience/circuit-breaker');
const axios = require('axios');

jest.mock('axios');

describe('LLMServiceMonitor', () => {
  let monitor;

  beforeEach(() => {
    monitor = new LLMServiceMonitor();
    jest.clearAllMocks();
  });

  afterEach(() => {
    monitor.stopHealthChecks();
  });

  describe('Service Health Checks', () => {
    it('should mark primary service as healthy on successful check', async () => {
      axios.get.mockResolvedValue({ status: 200 });

      await monitor.checkPrimaryHealth();

      expect(monitor.serviceHealth.primary.status).toBe(HEALTH_STATUS.HEALTHY);
      expect(monitor.serviceHealth.primary.consecutiveFailures).toBe(0);
    });

    it('should mark primary service as degraded after 1-2 failures', async () => {
      axios.get.mockRejectedValue(new Error('Connection failed'));

      await monitor.checkPrimaryHealth();
      expect(monitor.serviceHealth.primary.status).toBe(HEALTH_STATUS.DEGRADED);

      await monitor.checkPrimaryHealth();
      expect(monitor.serviceHealth.primary.status).toBe(HEALTH_STATUS.DEGRADED);
    });

    it('should mark primary service as unavailable after 3 failures', async () => {
      axios.get.mockRejectedValue(new Error('Connection failed'));

      await monitor.checkPrimaryHealth();
      await monitor.checkPrimaryHealth();
      await monitor.checkPrimaryHealth();

      expect(monitor.serviceHealth.primary.status).toBe(HEALTH_STATUS.UNAVAILABLE);
      expect(monitor.serviceHealth.primary.consecutiveFailures).toBe(3);
    });
  });

  describe('LLM Request Execution', () => {
    it('should execute request on primary service successfully', async () => {
      const requestFn = jest.fn().mockResolvedValue({ data: 'success' });

      const result = await monitor.executeLLMRequest(requestFn);

      expect(result.success).toBe(true);
      expect(result.service).toBe('primary');
      expect(result.data).toEqual({ data: 'success' });
      expect(requestFn).toHaveBeenCalledTimes(1);
    });

    it('should use fallback when primary service fails', async () => {
      const requestFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));
      const fallbackFn = jest.fn().mockResolvedValue({ fallback: true });

      // Force primary circuit open
      monitor.primaryCircuit.forceOpen();

      const result = await monitor.executeLLMRequest(requestFn, fallbackFn);

      expect(result.success).toBe(false);
      expect(result.service).toBe('fallback');
      expect(result.data).toEqual({ fallback: true });
      expect(fallbackFn).toHaveBeenCalledTimes(1);
    });

    it('should throw error when no fallback provided and all services fail', async () => {
      const requestFn = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Force primary circuit open
      monitor.primaryCircuit.forceOpen();

      await expect(monitor.executeLLMRequest(requestFn)).rejects.toThrow('All LLM services unavailable');
    });
  });

  describe('Service Status', () => {
    it('should return overall healthy status when primary is healthy', () => {
      monitor.serviceHealth.primary.status = HEALTH_STATUS.HEALTHY;

      const status = monitor.getServiceStatus();

      expect(status.overall).toBe(HEALTH_STATUS.HEALTHY);
    });

    it('should return overall unavailable when all services are down', () => {
      monitor.serviceHealth.primary.status = HEALTH_STATUS.UNAVAILABLE;

      const status = monitor.getServiceStatus();

      expect(status.overall).toBe(HEALTH_STATUS.UNAVAILABLE);
    });

    it('should include circuit breaker metrics in status', () => {
      const status = monitor.getServiceStatus();

      expect(status.primary.circuit).toBeDefined();
      expect(status.primary.circuit.state).toBe(CIRCUIT_STATE.CLOSED);
      expect(status.primary.circuit.metrics).toBeDefined();
    });
  });

  describe('Circuit Breaker Control', () => {
    it('should force primary circuit open', () => {
      monitor.forceCircuitState('primary', 'open');

      expect(monitor.primaryCircuit.state).toBe(CIRCUIT_STATE.OPEN);
    });

    it('should force primary circuit closed', () => {
      monitor.primaryCircuit.forceOpen();
      monitor.forceCircuitState('primary', 'closed');

      expect(monitor.primaryCircuit.state).toBe(CIRCUIT_STATE.CLOSED);
    });
  });

  describe('Alert Handling', () => {
    it('should send outage alert when circuit opens', (done) => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      monitor.primaryCircuit.on('stateChange', (event) => {
        if (event.to === CIRCUIT_STATE.OPEN) {
          setTimeout(() => {
            expect(consoleSpy).toHaveBeenCalledWith(
              expect.stringContaining('[ALERT]')
            );
            consoleSpy.mockRestore();
            done();
          }, 100);
        }
      });

      monitor.primaryCircuit.forceOpen();
    });

    it('should send recovery alert when circuit closes', (done) => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      monitor.primaryCircuit.forceOpen();

      monitor.primaryCircuit.on('stateChange', (event) => {
        if (event.to === CIRCUIT_STATE.CLOSED) {
          setTimeout(() => {
            expect(consoleSpy).toHaveBeenCalledWith(
              expect.stringContaining('[ALERT]')
            );
            consoleSpy.mockRestore();
            done();
          }, 100);
        }
      });

      monitor.primaryCircuit.forceClose();
    });
  });
});