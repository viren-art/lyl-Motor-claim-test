-- ============================================================================
-- AUDIT LOG TABLE WITH IMMUTABLE HASH CHAIN
-- ============================================================================

-- Create audit event type enum
CREATE TYPE audit_event_type AS ENUM (
  'FNOL_SUBMITTED',
  'LLM_EXTRACTION',
  'QUESTION_GENERATED',
  'COVERAGE_VALIDATED',
  'TRIAGE_ROUTED',
  'HUMAN_ESCALATED',
  'CLAIM_UPDATED'
);

-- Create main audit log table (partitioned by month)
CREATE TABLE audit_log (
  id                BIGSERIAL,
  event_id          VARCHAR(50) NOT NULL,
  claim_id          VARCHAR(50) NOT NULL,
  event_type        audit_event_type NOT NULL,
  
  -- Decision context
  llm_model_version VARCHAR(50),
  confidence_score  NUMERIC(3, 2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  rationale         TEXT,
  input_snapshot    JSONB,
  output_data       JSONB,
  evidence_quotes   TEXT[],
  
  -- Actor information
  user_id           VARCHAR(50),
  user_role         VARCHAR(50),
  
  -- Timing
  processing_time_ms INTEGER,
  event_timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Integrity
  hash_chain        VARCHAR(64) NOT NULL,
  
  PRIMARY KEY (id, event_timestamp)
) PARTITION BY RANGE (event_timestamp);

-- Create unique index on event_id across all partitions
CREATE UNIQUE INDEX idx_audit_log_event_id ON audit_log(event_id);

-- Create indexes for common queries
CREATE INDEX idx_audit_log_claim_id ON audit_log(claim_id, event_timestamp DESC);
CREATE INDEX idx_audit_log_event_type ON audit_log(event_type, event_timestamp DESC);
CREATE INDEX idx_audit_log_timestamp ON audit_log(event_timestamp DESC);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id) WHERE user_id IS NOT NULL;

-- Create GIN index for JSONB columns
CREATE INDEX idx_audit_log_input_snapshot ON audit_log USING GIN (input_snapshot);
CREATE INDEX idx_audit_log_output_data ON audit_log USING GIN (output_data);

-- ============================================================================
-- MONTHLY PARTITIONS (2026-2027)
-- ============================================================================

-- 2026 partitions
CREATE TABLE audit_log_y2026m01 PARTITION OF audit_log
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE audit_log_y2026m02 PARTITION OF audit_log
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE audit_log_y2026m03 PARTITION OF audit_log
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE audit_log_y2026m04 PARTITION OF audit_log
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE audit_log_y2026m05 PARTITION OF audit_log
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE audit_log_y2026m06 PARTITION OF audit_log
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

CREATE TABLE audit_log_y2026m07 PARTITION OF audit_log
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE audit_log_y2026m08 PARTITION OF audit_log
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE TABLE audit_log_y2026m09 PARTITION OF audit_log
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE TABLE audit_log_y2026m10 PARTITION OF audit_log
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

CREATE TABLE audit_log_y2026m11 PARTITION OF audit_log
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

CREATE TABLE audit_log_y2026m12 PARTITION OF audit_log
  FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- 2027 partitions
CREATE TABLE audit_log_y2027m01 PARTITION OF audit_log
  FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

CREATE TABLE audit_log_y2027m02 PARTITION OF audit_log
  FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');

CREATE TABLE audit_log_y2027m03 PARTITION OF audit_log
  FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');

CREATE TABLE audit_log_y2027m04 PARTITION OF audit_log
  FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');

CREATE TABLE audit_log_y2027m05 PARTITION OF audit_log
  FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');

CREATE TABLE audit_log_y2027m06 PARTITION OF audit_log
  FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');

CREATE TABLE audit_log_y2027m07 PARTITION OF audit_log
  FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');

CREATE TABLE audit_log_y2027m08 PARTITION OF audit_log
  FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');

CREATE TABLE audit_log_y2027m09 PARTITION OF audit_log
  FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');

CREATE TABLE audit_log_y2027m10 PARTITION OF audit_log
  FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');

CREATE TABLE audit_log_y2027m11 PARTITION OF audit_log
  FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');

CREATE TABLE audit_log_y2027m12 PARTITION OF audit_log
  FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

-- ============================================================================
-- ROW-LEVEL SECURITY FOR IMMUTABILITY
-- ============================================================================

-- Enable row-level security
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: Allow INSERT for all authenticated users
CREATE POLICY audit_log_insert_policy ON audit_log
  FOR INSERT
  WITH CHECK (true);

-- Policy: Allow SELECT for all authenticated users
CREATE POLICY audit_log_select_policy ON audit_log
  FOR SELECT
  USING (true);

-- Policy: DENY UPDATE (immutability enforcement)
CREATE POLICY audit_log_update_deny ON audit_log
  FOR UPDATE
  USING (false);

-- Policy: DENY DELETE except for retention purge role
CREATE POLICY audit_log_delete_deny ON audit_log
  FOR DELETE
  USING (false);

-- Create retention purge role (used by automated purge jobs)
CREATE ROLE audit_retention_purge;

-- Grant DELETE permission only to purge role
GRANT DELETE ON audit_log TO audit_retention_purge;

-- ============================================================================
-- TRIGGER: Prevent updates to audit log
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_audit_log_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log entries are immutable and cannot be updated';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutability_trigger
  BEFORE UPDATE ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_log_update();

-- ============================================================================
-- FUNCTION: Automated partition creation
-- ============================================================================

CREATE OR REPLACE FUNCTION create_audit_log_partition(partition_date DATE)
RETURNS void AS $$
DECLARE
  partition_name TEXT;
  start_date DATE;
  end_date DATE;
BEGIN
  -- Calculate partition boundaries
  start_date := DATE_TRUNC('month', partition_date);
  end_date := start_date + INTERVAL '1 month';
  
  -- Generate partition name
  partition_name := 'audit_log_y' || TO_CHAR(start_date, 'YYYY') || 'm' || TO_CHAR(start_date, 'MM');
  
  -- Create partition if it doesn't exist
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    start_date,
    end_date
  );
  
  RAISE NOTICE 'Created partition: %', partition_name;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Automated retention purge
-- ============================================================================

CREATE OR REPLACE FUNCTION purge_expired_audit_logs(retention_days INTEGER DEFAULT 2555)
RETURNS TABLE(partition_name TEXT, deleted_count BIGINT) AS $$
DECLARE
  cutoff_date TIMESTAMPTZ;
  partition_record RECORD;
  deleted_rows BIGINT;
BEGIN
  -- Calculate cutoff date
  cutoff_date := NOW() - (retention_days || ' days')::INTERVAL;
  
  RAISE NOTICE 'Purging audit logs older than: %', cutoff_date;
  
  -- Find partitions that are entirely before cutoff date
  FOR partition_record IN
    SELECT 
      schemaname || '.' || tablename AS full_name,
      tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename LIKE 'audit_log_y%'
      AND tablename < 'audit_log_y' || TO_CHAR(cutoff_date, 'YYYY') || 'm' || TO_CHAR(cutoff_date, 'MM')
  LOOP
    -- Drop entire partition if all data is expired
    EXECUTE format('DROP TABLE IF EXISTS %I', partition_record.tablename);
    
    RAISE NOTICE 'Dropped partition: %', partition_record.tablename;
    
    partition_name := partition_record.tablename;
    deleted_count := -1; -- Indicates entire partition dropped
    RETURN NEXT;
  END LOOP;
  
  -- For current partition, delete individual rows
  DELETE FROM audit_log
  WHERE event_timestamp < cutoff_date;
  
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  
  IF deleted_rows > 0 THEN
    partition_name := 'current_partition';
    deleted_count := deleted_rows;
    RETURN NEXT;
  END IF;
  
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant SELECT to application role
GRANT SELECT ON audit_log TO roojai_app;

-- Grant INSERT to application role
GRANT INSERT ON audit_log TO roojai_app;

-- Grant sequence usage for id generation
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO roojai_app;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE audit_log IS 'Immutable audit trail for all LLM decisions and claim processing events with cryptographic hash-chain integrity';
COMMENT ON COLUMN audit_log.hash_chain IS 'SHA-256 hash linking to previous event for tamper detection';
COMMENT ON COLUMN audit_log.input_snapshot IS 'Complete input data at time of decision (JSONB for queryability)';
COMMENT ON COLUMN audit_log.output_data IS 'LLM response or decision output (JSONB for queryability)';
COMMENT ON COLUMN audit_log.evidence_quotes IS 'Direct quotes from input supporting the decision';