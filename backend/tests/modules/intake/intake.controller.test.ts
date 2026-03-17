const request = require('supertest');
const express = require('express');
const intakeController = require('../../../src/modules/intake/intake.controller');
const consentService = require('../../../src/middleware/consent/consent.service');
const claimRepository = require('../../../src/modules/intake/claim.repository');
const auditService = require('../../../src/modules/audit/audit.service');

// Mock dependencies
jest.mock('../../../src/middleware/consent/consent.service');
jest.mock('../../../src/modules/intake/claim.repository');
jest.mock('../../../src/modules/audit/audit.service');

const app = express();
app.use(express.json());
app.post('/api/v1/claims/fnol/chat', intakeController.handleChatSubmission.bind(intakeController));
app.post('/api/v1/claims/fnol/form', intakeController.handleFormSubmission.bind(intakeController));

describe('Intake Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('TC-001: Complete chat submission processes in <30 seconds', () => {
    it('should process complete chat submission and return claim ID within 30 seconds', async () => {
      const startTime = Date.now();

      consentService.validateConsent.mockResolvedValue({ valid: true });
      consentService.logConsent.mockResolvedValue({});
      claimRepository.createClaim.mockResolvedValue({
        claim_id: 'test-claim-id',
        status: 'INTAKE'
      });
      auditService.logEvent.mockResolvedValue({});

      const response = await request(app)
        .post('/api/v1/claims/fnol/chat')
        .send({
          policyNumber: '1234567890',
          language: 'th',
          incidentDate: '2026-01-15T14:30:00+07:00',
          incidentLocation: {
            lat: 13.7563,
            lng: 100.5018,
            address: 'ถนนสุขุมวิท แขวงคลองเตย กรุงเทพฯ'
          },
          narrative: 'รถกระบะสีขาวชนท้ายรถผมที่แยกอโศก เกิดความเสียหายที่กันชนหน้า',
          injuriesReported: false,
          policeReportFiled: true,
          policeReportNumber: 'BKK-2026-001234',
          pdpaConsent: true
        });

      const processingTime = Date.now() - startTime;

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('claimId');
      expect(response.body.status).toBe('INTAKE');
      expect(processingTime).toBeLessThan(30000); // 30 seconds
      expect(consentService.logConsent).toHaveBeenCalled();
    });
  });

  describe('TC-002: Partial chat submission triggers clarifying questions', () => {
    it('should accept partial submission and indicate pending status', async () => {
      consentService.validateConsent.mockResolvedValue({ valid: true });
      consentService.logConsent.mockResolvedValue({});
      claimRepository.createClaim.mockResolvedValue({
        claim_id: 'test-claim-id',
        status: 'INTAKE'
      });
      auditService.logEvent.mockResolvedValue({});

      const response = await request(app)
        .post('/api/v1/claims/fnol/chat')
        .send({
          policyNumber: '1234567890',
          language: 'th',
          narrative: 'รถชนกัน', // Minimal narrative
          pdpaConsent: true
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('claimId');
      expect(response.body.status).toBe('INTAKE');
    });
  });

  describe('TC-046: PDPA consent rejection blocks processing', () => {
    it('should reject submission without PDPA consent', async () => {
      consentService.validateConsent.mockResolvedValue({
        valid: false,
        message: 'PDPA consent must be explicitly granted'
      });

      const response = await request(app)
        .post('/api/v1/claims/fnol/chat')
        .send({
          policyNumber: '1234567890',
          language: 'th',
          narrative: 'รถชนกัน',
          pdpaConsent: false
        });

      expect(response.status).toBe(400);
      expect(response.body.type).toContain('pdpa-consent-required');
      expect(claimRepository.createClaim).not.toHaveBeenCalled();
    });
  });

  describe('TC-050: Form validation rejects invalid policy number', () => {
    it('should reject form submission with invalid policy number format', async () => {
      consentService.validateConsent.mockResolvedValue({ valid: true });

      const response = await request(app)
        .post('/api/v1/claims/fnol/form')
        .send({
          policyNumber: '123', // Invalid: not 10 digits
          language: 'th',
          incidentDate: '2026-01-15T14:30:00+07:00',
          incidentLocation: { address: 'Bangkok' },
          narrative: 'This is a test narrative with sufficient length',
          pdpaConsent: true
        });

      expect(response.status).toBe(400);
      expect(response.body.detail).toContain('Invalid policy number format');
    });
  });

  describe('TC-051: Form validation requires minimum narrative length', () => {
    it('should reject form submission with narrative under 20 characters', async () => {
      consentService.validateConsent.mockResolvedValue({ valid: true });

      const response = await request(app)
        .post('/api/v1/claims/fnol/form')
        .send({
          policyNumber: '1234567890',
          language: 'th',
          incidentDate: '2026-01-15T14:30:00+07:00',
          incidentLocation: { address: 'Bangkok' },
          narrative: 'Short text', // Under 20 characters
          pdpaConsent: true
        });

      expect(response.status).toBe(400);
      expect(response.body.detail).toContain('Narrative must be at least 20 characters');
    });
  });

  describe('TC-052: Form validation enforces police report number when filed', () => {
    it('should reject form when police report filed but number missing', async () => {
      consentService.validateConsent.mockResolvedValue({ valid: true });

      const response = await request(app)
        .post('/api/v1/claims/fnol/form')
        .send({
          policyNumber: '1234567890',
          language: 'th',
          incidentDate: '2026-01-15T14:30:00+07:00',
          incidentLocation: { address: 'Bangkok' },
          narrative: 'This is a test narrative with sufficient length',
          policeReportFiled: true,
          // policeReportNumber missing
          pdpaConsent: true
        });

      expect(response.status).toBe(400);
      expect(response.body.detail).toContain('Police report number required');
    });
  });
});