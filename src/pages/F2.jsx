export default function LLMExtractionPreview() {
  const [narrative, setNarrative] = React.useState('');
  const [language, setLanguage] = React.useState('th');
  const [channel, setChannel] = React.useState('web');
  const [isExtracting, setIsExtracting] = React.useState(false);
  const [extractedData, setExtractedData] = React.useState(null);
  const [activeTab, setActiveTab] = React.useState('input');
  const [showSuccess, setShowSuccess] = React.useState(false);

  const mockExamples = [
    {
      label: 'Thai - Collision',
      text: 'เมื่อเช้านี้เวลา 08:30 น. ผมขับรถเก๋ง Toyota Camry สีขาว ทะเบียน กข-1234 กรุงเทพ ไปทำงาน พอถึงแยกอโศก ถนนสุขุมวิท รถกระบะ Isuzu สีเทา ทะเบียน นม-5678 เชียงใหม่ ตัดหน้าผมกะทันหัน ผมเบรกไม่ทัน ชนท้ายรถกระบะ กระโปรงหน้ารถผมบุบ ไฟหน้าซ้ายแตก ท้ายรถกระบะบุบเล็กน้อย คนขับกระบะชื่อนายสมชาย โทร 081-234-5678 ไม่มีคนบาดเจ็บ ได้แจ้งตำรวจสถานีลุมพินีแล้ว'
    },
    {
      label: 'Tinglish - Single Vehicle',
      text: 'วันนี้ประมาณ 14:00 ขับรถ Honda City สีแดง ทะเบียน ฮฮ-9999 กทม ไป Central Ladprao พอถึงหน้า Big C ฝนตกถนนลื่น speed เร็วไป lose control พุ่งชนเสาไฟฟ้า ด้านหน้ารถพังหนัก airbag ออก ผมบาดเจ็บเล็กน้อย ไปโรงพยาบาลวิภาวดี ตำรวจมาเก็บหลักฐานแล้ว เลขที่ใบแจ้งความ 123/2567'
    },
    {
      label: 'English - Third Party',
      text: 'Yesterday around 18:45, I was driving my Mercedes-Benz E-Class (white, license plate ABC-123 Bangkok) on Rama IV Road near MRT Khlong Toei. A motorcycle suddenly cut in front of me. I hit the brakes but still collided with the motorcycle. The rider, Mr. Somchai (phone: 089-111-2222), fell and injured his leg. Ambulance took him to Chulalongkorn Hospital. My front bumper is damaged. Police report filed at Thonglor Police Station, report number 456/2024.'
    }
  ];

  const handleExtract = () => {
    if (!narrative.trim() || narrative.length < 20) return;
    
    setIsExtracting(true);
    setActiveTab('result');
    
    setTimeout(() => {
      const mockResult = {
        vehicles: [
          {
            vehicle_type: 'INSURED',
            make: language === 'en' ? 'Mercedes-Benz' : 'Toyota',
            model: language === 'en' ? 'E-Class' : 'Camry',
            license_plate: language === 'en' ? 'ABC-123' : 'กข-1234',
            vin: 'unknown',
            color: language === 'en' ? 'White' : 'ขาว',
            damage_description: language === 'en' ? 'Front bumper damaged' : 'กระโปรงหน้าบุบ ไฟหน้าซ้ายแตก',
            confidence_score: 0.95
          },
          ...(language !== 'Tinglish' ? [{
            vehicle_type: 'THIRD_PARTY',
            make: language === 'en' ? 'Motorcycle' : 'Isuzu',
            model: language === 'en' ? 'unknown' : 'D-Max',
            license_plate: language === 'en' ? 'unknown' : 'นม-5678',
            vin: 'unknown',
            color: language === 'en' ? 'unknown' : 'เทา',
            damage_description: language === 'en' ? 'unknown' : 'ท้ายรถบุบเล็กน้อย',
            confidence_score: 0.88
          }] : [])
        ],
        incident_details: {
          incident_timestamp: '2024-01-15T08:30:00+07:00',
          location: {
            address: language === 'en' ? 'Rama IV Road near MRT Khlong Toei' : 'แยกอโศก ถนนสุขุมวิท',
            lat: 13.7367,
            lng: 100.5608,
            landmark: language === 'en' ? 'MRT Khlong Toei' : 'แยกอโศก',
            confidence_score: 0.92
          },
          narrative_summary: language === 'en' 
            ? 'Collision with motorcycle on Rama IV Road, rider injured'
            : 'รถกระบะตัดหน้ากะทันหัน เบรกไม่ทัน ชนท้ายรถกระบะที่แยกอโศก',
          accident_type: language === 'Tinglish' ? 'SINGLE_VEHICLE' : 'COLLISION',
          weather_conditions: language === 'Tinglish' ? 'ฝนตก' : 'unknown',
          road_conditions: language === 'Tinglish' ? 'ถนนลื่น' : 'unknown'
        },
        parties: [
          {
            party_type: 'INSURED',
            name: 'unknown',
            phone: 'unknown',
            id_number: 'unknown',
            confidence_score: 0.0
          },
          ...(language !== 'Tinglish' ? [{
            party_type: 'THIRD_PARTY',
            name: language === 'en' ? 'Mr. Somchai' : 'นายสมชาย',
            phone: language === 'en' ? '089-111-2222' : '081-234-5678',
            id_number: 'unknown',
            confidence_score: 0.85
          }] : [])
        ],
        injuries: {
          injuries_reported: language === 'en' || language === 'Tinglish',
          injury_severity: language === 'en' ? 'MINOR' : language === 'Tinglish' ? 'MINOR' : 'NONE',
          injured_parties: language === 'en' ? ['Mr. Somchai'] : language === 'Tinglish' ? ['ผู้ขับขี่'] : [],
          medical_facility: language === 'en' ? 'Chulalongkorn Hospital' : language === 'Tinglish' ? 'โรงพยาบาลวิภาวดี' : 'unknown',
          confidence_score: language === 'en' || language === 'Tinglish' ? 0.90 : 0.95
        },
        police_report: {
          report_filed: true,
          report_number: language === 'en' ? '456/2024' : language === 'Tinglish' ? '123/2567' : 'unknown',
          police_station: language === 'en' ? 'Thonglor Police Station' : 'สถานีตำรวจลุมพินี',
          officer_name: 'unknown',
          confidence_score: 0.88
        },
        overall_confidence: 0.89,
        missing_critical_fields: ['vin', 'insured_id_number'],
        ambiguous_information: [],
        language_detected: language === 'en' ? 'en' : language === 'Tinglish' ? 'tinglish' : 'th',
        _metadata: {
          llm_provider: 'openai',
          llm_model_version: 'gpt-4-turbo-2024-01-25',
          prompt_version: '1.0.0',
          processing_time_ms: 2847,
          input_language: language,
          input_channel: channel,
          cache_hit: false
        }
      };
      
      setExtractedData(mockResult);
      setIsExtracting(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }, 2800);
  };

  const loadExample = (example) => {
    setNarrative(example.text);
    setLanguage(example.label.includes('English') ? 'en' : example.label.includes('Tinglish') ? 'tinglish' : 'th');
    setExtractedData(null);
    setActiveTab('input');
  };

  const getConfidenceColor = (score) => {
    if (score >= 0.9) return 'text-emerald-400 bg-emerald-500/10';
    if (score >= 0.7) return 'text-cyan-400 bg-cyan-500/10';
    if (score >= 0.5) return 'text-amber-400 bg-amber-500/10';
    return 'text-rose-400 bg-rose-500/10';
  };

  const getConfidenceLabel = (score) => {
    if (score >= 0.9) return 'High';
    if (score >= 0.7) return 'Medium';
    if (score >= 0.5) return 'Low';
    return 'Very Low';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-slate-900 to-zinc-950">
      {/* Header */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-zinc-900/80 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-xl">
                🤖
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">LLM Extraction Service</h1>
                <p className="text-xs text-zinc-400">Thai/English Bilingual Claim Data Extraction</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-xs font-medium text-emerald-400">● GPT-4 Turbo</span>
              </div>
              <div className="px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20">
                <span className="text-xs font-medium text-violet-400">v1.0.0</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed top-20 right-6 z-50 animate-slide-in">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg shadow-emerald-500/10">
            <span className="text-2xl">✅</span>
            <div>
              <p className="text-sm font-semibold text-emerald-400">Extraction Complete</p>
              <p className="text-xs text-emerald-300/70">Data extracted successfully</p>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('input')}
            className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'input'
                ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/20'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10'
            }`}
          >
            📝 Input
          </button>
          <button
            onClick={() => setActiveTab('result')}
            className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all ${
              activeTab === 'result'
                ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/20'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10'
            }`}
            disabled={!extractedData && !isExtracting}
          >
            🎯 Extraction Result
          </button>
        </div>

        {activeTab === 'input' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Input */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
                <h2 className="text-lg font-bold text-white mb-4">FNOL Narrative Input</h2>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-2">Language</label>
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        className="w-full rounded-xl bg-white/5 border border-white/10 text-white px-4 py-3 text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                      >
                        <option value="th">🇹🇭 Thai</option>
                        <option value="en">🇬🇧 English</option>
                        <option value="tinglish">🔀 Tinglish</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-2">Channel</label>
                      <select
                        value={channel}
                        onChange={(e) => setChannel(e.target.value)}
                        className="w-full rounded-xl bg-white/5 border border-white/10 text-white px-4 py-3 text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none"
                      >
                        <option value="web">🌐 Web</option>
                        <option value="chat">💬 Chat</option>
                        <option value="email">📧 Email</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-2">
                      Narrative Text (min 20 characters)
                    </label>
                    <textarea
                      value={narrative}
                      onChange={(e) => setNarrative(e.target.value)}
                      placeholder="Enter FNOL narrative in Thai, English, or Tinglish..."
                      className="w-full h-64 rounded-xl bg-white/5 border border-white/10 text-white px-4 py-3 text-sm focus:ring-2 focus:ring-violet-500/50 focus:outline-none resize-none font-mono"
                    />
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-zinc-500">
                        {narrative.length} characters
                      </span>
                      {narrative.length > 0 && narrative.length < 20 && (
                        <span className="text-xs text-rose-400">⚠️ Minimum 20 characters required</span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={handleExtract}
                    disabled={!narrative.trim() || narrative.length < 20 || isExtracting}
                    className="w-full py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-500/20"
                  >
                    {isExtracting ? '⏳ Extracting...' : '🚀 Extract Claim Data'}
                  </button>
                </div>
              </div>
            </div>

            {/* Examples Sidebar */}
            <div className="space-y-4">
              <div className="bg-zinc-800/50 rounded-2xl p-5 border border-white/[0.06] shadow-lg shadow-black/20">
                <h3 className="text-sm font-bold text-white mb-3">📚 Example Narratives</h3>
                <div className="space-y-3">
                  {mockExamples.map((example, idx) => (
                    <button
                      key={idx}
                      onClick={() => loadExample(example)}
                      className="w-full text-left p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all group"
                    >
                      <div className="text-xs font-semibold text-violet-400 mb-1">{example.label}</div>
                      <div className="text-xs text-zinc-400 line-clamp-2 group-hover:text-zinc-300">
                        {example.text}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-gradient-to-br from-violet-500/10 to-purple-500/10 rounded-2xl p-5 border border-violet-500/20">
                <h3 className="text-sm font-bold text-violet-300 mb-2">💡 Supported Features</h3>
                <ul className="space-y-2 text-xs text-violet-200/70">
                  <li>✓ Thai language (all dialects)</li>
                  <li>✓ English language</li>
                  <li>✓ Tinglish code-switching</li>
                  <li>✓ Confidence scoring</li>
                  <li>✓ Missing field detection</li>
                  <li>✓ Ambiguity flagging</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'result' && (
          <div className="space-y-6">
            {isExtracting && (
              <div className="bg-zinc-800/50 rounded-2xl p-12 border border-white/[0.06] shadow-lg shadow-black/20 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-violet-500/10 mb-4 animate-pulse">
                  <span className="text-3xl">🤖</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Processing with LLM...</h3>
                <p className="text-sm text-zinc-400 mb-4">Extracting structured data from narrative</p>
                <div className="w-64 h-2 bg-white/5 rounded-full mx-auto overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-violet-500 to-purple-600 rounded-full animate-progress" style={{width: '70%'}}></div>
                </div>
              </div>
            )}

            {extractedData && !isExtracting && (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-gradient-to-br from-violet-500/10 to-purple-500/10 rounded-2xl p-5 border border-violet-500/20">
                    <div className="text-xs font-medium text-violet-300 mb-1">Overall Confidence</div>
                    <div className="text-2xl font-bold text-white">{(extractedData.overall_confidence * 100).toFixed(0)}%</div>
                    <div className={`inline-flex items-center gap-1 mt-2 px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(extractedData.overall_confidence)}`}>
                      {getConfidenceLabel(extractedData.overall_confidence)}
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-2xl p-5 border border-emerald-500/20">
                    <div className="text-xs font-medium text-emerald-300 mb-1">Processing Time</div>
                    <div className="text-2xl font-bold text-white">{extractedData._metadata.processing_time_ms}ms</div>
                    <div className="text-xs text-emerald-300/70 mt-2">Under 30s SLA ✓</div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 rounded-2xl p-5 border border-cyan-500/20">
                    <div className="text-xs font-medium text-cyan-300 mb-1">Language Detected</div>
                    <div className="text-2xl font-bold text-white uppercase">{extractedData.language_detected}</div>
                    <div className="text-xs text-cyan-300/70 mt-2">
                      {extractedData.language_detected === 'th' ? '🇹🇭 Thai' : 
                       extractedData.language_detected === 'en' ? '🇬🇧 English' : '🔀 Tinglish'}
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-2xl p-5 border border-amber-500/20">
                    <div className="text-xs font-medium text-amber-300 mb-1">Missing Fields</div>
                    <div className="text-2xl font-bold text-white">{extractedData.missing_critical_fields.length}</div>
                    <div className="text-xs text-amber-300/70 mt-2">
                      {extractedData.missing_critical_fields.length === 0 ? 'All complete ✓' : 'Needs review'}
                    </div>
                  </div>
                </div>

                {/* Vehicles */}
                <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
                  <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    🚗 Vehicles ({extractedData.vehicles.length})
                  </h2>
                  <div className="space-y-4">
                    {extractedData.vehicles.map((vehicle, idx) => (
                      <div key={idx} className="bg-white/5 rounded-xl p-4 border border-white/5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                              vehicle.vehicle_type === 'INSURED' 
                                ? 'bg-violet-500/20 text-violet-300' 
                                : 'bg-rose-500/20 text-rose-300'
                            }`}>
                              {vehicle.vehicle_type === 'INSURED' ? '🛡️ Insured' : '⚠️ Third Party'}
                            </span>
                          </div>
                          <div className={`px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(vehicle.confidence_score)}`}>
                            {(vehicle.confidence_score * 100).toFixed(0)}%
                          </div>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div>
                            <div className="text-xs text-zinc-500 mb-1">Make</div>
                            <div className="text-sm text-white font-medium">{vehicle.make}</div>
                          </div>
                          <div>
                            <div className="text-xs text-zinc-500 mb-1">Model</div>
                            <div className="text-sm text-white font-medium">{vehicle.model}</div>
                          </div>
                          <div>
                            <div className="text-xs text-zinc-500 mb-1">License Plate</div>
                            <div className="text-sm text-white font-medium font-mono">{vehicle.license_plate}</div>
                          </div>
                          <div>
                            <div className="text-xs text-zinc-500 mb-1">Color</div>
                            <div className="text-sm text-white font-medium">{vehicle.color}</div>
                          </div>
                        </div>
                        {vehicle.damage_description !== 'unknown' && (
                          <div className="mt-3 pt-3 border-t border-white/5">
                            <div className="text-xs text-zinc-500 mb-1">Damage Description</div>
                            <div className="text-sm text-zinc-300">{vehicle.damage_description}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Incident Details */}
                <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
                  <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    📍 Incident Details
                  </h2>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                        <div className="text-xs text-zinc-500 mb-1">Timestamp</div>
                        <div className="text-sm text-white font-medium">{extractedData.incident_details.incident_timestamp}</div>
                      </div>
                      <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                        <div className="text-xs text-zinc-500 mb-1">Accident Type</div>
                        <div className="text-sm text-white font-medium">{extractedData.incident_details.accident_type}</div>
                      </div>
                    </div>
                    
                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                      <div className="flex items-start justify-between mb-2">
                        <div className="text-xs text-zinc-500">Location</div>
                        <div className={`px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(extractedData.incident_details.location.confidence_score)}`}>
                          {(extractedData.incident_details.location.confidence_score * 100).toFixed(0)}%
                        </div>
                      </div>
                      <div className="text-sm text-white font-medium mb-2">{extractedData.incident_details.location.address}</div>
                      {extractedData.incident_details.location.landmark !== 'unknown' && (
                        <div className="text-xs text-zinc-400">📍 {extractedData.incident_details.location.landmark}</div>
                      )}
                      {extractedData.incident_details.location.lat && (
                        <div className="text-xs text-zinc-500 mt-2 font-mono">
                          {extractedData.incident_details.location.lat}, {extractedData.incident_details.location.lng}
                        </div>
                      )}
                    </div>

                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                      <div className="text-xs text-zinc-500 mb-1">Summary</div>
                      <div className="text-sm text-zinc-300">{extractedData.incident_details.narrative_summary}</div>
                    </div>
                  </div>
                </div>

                {/* Injuries & Police Report */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
                    <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                      🏥 Injuries
                    </h2>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-zinc-400">Injuries Reported</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          extractedData.injuries.injuries_reported 
                            ? 'bg-rose-500/20 text-rose-300' 
                            : 'bg-emerald-500/20 text-emerald-300'
                        }`}>
                          {extractedData.injuries.injuries_reported ? 'Yes' : 'No'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-zinc-400">Severity</span>
                        <span className="text-sm text-white font-medium">{extractedData.injuries.injury_severity}</span>
                      </div>
                      {extractedData.injuries.medical_facility !== 'unknown' && (
                        <div className="pt-3 border-t border-white/5">
                          <div className="text-xs text-zinc-500 mb-1">Medical Facility</div>
                          <div className="text-sm text-white">{extractedData.injuries.medical_facility}</div>
                        </div>
                      )}
                      <div className="pt-3 border-t border-white/5">
                        <div className={`px-2 py-1 rounded-full text-xs font-medium inline-flex ${getConfidenceColor(extractedData.injuries.confidence_score)}`}>
                          Confidence: {(extractedData.injuries.confidence_score * 100).toFixed(0)}%
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
                    <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                      👮 Police Report
                    </h2>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-zinc-400">Report Filed</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          extractedData.police_report.report_filed 
                            ? 'bg-emerald-500/20 text-emerald-300' 
                            : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {extractedData.police_report.report_filed ? 'Yes' : 'No'}
                        </span>
                      </div>
                      {extractedData.police_report.report_number !== 'unknown' && (
                        <div>
                          <div className="text-xs text-zinc-500 mb-1">Report Number</div>
                          <div className="text-sm text-white font-mono">{extractedData.police_report.report_number}</div>
                        </div>
                      )}
                      {extractedData.police_report.police_station !== 'unknown' && (
                        <div>
                          <div className="text-xs text-zinc-500 mb-1">Police Station</div>
                          <div className="text-sm text-white">{extractedData.police_report.police_station}</div>
                        </div>
                      )}
                      <div className="pt-3 border-t border-white/5">
                        <div className={`px-2 py-1 rounded-full text-xs font-medium inline-flex ${getConfidenceColor(extractedData.police_report.confidence_score)}`}>
                          Confidence: {(extractedData.police_report.confidence_score * 100).toFixed(0)}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Metadata */}
                <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
                  <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    ⚙️ Extraction Metadata
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Provider</div>
                      <div className="text-sm text-white font-medium">{extractedData._metadata.llm_provider}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Model</div>
                      <div className="text-sm text-white font-medium">{extractedData._metadata.llm_model_version}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Prompt Version</div>
                      <div className="text-sm text-white font-medium">{extractedData._metadata.prompt_version}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Cache Hit</div>
                      <div className="text-sm text-white font-medium">{extractedData._metadata.cache_hit ? 'Yes' : 'No'}</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}