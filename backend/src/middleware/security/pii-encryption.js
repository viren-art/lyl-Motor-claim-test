const crypto = require('crypto');

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

// In production, retrieve from AWS Secrets Manager
const ENCRYPTION_KEY = process.env.PII_ENCRYPTION_KEY 
  || crypto.randomBytes(KEY_LENGTH).toString('hex');

/**
 * Encrypts PII data using AES-256-GCM
 * @param {string} plaintext - Data to encrypt
 * @returns {string} - Encrypted data (base64 encoded: iv:authTag:ciphertext)
 */
async function encryptPII(plaintext) {
  if (!plaintext) return null;

  try {
    // Generate random IV for each encryption
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Create cipher
    const cipher = crypto.createCipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, 'hex'),
      iv
    );

    // Encrypt data
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Combine IV, auth tag, and ciphertext
    const combined = `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
    
    return combined;
  } catch (error) {
    console.error('PII Encryption Error:', error.message);
    throw new Error('Failed to encrypt PII data');
  }
}

/**
 * Decrypts PII data
 * @param {string} encryptedData - Encrypted data (base64 encoded: iv:authTag:ciphertext)
 * @returns {string} - Decrypted plaintext
 */
async function decryptPII(encryptedData) {
  if (!encryptedData) return null;

  try {
    // Split combined data
    const [ivBase64, authTagBase64, ciphertext] = encryptedData.split(':');
    
    if (!ivBase64 || !authTagBase64 || !ciphertext) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    // Create decipher
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, 'hex'),
      iv
    );

    // Set authentication tag
    decipher.setAuthTag(authTag);

    // Decrypt data
    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('PII Decryption Error:', error.message);
    throw new Error('Failed to decrypt PII data');
  }
}

/**
 * Masks PII for logging (shows last 4 characters only)
 * @param {string} data - Data to mask
 * @returns {string} - Masked data
 */
function maskPII(data) {
  if (!data || data.length <= 4) return '****';
  return '*'.repeat(data.length - 4) + data.slice(-4);
}

module.exports = {
  encryptPII,
  decryptPII,
  maskPII
};