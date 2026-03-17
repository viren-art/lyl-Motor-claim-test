/**
 * Redis Cache Configuration
 * Manages question template caching with 15-minute TTL
 */

const redis = require('redis');
const { promisify } = require('util');

// Redis client configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || '900'); // 15 minutes
const CACHE_KEY_PREFIX = 'question_template:';

let client = null;
let getAsync = null;
let setAsync = null;
let delAsync = null;
let keysAsync = null;

/**
 * Initialize Redis client
 */
function initializeRedis() {
  if (client) {
    return client;
  }

  client = redis.createClient({
    url: REDIS_URL,
    retry_strategy: (options) => {
      if (options.error && options.error.code === 'ECONNREFUSED') {
        console.error('Redis connection refused');
        return new Error('Redis server refused connection');
      }
      if (options.total_retry_time > 1000 * 60 * 60) {
        return new Error('Redis retry time exhausted');
      }
      if (options.attempt > 10) {
        return undefined;
      }
      return Math.min(options.attempt * 100, 3000);
    }
  });

  client.on('error', (err) => {
    console.error('Redis client error:', err);
  });

  client.on('connect', () => {
    console.log('Redis client connected');
  });

  client.on('ready', () => {
    console.log('Redis client ready');
  });

  // Promisify Redis methods
  getAsync = promisify(client.get).bind(client);
  setAsync = promisify(client.set).bind(client);
  delAsync = promisify(client.del).bind(client);
  keysAsync = promisify(client.keys).bind(client);

  return client;
}

/**
 * Get question template from cache
 * @param {string} field - Field name (e.g., 'policyNumber', 'vehicles[0].licensePlate')
 * @returns {Promise<Object|null>} Cached template or null
 */
async function getQuestionTemplate(field) {
  try {
    if (!client) {
      initializeRedis();
    }

    const key = `${CACHE_KEY_PREFIX}${field}`;
    const cached = await getAsync(key);

    if (cached) {
      console.log(`Cache hit for template: ${field}`);
      return JSON.parse(cached);
    }

    console.log(`Cache miss for template: ${field}`);
    return null;
  } catch (error) {
    console.error(`Error getting template from cache: ${error.message}`);
    return null;
  }
}

/**
 * Set question template in cache
 * @param {string} field - Field name
 * @param {Object} template - Template object with th, en, context_needed
 * @returns {Promise<boolean>} Success status
 */
async function setQuestionTemplate(field, template) {
  try {
    if (!client) {
      initializeRedis();
    }

    const key = `${CACHE_KEY_PREFIX}${field}`;
    await setAsync(key, JSON.stringify(template), 'EX', CACHE_TTL_SECONDS);

    console.log(`Cached template: ${field} (TTL: ${CACHE_TTL_SECONDS}s)`);
    return true;
  } catch (error) {
    console.error(`Error setting template in cache: ${error.message}`);
    return false;
  }
}

/**
 * Invalidate specific question templates
 * @param {string[]} fields - Array of field names to invalidate
 * @returns {Promise<number>} Number of keys deleted
 */
async function invalidateTemplates(fields) {
  try {
    if (!client) {
      initializeRedis();
    }

    const keys = fields.map(field => `${CACHE_KEY_PREFIX}${field}`);
    const deleted = await delAsync(...keys);

    console.log(`Invalidated ${deleted} template(s): ${fields.join(', ')}`);
    return deleted;
  } catch (error) {
    console.error(`Error invalidating templates: ${error.message}`);
    return 0;
  }
}

/**
 * Invalidate all question templates
 * @returns {Promise<number>} Number of keys deleted
 */
async function invalidateAllTemplates() {
  try {
    if (!client) {
      initializeRedis();
    }

    const pattern = `${CACHE_KEY_PREFIX}*`;
    const keys = await keysAsync(pattern);

    if (keys.length === 0) {
      console.log('No templates to invalidate');
      return 0;
    }

    const deleted = await delAsync(...keys);
    console.log(`Invalidated all ${deleted} template(s)`);
    return deleted;
  } catch (error) {
    console.error(`Error invalidating all templates: ${error.message}`);
    return 0;
  }
}

/**
 * Get cache statistics
 * @returns {Promise<Object>} Cache statistics
 */
async function getCacheStats() {
  try {
    if (!client) {
      initializeRedis();
    }

    const pattern = `${CACHE_KEY_PREFIX}*`;
    const keys = await keysAsync(pattern);

    return {
      total_templates: keys.length,
      cache_ttl_seconds: CACHE_TTL_SECONDS,
      redis_url: REDIS_URL.replace(/:[^:]*@/, ':***@'), // Mask password
      connected: client.connected
    };
  } catch (error) {
    console.error(`Error getting cache stats: ${error.message}`);
    return {
      total_templates: 0,
      cache_ttl_seconds: CACHE_TTL_SECONDS,
      redis_url: REDIS_URL.replace(/:[^:]*@/, ':***@'),
      connected: false,
      error: error.message
    };
  }
}

/**
 * Close Redis connection
 */
function closeRedis() {
  if (client) {
    client.quit();
    client = null;
    console.log('Redis client closed');
  }
}

// Initialize on module load
initializeRedis();

module.exports = {
  initializeRedis,
  getQuestionTemplate,
  setQuestionTemplate,
  invalidateTemplates,
  invalidateAllTemplates,
  getCacheStats,
  closeRedis
};