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
          vehicles: [
            {
              vehicle_type: 'INSURED',
              make: 'unknown',
              model: 'unknown',
              license_plate: 'unknown',
              vin: 'unknown',
              color: 'unknown',
              damage_description: 'กันชนหน้า',
              confidence_score: 0.88
            },
            {
              vehicle_type: 'THIRD_PARTY',
              make: 'unknown',
              model: 'กระบะ',
              license_plate: 'unknown',
              vin: 'unknown',
              color: 'unknown',
              damage_description: 'unknown',
              confidence_score: 0.92
            }
          ],
          incident_details: {
            incident_timestamp: '2024-01-15T09:00:00+07:00',
            location: {
              address: 'แยก Asoke',
              lat: null,
              lng: null,
              landmark: 'Asoke intersection',
              confidence_score: 0.85
            },
            narrative_summary: 'รถผม hit กระบะ at แยก Asoke',
            accident_type: 'COLLISION',
            weather_conditions: 'unknown',
            road_conditions: 'unknown'
          },
          parties: [],
          injuries: {
            injuries_reported: false,
            injury_severity: 'NONE',
            injured_parties: [],
            medical_facility: 'unknown',
            confidence_score: 0.95
          },
          police_report: {
            report_filed: 'unknown',
            report_number: 'unknown',
            police_station: 'unknown',
            officer_name: 'unknown',
            confidence_score: 0.0
          },
          overall_confidence: 0.87,
          missing_critical_fields: ['police_report_status', 'vehicle_license_plates'],
          ambiguous_information: ['exact_time'],
          language_detected: 'th-en',
          metadata: {
            llm_provider: 'openai',
            llm_model_version: 'gpt-4-turbo-2024-01-25',
            processing_time_ms: 2800
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
        claimId: 'clm_tinglish123',
        narrative: 'รถผม hit กระบะ at แยก Asoke เมื่อเช้า damage ที่กันชนหน้า',
        language: 'th',
        channel: 'chat'
      });

      expect(result.extractedData.language_detected).toBe('th-en');
      expect(result.extractedData.vehicles).toHaveLength(2);
      expect(result.extractedData.vehicles[1].model).toBe('กระบะ');
      expect(result.extractedData.vehicles[0].damage_description).toBe('กันชนหน้า');
      expect(result.extractedData.incident_details.location.address).toBe('แยก Asoke');
      expect(result.extractedData.overall_confidence).toBeGreaterThan(0.75);
    });

    it('should mark missing fields as unknown without hallucination', async () => {
      const mockLLMResponse = {
        data: {
          vehicles: [{
            vehicle_type: 'INSURED',
            make: 'unknown',
            model: 'unknown',
            license_plate: 'unknown',
            vin: 'unknown',
            color: 'unknown',
            damage_description: 'Front damage',
            confidence_score: 0.60
          }],
          incident_details: {
            incident_timestamp: 'unknown',
            location: {
              address: 'Bangkok',
              lat: null,
              lng: null,
              landmark: 'unknown',
              confidence_score: 0.40
            },
            narrative_summary: 'Car accident in Bangkok',
            accident_type: 'COLLISION',
            weather_conditions: 'unknown',
            road_conditions: 'unknown'
          },
          parties: [],
          injuries: {
            injuries_reported: 'unknown',
            injury_severity: 'unknown',
            injured_parties: [],
            medical_facility: 'unknown',
            confidence_score: 0.0
          },
          police_report: {
            report_filed: 'unknown',
            report_number: 'unknown',
            police_station: 'unknown',
            officer_name: 'unknown',
            confidence_score: 0.0
          },
          overall_confidence: 0.45,
          missing_critical_fields: [
            'vehicle_make',
            'vehicle_model',
            'license_plate',
            'incident_timestamp',
            'exact_location',
            'police_report_status'
          ],
          ambiguous_information: ['location_vague'],
          language_detected: 'en',
          metadata: {
            llm_provider: 'openai',
            llm_model_version: 'gpt-4-turbo-2024-01-25',
            processing_time_ms: 1800
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
        claimId: 'clm_vague123',
        narrative: 'I had an accident in Bangkok',
        language: 'en',
        channel: 'email'
      });

      expect(result.extractedData.vehicles[0].make).toBe('unknown');
      expect(result.extractedData.vehicles[0].license_plate).toBe('unknown');
      expect(result.extractedData.incident_details.incident_timestamp).toBe('unknown');
      expect(result.extractedData.police_report.report_filed).toBe('unknown');
      expect(result.extractedData.missing_critical_fields).toContain('vehicle_make');
      expect(result.extractedData.missing_critical_fields).toContain('license_plate');
      expect(result.extractedData.overall_confidence).toBeLessThan(0.75);
    });

    it('should timeout after 30 seconds and escalate to manual queue', async () => {
      axios.post.mockImplementation(() => 
        new Promise((resolve) => setTimeout(resolve, 31000))
      );

      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }),
        release: jest.fn()
      };
      db.pool.connect.mockResolvedValue(mockClient);

      await expect(
        extractionService.extractClaimData({
          claimId: 'clm_timeout123',
          narrative: 'Test timeout scenario',
          language: 'th',
          channel: 'chat'
        })
      ).rejects.toThrow('Extraction timeout');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE claims'),
        expect.arrayContaining(['clm_timeout123'])
      );
    });
  });

  describe('checkLLMHealth', () => {
    it('should return healthy status when LLM service is up', async () => {
      axios.get.mockResolvedValue({
        data: {
          status: 'healthy',
          model_version: 'gpt-4-turbo-2024-01-25'
        }
      });

      const health = await extractionService.checkLLMHealth();

      expect(health.status).toBe('up');
      expect(health.model_version).toBe('gpt-4-turbo-2024-01-25');
    });

    it('should return down status when LLM service is unavailable', async () => {
      axios.get.mockRejectedValue(new Error('Connection refused'));

      const health = await extractionService.checkLLMHealth();

      expect(health.status).toBe('down');
      expect(health.error).toBe('Connection refused');
    });
  });
});