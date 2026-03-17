const request = require('supertest');
const app = require('../../../src/app');
const db = require('../../../src/database/connection');
const redis = require('../../../src/database/redis');
const coreSystemClient = require('../../../src/integrations/core-system');

describe('Policy Validation Service', () => {
  beforeAll(async () => {
    await redis.initRedis();
  });
  
  afterAll(async () => {
    await redis.close();
    await db.pool.end();
  });
  
  beforeEach(async () => {
    // Clear test data
    await db.pool.query('DELETE FROM coverage_checks WHERE claim_id LIKE $1', ['test_%']);
    await db.pool.query('DELETE FROM claims WHERE claim_id LIKE $1', ['test_%']);
  });
  
  describe('POST /api/v1/claims/:claimId/validate-policy', () => {
    it('should validate active policy and return coverage details (TC-016)', async () => {
      // Create test claim
      const claimId = 'test_claim_active_policy';
      await db.pool.query(
        `INSERT INTO claims (
          claim_id, policy_number, status, language,
          incident_date, narrative, injuries_reported,
          police_report_filed, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [
          claimId,
          '1234567890', // Active policy in stub
          'INTAKE',
          'th',
          '2026-01-15T14:30:00+07:00',
          'รถชนกันที่สี่แยก',
          false,
          false
        ]
      );
      
      const response = await request(app)
        .post(`/api/v1/claims/${claimId}/validate-policy`)
        .expect(200);
      
      expect(response.body).toMatchObject({
        claimId,
        policyNumber: '1234567890',
        policyActive: true,
        coverageType: 'TYPE_1',
        deductibleAmountThb: 5000
      });
      
      expect(response.body.requiredDocuments).toBeInstanceOf(Array);
      expect(response.body.requiredDocuments.length).toBeGreaterThan(0);
      expect(response.body.processingTimeMs).toBeLessThan(60000);
    });
    
    it('should escalate lapsed policy to adjuster review (TC-017)', async () => {
      // Create test claim with lapsed policy
      const claimId = 'test_claim_lapsed_policy';
      await db.pool.query(
        `INSERT INTO claims (
          claim_id, policy_number, status, language,
          incident_date, narrative, injuries_reported,
          police_report_filed, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [
          claimId,
          '5555555555', // Lapsed policy in stub
          'INTAKE',
          'th',
          '2026-01-15T14:30:00+07:00',
          'รถชนกันที่สี่แยก',
          false,
          false
        ]
      );
      
      const response = await request(app)
        .post(`/api/v1/claims/${claimId}/validate-policy`)
        .expect(200);
      
      expect(response.body).toMatchObject({
        claimId,
        policyNumber: '5555555555',
        policyActive: false,
        escalated: true
      });
      
      // Verify claim was updated to require human review
      const claimResult = await db.pool.query(
        'SELECT human_review_required, status FROM claims WHERE claim_id = $1',
        [claimId]
      );
      
      expect(claimResult.rows[0].human_review_required).toBe(true);
      expect(claimResult.rows[0].status).toBe('ADJUSTER_REVIEW');
    });
    
    it('should display coverage type and deductible in response (TC-018)', async () => {
      const claimId = 'test_claim_coverage_display';
      await db.pool.query(
        `INSERT INTO claims (
          claim_id, policy_number, status, language,
          incident_date, narrative, injuries_reported,
          police_report_filed, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [
          claimId,
          '9876543210', // TYPE_2 policy
          'INTAKE',
          'th',
          '2026-01-15T14:30:00+07:00',
          'รถชนกันที่สี่แยก',
          false,
          false
        ]
      );
      
      const response = await request(app)
        .post(`/api/v1/claims/${claimId}/validate-policy`)
        .expect(200);
      
      expect(response.body.coverageType).toBe('TYPE_2');
      expect(response.body.deductibleAmountThb).toBe(10000);
      expect(response.body.effectiveDate).toBeDefined();
      expect(response.body.expiryDate).toBeDefined();
    });
    
    it('should generate injury claim document checklist (TC-019)', async () => {
      const claimId = 'test_claim_injury_docs';
      await db.pool.query(
        `INSERT INTO claims (
          claim_id, policy_number, status, language,
          incident_date, narrative, injuries_reported,
          police_report_filed, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [
          claimId,
          '1234567890',
          'INTAKE',
          'th',
          '2026-01-15T14:30:00+07:00',
          'รถชนกันมีคนบาดเจ็บ',
          true, // Injury reported
          true  // Police report filed
        ]
      );
      
      const response = await request(app)
        .post(`/api/v1/claims/${claimId}/validate-policy`)
        .expect(200);
      
      const docTypes = response.body.requiredDocuments.map(d => d.type);
      
      expect(docTypes).toContain('POLICE_REPORT');
      expect(docTypes).toContain('MEDICAL_RECORDS');
      expect(docTypes).toContain('PHOTO');
      
      // Verify police report is required for injury claims
      const policeReport = response.body.requiredDocuments.find(d => d.type === 'POLICE_REPORT');
      expect(policeReport.required).toBe(true);
    });
    
    it('should generate property damage document checklist (TC-020)', async () => {
      const claimId = 'test_claim_property_docs';
      await db.pool.query(
        `INSERT INTO claims (
          claim_id, policy_number, status, language,
          incident_date, narrative, injuries_reported,
          police_report_filed, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [
          claimId,
          '1234567890',
          'INTAKE',
          'th',
          '2026-01-15T14:30:00+07:00',
          'รถชนกันเสียหายเล็กน้อย',
          false, // No injury
          false
        ]
      );
      
      const response = await request(app)
        .post(`/api/v1/claims/${claimId}/validate-policy`)
        .expect(200);
      
      const docTypes = response.body.requiredDocuments.map(d => d.type);
      
      expect(docTypes).toContain('REPAIR_QUOTE');
      expect(docTypes).toContain('PHOTO');
      expect(docTypes).toContain('POLICY');
      expect(docTypes).toContain('LICENSE');
    });
    
    it('should cache policy validation results', async () => {
      const claimId = 'test_claim_cache';
      await db.pool.query(
        `INSERT INTO claims (
          claim_id, policy_number, status, language,
          incident_date, narrative, injuries_reported,
          police_report_filed, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [
          claimId,
          '1234567890',
          'INTAKE',
          'th',
          '2026-01-15T14:30:00+07:00',
          'รถชนกัน',
          false,
          false
        ]
      );
      
      // First call - should query core system
      const response1 = await request(app)
        .post(`/api/v1/claims/${claimId}/validate-policy`)
        .expect(200);
      
      // Check cache
      const cacheKey = 'policy:1234567890';
      const cachedData = await redis.get(cacheKey);
      expect(cachedData).toBeTruthy();
      
      const parsed = JSON.parse(cachedData);
      expect(parsed.policy_number).toBe('1234567890');
      expect(parsed.active).toBe(true);
    });
    
    it('should detect high-severity exclusions and escalate', async () => {
      const claimId = 'test_claim_exclusion';
      await db.pool.query(
        `INSERT INTO claims (
          claim_id, policy_number, status, language,
          incident_date, narrative, injuries_reported,
          police_report_filed, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [
          claimId,
          '1234567890',
          'INTAKE',
          'th',
          '2026-01-15T14:30:00+07:00',
          'ผู้ขับขี่อยู่ในอาการมึนเมาแล้วขับรถชนกัน', // DUI indicator
          false,
          true
        ]
      );
      
      const response = await request(app)
        .post(`/api/v1/claims/${claimId}/validate-policy`)
        .expect(200);
      
      expect(response.body.exclusions.length).toBeGreaterThan(0);
      expect(response.body.exclusions.some(e => e.type === 'DUI')).toBe(true);
      expect(response.body.humanReviewRequired).toBe(true);
    });
    
    it('should return 404 for non-existent claim', async () => {
      const response = await request(app)
        .post('/api/v1/claims/nonexistent_claim/validate-policy')
        .expect(404);
      
      expect(response.body.type).toContain('claim-not-found');
    });
    
    it('should return 400 if policy number is missing', async () => {
      const claimId = 'test_claim_no_policy';
      await db.pool.query(
        `INSERT INTO claims (
          claim_id, policy_number, status, language,
          incident_date, narrative, injuries_reported,
          police_report_filed, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [
          claimId,
          null, // No policy number
          'INTAKE',
          'th',
          '2026-01-15T14:30:00+07:00',
          'รถชนกัน',
          false,
          false
        ]
      );
      
      const response = await request(app)
        .post(`/api/v1/claims/${claimId}/validate-policy`)
        .expect(400);
      
      expect(response.body.type).toContain('missing-policy-number');
    });
  });
  
  describe('GET /api/v1/claims/:claimId/coverage', () => {
    it('should retrieve coverage validation results', async () => {
      const claimId = 'test_claim_get_coverage';
      
      // Create claim and coverage check
      await db.pool.query(
        `INSERT INTO claims (
          claim_id, policy_number, status, language,
          incident_date, narrative, injuries_reported,
          police_report_filed, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [claimId, '1234567890', 'INTAKE', 'th', '2026-01-15T14:30:00+07:00', 'รถชนกัน', false, false]
      );
      
      await db.pool.query(
        `INSERT INTO coverage_checks (
          claim_id, policy_active, deductible_amount_thb,
          exclusions_apply, required_documents, verified_at
         ) VALUES ($1, $2, $3, $4, $5, now())`,
        [claimId, true, 5000, ['NONE'], ['POLICY', 'LICENSE', 'PHOTO']]
      );
      
      const response = await request(app)
        .get(`/api/v1/claims/${claimId}/coverage`)
        .expect(200);
      
      expect(response.body).toMatchObject({
        claimId,
        policyNumber: '1234567890',
        policyActive: true,
        deductibleAmountThb: 5000
      });
    });
    
    it('should return 404 if no coverage check exists', async () => {
      const response = await request(app)
        .get('/api/v1/claims/nonexistent_claim/coverage')
        .expect(404);
      
      expect(response.body.type).toContain('coverage-not-found');
    });
  });
  
  describe('POST /api/v1/admin/policy-cache/invalidate', () => {
    it('should invalidate policy cache entries', async () => {
      // Set cache entries
      await redis.setex('policy:1234567890', 300, JSON.stringify({ test: 'data1' }));
      await redis.setex('policy:9876543210', 300, JSON.stringify({ test: 'data2' }));
      
      const response = await request(app)
        .post('/api/v1/admin/policy-cache/invalidate')
        .send({ policyNumbers: ['1234567890', '9876543210'] })
        .expect(200);
      
      expect(response.body.invalidatedKeys).toHaveLength(2);
      expect(response.body.invalidatedKeys).toContain('policy:1234567890');
      
      // Verify cache was cleared
      const cached1 = await redis.get('policy:1234567890');
      const cached2 = await redis.get('policy:9876543210');
      expect(cached1).toBeNull();
      expect(cached2).toBeNull();
    });
    
    it('should return 400 for invalid request', async () => {
      const response = await request(app)
        .post('/api/v1/admin/policy-cache/invalidate')
        .send({ policyNumbers: [] })
        .expect(400);
      
      expect(response.body.type).toContain('invalid-request');
    });
  });
});