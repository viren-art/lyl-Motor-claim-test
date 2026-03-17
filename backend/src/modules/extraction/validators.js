/**
 * Validate Thai language input
 * Checks for UTF-8 encoding and Thai/English characters
 */
function validateThaiInput(text) {
  if (!text || typeof text !== 'string') {
    return { valid: false, reason: 'Text is required' };
  }
  
  // Check minimum length
  if (text.length < 20) {
    return { valid: false, reason: 'Text must be at least 20 characters' };
  }
  
  // Check for valid UTF-8 Thai/English characters
  // Thai Unicode range: \u0E00-\u0E7F
  // Allow Thai, English, numbers, common punctuation, spaces
  const validPattern = /^[\u0E00-\u0E7Fa-zA-Z0-9\s.,!?()\/\-:;'"]+$/;
  
  if (!validPattern.test(text)) {
    return { 
      valid: false, 
      reason: 'Text contains invalid characters. Only Thai, English, numbers, and common punctuation allowed' 
    };
  }
  
  return { valid: true };
}

/**
 * Validate confidence score
 */
function validateConfidenceScore(score) {
  if (typeof score !== 'number') {
    return { valid: false, reason: 'Confidence score must be a number' };
  }
  
  if (score < 0.0 || score > 1.0) {
    return { valid: false, reason: 'Confidence score must be between 0.0 and 1.0' };
  }
  
  return { valid: true };
}

/**
 * Validate vehicle details
 */
function validateVehicleDetails(vehicle) {
  const errors = [];
  
  if (!vehicle.role || !['INSURED', 'THIRD_PARTY'].includes(vehicle.role)) {
    errors.push('Vehicle role must be INSURED or THIRD_PARTY');
  }
  
  if (vehicle.year && (vehicle.year < 1900 || vehicle.year > new Date().getFullYear() + 1)) {
    errors.push('Vehicle year is invalid');
  }
  
  if (vehicle.confidence_score !== undefined) {
    const scoreValidation = validateConfidenceScore(vehicle.confidence_score);
    if (!scoreValidation.valid) {
      errors.push(scoreValidation.reason);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate location details
 */
function validateLocationDetails(location) {
  const errors = [];
  
  if (location.lat !== null && location.lat !== undefined) {
    if (typeof location.lat !== 'number' || location.lat < -90 || location.lat > 90) {
      errors.push('Latitude must be between -90 and 90');
    }
  }
  
  if (location.lng !== null && location.lng !== undefined) {
    if (typeof location.lng !== 'number' || location.lng < -180 || location.lng > 180) {
      errors.push('Longitude must be between -180 and 180');
    }
  }
  
  // If lat is provided, lng must also be provided and vice versa
  if ((location.lat !== null && location.lng === null) || 
      (location.lat === null && location.lng !== null)) {
    errors.push('Both latitude and longitude must be provided together');
  }
  
  if (location.confidence_score !== undefined) {
    const scoreValidation = validateConfidenceScore(location.confidence_score);
    if (!scoreValidation.valid) {
      errors.push(scoreValidation.reason);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Check for hallucination indicators
 * Returns true if data appears to be hallucinated
 */
function detectHallucination(extractedData, originalNarrative) {
  const indicators = [];
  
  // Check if extracted data contains information not in narrative
  const narrativeLower = originalNarrative.toLowerCase();
  
  // Check vehicle details
  if (extractedData.vehicles) {
    extractedData.vehicles.forEach((vehicle, index) => {
      if (vehicle.license_plate && 
          !narrativeLower.includes(vehicle.license_plate.toLowerCase())) {
        indicators.push(`Vehicle ${index} license plate not found in narrative`);
      }
      
      if (vehicle.make && 
          !narrativeLower.includes(vehicle.make.toLowerCase())) {
        // Only flag if confidence is high
        if (vehicle.confidence_score > 0.8) {
          indicators.push(`Vehicle ${index} make not found in narrative but high confidence`);
        }
      }
    });
  }
  
  // Check police report number
  if (extractedData.police_report_number && 
      !narrativeLower.includes(extractedData.police_report_number.toLowerCase())) {
    indicators.push('Police report number not found in narrative');
  }
  
  return {
    hasHallucination: indicators.length > 0,
    indicators
  };
}

module.exports = {
  validateThaiInput,
  validateConfidenceScore,
  validateVehicleDetails,
  validateLocationDetails,
  detectHallucination
};