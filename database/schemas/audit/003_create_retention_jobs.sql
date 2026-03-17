-- ============================================================================
-- AUTOMATED RETENTION POLICY JOBS
-- ============================================================================

-- Extension for pg_cron (scheduled jobs)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================================
-- JOB 1: Create next month's partition (runs on 1st of each month)
-- ============================================================================

SELECT cron.schedule(
  'create-audit-partition',
  '0 0 1 * *', -- At 00:00 on day 1 of every month
  $$
  SELECT create_audit_log_partition(NOW() + INTERVAL '1 month');
  $$
);

COMMENT ON EXTENSION pg_cron IS 'Automated partition creation for audit_log table';

-- ============================================================================
-- JOB 2: Purge expired audit logs (runs daily at 02:00)
-- ============================================================================

SELECT cron.schedule(
  'purge-expired-audit-logs',
  '0 2 * * *', -- At 02:00 every day
  $$
  SELECT purge_expired_audit_logs(2555); -- 7 years retention for claim records
  $$
);

-- ============================================================================
-- JOB 3: Refresh monthly summary materialized view (runs daily at 03:00)
-- ============================================================================

SELECT cron.schedule(
  'refresh-audit-monthly-summary',
  '0 3 * * *', -- At 03:00 every day
  $$
  SELECT refresh_audit_monthly_summary();
  $$
);

-- ============================================================================
-- JOB 4: Verify hash chain integrity (runs weekly on Sunday at 04:00)
-- ============================================================================

CREATE OR REPLACE FUNCTION verify_all_hash_chains()
RETURNS TABLE(claim_id VARCHAR, is_valid BOOLEAN, message TEXT) AS $$
DECLARE
  claim_record RECORD;
  verification_result RECORD;
BEGIN
  FOR claim_record IN
    SELECT DISTINCT audit_log.claim_id
    FROM audit_log
    WHERE event_timestamp > NOW() - INTERVAL '7 days'
  LOOP
    -- This would call the Node.js verification function
    -- For SQL-only implementation, we'll log the need for verification
    claim_id := claim_record.claim_id;
    is_valid := NULL; -- Requires application-level verification
    message := 'Verification pending - requires application service';
    RETURN NEXT;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule(
  'verify-hash-chains',
  '0 4 * * 0', -- At 04:00 on Sunday
  $$
  SELECT * FROM verify_all_hash_chains();
  $$
);

-- ============================================================================
-- MONITORING: Job execution history
-- ============================================================================

CREATE TABLE audit_retention_job_log (
  id SERIAL PRIMARY KEY,
  job_name VARCHAR(100) NOT NULL,
  execution_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL, -- 'SUCCESS', 'FAILED', 'PARTIAL'
  records_affected INTEGER,
  error_message TEXT,
  execution_duration_ms INTEGER
);

CREATE INDEX idx_retention_job_log_time ON audit_retention_job_log(execution_time DESC);

COMMENT ON TABLE audit_retention_job_log IS 'Execution history for automated retention and maintenance jobs';

-- Function to log job execution
CREATE OR REPLACE FUNCTION log_retention_job(
  p_job_name VARCHAR,
  p_status VARCHAR,
  p_records_affected INTEGER DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_duration_ms INTEGER DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO audit_retention_job_log (
    job_name,
    status,
    records_affected,
    error_message,
    execution_duration_ms
  ) VALUES (
    p_job_name,
    p_status,
    p_records_affected,
    p_error_message,
    p_duration_ms
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON audit_retention_job_log TO roojai_app;
GRANT INSERT ON audit_retention_job_log TO roojai_app;