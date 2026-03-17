const { v4: uuidv4 } = require('uuid');
const db = require('../database/connection');

/**
 * SLA Configuration
 */
const SLA_CONFIG = {
  INTAKE_SUMMARY_TARGET_MS: parseInt(process.env.SLA_INTAKE_SUMMARY_MS || '30000'),
  ROUTING_DECISION_TARGET_MS: parseInt(process.env.SLA_ROUTING_DECISION_MS || '60000'),
  P95_PERCENTILE: 0.95,
  P99_PERCENTILE: 0.99,
  ALERT_THRESHOLD_BREACH_COUNT: parseInt(process.env.SLA_ALERT_THRESHOLD || '5'),
  MONITORING_WINDOW_MINUTES: parseInt(process.env.SLA_MONITORING_WINDOW || '5')
};

/**
 * SLA Metric Types
 */
const METRIC_TYPES = {
  INTAKE_SUMMARY: 'INTAKE_SUMMARY',
  ROUTING_DECISION: 'ROUTING_DECISION',
  EXTRACTION: 'EXTRACTION',
  COVERAGE_CHECK: 'COVERAGE_CHECK',
  QUESTION_GENERATION: 'QUESTION_GENERATION'
};

/**
 * In-memory metrics buffer for real-time tracking
 */
class MetricsBuffer {
  constructor() {
    this.metrics = {
      [METRIC_TYPES.INTAKE_SUMMARY]: [],
      [METRIC_TYPES.ROUTING_DECISION]: [],
      [METRIC_TYPES.EXTRACTION]: [],
      [METRIC_TYPES.COVERAGE_CHECK]: [],
      [METRIC_TYPES.QUESTION_GENERATION]: []
    };
    this.maxBufferSize = 1000;
  }

  add(metricType, processingTimeMs, metadata = {}) {
    if (!this.metrics[metricType]) {
      this.metrics[metricType] = [];
    }

    this.metrics[metricType].push({
      timestamp: new Date(),
      processingTimeMs,
      metadata
    });

    // Keep buffer size manageable
    if (this.metrics[metricType].length > this.maxBufferSize) {
      this.metrics[metricType].shift();
    }
  }

  getMetrics(metricType, windowMinutes = 5) {
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
    return this.metrics[metricType].filter(m => m.timestamp > cutoff);
  }

  calculatePercentile(metricType, percentile, windowMinutes = 5) {
    const metrics = this.getMetrics(metricType, windowMinutes);
    if (metrics.length === 0) return null;

    const sorted = metrics.map(m => m.processingTimeMs).sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[index];
  }

  clear(metricType) {
    if (metricType) {
      this.metrics[metricType] = [];
    } else {
      Object.keys(this.metrics).forEach(key => {
        this.metrics[key] = [];
      });
    }
  }
}

const metricsBuffer = new MetricsBuffer();

/**
 * Track SLA metric
 */
async function trackSLAMetric(metricType, processingTimeMs, metadata = {}) {
  const metricId = `slm_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
  
  // Add to in-memory buffer
  metricsBuffer.add(metricType, processingTimeMs, metadata);
  
  // Persist to database for historical analysis
  try {
    await db.pool.query(
      `INSERT INTO sla_metrics 
       (metric_id, metric_type, processing_time_ms, metadata, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [metricId, metricType, processingTimeMs, JSON.stringify(metadata)]
    );
  } catch (error) {
    console.error('[SLA TRACKING ERROR]', { metricId, error: error.message });
  }
  
  // Check for SLA breach
  const target = metricType === METRIC_TYPES.INTAKE_SUMMARY 
    ? SLA_CONFIG.INTAKE_SUMMARY_TARGET_MS 
    : SLA_CONFIG.ROUTING_DECISION_TARGET_MS;
  
  if (processingTimeMs > target) {
    await handleSLABreach(metricType, processingTimeMs, target, metadata);
  }
  
  return metricId;
}

/**
 * Handle SLA breach
 */
async function handleSLABreach(metricType, actualMs, targetMs, metadata) {
  const breachId = `slb_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
  
  console.warn('[SLA BREACH]', {
    breachId,
    metricType,
    actualMs,
    targetMs,
    exceedanceMs: actualMs - targetMs,
    metadata
  });
  
  // Record breach
  try {
    await db.pool.query(
      `INSERT INTO sla_breaches 
       (breach_id, metric_type, actual_ms, target_ms, exceedance_ms, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [breachId, metricType, actualMs, targetMs, actualMs - targetMs, JSON.stringify(metadata)]
    );
  } catch (error) {
    console.error('[SLA BREACH RECORDING ERROR]', { breachId, error: error.message });
  }
  
  // Check if alert threshold reached
  const recentBreaches = await getRecentBreachCount(metricType, SLA_CONFIG.MONITORING_WINDOW_MINUTES);
  if (recentBreaches >= SLA_CONFIG.ALERT_THRESHOLD_BREACH_COUNT) {
    await sendSLAAlert(metricType, recentBreaches, actualMs, targetMs);
  }
}

/**
 * Get recent breach count
 */
async function getRecentBreachCount(metricType, windowMinutes) {
  try {
    const result = await db.pool.query(
      `SELECT COUNT(*) as breach_count
       FROM sla_breaches
       WHERE metric_type = $1
         AND created_at > NOW() - INTERVAL '${windowMinutes} minutes'`,
      [metricType]
    );
    return parseInt(result.rows[0].breach_count);
  } catch (error) {
    console.error('[BREACH COUNT ERROR]', error.message);
    return 0;
  }
}

/**
 * Send SLA alert
 */
async function sendSLAAlert(metricType, breachCount, actualMs, targetMs) {
  const alert = {
    timestamp: new Date().toISOString(),
    severity: 'CRITICAL',
    metricType,
    breachCount,
    actualMs,
    targetMs,
    message: `SLA breach threshold exceeded: ${breachCount} breaches in ${SLA_CONFIG.MONITORING_WINDOW_MINUTES} minutes`
  };
  
  console.error('[SLA ALERT]', JSON.stringify(alert, null, 2));
  
  // TODO: Integrate with PagerDuty/Slack
  // if (process.env.PAGERDUTY_INTEGRATION_KEY) {
  //   await sendPagerDutyAlert(alert);
  // }
}

/**
 * Get SLA compliance report
 */
async function getSLAComplianceReport(metricType, periodHours = 24) {
  const windowMinutes = SLA_CONFIG.MONITORING_WINDOW_MINUTES;
  
  // Get in-memory metrics for recent data
  const recentMetrics = metricsBuffer.getMetrics(metricType, windowMinutes);
  const p95 = metricsBuffer.calculatePercentile(metricType, SLA_CONFIG.P95_PERCENTILE, windowMinutes);
  const p99 = metricsBuffer.calculatePercentile(metricType, SLA_CONFIG.P99_PERCENTILE, windowMinutes);
  
  // Get historical data from database
  const historicalResult = await db.pool.query(
    `SELECT 
       COUNT(*) as total_count,
       AVG(processing_time_ms) as avg_ms,
       MIN(processing_time_ms) as min_ms,
       MAX(processing_time_ms) as max_ms,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_time_ms) as p95_ms,
       PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY processing_time_ms) as p99_ms
     FROM sla_metrics
     WHERE metric_type = $1
       AND created_at > NOW() - INTERVAL '${periodHours} hours'`,
    [metricType]
  );
  
  const breachResult = await db.pool.query(
    `SELECT COUNT(*) as breach_count
     FROM sla_breaches
     WHERE metric_type = $1
       AND created_at > NOW() - INTERVAL '${periodHours} hours'`,
    [metricType]
  );
  
  const target = metricType === METRIC_TYPES.INTAKE_SUMMARY 
    ? SLA_CONFIG.INTAKE_SUMMARY_TARGET_MS 
    : SLA_CONFIG.ROUTING_DECISION_TARGET_MS;
  
  const totalCount = parseInt(historicalResult.rows[0].total_count);
  const breachCount = parseInt(breachResult.rows[0].breach_count);
  const complianceRate = totalCount > 0 ? ((totalCount - breachCount) / totalCount) * 100 : 100;
  
  return {
    metricType,
    periodHours,
    target,
    recentWindow: {
      windowMinutes,
      sampleCount: recentMetrics.length,
      p95: p95 || 0,
      p99: p99 || 0
    },
    historical: {
      totalCount,
      avgMs: parseFloat(historicalResult.rows[0].avg_ms || 0),
      minMs: parseFloat(historicalResult.rows[0].min_ms || 0),
      maxMs: parseFloat(historicalResult.rows[0].max_ms || 0),
      p95Ms: parseFloat(historicalResult.rows[0].p95_ms || 0),
      p99Ms: parseFloat(historicalResult.rows[0].p99_ms || 0)
    },
    compliance: {
      breachCount,
      complianceRate: parseFloat(complianceRate.toFixed(2)),
      slaTarget: 95.0,
      meetsTarget: complianceRate >= 95.0
    }
  };
}

/**
 * Get real-time SLA dashboard data
 */
async function getSLADashboard() {
  const intakeReport = await getSLAComplianceReport(METRIC_TYPES.INTAKE_SUMMARY, 24);
  const routingReport = await getSLAComplianceReport(METRIC_TYPES.ROUTING_DECISION, 24);
  
  return {
    timestamp: new Date().toISOString(),
    intakeSummary: intakeReport,
    routingDecision: routingReport,
    overallHealth: {
      status: (intakeReport.compliance.meetsTarget && routingReport.compliance.meetsTarget) 
        ? 'HEALTHY' 
        : 'DEGRADED',
      intakeSLA: intakeReport.compliance.complianceRate,
      routingSLA: routingReport.compliance.complianceRate
    }
  };
}

module.exports = {
  trackSLAMetric,
  getSLAComplianceReport,
  getSLADashboard,
  metricsBuffer,
  METRIC_TYPES,
  SLA_CONFIG
};