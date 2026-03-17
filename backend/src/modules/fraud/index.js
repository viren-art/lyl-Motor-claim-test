const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../../database/connection');
const axios = require('axios');

const router = express.Router();

// Configuration
const TRIAGE_SERVICE_URL = process.env.TRIAGE_SERVICE_URL || 'http://localhost:8001';
const TRIAGE_TIMEOUT_MS = parseInt(process.env.TRIAGE_TIMEOUT_MS || '60000');

/**
 * Thai Motor Fraud Pattern Library
 * Synchronized with Python triage service patterns
 */
const FRAUD_PATTERNS = {
  staged_accident: {
    keywords_th: ['จงใจ', 'แอบ', 'ตั้งใจ', 'วางแผน', 'นัดหมาย'],
    keywords_en: ['staged', 'planned', 'arranged', 'intentional'],
    risk_weight: 35,
    description: 'Indicators of pre-arranged collision'
  },
  phantom_injury: {
    keywords_th: ['ไม่มีบาดแผล', 'ไม่เจ็บ', 'แต่งเรื่อง', 'อ้างว่า'],
    keywords_en: ['no visible injury', 'claims pain', 'exaggerated', 'phantom'],
    risk_weight: 25,
    description: 'Claimed injuries without physical evidence'
  },
  geographic_hotspot: {
    high_risk_provinces: ['สมุทรปราการ', 'ชลบุรี', 'ระยอง', 'นนทบุรี'],
    high_risk_districts: ['บางพลี', 'ศรีราชา', 'เมือง'],
    risk_weight: 15,
    description: 'Incident in known fraud hotspot area'
  },
  suspicious_timing: {
    indicators: ['late_night', 'early_morning', 'remote_location'],
    risk_weight: 10,
    description: 'Unusual time or location for incident'
  },
  multiple_claims_pattern: {
    indicators: ['frequent_claimant', 'same_vehicle_multiple', 'same_location_multiple'],
    risk_weight: 20,
    description: 'Pattern of repeated claims'
  },
  inflated_damages: {
    keywords_th: ['ทั้งคัน', 'เสียหมด', 'ซ่อมใหม่ทั้งหมด'],
    keywords_en: ['total loss', 'complete damage', 'entire vehicle'],
    risk_weight: 15,
    description: 'Damage description inconsistent with incident severity'
  },
  third_party_collusion: {
    keywords_th: ['รู้จัก', 'เพื่อน', 'คนรู้จัก', 'ญาติ'],
    keywords_en: ['acquaintance', 'friend', 'relative', 'known'],
    risk_weight: 25,
    description: 'Relationship between parties suggests collusion'
  }
};

/**
 * Calculate local fraud risk score (Node.js implementation)
 * Used for quick pre-screening before calling Python triage service
 */
function calculateQuickFraudScore(narrative, address, injuriesReported, incidentDate) {
  let riskScore = 0;
  const indicators = [];
  
  const narrativeLower = narrative.toLowerCase();
  
  // Check staged accident patterns
  let stagedMatches = 0;
  FRAUD_PATTERNS.staged_accident.keywords_th.forEach(keyword => {
    if (narrative.includes(keyword)) stagedMatches++;
  });
  FRAUD_PATTERNS.staged_accident.keywords_en.forEach(keyword => {
    if (narrativeLower.includes(keyword)) stagedMatches++;
  });
  
  if (stagedMatches >= 2) {
    indicators.push({
      type: 'staged_accident',
      description: FRAUD_PATTERNS.staged_accident.description,
      evidence: `Found ${stagedMatches} suspicious keywords`,
      risk_contribution: FRAUD_PATTERNS.staged_accident.risk_weight
    });
    riskScore += FRAUD_PATTERNS.staged_accident.risk_weight;
  }
  
  // Check phantom injury
  if (injuriesReported) {
    let phantomMatches = 0;
    FRAUD_PATTERNS.phantom_injury.keywords_th.forEach(keyword => {
      if (narrative.includes(keyword)) phantomMatches++;
    });
    FRAUD_PATTERNS.phantom_injury.keywords_en.forEach(keyword => {
      if (narrativeLower.includes(keyword)) phantomMatches++;
    });
    
    if (phantomMatches >= 1) {
      indicators.push({
        type: 'phantom_injury',
        description: FRAUD_PATTERNS.phantom_injury.description,
        evidence: 'Injury claimed with suspicious language',
        risk_contribution: FRAUD_PATTERNS.phantom_injury.risk_weight
      });
      riskScore += FRAUD_PATTERNS.phantom_injury.risk_weight;
    }
  }
  
  // Check geographic hotspots
  if (address) {
    for (const province of FRAUD_PATTERNS.geographic_hotspot.high_risk_provinces) {
      if (address.includes(province)) {
        indicators.push({
          type: 'geographic_hotspot',
          description: FRAUD_PATTERNS.geographic_hotspot.description,
          evidence: `Incident in high-risk province: ${province}`,
          risk_contribution: FRAUD_PATTERNS.geographic_hotspot.risk_weight
        });
        riskScore += FRAUD_PATTERNS.geographic_hotspot.risk_weight;
        break;
      }
    }
  }
  
  // Check suspicious timing
  if (incidentDate) {
    try {
      const date = new Date(incidentDate);
      const hour = date.getHours();
      if (hour >= 22 || hour <= 5) {
        indicators.push({
          type: 'suspicious_timing',
          description: FRAUD_PATTERNS.suspicious_timing.description,
          evidence: `Incident at ${hour}:00 (late night/early morning)`,
          risk_contribution: FRAUD_PATTERNS.suspicious_timing.risk_weight
        });
        riskScore += FRAUD_PATTERNS.suspicious_timing.risk_weight;
      }
    } catch (e) {
      // Ignore date parsing errors
    }
  }
  
  return {
    riskScore: Math.min(riskScore, 100),
    indicators
  };
}

/**
 * POST /api/v1/fraud/quick-score
 * Quick fraud risk assessment without full triage
 */
router.post('/quick-score', async (req, res, next) => {
  const traceId = `frq_${uuidv4()}`;
  const startTime = Date.now();
  
  try {
    const { narrative, address, injuriesReported, incidentDate } = req.body;
    
    // Validate required fields
    if (!narrative) {
      return res.status(400).json({
        type: 'https://api.roojai.com/errors/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'Narrative is required for fraud scoring',
        instance: req.path,
        traceId
      });
    }
    
    const result = calculateQuickFraudScore(
      narrative,
      address || '',
      injuriesReported || false,
      incidentDate
    );
    
    const processingTime = Date.now() - startTime;
    
    res.json({
      riskScore: result.riskScore,
      indicators: result.indicators,
      processingTimeMs: processingTime,
      traceId
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/fraud/analyze
 * Full fraud analysis with pattern detection and historical checks
 */
router.post('/analyze', async (req, res, next) => {
  const traceId = `fra_${uuidv4()}`;
  const startTime = Date.now();
  
  try {
    const { claimId, policyNumber, narrative, vehicles, incidentDetails } = req.body;
    
    // Quick fraud score
    const quickScore = calculateQuickFraudScore(
      narrative,
      incidentDetails?.address,
      incidentDetails?.injuriesReported,
      incidentDetails?.date
    );
    
    // Check historical claims for this policy
    const historicalResult = await db.pool.query(
      `SELECT COUNT(*) as claim_count,
              MAX(created_at) as last_claim_date
       FROM claims
       WHERE policy_number = $1
         AND created_at > NOW() - INTERVAL '12 months'
         AND claim_id != $2`,
      [policyNumber, claimId]
    );
    
    const historicalClaims = parseInt(historicalResult.rows[0].claim_count);
    const lastClaimDate = historicalResult.rows[0].last_claim_date;
    
    // Add multiple claims pattern if applicable
    if (historicalClaims >= 2) {
      quickScore.indicators.push({
        type: 'multiple_claims_pattern',
        description: FRAUD_PATTERNS.multiple_claims_pattern.description,
        evidence: `${historicalClaims} claims in past 12 months`,
        risk_contribution: FRAUD_PATTERNS.multiple_claims_pattern.risk_weight
      });
      quickScore.riskScore = Math.min(
        quickScore.riskScore + FRAUD_PATTERNS.multiple_claims_pattern.risk_weight,
        100
      );
    }
    
    // Check for same vehicle multiple claims
    if (vehicles && vehicles.length > 0) {
      const insuredVehicle = vehicles.find(v => v.role === 'INSURED');
      if (insuredVehicle && insuredVehicle.license_plate) {
        const vehicleClaimsResult = await db.pool.query(
          `SELECT COUNT(*) as vehicle_claim_count
           FROM claims c
           JOIN vehicles v ON c.claim_id = v.claim_id
           WHERE v.license_plate = $1
             AND v.role = 'INSURED'
             AND c.created_at > NOW() - INTERVAL '6 months'
             AND c.claim_id != $2`,
          [insuredVehicle.license_plate, claimId]
        );
        
        const vehicleClaims = parseInt(vehicleClaimsResult.rows[0].vehicle_claim_count);
        if (vehicleClaims >= 1) {
          quickScore.indicators.push({
            type: 'multiple_claims_pattern',
            description: 'Same vehicle involved in multiple recent claims',
            evidence: `Vehicle ${insuredVehicle.license_plate} has ${vehicleClaims} claims in 6 months`,
            risk_contribution: 15
          });
          quickScore.riskScore = Math.min(quickScore.riskScore + 15, 100);
        }
      }
    }
    
    // Store fraud indicators in database
    for (const indicator of quickScore.indicators) {
      await db.pool.query(
        `INSERT INTO fraud_indicators (claim_id, indicator_type, indicator_value, confidence_score)
         VALUES ($1, $2, $3, $4)`,
        [
          claimId,
          indicator.type,
          indicator.evidence,
          indicator.risk_contribution / 100
        ]
      );
    }
    
    const processingTime = Date.now() - startTime;
    
    res.json({
      claimId,
      riskScore: quickScore.riskScore,
      indicators: quickScore.indicators,
      historicalContext: {
        claimsLast12Months: historicalClaims,
        lastClaimDate: lastClaimDate
      },
      processingTimeMs: processingTime,
      traceId
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/fraud/indicators/:claimId
 * Retrieve fraud indicators for a claim
 */
router.get('/indicators/:claimId', async (req, res, next) => {
  const { claimId } = req.params;
  const traceId = `fri_${uuidv4()}`;
  
  try {
    const result = await db.pool.query(
      `SELECT indicator_type, indicator_value, confidence_score, detected_at
       FROM fraud_indicators
       WHERE claim_id = $1
       ORDER BY detected_at DESC`,
      [claimId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        type: 'https://api.roojai.com/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `No fraud indicators found for claim ${claimId}`,
        instance: req.path,
        traceId
      });
    }
    
    res.json({
      claimId,
      indicators: result.rows.map(row => ({
        type: row.indicator_type,
        value: row.indicator_value,
        confidenceScore: parseFloat(row.confidence_score),
        detectedAt: row.detected_at
      })),
      traceId
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/fraud/patterns
 * Retrieve fraud pattern library (for admin/analyst use)
 */
router.get('/patterns', (req, res) => {
  res.json({
    patterns: Object.entries(FRAUD_PATTERNS).map(([key, value]) => ({
      id: key,
      ...value
    })),
    version: '1.0.0'
  });
});

module.exports = router;