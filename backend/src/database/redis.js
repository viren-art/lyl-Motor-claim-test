const redis = require('redis');

// Redis client configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

let client = null;

/**
 * Initialize Redis client
 */
async function initRedis() {
  if (client) {
    return client;
  }
  
  client = redis.createClient({
    url: REDIS_URL,
    password: REDIS_PASSWORD,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          console.error('Redis reconnection failed after 10 attempts');
          return new Error('Redis reconnection limit exceeded');
        }
        return Math.min(retries * 100, 3000);
      }
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
  
  await client.connect();
  
  return client;
}

/**
 * Get value from Redis
 */
async function get(key) {
  if (!client) {
    await initRedis();
  }
  
  try {
    return await client.get(key);
  } catch (error) {
    console.error(`Redis GET error for key ${key}:`, error);
    return null;
  }
}

/**
 * Set value in Redis with expiration
 */
async function setex(key, ttl, value) {
  if (!client) {
    await initRedis();
  }
  
  try {
    return await client.setEx(key, ttl, value);
  } catch (error) {
    console.error(`Redis SETEX error for key ${key}:`, error);
    throw error;
  }
}

/**
 * Delete key from Redis
 */
async function del(key) {
  if (!client) {
    await initRedis();
  }
  
  try {
    return await client.del(key);
  } catch (error) {
    console.error(`Redis DEL error for key ${key}:`, error);
    throw error;
  }
}

/**
 * Check if key exists
 */
async function exists(key) {
  if (!client) {
    await initRedis();
  }
  
  try {
    return await client.exists(key);
  } catch (error) {
    console.error(`Redis EXISTS error for key ${key}:`, error);
    return false;
  }
}

/**
 * Close Redis connection
 */
async function close() {
  if (client) {
    await client.quit();
    client = null;
  }
}

module.exports = {
  initRedis,
  get,
  setex,
  del,
  exists,
  close
};