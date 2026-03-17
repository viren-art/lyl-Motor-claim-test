const { v4: uuidv4 } = require('uuid');
const uploadService = require('../upload/upload.service');
const consentService = require('../../middleware/consent/consent.service');
const claimRepository = require('./claim.repository');
const auditService = require('../audit/audit.service');

class IntakeController {
  /**
   * POST /api/v1/claims/fnol/chat
   * Handle chat-based FNOL submission
   */
  async handleChatSubmission(req, res) {
    const startTime = Date.now();
    
    try {
      // Validate PDPA consent first
      const consentValidation = await consentService.validateConsent(req.body);
      if (!consentValidation.valid) {
        return res.status(400).json({
          type: 'https://api.roojai.com/errors/pdpa-consent-required',
          title: 'PDPA Consent Required',
          status: 400,
          detail: consentValidation.message,
          instance: req.path,
          traceId: req.headers['x-trace-id'] || uuidv4()
        });
      }

      // Generate unique claim ID
      const claimId = uuidv4();
      
      // Extract claim data from chat narrative
      const claimData = {
        claimId,
        policyNumber: req.body.policyNumber,
        language: req.body.language || 'th',
        incidentDate: req.body.incidentDate,
        incidentLocation: req.body.incidentLocation,
        narrative: req.body.narrative,
        injuriesReported: req.body.injuriesReported || false,
        policeReportFiled: req.body.policeReportFiled || false,
        policeReportNumber: req.body.policeReportNumber,
        channel: 'CHAT',
        status: 'INTAKE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Log PDPA consent
      await consentService.logConsent({
        claimId,
        pdpaConsentGiven: true,
        consentTimestamp: new Date().toISOString(),
        purposeOfProcessing: ['claim_processing', 'fraud_detection'],
        retentionPeriodDays: 2555 // 7 years for claim records
      });

      // Create claim record
      const claim = await claimRepository.createClaim(claimData);

      // Log intake event to audit trail
      await auditService.logEvent({
        claimId,
        eventType: 'INTAKE_CHAT',
        eventTimestamp: new Date().toISOString(),
        inputDataSnapshot: req.body,
        outputData: { claimId, status: 'INTAKE' },
        processingDurationMs: Date.now() - startTime
      });

      const processingTime = Date.now() - startTime;

      // Return within 5-second acknowledgment SLA
      return res.status(201).json({
        claimId,
        status: 'INTAKE',
        message: req.body.language === 'th' 
          ? 'ได้รับแจ้งเคลมของท่านแล้ว กำลังดำเนินการตรวจสอบ'
          : 'Your claim has been received and is being processed',
        processingTimeMs: processingTime,
        nextSteps: req.body.language === 'th'
          ? 'กรุณารอสรุปข้อมูลเบื้องต้นภายใน 30 วินาที'
          : 'Please wait for initial summary within 30 seconds'
      });

    } catch (error) {
      console.error('Chat intake error:', error);
      
      await auditService.logEvent({
        claimId: req.body.claimId || 'UNKNOWN',
        eventType: 'INTAKE_ERROR',
        eventTimestamp: new Date().toISOString(),
        inputDataSnapshot: req.body,
        outputData: { error: error.message },
        processingDurationMs: Date.now() - startTime
      });

      return res.status(500).json({
        type: 'https://api.roojai.com/errors/intake-processing-failed',
        title: 'Intake Processing Failed',
        status: 500,
        detail: error.message,
        instance: req.path,
        traceId: req.headers['x-trace-id'] || uuidv4()
      });
    }
  }

  /**
   * POST /api/v1/claims/fnol/email
   * Handle email-based FNOL submission
   */
  async handleEmailSubmission(req, res) {
    const startTime = Date.now();
    
    try {
      // Extract email metadata
      const emailData = {
        from: req.body.from,
        subject: req.body.subject,
        body: req.body.body,
        attachments: req.body.attachments || [],
        receivedAt: req.body.receivedAt
      };

      // Parse policy number from email subject or body
      const policyNumber = this.extractPolicyNumber(emailData.subject, emailData.body);
      if (!policyNumber) {
        return res.status(400).json({
          type: 'https://api.roojai.com/errors/policy-number-missing',
          title: 'Policy Number Missing',
          status: 400,
          detail: 'Could not extract policy number from email',
          instance: req.path,
          traceId: req.headers['x-trace-id'] || uuidv4()
        });
      }

      // Generate claim ID
      const claimId = uuidv4();

      // Create claim from email content
      const claimData = {
        claimId,
        policyNumber,
        language: this.detectLanguage(emailData.body),
        narrative: emailData.body,
        channel: 'EMAIL',
        status: 'INTAKE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        emailMetadata: {
          from: emailData.from,
          subject: emailData.subject,
          receivedAt: emailData.receivedAt
        }
      };

      // Note: Email submissions require follow-up for PDPA consent
      const claim = await claimRepository.createClaim(claimData);

      // Process attachments if present
      if (emailData.attachments.length > 0) {
        for (const attachment of emailData.attachments) {
          await uploadService.processEmailAttachment(claimId, attachment);
        }
      }

      await auditService.logEvent({
        claimId,
        eventType: 'INTAKE_EMAIL',
        eventTimestamp: new Date().toISOString(),
        inputDataSnapshot: emailData,
        outputData: { claimId, status: 'INTAKE' },
        processingDurationMs: Date.now() - startTime
      });

      return res.status(201).json({
        claimId,
        status: 'INTAKE',
        message: 'Email claim received. PDPA consent required for processing.',
        consentRequired: true,
        processingTimeMs: Date.now() - startTime
      });

    } catch (error) {
      console.error('Email intake error:', error);
      return res.status(500).json({
        type: 'https://api.roojai.com/errors/email-processing-failed',
        title: 'Email Processing Failed',
        status: 500,
        detail: error.message,
        instance: req.path,
        traceId: req.headers['x-trace-id'] || uuidv4()
      });
    }
  }

  /**
   * POST /api/v1/claims/fnol/form
   * Handle web form FNOL submission
   */
  async handleFormSubmission(req, res) {
    const startTime = Date.now();
    
    try {
      // Validate PDPA consent
      const consentValidation = await consentService.validateConsent(req.body);
      if (!consentValidation.valid) {
        return res.status(400).json({
          type: 'https://api.roojai.com/errors/pdpa-consent-required',
          title: 'PDPA Consent Required',
          status: 400,
          detail: consentValidation.message,
          instance: req.path,
          traceId: req.headers['x-trace-id'] || uuidv4()
        });
      }

      // Validate required fields
      const validation = this.validateFormData(req.body);
      if (!validation.valid) {
        return res.status(400).json({
          type: 'https://api.roojai.com/errors/validation-failed',
          title: 'Validation Failed',
          status: 400,
          detail: validation.errors.join(', '),
          instance: req.path,
          traceId: req.headers['x-trace-id'] || uuidv4()
        });
      }

      const claimId = uuidv4();

      const claimData = {
        claimId,
        policyNumber: req.body.policyNumber,
        language: req.body.language || 'th',
        incidentDate: req.body.incidentDate,
        incidentLocation: {
          lat: req.body.incidentLocation?.lat,
          lng: req.body.incidentLocation?.lng,
          address: req.body.incidentLocation?.address
        },
        narrative: req.body.narrative,
        injuriesReported: req.body.injuriesReported || false,
        policeReportFiled: req.body.policeReportFiled || false,
        policeReportNumber: req.body.policeReportNumber,
        channel: 'WEB_FORM',
        status: 'INTAKE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Log PDPA consent
      await consentService.logConsent({
        claimId,
        pdpaConsentGiven: true,
        consentTimestamp: new Date().toISOString(),
        purposeOfProcessing: ['claim_processing', 'fraud_detection'],
        retentionPeriodDays: 2555
      });

      const claim = await claimRepository.createClaim(claimData);

      await auditService.logEvent({
        claimId,
        eventType: 'INTAKE_FORM',
        eventTimestamp: new Date().toISOString(),
        inputDataSnapshot: req.body,
        outputData: { claimId, status: 'INTAKE' },
        processingDurationMs: Date.now() - startTime
      });

      return res.status(201).json({
        claimId,
        status: 'INTAKE',
        message: req.body.language === 'th'
          ? 'ได้รับแจ้งเคลมของท่านแล้ว'
          : 'Your claim has been received',
        processingTimeMs: Date.now() - startTime,
        uploadInstructions: {
          documentsEndpoint: `/api/v1/claims/${claimId}/documents`,
          requiredDocuments: ['LICENSE', 'PHOTO']
        }
      });

    } catch (error) {
      console.error('Form intake error:', error);
      return res.status(500).json({
        type: 'https://api.roojai.com/errors/form-processing-failed',
        title: 'Form Processing Failed',
        status: 500,
        detail: error.message,
        instance: req.path,
        traceId: req.headers['x-trace-id'] || uuidv4()
      });
    }
  }

  /**
   * Helper: Extract policy number from text using regex
   */
  extractPolicyNumber(subject, body) {
    const text = `${subject} ${body}`;
    // Match 10-digit policy numbers
    const match = text.match(/\b\d{10}\b/);
    return match ? match[0] : null;
  }

  /**
   * Helper: Detect language from text content
   */
  detectLanguage(text) {
    // Simple Thai character detection
    const thaiCharCount = (text.match(/[\u0E00-\u0E7F]/g) || []).length;
    return thaiCharCount > 10 ? 'th' : 'en';
  }

  /**
   * Helper: Validate form submission data
   */
  validateFormData(data) {
    const errors = [];

    if (!data.policyNumber || !/^\d{10}$/.test(data.policyNumber)) {
      errors.push('Invalid policy number format (must be 10 digits)');
    }

    if (!data.incidentDate) {
      errors.push('Incident date is required');
    }

    if (!data.narrative || data.narrative.length < 20) {
      errors.push('Narrative must be at least 20 characters');
    }

    if (!data.incidentLocation?.address) {
      errors.push('Incident location address is required');
    }

    if (data.policeReportFiled && !data.policeReportNumber) {
      errors.push('Police report number required when report is filed');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = new IntakeController();