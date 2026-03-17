const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { validatePDPAConsent, logConsentRecord } = require('./pdpa-validator');
const { validatePhotoQuality } = require('./photo-validator');
const { generateClaimReference } = require('./claim-reference-generator');
const { encryptPII } = require('../../middleware/security/pii-encryption');
const { uploadToS3, generatePresignedUrl } = require('../storage/s3-handler');
const db = require('../../database/connection');

const router = express.Router();

// Configure multer for memory storage (files processed in-memory before S3)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 10 // Max 10 files per request
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, PDF`));
    }
  }
});

/**
 * POST /api/v1/claims/fnol
 * Multi-channel FNOL intake endpoint
 * Supports: chat, email, web form submissions
 */
router.post('/fnol', upload.array('documents', 10), async (req, res) => {
  const startTime = Date.now();
  const traceId = `req_${uuidv4()}`;
  
  try {
    // 1. PDPA Consent Validation (MUST be first step)
    const { pdpaConsent, language = 'th', channel = 'web' } = req.body;
    
    if (!validatePDPAConsent(pdpaConsent)) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/pdpa-consent-required',
        title: 'PDPA Consent Required',
        status: 400,
        detail: language === 'th' 
          ? 'กรุณายินยอมให้ประมวลผลข้อมูลส่วนบุคคลตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล'
          : 'PDPA consent is required to process your claim',
        instance: req.path,
        traceId
      });
    }

    // 2. Generate Claim Reference (within 5-second SLA)
    const claimId = generateClaimReference();
    
    // 3. Extract and validate required fields
    const {
      policyNumber,
      incidentDate,
      incidentLocation,
      narrative,
      injuriesReported = false,
      policeReportFiled = false,
      policeReportNumber
    } = req.body;

    // Basic field validation
    if (!policyNumber || !/^\d{10}$/.test(policyNumber)) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/invalid-policy-number',
        title: 'Invalid Policy Number',
        status: 400,
        detail: 'Policy number must be exactly 10 digits',
        instance: req.path,
        traceId
      });
    }

    if (!narrative || narrative.length < 20) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/insufficient-narrative',
        title: 'Insufficient Narrative',
        status: 400,
        detail: 'Incident narrative must be at least 20 characters',
        instance: req.path,
        traceId
      });
    }

    // Validate incident date (ISO 8601, not future-dated, max 30 days past)
    const incidentDateTime = new Date(incidentDate);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    if (isNaN(incidentDateTime.getTime()) || incidentDateTime > now || incidentDateTime < thirtyDaysAgo) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/invalid-incident-date',
        title: 'Invalid Incident Date',
        status: 400,
        detail: 'Incident date must be within the last 30 days and not future-dated',
        instance: req.path,
        traceId
      });
    }

    // 4. Photo/Document Quality Validation
    const uploadedDocuments = [];
    const validationErrors = [];

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          // Validate photo quality (resolution, size)
          const qualityCheck = await validatePhotoQuality(file);
          
          if (!qualityCheck.valid) {
            validationErrors.push({
              fileName: file.originalname,
              reason: qualityCheck.reason
            });
            continue;
          }

          // Upload to S3 with encryption
          const documentId = `doc_${uuidv4()}`;
          const s3Result = await uploadToS3({
            file,
            claimId,
            documentId,
            metadata: {
              uploadedBy: channel,
              consentId: `cns_${uuidv4()}`,
              uploadTimestamp: new Date().toISOString()
            }
          });

          uploadedDocuments.push({
            documentId,
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
            s3Key: s3Result.key,
            s3Bucket: s3Result.bucket
          });

        } catch (uploadError) {
          validationErrors.push({
            fileName: file.originalname,
            reason: uploadError.message
          });
        }
      }
    }

    // Return error if all uploads failed
    if (req.files && req.files.length > 0 && uploadedDocuments.length === 0) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/document-upload-failed',
        title: 'Document Upload Failed',
        status: 400,
        detail: 'All document uploads failed validation',
        errors: validationErrors,
        instance: req.path,
        traceId
      });
    }

    // 5. Encrypt PII fields before database storage
    const encryptedData = {
      policyNumber: await encryptPII(policyNumber),
      narrative: await encryptPII(narrative),
      incidentAddress: incidentLocation?.address 
        ? await encryptPII(incidentLocation.address) 
        : null,
      policeReportNumber: policeReportNumber 
        ? await encryptPII(policeReportNumber) 
        : null
    };

    // 6. Store claim in database with audit trail
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Insert claim record
      const claimInsertQuery = `
        INSERT INTO claims (
          claim_id, policy_number, status, language,
          incident_date, incident_location_lat, incident_location_lng,
          incident_address, narrative, injuries_reported,
          police_report_filed, police_report_number,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
        RETURNING id
      `;

      const claimResult = await client.query(claimInsertQuery, [
        claimId,
        encryptedData.policyNumber,
        'INTAKE',
        language,
        incidentDate,
        incidentLocation?.lat || null,
        incidentLocation?.lng || null,
        encryptedData.incidentAddress,
        encryptedData.narrative,
        injuriesReported,
        policeReportFiled,
        encryptedData.policeReportNumber
      ]);

      const claimDbId = claimResult.rows[0].id;

      // Log PDPA consent record
      const consentId = await logConsentRecord(client, {
        claimId,
        pdpaConsentGiven: true,
        consentTimestamp: new Date().toISOString(),
        purposeOfProcessing: ['claim_processing', 'fraud_detection'],
        retentionPeriodDays: 2555 // 7 years for claim records
      });

      // Insert document records
      for (const doc of uploadedDocuments) {
        await client.query(`
          INSERT INTO documents (
            document_id, claim_id, type, s3_bucket, s3_key,
            s3_url, file_name, file_size, mime_type, uploaded_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        `, [
          doc.documentId,
          claimId,
          'PHOTO', // Default type, can be refined later
          doc.s3Bucket,
          doc.s3Key,
          await generatePresignedUrl(doc.s3Bucket, doc.s3Key, 900), // 15-min expiry
          doc.fileName,
          doc.fileSize,
          doc.mimeType
        ]);
      }

      // Create audit log entry
      await client.query(`
        INSERT INTO audit_log (
          event_id, claim_id, event_type, input_snapshot,
          processing_time_ms, event_timestamp
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        `evt_${uuidv4()}`,
        claimId,
        'FNOL_SUBMITTED',
        JSON.stringify({
          channel,
          language,
          documentsUploaded: uploadedDocuments.length,
          injuriesReported,
          policeReportFiled
        }),
        Date.now() - startTime
      ]);

      await client.query('COMMIT');

      // 7. Return success response
      const processingTime = Date.now() - startTime;
      
      res.status(201).json({
        claimId,
        status: 'INTAKE',
        consentId,
        documentsUploaded: uploadedDocuments.length,
        documentValidationErrors: validationErrors.length > 0 ? validationErrors : undefined,
        processingTimeMs: processingTime,
        message: language === 'th'
          ? `รับเรื่องเคลมสำเร็จ หมายเลขอ้างอิง: ${claimId}`
          : `Claim submitted successfully. Reference: ${claimId}`,
        nextSteps: language === 'th'
          ? 'ระบบกำลังประมวลผลข้อมูล คุณจะได้รับการติดต่อภายใน 24 ชั่วโมง'
          : 'Your claim is being processed. You will be contacted within 24 hours.'
      });

    } catch (dbError) {
      await client.query('ROLLBACK');
      throw dbError;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('FNOL Intake Error:', {
      traceId,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      type: 'https://api.roojai.com/errors/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred while processing your claim',
      instance: req.path,
      traceId
    });
  }
});

/**
 * GET /api/v1/claims/:claimId
 * Retrieve claim details
 */
router.get('/:claimId', async (req, res) => {
  const { claimId } = req.params;
  const traceId = `req_${uuidv4()}`;

  try {
    const result = await db.pool.query(`
      SELECT 
        claim_id, status, language, incident_date,
        incident_location_lat, incident_location_lng,
        injuries_reported, police_report_filed,
        created_at, updated_at
      FROM claims
      WHERE claim_id = $1
    `, [claimId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        type: 'https://api.roojai.com/errors/claim-not-found',
        title: 'Claim Not Found',
        status: 404,
        detail: `Claim ${claimId} does not exist`,
        instance: req.path,
        traceId
      });
    }

    const claim = result.rows[0];

    // Fetch associated documents
    const docsResult = await db.pool.query(`
      SELECT document_id, type, file_name, file_size, mime_type, uploaded_at
      FROM documents
      WHERE claim_id = $1
      ORDER BY uploaded_at DESC
    `, [claimId]);

    res.json({
      claimId: claim.claim_id,
      status: claim.status,
      language: claim.language,
      incidentDetails: {
        date: claim.incident_date,
        location: {
          lat: claim.incident_location_lat,
          lng: claim.incident_location_lng
        },
        injuriesReported: claim.injuries_reported,
        policeReportFiled: claim.police_report_filed
      },
      documents: docsResult.rows,
      createdAt: claim.created_at,
      updatedAt: claim.updated_at
    });

  } catch (error) {
    console.error('Claim Retrieval Error:', {
      traceId,
      claimId,
      error: error.message
    });

    res.status(500).json({
      type: 'https://api.roojai.com/errors/internal-server-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Failed to retrieve claim details',
      instance: req.path,
      traceId
    });
  }
});

module.exports = router;