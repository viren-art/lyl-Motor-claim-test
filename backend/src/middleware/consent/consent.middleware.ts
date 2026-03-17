const consentService = require('./consent.service');
const { v4: uuidv4 } = require('uuid');

/**
 * Middleware to enforce PDPA consent before processing
 */
async function enforceConsent(req, res, next) {
  try {
    // Check if PDPA consent is present in request
    const validation = await consentService.validateConsent(req.body);
    
    if (!validation.valid) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/pdpa-consent-required',
        title: 'PDPA Consent Required',
        status: 400,
        detail: validation.message,
        instance: req.path,
        traceId: req.headers['x-trace-id'] || uuidv4()
      });
    }

    // Attach consent validation to request for downstream use
    req.consentValidation = validation;
    next();

  } catch (error) {
    console.error('Consent middleware error:', error);
    return res.status(500).json({
      type: 'https://api.roojai.com/errors/consent-validation-failed',
      title: 'Consent Validation Failed',
      status: 500,
      detail: error.message,
      instance: req.path,
      traceId: req.headers['x-trace-id'] || uuidv4()
    });
  }
}

module.exports = enforceConsent;