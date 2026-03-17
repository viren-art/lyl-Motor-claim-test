const request = require('supertest');
const app = require('../../../src/app');
const db = require('../../../src/database/connection');
const nock = require('nock');

describe('Extraction API with Missing Field Detection', () => {
  beforeAll(async () => {
    // Setup test database
    await db.pool.query(`
      INSERT INTO claims (claim_id, policy_number, status, language, incident_date, narrative, injuries_reported, police_report_filed)
      VALUES ('clm_test001', NULL, 'INTAKE', 'th', '2026-01-15T14:30:00+07:00', 'รถชนกันที่สี่แยกสุขุมวิท มีคนบาดเจ็บ', true, true)
    `);
  });
  
  afterAll(async () => {
    await db.pool.query('DELETE FROM claims WHERE claim_id LIKE $1', ['clm_test%']);
    await db.pool.end();
  });
  
  describe('POST /api/v1/claims/:claimId/extract', () => {
    it('should detect missing driver information (TC-013)', async () => {
      // Mock LLM service response with missing driver info
      nock('http://localhost:8000')
        .post('/extract')
        .reply(200, {
          policyNumber: 'unknown',
          summary: 'รถชนกันที่สี่แยกสุขุมวิท มีคนบาดเจ็บ',
          vehicles: [
            {
              role: 'INSURED',
              licensePlate: 'unknown',
              make: 'Toyota',
              model: 'Camry',
              vin: 'unknown',
            },
          ],
          incidentLocation: {
            address: 'สี่แยกสุขุมวิท',
          },
          confidenceScore: 0.65,
          modelVersion: 'claude-3-sonnet-20240229',
        });
      
      const response = await request(app)
        .post('/api/v1/claims/clm_test001/extract')
        .expect(200);
      
      expect(response.body.validation.missingFields).toContainEqual(
        expect.objectContaining({
          fieldId: 'POLICY_NUMBER',
          criticality: 'CRITICAL',
        })
      );
      
      expect(response.body.validation.missingFields).toContainEqual(
        expect.objectContaining({
          fieldId: 'INSURED_VEHICLE_LICENSE',
          criticality: 'HIGH',
        })
      );
      
      expect(response.body.validation.readyForTriage).toBe(false);
      expect(response.body.prioritizedMissingFields.length).toBeLessThanOrEqual(3);
    });
    
    it('should mark unknown fields explicitly without hallucination', async () => {
      nock('http://localhost:8000')
        .post('/extract')
        .reply(200, {
          policyNumber: '1234567890',
          summary: 'รถชนกัน',
          vehicles: [
            {
              role: 'INSURED',
              licensePlate: 'กข 1234',
              make: 'unknown',
              model: 'unknown',
              vin: 'unknown',
            },
          ],
          incidentLocation: {
            address: 'สี่แยกสุขุมวิท',
          },
          confidenceScore: 0.80,
          modelVersion: 'claude-3-sonnet-20240229',
        });
      
      const response = await request(app)
        .post('/api/v1/claims/clm_test001/extract')
        .expect(200);
      
      expect(response.body.extractedData.vehicles[0].make).toBe('unknown');
      expect(response.body.extractedData.vehicles[0].model).toBe('unknown');
      expect(response.body.extractedData.vehicles[0].vin).toBe('unknown');
      
      // Should not have hallucinated these fields
      expect(response.body.hallucinatedFields.length).toBe(0);
    });
    
    it('should detect hallucinated VIN and mark as unknown', async () => {
      nock('http://localhost:8000')
        .post('/extract')
        .reply(200, {
          policyNumber: '1234567890',
          summary: 'รถชนกัน',
          vehicles: [
            {
              role: 'INSURED',
              licensePlate: 'กข 1234',
              vin: '1HGBH41JXMN109186', // Not in narrative
            },
          ],
          incidentLocation: {
            address: 'สี่แยกสุขุมวิท',
          },
          confidenceScore: 0.85,
          modelVersion: 'claude-3-sonnet-20240229',
        });
      
      const response = await request(app)
        .post('/api/v1/claims/clm_test001/extract')
        .expect(200);
      
      expect(response.body.hallucinatedFields).toContainEqual(
        expect.objectContaining({
          field: 'vehicle.vin',
          reason: 'VIN not found in narrative but extracted',
        })
      );
      
      // VIN should be marked as unknown
      expect(response.body.extractedData.vehicles[0].vin).toBe('unknown');
    });
    
    it('should prioritize critical missing fields for questions', async () => {
      nock('http://localhost:8000')
        .post('/extract')
        .reply(200, {
          policyNumber: 'unknown',
          summary: 'รถชนกัน',
          vehicles: [
            {
              role: 'INSURED',
              licensePlate: 'unknown',
              vin: 'unknown',
            },
          ],
          incidentLocation: {
            address: 'unknown',
          },
          confidenceScore: 0.60,
          modelVersion: 'claude-3-sonnet-20240229',
        });
      
      const response = await request(app)
        .post('/api/v1/claims/clm_test001/extract')
        .expect(200);
      
      expect(response.body.prioritizedMissingFields.length).toBeLessThanOrEqual(3);
      
      // First prioritized field should be CRITICAL
      expect(response.body.prioritizedMissingFields[0].criticality).toBe('CRITICAL');
    });
    
    it('should require police report for injury claims', async () => {
      nock('http://localhost:8000')
        .post('/extract')
        .reply(200, {
          policyNumber: '1234567890',
          summary: 'รถชนกัน มีคนบาดเจ็บ',
          vehicles: [
            {
              role: 'INSURED',
              licensePlate: 'กข 1234',
            },
          ],
          incidentLocation: {
            address: 'สี่แยกสุขุมวิท',
          },
          policeReportFiled: 'unknown',
          confidenceScore: 0.75,
          modelVersion: 'claude-3-sonnet-20240229',
        });
      
      const response = await request(app)
        .post('/api/v1/claims/clm_test001/extract')
        .expect(200);
      
      expect(response.body.validation.missingFields).toContainEqual(
        expect.objectContaining({
          fieldId: 'POLICE_REPORT_STATUS',
          conditional: true,
        })
      );
    });
    
    it('should reduce confidence score when critical fields are missing (AC-4)', async () => {
      nock('http://localhost:8000')
        .post('/extract')
        .reply(200, {
          policyNumber: 'unknown', // Critical field missing
          summary: 'รถชนกัน',
          vehicles: [
            {
              role: 'INSURED',
              licensePlate: 'unknown', // High priority field missing
              vin: 'unknown',
            },
          ],
          incidentLocation: {
            address: 'สี่แยกสุขุมวิท',
          },
          confidenceScore: 0.85, // Original high confidence
          modelVersion: 'claude-3-sonnet-20240229',
        });
      
      const response = await request(app)
        .post('/api/v1/claims/clm_test001/extract')
        .expect(200);
      
      // Confidence should be reduced from 0.85
      expect(response.body.confidenceScore).toBeLessThan(0.85);
      
      // With critical field missing, confidence should be capped at 0.5
      expect(response.body.confidenceScore).toBeLessThanOrEqual(0.5);
      
      // Should include confidence adjustment details
      expect(response.body.confidenceAdjustment).toBeDefined();
      expect(response.body.confidenceAdjustment.original).toBe(0.85);
      expect(response.body.confidenceAdjustment.adjusted).toBe(response.body.confidenceScore);
      expect(response.body.confidenceAdjustment.reduction).toBeGreaterThan(0);
      expect(response.body.confidenceAdjustment.reason).toContain('Critical fields missing');
    });
    
    it('should cap confidence at 0.5 when policy number is missing', async () => {
      nock('http://localhost:8000')
        .post('/extract')
        .reply(200, {
          policyNumber: 'unknown',
          summary: 'รถชนกัน',
          vehicles: [
            {
              role: 'INSURED',
              licensePlate: 'กข 1234',
              vin: '1HGBH41JXMN109186',
            },
          ],
          incidentLocation: {
            address: 'สี่แยกสุขุมวิท',
          },
          confidenceScore: 0.95, // Very high original confidence
          modelVersion: 'claude-3-sonnet-20240229',
        });
      
      const response = await request(app)
        .post('/api/v1/claims/clm_test001/extract')
        .expect(200);
      
      // Even with 0.95 original confidence, should be capped at 0.5
      expect(response.body.confidenceScore).toBeLessThanOrEqual(0.5);
      expect(response.body.confidenceAdjustment.reason).toContain('capped at 0.5');
    });
    
    it('should escalate to manual queue on LLM service failure', async () => {
      nock('http://localhost:8000')
        .post('/extract')
        .replyWithError('Service unavailable');
      
      const response = await request(app)
        .post('/api/v1/claims/clm_test001/extract')
        .expect(503);
      
      expect(response.body.type).toBe('https://api.roojai.com/errors/llm-service-unavailable');
      
      // Check circuit breaker status
      const statusResponse = await request(app)
        .get('/api/v1/extraction/circuit-breaker/status')
        .expect(200);
      
      expect(statusResponse.body.circuitBreakerState.failureCount).toBeGreaterThan(0);
    });
  });
  
  describe('GET /api/v1/claims/:claimId/extraction', () => {
    it('should retrieve extraction results with missing fields', async () => {
      const response = await request(app)
        .get('/api/v1/claims/clm_test001/extraction')
        .expect(200);
      
      expect(response.body).toHaveProperty('claimId');
      expect(response.body).toHaveProperty('missingFields');
      expect(response.body).toHaveProperty('confidenceScore');
    });
  });
});