const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'roojai-claims-documents';

/**
 * Uploads file to S3 with server-side encryption
 * @param {Object} params - Upload parameters
 * @returns {Object} - { bucket, key, etag }
 */
async function uploadToS3({ file, claimId, documentId, metadata }) {
  const fileExtension = file.originalname.split('.').pop();
  const s3Key = `claims/${claimId}/documents/${documentId}.${fileExtension}`;

  const uploadParams = {
    Bucket: BUCKET_NAME,
    Key: s3Key,
    Body: file.buffer,
    ContentType: file.mimetype,
    ServerSideEncryption: 'AES256', // Server-side encryption
    Metadata: {
      'claim-id': claimId,
      'document-id': documentId,
      'uploaded-by': metadata.uploadedBy || 'system',
      'consent-id': metadata.consentId || '',
      'upload-timestamp': metadata.uploadTimestamp || new Date().toISOString()
    },
    // Add checksum for integrity verification
    ChecksumAlgorithm: 'SHA256'
  };

  try {
    const command = new PutObjectCommand(uploadParams);
    const response = await s3Client.send(command);

    return {
      bucket: BUCKET_NAME,
      key: s3Key,
      etag: response.ETag,
      versionId: response.VersionId
    };
  } catch (error) {
    console.error('S3 Upload Error:', {
      claimId,
      documentId,
      error: error.message
    });
    throw new Error(`Failed to upload document to S3: ${error.message}`);
  }
}

/**
 * Generates pre-signed URL for secure document access
 * @param {string} bucket - S3 bucket name
 * @param {string} key - S3 object key
 * @param {number} expiresIn - URL expiration in seconds (default 900 = 15 min)
 * @returns {string} - Pre-signed URL
 */
async function generatePresignedUrl(bucket, key, expiresIn = 900) {
  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    console.error('Pre-signed URL Generation Error:', {
      bucket,
      key,
      error: error.message
    });
    throw new Error(`Failed to generate pre-signed URL: ${error.message}`);
  }
}

/**
 * Generates pre-signed URL for client-side upload
 * @param {string} claimId - Claim reference ID
 * @param {string} documentId - Document ID
 * @param {string} fileExtension - File extension (e.g., 'jpg', 'pdf')
 * @param {string} contentType - MIME type
 * @returns {Object} - { uploadUrl, key, expiresAt }
 */
async function generateUploadPresignedUrl(claimId, documentId, fileExtension, contentType) {
  const s3Key = `claims/${claimId}/documents/${documentId}.${fileExtension}`;
  const expiresIn = 900; // 15 minutes

  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      ContentType: contentType,
      ServerSideEncryption: 'AES256'
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    return {
      uploadUrl,
      key: s3Key,
      bucket: BUCKET_NAME,
      expiresAt
    };
  } catch (error) {
    console.error('Upload Pre-signed URL Generation Error:', {
      claimId,
      documentId,
      error: error.message
    });
    throw new Error(`Failed to generate upload URL: ${error.message}`);
  }
}

module.exports = {
  uploadToS3,
  generatePresignedUrl,
  generateUploadPresignedUrl
};