const request = require('supertest');
const app = require('../../../src/app');
const db = require('../../../src/database/connection');

describe('Intake Summary API (AC-3)', () => {
  beforeAll(async () => {
    // Setup test claim with missing fields
    await db.pool.query(`
      INSERT INTO claims (claim_id, policy_number, status, language, incident_date, narrative, 
                          injuries_reported, police_report_filed, fnol_summary, confidence_score, 
                          missing_fields, processing_time_ms, human_review_required)
      VALUES ('clm_intake_test001', NULL, 'INTAKE', 'th', '2026-01-15T14:30:00+07:00', 
              'รถชนกันที่สี่แยกสุขุมวิท มีคนบาดเจ็บ', true, true, 
              'รถชนกันที่สี่แยกสุขุมวิท มีผู้บาดเจ็บ', 0.45, 
              ARRAY['policyNumber', 'vehicles[0].licensePlate'], 2847, true)
    `);
    
    await db.pool.query(`
      INSERT INTO vehicles (claim_id, role, make, model, color, license_plate, vin)
      VALUES ('clm_intake_test001', 'INSURED', 'Toyota', 'Camry', 'White', NULL, NULL)
    `);
  });
  
  afterAll(async () => {
    await db.pool.query('DELETE FROM vehicles WHERE claim_id LIKE $1', ['clm_intake_test%']);
    await db.pool.query('DELETE FROM claims WHERE claim_id LIKE $1', ['clm_intake_test%']);
    await db.pool.end();
  });
  
  describe('GET /api/v1/claims/:claimId/intake-summary', () => {
    it('should return intake summary with missing field list (AC-3)', async () => {
      const response = await request(app)
        .get('/api/v1/claims/clm_intake_test001/intake-summary')
        .expect(200);
      
      // Verify response structure
      expect(response.body).toHaveProperty('claimId', 'clm_intake_test001');
      expect(response.body).toHaveProperty('fnolSummary');
      expect(response.body).toHaveProperty('extractedData');
      
      // Verify missing fields are included (AC-3)
      expect(response.body).toHaveProperty('missingFields');
      expect(Array.isArray(response.body.missingFields)).toBe(true);
      expect(response.body.missingFields.length).toBeGreaterThan(0);
      
      // Verify prioritized missing fields
      expect(response.body).toHaveProperty('prioritizedMissingFields');
      expect(response.body.prioritizedMissingFields.length).toBeLessThanOrEqual(3);
      
      // Verify validation status
      expect(response.body).toHaveProperty('validation');
      expect(response.body.validation).toHaveProperty('isValid');
      expect(response.body.validation).toHaveProperty('readyForTriage');
      expect(response.body.validation).toHaveProperty('criticalFieldsMissing');
      
      // Verify confidence score is included (AC-4)
      expect(response.body).toHaveProperty('confidenceScore');
      expect(typeof response.body.confidenceScore).toBe('number');
    });
    
    it('should identify missing policy number as CRITICAL (AC-1)', async () => {
      const response = await request(app)
        .get('/api/v1/claims/clm_intake_test001/intake-summary')
        .expect(200);
      
      const policyNumberField = response.body.missingFields.find(
        f => f.fieldId === 'POLICY_NUMBER'
      );
      
      expect(policyNumberField).toBeDefined();
      expect(policyNumberField.criticality).toBe('CRITICAL');
      expect(policyNumberField.displayNameTh).toBe('หมายเลขกรมธรรม์');
      expect(policyNumberField.displayNameEn).toBe('Policy Number');
    });
    
    it('should prioritize CRITICAL fields first in missing field list', async () => {
      const response = await request(app)
        .get('/api/v1/claims/clm_intake_test001/intake-summary')
        .expect(200);
      
      const prioritized = response.body.prioritizedMissingFields;
      
      // First field should be CRITICAL
      expect(prioritized[0].criticality).toBe('CRITICAL');
    });
    
    it('should return 404 for non-existent claim', async () => {
      const response = await request(app)
        .get('/api/v1/claims/clm_nonexistent/intake-summary')
        .expect(404);
      
      expect(response.body.type).toBe('https://api.roojai.com/errors/claim-not-found');
    });
  });
});