const request = require('supertest');
const app = require('../../../src/app');
const { getLLMServiceMonitor } = require('../../../src/modules/resilience/llm-service-monitor');
const db = require('../../../src/database/connection');

jest.mock('../../../src/modules/resilience/llm-service-monitor');
jest.mock('../../../src/database/connection');

describe('Resilience API', () => {
  let mockMonitor;

  beforeEach(() => {
    mockMonitor = {
      getServiceStatus: jest.fn(),
      executeLLMRequest: jest.fn(),
      forceCircuitState: jest.fn()
    };

    getLLMServiceMonitor.mockReturnValue(mockMonitor);

    db.pool = {
      query: jest.fn()
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/resilience/status', () => {
    it('should return service status successfully', async () => {
      mockMonitor.getServiceStatus.mockReturnValue({
        overall: 'HEALTHY',
        primary: {
          health: { status: 'HEALTHY' },
          circuit: { state: 'CLOSED' }
        },
        secondary: null,
        alerts: { outageCount: 0 },
        timestamp: new Date().toISOString()
      });

      const response = await request(app)
        .get('/api/v1/resilience/status')
        .expect(200);

      expect(response.body.status).toBe('HEALTHY');
      expect(response.body.services.primary).toBeDefined();
      expect(response.body.traceId).toMatch(/^res_/);
    });
  });

  describe('POST /api/v1/resilience/execute', () => {
    it('should execute LLM request successfully', async () => {
      mockMonitor.executeLLMRequest.mockResolvedValue({
        success: true,
        service: 'primary',
        data: { result: 'success' }
      });

      const response = await request(app)
        .post('/api/v1/resilience/execute')
        .send({
          claimId: 'clm_test123',
          operation: 'extract',
          payload: { narrative: 'Test accident' }
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.service).toBe('primary');
      expect(response.body.claimId).toBe('clm_test123');
    });

    it('should return 202 when fallback is used', async () => {
      mockMonitor.executeLLMRequest.mockResolvedValue({
        success: false,
        service: 'fallback',
        data: { fallback: true, route: 'ADJUSTER_REVIEW' }
      });

      db.pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/v1/resilience/execute')
        .send({
          claimId: 'clm_test123',
          operation: 'extract',
          payload: { narrative: 'Test accident' }
        })
        .expect(202);

      expect(response.body.success).toBe(false);
      expect(response.body.service).toBe('fallback');
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/resilience/execute')
        .send({
          claimId: 'clm_test123'
          // Missing operation and payload
        })
        .expect(400);

      expect(response.body.title).toBe('Validation Error');
    });
  });

  describe('POST /api/v1/resilience/circuit/:service/:action', () => {
    it('should open circuit breaker with admin role', async () => {
      mockMonitor.getServiceStatus.mockReturnValue({
        overall: 'DEGRADED',
        primary: { circuit: { state: 'OPEN' } }
      });

      db.pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/v1/resilience/circuit/primary/open')
        .send({
          userId: 'admin_001',
          userRole: 'Admin'
        })
        .expect(200);

      expect(response.body.service).toBe('primary');
      expect(response.body.action).toBe('open');
      expect(mockMonitor.forceCircuitState).toHaveBeenCalledWith('primary', 'open');
    });

    it('should return 403 for non-admin user', async () => {
      const response = await request(app)
        .post('/api/v1/resilience/circuit/primary/open')
        .send({
          userId: 'user_001',
          userRole: 'Agent'
        })
        .expect(403);

      expect(response.body.title).toBe('Forbidden');
    });

    it('should return 400 for invalid service', async () => {
      const response = await request(app)
        .post('/api/v1/resilience/circuit/invalid/open')
        .send({
          userId: 'admin_001',
          userRole: 'Admin'
        })
        .expect(400);

      expect(response.body.detail).toContain('Service must be');
    });

    it('should return 400 for invalid action', async () => {
      const response = await request(app)
        .post('/api/v1/resilience/circuit/primary/invalid')
        .send({
          userId: 'admin_001',
          userRole: 'Admin'
        })
        .expect(400);

      expect(response.body.detail).toContain('Action must be');
    });
  });

  describe('GET /api/v1/resilience/metrics', () => {
    it('should return circuit breaker metrics', async () => {
      mockMonitor.getServiceStatus.mockReturnValue({
        overall: 'HEALTHY',
        primary: {
          circuit: {
            metrics: {
              totalRequests: 100,
              successfulRequests: 95,
              failedRequests: 5,
              rejectedRequests: 0,
              timeouts: 2
            }
          }
        },
        secondary: null,
        alerts: { outageCount: 0 }
      });

      const response = await request(app)
        .get('/api/v1/resilience/metrics')
        .expect(200);

      expect(response.body.aggregate).toBeDefined();
      expect(response.body.aggregate.totalRequests).toBe(100);
      expect(response.body.aggregate.successRate).toBeDefined();
      expect(response.body.primary).toBeDefined();
    });

    it('should calculate success rate correctly', async () => {
      mockMonitor.getServiceStatus.mockReturnValue({
        overall: 'HEALTHY',
        primary: {
          circuit: {
            metrics: {
              totalRequests: 100,
              successfulRequests: 90,
              failedRequests: 10,
              rejectedRequests: 0,
              timeouts: 5
            }
          }
        },
        secondary: null,
        alerts: { outageCount: 0 }
      });

      const response = await request(app)
        .get('/api/v1/resilience/metrics')
        .expect(200);

      expect(parseFloat(response.body.aggregate.successRate)).toBe(90.00);
      expect(parseFloat(response.body.aggregate.failureRate)).toBe(10.00);
    });
  });
});