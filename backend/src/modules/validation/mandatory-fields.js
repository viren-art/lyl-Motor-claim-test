/**
 * Mandatory Field Validator
 * Identifies missing required fields in FNOL submissions
 * Enforces no-hallucination policy by explicitly marking unknowns
 */

const MANDATORY_FIELDS = {
  // Core claim identifiers
  POLICY_NUMBER: {
    key: 'policyNumber',
    displayNameTh: 'หมายเลขกรมธรรม์',
    displayNameEn: 'Policy Number',
    validator: (value) => value && /^\d{10}$/.test(value),
    criticality: 'CRITICAL', // Blocks auto-routing
  },
  
  // Incident details
  INCIDENT_DATE: {
    key: 'incidentDate',
    displayNameTh: 'วันที่เกิดเหตุ',
    displayNameEn: 'Incident Date',
    validator: (value) => {
      if (!value) return false;
      const date = new Date(value);
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return date <= now && date >= thirtyDaysAgo;
    },
    criticality: 'CRITICAL',
  },
  
  INCIDENT_LOCATION: {
    key: 'incidentLocation',
    displayNameTh: 'สถานที่เกิดเหตุ',
    displayNameEn: 'Incident Location',
    validator: (value) => {
      if (!value) return false;
      // Valid if has GPS coordinates OR address
      return (value.lat && value.lng) || (value.address && value.address.length >= 10);
    },
    criticality: 'HIGH',
  },
  
  NARRATIVE: {
    key: 'narrative',
    displayNameTh: 'รายละเอียดเหตุการณ์',
    displayNameEn: 'Incident Narrative',
    validator: (value) => value && value.length >= 20,
    criticality: 'CRITICAL',
  },
  
  // Vehicle information (insured vehicle)
  INSURED_VEHICLE_LICENSE: {
    key: 'vehicles[0].licensePlate',
    displayNameTh: 'ทะเบียนรถผู้เอาประกัน',
    displayNameEn: 'Insured Vehicle License Plate',
    validator: (value, context) => {
      const insuredVehicle = context?.vehicles?.find(v => v.role === 'INSURED');
      return insuredVehicle?.licensePlate && insuredVehicle.licensePlate.length >= 4;
    },
    criticality: 'HIGH',
  },
  
  INSURED_VEHICLE_VIN: {
    key: 'vehicles[0].vin',
    displayNameTh: 'หมายเลขตัวถังรถผู้เอาประกัน',
    displayNameEn: 'Insured Vehicle VIN',
    validator: (value, context) => {
      const insuredVehicle = context?.vehicles?.find(v => v.role === 'INSURED');
      return insuredVehicle?.vin && /^[A-HJ-NPR-Z0-9]{17}$/.test(insuredVehicle.vin);
    },
    criticality: 'MEDIUM',
  },
  
  // Police report (conditional on injury claims)
  POLICE_REPORT_STATUS: {
    key: 'policeReportFiled',
    displayNameTh: 'สถานะการแจ้งความ',
    displayNameEn: 'Police Report Status',
    validator: (value, context) => {
      // Required if injuries reported
      if (context?.injuriesReported === true) {
        return typeof value === 'boolean';
      }
      return true; // Not required otherwise
    },
    criticality: 'HIGH',
    conditional: true,
  },
  
  POLICE_REPORT_NUMBER: {
    key: 'policeReportNumber',
    displayNameTh: 'หมายเลขใบแจ้งความ',
    displayNameEn: 'Police Report Number',
    validator: (value, context) => {
      // Required if police report filed
      if (context?.policeReportFiled === true) {
        return value && value.length >= 5;
      }
      return true; // Not required otherwise
    },
    criticality: 'MEDIUM',
    conditional: true,
  },
};

/**
 * Validate all mandatory fields and return missing field list
 * @param {Object} extractedData - LLM extraction output
 * @param {Object} originalInput - Original FNOL submission
 * @returns {Object} Validation result with missing fields
 */
function validateMandatoryFields(extractedData, originalInput = {}) {
  const missingFields = [];
  const unknownFields = [];
  const validationErrors = [];
  
  // Combine extracted data with original input for context
  const context = {
    ...originalInput,
    ...extractedData,
  };
  
  // Check each mandatory field
  for (const [fieldId, fieldConfig] of Object.entries(MANDATORY_FIELDS)) {
    const { key, validator, criticality, conditional, displayNameTh, displayNameEn } = fieldConfig;
    
    // Get field value from extracted data
    const value = getNestedValue(extractedData, key);
    
    // Validate field
    const isValid = validator(value, context);
    
    if (!isValid) {
      const missingField = {
        fieldId,
        key,
        displayNameTh,
        displayNameEn,
        criticality,
        conditional: conditional || false,
        currentValue: value || null,
      };
      
      missingFields.push(missingField);
      
      // Check if field was explicitly marked as unknown by LLM
      if (value === 'unknown' || value === null || value === undefined) {
        unknownFields.push(missingField);
      } else {
        // Field has value but failed validation
        validationErrors.push({
          ...missingField,
          reason: 'Invalid format or value',
        });
      }
    }
  }
  
  // Determine if claim is ready for triage
  const criticalFieldsMissing = missingFields.filter(f => f.criticality === 'CRITICAL').length > 0;
  const readyForTriage = !criticalFieldsMissing;
  
  return {
    isValid: missingFields.length === 0,
    readyForTriage,
    missingFields,
    unknownFields,
    validationErrors,
    criticalFieldsMissing,
    totalMissingCount: missingFields.length,
    summary: {
      critical: missingFields.filter(f => f.criticality === 'CRITICAL').length,
      high: missingFields.filter(f => f.criticality === 'HIGH').length,
      medium: missingFields.filter(f => f.criticality === 'MEDIUM').length,
    },
  };
}

/**
 * Get nested object value by dot notation path
 * Handles array notation like 'vehicles[0].licensePlate'
 */
function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  
  // Handle array notation
  const arrayMatch = path.match(/^(\w+)\[(\d+)\]\.(.+)$/);
  if (arrayMatch) {
    const [, arrayKey, index, nestedPath] = arrayMatch;
    const array = obj[arrayKey];
    if (!Array.isArray(array) || !array[index]) return undefined;
    return getNestedValue(array[index], nestedPath);
  }
  
  // Handle dot notation
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Mark unknown fields in extraction output
 * Ensures no hallucination by explicitly setting missing fields to 'unknown'
 */
function markUnknownFields(extractedData, missingFields) {
  const markedData = JSON.parse(JSON.stringify(extractedData)); // Deep clone
  
  for (const field of missingFields) {
    setNestedValue(markedData, field.key, 'unknown');
  }
  
  return markedData;
}

/**
 * Set nested object value by dot notation path
 */
function setNestedValue(obj, path, value) {
  if (!obj || !path) return;
  
  // Handle array notation
  const arrayMatch = path.match(/^(\w+)\[(\d+)\]\.(.+)$/);
  if (arrayMatch) {
    const [, arrayKey, index, nestedPath] = arrayMatch;
    if (!obj[arrayKey]) obj[arrayKey] = [];
    if (!obj[arrayKey][index]) obj[arrayKey][index] = {};
    setNestedValue(obj[arrayKey][index], nestedPath, value);
    return;
  }
  
  // Handle dot notation
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((current, key) => {
    if (!current[key]) current[key] = {};
    return current[key];
  }, obj);
  
  target[lastKey] = value;
}

/**
 * Prioritize missing fields for clarifying questions
 * Returns top 3 most critical missing fields
 */
function prioritizeMissingFields(missingFields) {
  // Sort by criticality: CRITICAL > HIGH > MEDIUM
  const criticalityOrder = { CRITICAL: 3, HIGH: 2, MEDIUM: 1 };
  
  const sorted = [...missingFields].sort((a, b) => {
    const orderDiff = criticalityOrder[b.criticality] - criticalityOrder[a.criticality];
    if (orderDiff !== 0) return orderDiff;
    
    // If same criticality, prioritize non-conditional fields
    if (a.conditional !== b.conditional) {
      return a.conditional ? 1 : -1;
    }
    
    return 0;
  });
  
  // Return top 3
  return sorted.slice(0, 3);
}

/**
 * Check for hallucination indicators in extracted data
 * Returns list of fields that appear to be hallucinated
 */
function detectHallucination(extractedData, originalInput) {
  const hallucinatedFields = [];
  
  // Check for suspiciously complete data when input was sparse
  const inputWordCount = (originalInput.narrative || '').split(/\s+/).length;
  
  // Check vehicle details
  if (extractedData.vehicles) {
    for (const vehicle of extractedData.vehicles) {
      // VIN should not be inferred from narrative
      if (vehicle.vin && vehicle.vin !== 'unknown') {
        const vinInNarrative = (originalInput.narrative || '').includes(vehicle.vin);
        if (!vinInNarrative && inputWordCount < 50) {
          hallucinatedFields.push({
            field: 'vehicle.vin',
            value: vehicle.vin,
            reason: 'VIN not found in narrative but extracted',
          });
        }
      }
      
      // License plate format validation
      if (vehicle.licensePlate && vehicle.licensePlate !== 'unknown') {
        // Thai license plates: 2-3 Thai chars + 1-4 digits OR 3 English chars + 4 digits
        const thaiPlatePattern = /^[\u0E00-\u0E7F]{2,3}\s?\d{1,4}$/;
        const englishPlatePattern = /^[A-Z]{2,3}\s?\d{3,4}$/;
        
        if (!thaiPlatePattern.test(vehicle.licensePlate) && !englishPlatePattern.test(vehicle.licensePlate)) {
          hallucinatedFields.push({
            field: 'vehicle.licensePlate',
            value: vehicle.licensePlate,
            reason: 'Invalid license plate format',
          });
        }
      }
    }
  }
  
  // Check police report number
  if (extractedData.policeReportNumber && extractedData.policeReportNumber !== 'unknown') {
    const reportInNarrative = (originalInput.narrative || '').toLowerCase().includes(extractedData.policeReportNumber.toLowerCase());
    if (!reportInNarrative) {
      hallucinatedFields.push({
        field: 'policeReportNumber',
        value: extractedData.policeReportNumber,
        reason: 'Police report number not found in narrative',
      });
    }
  }
  
  // Check GPS coordinates
  if (extractedData.incidentLocation?.lat && extractedData.incidentLocation?.lng) {
    const hasGPSInInput = originalInput.incidentLocation?.lat || 
                          (originalInput.narrative || '').match(/\d+\.\d+.*\d+\.\d+/);
    
    if (!hasGPSInInput && inputWordCount < 30) {
      hallucinatedFields.push({
        field: 'incidentLocation.coordinates',
        value: `${extractedData.incidentLocation.lat}, ${extractedData.incidentLocation.lng}`,
        reason: 'GPS coordinates inferred without explicit input',
      });
    }
  }
  
  return hallucinatedFields;
}

module.exports = {
  MANDATORY_FIELDS,
  validateMandatoryFields,
  markUnknownFields,
  prioritizeMissingFields,
  detectHallucination,
  getNestedValue,
  setNestedValue,
};