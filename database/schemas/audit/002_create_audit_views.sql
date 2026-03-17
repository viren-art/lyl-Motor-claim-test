-- ============================================================================
-- AUDIT LOG VIEWS FOR REPORTING AND COMPLIANCE
-- ============================================================================

-- View: Recent audit events (last 7 days)
CREATE OR REPLACE VIEW audit_log_recent AS
SELECT 
  event_id,
  claim_id,
  event_type,
  llm_model_version,
  confidence_score,
  rationale,
  user_id,
  user_role,
  processing_time_ms,
  event_timestamp,
  hash_chain
FROM audit_log
WHERE event_timestamp > NOW() - INTERVAL '7 days'
ORDER BY event_timestamp DESC;

COMMENT ON VIEW audit_log_recent IS 'Recent audit events for operational monitoring (last 7 days)';

-- View: LLM decision summary
CREATE OR REPLACE VIEW audit_llm_decisions AS
SELECT 
  event_id,
  claim_id,
  event_type,
  llm_model_version,
  confidence_score,
  rationale,
  evidence_quotes,
  processing_time_ms,
  event_timestamp
FROM audit_log
WHERE event_type IN ('LLM_EXTRACTION', 'QUESTION_GENERATED', 'TRIAGE_ROUTED')
ORDER BY event_timestamp DESC;

COMMENT ON VIEW audit_llm_decisions IS 'All LLM-powered decisions with confidence scores and rationale';

-- View: Human escalation events
CREATE OR REPLACE VIEW audit_human_escalations AS
SELECT 
  event_id,
  claim_id,
  event_type,
  user_id,
  user_role,
  rationale,
  input_snapshot,
  output_data,
  event_timestamp
FROM audit_log
WHERE event_type = 'HUMAN_ESCALATED'
ORDER BY event_timestamp DESC;

COMMENT ON VIEW audit_human_escalations IS 'All claims escalated to human review with escalation reasons';

-- View: Daily audit statistics
CREATE OR REPLACE VIEW audit_daily_stats AS
SELECT 
  DATE(event_timestamp) AS audit_date,
  event_type,
  COUNT(*) AS event_count,
  AVG(processing_time_ms) AS avg_processing_time_ms,
  AVG(confidence_score) AS avg_confidence_score,
  COUNT(DISTINCT claim_id) AS unique_claims
FROM audit_log
WHERE event_timestamp > NOW() - INTERVAL '30 days'
GROUP BY DATE(event_timestamp), event_type
ORDER BY audit_date DESC, event_count DESC;

COMMENT ON VIEW audit_daily_stats IS 'Daily aggregated statistics for audit events (last 30 days)';

-- View: PDPA compliance report
CREATE OR REPLACE VIEW audit_pdpa_compliance AS
SELECT 
  DATE(event_timestamp) AS report_date,
  COUNT(*) AS total_events,
  COUNT(DISTINCT claim_id) AS total_claims,
  COUNT(*) FILTER (WHERE event_type = 'FNOL_SUBMITTED') AS fnol_submissions,
  COUNT(*) FILTER (WHERE event_type = 'LLM_EXTRACTION') AS llm_extractions,
  COUNT(*) FILTER (WHERE event_type = 'TRIAGE_ROUTED') AS triage_decisions,
  COUNT(*) FILTER (WHERE event_type = 'HUMAN_ESCALATED') AS human_escalations,
  COUNT(*) FILTER (WHERE input_snapshot IS NOT NULL) AS events_with_input_snapshot,
  COUNT(*) FILTER (WHERE output_data IS NOT NULL) AS events_with_output_data,
  COUNT(*) FILTER (WHERE hash_chain IS NOT NULL) AS events_with_hash_chain,
  ROUND(100.0 * COUNT(*) FILTER (WHERE hash_chain IS NOT NULL) / COUNT(*), 2) AS hash_chain_coverage_pct
FROM audit_log
WHERE event_timestamp > NOW() - INTERVAL '90 days'
GROUP BY DATE(event_timestamp)
ORDER BY report_date DESC;

COMMENT ON VIEW audit_pdpa_compliance IS 'PDPA compliance metrics showing audit trail completeness and integrity';

-- View: Low confidence decisions requiring review
CREATE OR REPLACE VIEW audit_low_confidence_decisions AS
SELECT 
  event_id,
  claim_id,
  event_type,
  llm_model_version,
  confidence_score,
  rationale,
  evidence_quotes,
  event_timestamp
FROM audit_log
WHERE event_type IN ('LLM_EXTRACTION', 'TRIAGE_ROUTED')
  AND confidence_score < 0.75
  AND event_timestamp > NOW() - INTERVAL '7 days'
ORDER BY confidence_score ASC, event_timestamp DESC;

COMMENT ON VIEW audit_low_confidence_decisions IS 'LLM decisions with confidence below threshold requiring human review';

-- ============================================================================
-- MATERIALIZED VIEW: Monthly audit summary (for performance)
-- ============================================================================

CREATE MATERIALIZED VIEW audit_monthly_summary AS
SELECT 
  DATE_TRUNC('month', event_timestamp) AS month,
  event_type,
  COUNT(*) AS event_count,
  COUNT(DISTINCT claim_id) AS unique_claims,
  AVG(processing_time_ms) AS avg_processing_time_ms,
  AVG(confidence_score) AS avg_confidence_score,
  MIN(event_timestamp) AS first_event,
  MAX(event_timestamp) AS last_event
FROM audit_log
GROUP BY DATE_TRUNC('month', event_timestamp), event_type
ORDER BY month DESC, event_count DESC;

CREATE UNIQUE INDEX idx_audit_monthly_summary ON audit_monthly_summary(month, event_type);

COMMENT ON MATERIALIZED VIEW audit_monthly_summary IS 'Pre-aggregated monthly statistics for fast reporting (refresh daily)';

-- Function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_audit_monthly_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY audit_monthly_summary;
  RAISE NOTICE 'Refreshed audit_monthly_summary at %', NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- GRANT PERMISSIONS ON VIEWS
-- ============================================================================

GRANT SELECT ON audit_log_recent TO roojai_app;
GRANT SELECT ON audit_llm_decisions TO roojai_app;
GRANT SELECT ON audit_human_escalations TO roojai_app;
GRANT SELECT ON audit_daily_stats TO roojai_app;
GRANT SELECT ON audit_pdpa_compliance TO roojai_app;
GRANT SELECT ON audit_low_confidence_decisions TO roojai_app;
GRANT SELECT ON audit_monthly_summary TO roojai_app;