const { CircuitBreaker, CIRCUIT_STATE } = require('../../../src/modules/resilience/circuit-breaker');

describe('CircuitBreaker', () => {
  let circuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker('TEST_SERVICE', {
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
      resetTimeout: 5000
    });
  });

  afterEach(() => {
    circuitBreaker.reset();
  });

  describe('State Transitions', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.state).toBe(CIRCUIT_STATE.CLOSED);
    });

    it('should transition to OPEN after failure threshold', async () => {
      const failingFn = async () => {
        throw new Error('Service unavailable');
      };

      // Execute 3 failing requests
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.state).toBe(CIRCUIT_STATE.OPEN);
    });

    it('should reject requests when OPEN', async () => {
      circuitBreaker.forceOpen();

      const successFn = async () => 'success';

      await expect(circuitBreaker.execute(successFn)).rejects.toThrow('Circuit breaker');
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      jest.useFakeTimers();
      
      circuitBreaker.forceOpen();
      expect(circuitBreaker.state).toBe(CIRCUIT_STATE.OPEN);

      // Fast-forward past reset timeout
      jest.advanceTimersByTime(6000);

      const successFn = async () => 'success';
      await circuitBreaker.execute(successFn);

      expect(circuitBreaker.state).toBe(CIRCUIT_STATE.HALF_OPEN);

      jest.useRealTimers();
    });

    it('should transition to CLOSED after success threshold in HALF_OPEN', async () => {
      circuitBreaker.transitionTo(CIRCUIT_STATE.HALF_OPEN);

      const successFn = async () => 'success';

      // Execute 2 successful requests (success threshold)
      await circuitBreaker.execute(successFn);
      await circuitBreaker.execute(successFn);

      expect(circuitBreaker.state).toBe(CIRCUIT_STATE.CLOSED);
    });

    it('should transition back to OPEN on failure in HALF_OPEN', async () => {
      circuitBreaker.transitionTo(CIRCUIT_STATE.HALF_OPEN);

      const failingFn = async () => {
        throw new Error('Still failing');
      };

      try {
        await circuitBreaker.execute(failingFn);
      } catch (error) {
        // Expected
      }

      expect(circuitBreaker.state).toBe(CIRCUIT_STATE.OPEN);
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout slow requests', async () => {
      const slowFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return 'success';
      };

      await expect(circuitBreaker.execute(slowFn)).rejects.toThrow('timeout');
      expect(circuitBreaker.metrics.timeouts).toBe(1);
    });

    it('should count timeouts as failures', async () => {
      const slowFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return 'success';
      };

      // Execute 3 slow requests
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(slowFn);
        } catch (error) {
          // Expected timeout
        }
      }

      expect(circuitBreaker.state).toBe(CIRCUIT_STATE.OPEN);
      expect(circuitBreaker.metrics.timeouts).toBe(3);
    });
  });

  describe('Fallback Execution', () => {
    it('should execute fallback when circuit is OPEN', async () => {
      circuitBreaker.forceOpen();

      const mainFn = async () => 'main';
      const fallbackFn = async () => 'fallback';

      const result = await circuitBreaker.execute(mainFn, fallbackFn);
      expect(result).toBe('fallback');
    });

    it('should execute fallback on failure', async () => {
      const failingFn = async () => {
        throw new Error('Failed');
      };
      const fallbackFn = async () => 'fallback';

      const result = await circuitBreaker.execute(failingFn, fallbackFn);
      expect(result).toBe('fallback');
    });
  });

  describe('Metrics Tracking', () => {
    it('should track successful requests', async () => {
      const successFn = async () => 'success';

      await circuitBreaker.execute(successFn);
      await circuitBreaker.execute(successFn);

      expect(circuitBreaker.metrics.totalRequests).toBe(2);
      expect(circuitBreaker.metrics.successfulRequests).toBe(2);
      expect(circuitBreaker.metrics.failedRequests).toBe(0);
    });

    it('should track failed requests', async () => {
      const failingFn = async () => {
        throw new Error('Failed');
      };

      try {
        await circuitBreaker.execute(failingFn);
      } catch (error) {
        // Expected
      }

      expect(circuitBreaker.metrics.totalRequests).toBe(1);
      expect(circuitBreaker.metrics.successfulRequests).toBe(0);
      expect(circuitBreaker.metrics.failedRequests).toBe(1);
    });

    it('should track rejected requests', async () => {
      circuitBreaker.forceOpen();

      const successFn = async () => 'success';

      try {
        await circuitBreaker.execute(successFn);
      } catch (error) {
        // Expected
      }

      expect(circuitBreaker.metrics.rejectedRequests).toBe(1);
    });

    it('should calculate failure rate correctly', async () => {
      const successFn = async () => 'success';
      const failingFn = async () => {
        throw new Error('Failed');
      };

      // 7 successes, 3 failures = 30% failure rate
      for (let i = 0; i < 7; i++) {
        await circuitBreaker.execute(successFn);
      }

      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingFn);
        } catch (error) {
          // Expected
        }
      }

      const failureRate = circuitBreaker.getFailureRate();
      expect(failureRate).toBeCloseTo(0.3, 1);
    });
  });

  describe('Event Emission', () => {
    it('should emit stateChange event', (done) => {
      circuitBreaker.on('stateChange', (event) => {
        expect(event.from).toBe(CIRCUIT_STATE.CLOSED);
        expect(event.to).toBe(CIRCUIT_STATE.OPEN);
        done();
      });

      circuitBreaker.forceOpen();
    });

    it('should emit success event', (done) => {
      circuitBreaker.on('success', (event) => {
        expect(event.name).toBe('TEST_SERVICE');
        expect(event.state).toBe(CIRCUIT_STATE.CLOSED);
        done();
      });

      const successFn = async () => 'success';
      circuitBreaker.execute(successFn);
    });

    it('should emit failure event', (done) => {
      circuitBreaker.on('failure', (event) => {
        expect(event.name).toBe('TEST_SERVICE');
        expect(event.error).toBeDefined();
        done();
      });

      const failingFn = async () => {
        throw new Error('Failed');
      };
      
      circuitBreaker.execute(failingFn).catch(() => {});
    });
  });
});