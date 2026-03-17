-- ============================================================================
-- SLA METRICS TRACKING TABLES
-- ============================================================================

-- Create metric type enum
CREATE TYPE sla_metric_type AS ENUM (
  'INTAKE_SUMMARY',
  'ROUTING_DECISION',
  'EXTRACTION',
  'COVERAGE_CHECK',
  'QUESTION_GENERATION'
);

-- Create SLA metrics table (partitioned by month)
CREATE TABLE sla_metrics (
  id                BIGSERIAL,
  metric_id         VARCHAR(50) NOT NULL,
  metric_type       sla_metric_type NOT NULL,
  processing_time_ms INTEGER NOT NULL,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create unique index on metric_id
CREATE UNIQUE INDEX idx_sla_metrics_metric_id ON sla_metrics(metric_id);

-- Create indexes for queries
CREATE INDEX idx_sla_metrics_type_time ON sla_metrics(metric_type, created_at DESC);
CREATE INDEX idx_sla_metrics_created_at ON sla_metrics(created_at DESC);

-- Create SLA breaches table
CREATE TABLE sla_breaches (
  id                BIGSERIAL PRIMARY KEY,
  breach_id         VARCHAR(50) UNIQUE NOT NULL,
  metric_type       sla_metric_type NOT NULL,
  actual_ms         INTEGER NOT NULL,
  target_ms         INTEGER NOT NULL,
  exceedance_ms     INTEGER NOT NULL,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for breach queries
CREATE INDEX idx_sla_breaches_type_time ON sla_breaches(metric_type, created_at DESC);
CREATE INDEX idx_sla_breaches_created_at ON sla_breaches(created_at DESC);

-- ============================================================================
-- PARTITION MANAGEMENT FOR SLA METRICS
-- ============================================================================

-- Function to create monthly partition
CREATE OR REPLACE FUNCTION create_sla_metrics_partition(partition_date DATE)
RETURNS VOID AS $$
DECLARE
  partition_name TEXT;
  start_date DATE;
  end_date DATE;
BEGIN
  partition_name := 'sla_metrics_y' || TO_CHAR(partition_date, 'YYYY') || 'm' || TO_CHAR(partition_date, 'MM');
  start_date := DATE_TRUNC('month', partition_date);
  end_date := start_date + INTERVAL '1 month';
  
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF sla_metrics FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    start_date,
    end_date
  );
  
  RAISE NOTICE 'Created partition: %', partition_name;
END;
$$ LANGUAGE plpgsql;

-- Create initial partitions (current month + next 2 months)
SELECT create_sla_metrics_partition(CURRENT_DATE);
SELECT create_sla_metrics_partition(CURRENT_DATE + INTERVAL '1 month');
SELECT create_sla_metrics_partition(CURRENT_DATE + INTERVAL '2 months');

-- ============================================================================
-- SLA COMPLIANCE VIEWS
-- ============================================================================

-- View: Recent SLA metrics (last 24 hours)
CREATE OR REPLACE VIEW sla_metrics_recent AS
SELECT 
  metric_id,
  metric_type,
  processing_time_ms,
  metadata,
  created_at
FROM sla_metrics
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- View: SLA compliance summary by metric type
CREATE OR REPLACE VIEW sla_compliance_summary AS
SELECT 
  metric_type,
  COUNT(*) as total_count,
  AVG(processing_time_ms) as avg_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY processing_time_ms) as p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY processing_time_ms) as p99_ms,
  MIN(processing_time_ms) as min_ms,
  MAX(processing_time_ms) as max_ms
FROM sla_metrics
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY metric_type;

-- View: Recent SLA breaches
CREATE OR REPLACE VIEW sla_breaches_recent AS
SELECT 
  breach_id,
  metric_type,
  actual_ms,
  target_ms,
  exceedance_ms,
  metadata,
  created_at
FROM sla_breaches
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- ============================================================================
-- RETENTION POLICY FOR SLA METRICS
-- ============================================================================

-- Function to purge old SLA metrics (keep 90 days)
CREATE OR REPLACE FUNCTION purge_old_sla_metrics(retention_days INTEGER DEFAULT 90)
RETURNS TABLE(deleted_count BIGINT) AS $$
DECLARE
  cutoff_date TIMESTAMPTZ;
  result_count BIGINT;
BEGIN
  cutoff_date := NOW() - (retention_days || ' days')::INTERVAL;
  
  DELETE FROM sla_metrics
  WHERE created_at < cutoff_date;
  
  GET DIAGNOSTICS result_count = ROW_COUNT;
  
  RETURN QUERY SELECT result_count;
END;
$$ LANGUAGE plpgsql;

-- Function to purge old SLA breaches (keep 180 days for compliance)
CREATE OR REPLACE FUNCTION purge_old_sla_breaches(retention_days INTEGER DEFAULT 180)
RETURNS TABLE(deleted_count BIGINT) AS $$
DECLARE
  cutoff_date TIMESTAMPTZ;
  result_count BIGINT;
BEGIN
  cutoff_date := NOW() - (retention_days || ' days')::INTERVAL;
  
  DELETE FROM sla_breaches
  WHERE created_at < cutoff_date;
  
  GET DIAGNOSTICS result_count = ROW_COUNT;
  
  RETURN QUERY SELECT result_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE sla_metrics IS 'SLA performance metrics for all system operations';
COMMENT ON TABLE sla_breaches IS 'SLA breach events for alerting and compliance reporting';
COMMENT ON FUNCTION create_sla_metrics_partition IS 'Create monthly partition for SLA metrics table';
COMMENT ON FUNCTION purge_old_sla_metrics IS 'Purge SLA metrics older than retention period (default 90 days)';
COMMENT ON FUNCTION purge_old_sla_breaches IS 'Purge SLA breaches older than retention period (default 180 days)';