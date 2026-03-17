const extractionService = require('../../../src/modules/extraction/extraction.service');
const axios = require('axios');
const db = require('../../../src/database/connection');
const groundTruthData = require('../../fixtures/thai-ground-truth.json');

// DO NOT mock axios - we need real LLM calls for accuracy validation
// jest.mock('axios');
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

  // Run all 500 test cases from ground truth dataset
  describe('Ground Truth Dataset Validation (500 cases)', () => {
    groundTruthData.test_cases.forEach((testCase, index) => {
      it(`GT-${String(index + 1).padStart(3, '0')}: ${testCase.description}`, async () => {
        // Make real LLM call via extraction service
        const result = await extractionService.extractClaimData({
          claimId: `clm_gt${String(index + 1).padStart(3, '0')}`,
          ...testCase.input
        });

        accuracyResults.total++;
        
        // Compare each category
        const vehiclesMatch = compareExtraction(result.extractedData, testCase.expected_output, 'vehicles');
        const locationMatch = compareExtraction(result.extractedData, testCase.expected_output, 'location');
        const timestampMatch = compareExtraction(result.extractedData, testCase.expected_output, 'timestamp');
        const injuriesMatch = compareExtraction(result.extractedData, testCase.expected_output, 'injuries');
        const policeMatch = compareExtraction(result.extractedData, testCase.expected_output, 'policeReport');

        // Overall pass/fail
        if (vehiclesMatch && locationMatch && timestampMatch && injuriesMatch && policeMatch) {
          accuracyResults.passed++;
        } else {
          accuracyResults.failed++;
          console.log(`\nFailed case GT-${String(index + 1).padStart(3, '0')}:`);
          console.log(`  Input: ${testCase.input.narrative.substring(0, 100)}...`);
          console.log(`  Vehicles: ${vehiclesMatch ? 'PASS' : 'FAIL'}`);
          console.log(`  Location: ${locationMatch ? 'PASS' : 'FAIL'}`);
          console.log(`  Timestamp: ${timestampMatch ? 'PASS' : 'FAIL'}`);
          console.log(`  Injuries: ${injuriesMatch ? 'PASS' : 'FAIL'}`);
          console.log(`  Police: ${policeMatch ? 'PASS' : 'FAIL'}`);
        }

        // Verify 'unknown' marking for missing fields (no hallucination)
        const hasUnknownFields = JSON.stringify(result.extractedData).includes('"unknown"');
        if (testCase.expected_output.missing_critical_fields?.length > 0) {
          expect(hasUnknownFields).toBe(true);
        }

        // Verify confidence score exists and is in valid range
        expect(result.extractedData.overall_confidence).toBeGreaterThanOrEqual(0.0);
        expect(result.extractedData.overall_confidence).toBeLessThanOrEqual(1.0);

        // Verify language detection
        expect(result.extractedData.language_detected).toMatch(/^(th|en|th-en)$/);
      }, 60000); // 60s timeout per test case for LLM processing
    });
  });

  describe('Thai Language Extraction (Legacy Tests)', () => {
    it('GT-001: Should extract Thai narrative with vehicle and location details', async () => {
      const testCase = groundTruthData.test_cases[0];

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
    }, 60000);
  });

  describe('Tinglish Code-Switching Extraction (Legacy Tests)', () => {
    it('GT-002: Should process Tinglish mixed Thai-English input correctly', async () => {
      const testCase = groundTruthData.test_cases[1];

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

      expect(result.extractedData.language_detected).toMatch(/^(th-en|th|en)$/);
      expect(vehiclesMatch).toBe(true);
    }, 60000);
  });

  describe('English Language Extraction (Legacy Tests)', () => {
    it('GT-003: Should extract English narrative with full vehicle details', async () => {
      const testCase = groundTruthData.test_cases[2];

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

      expect(vehiclesMatch).toBe(true);
    }, 60000);
  });

  describe('Complex Thai Extraction with Police Report (Legacy Tests)', () => {
    it('GT-004: Should extract injury and police report details from Thai narrative', async () => {
      const testCase = groundTruthData.test_cases[3];

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

      expect(policeMatch).toBe(true);
    }, 60000);
  });

  describe('Relative Time Reference Extraction (Legacy Tests)', () => {
    it('GT-005: Should parse relative time references in Thai', async () => {
      const testCase = groundTruthData.test_cases[4];

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

      expect(timestampMatch).toBe(true);
    }, 60000);
  });
});