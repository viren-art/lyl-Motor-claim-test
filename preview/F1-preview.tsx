export default function F1Preview() {
  const [activeChannel, setActiveChannel] = React.useState('chat');
  const [chatMessages, setChatMessages] = React.useState([
    { id: 1, sender: 'user', text: 'สวัสดีครับ ผมต้องการแจ้งเคลมอุบัติเหตุรถชน', time: '14:23' },
    { id: 2, sender: 'bot', text: 'สวัสดีค่ะ ยินดีให้บริการ กรุณาระบุหมายเลขกรมธรรม์ของท่านค่ะ', time: '14:23' }
  ]);
  const [chatInput, setChatInput] = React.useState('');
  const [formData, setFormData] = React.useState({
    policyNumber: '',
    incidentDate: '',
    incidentLocation: '',
    narrative: '',
    injuriesReported: false,
    policeReportFiled: false,
    policeReportNumber: '',
    pdpaConsent: false
  });
  const [uploadedPhotos, setUploadedPhotos] = React.useState([]);
  const [submissionStatus, setSubmissionStatus] = React.useState(null);
  const [showPhotoUpload, setShowPhotoUpload] = React.useState(false);
  const [processingTime, setProcessingTime] = React.useState(null);

  const handleChatSubmit = () => {
    if (!chatInput.trim()) return;
    
    const newMessage = {
      id: chatMessages.length + 1,
      sender: 'user',
      text: chatInput,
      time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    };
    
    setChatMessages([...chatMessages, newMessage]);
    setChatInput('');
    
    setTimeout(() => {
      const botResponse = {
        id: chatMessages.length + 2,
        sender: 'bot',
        text: 'ขอบคุณสำหรับข้อมูลค่ะ กำลังบันทึกข้อมูลเคลมของท่าน...',
        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, botResponse]);
      
      setTimeout(() => {
        setProcessingTime(1247);
        setSubmissionStatus({
          claimId: 'CLM-2024-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
          status: 'INTAKE',
          message: 'ได้รับแจ้งเคลมของท่านแล้ว กำลังดำเนินการตรวจสอบ'
        });
      }, 1500);
    }, 800);
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    setProcessingTime(null);
    
    setTimeout(() => {
      setProcessingTime(892);
      setSubmissionStatus({
        claimId: 'CLM-2024-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
        status: 'INTAKE',
        message: 'ได้รับแจ้งเคลมของท่านแล้ว'
      });
      setShowPhotoUpload(true);
    }, 1200);
  };

  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files || []);
    const newPhotos = files.map((file, idx) => ({
      id: uploadedPhotos.length + idx + 1,
      name: file.name,
      size: (file.size / 1024).toFixed(1) + ' KB',
      status: 'validating',
      preview: URL.createObjectURL(file)
    }));
    
    setUploadedPhotos([...uploadedPhotos, ...newPhotos]);
    
    newPhotos.forEach((photo, idx) => {
      setTimeout(() => {
        setUploadedPhotos(prev => prev.map(p => 
          p.id === photo.id 
            ? { ...p, status: 'valid', resolution: '1920x1080', exif: true }
            : p
        ));
      }, 1000 + idx * 500);
    });
  };

  const emailSubmissions = [
    {
      id: 1,
      from: 'somchai.p@email.com',
      subject: 'แจ้งเคลมอุบัติเหตุ - กรมธรรม์ 1234567890',
      receivedAt: '2024-01-15 09:23:45',
      status: 'INTAKE',
      claimId: 'CLM-2024-EMAIL001',
      attachments: 2
    },
    {
      id: 2,
      from: 'supap.k@email.com',
      subject: 'Claim Report - Policy 9876543210',
      receivedAt: '2024-01-15 10:15:22',
      status: 'PENDING_CONSENT',
      claimId: 'CLM-2024-EMAIL002',
      attachments: 5
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-slate-900 to-zinc-950">
      {/* Header */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-zinc-900/80 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                R
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">Roojai Claims</h1>
                <p className="text-xs text-zinc-400">Multi-Channel FNOL Intake</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                System Online
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Channel Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {[
            { id: 'chat', label: 'Chat FNOL', icon: '💬', count: 24 },
            { id: 'form', label: 'Web Form', icon: '📋', count: 18 },
            { id: 'email', label: 'Email Intake', icon: '📧', count: 7 }
          ].map(channel => (
            <button
              key={channel.id}
              onClick={() => {
                setActiveChannel(channel.id);
                setSubmissionStatus(null);
                setShowPhotoUpload(false);
              }}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all whitespace-nowrap ${
                activeChannel === channel.id
                  ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/25'
                  : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-300'
              }`}
            >
              <span className="text-lg">{channel.icon}</span>
              {channel.label}
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                activeChannel === channel.id
                  ? 'bg-white/20 text-white'
                  : 'bg-white/5 text-zinc-500'
              }`}>
                {channel.count}
              </span>
            </button>
          ))}
        </div>

        {/* Chat Channel */}
        {activeChannel === 'chat' && (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="bg-zinc-800/50 rounded-2xl border border-white/[0.06] shadow-lg shadow-black/20 overflow-hidden flex flex-col h-[600px]">
                <div className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 border-b border-white/5 px-6 py-4">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    💬 Live Chat FNOL
                  </h2>
                  <p className="text-sm text-zinc-400 mt-1">Real-time claim submission via chat</p>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {chatMessages.map(msg => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[80%] ${msg.sender === 'user' ? 'order-2' : 'order-1'}`}>
                        <div className={`rounded-2xl px-4 py-3 ${
                          msg.sender === 'user'
                            ? 'bg-violet-500 text-white'
                            : 'bg-white/5 text-zinc-200 border border-white/10'
                        }`}>
                          <p className="text-sm">{msg.text}</p>
                        </div>
                        <p className="text-xs text-zinc-500 mt-1 px-2">{msg.time}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/5 p-4 bg-zinc-900/50">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleChatSubmit()}
                      placeholder="พิมพ์ข้อความ..."
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                    />
                    <button
                      onClick={handleChatSubmit}
                      className="px-6 py-3 bg-violet-500 hover:bg-violet-600 active:bg-violet-700 text-white font-semibold rounded-xl transition-colors"
                    >
                      ส่ง
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {/* PDPA Consent Status */}
              <div className="bg-zinc-800/50 rounded-2xl border border-white/[0.06] shadow-lg shadow-black/20 p-5">
                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                  🔒 PDPA Compliance
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Consent Required</span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                      ✓ Validated
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Retention Period</span>
                    <span className="text-sm text-white font-medium">7 years</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">Processing Purpose</span>
                    <span className="text-xs text-zinc-500">Claim + Fraud</span>
                  </div>
                </div>
              </div>

              {/* Submission Status */}
              {submissionStatus && (
                <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 rounded-2xl border border-emerald-500/20 shadow-lg shadow-black/20 p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xl">
                      ✓
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-bold text-white">Claim Submitted</h3>
                      <p className="text-xs text-emerald-400 mt-0.5">{submissionStatus.message}</p>
                    </div>
                  </div>
                  <div className="space-y-2 pt-3 border-t border-emerald-500/10">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-zinc-400">Claim ID</span>
                      <span className="text-xs font-mono text-white">{submissionStatus.claimId}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-zinc-400">Status</span>
                      <span className="inline-flex px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
                        {submissionStatus.status}
                      </span>
                    </div>
                    {processingTime && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-400">Processing Time</span>
                        <span className="text-xs text-emerald-400 font-medium">{processingTime}ms</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SLA Metrics */}
              <div className="bg-zinc-800/50 rounded-2xl border border-white/[0.06] shadow-lg shadow-black/20 p-5">
                <h3 className="text-sm font-bold text-white mb-4">⚡ Performance SLA</h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs text-zinc-400">Acknowledgment</span>
                      <span className="text-xs text-emerald-400 font-medium">1.2s / 5s</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full" style={{ width: '24%' }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs text-zinc-400">Summary Generation</span>
                      <span className="text-xs text-cyan-400 font-medium">18s / 30s</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full" style={{ width: '60%' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Web Form Channel */}
        {activeChannel === 'form' && (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <form onSubmit={handleFormSubmit} className="bg-zinc-800/50 rounded-2xl border border-white/[0.06] shadow-lg shadow-black/20 p-6">
                <div className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-white/5 rounded-xl px-5 py-4 mb-6">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    📋 FNOL Web Form
                  </h2>
                  <p className="text-sm text-zinc-400 mt-1">Complete the form to submit your claim</p>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-white mb-2">
                      หมายเลขกรมธรรม์ <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.policyNumber}
                      onChange={(e) => setFormData({ ...formData, policyNumber: e.target.value })}
                      placeholder="1234567890"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      required
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">
                        วันที่เกิดเหตุ <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="date"
                        value={formData.incidentDate}
                        onChange={(e) => setFormData({ ...formData, incidentDate: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">
                        สถานที่เกิดเหตุ <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.incidentLocation}
                        onChange={(e) => setFormData({ ...formData, incidentLocation: e.target.value })}
                        placeholder="ถนนสุขุมวิท กรุงเทพฯ"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-white mb-2">
                      รายละเอียดเหตุการณ์ <span className="text-rose-400">*</span>
                    </label>
                    <textarea
                      value={formData.narrative}
                      onChange={(e) => setFormData({ ...formData, narrative: e.target.value })}
                      placeholder="กรุณาอธิบายรายละเอียดเหตุการณ์ที่เกิดขึ้น (อย่างน้อย 20 ตัวอักษร)"
                      rows={4}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
                      required
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <label className="flex items-center gap-3 p-4 bg-white/5 border border-white/10 rounded-xl cursor-pointer hover:bg-white/10 transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.injuriesReported}
                        onChange={(e) => setFormData({ ...formData, injuriesReported: e.target.checked })}
                        className="w-5 h-5 rounded bg-white/5 border-white/20 text-violet-500 focus:ring-2 focus:ring-violet-500/50"
                      />
                      <div>
                        <div className="text-sm font-medium text-white">มีผู้บาดเจ็บ</div>
                        <div className="text-xs text-zinc-400">Injuries reported</div>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-4 bg-white/5 border border-white/10 rounded-xl cursor-pointer hover:bg-white/10 transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.policeReportFiled}
                        onChange={(e) => setFormData({ ...formData, policeReportFiled: e.target.checked })}
                        className="w-5 h-5 rounded bg-white/5 border-white/20 text-violet-500 focus:ring-2 focus:ring-violet-500/50"
                      />
                      <div>
                        <div className="text-sm font-medium text-white">แจ้งความแล้ว</div>
                        <div className="text-xs text-zinc-400">Police report filed</div>
                      </div>
                    </label>
                  </div>

                  {formData.policeReportFiled && (
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">
                        หมายเลขใบแจ้งความ <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.policeReportNumber}
                        onChange={(e) => setFormData({ ...formData, policeReportNumber: e.target.value })}
                        placeholder="PR-2024-XXXXX"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                        required
                      />
                    </div>
                  )}

                  <div className="border-t border-white/5 pt-5">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.pdpaConsent}
                        onChange={(e) => setFormData({ ...formData, pdpaConsent: e.target.checked })}
                        className="w-5 h-5 mt-0.5 rounded bg-white/5 border-white/20 text-violet-500 focus:ring-2 focus:ring-violet-500/50"
                        required
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white mb-1">
                          ยินยอมให้ประมวลผลข้อมูลส่วนบุคคล (PDPA) <span className="text-rose-400">*</span>
                        </div>
                        <div className="text-xs text-zinc-400 leading-relaxed">
                          ข้าพเจ้ายินยอมให้บริษัทประมวลผลข้อมูลส่วนบุคคลเพื่อวัตถุประสงค์ในการพิจารณาสินไหมทดแทนและตรวจสอบการฉ้อโกง ข้อมูลจะถูกเก็บรักษาเป็นระยะเวลา 7 ปี
                        </div>
                      </div>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={!formData.pdpaConsent}
                    className="w-full py-4 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 disabled:from-zinc-700 disabled:to-zinc-700 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-violet-500/25 disabled:shadow-none"
                  >
                    ส่งแบบฟอร์มแจ้งเคลม
                  </button>
                </div>
              </form>
            </div>

            <div className="space-y-6">
              {submissionStatus && (
                <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 rounded-2xl border border-emerald-500/20 shadow-lg shadow-black/20 p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xl">
                      ✓
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-bold text-white">Form Submitted</h3>
                      <p className="text-xs text-emerald-400 mt-0.5">{submissionStatus.message}</p>
                    </div>
                  </div>
                  <div className="space-y-2 pt-3 border-t border-emerald-500/10">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-zinc-400">Claim ID</span>
                      <span className="text-xs font-mono text-white">{submissionStatus.claimId}</span>
                    </div>
                    {processingTime && (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-zinc-400">Processing Time</span>
                        <span className="text-xs text-emerald-400 font-medium">{processingTime}ms</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {showPhotoUpload && (
                <div className="bg-zinc-800/50 rounded-2xl border border-white/[0.06] shadow-lg shadow-black/20 p-5">
                  <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    📸 Upload Photos
                  </h3>
                  
                  <label className="block cursor-pointer">
                    <div className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center hover:border-violet-500/50 hover:bg-violet-500/5 transition-all">
                      <div className="text-3xl mb-2">📷</div>
                      <div className="text-sm font-medium text-white mb-1">Click to upload photos</div>
                      <div className="text-xs text-zinc-400">Max 10MB per file</div>
                    </div>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>

                  {uploadedPhotos.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {uploadedPhotos.map(photo => (
                        <div key={photo.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
                          <div className="w-12 h-12 rounded-lg bg-zinc-700 overflow-hidden flex-shrink-0">
                            {photo.preview && (
                              <img src={photo.preview} alt="" className="w-full h-full object-cover" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-white truncate">{photo.name}</div>
                            <div className="text-xs text-zinc-400">{photo.size}</div>
                            {photo.resolution && (
                              <div className="text-xs text-zinc-500">{photo.resolution}</div>
                            )}
                          </div>
                          <div>
                            {photo.status === 'validating' && (
                              <span className="inline-flex px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                                Validating...
                              </span>
                            )}
                            {photo.status === 'valid' && (
                              <span className="inline-flex px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                                ✓ Valid
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="bg-zinc-800/50 rounded-2xl border border-white/[0.06] shadow-lg shadow-black/20 p-5">
                <h3 className="text-sm font-bold text-white mb-4">📋 Required Documents</h3>
                <div className="space-y-2">
                  {[
                    { type: 'LICENSE', label: 'ใบขับขี่', required: true },
                    { type: 'PHOTO', label: 'รูปถ่ายความเสียหาย', required: true },
                    { type: 'POLICE_REPORT', label: 'ใบแจ้งความ', required: false },
                    { type: 'REPAIR_QUOTE', label: 'ใบเสนอราคาซ่อม', required: false }
                  ].map(doc => (
                    <div key={doc.type} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                      <span className="text-sm text-zinc-300">{doc.label}</span>
                      {doc.required ? (
                        <span className="text-xs text-rose-400 font-medium">Required</span>
                      ) : (
                        <span className="text-xs text-zinc-500">Optional</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Email Channel */}
        {activeChannel === 'email' && (
          <div className="space-y-6">
            <div className="bg-zinc-800/50 rounded-2xl border border-white/[0.06] shadow-lg shadow-black/20 overflow-hidden">
              <div className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 border-b border-white/5 px-6 py-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  📧 Email FNOL Submissions
                </h2>
                <p className="text-sm text-zinc-400 mt-1">Automated email intake processing</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Claim ID</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">From</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Subject</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Received</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Attachments</th>
                      <th className="text-left px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {emailSubmissions.map(email => (
                      <tr key={email.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4">
                          <span className="text-sm font-mono text-violet-400">{email.claimId}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-white">{email.from}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-zinc-300">{email.subject}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-zinc-400">{email.receivedAt}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-medium">
                            📎 {email.attachments}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {email.status === 'INTAKE' ? (
                            <span className="inline-flex px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
                              INTAKE
                            </span>
                          ) : (
                            <span className="inline-flex px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
                              PENDING CONSENT
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-zinc-800/50 rounded-2xl border border-white/[0.06] shadow-lg shadow-black/20 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white">Email Processing</h3>
                  <span className="text-2xl">⚙️</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-400">Auto-extraction</span>
                    <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                      Active
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-400">Policy Detection</span>
                    <span className="text-xs text-white font-medium">95% accuracy</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-400">Language Detection</span>
                    <span className="text-xs text-white font-medium">TH/EN</span>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-800/50 rounded-2xl border border-white/[0.06] shadow-lg shadow-black/20 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white">Attachment Processing</h3>
                  <span className="text-2xl">📎</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-400">Max File Size</span>
                    <span className="text-xs text-white font-medium">10 MB</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-400">Allowed Types</span>
                    <span className="text-xs text-zinc-500">JPG, PNG, PDF</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-400">Auto-validation</span>
                    <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                      Enabled
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-zinc-800/50 rounded-2xl border border-white/[0.06] shadow-lg shadow-black/20 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-white">PDPA Compliance</h3>
                  <span className="text-2xl">🔒</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-400">Consent Required</span>
                    <span className="inline-flex px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
                      Follow-up
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-400">Auto-notification</span>
                    <span className="text-xs text-white font-medium">Enabled</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-400">Retention</span>
                    <span className="text-xs text-white font-medium">7 years</span>
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