const {
  MANDATORY_FIELDS,
  validateMandatoryFields,
  markUnknownFields,
  prioritizeMissingFields,
  detectHallucination,
  getNestedValue,
  setNestedValue,
} = require('../../../src/modules/validation/mandatory-fields');

describe('Mandatory Field Validation', () => {
  describe('validateMandatoryFields', () => {
    it('should identify missing policy number as CRITICAL', () => {
      const extractedData = {
        policyNumber: null,
        incidentDate: '2026-01-15T14:30:00+07:00',
        narrative: 'รถชนกันที่สี่แยกสุขุมวิท',
      };
      
      const result = validateMandatoryFields(extractedData);
      
      expect(result.isValid).toBe(false);
      expect(result.criticalFieldsMissing).toBe(true);
      expect(result.readyForTriage).toBe(false);
      expect(result.missingFields).toContainEqual(
        expect.objectContaining({
          fieldId: 'POLICY_NUMBER',
          criticality: 'CRITICAL',
        })
      );
    });
    
    it('should mark unknown fields explicitly', () => {
      const extractedData = {
        policyNumber: '1234567890',
        incidentDate: '2026-01-15T14:30:00+07:00',
        narrative: 'รถชนกันที่สี่แยกสุขุมวิท',
        vehicles: [
          {
            role: 'INSURED',
            licensePlate: 'unknown',
            vin: null,
          },
        ],
      };
      
      const result = validateMandatoryFields(extractedData);
      
      expect(result.unknownFields.length).toBeGreaterThan(0);
      expect(result.unknownFields).toContainEqual(
        expect.objectContaining({
          fieldId: 'INSURED_VEHICLE_LICENSE',
          currentValue: 'unknown',
        })
      );
    });
    
    it('should validate incident date within 30-day window', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      
      const extractedData = {
        policyNumber: '1234567890',
        incidentDate: futureDate.toISOString(),
        narrative: 'รถชนกันที่สี่แยกสุขุมวิท',
      };
      
      const result = validateMandatoryFields(extractedData);
      
      expect(result.validationErrors).toContainEqual(
        expect.objectContaining({
          fieldId: 'INCIDENT_DATE',
          reason: 'Invalid format or value',
        })
      );
    });
    
    it('should accept GPS coordinates or address for location', () => {
      const extractedDataWithGPS = {
        policyNumber: '1234567890',
        incidentDate: '2026-01-15T14:30:00+07:00',
        narrative: 'รถชนกันที่สี่แยกสุขุมวิท',
        incidentLocation: {
          lat: 13.7563,
          lng: 100.5018,
        },
      };
      
      const resultGPS = validateMandatoryFields(extractedDataWithGPS);
      expect(resultGPS.missingFields.find(f => f.fieldId === 'INCIDENT_LOCATION')).toBeUndefined();
      
      const extractedDataWithAddress = {
        policyNumber: '1234567890',
        incidentDate: '2026-01-15T14:30:00+07:00',
        narrative: 'รถชนกันที่สี่แยกสุขุมวิท',
        incidentLocation: {
          address: 'สี่แยกสุขุมวิท กรุงเทพมหานคร',
        },
      };
      
      const resultAddress = validateMandatoryFields(extractedDataWithAddress);
      expect(resultAddress.missingFields.find(f => f.fieldId === 'INCIDENT_LOCATION')).toBeUndefined();
    });
    
    it('should require police report for injury claims', () => {
      const extractedData = {
        policyNumber: '1234567890',
        incidentDate: '2026-01-15T14:30:00+07:00',
        narrative: 'รถชนกันมีคนบาดเจ็บ',
        injuriesReported: true,
        policeReportFiled: undefined,
      };
      
      const result = validateMandatoryFields(extractedData, { injuriesReported: true });
      
      expect(result.missingFields).toContainEqual(
        expect.objectContaining({
          fieldId: 'POLICE_REPORT_STATUS',
          conditional: true,
        })
      );
    });
    
    it('should not require police report for non-injury claims', () => {
      const extractedData = {
        policyNumber: '1234567890',
        incidentDate: '2026-01-15T14:30:00+07:00',
        narrative: 'รถชนกันไม่มีคนบาดเจ็บ',
        injuriesReported: false,
      };
      
      const result = validateMandatoryFields(extractedData, { injuriesReported: false });
      
      expect(result.missingFields.find(f => f.fieldId === 'POLICE_REPORT_STATUS')).toBeUndefined();
    });
  });
  
  describe('markUnknownFields', () => {
    it('should set missing fields to "unknown"', () => {
      const extractedData = {
        policyNumber: '1234567890',
        vehicles: [
          {
            role: 'INSURED',
            make: 'Toyota',
          },
        ],
      };
      
      const missingFields = [
        { key: 'vehicles[0].licensePlate' },
        { key: 'vehicles[0].vin' },
      ];
      
      const marked = markUnknownFields(extractedData, missingFields);
      
      expect(marked.vehicles[0].licensePlate).toBe('unknown');
      expect(marked.vehicles[0].vin).toBe('unknown');
      expect(marked.vehicles[0].make).toBe('Toyota'); // Unchanged
    });
  });
  
  describe('prioritizeMissingFields', () => {
    it('should prioritize CRITICAL fields first', () => {
      const missingFields = [
        { fieldId: 'INSURED_VEHICLE_VIN', criticality: 'MEDIUM', conditional: false },
        { fieldId: 'POLICY_NUMBER', criticality: 'CRITICAL', conditional: false },
        { fieldId: 'INCIDENT_LOCATION', criticality: 'HIGH', conditional: false },
      ];
      
      const prioritized = prioritizeMissingFields(missingFields);
      
      expect(prioritized[0].fieldId).toBe('POLICY_NUMBER');
      expect(prioritized[1].fieldId).toBe('INCIDENT_LOCATION');
      expect(prioritized[2].fieldId).toBe('INSURED_VEHICLE_VIN');
    });
    
    it('should return maximum 3 fields', () => {
      const missingFields = [
        { fieldId: 'FIELD1', criticality: 'CRITICAL', conditional: false },
        { fieldId: 'FIELD2', criticality: 'CRITICAL', conditional: false },
        { fieldId: 'FIELD3', criticality: 'HIGH', conditional: false },
        { fieldId: 'FIELD4', criticality: 'HIGH', conditional: false },
        { fieldId: 'FIELD5', criticality: 'MEDIUM', conditional: false },
      ];
      
      const prioritized = prioritizeMissingFields(missingFields);
      
      expect(prioritized.length).toBe(3);
    });
    
    it('should prioritize non-conditional fields over conditional', () => {
      const missingFields = [
        { fieldId: 'POLICE_REPORT_NUMBER', criticality: 'MEDIUM', conditional: true },
        { fieldId: 'INSURED_VEHICLE_VIN', criticality: 'MEDIUM', conditional: false },
      ];
      
      const prioritized = prioritizeMissingFields(missingFields);
      
      expect(prioritized[0].fieldId).toBe('INSURED_VEHICLE_VIN');
    });
  });
  
  describe('detectHallucination', () => {
    it('should detect VIN not present in narrative', () => {
      const extractedData = {
        vehicles: [
          {
            role: 'INSURED',
            vin: '1HGBH41JXMN109186',
          },
        ],
      };
      
      const originalInput = {
        narrative: 'รถชนกันที่สี่แยก',
      };
      
      const hallucinated = detectHallucination(extractedData, originalInput);
      
      expect(hallucinated).toContainEqual(
        expect.objectContaining({
          field: 'vehicle.vin',
          reason: 'VIN not found in narrative but extracted',
        })
      );
    });
    
    it('should detect invalid license plate format', () => {
      const extractedData = {
        vehicles: [
          {
            role: 'INSURED',
            licensePlate: 'INVALID123456',
          },
        ],
      };
      
      const originalInput = {
        narrative: 'รถชนกันที่สี่แยก',
      };
      
      const hallucinated = detectHallucination(extractedData, originalInput);
      
      expect(hallucinated).toContainEqual(
        expect.objectContaining({
          field: 'vehicle.licensePlate',
          reason: 'Invalid license plate format',
        })
      );
    });
    
    it('should accept valid Thai license plate', () => {
      const extractedData = {
        vehicles: [
          {
            role: 'INSURED',
            licensePlate: 'กข 1234',
          },
        ],
      };
      
      const originalInput = {
        narrative: 'รถทะเบียน กข 1234 ชนกันที่สี่แยก',
      };
      
      const hallucinated = detectHallucination(extractedData, originalInput);
      
      expect(hallucinated.find(h => h.field === 'vehicle.licensePlate')).toBeUndefined();
    });
    
    it('should detect GPS coordinates inferred without input', () => {
      const extractedData = {
        incidentLocation: {
          lat: 13.7563,
          lng: 100.5018,
        },
      };
      
      const originalInput = {
        narrative: 'รถชนกัน',
      };
      
      const hallucinated = detectHallucination(extractedData, originalInput);
      
      expect(hallucinated).toContainEqual(
        expect.objectContaining({
          field: 'incidentLocation.coordinates',
          reason: 'GPS coordinates inferred without explicit input',
        })
      );
    });
    
    it('should not flag GPS when coordinates in narrative', () => {
      const extractedData = {
        incidentLocation: {
          lat: 13.7563,
          lng: 100.5018,
        },
      };
      
      const originalInput = {
        narrative: 'รถชนกันที่ 13.7563, 100.5018',
      };
      
      const hallucinated = detectHallucination(extractedData, originalInput);
      
      expect(hallucinated.find(h => h.field === 'incidentLocation.coordinates')).toBeUndefined();
    });
  });
  
  describe('getNestedValue', () => {
    it('should retrieve nested object values', () => {
      const obj = {
        vehicles: [
          {
            licensePlate: 'ABC123',
            vin: '1HGBH41JXMN109186',
          },
        ],
      };
      
      expect(getNestedValue(obj, 'vehicles[0].licensePlate')).toBe('ABC123');
      expect(getNestedValue(obj, 'vehicles[0].vin')).toBe('1HGBH41JXMN109186');
    });
    
    it('should return undefined for missing paths', () => {
      const obj = {
        vehicles: [],
      };
      
      expect(getNestedValue(obj, 'vehicles[0].licensePlate')).toBeUndefined();
      expect(getNestedValue(obj, 'nonexistent.path')).toBeUndefined();
    });
  });
  
  describe('setNestedValue', () => {
    it('should set nested object values', () => {
      const obj = {
        vehicles: [
          {
            licensePlate: 'ABC123',
          },
        ],
      };
      
      setNestedValue(obj, 'vehicles[0].vin', 'unknown');
      
      expect(obj.vehicles[0].vin).toBe('unknown');
      expect(obj.vehicles[0].licensePlate).toBe('ABC123'); // Unchanged
    });
    
    it('should create missing nested paths', () => {
      const obj = {};
      
      setNestedValue(obj, 'vehicles[0].licensePlate', 'ABC123');
      
      expect(obj.vehicles).toBeDefined();
      expect(obj.vehicles[0]).toBeDefined();
      expect(obj.vehicles[0].licensePlate).toBe('ABC123');
    });
  });
});