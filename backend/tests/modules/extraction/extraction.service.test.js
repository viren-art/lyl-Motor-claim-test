const extractionService = require('../../../src/modules/extraction/extraction.service');
const axios = require('axios');
const db = require('../../../src/database/connection');

jest.mock('axios');
jest.mock('../../../src/database/connection');

describe('ExtractionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extractClaimData', () => {
    it('should extract claim data successfully with high confidence', async () => {
      const mockLLMResponse = {
        data: {
          vehicles: [{
            vehicle_type: 'INSURED',
            make: 'Toyota',
            model: 'Camry',
            license_plate: 'กข-1234',
            vin: 'unknown',
            color: 'white',
            damage_description: 'Front bumper damaged',
            confidence_score: 0.95
          }],
          incident_details: {
            incident_timestamp: '2024-01-15T14:30:00+07:00',
            location: {
              address: 'แยกอโศก ถนนสุขุมวิท',
              lat: 13.7367,
              lng: 100.5602,
              landmark: 'Asoke intersection',
              confidence_score: 0.90
            },
            narrative_summary: 'รถชนกันที่แยกอโศก',
            accident_type: 'COLLISION',
            weather_conditions: 'clear',
            road_conditions: 'dry'
          },
          parties: [],
          injuries: {
            injuries_reported: false,
            injury_severity: 'NONE',
            injured_parties: [],
            medical_facility: 'unknown',
            confidence_score: 1.0
          },
          police_report: {
            report_filed: true,
            report_number: 'PR-2024-001',
            police_station: 'Asoke Police Station',
            officer_name: 'unknown',
            confidence_score: 0.85
          },
          overall_confidence: 0.92,
          missing_critical_fields: [],
          ambiguous_information: [],
          language_detected: 'th',
          metadata: {
            llm_provider: 'openai',
            llm_model_version: 'gpt-4-turbo-2024-01-25',
            processing_time_ms: 2500
          }
        }
      };

      axios.post.mockResolvedValue(mockLLMResponse);

      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }),
        release: jest.fn()
      };
      db.pool.connect.mockResolvedValue(mockClient);

      const result = await extractionService.extractClaimData({
        claimId: 'clm_test123',
        narrative: 'รถผมชนกับรถกระบะที่แยกอโศก เมื่อเช้านี้',
        language: 'th',
        channel: 'chat'
      });

      expect(result.extractedData.overall_confidence).toBe(0.92);
      expect(result.extractedData.vehicles).toHaveLength(1);
      expect(result.extractedData.vehicles[0].make).toBe('Toyota');
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/llm/extract'),
        expect.objectContaining({
          narrative: 'รถผมชนกับรถกระบะที่แยกอโศก เมื่อเช้านี้',
          language: 'th',
          channel: 'chat'
        }),
        expect.any(Object)
      );
    });

    it('should handle Tinglish input correctly', async () => {
      const mockLLMResponse = {
        data: {
          vehicles: [{
            vehicle_type: 'INSURED',
            make: 'Honda',
            model: 'Civic',
            license_plate: 'unknown',