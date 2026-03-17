const express = require('express');
const intakeController = require('./intake.controller');
const consentMiddleware = require('../../middleware/consent/consent.middleware');
const rateLimitMiddleware = require('../../middleware/rateLimit.middleware');

const router = express.Router();

/**
 * Chat FNOL submission endpoint
 * POST /api/v1/claims/fnol/chat
 */
router.post(
  '/chat',
  rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }), // 100 req/min
  intakeController.handleChatSubmission.bind(intakeController)
);

/**
 * Email FNOL submission endpoint
 * POST /api/v1/claims/fnol/email
 */
router.post(
  '/email',
  rateLimitMiddleware({ maxRequests: 50, windowMs: 60000 }), // 50 req/min
  intakeController.handleEmailSubmission.bind(intakeController)
);

/**
 * Web form FNOL submission endpoint
 * POST /api/v1/claims/fnol/form
 */
router.post(
  '/form',
  rateLimitMiddleware({ maxRequests: 100, windowMs: 60000 }),
  intakeController.handleFormSubmission.bind(intakeController)
);

module.exports = router;