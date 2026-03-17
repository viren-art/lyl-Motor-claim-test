export default function AuditLogPreview() {
  const [selectedClaim, setSelectedClaim] = useState('clm_7a8b9c0d1e2f');
  const [activeTab, setActiveTab] = useState('timeline');
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [showDetails, setShowDetails] = useState(null);

  const mockAuditEvents = [
    {
      eventId: 'evt_abc123',
      eventType: 'FNOL_SUBMITTED',
      eventTimestamp: '2026-01-15T14:30:00Z',
      processingTimeMs: 150,
      user: 'สมชาย ใจดี',
      userRole: 'Agent',
      rationale: 'Initial FNOL submission via chat',
      confidenceScore: null,
      inputSnapshot: {
        policyNumber: '1234567890',
        narrative: 'รถชนกันที่สี่แยกอโศก เวลา 14:00 น. รถฉันเสียหายด้านหน้า',
        injuriesReported: false
      },
      outputData: {
        claimId: 'clm_7a8b9c0d1e2f',
        status: 'INTAKE'
      }
    },
    {
      eventId: 'evt_def456',
      eventType: 'LLM_EXTRACTION',
      eventTimestamp: '2026-01-15T14:30:15Z',
      processingTimeMs: 2500,
      llmModelVersion: 'gpt-4-turbo',
      confidenceScore: 0.92,
      rationale: 'High confidence extraction of vehicle and incident details',
      evidenceQuotes: ['รถชนกันที่สี่แยกอโศก', 'เวลา 14:00 น.', 'รถฉันเสียหายด้านหน้า'],
      inputSnapshot: {
        narrative: 'รถชนกันที่สี่แยกอโศก เวลา 14:00 น. รถฉันเสียหายด้านหน้า'
      },
      outputData: {
        vehicles: [
          { role: 'INSURED', damageDescription: 'เสียหายด้านหน้า' }
        ],
        incidentLocation: { address: 'สี่แยกอโศก' },
        incidentTime: '14:00'
      }
    }
  ];

  return (
    <div>
      <h1>Audit Log Preview</h1>
    </div>
  );
}