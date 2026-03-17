export default function LLMExtractionPreview() {
  const [activeTab, setActiveTab] = React.useState('input');
  const [narrative, setNarrative] = React.useState('');
  const [language, setLanguage] = React.useState('th');
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [extractedData, setExtractedData] = React.useState(null);
  const [showSuccess, setShowSuccess] = React.useState(false);

  const mockNarratives = {
    th: 'วันที่ 15 มีนาคม 2567 เวลาประมาณ 14:30 น. ผมขับรถ Honda City สีขาว ทะเบียน กข 1234 กรุงเทพ กำลังขับมาตามถนนสุขุมวิท แล้วมีรถ Toyota Camry สีดำ ทะเบียน นม 5678 กรุงเทพ ขับตัดหน้าอย่างกะทันหัน ทำให้ผมเบรกไม่ทัน ชนท้ายรถคันนั้น รถผมด้านหน้าเสียหาย กระโปรงหน้าบุบ ไฟหน้าแตก คนขับอีกคันชื่อคุณสมชาย โทร 081-234-5678 เกิดเหตุที่แยกอโศก ไม่มีผู้บาดเจ็บ แต่ได้แจ้งความที่สถานีตำรวจทองหล่อแล้ว เลขที่ รง.123/2567',
    en: 'On March 15, 2024 at around 2:30 PM, I was driving my white Honda City (license plate กข 1234 Bangkok) along Sukhumvit Road when a black Toyota Camry (license plate นม 5678 Bangkok) suddenly cut in front of me. I couldn\'t brake in time and hit the rear of that car. My car\'s front was damaged - hood dented, headlight broken. The other driver\'s name is Somchai, phone 081-234-5678. Accident occurred at Asoke intersection. No injuries but filed police report at Thonglor station, report number รง.123/2567'
  };

  const handleExtract = () => {
    setIsProcessing(true);
    setShowSuccess(false);
    
    setTimeout(() => {
      const mockExtraction = {
        claim_id: 'CLM-2024-03-15-001',
        fnol_summary: language === 'th' 
          ? 'รถผู้เอาประกัน Honda City ชนท้ายรถ Toyota Camry ที่แยกอโศก เนื่องจากรถคู่กรณีตัดหน้าอย่างกะทันหัน ไม่มีผู้บาดเจ็บ มีการแจ้งความ'
          : 'Insured vehicle Honda City rear-ended Toyota Camry at Asoke intersection due to sudden lane change. No injuries. Police report filed.',
        vehicles: [
          {
            role: 'INSURED',
            license_plate: 'กข 1234 กรุงเทพ',
            make: 'Honda',
            model: 'City',
            year: null,
            color: 'ขาว',
            damage_description: 'กระโปรงหน้าบุบ ไฟหน้าแตก',
            confidence_score: 0.95
          },
          {
            role: 'THIRD_PARTY',
            license_plate: 'นม 5678 กรุงเทพ',
            make: 'Toyota',
            model: 'Camry',
            year: null,
            color: 'ดำ',
            damage_description: 'ชนท้าย',
            confidence_score: 0.92
          }
        ],
        location: {
          address: 'แยกอโศก ถนนสุขุมวิท',
          lat: 13.7367,
          lng: 100.5602,
          confidence_score: 0.88
        },
        parties: [
          {
            name: 'สมชาย',
            phone: '081-234-5678',
            role: 'THIRD_PARTY',
            confidence_score: 0.90
          }
        ],
        incident_time: '2024-03-15T14:30:00+07:00',
        injuries_reported: false,
        injury_description: null,
        police_report_filed: true,
        police_report_number: 'รง.123/2567',
        damage_narrative: 'รถผู้เอาประกันชนท้ายรถคู่กรณี ความเสียหายที่กระโปรงหน้าและไฟหน้า',
        missing_fields: ['year', 'injury_description'],
        overall_confidence_score: 0.91,
        llm_model_version: 'claude-3-sonnet-20240229',
        processing_time_ms: 2847,
        evidence_quotes: [
          'รถ Honda City สีขาว ทะเบียน กข 1234',
          'รถ Toyota Camry สีดำ ทะเบียน นม 5678',
          'เกิดเหตุที่แยกอโศก',
          'ไม่มีผู้บาดเจ็บ',
          'แจ้งความที่สถานีตำรวจทองหล่อ เลขที่ รง.123/2567'
        ]
      };
      
      setExtractedData(mockExtraction);
      setIsProcessing(false);
      setShowSuccess(true);
      setActiveTab('results');
    }, 2800);
  };

  const handleUseMockData = () => {
    setNarrative(mockNarratives[language]);
  };

  const getConfidenceColor = (score) => {
    if (score >= 0.9) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (score >= 0.75) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  };

  const getConfidenceLabel = (score) => {
    if (score >= 0.9) return 'สูง';
    if (score >= 0.75) return 'ปานกลาง';
    return 'ต่ำ';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-zinc-900 to-slate-950">
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-zinc-900/80 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                <span className="text-xl">🤖</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">LLM Data Extraction</h1>
                <p className="text-xs text-zinc-400">AI-Powered Bilingual Claims Processing</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                <span className="text-xs font-medium text-emerald-400">Claude 3 Sonnet</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('input')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all ${
              activeTab === 'input'
                ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/20'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10'
            }`}
          >
            📝 Input Narrative
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all ${
              activeTab === 'results'
                ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/20'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10'
            }`}
            disabled={!extractedData}
          >
            ✨ Extracted Data
          </button>
          <button
            onClick={() => setActiveTab('validation')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all ${
              activeTab === 'validation'
                ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/20'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10'
            }`}
            disabled={!extractedData}
          >
            🎯 Validation
          </button>
        </div>

        {activeTab === 'input' && (
          <div className="space-y-6">
            <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white">Accident Narrative</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLanguage('th')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      language === 'th'
                        ? 'bg-violet-500 text-white'
                        : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    🇹🇭 ไทย
                  </button>
                  <button
                    onClick={() => setLanguage('en')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      language === 'en'
                        ? 'bg-violet-500 text-white'
                        : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    🇬🇧 English
                  </button>
                </div>
              </div>

              <textarea
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                placeholder={language === 'th' ? 'กรอกรายละเอียดอุบัติเหตุ...' : 'Enter accident details...'}
                className="w-full h-48 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
              />

              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleUseMockData}
                  className="px-6 py-3 rounded-xl bg-white/5 text-zinc-300 font-semibold hover:bg-white/10 transition-all"
                >
                  📋 Use Sample Data
                </button>
                <button
                  onClick={handleExtract}
                  disabled={!narrative || isProcessing}
                  className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/20"
                >
                  {isProcessing ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Processing...
                    </span>
                  ) : (
                    '🚀 Extract Data'
                  )}
                </button>
              </div>
            </div>

            {isProcessing && (
              <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-violet-500/20 flex items-center justify-center">
                    <div className="w-6 h-6 border-3 border-violet-500/30 border-t-violet-500 rounded-full animate-spin"></div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-white mb-1">AI Processing in Progress</h3>
                    <p className="text-xs text-zinc-400">Analyzing narrative and extracting structured data...</p>
                  </div>
                </div>
              </div>
            )}

            {showSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <span className="text-2xl">✅</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-emerald-400 mb-1">Extraction Completed</h3>
                    <p className="text-xs text-emerald-300/70">Data extracted successfully with 91% confidence</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'results' && extractedData && (
          <div className="space-y-6">
            <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-white mb-1">FNOL Summary</h2>
                  <p className="text-xs text-zinc-400">AI-Generated Incident Overview</p>
                </div>
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${getConfidenceColor(extractedData.overall_confidence_score)}`}>
                  <span className="text-xs font-semibold">{Math.round(extractedData.overall_confidence_score * 100)}%</span>
                </div>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed">{extractedData.fnol_summary}</p>
              
              <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/5">
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Processing Time</p>
                  <p className="text-sm font-semibold text-white">{extractedData.processing_time_ms}ms</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Model Version</p>
                  <p className="text-sm font-semibold text-white">Claude 3</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Claim ID</p>
                  <p className="text-sm font-semibold text-white">{extractedData.claim_id}</p>
                </div>
              </div>
            </div>

            <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
              <h2 className="text-lg font-bold text-white mb-4">🚗 Vehicles Involved</h2>
              <div className="space-y-4">
                {extractedData.vehicles.map((vehicle, idx) => (
                  <div key={idx} className="bg-white/5 rounded-xl p-4 border border-white/5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                          vehicle.role === 'INSURED' 
                            ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}>
                          {vehicle.role === 'INSURED' ? '👤 Insured' : '⚠️ Third Party'}
                        </span>
                      </div>
                      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs ${getConfidenceColor(vehicle.confidence_score)}`}>
                        <span>{Math.round(vehicle.confidence_score * 100)}%</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-zinc-500 mb-1">License Plate</p>
                        <p className="text-sm font-semibold text-white">{vehicle.license_plate}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500 mb-1">Make & Model</p>
                        <p className="text-sm font-semibold text-white">{vehicle.make} {vehicle.model}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500 mb-1">Color</p>
                        <p className="text-sm font-semibold text-white">{vehicle.color}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500 mb-1">Year</p>
                        <p className="text-sm font-semibold text-zinc-400">{vehicle.year || 'N/A'}</p>
                      </div>
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <p className="text-xs text-zinc-500 mb-1">Damage Description</p>
                      <p className="text-sm text-zinc-300">{vehicle.damage_description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
                <h2 className="text-lg font-bold text-white mb-4">📍 Location</h2>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Address</p>
                    <p className="text-sm text-white">{extractedData.location.address}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-zinc-500 mb-1">Latitude</p>
                      <p className="text-sm font-mono text-zinc-300">{extractedData.location.lat}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500 mb-1">Longitude</p>
                      <p className="text-sm font-mono text-zinc-300">{extractedData.location.lng}</p>
                    </div>
                  </div>
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${getConfidenceColor(extractedData.location.confidence_score)}`}>
                    <span className="text-xs font-semibold">Confidence: {Math.round(extractedData.location.confidence_score * 100)}%</span>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
                <h2 className="text-lg font-bold text-white mb-4">👥 Parties</h2>
                <div className="space-y-3">
                  {extractedData.parties.map((party, idx) => (
                    <div key={idx} className="bg-white/5 rounded-xl p-3 border border-white/5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-zinc-400">{party.role}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getConfidenceColor(party.confidence_score)}`}>
                          {Math.round(party.confidence_score * 100)}%
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-white">{party.name}</p>
                      <p className="text-xs text-zinc-400 mt-1">{party.phone}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
              <h2 className="text-lg font-bold text-white mb-4">📋 Additional Details</h2>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs text-zinc-500 mb-2">Incident Time</p>
                  <p className="text-sm text-white">{new Date(extractedData.incident_time).toLocaleString('th-TH')}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-2">Police Report</p>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                      extractedData.police_report_filed
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-zinc-500/20 text-zinc-300 border border-zinc-500/30'
                    }`}>
                      {extractedData.police_report_filed ? '✅ Filed' : '❌ Not Filed'}
                    </span>
                    {extractedData.police_report_number && (
                      <span className="text-sm text-zinc-300">{extractedData.police_report_number}</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-2">Injuries Reported</p>
                  <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                    extractedData.injuries_reported
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}>
                    {extractedData.injuries_reported ? '🏥 Yes' : '✅ No'}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-2">Damage Narrative</p>
                  <p className="text-sm text-zinc-300">{extractedData.damage_narrative}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'validation' && extractedData && (
          <div className="space-y-6">
            <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
              <h2 className="text-lg font-bold text-white mb-4">🎯 Confidence Analysis</h2>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-zinc-300">Overall Confidence</span>
                    <span className="text-sm font-semibold text-white">{Math.round(extractedData.overall_confidence_score * 100)}%</span>
                  </div>
                  <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-violet-500 to-purple-600 rounded-full transition-all"
                      style={{ width: `${extractedData.overall_confidence_score * 100}%` }}
                    ></div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/5">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-400">
                      {extractedData.vehicles.filter(v => v.confidence_score >= 0.9).length}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">High Confidence</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-amber-400">
                      {extractedData.vehicles.filter(v => v.confidence_score >= 0.75 && v.confidence_score < 0.9).length}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">Medium Confidence</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-rose-400">
                      {extractedData.missing_fields.length}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">Missing Fields</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
              <h2 className="text-lg font-bold text-white mb-4">💬 Evidence Quotes</h2>
              <div className="space-y-3">
                {extractedData.evidence_quotes.map((quote, idx) => (
                  <div key={idx} className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-4">
                    <div className="flex gap-3">
                      <span className="text-violet-400 text-lg">&quot;</span>
                      <p className="text-sm text-zinc-300 flex-1 italic">{quote}</p>
                      <span className="text-violet-400 text-lg">&quot;</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {extractedData.missing_fields.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6">
                <h2 className="text-lg font-bold text-amber-400 mb-4">⚠️ Missing Required Fields</h2>
                <div className="flex flex-wrap gap-2">
                  {extractedData.missing_fields.map((field, idx) => (
                    <span key={idx} className="inline-flex px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-medium border border-amber-500/30">
                      {field}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-amber-300/70 mt-4">
                  These fields were not found in the narrative and may require manual input.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}