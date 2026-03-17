const request = require('supertest');
const app = require('../../../src/app');
const db = require('../../../src/database/connection');
const { shouldEscalate, ESCALATION_CONFIG, ESCALATION_REASONS } = require('../../../src/modules/escalation');

describe('Escalation Service', () => {
  beforeAll(async () => {
    // Clean up test data
    await db.pool.query('DELETE FROM human_review_queue WHERE claim_id LIKE $1', ['test_%']);
    await db.pool.query('DELETE FROM claims WHERE claim_id LIKE $1', ['test_%']);
  });

  afterAll(async () => {
    await db.pool.end();
  });

  describe('shouldEscalate()', () => {
    it('should escalate claim with confidence below threshold', () => {
      const claimData = {
        claimId: 'test_low_confidence',
        confidenceScore: 0.65,
        estimatedValue: 100000,
        fraudRiskScore: 30,
        policyActive: true
      };

      const result = shouldEscalate(claimData);

      expect(result.shouldEscalate).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].type).toBe(ESCALATION_REASONS.LOW_CONFIDENCE);
      expect(result.reasons[0].detail).toContain('0.65');
    });

    it('should escalate claim with high value', () => {
      const claimData = {
        claimId: 'test_high_value',
        confidenceScore: 0.95,
        estimatedValue: 600000,
        fraudRiskScore: 20,
        policyActive: true
      };

      const result = shouldEscalate(claimData);

      expect(result.shouldEscalate).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].type).toBe(ESCALATION_REASONS.HIGH_VALUE);
      expect(result.reasons[0].detail).toContain('600,000');
    });

    it('should escalate claim with high fraud risk', () => {
      const claimData = {
        claimId: 'test_fraud_risk',
        confidenceScore: 0.85,
        estimatedValue: 200000,
        fraudRiskScore: 75,
        policyActive: true
      };

      const result = shouldEscalate(claimData);

      expect(result.shouldEscalate).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].type).toBe(ESCALATION_REASONS.FRAUD_INDICATORS);
    });

    it('should escalate claim with inactive policy', () => {
      const claimData = {
        claimId: 'test_inactive_policy',
        confidenceScore: 0.90,
        estimatedValue: 150000,
        fraudRiskScore: 25,
        policyActive: false
      };

      const result = shouldEscalate(claimData);

      expect(result.shouldEscalate).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].type).toBe(ESCALATION_REASONS.POLICY_VALIDATION_FAILED);
    });

    it('should not escalate claim meeting all criteria', () => {
      const claimData = {
        claimId: 'test_no_escalation',
        confidenceScore: 0.92,
        estimatedValue: 250000,
        fraudRiskScore: 35,
        policyActive: true,
        policy_number: 'POL123456',
        incident_date: '2026-01-15',
        incident_location_lat: 13.7563,
        incident_location_lng: 100.5018
      };

      const result = shouldEscalate(claimData);

      expect(result.shouldEscalate).toBe(false);
      expect(result.reasons).toHaveLength(0);
    });

    it('should escalate claim with multiple reasons', () => {
      const claimData = {
        claimId: 'test_multiple_reasons',
        confidenceScore: 0.68,
        estimatedValue: 550000,
        fraudRiskScore: 72,
        policyActive: true
      };

      const result = shouldEscalate(claimData);

      expect(result.shouldEscalate).toBe(true);
      expect(result.reasons.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('POST /api/v1/escalation/evaluate', () => {
    it('should evaluate escalation criteria and return decision', async () => {
      const response = await request(app)
        .post('/api/v1/escalation/evaluate')
        .send({
          claimId: 'test_eval_001',
          confidenceScore: 0.70,
          estimatedValue: 300000,
          fraudRiskScore: 45,
          policyActive: true
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('shouldEscalate');
      expect(response.body).toHaveProperty('escalationReasons');
      expect(response.body).toHaveProperty('processingTimeMs');
      expect(response.body.shouldEscalate).toBe(true);
    });

    it('should return 400 for missing claimId', async () => {
      const response = await request(app)
        .post('/api/v1/escalation/evaluate')
        .send({
          confidenceScore: 0.80
        });

      expect(response.status).toBe(400);
      expect(response.body.detail).toContain('claimId is required');
    });
  });

  describe('POST /api/v1/escalation/escalate', () => {
    beforeEach(async () => {
      // Create test claim
      await db.pool.query(
        `INSERT INTO claims (claim_id, policy_number, status, language, incident_date, narrative, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        ['test_escalate_001', 'POL123456', 'TRIAGE_PENDING', 'th', '2026-01-15', 'Test narrative']
      );
    });

    it('should escalate claim to human review queue', async () => {
      const response = await request(app)
        .post('/api/v1/escalation/escalate')
        .send({
          claimId: 'test_escalate_001',
          reasons: [
            {
              type: ESCALATION_REASONS.LOW_CONFIDENCE,
              detail: 'Confidence score 0.68 below threshold 0.75'
            }
          ],
          urgency: 'high',
          metadata: {
            originalConfidence: 0.68
          }
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('reviewQueueId');
      expect(response.body.status).toBe('PENDING');
      expect(response.body.claimId).toBe('test_escalate_001');

      // Verify claim status updated
      const claimResult = await db.pool.query(
        'SELECT status, human_review_required FROM claims WHERE claim_id = $1',
        ['test_escalate_001']
      );
      expect(claimResult.rows[0].status).toBe('ADJUSTER_REVIEW');
      expect(claimResult.rows[0].human_review_required).toBe(true);
    });

    it('should return 400 for missing reasons', async () => {
      const response = await request(app)
        .post('/api/v1/escalation/escalate')
        .send({
          claimId: 'test_escalate_001'
        });

      expect(response.status).toBe(400);
      expect(response.body.detail).toContain('reasons array are required');
    });
  });

  describe('GET /api/v1/escalation/queue', () => {
    beforeEach(async () => {
      // Create test claims and queue entries
      await db.pool.query(
        `INSERT INTO claims (claim_id, policy_number, status, language, incident_date, narrative, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        ['test_queue_001', 'POL111111', 'ADJUSTER_REVIEW', 'th', '2026-01-15', 'Test narrative 1']
      );

      await db.pool.query(
        `INSERT INTO human_review_queue (claim_id, escalation_reason, status, created_at)
         VALUES ($1, $2, $3, NOW())`,
        ['test_queue_001', 'LOW_CONFIDENCE: Score 0.65', 'PENDING']
      );
    });

    it('should retrieve pending review queue items', async () => {
      const response = await request(app)
        .get('/api/v1/escalation/queue')
        .query({ status: 'PENDING', limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('queue');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.queue)).toBe(true);
      expect(response.body.queue.length).toBeGreaterThan(0);
    });

    it('should filter queue by assigned adjuster', async () => {
      // Assign a claim first
      await db.pool.query(
        `UPDATE human_review_queue 
         SET assigned_to = $1, status = 'IN_PROGRESS'
         WHERE claim_id = $2`,
        ['adjuster_001', 'test_queue_001']
      );

      const response = await request(app)
        .get('/api/v1/escalation/queue')
        .query({ assignedTo: 'adjuster_001' });

      expect(response.status).toBe(200);
      expect(response.body.queue.length).toBeGreaterThan(0);
      expect(response.body.queue[0].assigned_to).toBe('adjuster_001');
    });
  });

  describe('GET /api/v1/escalation/stats', () => {
    it('should return escalation statistics', async () => {
      const response = await request(app)
        .get('/api/v1/escalation/stats')
        .query({ period: '7d' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('reasonDistribution');
      expect(response.body).toHaveProperty('statusDistribution');
      expect(response.body).toHaveProperty('escalationRate');
      expect(Array.isArray(response.body.reasonDistribution)).toBe(true);
    });
  });
});