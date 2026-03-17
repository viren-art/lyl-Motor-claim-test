const uploadService = require('./upload.service');
const auditService = require('../audit/audit.service');
const { v4: uuidv4 } = require('uuid');

class UploadController {
  /**
   * POST /api/v1/claims/{claimId}/documents
   * Generate pre-signed URL for document upload
   */
  async requestUploadUrl(req, res) {
    const startTime = Date.now();
    const { claimId } = req.params;
    const { documentType, fileName, fileSize, mimeType } = req.body;

    try {
      // Validate request body
      if (!documentType || !fileName || !fileSize || !mimeType) {
        return res.status(400).json({
          type: 'https://api.roojai.com/errors/missing-upload-parameters',
          title: 'Missing Upload Parameters',
          status: 400,
          detail: 'documentType, fileName, fileSize, and mimeType are required',
          instance: req.path,
          traceId: req.headers['x-trace-id'] || uuidv4()
        });
      }

      // Generate pre-signed URL
      const uploadData = await uploadService.generateUploadUrl(
        claimId,
        documentType,
        fileName,
        fileSize,
        mimeType
      );

      // Log upload request
      await auditService.logEvent({
        claimId,
        eventType: 'UPLOAD_URL_GENERATED',
        eventTimestamp: new Date().toISOString(),
        inputDataSnapshot: { documentType, fileName, fileSize, mimeType },
        outputData: { documentId: uploadData.documentId },
        processingDurationMs: Date.now() - startTime
      });

      return res.status(200).json({
        documentId: uploadData.documentId,
        uploadUrl: uploadData.uploadUrl,
        expiresAt: uploadData.expiresAt
      });

    } catch (error) {
      console.error('Upload URL generation error:', error);
      
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/upload-url-generation-failed',
        title: 'Upload URL Generation Failed',
        status: 400,
        detail: error.message,
        instance: req.path,
        traceId: req.headers['x-trace-id'] || uuidv4()
      });
    }
  }

  /**
   * POST /api/v1/claims/{claimId}/documents/{documentId}/validate
   * Validate uploaded photo quality
   */
  async validateUploadedPhoto(req, res) {
    const startTime = Date.now();
    const { claimId, documentId } = req.params;
    const { s3Key } = req.body;

    try {
      if (!s3Key) {
        return res.status(400).json({
          type: 'https://api.roojai.com/errors/missing-s3-key',
          title: 'Missing S3 Key',
          status: 400,
          detail: 's3Key is required for validation',
          instance: req.path,
          traceId: req.headers['x-trace-id'] || uuidv4()
        });
      }

      // Validate photo quality
      const validation = await uploadService.validatePhotoQuality(s3Key);

      // Log validation result
      await auditService.logEvent({
        claimId,
        eventType: 'PHOTO_VALIDATION',
        eventTimestamp: new Date().toISOString(),
        inputDataSnapshot: { documentId, s3Key },
        outputData: validation,
        processingDurationMs: Date.now() - startTime
      });

      if (!validation.valid) {
        return res.status(400).json({
          type: 'https://api.roojai.com/errors/photo-quality-insufficient',
          title: 'Photo Quality Insufficient',
          status: 400,
          detail: validation.reason,
          metadata: validation.metadata,
          instance: req.path,
          traceId: req.headers['x-trace-id'] || uuidv4()
        });
      }

      return res.status(200).json({
        valid: true,
        metadata: validation.metadata,
        exif: validation.exif
      });

    } catch (error) {
      console.error('Photo validation error:', error);
      
      return res.status(500).json({
        type: 'https://api.roojai.com/errors/photo-validation-failed',
        title: 'Photo Validation Failed',
        status: 500,
        detail: error.message,
        instance: req.path,
        traceId: req.headers['x-trace-id'] || uuidv4()
      });
    }
  }
}

module.exports = new UploadController();