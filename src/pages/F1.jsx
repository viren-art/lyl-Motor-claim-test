export default function FNOLIntakePreview() {
  const [step, setStep] = useState('form');
  const [language, setLanguage] = useState('th');
  const [formData, setFormData] = useState({
    policyNumber: '',
    incidentDate: '',
    location: '',
    narrative: '',
    injuriesReported: false,
    policeReportFiled: false,
    policeReportNumber: '',
    pdpaConsent: false
  });
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [claimId, setClaimId] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    const newFiles = files.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: (file.size / 1024).toFixed(1) + ' KB',
      type: file.type.includes('image') ? 'image' : 'document',
      status: Math.random() > 0.2 ? 'valid' : 'invalid',
      reason: Math.random() > 0.2 ? null : 'Resolution below 800x600'
    }));
    setUploadedFiles([...uploadedFiles, ...newFiles]);
  };

  const handleSubmit = () => {
    if (!formData.pdpaConsent) {
      alert(language === 'th' 
        ? 'กรุณายินยอมให้ประมวลผลข้อมูลส่วนบุคคล' 
        : 'Please consent to PDPA data processing');
      return;
    }
    const generatedClaimId = 'CLM' + Math.random().toString(36).substr(2, 9).toUpperCase();
    setClaimId(generatedClaimId);
    setShowSuccess(true);
    setTimeout(() => setStep('success'), 500);
  };

  const validFiles = uploadedFiles.filter(f => f.status === 'valid');
  const invalidFiles = uploadedFiles.filter(f => f.status === 'invalid');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
      </div>

      <div className="max-w-3xl mx-auto relative z-10">
        {/* Header */}
        <div className="sticky top-0 z-20 backdrop-blur-2xl bg-slate-900/60 border border-white/10 rounded-2xl shadow-2xl shadow-black/40 mb-8 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/50">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-slate-900 animate-pulse"></div>
              </div>
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight bg-gradient-to-r from-white to-violet-200 bg-clip-text text-transparent">
                  {language === 'th' ? 'แจ้งเคลมออนไลน์' : 'FNOL Submission'}
                </h1>
                <p className="text-sm text-slate-400 font-medium">
                  {language === 'th' ? 'ระบบรับแจ้งเหตุอัตโนมัติ' : 'Automated Claims Intake'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-slate-800/50 rounded-xl p-1 border border-white/10">
              <button
                onClick={() => setLanguage('th')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  language === 'th'
                    ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                TH
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  language === 'en'
                    ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-violet-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                EN
              </button>
            </div>
          </div>
        </div>

        {step === 'form' && (
          <div className="space-y-6">
            {/* Progress Indicator */}
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-3xl p-6 border border-white/10 shadow-2xl shadow-black/40">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-sm font-bold text-white">
                      {language === 'th' ? 'ขั้นตอนที่ 1 จาก 3' : 'Step 1 of 3'}
                    </span>
                    <p className="text-xs text-slate-400">
                      {language === 'th' ? 'กรอกข้อมูลเบื้องต้น' : 'Basic Information'}
                    </p>
                  </div>
                </div>
                <span className="text-2xl font-black text-violet-400">33%</span>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 h-2.5 rounded-full bg-gradient-to-r from-violet-500 to-purple-600 shadow-lg shadow-violet-500/50"></div>
                <div className="flex-1 h-2.5 rounded-full bg-slate-700/50"></div>
                <div className="flex-1 h-2.5 rounded-full bg-slate-700/50"></div>
              </div>
            </div>

            {/* Policy Information */}
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-3xl p-6 border border-white/10 shadow-2xl shadow-black/40 hover:border-violet-500/30 transition-all duration-300">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-xl font-black text-white">
                  {language === 'th' ? 'ข้อมูลกรมธรรม์' : 'Policy Information'}
                </h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                    </svg>
                    {language === 'th' ? 'เลขที่กรมธรรม์' : 'Policy Number'}
                  </label>
                  <input
                    type="text"
                    placeholder={language === 'th' ? '1234567890' : '1234567890'}
                    value={formData.policyNumber}
                    onChange={(e) => setFormData({...formData, policyNumber: e.target.value})}
                    className="w-full rounded-xl bg-slate-900/50 border border-slate-700 py-3.5 px-4 text-white placeholder-slate-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all shadow-inner"
                  />
                  <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    {language === 'th' ? 'ตัวเลข 10 หลัก' : '10-digit number'}
                  </p>
                </div>
              </div>
            </div>

            {/* Incident Details */}
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-3xl p-6 border border-white/10 shadow-2xl shadow-black/40 hover:border-violet-500/30 transition-all duration-300">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-lg shadow-red-500/30">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h2 className="text-xl font-black text-white">
                  {language === 'th' ? 'รายละเอียดเหตุการณ์' : 'Incident Details'}
                </h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {language === 'th' ? 'วันที่เกิดเหตุ' : 'Incident Date'}
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.incidentDate}
                    onChange={(e) => setFormData({...formData, incidentDate: e.target.value})}
                    className="w-full rounded-xl bg-slate-900/50 border border-slate-700 py-3.5 px-4 text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all shadow-inner"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    {language === 'th' ? 'สถานที่เกิดเหตุ' : 'Location'}
                  </label>
                  <input
                    type="text"
                    placeholder={language === 'th' ? 'ถนนสุขุมวิท แขวงคลองเตย กรุงเทพฯ' : 'Sukhumvit Road, Bangkok'}
                    value={formData.location}
                    onChange={(e) => setFormData({...formData, location: e.target.value})}
                    className="w-full rounded-xl bg-slate-900/50 border border-slate-700 py-3.5 px-4 text-white placeholder-slate-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all shadow-inner"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    {language === 'th' ? 'อธิบายเหตุการณ์' : 'Incident Description'}
                  </label>
                  <textarea
                    placeholder={language === 'th' 
                      ? 'กรุณาอธิบายเหตุการณ์ที่เกิดขึ้นอย่างละเอียด (ขั้นต่ำ 20 ตัวอักษร)'
                      : 'Please describe the incident in detail (minimum 20 characters)'}
                    value={formData.narrative}
                    onChange={(e) => setFormData({...formData, narrative: e.target.value})}
                    rows={4}
                    className="w-full rounded-xl bg-slate-900/50 border border-slate-700 py-3.5 px-4 text-white placeholder-slate-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none resize-none transition-all shadow-inner"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-slate-500">
                      {formData.narrative.length}/20 {language === 'th' ? 'ตัวอักษร' : 'characters'}
                    </p>
                    {formData.narrative.length >= 20 && (
                      <span className="text-xs text-green-400 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        {language === 'th' ? 'ครบถ้วน' : 'Complete'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Additional Information */}
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-3xl p-6 border border-white/10 shadow-2xl shadow-black/40 hover:border-violet-500/30 transition-all duration-300">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <h2 className="text-xl font-black text-white">
                  {language === 'th' ? 'ข้อมูลเพิ่มเติม' : 'Additional Information'}
                </h2>
              </div>
              <div className="space-y-3">
                <label className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/50 border border-slate-700 cursor-pointer hover:border-violet-500/50 hover:bg-slate-800/50 transition-all group">
                  <input
                    type="checkbox"
                    checked={formData.injuriesReported}
                    onChange={(e) => setFormData({...formData, injuriesReported: e.target.checked})}
                    className="w-5 h-5 rounded-lg border-slate-600 bg-slate-800 text-violet-500 focus:ring-2 focus:ring-violet-500 focus:ring-offset-0 transition-all"
                  />
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
                      <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <span className="text-sm font-semibold text-slate-300">
                      {language === 'th' ? 'มีผู้บาดเจ็บ' : 'Injuries Reported'}
                    </span>
                  </div>
                </label>
                <label className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/50 border border-slate-700 cursor-pointer hover:border-violet-500/50 hover:bg-slate-800/50 transition-all group">
                  <input
                    type="checkbox"
                    checked={formData.policeReportFiled}
                    onChange={(e) => setFormData({...formData, policeReportFiled: e.target.checked})}
                    className="w-5 h-5 rounded-lg border-slate-600 bg-slate-800 text-violet-500 focus:ring-2 focus:ring-violet-500 focus:ring-offset-0 transition-all"
                  />
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                      <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <span className="text-sm font-semibold text-slate-300">
                      {language === 'th' ? 'มีการแจ้งความ' : 'Police Report Filed'}
                    </span>
                  </div>
                </label>
                {formData.policeReportFiled && (
                  <div className="ml-4 pl-4 border-l-2 border-violet-500/30">
                    <input
                      type="text"
                      placeholder={language === 'th' ? 'เลขที่ใบแจ้งความ' : 'Police Report Number'}
                      value={formData.policeReportNumber}
                      onChange={(e) => setFormData({...formData, policeReportNumber: e.target.value})}
                      className="w-full rounded-xl bg-slate-900/50 border border-slate-700 py-3.5 px-4 text-white placeholder-slate-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all shadow-inner"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* File Upload */}
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-3xl p-6 border border-white/10 shadow-2xl shadow-black/40 hover:border-violet-500/30 transition-all duration-300">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </div>
                <h2 className="text-xl font-black text-white">
                  {language === 'th' ? 'แนบเอกสาร' : 'Attach Documents'}
                </h2>
              </div>
              <div className="space-y-4">
                <label className="block">
                  <div className="relative border-2 border-dashed border-slate-700 rounded-2xl p-10 text-center cursor-pointer hover:border-violet-500 hover:bg-slate-800/30 transition-all group">
                    <input
                      type="file"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                      accept="image/*,.pdf"
                    />
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <svg className="w-8 h-8 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <p className="text-base text-slate-300 font-bold mb-1">
                      {language === 'th' ? 'คลิกเพื่ออัพโหลดไฟล์' : 'Click to upload files'}
                    </p>
                    <p className="text-sm text-slate-500">
                      {language === 'th' ? 'รองรับ JPG, PNG, PDF (สูงสุด 10MB)' : 'Supports JPG, PNG, PDF (max 10MB)'}
                    </p>
                  </div>
                </label>

                {uploadedFiles.length > 0 && (
                  <div className="space-y-3">
                    {validFiles.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-6 h-6 rounded-lg bg-green-500/20 flex items-center justify-center">
                            <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <p className="text-sm font-bold text-green-400">
                            {language === 'th' ? 'ไฟล์ที่ถูกต้อง' : 'Valid Files'} ({validFiles.length})
                          </p>
                        </div>
                        <div className="space-y-2">
                          {validFiles.map(file => (
                            <div key={file.id} className="flex items-center justify-between p-4 rounded-xl bg-green-500/10 border border-green-500/30 hover:bg-green-500/20 transition-all group">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                                  {file.type === 'image' ? (
                                    <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                  ) : (
                                    <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm text-white font-semibold">{file.name}</p>
                                  <p className="text-xs text-slate-400">{file.size}</p>
                                </div>
                              </div>
                              <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                                <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {invalidFiles.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-6 h-6 rounded-lg bg-red-500/20 flex items-center justify-center">
                            <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <p className="text-sm font-bold text-red-400">
                            {language === 'th' ? 'ไฟล์ที่ไม่ถูกต้อง' : 'Invalid Files'} ({invalidFiles.length})
                          </p>
                        </div>
                        <div className="space-y-2">
                          {invalidFiles.map(file => (
                            <div key={file.id} className="flex items-center justify-between p-4 rounded-xl bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-all group">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                                  {file.type === 'image' ? (
                                    <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                  ) : (
                                    <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                  )}
                                </div>
                                <div>
                                  <p className="text-sm text-white font-semibold">{file.name}</p>
                                  <p className="text-xs text-red-400">{file.reason}</p>
                                </div>
                              </div>
                              <button className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center hover:bg-red-500/30 transition-colors">
                                <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* PDPA Consent */}
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-3xl p-6 border border-white/10 shadow-2xl shadow-black/40 hover:border-violet-500/30 transition-all duration-300">
              <label className="flex items-start gap-4 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={formData.pdpaConsent}
                  onChange={(e) => setFormData({...formData, pdpaConsent: e.target.checked})}
                  className="w-6 h-6 rounded-lg border-slate-600 bg-slate-800 text-violet-500 focus:ring-2 focus:ring-violet-500 focus:ring-offset-0 transition-all mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span className="text-sm font-bold text-white">
                      {language === 'th' ? 'ความยินยอม PDPA' : 'PDPA Consent'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {language === 'th' 
                      ? 'ข้าพเจ้ายินยอมให้บริษัทประมวลผลข้อมูลส่วนบุคคลตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562'
                      : 'I consent to the processing of my personal data in accordance with the Personal Data Protection Act B.E. 2562 (2019)'}
                  </p>
                  <a href="#" className="text-sm text-violet-400 hover:text-violet-300 mt-2 inline-flex items-center gap-1 font-semibold group-hover:gap-2 transition-all">
                    {language === 'th' ? 'อ่านนโยบายความเป็นส่วนตัว' : 'Read Privacy Policy'}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                </div>
              </label>
            </div>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={!formData.pdpaConsent || formData.narrative.length < 20}
              className="relative w-full py-5 rounded-2xl bg-gradient-to-r from-violet-500 via-purple-600 to-indigo-600 text-white font-black text-lg shadow-2xl shadow-violet-500/40 hover:shadow-violet-500/60 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all overflow-hidden group"
            >
              <span className="relative z-10 flex items-center justify-center gap-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {language === 'th' ? 'ส่งข้อมูลเคลม' : 'Submit Claim'}
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-purple-700 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </button>
          </div>
        )}

        {step === 'success' && (
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-xl rounded-3xl p-10 border border-white/10 shadow-2xl shadow-black/40 text-center">
            <div className="relative w-24 h-24 mx-auto mb-6">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full animate-pulse"></div>
              <div className="absolute inset-2 bg-slate-900 rounded-full flex items-center justify-center">
                <svg className="w-12 h-12 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h2 className="text-3xl font-black text-white mb-3 bg-gradient-to-r from-white to-violet-200 bg-clip-text text-transparent">
              {language === 'th' ? 'ส่งข้อมูลสำเร็จ!' : 'Submission Successful!'}
            </h2>
            <p className="text-slate-400 mb-6 text-lg">
              {language === 'th' ? 'หมายเลขเคลมของคุณ' : 'Your claim number'}
            </p>
            <div className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 border border-violet-500/30 mb-8">
              <svg className="w-6 h-6 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
              </svg>
              <span className="font-mono text-violet-400 text-2xl font-black tracking-wider">{claimId}</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>
                {language === 'th' 
                  ? 'เราจะติดต่อกลับภายใน 24 ชั่วโมง'
                  : 'We will contact you within 24 hours'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}