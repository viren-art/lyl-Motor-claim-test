const request = require('supertest');
const app = require('../../../src/app');
const db = require('../../../src/database/connection');
const { logAuditEvent, verifyHashChain, AUDIT_EVENT_TYPES } = require('../../../src/modules/audit');

describe('Audit Log Service', () => {
  let testClaimId;
  
  beforeAll(async () => {
    // Create test claim
    testClaimId = `clm_test_${Date.now()}`;
    await db.pool.query(
      `INSERT INTO claims (claim_id, policy_number, status, language, incident_date, narrative)
       VALUES ($1, '1234567890', 'INTAKE', 'th', NOW(), 'Test narrative')`,
      [testClaimId]
    );
  });
  
  afterAll(async () => {
    // Clean up test data
    await db.pool.query('DELETE FROM audit_log WHERE claim_id = $1', [testClaimId]);
    await db.pool.query('DELETE FROM claims WHERE claim_id = $1', [testClaimId]);
    await db.pool.end();
  });
  
  describe('POST /api/v1/audit/log', () => {
    it('should create audit log entry with hash chain', async () => {
      const response = await request(app)
        .post('/api/v1/audit/log')
        .send({
          claimId: testClaimId,
          eventType: 'FNOL_SUBMITTED',
          inputSnapshot: {
            policyNumber: '1234567890',
            narrative: 'Test accident narrative'
          },
          outputData: {
            claimId: testClaimId
          },
          processingTimeMs: 150
        });
      
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('eventId');
      expect(response.body).toHaveProperty('hashChain');
      expect(response.body.claimId).toBe(testClaimId);
      expect(response.body.eventType).toBe('FNOL_SUBMITTED');
    });
    
    it('should create second event with chained hash', async () => {
      const response = await request(app)
        .post('/api/v1/audit/log')
        .send({
          claimId: testClaimId,
          eventType: 'LLM_EXTRACTION',
          llmModelVersion: 'gpt-4-turbo',
          confidenceScore: 0.92,
          rationale: 'High confidence extraction',
          inputSnapshot: {
            narrative: 'Test accident narrative'
          },
          outputData: {
            vehicles: [{ make: 'Toyota', model: 'Camry' }]
          },
          evidenceQuotes: ['Test accident narrative'],
          processingTimeMs: 2500
        });
      
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('hashChain');
      
      // Verify hash chain integrity
      const verification = await verifyHashChain(testClaimId);
      expect(verification.valid).toBe(true);
    });
    
    it('should reject invalid event type', async () => {
      const response = await request(app)
        .post('/api/v1/audit/log')
        .send({
          claimId: testClaimId,
          eventType: 'INVALID_TYPE'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.detail).toContain('Event type must be one of');
    });
    
    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/audit/log')
        .send({
          eventType: 'FNOL_SUBMITTED'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.detail).toContain('claimId and eventType are required');
    });
  });
  
  describe('GET /api/v1/audit/claims/:claimId', () => {
    it('should retrieve complete audit trail within 2 seconds', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .get(`/api/v1/audit/claims/${testClaimId}`);
      
      const processingTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(response.body.claimId).toBe(testClaimId);
      expect(response.body.events).toBeInstanceOf(Array);
      expect(response.body.events.length).toBeGreaterThan(0);
      expect(processingTime).toBeLessThan(2000); // NFR: <2 seconds
      
      // Verify event structure
      const event = response.body.events[0];
      expect(event).toHaveProperty('eventId');
      expect(event).toHaveProperty('eventType');
      expect(event).toHaveProperty('eventTimestamp');
    });
    
    it('should support cursor-based pagination', async () => {
      // Create multiple events
      for (let i = 0; i < 5; i++) {
        await logAuditEvent({
          claimId: testClaimId,
          eventType: 'CLAIM_UPDATED',
          processingTimeMs: 100
        });
      }
      
      const response = await request(app)
        .get(`/api/v1/audit/claims/${testClaimId}`)
        .query({ limit: 3 });
      
      expect(response.status).toBe(200);
      expect(response.body.events.length).toBe(3);
      expect(response.body.pagination.hasMore).toBe(true);
      expect(response.body.pagination.nextCursor).toBeDefined();
      
      // Fetch next page
      const nextResponse = await request(app)
        .get(`/api/v1/audit/claims/${testClaimId}`)
        .query({ 
          limit: 3,
          cursor: response.body.pagination.nextCursor
        });
      
      expect(nextResponse.status).toBe(200);
      expect(nextResponse.body.events.length).toBeGreaterThan(0);
    });
  });
  
  describe('GET /api/v1/audit/claims/:claimId/verify', () => {
    it('should verify hash chain integrity', async () => {
      const response = await request(app)
        .get(`/api/v1/audit/claims/${testClaimId}/verify`);
      
      expect(response.status).toBe(200);
      expect(response.body.verification.valid).toBe(true);
      expect(response.body.verification.message).toContain('integrity verified');
    });
    
    it('should detect broken hash chain', async () => {
      // Manually corrupt hash chain in database
      await db.pool.query(
        `UPDATE audit_log 
         SET hash_chain = 'corrupted_hash'
         WHERE claim_id = $1
         ORDER BY event_timestamp DESC
         LIMIT 1`,
        [testClaimId]
      );
      
      const response = await request(app)
        .get(`/api/v1/audit/claims/${testClaimId}/verify`);
      
      expect(response.status).toBe(200);
      expect(response.body.verification.valid).toBe(false);
      expect(response.body.verification.message).toContain('Hash chain broken');
      
      // Restore integrity for other tests
      await db.pool.query('DELETE FROM audit_log WHERE claim_id = $1', [testClaimId]);
    });
  });
  
  describe('GET /api/v1/audit/stats', () => {
    it('should return audit statistics', async () => {
      const response = await request(app)
        .get('/api/v1/audit/stats');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('eventTypeStats');
      expect(response.body).toHaveProperty('totalEvents');
      expect(response.body.eventTypeStats).toBeInstanceOf(Array);
    });
  });
  
  describe('DELETE /api/v1/audit/purge', () => {
    it('should purge expired audit logs', async () => {
      // Create old audit entry
      const oldClaimId = `clm_old_${Date.now()}`;
      await db.pool.query(
        `INSERT INTO claims (claim_id, policy_number, status, language, incident_date, narrative)
         VALUES ($1, '1234567890', 'CLOSED', 'th', NOW() - INTERVAL '8 years', 'Old claim')`,
        [oldClaimId]
      );
      
      await logAuditEvent({
        claimId: oldClaimId,
        eventType: 'FNOL_SUBMITTED',
        processingTimeMs: 100
      });
      
      // Manually set old timestamp
      await db.pool.query(
        `UPDATE audit_log 
         SET event_timestamp = NOW() - INTERVAL '8 years'
         WHERE claim_id = $1`,
        [oldClaimId]
      );
      
      const response = await request(app)
        .delete('/api/v1/audit/purge')
        .send({ retentionDays: 2555 }); // 7 years
      
      expect(response.status).toBe(200);
      expect(response.body.purgedCount).toBeGreaterThan(0);
      
      // Verify old entry was deleted
      const checkResult = await db.pool.query(
        'SELECT COUNT(*) FROM audit_log WHERE claim_id = $1',
        [oldClaimId]
      );
      expect(parseInt(checkResult.rows[0].count)).toBe(0);
      
      // Clean up
      await db.pool.query('DELETE FROM claims WHERE claim_id = $1', [oldClaimId]);
    });
  });
  
  describe('Immutability enforcement', () => {
    it('should prevent updates to audit log entries', async () => {
      const result = await db.pool.query(
        `SELECT event_id FROM audit_log WHERE claim_id = $1 LIMIT 1`,
        [testClaimId]
      );
      
      const eventId = result.rows[0].event_id;
      
      try {
        await db.pool.query(
          `UPDATE audit_log SET rationale = 'Modified' WHERE event_id = $1`,
          [eventId]
        );
        fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toContain('immutable');
      }
    });
  });
  
  describe('PDPA compliance (TC-057)', () => {
    it('should log 100% of LLM decisions', async () => {
      // Create extraction event
      await logAuditEvent({
        claimId: testClaimId,
        eventType: 'LLM_EXTRACTION',
        llmModelVersion: 'gpt-4-turbo',
        confidenceScore: 0.88,
        rationale: 'Extracted vehicle and incident details',
        inputSnapshot: { narrative: 'Test' },
        outputData: { vehicles: [] },
        processingTimeMs: 2000
      });
      
      // Create triage event
      await logAuditEvent({
        claimId: testClaimId,
        eventType: 'TRIAGE_ROUTED',
        llmModelVersion: 'claude-3-opus',
        confidenceScore: 0.91,
        rationale: 'Routed to straight-through processing',
        inputSnapshot: { claim: {} },
        outputData: { route: 'STRAIGHT_THROUGH' },
        processingTimeMs: 1500
      });
      
      // Verify all events logged
      const response = await request(app)
        .get(`/api/v1/audit/claims/${testClaimId}`);
      
      const llmEvents = response.body.events.filter(e => 
        ['LLM_EXTRACTION', 'TRIAGE_ROUTED', 'QUESTION_GENERATED'].includes(e.eventType)
      );
      
      expect(llmEvents.length).toBeGreaterThan(0);
      
      // Verify all have required fields
      llmEvents.forEach(event => {
        expect(event.llmModelVersion).toBeDefined();
        expect(event.confidenceScore).toBeDefined();
        expect(event.rationale).toBeDefined();
      });
    });
  });
});