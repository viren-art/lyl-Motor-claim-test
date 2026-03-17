const uploadService = require('../../../src/modules/upload/upload.service');
const AWS = require('aws-sdk');

// Mock AWS SDK
jest.mock('aws-sdk');

describe('Upload Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('TC-004: Low-resolution photo upload rejected', () => {
    it('should reject photo with resolution below 800x600', async () => {
      const mockS3 = {
        getObject: jest.fn().mockReturnValue({
          promise: jest.fn().mockResolvedValue({
            Body: Buffer.from('fake-image-data')
          })
        })
      };

      AWS.S3.mockImplementation(() => mockS3);

      // Mock sharp to return low resolution
      const sharp = require('sharp');
      sharp.mockReturnValue({
        metadata: jest.fn().mockResolvedValue({
          width: 640,
          height: 480,
          format: 'jpeg'
        })
      });

      const validation = await uploadService.validatePhotoQuality('test-s3-key');

      expect(validation.valid).toBe(false);
      expect(validation.reason).toContain('below minimum required');
      expect(validation.metadata.width).toBe(640);
      expect(validation.metadata.height).toBe(480);
    });
  });

  describe('TC-005: Oversized file rejected', () => {
    it('should reject file over 10MB', async () => {
      const oversizedFile = 11 * 1024 * 1024; // 11MB

      await expect(
        uploadService.generateUploadUrl(
          'test-claim-id',
          'PHOTO',
          'large-photo.jpg',
          oversizedFile,
          'image/jpeg'
        )
      ).rejects.toThrow('exceeds maximum allowed size');
    });
  });

  describe('TC-048: Invalid MIME type rejected', () => {
    it('should reject file with unsupported MIME type', async () => {
      await expect(
        uploadService.generateUploadUrl(
          'test-claim-id',
          'PHOTO',
          'document.docx',
          1024,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
      ).rejects.toThrow('MIME type');
    });
  });
});