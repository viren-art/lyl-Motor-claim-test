const rateLimit = require('express-rate-limit');

/**
 * Rate limiting middleware factory
 */
function createRateLimiter(options) {
  const { maxRequests = 100, windowMs = 60000 } = options;

  return rateLimit({
    windowMs,
    max: maxRequests,
    message: {
      type: 'https://api.roojai.com/errors/rate-limit-exceeded',
      title: 'Rate Limit Exceeded',
      status: 429,
      detail: `Too many requests. Maximum ${maxRequests} requests per ${windowMs / 1000} seconds allowed.`
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        type: 'https://api.roojai.com/errors/rate-limit-exceeded',
        title: 'Rate Limit Exceeded',
        status: 429,
        detail: `Too many requests. Please try again later.`,
        instance: req.path,
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
}

module.exports = createRateLimiter;