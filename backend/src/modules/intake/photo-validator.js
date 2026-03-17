const sharp = require('sharp');

/**
 * Validates photo quality (resolution, file size)
 * @param {Object} file - Multer file object
 * @returns {Object} - { valid: boolean, reason?: string }
 */
async function validatePhotoQuality(file) {
  try {
    // Check file size (max 10MB already enforced by multer, but double-check)
    if (file.size > 10 * 1024 * 1024) {
      return {
        valid: false,
        reason: 'File size exceeds 10MB limit'
      };
    }

    // For PDFs, skip resolution check
    if (file.mimetype === 'application/pdf') {
      return { valid: true };
    }

    // For images, check resolution using sharp
    const metadata = await sharp(file.buffer).metadata();
    const { width, height } = metadata;

    // Minimum resolution: 800x600
    if (width < 800 || height < 600) {
      return {
        valid: false,
        reason: `Image resolution ${width}x${height} is below minimum 800x600`
      };
    }

    // Optional: Check for extremely low quality (file size vs resolution ratio)
    const bytesPerPixel = file.size / (width * height);
    if (bytesPerPixel < 0.1) {
      return {
        valid: false,
        reason: 'Image quality too low (excessive compression detected)'
      };
    }

    return { valid: true };

  } catch (error) {
    return {
      valid: false,
      reason: `Image validation failed: ${error.message}`
    };
  }
}

module.exports = {
  validatePhotoQuality
};