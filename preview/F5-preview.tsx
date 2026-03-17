export default function PolicyValidationPreview() {
  const [activeTab, setActiveTab] = React.useState('validation');
  const [selectedClaim, setSelectedClaim] = React.useState(null);
  const [validationState, setValidationState] = React.useState('idle');
  const [showExclusionDetails, setShowExclusionDetails] = React.useState(null);

  const mockClaims = [
    {
      claimId: 'CLM-2025-001234',
      policyNumber: '1234567890',
      holderName: 'สมชาย ใจดี',
      incidentDate: '15 ม.ค. 2568',
      status: 'pending_validation',
      narrative: 'รถชนกันที่สี่แยกสุขุมวิท ความเสียหายที่กันชนหน้า',
      injuriesReported: false,
      policeReportFiled: true
    },
    {
      claimId: 'CLM-2025-001235',
      policyNumber: '9876543210',
      holderName: 'สุภาพ รักษ์ดี',
      incidentDate: '18 ม.ค. 2568',
      status: 'validated',
      narrative: 'รถถูกน้ำท่วมในช่วงฝนตก ความเสียหายที่เครื่องยนต์',
      injuriesReported: false,
      policeReportFiled: false
    },
    {
      claimId: 'CLM-2025-001236',
      policyNumber: '5555555555',
      holderName: 'วิชัย สมบูรณ์',
      incidentDate: '20 ม.ค. 2568',
      status: 'escalated',
      narrative: 'อุบัติเหตุชนท้าย มีผู้บาดเจ็บ 2 คน',
      injuriesReported: true,
      policeReportFiled: true
    }
  ];

  const mockValidationResults = {
    'CLM-2025-001234': {
      policyActive: true,
      coverageType: 'TYPE_1',
      deductibleAmountThb: 5000,
      effectiveDate: '1 ม.ค. 2568',
      expiryDate: '1 ม.ค. 2569',
      exclusions: [],
      requiredDocuments: [
        { type: 'POLICY', name: 'สำเนากรมธรรม์ประกันภัย', required: true, status: 'pending' },
        { type: 'LICENSE', name: 'สำเนาใบขับขี่', required: true, status: 'pending' },
        { type: 'POLICE_REPORT', name: 'รายงานตำรวจ', required: false, status: 'pending' },
        { type: 'REPAIR_QUOTE', name: 'ใบเสนอราคาซ่อม', required: true, status: 'pending' },
        { type: 'PHOTO', name: 'รูปถ่ายความเสียหาย', required: true, status: 'pending' }
      ],
      humanReviewRequired: false,
      processingTimeMs: 234
    },
    'CLM-2025-001235': {
      policyActive: true,
      coverageType: 'TYPE_2',
      deductibleAmountThb: 10000,
      effectiveDate: '1 มิ.ย. 2568',
      expiryDate: '1 มิ.ย. 2569',
      exclusions: [
        {
          type: 'FLOOD_DAMAGE',
          description: 'ความเสียหายจากน้ำท่วม (ไม่คุ้มครองในกรมธรรม์ประเภท 2+)',
          descriptionEn: 'Flood damage (not covered in Type 2+ policies)',
          severity: 'MEDIUM'
        }
      ],
      requiredDocuments: [
        { type: 'POLICY', name: 'สำเนากรมธรรม์ประกันภัย', required: true, status: 'uploaded' },
        { type: 'LICENSE', name: 'สำเนาใบขับขี่', required: true, status: 'uploaded' },
        { type: 'REPAIR_QUOTE', name: 'ใบเสนอราคาซ่อม', required: true, status: 'pending' },
        { type: 'PHOTO', name: 'รูปถ่ายความเสียหาย', required: true, status: 'uploaded' }
      ],
      humanReviewRequired: true,
      processingTimeMs: 189
    },
    'CLM-2025-001236': {
      policyActive: false,
      coverageType: 'TYPE_1',
      deductibleAmountThb: 5000,
      effectiveDate: '1 ม.ค. 2567',
      expiryDate: '1 ม.ค. 2568',
      exclusions: [],
      requiredDocuments: [],
      humanReviewRequired: true,
      processingTimeMs: 156,
      escalationReason: 'Policy is not active or has expired'
    }
  };

  const handleValidate = (claim) => {
    setSelectedClaim(claim);
    setValidationState('validating');
    
    setTimeout(() => {
      setValidationState('complete');
    }, 1500);
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending_validation: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'รอตรวจสอบ' },
      validated: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'ตรวจสอบแล้ว' },
      escalated: { bg: 'bg-rose-500/10', text: 'text-rose-400', label: 'ส่งต่อผู้เชี่ยวชาญ' }
    };
    const badge = badges[status] || badges.pending_validation;
    return (
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const getCoverageTypeBadge = (type) => {
    const types = {
      TYPE_1: { label: 'ประเภท 1', color: 'bg-violet-500/10 text-violet-400' },
      TYPE_2: { label: 'ประเภท 2+', color: 'bg-cyan-500/10 text-cyan-400' },
      TYPE_3: { label: 'ประเภท 3', color: 'bg-slate-500/10 text-slate-400' }
    };
    const badge = types[type] || types.TYPE_1;
    return (
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${badge.color}`}>
        {badge.label}
      </span>
    );
  };

  const getSeverityColor = (severity) => {
    return severity === 'HIGH' ? 'text-rose-400' : 'text-amber-400';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-slate-900 to-zinc-950">
      {/* Header */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-zinc-900/80 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-xl">
                🛡️
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Policy Validation System</h1>
                <p className="text-xs text-zinc-400">ระบบตรวจสอบกรมธรรม์และความคุ้มครอง</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-xs text-zinc-400">Active Policies</div>
                <div className="text-lg font-bold text-white">2,847</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('validation')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all ${
              activeTab === 'validation'
                ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/25'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10'
            }`}
          >
            📋 Validation Queue
          </button>
          <button
            onClick={() => setActiveTab('coverage')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all ${
              activeTab === 'coverage'
                ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/25'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10'
            }`}
          >
            🔍 Coverage Details
          </button>
          <button
            onClick={() => setActiveTab('exclusions')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all ${
              activeTab === 'exclusions'
                ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/25'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10'
            }`}
          >
            ⚠️ Exclusions
          </button>
        </div>

        {/* Validation Queue Tab */}
        {activeTab === 'validation' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Claims List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">Claims Pending Validation</h2>
                <span className="text-sm text-zinc-400">{mockClaims.length} claims</span>
              </div>
              
              {mockClaims.map((claim) => (
                <div
                  key={claim.claimId}
                  className="bg-zinc-800/50 rounded-2xl p-5 border border-white/[0.06] shadow-lg shadow-black/20 hover:border-violet-500/30 transition-all cursor-pointer"
                  onClick={() => handleValidate(claim)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-sm font-semibold text-white mb-1">{claim.claimId}</div>
                      <div className="text-xs text-zinc-400">Policy: {claim.policyNumber}</div>
                    </div>
                    {getStatusBadge(claim.status)}
                  </div>
                  
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-zinc-500">👤</span>
                      <span className="text-zinc-300">{claim.holderName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-zinc-500">📅</span>
                      <span className="text-zinc-300">{claim.incidentDate}</span>
                    </div>
                  </div>
                  
                  <div className="text-xs text-zinc-400 bg-white/5 rounded-lg p-3 mb-3">
                    {claim.narrative}
                  </div>
                  
                  <div className="flex gap-2">
                    {claim.injuriesReported && (
                      <span className="inline-flex items-center gap-1 text-xs text-rose-400">
                        🏥 มีผู้บาดเจ็บ
                      </span>
                    )}
                    {claim.policeReportFiled && (
                      <span className="inline-flex items-center gap-1 text-xs text-cyan-400">
                        👮 แจ้งตำรวจ
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Validation Results */}
            <div>
              {!selectedClaim ? (
                <div className="bg-zinc-800/50 rounded-2xl p-8 border border-white/[0.06] shadow-lg shadow-black/20 text-center">
                  <div className="text-6xl mb-4">🔍</div>
                  <div className="text-lg font-semibold text-white mb-2">Select a Claim</div>
                  <div className="text-sm text-zinc-400">Click on a claim to validate policy and coverage</div>
                </div>
              ) : validationState === 'validating' ? (
                <div className="bg-zinc-800/50 rounded-2xl p-8 border border-white/[0.06] shadow-lg shadow-black/20 text-center">
                  <div className="text-6xl mb-4 animate-pulse">⏳</div>
                  <div className="text-lg font-semibold text-white mb-2">Validating Policy...</div>
                  <div className="text-sm text-zinc-400">Checking core system and coverage rules</div>
                  <div className="mt-6 w-full bg-white/5 rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-violet-500 to-purple-600 animate-pulse" style={{ width: '60%' }}></div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-zinc-800/50 rounded-2xl p-5 border border-white/[0.06] shadow-lg shadow-black/20">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-white">Validation Results</h3>
                      <span className="text-xs text-zinc-500">
                        {mockValidationResults[selectedClaim.claimId].processingTimeMs}ms
                      </span>
                    </div>

                    {mockValidationResults[selectedClaim.claimId].policyActive ? (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mb-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">✅</span>
                          <span className="text-sm font-semibold text-emerald-400">Policy Active</span>
                        </div>
                        <div className="text-xs text-emerald-300/70">
                          Valid from {mockValidationResults[selectedClaim.claimId].effectiveDate} to {mockValidationResults[selectedClaim.claimId].expiryDate}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 mb-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">❌</span>
                          <span className="text-sm font-semibold text-rose-400">Policy Inactive</span>
                        </div>
                        <div className="text-xs text-rose-300/70">
                          {mockValidationResults[selectedClaim.claimId].escalationReason}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-white/5 rounded-xl p-3">
                        <div className="text-xs text-zinc-400 mb-1">Coverage Type</div>
                        {getCoverageTypeBadge(mockValidationResults[selectedClaim.claimId].coverageType)}
                      </div>
                      <div className="bg-white/5 rounded-xl p-3">
                        <div className="text-xs text-zinc-400 mb-1">Deductible</div>
                        <div className="text-lg font-bold text-white">
                          ฿{mockValidationResults[selectedClaim.claimId].deductibleAmountThb.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {mockValidationResults[selectedClaim.claimId].exclusions.length > 0 && (
                      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xl">⚠️</span>
                          <span className="text-sm font-semibold text-amber-400">
                            {mockValidationResults[selectedClaim.claimId].exclusions.length} Exclusion(s) Detected
                          </span>
                        </div>
                        {mockValidationResults[selectedClaim.claimId].exclusions.map((exclusion, idx) => (
                          <div key={idx} className="bg-white/5 rounded-lg p-3 mb-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-white">{exclusion.type}</span>
                              <span className={`text-xs font-medium ${getSeverityColor(exclusion.severity)}`}>
                                {exclusion.severity}
                              </span>
                            </div>
                            <div className="text-xs text-zinc-400">{exclusion.description}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {mockValidationResults[selectedClaim.claimId].humanReviewRequired && (
                      <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">👤</span>
                          <span className="text-sm font-semibold text-violet-400">Human Review Required</span>
                        </div>
                        <div className="text-xs text-violet-300/70 mt-1">
                          Claim escalated to adjuster for manual review
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Required Documents */}
                  {mockValidationResults[selectedClaim.claimId].requiredDocuments.length > 0 && (
                    <div className="bg-zinc-800/50 rounded-2xl p-5 border border-white/[0.06] shadow-lg shadow-black/20">
                      <h3 className="text-lg font-bold text-white mb-4">Required Documents</h3>
                      <div className="space-y-2">
                        {mockValidationResults[selectedClaim.claimId].requiredDocuments.map((doc, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-white/5 rounded-xl p-3">
                            <div className="flex items-center gap-3">
                              <span className="text-xl">📄</span>
                              <div>
                                <div className="text-sm font-medium text-white">{doc.name}</div>
                                <div className="text-xs text-zinc-400">
                                  {doc.required ? 'Required' : 'Optional'}
                                </div>
                              </div>
                            </div>
                            {doc.status === 'uploaded' ? (
                              <span className="text-emerald-400 text-xl">✓</span>
                            ) : (
                              <span className="text-zinc-600 text-xl">○</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Coverage Details Tab */}
        {activeTab === 'coverage' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
                <h2 className="text-xl font-bold text-white mb-6">Coverage Limits by Type</h2>
                
                <div className="space-y-4">
                  {/* Type 1 */}
                  <div className="bg-white/5 rounded-xl p-5 border border-violet-500/20">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center text-2xl">
                          🏆
                        </div>
                        <div>
                          <div className="text-lg font-bold text-white">ประเภท 1 (Comprehensive)</div>
                          <div className="text-xs text-zinc-400">Full coverage including own damage</div>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-zinc-900/50 rounded-lg p-3">
                        <div className="text-xs text-zinc-400 mb-1">Property Damage</div>
                        <div className="text-lg font-bold text-white">฿1,000,000</div>
                      </div>
                      <div className="bg-zinc-900/50 rounded-lg p-3">
                        <div className="text-xs text-zinc-400 mb-1">Bodily Injury (per person)</div>
                        <div className="text-lg font-bold text-white">฿100,000</div>
                      </div>
                      <div className="bg-zinc-900/50 rounded-lg p-3">
                        <div className="text-xs text-zinc-400 mb-1">Medical Expenses</div>
                        <div className="text-lg font-bold text-white">฿100,000</div>
                      </div>
                      <div className="bg-zinc-900/50 rounded-lg p-3">
                        <div className="text-xs text-zinc-400 mb-1">Bail Bond</div>
                        <div className="text-lg font-bold text-white">฿200,000</div>
                      </div>
                    </div>
                  </div>

                  {/* Type 2 */}
                  <div className="bg-white/5 rounded-xl p-5 border border-cyan-500/20">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center text-2xl">
                          🛡️
                        </div>
                        <div>
                          <div className="text-lg font-bold text-white">ประเภท 2+ (Third Party Plus)</div>
                          <div className="text-xs text-zinc-400">Third party + fire & theft</div>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-zinc-900/50 rounded-lg p-3">
                        <div className="text-xs text-zinc-400 mb-1">Property Damage</div>
                        <div className="text-lg font-bold text-white">฿500,000</div>
                      </div>
                      <div className="bg-zinc-900/50 rounded-lg p-3">
                        <div className="text-xs text-zinc-400 mb-1">Bodily Injury (per person)</div>
                        <div className="text-lg font-bold text-white">฿100,000</div>
                      </div>
                      <div className="bg-zinc-900/50 rounded-lg p-3">
                        <div className="text-xs text-zinc-400 mb-1">Medical Expenses</div>
                        <div className="text-lg font-bold text-white">฿50,000</div>
                      </div>
                      <div className="bg-zinc-900/50 rounded-lg p-3">
                        <div className="text-xs text-zinc-400 mb-1">Bail Bond</div>
                        <div className="text-lg font-bold text-white">฿200,000</div>
                      </div>
                    </div>
                  </div>

                  {/* Type 3 */}
                  <div className="bg-white/5 rounded-xl p-5 border border-slate-500/20">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-slate-500/20 flex items-center justify-center text-2xl">
                          🚗
                        </div>
                        <div>
                          <div className="text-lg font-bold text-white">ประเภท 3 (Third Party Only)</div>
                          <div className="text-xs text-zinc-400">Liability coverage only</div>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-zinc-900/50 rounded-lg p-3">
                        <div className="text-xs text-zinc-400 mb-1">Property Damage</div>
                        <div className="text-lg font-bold text-zinc-600">Not Covered</div>
                      </div>
                      <div className="bg-zinc-900/50 rounded-lg p-3">
                        <div className="text-xs text-zinc-400 mb-1">Bodily Injury (per person)</div>
                        <div className="text-lg font-bold text-white">฿100,000</div>
                      </div>
                      <div className="bg-zinc-900/50 rounded-lg p-3">
                        <div className="text-xs text-zinc-400 mb-1">Medical Expenses</div>
                        <div className="text-lg font-bold text-zinc-600">Not Covered</div>
                      </div>
                      <div className="bg-zinc-900/50 rounded-lg p-3">
                        <div className="text-xs text-zinc-400 mb-1">Bail Bond</div>
                        <div className="text-lg font-bold text-white">฿200,000</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-zinc-800/50 rounded-2xl p-5 border border-white/[0.06] shadow-lg shadow-black/20">
                <h3 className="text-lg font-bold text-white mb-4">Coverage Statistics</h3>
                <div className="space-y-3">
                  <div className="bg-white/5 rounded-xl p-4">
                    <div className="text-xs text-zinc-400 mb-1">Active Policies</div>
                    <div className="text-2xl font-bold text-white">2,847</div>
                    <div className="text-xs text-emerald-400 mt-1">↑ 12% this month</div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4">
                    <div className="text-xs text-zinc-400 mb-1">Avg. Validation Time</div>
                    <div className="text-2xl font-bold text-white">193ms</div>
                    <div className="text-xs text-cyan-400 mt-1">↓ 45ms faster</div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4">
                    <div className="text-xs text-zinc-400 mb-1">Cache Hit Rate</div>
                    <div className="text-2xl font-bold text-white">87.3%</div>
                    <div className="text-xs text-violet-400 mt-1">Optimal performance</div>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-800/50 rounded-2xl p-5 border border-white/[0.06] shadow-lg shadow-black/20">
                <h3 className="text-lg font-bold text-white mb-4">Quick Actions</h3>
                <div className="space-y-2">
                  <button className="w-full bg-violet-500 hover:bg-violet-600 text-white font-semibold py-3 px-4 rounded-xl transition-all">
                    🔄 Refresh Cache
                  </button>
                  <button className="w-full bg-white/5 hover:bg-white/10 text-white font-semibold py-3 px-4 rounded-xl transition-all">
                    📊 Export Report
                  </button>
                  <button className="w-full bg-white/5 hover:bg-white/10 text-white font-semibold py-3 px-4 rounded-xl transition-all">
                    ⚙️ Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Exclusions Tab */}
        {activeTab === 'exclusions' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
              <h2 className="text-xl font-bold text-white mb-6">Common Policy Exclusions</h2>
              
              <div className="space-y-3">
                {[
                  {
                    type: 'UNLICENSED_DRIVER',
                    icon: '🚫',
                    title: 'Unlicensed Driver',
                    titleTh: 'ผู้ขับขี่ไม่มีใบอนุญาต',
                    description: 'Driver without valid license or expired license at time of incident',
                    descriptionTh: 'ผู้ขับขี่ไม่มีใบอนุญาตขับขี่หรือใบขับขี่หมดอายุ',
                    severity: 'HIGH',
                    color: 'rose'
                  },
                  {
                    type: 'DUI',
                    icon: '🍺',
                    title: 'Driving Under Influence',
                    titleTh: 'ขับขี่ในสภาพมึนเมา',
                    description: 'Driver under influence of alcohol or drugs',
                    descriptionTh: 'ผู้ขับขี่อยู่ในอาการมึนเมาหรือเสพสิ่งเสพติด',
                    severity: 'HIGH',
                    color: 'rose'
                  },
                  {
                    type: 'FLOOD_DAMAGE',
                    icon: '🌊',
                    title: 'Flood Damage',
                    titleTh: 'ความเสียหายจากน้ำท่วม',
                    description: 'Damage caused by flooding (not covered in Type 2+ policies)',
                    descriptionTh: 'ความเสียหายจากน้ำท่วม (ไม่คุ้มครองในกรมธรรม์ประเภท 2+)',
                    severity: 'MEDIUM',
                    color: 'amber'
                  },
                  {
                    type: 'RACING',
                    icon: '🏁',
                    title: 'Racing or Speed Testing',
                    titleTh: 'การแข่งรถหรือทดสอบความเร็ว',
                    description: 'Vehicle used in racing, competition, or speed testing',
                    descriptionTh: 'การใช้รถในการแข่งขันหรือทดสอบความเร็ว',
                    severity: 'HIGH',
                    color: 'rose'
                  },
                  {
                    type: 'COMMERCIAL_USE',
                    icon: '🚕',
                    title: 'Commercial Use',
                    titleTh: 'การใช้เพื่อการพาณิชย์',
                    description: 'Vehicle used for commercial purposes (Type 1 covers private use only)',
                    descriptionTh: 'การใช้รถเพื่อการพาณิชย์ (กรมธรรม์ประเภท 1 คุ้มครองเฉพาะใช้ส่วนตัว)',
                    severity: 'MEDIUM',
                    color: 'amber'
                  },
                  {
                    type: 'WAR_TERRORISM',
                    icon: '💣',
                    title: 'War or Terrorism',
                    titleTh: 'สงครามหรือการก่อการร้าย',
                    description: 'Damage caused by war, civil unrest, or terrorism',
                    descriptionTh: 'ความเสียหายจากสงคราม จลาจล หรือการก่อการร้าย',
                    severity: 'HIGH',
                    color: 'rose'
                  }
                ].map((exclusion, idx) => (
                  <div
                    key={idx}
                    className={`bg-white/5 rounded-xl p-4 border border-${exclusion.color}-500/20 hover:border-${exclusion.color}-500/40 transition-all cursor-pointer`}
                    onClick={() => setShowExclusionDetails(showExclusionDetails === idx ? null : idx)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <span className="text-3xl">{exclusion.icon}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-white">{exclusion.titleTh}</span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-${exclusion.color}-500/10 text-${exclusion.color}-400`}>
                              {exclusion.severity}
                            </span>
                          </div>
                          <div className="text-xs text-zinc-400 mb-2">{exclusion.title}</div>
                          {showExclusionDetails === idx && (
                            <div className="mt-3 pt-3 border-t border-white/10">
                              <div className="text-sm text-zinc-300 mb-2">{exclusion.descriptionTh}</div>
                              <div className="text-xs text-zinc-500">{exclusion.description}</div>
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="text-zinc-600 text-sm">
                        {showExclusionDetails === idx ? '▼' : '▶'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gradient-to-br from-violet-500/10 to-purple-600/10 rounded-2xl p-6 border border-violet-500/20">
              <div className="flex items-start gap-3">
                <span className="text-3xl">💡</span>
                <div>
                  <div className="text-lg font-bold text-white mb-2">Automated Detection</div>
                  <div className="text-sm text-zinc-300 mb-3">
                    Our AI system automatically scans claim narratives and documents to detect potential exclusions. 
                    High-severity exclusions trigger immediate escalation to human adjusters for review.
                  </div>
                  <div className="text-xs text-violet-400">
                    Detection accuracy: 94.7% | False positive rate: 2.1%
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}