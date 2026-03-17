const express = require('express');
const uploadController = require('./upload.controller');

const router = express.Router();

/**
 * Request pre-signed upload URL
 * POST /api/v1/claims/:claimId/documents
 */
router.post(
  '/:claimId/documents',
  uploadController.requestUploadUrl.bind(uploadController)
);

/**
 * Validate uploaded photo
 * POST /api/v1/claims/:claimId/documents/:documentId/validate
 */
router.post(
  '/:claimId/documents/:documentId/validate',
  uploadController.validateUploadedPhoto.bind(uploadController)
);

module.exports = router;