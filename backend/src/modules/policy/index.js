const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../../database/connection');
const coreSystemClient = require('../../integrations/core-system');
const redis = require('../../database/redis');

const router = express.Router();

// Configuration
const POLICY_CACHE_TTL = parseInt(process.env.POLICY_CACHE_TTL || '300'); // 5 minutes
const VALIDATION_TIMEOUT_MS = parseInt(process.env.VALIDATION_TIMEOUT_MS || '5000');

/**
 * Generate required documents checklist based on claim type
 */
function generateDocumentChecklist(claim, coverageType) {
  const documents = [];
  
  // Base documents for all claims
  documents.push({
    type: 'POLICY',
    name: 'สำเนากรมธรรม์ประกันภัย',
    nameEn: 'Insurance Policy Copy',
    required: true,
    description: 'สำเนากรมธรรม์ประกันภัยรถยนต์ที่ยังมีผลบังคับใช้'
  });
  
  documents.push({
    type: 'LICENSE',
    name: 'สำเนาใบขับขี่',
    nameEn: 'Driver License Copy',
    required: true,
    description: 'สำเนาใบอนุญาตขับขี่ของผู้ขับขี่ในขณะเกิดเหตุ'
  });
  
  // Police report for injury claims or if filed
  if (claim.injuries_reported || claim.police_report_filed) {
    documents.push({
      type: 'POLICE_REPORT',
      name: 'รายงานตำรวจ',
      nameEn: 'Police Report',
      required: claim.injuries_reported, // Required for injuries
      description: 'รายงานการเกิดอุบัติเหตุจากสถานีตำรวจ'
    });
  }
  
  // Medical records for injury claims
  if (claim.injuries_reported) {
    documents.push({
      type: 'MEDICAL_RECORDS',
      name: 'ใบรับรองแพทย์',
      nameEn: 'Medical Certificate',
      required: true,
      description: 'ใบรับรองแพทย์และใบเสร็จค่ารักษาพยาบาล'
    });
  }
  
  // Repair quote for property damage
  if (!claim.injuries_reported || coverageType === 'TYPE_1') {
    documents.push({
      type: 'REPAIR_QUOTE',
      name: 'ใบเสนอราคาซ่อม',
      nameEn: 'Repair Quotation',
      required: true,
      description: 'ใบเสนอราคาซ่อมจากอู่ซ่อมรถยนต์'
    });
  }
  
  // Photos always required
  documents.push({
    type: 'PHOTO',
    name: 'รูปถ่ายความเสียหาย',
    nameEn: 'Damage Photos',
    required: true,
    description: 'รูปถ่ายความเสียหายของรถยนต์อย่างน้อย 4 มุม'
  });
  
  // Third-party documents if applicable
  const hasThirdParty = claim.vehicles?.some(v => v.role === 'THIRD_PARTY');
  if (hasThirdParty) {
    documents.push({
      type: 'THIRD_PARTY_INFO',
      name: 'ข้อมูลคู่กรณี',
      nameEn: 'Third Party Information',
      required: true,
      description: 'ข้อมูลและเอกสารของคู่กรณี (ใบขับขี่, ทะเบียนรถ)'
    });
  }
  
  return documents;
}

/**
 * Check exclusions against claim attributes
 */
function checkExclusions(claim, policyData) {
  const exclusions = [];
  
  // Check driver license status (would come from extraction)
  if (claim.driver_unlicensed) {
    exclusions.push({
      type: 'UNLICENSED_DRIVER',
      description: 'ผู้ขับขี่ไม่มีใบอนุญาตขับขี่หรือใบขับขี่หมดอายุ',
      descriptionEn: 'Driver unlicensed or license expired',
      severity: 'HIGH'
    });
  }
  
  // Check flood damage (would come from extraction/narrative analysis)
  if (claim.narrative?.toLowerCase().includes('น้ำท่วม') || 
      claim.narrative?.toLowerCase().includes('flood')) {
    exclusions.push({
      type: 'FLOOD_DAMAGE',
      description: 'ความเสียหายจากน้ำท่วม (ไม่คุ้มครองในกรมธรรม์ประเภท 2+)',
      descriptionEn: 'Flood damage (not covered in Type 2+ policies)',
      severity: 'MEDIUM'
    });
  }
  
  // Check drunk driving indicators
  if (claim.narrative?.toLowerCase().includes('เมา') || 
      claim.narrative?.toLowerCase().includes('แอลกอฮอล์')) {
    exclusions.push({
      type: 'DUI',
      description: 'ผู้ขับขี่อยู่ในอาการมึนเมาหรือเสพสิ่งเสพติด',
      descriptionEn: 'Driver under influence of alcohol or drugs',
      severity: 'HIGH'
    });
  }
  
  // Check racing/competition
  if (claim.narrative?.toLowerCase().includes('แข่ง') || 
      claim.narrative?.toLowerCase().includes('racing')) {
    exclusions.push({
      type: 'RACING',
      description: 'การใช้รถในการแข่งขันหรือทดสอบความเร็ว',
      descriptionEn: 'Vehicle used in racing or speed testing',
      severity: 'HIGH'
    });
  }
  
  // Check commercial use (Type 1 only covers private use)
  if (policyData.coverage_type === 'TYPE_1' && 
      (claim.narrative?.toLowerCase().includes('รับจ้าง') || 
       claim.narrative?.toLowerCase().includes('commercial'))) {
    exclusions.push({
      type: 'COMMERCIAL_USE',
      description: 'การใช้รถเพื่อการพาณิชย์ (กรมธรรม์ประเภท 1 คุ้มครองเฉพาะใช้ส่วนตัว)',
      descriptionEn: 'Commercial use (Type 1 covers private use only)',
      severity: 'MEDIUM'
    });
  }
  
  return exclusions;
}

/**
 * POST /api/v1/claims/:claimId/validate-policy
 * Validate policy status and generate coverage checklist
 */
router.post('/:claimId/validate-policy', async (req, res) => {
  const { claimId } = req.params;
  const startTime = Date.now();
  const traceId = `val_${uuidv4()}`;
  
  try {
    // Fetch claim from database
    const claimResult = await db.pool.query(
      `SELECT c.*, 
              json_agg(json_build_object(
                'role', v.role,
                'license_plate', v.license_plate,
                'make', v.make,
                'model', v.model,
                'vin', v.vin
              )) FILTER (WHERE v.id IS NOT NULL) as vehicles
       FROM claims c
       LEFT JOIN vehicles v ON v.claim_id = c.claim_id
       WHERE c.claim_id = $1
       GROUP BY c.id`,
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
    
    if (!claim.policy_number) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/missing-policy-number',
        title: 'Missing Policy Number',
        status: 400,
        detail: 'Policy number must be extracted before validation',
        instance: req.path,
        traceId
      });
    }
    
    // Check cache first
    const cacheKey = `policy:${claim.policy_number}`;
    let policyData = await redis.get(cacheKey);
    
    if (policyData) {
      policyData = JSON.parse(policyData);
      console.log(`[${traceId}] Policy data retrieved from cache for ${claim.policy_number}`);
    } else {
      // Query core system stub
      try {
        policyData = await coreSystemClient.validatePolicy(claim.policy_number, {
          timeout: VALIDATION_TIMEOUT_MS,
          traceId
        });
        
        // Cache the result
        await redis.setex(cacheKey, POLICY_CACHE_TTL, JSON.stringify(policyData));
        console.log(`[${traceId}] Policy data cached for ${claim.policy_number}`);
      } catch (error) {
        console.error(`[${traceId}] Core system validation failed:`, error.message);
        
        // If core system is down, escalate to manual review
        return res.status(503).json({
          type: 'https://api.roojai.com/errors/core-system-unavailable',
          title: 'Core System Unavailable',
          status: 503,
          detail: 'Policy validation service temporarily unavailable. Claim escalated to manual review.',
          instance: req.path,
          traceId,
          escalated: true
        });
      }
    }
    
    // Check if policy is active
    if (!policyData.active) {
      // Update claim to require human review
      await db.pool.query(
        `UPDATE claims 
         SET human_review_required = true,
             status = 'ADJUSTER_REVIEW',
             updated_at = now()
         WHERE claim_id = $1`,
        [claimId]
      );
      
      // Create audit log entry
      await db.pool.query(
        `INSERT INTO audit_log (
          event_id, claim_id, event_type, rationale, 
          input_snapshot, event_timestamp
         ) VALUES ($1, $2, $3, $4, $5, now())`,
        [
          `evt_${uuidv4()}`,
          claimId,
          'COVERAGE_VALIDATED',
          'Policy inactive - escalated to adjuster review',
          JSON.stringify({ policyNumber: claim.policy_number, policyActive: false })
        ]
      );
      
      return res.status(200).json({
        claimId,
        policyNumber: claim.policy_number,
        policyActive: false,
        escalated: true,
        reason: 'Policy is not active or has expired',
        processingTimeMs: Date.now() - startTime,
        traceId
      });
    }
    
    // Check exclusions
    const exclusions = checkExclusions(claim, policyData);
    
    // Generate required documents
    const requiredDocuments = generateDocumentChecklist(claim, policyData.coverage_type);
    
    // Store coverage check results
    const coverageResult = await db.pool.query(
      `INSERT INTO coverage_checks (
        claim_id, policy_active, deductible_amount_thb,
        exclusions_apply, required_documents, verified_at
       ) VALUES ($1, $2, $3, $4, $5, now())
       RETURNING id`,
      [
        claimId,
        policyData.active,
        policyData.deductible_thb,
        exclusions.map(e => e.type),
        requiredDocuments.map(d => d.type)
      ]
    );
    
    // Update claim status
    const shouldEscalate = exclusions.some(e => e.severity === 'HIGH');
    
    await db.pool.query(
      `UPDATE claims 
       SET human_review_required = $1,
           status = CASE WHEN $1 THEN 'ADJUSTER_REVIEW' ELSE status END,
           updated_at = now()
       WHERE claim_id = $2`,
      [shouldEscalate, claimId]
    );
    
    // Create audit log entry
    await db.pool.query(
      `INSERT INTO audit_log (
        event_id, claim_id, event_type, rationale,
        input_snapshot, output_data, event_timestamp
       ) VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [
        `evt_${uuidv4()}`,
        claimId,
        'COVERAGE_VALIDATED',
        shouldEscalate ? 'High-severity exclusions detected' : 'Coverage validated successfully',
        JSON.stringify({ policyNumber: claim.policy_number }),
        JSON.stringify({
          policyActive: policyData.active,
          coverageType: policyData.coverage_type,
          deductible: policyData.deductible_thb,
          exclusionsCount: exclusions.length,
          documentsRequired: requiredDocuments.length
        })
      ]
    );
    
    const processingTime = Date.now() - startTime;
    
    console.log(`[${traceId}] Policy validation completed in ${processingTime}ms`);
    
    // Return validation results
    res.status(200).json({
      claimId,
      policyNumber: claim.policy_number,
      policyActive: policyData.active,
      coverageType: policyData.coverage_type,
      deductibleAmountThb: policyData.deductible_thb,
      effectiveDate: policyData.effective_date,
      expiryDate: policyData.expiry_date,
      exclusions: exclusions,
      requiredDocuments: requiredDocuments,
      humanReviewRequired: shouldEscalate,
      processingTimeMs: processingTime,
      traceId
    });
    
  } catch (error) {
    console.error(`[${traceId}] Policy validation error:`, error);
    
    res.status(500).json({
      type: 'https://api.roojai.com/errors/validation-failed',
      title: 'Policy Validation Failed',
      status: 500,
      detail: error.message,
      instance: req.path,
      traceId
    });
  }
});

/**
 * GET /api/v1/claims/:claimId/coverage
 * Retrieve coverage validation results
 */
router.get('/:claimId/coverage', async (req, res) => {
  const { claimId } = req.params;
  const traceId = `req_${uuidv4()}`;
  
  try {
    const result = await db.pool.query(
      `SELECT cc.*, c.policy_number, c.human_review_required
       FROM coverage_checks cc
       JOIN claims c ON c.claim_id = cc.claim_id
       WHERE cc.claim_id = $1
       ORDER BY cc.verified_at DESC
       LIMIT 1`,
      [claimId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        type: 'https://api.roojai.com/errors/coverage-not-found',
        title: 'Coverage Check Not Found',
        status: 404,
        detail: `No coverage validation found for claim ${claimId}`,
        instance: req.path,
        traceId
      });
    }
    
    const coverage = result.rows[0];
    
    res.status(200).json({
      claimId,
      policyNumber: coverage.policy_number,
      policyActive: coverage.policy_active,
      deductibleAmountThb: parseFloat(coverage.deductible_amount_thb),
      exclusionsApply: coverage.exclusions_apply,
      requiredDocuments: coverage.required_documents,
      verifiedAt: coverage.verified_at,
      humanReviewRequired: coverage.human_review_required
    });
    
  } catch (error) {
    console.error(`[${traceId}] Coverage retrieval error:`, error);
    
    res.status(500).json({
      type: 'https://api.roojai.com/errors/retrieval-failed',
      title: 'Coverage Retrieval Failed',
      status: 500,
      detail: error.message,
      instance: req.path,
      traceId
    });
  }
});

/**
 * POST /api/v1/admin/policy-cache/invalidate
 * Invalidate policy cache (admin endpoint)
 */
router.post('/admin/policy-cache/invalidate', async (req, res) => {
  const { policyNumbers } = req.body;
  const traceId = `adm_${uuidv4()}`;
  
  try {
    if (!Array.isArray(policyNumbers) || policyNumbers.length === 0) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/invalid-request',
        title: 'Invalid Request',
        status: 400,
        detail: 'policyNumbers must be a non-empty array',
        instance: req.path,
        traceId
      });
    }
    
    const invalidatedKeys = [];
    
    for (const policyNumber of policyNumbers) {
      const cacheKey = `policy:${policyNumber}`;
      await redis.del(cacheKey);
      invalidatedKeys.push(cacheKey);
    }
    
    console.log(`[${traceId}] Invalidated ${invalidatedKeys.length} policy cache entries`);
    
    res.status(200).json({
      invalidatedKeys,
      timestamp: new Date().toISOString(),
      traceId
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

module.exports = router;