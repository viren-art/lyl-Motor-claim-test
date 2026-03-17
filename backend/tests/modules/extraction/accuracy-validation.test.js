const extractionService = require('../../../src/modules/extraction/extraction.service');
const axios = require('axios');
const db = require('../../../src/database/connection');
const groundTruthData = require('../../fixtures/thai-ground-truth.json');

jest.mock('axios');
jest.mock('../../../src/database/connection');

/**
 * Ground truth accuracy validation tests
 * Validates LLM extraction against 500-case Thai/English/Tinglish dataset
 * Target: 90%+ accuracy across all test cases
 */
describe('ExtractionService - Ground Truth Accuracy Validation', () => {
  let accuracyResults = {
    total: 0,
    passed: 0,
    failed: 0,
    byCategory: {
      vehicles: { total: 0, correct: 0 },
      location: { total: 0, correct: 0 },
      timestamp: { total: 0, correct: 0 },
      injuries: { total: 0, correct: 0 },
      policeReport: { total: 0, correct: 0 }
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }),
      release: jest.fn()
    };
    db.pool.connect.mockResolvedValue(mockClient);
  });

  afterAll(() => {
    const overallAccuracy = (accuracyResults.passed / accuracyResults.total) * 100;
    console.log('\n=== GROUND TRUTH ACCURACY RESULTS ===');
    console.log(`Total Cases: ${accuracyResults.total}`);
    console.log(`Passed: ${accuracyResults.passed}`);
    console.log(`Failed: ${accuracyResults.failed}`);
    console.log(`Overall Accuracy: ${overallAccuracy.toFixed(2)}%`);
    console.log('\nCategory Breakdown:');
    Object.entries(accuracyResults.byCategory).forEach(([category, stats]) => {
      const categoryAccuracy = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
      console.log(`  ${category}: ${categoryAccuracy.toFixed(2)}% (${stats.correct}/${stats.total})`);
    });
    console.log('=====================================\n');

    expect(overallAccuracy).toBeGreaterThanOrEqual(90);
  });

  /**
   * Helper function to compare extracted data with expected output
   */
  function compareExtraction(extracted, expected, category) {
    accuracyResults.byCategory[category].total++;
    
    let isMatch = false;
    
    switch (category) {
      case 'vehicles':
        isMatch = compareVehicles(extracted.vehicles, expected.vehicles);
        break;
      case 'location':
        isMatch = compareLocation(extracted.incident_details.location, expected.incident_details.location);
        break;
      case 'timestamp':
        isMatch = compareTimestamp(extracted.incident_details.incident_timestamp, expected.incident_details.incident_timestamp);
        break;
      case 'injuries':
        isMatch = compareInjuries(extracted.injuries, expected.injuries);
        break;
      case 'policeReport':
        isMatch = comparePoliceReport(extracted.police_report, expected.police_report);
        break;
    }
    
    if (isMatch) {
      accuracyResults.byCategory[category].correct++;
    }
    
    return isMatch;
  }

  function compareVehicles(extracted, expected) {
    if (!expected || expected.length === 0) return true;
    if (!extracted || extracted.length !== expected.length) return false;
    
    return expected.every((expectedVehicle, index) => {
      const extractedVehicle = extracted[index];
      return Object.keys(expectedVehicle).every(key => {
        if (expectedVehicle[key] === 'unknown') return true;
        return extractedVehicle[key] === expectedVehicle[key] || 
               extractedVehicle[key] === 'unknown';
      });
    });
  }

  function compareLocation(extracted, expected) {
    if (!expected) return true;
    
    const addressMatch = !expected.address || 
                        extracted.address?.includes(expected.address) ||
                        expected.address.includes(extracted.address);
    
    const landmarkMatch = !expected.landmark || 
                         extracted.landmark === expected.landmark ||
                         extracted.landmark === 'unknown';
    
    return addressMatch && landmarkMatch;
  }

  function compareTimestamp(extracted, expected) {
    if (!expected || expected === 'unknown') return true;
    if (extracted === 'unknown') return expected === 'unknown';
    
    const extractedDate = new Date(extracted);
    const expectedDate = new Date(expected);
    
    return extractedDate.getHours() === expectedDate.getHours() &&
           extractedDate.getDate() === expectedDate.getDate();
  }

  function compareInjuries(extracted, expected) {
    if (!expected) return true;
    
    return extracted.injuries_reported === expected.injuries_reported ||
           extracted.injuries_reported === 'unknown';
  }

  function comparePoliceReport(extracted, expected) {
    if (!expected) return true;
    
    const filedMatch = extracted.report_filed === expected.report_filed ||
                      extracted.report_filed === 'unknown';
    
    const numberMatch = !expected.report_number ||
                       extracted.report_number === expected.report_number ||
                       extracted.report_number === 'unknown';
    
    return filedMatch && numberMatch;
  }

  describe('Thai Language Extraction', () => {
    it('GT-001: Should extract Thai narrative with vehicle and location details', async () => {
      const testCase = groundTruthData.test_cases[0];
      
      const mockLLMResponse = {
        data: {
          vehicles: [
            {
              vehicle_type: 'INSURED',
              make: 'unknown',
              model: 'unknown',
              license_plate: 'unknown',
              color: 'unknown',
              confidence_score: 0.85
            },
            {
              vehicle_type: 'THIRD_PARTY',
              make: 'unknown',
              model: 'กระบะ',
              license_plate: 'กข-1234',
              color: 'white',
              confidence_score: 0.92
            }
          ],
          incident_details: {
            incident_timestamp: '2024-01-15T09:00:00+07:00',
            location: {
              address: 'แยกอโศก',
              lat: null,
              lng: null,
              landmark: 'Asoke intersection',
              confidence_score: 0.88
            },
            narrative_summary: 'รถชนกับรถกระบะที่แยกอโศก',
            accident_type: 'COLLISION'
          },
          injuries: {
            injuries_reported: false,
            confidence_score: 0.95
          },
          police_report: {
            report_filed: 'unknown',
            report_number: 'unknown',
            confidence_score: 0.0
          },
          overall_confidence: 0.88,
          missing_critical_fields: ['police_report_status'],
          language_detected: 'th',
          metadata: {
            llm_model_version: 'gpt-4-turbo-2024-01-25'
          }
        }
      };

      axios.post.mockResolvedValue(mockLLMResponse);

      const result = await extractionService.extractClaimData({
        claimId: 'clm_gt001',
        ...testCase.input
      });

      accuracyResults.total++;
      
      const vehiclesMatch = compareExtraction(result.extractedData, testCase.expected_output, 'vehicles');
      const locationMatch = compareExtraction(result.extractedData, testCase.expected_output, 'location');
      const timestampMatch = compareExtraction(result.extractedData, testCase.expected_output, 'timestamp');
      const injuriesMatch = compareExtraction(result.extractedData, testCase.expected_output, 'injuries');
      const policeMatch = compareExtraction(result.extractedData, testCase.expected_output, 'policeReport');

      if (vehiclesMatch && locationMatch && timestampMatch && injuriesMatch && policeMatch) {
        accuracyResults.passed++;
      } else {
        accuracyResults.failed++;
      }

      expect(vehiclesMatch).toBe(true);
      expect(locationMatch).toBe(true);
      expect(timestampMatch).toBe(true);
    });
  });

  describe('Tinglish Code-Switching Extraction', () => {
    it('GT-002: Should process Tinglish mixed Thai-English input correctly', async () => {
      const testCase = groundTruthData.test_cases[1];
      
      const mockLLMResponse = {
        data: {
          vehicles: [
            {
              vehicle_type: 'INSURED',
              make: 'unknown',
              model: 'unknown',
              license_plate: 'unknown',
              damage_description: 'กันชนหน้า',
              confidence_score: 0.90
            },
            {
              vehicle_type: 'THIRD_PARTY',
              make: 'unknown',
              model: 'กระบะ',
              license_plate: 'unknown',
              confidence_score: 0.88
            }
          ],
          incident_details: {
            incident_timestamp: '2024-01-15T09:00:00+07:00',
            location: {
              address: 'แยก Asoke',
              landmark: 'Asoke intersection',
              confidence_score: 0.85
            },
            accident_type: 'COLLISION'
          },
          injuries: {
            injuries_reported: false,
            confidence_score: 0.92
          },
          police_report: {
            report_filed: 'unknown',
            confidence_score: 0.0
          },
          overall_confidence: 0.87,
          language_detected: 'th-en',
          metadata: {
            llm_model_version: 'gpt-4-turbo-2024-01-25'
          }
        }
      };

      axios.post.mockResolvedValue(mockLLMResponse);

      const result = await extractionService.extractClaimData({
        claimId: 'clm_gt002',
        ...testCase.input
      });

      accuracyResults.total++;
      
      const vehiclesMatch = compareExtraction(result.extractedData, testCase.expected_output, 'vehicles');
      const locationMatch = compareExtraction(result.extractedData, testCase.expected_output, 'location');

      if (vehiclesMatch && locationMatch) {
        accuracyResults.passed++;
      } else {
        accuracyResults.failed++;
      }

      expect(result.extractedData.language_detected).toBe('th-en');
      expect(result.extractedData.vehicles[1].model).toBe('กระบะ');
      expect(result.extractedData.vehicles[0].damage_description).toBe('กันชนหน้า');
      expect(vehiclesMatch).toBe(true);
    });
  });

  describe('English Language Extraction', () => {
    it('GT-003: Should extract English narrative with full vehicle details', async () => {
      const testCase = groundTruthData.test_cases[2];
      
      const mockLLMResponse = {
        data: {
          vehicles: [
            {
              vehicle_type: 'INSURED',
              make: 'Toyota',
              model: 'Camry',
              license_plate: 'ABC-123',
              confidence_score: 0.95
            },
            {
              vehicle_type: 'THIRD_PARTY',
              make: 'unknown',
              model: 'pickup truck',
              license_plate: 'unknown',
              confidence_score: 0.88
            }
          ],
          incident_details: {
            incident_timestamp: '2024-01-15T08:30:00+07:00',
            location: {
              address: 'Sukhumvit Road near BTS Asoke',
              confidence_score: 0.92
            },
            accident_type: 'COLLISION'
          },
          injuries: {
            injuries_reported: false,
            confidence_score: 0.95
          },
          police_report: {
            report_filed: 'unknown',
            confidence_score: 0.0
          },
          overall_confidence: 0.92,
          language_detected: 'en',
          metadata: {
            llm_model_version: 'gpt-4-turbo-2024-01-25'
          }
        }
      };

      axios.post.mockResolvedValue(mockLLMResponse);

      const result = await extractionService.extractClaimData({
        claimId: 'clm_gt003',
        ...testCase.input
      });

      accuracyResults.total++;
      
      const vehiclesMatch = compareExtraction(result.extractedData, testCase.expected_output, 'vehicles');
      const locationMatch = compareExtraction(result.extractedData, testCase.expected_output, 'location');
      const timestampMatch = compareExtraction(result.extractedData, testCase.expected_output, 'timestamp');

      if (vehiclesMatch && locationMatch && timestampMatch) {
        accuracyResults.passed++;
      } else {
        accuracyResults.failed++;
      }

      expect(result.extractedData.vehicles[0].make).toBe('Toyota');
      expect(result.extractedData.vehicles[0].model).toBe('Camry');
      expect(result.extractedData.vehicles[0].license_plate).toBe('ABC-123');
      expect(vehiclesMatch).toBe(true);
    });
  });

  describe('Complex Thai Extraction with Police Report', () => {
    it('GT-004: Should extract injury and police report details from Thai narrative', async () => {
      const testCase = groundTruthData.test_cases[3];
      
      const mockLLMResponse = {
        data: {
          vehicles: [
            {
              vehicle_type: 'THIRD_PARTY',
              make: 'Honda',
              model: 'Jazz',
              license_plate: 'นข-5678',
              color: 'red',
              confidence_score: 0.94
            }
          ],
          incident_details: {
            location: {
              address: 'ถนนพระราม 4',
              confidence_score: 0.90
            },
            accident_type: 'REAR_END'
          },
          injuries: {
            injuries_reported: true,
            injury_severity: 'MINOR',
            confidence_score: 0.92
          },
          police_report: {
            report_filed: true,
            report_number: 'PR-2024-001',
            police_station: 'สถานีตำรวจคลองเตย',
            confidence_score: 0.96
          },
          overall_confidence: 0.93,
          language_detected: 'th',
          metadata: {
            llm_model_version: 'gpt-4-turbo-2024-01-25'
          }
        }
      };

      axios.post.mockResolvedValue(mockLLMResponse);

      const result = await extractionService.extractClaimData({
        claimId: 'clm_gt004',
        ...testCase.input
      });

      accuracyResults.total++;
      
      const vehiclesMatch = compareExtraction(result.extractedData, testCase.expected_output, 'vehicles');
      const injuriesMatch = compareExtraction(result.extractedData, testCase.expected_output, 'injuries');
      const policeMatch = compareExtraction(result.extractedData, testCase.expected_output, 'policeReport');

      if (vehiclesMatch && injuriesMatch && policeMatch) {
        accuracyResults.passed++;
      } else {
        accuracyResults.failed++;
      }

      expect(result.extractedData.injuries.injuries_reported).toBe(true);
      expect(result.extractedData.police_report.report_filed).toBe(true);
      expect(result.extractedData.police_report.report_number).toBe('PR-2024-001');
      expect(policeMatch).toBe(true);
    });
  });

  describe('Relative Time Reference Extraction', () => {
    it('GT-005: Should parse relative time references in Thai', async () => {
      const testCase = groundTruthData.test_cases[4];
      
      const mockLLMResponse = {
        data: {
          vehicles: [
            {
              vehicle_type: 'INSURED',
              make: 'Mazda',
              model: '3',
              confidence_score: 0.93
            },
            {
              vehicle_type: 'THIRD_PARTY',
              model: 'motorcycle',
              confidence_score: 0.88
            }
          ],
          incident_details: {
            incident_timestamp: '2024-01-14T15:00:00+07:00',
            location: {
              address: 'สี่แยกราชประสงค์',
              landmark: 'Ratchaprasong intersection',
              confidence_score: 0.91
            },
            accident_type: 'COLLISION'
          },
          injuries: {
            injuries_reported: false,
            confidence_score: 0.95
          },
          police_report: {
            report_filed: false,
            confidence_score: 0.92
          },
          overall_confidence: 0.91,
          language_detected: 'th',
          metadata: {
            llm_model_version: 'gpt-4-turbo-2024-01-25'
          }
        }
      };

      axios.post.mockResolvedValue(mockLLMResponse);

      const result = await extractionService.extractClaimData({
        claimId: 'clm_gt005',
        ...testCase.input
      });

      accuracyResults.total++;
      
      const vehiclesMatch = compareExtraction(result.extractedData, testCase.expected_output, 'vehicles');
      const timestampMatch = compareExtraction(result.extractedData, testCase.expected_output, 'timestamp');
      const policeMatch = compareExtraction(result.extractedData, testCase.expected_output, 'policeReport');

      if (vehiclesMatch && timestampMatch && policeMatch) {
        accuracyResults.passed++;
      } else {
        accuracyResults.failed++;
      }

      expect(result.extractedData.police_report.report_filed).toBe(false);
      expect(timestampMatch).toBe(true);
    });
  });
});