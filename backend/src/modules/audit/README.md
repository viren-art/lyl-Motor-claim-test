# Audit Log Service

Immutable audit trail service with cryptographic hash-chain integrity for PDPA compliance.

## Features

- **Immutable Logging**: Append-only audit log with database-level update prevention
- **Hash Chain Integrity**: SHA-256 cryptographic linking between events for tamper detection
- **100% Decision Coverage**: All LLM extractions, routing decisions, and human escalations logged
- **PDPA Compliance**: Automated retention policy enforcement (7-year claim records, 3-year PII)
- **Fast Retrieval**: <2 second audit trail queries with cursor-based pagination
- **Temporal Partitioning**: Monthly partitions for efficient retention purge

## API Endpoints

### POST /api/v1/audit/log
Create new audit log entry with hash chain.

**Request:**
on
{
  "claimId": "clm_7a8b9c0d1e2f",
  "eventType": "LLM_EXTRACTION",
  "llmModelVersion": "gpt-4-turbo",
  "confidenceScore": 0.92,
  "rationale": "High confidence extraction of vehicle details",
  "inputSnapshot": {
    "narrative": "รถชนกันที่สี่แยกอโศก..."
  },
  "outputData": {
    "vehicles": [
      { "make": "Toyota", "model": "Camry" }
    ]
  },
  "evidenceQuotes": ["รถชนกันที่สี่แยกอโศก"],
  "processingTimeMs": 2500
}

**Response:**
on
{
  "eventId": "evt_abc123",
  "claimId": "clm_7a8b9c0d1e2f",
  "eventType": "LLM_EXTRACTION",
  "eventTimestamp": "2026-01-15T14:30:00.000Z",
  "hashChain": "a3f5b8c9d2e1f4a7b6c5d8e9f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0",
  "processingTimeMs": 15
}

### GET /api/v1/audit/claims/:claimId
Retrieve complete audit trail for a claim.

**Query Parameters:**
- `cursor` (optional): Pagination cursor (ISO 8601 timestamp)
- `limit` (optional): Results per page (default: 50)

**Response:**
on
{
  "claimId": "clm_7a8b9c0d1e2f",
  "events": [
    {
      "eventId": "evt_abc123",
      "eventType": "LLM_EXTRACTION",
      "llmModelVersion": "gpt-4-turbo",
      "confidenceScore": 0.92,
      "rationale": "High confidence extraction",
      "inputSnapshot": { "narrative": "..." },
      "outputData": { "vehicles": [...] },
      "evidenceQuotes": ["..."],
      "processingTimeMs": 2500,
      "eventTimestamp": "2026-01-15T14:30:00.000Z"
    }
  ],
  "pagination": {
    "nextCursor": "2026-01-15T14:25:00.000Z",
    "hasMore": true
  },
  "processingTimeMs": 150
}

### GET /api/v1/audit/claims/:claimId/verify
Verify hash chain integrity for a claim.

**Response:**
on
{
  "claimId": "clm_7a8b9c0d1e2f",
  "verification": {
    "valid": true,
    "message": "Hash chain integrity verified"
  },
  "processingTimeMs": 50
}

### GET /api/v1/audit/stats
Get audit log statistics (admin only).

**Response:**
on
{
  "eventTypeStats": [
    {
      "eventType": "LLM_EXTRACTION",
      "eventCount": 1250,
      "avgProcessingTimeMs": 2300,
      "lastEventTime": "2026-01-15T14:30:00.000Z"
    }
  ],
  "totalEvents": 5000,
  "oldestEvent": "2026-01-01T00:00:00.000Z",
  "generatedAt": "2026-01-15T14:35:00.000Z"
}

### DELETE /api/v1/audit/purge
Purge expired audit logs per PDPA retention policy (admin only).

**Request:**
on
{
  "retentionDays": 2555
}

**Response:**
on
{
  "purgedCount": 150,
  "cutoffDate": "2019-01-15T00:00:00.000Z",
  "retentionDays": 2555,
  "processingTimeMs": 5000
}

## Event Types

- `FNOL_SUBMITTED`: Initial claim submission
- `LLM_EXTRACTION`: LLM-powered data extraction
- `QUESTION_GENERATED`: Clarifying questions generated
- `COVERAGE_VALIDATED`: Policy coverage validation
- `TRIAGE_ROUTED`: Claim routing decision
- `HUMAN_ESCALATED`: Escalation to human review
- `CLAIM_UPDATED`: Manual claim updates

## Hash Chain Integrity

Each audit event includes a SHA-256 hash calculated from:
- Event ID
- Claim ID
- Event type
- Event timestamp
- Input snapshot
- Output data
- Previous event hash (or "GENESIS" for first event)

This creates an immutable chain where tampering with any event breaks the hash chain.

## Database Schema

### audit_log Table
- Partitioned by month for efficient retention purge
- Row-level security prevents updates/deletes
- Indexes on claim_id, event_type, timestamp
- GIN indexes on JSONB columns for queryability

### Automated Jobs
- **Partition Creation**: Creates next month's partition on 1st of each month
- **Retention Purge**: Deletes expired logs daily at 02:00 Bangkok time
- **Monthly Summary Refresh**: Updates materialized view daily at 03:00
- **Hash Chain Verification**: Weekly integrity check on Sundays at 04:00

## PDPA Compliance

- **100% Decision Coverage**: All LLM decisions logged with rationale
- **Immutability**: Database-level prevention of updates/deletes
- **Retention Enforcement**: Automated purge after 7 years (claim records) or 3 years (PII)
- **Audit Trail Completeness**: Input snapshots, output data, and evidence quotes stored
- **Hash Chain Integrity**: Cryptographic tamper detection

## Performance

- **Retrieval SLA**: <2 seconds for complete audit trail (NFR-008)
- **Pagination**: Cursor-based for efficient large result sets
- **Partitioning**: Monthly partitions reduce query scan time
- **Materialized Views**: Pre-aggregated statistics for fast reporting

## Usage Example

const { logAuditEvent, AUDIT_EVENT_TYPES } = require('./modules/audit');

// Log LLM extraction
await logAuditEvent({
  claimId: 'clm_7a8b9c0d1e2f',
  eventType: AUDIT_EVENT_TYPES.LLM_EXTRACTION,
  llmModelVersion: 'gpt-4-turbo',
  confidenceScore: 0.92,
  rationale: 'Extracted vehicle and incident details',
  inputSnapshot: { narrative: 'รถชนกันที่สี่แยกอโศก...' },
  outputData: { vehicles: [...] },
  evidenceQuotes: ['รถชนกันที่สี่แยกอโศก'],
  processingTimeMs: 2500
});

// Verify integrity
const verification = await verifyHashChain('clm_7a8b9c0d1e2f');
console.log(verification.valid); // true