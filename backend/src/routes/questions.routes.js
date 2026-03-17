/**
 * Questions API Routes
 * REST endpoints for clarifying questions generation
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/connection');
const { generateQuestions, getHealthStatus, getCircuitBreakerStatus, resetCircuitBreaker } = require('../modules/questions/integration');
const { invalidateTemplates, invalidateAllTemplates, getCacheStats } = require('../cache/redis-config');

const router = express.Router();

/**
 * POST /api/v1/claims/:claimId/questions/generate
 * Generate clarifying questions for missing fields
 */
router.post('/:claimId/questions/generate', async (req, res) => {
  const { claimId } = req.params;
  const traceId = `req_${uuidv4()}`;
  
  try {
    // Fetch claim from database
    const claimResult = await db.pool.query(
      `SELECT 
        claim_id, policy_number, language, narrative, 
        injuries_reported, police_report_filed, police_report_number,
        missing_fields, claim_context
       FROM claims 
       WHERE claim_id = $1`,
      [claimId]
    );
    
    if (claimResult.rows.length === 0) {
      return res.status(404).json({
        type: 'https://api.roojai.com/errors/claim-not-found',
        title: 'Claim Not Found',
        status: 404,
        detail: `Claim ${claimId} does not exist`,
        instance: req.path,
        traceId
      });
    }
    
    const claim = claimResult.rows[0];
    
    // Check if missing fields exist
    if (!claim.missing_fields || claim.missing_fields.length === 0) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/no-missing-fields',
        title: 'No Missing Fields',
        status: 400,
        detail: 'Claim has no missing fields requiring clarification',
        instance: req.path,
        traceId
      });
    }
    
    // Prepare claim context
    const claimContext = {
      narrative: claim.narrative,
      injuriesReported: claim.injuries_reported,
      policeReportFiled: claim.police_report_filed,
      policeReportNumber: claim.police_report_number,
      ...claim.claim_context
    };
    
    // Generate questions
    const result = await generateQuestions(
      claimId,
      claim.language,
      claim.missing_fields,
      claimContext
    );
    
    // Store questions in database
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Insert questions
      for (const question of result.data.questions) {
        await client.query(
          `INSERT INTO clarifying_questions 
           (claim_id, question_th, question_en, generation_rationale, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [claimId, question.question_th, question.question_en, question.generation_rationale]
        );
      }
      
      // Update claim status
      await client.query(
        `UPDATE claims 
         SET status = 'INTAKE', updated_at = NOW()
         WHERE claim_id = $1`,
        [claimId]
      );
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
    res.status(200).json({
      claimId,
      questions: result.data.questions,
      processingTimeMs: result.data.processing_time_ms,
      llmModelVersion: result.data.llm_model_version
    });
    
  } catch (error) {
    console.error(`[${traceId}] Error generating questions:`, error);
    
    res.status(500).json({
      type: 'https://api.roojai.com/errors/questions-generation-failed',
      title: 'Questions Generation Failed',
      status: 500,
      detail: error.message,
      instance: req.path,
      traceId
    });
  }
});

/**
 * GET /api/v1/claims/:claimId/questions
 * Retrieve clarifying questions for a claim
 */
router.get('/:claimId/questions', async (req, res) => {
  const { claimId } = req.params;
  const traceId = `req_${uuidv4()}`;
  
  try {
    const result = await db.pool.query(
      `SELECT 
        question_th, question_en, answer, answered_at, generation_rationale, created_at
       FROM clarifying_questions
       WHERE claim_id = $1
       ORDER BY created_at ASC`,
      [claimId]
    );
    
    res.status(200).json({
      claimId,
      questions: result.rows
    });
    
  } catch (error) {
    console.error(`[${traceId}] Error retrieving questions:`, error);
    
    res.status(500).json({
      type: 'https://api.roojai.com/errors/database-error',
      title: 'Database Error',
      status: 500,
      detail: error.message,
      instance: req.path,
      traceId
    });
  }
});

/**
 * POST /api/v1/claims/:claimId/questions/answers
 * Submit answers to clarifying questions
 */
router.post('/:claimId/questions/answers', async (req, res) => {
  const { claimId } = req.params;
  const { answers } = req.body;
  const traceId = `req_${uuidv4()}`;
  
  try {
    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/invalid-answers',
        title: 'Invalid Answers',
        status: 400,
        detail: 'Answers array is required and must not be empty',
        instance: req.path,
        traceId
      });
    }
    
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      
      // Update answers
      for (const answer of answers) {
        await client.query(
          `UPDATE clarifying_questions
           SET answer = $1, answered_at = NOW()
           WHERE claim_id = $2 AND question_th = $3`,
          [answer.answer, claimId, answer.questionTh]
        );
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
    // Check if all questions answered
    const questionsResult = await db.pool.query(
      `SELECT COUNT(*) as total, 
              COUNT(answer) as answered
       FROM clarifying_questions
       WHERE claim_id = $1`,
      [claimId]
    );
    
    const { total, answered } = questionsResult.rows[0];
    const allAnswered = parseInt(total) === parseInt(answered);
    
    res.status(200).json({
      claimId,
      answersSubmitted: answers.length,
      allQuestionsAnswered: allAnswered,
      readyForReExtraction: allAnswered
    });
    
  } catch (error) {
    console.error(`[${traceId}] Error submitting answers:`, error);
    
    res.status(500).json({
      type: 'https://api.roojai.com/errors/answer-submission-failed',
      title: 'Answer Submission Failed',
      status: 500,
      detail: error.message,
      instance: req.path,
      traceId
    });
  }
});

/**
 * GET /api/v1/questions/health
 * Health check for questions service
 */
router.get('/health', async (req, res) => {
  try {
    const health = await getHealthStatus();
    const circuitBreaker = getCircuitBreakerStatus();
    const cacheStats = await getCacheStats();
    
    res.status(200).json({
      status: health.status,
      questionsService: health,
      circuitBreaker,
      cache: cacheStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/v1/admin/questions/cache/invalidate
 * Invalidate question template cache (admin endpoint)
 */
router.post('/admin/cache/invalidate', async (req, res) => {
  const { cacheKeys } = req.body;
  const traceId = `req_${uuidv4()}`;
  
  try {
    let invalidatedCount;
    
    if (cacheKeys && cacheKeys.length > 0) {
      invalidatedCount = await invalidateTemplates(cacheKeys);
    } else {
      invalidatedCount = await invalidateAllTemplates();
    }
    
    res.status(200).json({
      invalidatedKeys: cacheKeys || ['all'],
      count: invalidatedCount,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`[${traceId}] Cache invalidation error:`, error);
    
    res.status(500).json({
      type: 'https://api.roojai.com/errors/cache-invalidation-failed',
      title: 'Cache Invalidation Failed',
      status: 500,
      detail: error.message,
      instance: req.path,
      traceId
    });
  }
});

/**
 * POST /api/v1/admin/questions/circuit-breaker/reset
 * Reset circuit breaker (admin endpoint)
 */
router.post('/admin/circuit-breaker/reset', (req, res) => {
  resetCircuitBreaker();
  
  res.status(200).json({
    message: 'Circuit breaker reset successfully',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;