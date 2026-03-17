export default function MissingFieldDetectionPreview() {
  const [activeTab, setActiveTab] = useState('extraction');
  const [showValidation, setShowValidation] = useState(false);
  const [processingState, setProcessingState] = useState('idle');

  const mockExtraction = {
    claimId: 'clm_7a8b9c0d1e2f',
    narrative: 'รถชนกันที่สี่แยกสุขุมวิท เวลาประมาณ 14:30 น. รถของผมเป็นโตโยต้า คัมรี่ สีขาว ถูกรถอีกคันชนด้านหลัง มีคนบาดเจ็บเล็กน้อย',
    extractedData: {
      policyNumber: 'unknown',
      summary: 'รถโตโยต้า คัมรี่ สีขาว ถูกชนด้านหลังที่สี่แยกสุขุมวิท เวลา 14:30 น. มีผู้บาดเจ็บเล็กน้อย',
      vehicles: [
        {
          role: 'INSURED',
          make: 'Toyota',
          model: 'Camry',
          color: 'White',
          licensePlate: 'unknown',
          vin: 'unknown',
          damageDescription: 'ด้านหลังรถเสียหาย',
        },
      ],
      incidentLocation: {
        address: 'สี่แยกสุขุมวิท',
        lat: null,
        lng: null,
      },
      incidentTime: '14:30',
      injuriesReported: true,
      policeReportFiled: 'unknown',
    },
    validation: {
      isValid: false,
      readyForTriage: false,
      criticalFieldsMissing: true,
      missingFields: [
        {
          fieldId: 'POLICY_NUMBER',
          key: 'policyNumber',
          displayNameTh: 'หมายเลขกรมธรรม์',
          displayNameEn: 'Policy Number',
          criticality: 'CRITICAL',
          currentValue: null,
        },
        {
          fieldId: 'INSURED_VEHICLE_LICENSE',
          key: 'vehicles[0].licensePlate',
          displayNameTh: 'ทะเบียนรถผู้เอาประกัน',
          displayNameEn: 'Insured Vehicle License Plate',
          criticality: 'HIGH',
          currentValue: null,
        },
        {
          fieldId: 'INSURED_VEHICLE_VIN',
          key: 'vehicles[0].vin',
          displayNameTh: 'หมายเลขตัวถังรถ',
          displayNameEn: 'Vehicle VIN',
          criticality: 'MEDIUM',
          currentValue: null,
        },
        {
          fieldId: 'POLICE_REPORT_STATUS',
          key: 'policeReportFiled',
          displayNameTh: 'สถานะการแจ้งความ',
          displayNameEn: 'Police Report Status',
          criticality: 'HIGH',
          conditional: true,
          currentValue: null,
        },
      ],
      summary: {
        critical: 1,
        high: 2,
        medium: 1,
      },
    },
    prioritizedMissingFields: [
      {
        fieldId: 'POLICY_NUMBER',
        displayNameTh: 'หมายเลขกรมธรรม์',
        displayNameEn: 'Policy Number',
        criticality: 'CRITICAL',
      },
      {
        fieldId: 'INSURED_VEHICLE_LICENSE',
        displayNameTh: 'ทะเบียนรถผู้เอาประกัน',
        displayNameEn: 'Insured Vehicle License Plate',
        criticality: 'HIGH',
      },
      {
        fieldId: 'POLICE_REPORT_STATUS',
        displayNameTh: 'สถานะการแจ้งความ',
        displayNameEn: 'Police Report Status',
        criticality: 'HIGH',
      },
    ],
    hallucinatedFields: [],
    confidenceScore: 0.45, // Adjusted down from 0.85 due to critical field missing
    confidenceAdjustment: {
      original: 0.85,
      adjusted: 0.45,
      reduction: 0.40,
      reason: 'Critical fields missing (1), confidence capped at 0.5',
    },
    processingTimeMs: 2847,
  };

  const handleRunExtraction = () => {
    setProcessingState('processing');
    setTimeout(() => {
      setProcessingState('complete');
      setShowValidation(true);
    }, 2000);
  };

  const getCriticalityColor = (criticality) => {
    switch (criticality) {
      case 'CRITICAL':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'HIGH':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'MEDIUM':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
      default:
        return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="sticky top-0 backdrop-blur-xl bg-zinc-900/80 border-b border-white/5 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <span className="text-xl">🔍</span>
              </div>
              <div>
                <h1 className="text-xl font-bold">Missing Field Detection</h1>
                <p className="text-xs text-zinc-400">LLM Extraction Validation & Gap Analysis</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Claim ID:</span>
              <span className="text-sm font-mono text-violet-400">{mockExtraction.claimId}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Confidence Score Adjustment Banner */}
        <div className="bg-gradient-to-r from-amber-500/10 to-rose-500/10 border border-amber-500/20 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl">⚠️</div>
            <div className="flex-1">
              <div className="font-semibold text-amber-400 mb-1">Confidence Score Adjusted</div>
              <div className="text-sm text-zinc-300 mb-2">
                {mockExtraction.confidenceAdjustment.reason}
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500">Original:</span>
                  <span className="font-mono text-zinc-400">{mockExtraction.confidenceAdjustment.original.toFixed(2)}</span>
                </div>
                <div className="text-zinc-600">→</div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500">Adjusted:</span>
                  <span className="font-mono text-rose-400 font-semibold">{mockExtraction.confidenceAdjustment.adjusted.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500">Reduction:</span>
                  <span className="font-mono text-amber-400">-{mockExtraction.confidenceAdjustment.reduction.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-white/5">
          <button
            onClick={() => setActiveTab('extraction')}
            className={`px-4 py-2 text-sm font-semibold rounded-t-xl transition-all ${
              activeTab === 'extraction'
                ? 'bg-violet-500/10 text-violet-400 border-b-2 border-violet-500'
                : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            📋 Extraction Results
          </button>
          <button
            onClick={() => setActiveTab('validation')}
            className={`px-4 py-2 text-sm font-semibold rounded-t-xl transition-all ${
              activeTab === 'validation'
                ? 'bg-violet-500/10 text-violet-400 border-b-2 border-violet-500'
                : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            ⚠️ Missing Fields
          </button>
        </div>

        {/* Content */}
        {activeTab === 'extraction' && (
          <div className="space-y-4">
            <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Extracted Data</h2>
              <pre className="text-xs text-zinc-400 overflow-auto">
                {JSON.stringify(mockExtraction.extractedData, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {activeTab === 'validation' && (
          <div className="space-y-4">
            <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Missing Fields</h2>
                <div className="text-xs text-zinc-500">
                  {mockExtraction.validation.summary.critical} Critical · {mockExtraction.validation.summary.high} High · {mockExtraction.validation.summary.medium} Medium
                </div>
              </div>
              <div className="space-y-3">
                {mockExtraction.prioritizedMissingFields.map((field) => (
                  <div
                    key={field.fieldId}
                    className={`p-4 rounded-lg border ${getCriticalityColor(field.criticality)}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{field.displayNameEn}</div>
                        <div className="text-sm text-zinc-400">{field.displayNameTh}</div>
                      </div>
                      <span className="text-xs font-mono px-2 py-1 rounded bg-black/20">
                        {field.criticality}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}