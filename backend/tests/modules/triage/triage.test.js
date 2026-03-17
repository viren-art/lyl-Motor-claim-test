const request = require('supertest');
const app = require('../../../src/app');
const db = require('../../../src/database/connection');
const axios = require('axios');

jest.mock('axios');

describe('Triage Routing Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await db.pool.end();
  });

  describe('POST /api/v1/triage/execute', () => {
    it('should route simple claim to STRAIGHT_THROUGH with high confidence', async () => {
      // Mock triage service response
      axios.post.mockResolvedValue({
        data: {
          claim_id: 'clm_test123',
          route: 'STRAIGHT_THROUGH',
          rationale: 'Simple property damage claim with clear liability and all required documents',
          evidence_quotes: [
            {
              text: 'ชนท้ายรถคันหน้าที่จอดติดไฟแดง',
              source: 'narrative',
              relevance: 'Clear rear-end collision with stopped vehicle'
            },
            {
              text: 'มีพยานเห็นเหตุการณ์ 2 คน',
              source: 'narrative',
              relevance: 'Multiple witnesses confirm incident'
            }
          ],
          fraud_risk_score: 15.0,
          confidence_score: 0.92,
          human_review_required: false,
          processing_time_ms: 2500,
          llm_model_version: 'claude-3-5-sonnet-20241022',
          decision_factors: {
            llm_route: 'STRAIGHT_THROUGH',
            llm_confidence: 0.92,
            fraud_risk_score: 15.0,
            extraction_confidence: 0.88,
            missing_fields_count: 0,
            exclusions_count: 0,
            claim_value_thb: 45000,
            overrides_applied: []
          }
        }
      });

      const response = await request(app)
        .post('/api/v1/triage/execute')
        .send({
          claimId: 'clm_test123',
          policyNumber: '1234567890',
          language: 'th',
          incidentDetails: {
            date: '2026-01-15T14:30:00+07:00',
            address: 'ถนนสุขุมวิท แขวงคลองเตย กรุงเทพฯ',
            narrative: 'ชนท้ายรถคันหน้าที่จอดติดไฟแดง มีพยานเห็นเหตุการณ์ 2 คน',
            injuriesReported: false,
            policeReportFiled: true,
            policeReportNumber: 'BKK-2026-001234'
          },
          vehicles: [
            {
              role: 'INSURED',
              licensePlate: 'กข-1234',
              make: 'Toyota',
              model: 'Camry',
              year: 2023,
              damageDescription: 'กันชนหน้าแตก ไฟหน้าซ้ายแตก'
            }
          ],
          llmOutputs: {
            fnolSummary: 'Rear-end collision at traffic light',
            missingFields: [],
            confidenceScore: 0.88,
            llmModelVersion: 'claude-3-5-sonnet-20241022'
          },
          coverageCheck: {
            policyActive: true,
            deductibleAmountThb: 5000,
            exclusionsApply: [],
            requiredDocuments: ['Police report', 'Repair quote', 'Photos']
          },
          estimatedClaimValueThb: 45000
        })
        .expect(200);

      expect(response.body.route).toBe('STRAIGHT_THROUGH');
      expect(response.body.confidenceScore).toBeGreaterThan(0.85);
      expect(response.body.fraudRiskScore).toBeLessThan(30);
      expect(response.body.humanReviewRequired).toBe(false);
      expect(response.body.evidenceQuotes).toHaveLength(2);
      expect(response.body.processingTimeMs).toBeLessThan(60000);
    });

    it('should route claim with missing information to ADJUSTER_REVIEW', async () => {
      axios.post.mockResolvedValue({
        data: {
          claim_id: 'clm_test456',
          route: 'ADJUSTER_REVIEW',
          rationale: 'Missing vehicle VIN and repair quote requires adjuster verification',
          evidence_quotes: [
            {
              text: 'ไม่ทราบเลขตัวถัง',
              source: 'extraction',
              relevance: 'VIN number not provided'
            },
            {
              text: 'Missing required documents: Repair quote',
              source: 'coverage',
              relevance: 'Required document not submitted'
            }
          ],
          fraud_risk_score: 25.0,
          confidence_score: 0.68,
          human_review_required: true,
          processing_time_ms: 3200,
          llm_model_version: 'claude-3-5-sonnet-20241022',
          decision_factors: {
            llm_route: 'ADJUSTER_REVIEW',
            llm_confidence: 0.68,
            fraud_risk_score: 25.0,
            extraction_confidence: 0.65,
            missing_fields_count: 2,
            exclusions_count: 0,
            claim_value_thb: 120000,
            overrides_applied: [
              'Low LLM confidence (0.68) requires human review',
              'Missing critical fields: vin'
            ]
          }
        }
      });

      const response = await request(app)
        .post('/api/v1/triage/execute')
        .send({
          claimId: 'clm_test456',
          policyNumber: '1234567890',
          language: 'th',
          incidentDetails: {
            date: '2026-01-14T09:15:00+07:00',
            address: 'ถนนพระราม 4 กรุงเทพฯ',
            narrative: 'รถชนด้านข้าง ไม่ทราบเลขตัวถัง',
            injuriesReported: false,
            policeReportFiled: false
          },
          vehicles: [
            {
              role: 'INSURED',
              licensePlate: 'กข-5678',
              make: 'Honda',
              model: 'Civic'
            }
          ],
          llmOutputs: {
            fnolSummary: 'Side collision, incomplete vehicle details',
            missingFields: ['vin', 'repair_quote'],
            confidenceScore: 0.65,
            llmModelVersion: 'claude-3-5-sonnet-20241022'
          },
          coverageCheck: {
            policyActive: true,
            deductibleAmountThb: 5000,
            exclusionsApply: [],
            requiredDocuments: ['Repair quote', 'Photos']
          },
          estimatedClaimValueThb: 120000
        })
        .expect(200);

      expect(response.body.route).toBe('ADJUSTER_REVIEW');
      expect(response.body.humanReviewRequired).toBe(true);
      expect(response.body.decisionFactors.missing_fields_count).toBeGreaterThan(0);
    });

    it('should route high fraud risk claim to FRAUD_REVIEW', async () => {
      axios.post.mockResolvedValue({
        data: {
          claim_id: 'clm_test789',
          route: 'FRAUD_REVIEW',
          rationale: 'Multiple fraud indicators detected including staged accident patterns and geographic hotspot',
          evidence_quotes: [
            {
              text: 'วางแผนชนกันไว้ล่วงหน้า',
              source: 'narrative',
              relevance: 'Language suggests pre-arranged collision'
            },
            {
              text: 'Incident in high-risk province: สมุทรปราการ',
              source: 'extraction',
              relevance: 'Known fraud hotspot area'
            },
            {
              text: 'คนขับรู้จักกัน',
              source: 'narrative',
              relevance: 'Parties know each other - collusion risk'
            }
          ],
          fraud_risk_score: 85.0,
          confidence_score: 0.91,
          human_review_required: true,
          processing_time_ms: 4100,
          llm_model_version: 'claude-3-5-sonnet-20241022',
          decision_factors: {
            llm_route: 'FRAUD_REVIEW',
            llm_confidence: 0.91,
            fraud_risk_score: 85.0,
            extraction_confidence: 0.82,
            missing_fields_count: 0,
            exclusions_count: 0,
            claim_value_thb: 250000,
            overrides_applied: [
              'High fraud risk score (85.0) requires investigation'
            ]
          }
        }
      });

      const response = await request(app)
        .post('/api/v1/triage/execute')
        .send({
          claimId: 'clm_test789',
          policyNumber: '1234567890',
          language: 'th',
          incidentDetails: {
            date: '2026-01-13T23:45:00+07:00',
            address: 'บางพลี สมุทรปราการ',
            narrative: 'วางแผนชนกันไว้ล่วงหน้า คนขับรู้จักกัน เกิดเหตุตอนดึก',
            injuriesReported: true,
            policeReportFiled: false
          },
          vehicles: [
            {
              role: 'INSURED',
              licensePlate: 'กข-9999',
              make: 'Toyota',
              model: 'Fortuner',
              damageDescription: 'เสียหายทั้งคัน ซ่อมใหม่ทั้งหมด'
            },
            {
              role: 'THIRD_PARTY',
              licensePlate: 'คค-8888',
              make: 'Honda',
              model: 'Accord'
            }
          ],
          llmOutputs: {
            fnolSummary: 'Suspicious collision with multiple fraud indicators',
            missingFields: [],
            confidenceScore: 0.82,
            llmModelVersion: 'claude-3-5-sonnet-20241022'
          },
          coverageCheck: {
            policyActive: true,
            deductibleAmountThb: 5000,
            exclusionsApply: [],
            requiredDocuments: ['Police report', 'Medical records', 'Repair quote']
          },
          estimatedClaimValueThb: 250000
        })
        .expect(200);

      expect(response.body.route).toBe('FRAUD_REVIEW');
      expect(response.body.fraudRiskScore).toBeGreaterThan(70);
      expect(response.body.humanReviewRequired).toBe(true);
      expect(response.body.evidenceQuotes.length).toBeGreaterThanOrEqual(2);
    });

    it('should enforce 60-second SLA timeout', async () => {
      axios.post.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ data: {} }), 65000))
      );

      const response = await request(app)
        .post('/api/v1/triage/execute')
        .send({
          claimId: 'clm_timeout',
          policyNumber: '1234567890',
          language: 'th',
          incidentDetails: {
            date: '2026-01-15T10:00:00+07:00',
            narrative: 'Test timeout scenario',
            injuriesReported: false,
            policeReportFiled: false
          },
          vehicles: [],
          llmOutputs: {
            fnolSummary: 'Test',
            missingFields: [],
            confidenceScore: 0.8,
            llmModelVersion: 'test'
          },
          coverageCheck: {
            policyActive: true,
            deductibleAmountThb: 5000,
            exclusionsApply: [],
            requiredDocuments: []
          }
        })
        .expect(504);

      expect(response.body.detail).toContain('timeout');
    }, 70000);

    it('should force human review for high-value claims', async () => {
      axios.post.mockResolvedValue({
        data: {
          claim_id: 'clm_highvalue',
          route: 'ADJUSTER_REVIEW',
          rationale: 'High value claim requires human verification',
          evidence_quotes: [
            {
              text: 'Estimated repair cost ฿650,000',
              source: 'extraction',
              relevance: 'Exceeds high-value threshold'
            },
            {
              text: 'รถเสียหายหนัก',
              source: 'narrative',
              relevance: 'Severe damage reported'
            }
          ],
          fraud_risk_score: 20.0,
          confidence_score: 0.88,
          human_review_required: true,
          processing_time_ms: 2800,
          llm_model_version: 'claude-3-5-sonnet-20241022',
          decision_factors: {
            llm_route: 'STRAIGHT_THROUGH',
            llm_confidence: 0.88,
            fraud_risk_score: 20.0,
            extraction_confidence: 0.85,
            missing_fields_count: 0,
            exclusions_count: 0,
            claim_value_thb: 650000,
            overrides_applied: [
              'High value claim (฿650,000) requires human review'
            ]
          }
        }
      });

      const response = await request(app)
        .post('/api/v1/triage/execute')
        .send({
          claimId: 'clm_highvalue',
          policyNumber: '1234567890',
          language: 'th',
          incidentDetails: {
            date: '2026-01-15T16:00:00+07:00',
            address: 'กรุงเทพฯ',
            narrative: 'รถเสียหายหนัก ต้องซ่อมใหญ่',
            injuriesReported: false,
            policeReportFiled: true
          },
          vehicles: [
            {
              role: 'INSURED',
              licensePlate: 'กข-7777',
              make: 'Mercedes-Benz',
              model: 'S-Class',
              year: 2024
            }
          ],
          llmOutputs: {
            fnolSummary: 'High-value vehicle damage',
            missingFields: [],
            confidenceScore: 0.85,
            llmModelVersion: 'claude-3-5-sonnet-20241022'
          },
          coverageCheck: {
            policyActive: true,
            deductibleAmountThb: 10000,
            exclusionsApply: [],
            requiredDocuments: ['Police report', 'Repair quote']
          },
          estimatedClaimValueThb: 650000
        })
        .expect(200);

      expect(response.body.humanReviewRequired).toBe(true);
      expect(response.body.decisionFactors.claim_value_thb).toBeGreaterThan(500000);
    });
  });
});