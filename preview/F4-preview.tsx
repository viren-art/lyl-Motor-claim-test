export default function ThaiQuestionsPreview() {
  const [activeTab, setActiveTab] = React.useState('generate');
  const [selectedClaim, setSelectedClaim] = React.useState(null);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [generatedQuestions, setGeneratedQuestions] = React.useState(null);
  const [showSuccess, setShowSuccess] = React.useState(false);

  const mockClaims = [
    {
      id: 'CLM-2024-001234',
      policyNumber: '1234567890',
      incidentDate: '2024-01-15 14:30',
      status: 'incomplete',
      missingFields: [
        { field: 'incidentLocation', criticality: 'CRITICAL', reason: 'Required for claim processing' },
        { field: 'vehicles[0].damageDescription', criticality: 'CRITICAL', reason: 'Needed for damage assessment' },
        { field: 'policeReportNumber', criticality: 'MEDIUM', reason: 'Required for third-party claims' }
      ],
      context: {
        narrative: 'รถชนกันที่สี่แยก มีรถอีกคันหนึ่งเบรกกะทันหัน',
        injuriesReported: false,
        policeReportFiled: true
      }
    },
    {
      id: 'CLM-2024-001235',
      policyNumber: '9876543210',
      incidentDate: '2024-01-16 09:15',
      status: 'incomplete',
      missingFields: [
        { field: 'vehicles[0].licensePlate', criticality: 'CRITICAL', reason: 'Vehicle identification required' },
        { field: 'vehicles[0].make', criticality: 'CRITICAL', reason: 'Vehicle details needed' },
        { field: 'vehicles[0].model', criticality: 'CRITICAL', reason: 'Vehicle details needed' }
      ],
      context: {
        narrative: 'เกิดอุบัติเหตุบนทางด่วน รถคันอื่นชนท้าย',
        injuriesReported: true,
        policeReportFiled: false
      }
    }
  ];

  const mockGeneratedQuestions = {
    'CLM-2024-001234': [
      {
        question_th: 'เกิดเหตุที่ไหนครับ/ค่ะ? (ถนน/แยก/จังหวัด หรือส่งพิกัด GPS)',
        question_en: 'Where did the accident occur? (street/intersection/province or GPS coordinates)',
        field: 'incidentLocation',
        generation_rationale: 'Critical field for claim processing and location verification'
      },
      {
        question_th: 'รถเสียหายตรงไหนบ้างครับ/ค่ะ? (เช่น กันชนหน้า, ประตูซ้าย, กระจก)',
        question_en: 'Which parts of the vehicle are damaged? (e.g., front bumper, left door, windshield)',
        field: 'vehicles[0].damageDescription',
        generation_rationale: 'Essential for damage assessment and repair estimation'
      },
      {
        question_th: 'มีเลขที่รายงานตำรวจไหมครับ/ค่ะ? (ถ้าแจ้งความแล้ว)',
        question_en: 'Do you have a police report number? (if reported)',
        field: 'policeReportNumber',
        generation_rationale: 'Required for third-party claims processing'
      }
    ],
    'CLM-2024-001235': [
      {
        question_th: 'ทะเบียนรถของคุณคืออะไรครับ/ค่ะ?',
        question_en: 'What is your vehicle\'s license plate number?',
        field: 'vehicles[0].licensePlate',
        generation_rationale: 'Critical for vehicle identification'
      },
      {
        question_th: 'รถของคุณยี่ห้ออะไรครับ/ค่ะ? (เช่น Toyota, Honda, Isuzu)',
        question_en: 'What is your vehicle\'s make? (e.g., Toyota, Honda, Isuzu)',
        field: 'vehicles[0].make',
        generation_rationale: 'Required vehicle information'
      },
      {
        question_th: 'รุ่นรถอะไรครับ/ค่ะ? (เช่น Camry, Civic, D-Max)',
        question_en: 'What is your vehicle\'s model? (e.g., Camry, Civic, D-Max)',
        field: 'vehicles[0].model',
        generation_rationale: 'Complete vehicle details needed'
      }
    ]
  };

  const handleGenerateQuestions = (claim) => {
    setSelectedClaim(claim);
    setIsGenerating(true);
    setShowSuccess(false);
    
    setTimeout(() => {
      setGeneratedQuestions(mockGeneratedQuestions[claim.id]);
      setIsGenerating(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }, 1500);
  };

  const handleClearSelection = () => {
    setSelectedClaim(null);
    setGeneratedQuestions(null);
    setShowSuccess(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-slate-900 to-zinc-950">
      {/* Header */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-zinc-900/80 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-xl">
                💬
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Thai Questions Generator</h1>
                <p className="text-xs text-zinc-400">AI-powered clarifying questions for FNOL</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                ✓ LLM Connected
              </div>
              <div className="px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium">
                GPT-4
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('generate')}
            className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'generate'
                ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/25'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10'
            }`}
          >
            Generate Questions
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'templates'
                ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/25'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10'
            }`}
          >
            Template Library
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'analytics'
                ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/25'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10'
            }`}
          >
            Analytics
          </button>
        </div>

        {/* Generate Tab */}
        {activeTab === 'generate' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Claims List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">Incomplete Claims</h2>
                <span className="text-xs text-zinc-500">{mockClaims.length} claims</span>
              </div>

              {mockClaims.map((claim) => (
                <div
                  key={claim.id}
                  className={`bg-zinc-800/50 rounded-2xl p-5 border transition-all cursor-pointer ${
                    selectedClaim?.id === claim.id
                      ? 'border-violet-500/50 shadow-lg shadow-violet-500/10'
                      : 'border-white/[0.06] hover:border-white/10'
                  }`}
                  onClick={() => handleGenerateQuestions(claim)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-sm font-bold text-white mb-1">{claim.id}</div>
                      <div className="text-xs text-zinc-400">Policy: {claim.policyNumber}</div>
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                      <span className="text-xs font-medium text-amber-400">Incomplete</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-zinc-500 mb-3">
                    <span>📅 {claim.incidentDate}</span>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-zinc-300">Missing Fields:</div>
                    {claim.missingFields.map((field, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          field.criticality === 'CRITICAL'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {field.criticality}
                        </span>
                        <span className="text-xs text-zinc-400">{field.field}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="text-xs text-zinc-500 mb-1">Context:</div>
                    <div className="text-xs text-zinc-400 line-clamp-2">{claim.context.narrative}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Generated Questions */}
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">Generated Questions</h2>
                {selectedClaim && (
                  <button
                    onClick={handleClearSelection}
                    className="text-xs text-zinc-400 hover:text-white transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>

              {!selectedClaim && (
                <div className="bg-zinc-800/30 rounded-2xl p-8 border border-white/[0.06] text-center">
                  <div className="text-4xl mb-3">💬</div>
                  <div className="text-sm text-zinc-400">Select a claim to generate questions</div>
                </div>
              )}

              {selectedClaim && isGenerating && (
                <div className="bg-zinc-800/50 rounded-2xl p-8 border border-white/[0.06]">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-4 border-violet-500/20 border-t-violet-500 animate-spin"></div>
                    <div className="text-sm text-zinc-400">Generating Thai questions...</div>
                    <div className="text-xs text-zinc-500">Using GPT-4 with Thai context</div>
                  </div>
                </div>
              )}

              {selectedClaim && !isGenerating && generatedQuestions && (
                <>
                  {showSuccess && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mb-4">
                      <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                        <span>✓</span>
                        <span>3 questions generated successfully</span>
                      </div>
                    </div>
                  )}

                  <div className="bg-zinc-800/50 rounded-2xl p-5 border border-white/[0.06] mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-bold text-white">Claim: {selectedClaim.id}</div>
                      <div className="text-xs text-zinc-500">Processing time: 1,247ms</div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="px-2 py-1 rounded bg-violet-500/10 text-violet-400 font-medium">
                        Model: GPT-4
                      </span>
                      <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 font-medium">
                        Language: Thai
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {generatedQuestions.map((q, idx) => (
                      <div key={idx} className="bg-zinc-800/50 rounded-2xl p-5 border border-white/[0.06] shadow-lg shadow-black/20">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 font-bold text-sm flex-shrink-0">
                            {idx + 1}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-white mb-2">{q.question_th}</div>
                            <div className="text-xs text-zinc-400 mb-3">{q.question_en}</div>
                            
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs text-zinc-500">Field:</span>
                              <code className="px-2 py-0.5 rounded bg-zinc-900/50 text-cyan-400 text-xs font-mono">
                                {q.field}
                              </code>
                            </div>
                            
                            <div className="text-xs text-zinc-500 bg-zinc-900/30 rounded-lg p-2 border border-white/5">
                              <span className="font-semibold">Rationale:</span> {q.generation_rationale}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button className="flex-1 py-3 px-4 rounded-xl bg-violet-500 hover:bg-violet-600 text-white font-semibold text-sm transition-colors shadow-lg shadow-violet-500/25">
                      Send to Customer
                    </button>
                    <button className="py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold text-sm transition-colors border border-white/10">
                      Edit
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { field: 'policyNumber', th: 'ขอเลขกรมธรรม์ประกันภัยของคุณหน่อยครับ/ค่ะ (10 หลัก)', en: 'Could you please provide your insurance policy number? (10 digits)' },
              { field: 'incidentDate', th: 'เกิดอุบัติเหตุเมื่อไหร่ครับ/ค่ะ? (วันที่และเวลา)', en: 'When did the accident happen? (date and time)' },
              { field: 'incidentLocation', th: 'เกิดเหตุที่ไหนครับ/ค่ะ? (ถนน/แยก/จังหวัด หรือส่งพิกัด GPS)', en: 'Where did the accident occur? (street/intersection/province or GPS coordinates)' },
              { field: 'vehicles[0].licensePlate', th: 'ทะเบียนรถของคุณคืออะไรครับ/ค่ะ?', en: 'What is your vehicle\'s license plate number?' },
              { field: 'vehicles[0].make', th: 'รถของคุณยี่ห้ออะไรครับ/ค่ะ? (เช่น Toyota, Honda, Isuzu)', en: 'What is your vehicle\'s make? (e.g., Toyota, Honda, Isuzu)' },
              { field: 'vehicles[0].damageDescription', th: 'รถเสียหายตรงไหนบ้างครับ/ค่ะ? (เช่น กันชนหน้า, ประตูซ้าย, กระจก)', en: 'Which parts of the vehicle are damaged? (e.g., front bumper, left door, windshield)' }
            ].map((template) => (
              <div key={template.field} className="bg-zinc-800/50 rounded-2xl p-5 border border-white/[0.06] shadow-lg shadow-black/20">
                <div className="flex items-center justify-between mb-3">
                  <code className="text-xs font-mono text-cyan-400 bg-zinc-900/50 px-2 py-1 rounded">
                    {template.field}
                  </code>
                  <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-white">{template.th}</div>
                  <div className="text-xs text-zinc-400">{template.en}</div>
                </div>
                <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Cached: 15m TTL</span>
                  <button className="text-xs text-violet-400 hover:text-violet-300">Edit</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
              <div className="text-sm text-zinc-400 mb-2">Total Questions Generated</div>
              <div className="text-3xl font-bold text-white mb-1">1,247</div>
              <div className="text-xs text-emerald-400">↑ 23% from last week</div>
            </div>
            
            <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
              <div className="text-sm text-zinc-400 mb-2">Avg Processing Time</div>
              <div className="text-3xl font-bold text-white mb-1">1.2s</div>
              <div className="text-xs text-emerald-400">↓ 15% improvement</div>
            </div>
            
            <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
              <div className="text-sm text-zinc-400 mb-2">LLM Success Rate</div>
              <div className="text-3xl font-bold text-white mb-1">98.5%</div>
              <div className="text-xs text-zinc-400">1.5% fallback to templates</div>
            </div>

            <div className="lg:col-span-3 bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
              <h3 className="text-lg font-bold text-white mb-4">Most Requested Fields</h3>
              <div className="space-y-3">
                {[
                  { field: 'incidentLocation', count: 342, percentage: 85 },
                  { field: 'vehicles[0].damageDescription', count: 298, percentage: 74 },
                  { field: 'policeReportNumber', count: 256, percentage: 64 },
                  { field: 'vehicles[0].licensePlate', count: 189, percentage: 47 },
                  { field: 'narrative', count: 145, percentage: 36 }
                ].map((item, idx) => (
                  <div key={idx}>
                    <div className="flex items-center justify-between mb-1">
                      <code className="text-xs font-mono text-cyan-400">{item.field}</code>
                      <span className="text-xs text-zinc-400">{item.count} requests</span>
                    </div>
                    <div className="w-full h-2 bg-zinc-900/50 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-violet-500 to-purple-600 rounded-full"
                        style={{ width: `${item.percentage}%` }}
                      ></div>
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