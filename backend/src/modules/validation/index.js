/**
 * Validation Module Entry Point
 * Exports all validation utilities
 */

const {
  MANDATORY_FIELDS,
  validateMandatoryFields,
  markUnknownFields,
  prioritizeMissingFields,
  detectHallucination,
} = require('./mandatory-fields');

module.exports = {
  MANDATORY_FIELDS,
  validateMandatoryFields,
  markUnknownFields,
  prioritizeMissingFields,
  detectHallucination,
};