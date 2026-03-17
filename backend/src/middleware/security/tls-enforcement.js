/**
 * Middleware to enforce TLS 1.3 and HTTPS
 */
function enforceTLS(req, res, next) {
  // Check if request is HTTPS
  if (!req.secure && req.get('x-forwarded-proto') !== 'https') {
    return res.status(403).json({
      type: 'https://api.roojai.com/errors/https-required',
      title: 'HTTPS Required',
      status: 403,
      detail: 'All API requests must use HTTPS with TLS 1.3',
      instance: req.path
    });
  }

  // Set security headers
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Content-Security-Policy', "default-src 'self'");

  next();
}

/**
 * Middleware to validate TLS version (requires reverse proxy configuration)
 * This is typically enforced at API Gateway/Load Balancer level
 */
function validateTLSVersion(req, res, next) {
  const tlsVersion = req.connection?.getPeerCertificate?.()?.version || 
                     req.get('x-forwarded-tls-version');

  // In production, API Gateway/ALB should reject TLS < 1.3
  // This is a secondary check
  if (tlsVersion && !tlsVersion.includes('TLSv1.3')) {
    return res.status(403).json({
      type: 'https://api.roojai.com/errors/tls-version-unsupported',
      title: 'TLS Version Unsupported',
      status: 403,
      detail: 'Only TLS 1.3 is supported. Please upgrade your client.',
      instance: req.path
    });
  }

  next();
}

module.exports = {
  enforceTLS,
  validateTLSVersion
};