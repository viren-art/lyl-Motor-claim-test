const AWS = require('aws-sdk');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config/aws.config');

class UploadService {
  constructor() {
    this.s3 = new AWS.S3({
      region: config.region,
      signatureVersion: 'v4'
    });
    this.bucketName = config.s3.claimDocumentsBucket;
  }

  /**
   * Generate pre-signed URL for document upload
   * POST /api/v1/claims/{claimId}/documents
   */
  async generateUploadUrl(claimId, documentType, fileName, fileSize, mimeType) {
    // Validate file size (max 10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
    if (fileSize > MAX_FILE_SIZE) {
      throw new Error(`File size ${fileSize} bytes exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes (10MB)`);
    }

    // Validate MIME type
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedMimeTypes.includes(mimeType)) {
      throw new Error(`MIME type ${mimeType} not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`);
    }

    // Validate document type
    const allowedDocTypes = ['LICENSE', 'POLICY', 'REPAIR_QUOTE', 'POLICE_REPORT', 'PHOTO'];
    if (!allowedDocTypes.includes(documentType)) {
      throw new Error(`Invalid document type: ${documentType}`);
    }

    const documentId = uuidv4();
    const s3Key = `claims/${claimId}/documents/${documentId}/${fileName}`;

    // Generate pre-signed URL with 15-minute expiration
    const uploadUrl = await this.s3.getSignedUrlPromise('putObject', {
      Bucket: this.bucketName,
      Key: s3Key,
      ContentType: mimeType,
      Expires: 900, // 15 minutes
      ServerSideEncryption: 'AES256',
      Metadata: {
        claimId,
        documentType,
        documentId
      }
    });

    const expiresAt = new Date(Date.now() + 900000).toISOString(); // 15 minutes from now

    return {
      documentId,
      uploadUrl,
      s3Key,
      expiresAt
    };
  }

  /**
   * Validate uploaded photo quality
   * Checks resolution, format, and extracts EXIF metadata
   */
  async validatePhotoQuality(s3Key) {
    try {
      // Download image from S3
      const s3Object = await this.s3.getObject({
        Bucket: this.bucketName,
        Key: s3Key
      }).promise();

      const imageBuffer = s3Object.Body;

      // Get image metadata using sharp
      const metadata = await sharp(imageBuffer).metadata();

      // Validate minimum resolution (800x600)
      const MIN_WIDTH = 800;
      const MIN_HEIGHT = 600;

      if (metadata.width < MIN_WIDTH || metadata.height < MIN_HEIGHT) {
        return {
          valid: false,
          reason: `Image resolution ${metadata.width}x${metadata.height} is below minimum required ${MIN_WIDTH}x${MIN_HEIGHT}`,
          metadata: {
            width: metadata.width,
            height: metadata.height,
            format: metadata.format
          }
        };
      }

      // Extract EXIF data if available
      let exifData = null;
      if (metadata.exif) {
        try {
          const exif = await sharp(imageBuffer).metadata();
          exifData = {
            dateTime: exif.exif?.DateTime,
            gpsLatitude: exif.exif?.GPSLatitude,
            gpsLongitude: exif.exif?.GPSLongitude,
            make: exif.exif?.Make,
            model: exif.exif?.Model
          };
        } catch (exifError) {
          // EXIF extraction failed, continue without it
          console.warn('EXIF extraction failed:', exifError.message);
        }
      }

      return {
        valid: true,
        metadata: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
          size: metadata.size,
          hasAlpha: metadata.hasAlpha,
          orientation: metadata.orientation
        },
        exif: exifData
      };

    } catch (error) {
      throw new Error(`Photo validation failed: ${error.message}`);
    }
  }

  /**
   * Process email attachment
   */
  async processEmailAttachment(claimId, attachment) {
    const documentId = uuidv4();
    const s3Key = `claims/${claimId}/email-attachments/${documentId}/${attachment.filename}`;

    // Upload attachment to S3
    await this.s3.putObject({
      Bucket: this.bucketName,
      Key: s3Key,
      Body: Buffer.from(attachment.content, 'base64'),
      ContentType: attachment.contentType,
      ServerSideEncryption: 'AES256',
      Metadata: {
        claimId,
        documentType: 'EMAIL_ATTACHMENT',
        documentId,
        originalFilename: attachment.filename
      }
    }).promise();

    // If it's an image, validate quality
    if (attachment.contentType.startsWith('image/')) {
      const validation = await this.validatePhotoQuality(s3Key);
      return {
        documentId,
        s3Key,
        validation
      };
    }

    return {
      documentId,
      s3Key
    };
  }

  /**
   * Record document metadata in database
   */
  async recordDocumentMetadata(claimId, documentData) {
    const { Pool } = require('pg');
    const config = require('../../config/database.config');
    const pool = new Pool(config.postgres);

    const query = `
      INSERT INTO documents (
        document_id,
        claim_id,
        document_type,
        s3_bucket,
        s3_key,
        file_name,
        file_size_bytes,
        mime_type,
        uploaded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const values = [
      documentData.documentId,
      claimId,
      documentData.documentType,
      this.bucketName,
      documentData.s3Key,
      documentData.fileName,
      documentData.fileSize,
      documentData.mimeType,
      new Date().toISOString()
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }
}

module.exports = new UploadService();