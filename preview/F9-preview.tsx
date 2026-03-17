import React from 'react';

export default function LLMServiceMonitorPreview() {
  const [selectedTab, setSelectedTab] = React.useState('overview');
  const [primaryCircuitState, setPrimaryCircuitState] = React.useState('CLOSED');
  const [secondaryCircuitState, setSecondaryCircuitState] = React.useState('CLOSED');
  const [simulateFailure, setSimulateFailure] = React.useState(false);
  const [requestLog, setRequestLog] = React.useState([
    { id: 1, timestamp: '2024-01-15 14:23:45', service: 'primary', status: 'success', duration: 234, claimId: 'CLM-2024-001' },
    { id: 2, timestamp: '2024-01-15 14:23:47', service: 'primary', status: 'success', duration: 189, claimId: 'CLM-2024-002' },
    { id: 3, timestamp: '2024-01-15 14:23:50', service: 'primary', status: 'success', duration: 267, claimId: 'CLM-2024-003' },
  ]);
  const [metrics, setMetrics] = React.useState({
    primary: { total: 1247, success: 1235, failed: 12, rejected: 0, avgDuration: 245 },
    secondary: { total: 23, success: 23, failed: 0, rejected: 0, avgDuration: 312 }
  });
  const [alerts, setAlerts] = React.useState([]);

  const handleSimulateRequest = () => {
    const newRequest = {
      id: requestLog.length + 1,
      timestamp: new Date().toLocaleString('th-TH', { hour12: false }),
      service: primaryCircuitState === 'OPEN' ? 'secondary' : 'primary',
      status: simulateFailure ? 'failed' : 'success',
      duration: Math.floor(Math.random() * 300) + 150,
      claimId: `CLM-2024-${String(requestLog.length + 1).padStart(3, '0')}`
    };

    setRequestLog(prev => [newRequest, ...prev.slice(0, 9)]);

    if (simulateFailure && primaryCircuitState === 'CLOSED') {
      const failCount = requestLog.filter(r => r.status === 'failed' && r.service === 'primary').length + 1;
      if (failCount >= 3) {
        setPrimaryCircuitState('OPEN');
        setAlerts(prev => [{
          id: Date.now(),
          type: 'OUTAGE',
          service: 'primary',
          message: 'Primary LLM service circuit breaker opened due to consecutive failures',
          timestamp: new Date().toLocaleString('th-TH', { hour12: false }),
          severity: 'CRITICAL'
        }, ...prev]);
        
        setTimeout(() => {
          setPrimaryCircuitState('HALF_OPEN');
        }, 3000);
      }
    }

    setMetrics(prev => ({
      ...prev,
      [newRequest.service]: {
        ...prev[newRequest.service],
        total: prev[newRequest.service].total + 1,
        success: prev[newRequest.service].success + (simulateFailure ? 0 : 1),
        failed: prev[newRequest.service].failed + (simulateFailure ? 1 : 0)
      }
    }));
  };

  const handleForceCircuitState = (service, state) => {
    if (service === 'primary') {
      setPrimaryCircuitState(state);
      if (state === 'CLOSED') {
        setAlerts(prev => [{
          id: Date.now(),
          type: 'RECOVERY',
          service: 'primary',
          message: 'Primary LLM service recovered - circuit breaker closed',
          timestamp: new Date().toLocaleString('th-TH', { hour12: false }),
          severity: 'INFO'
        }, ...prev]);
      }
    } else {
      setSecondaryCircuitState(state);
    }
  };

  const getCircuitStateColor = (state) => {
    switch (state) {
      case 'CLOSED': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'OPEN': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'HALF_OPEN': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default: return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
    }
  };

  const getHealthStatus = () => {
    if (primaryCircuitState === 'CLOSED') return { status: 'HEALTHY', color: 'emerald' };
    if (secondaryCircuitState === 'CLOSED') return { status: 'DEGRADED', color: 'amber' };
    return { status: 'UNAVAILABLE', color: 'rose' };
  };

  const health = getHealthStatus();

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-zinc-900/80 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <span className="text-xl">🛡️</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold">LLM Service Monitor</h1>
                  <p className="text-xs text-zinc-400">Circuit Breaker & Failover Management</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${
                health.status === 'HEALTHY' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                health.status === 'DEGRADED' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                'bg-rose-500/10 text-rose-400 border-rose-500/20'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  health.status === 'HEALTHY' ? 'bg-emerald-400' :
                  health.status === 'DEGRADED' ? 'bg-amber-400' :
                  'bg-rose-400'
                } animate-pulse`}></div>
                <span className="text-sm font-semibold">{health.status}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/5 bg-zinc-900/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1">
            {['overview', 'circuits', 'requests', 'alerts'].map(tab => (
              <button
                key={tab}
                onClick={() => setSelectedTab(tab)}
                className={`px-6 py-3 text-sm font-semibold capitalize transition-colors relative ${
                  selectedTab === tab
                    ? 'text-violet-400'
                    : 'text-zinc-400 hover:text-zinc-300'
                }`}
              >
                {tab}
                {selectedTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500"></div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Overview Tab */}
        {selectedTab === 'overview' && (
          <div className="space-y-6">
            {/* Service Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Primary Service */}
              <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">🎯</span>
                      <h3 className="text-lg font-bold">Primary Service</h3>
                    </div>
                    <p className="text-xs text-zinc-400">http://localhost:8001</p>
                  </div>
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-medium ${getCircuitStateColor(primaryCircuitState)}`}>
                    {primaryCircuitState}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-zinc-400">Total Requests</span>
                    <span className="text-sm font-semibold">{metrics.primary.total.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-zinc-400">Success Rate</span>
                    <span className="text-sm font-semibold text-emerald-400">
                      {((metrics.primary.success / metrics.primary.total) * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-zinc-400">Failed</span>
                    <span className="text-sm font-semibold text-rose-400">{metrics.primary.failed}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-zinc-400">Avg Duration</span>
                    <span className="text-sm font-semibold">{metrics.primary.avgDuration}ms</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-white/5">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleForceCircuitState('primary', 'OPEN')}
                      className="flex-1 px-3 py-2 rounded-lg bg-rose-500/10 text-rose-400 text-xs font-semibold hover:bg-rose-500/20 transition-colors"
                    >
                      Force Open
                    </button>
                    <button
                      onClick={() => handleForceCircuitState('primary', 'CLOSED')}
                      className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors"
                    >
                      Force Close
                    </button>
                  </div>
                </div>
              </div>

              {/* Secondary Service */}
              <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">🔄</span>
                      <h3 className="text-lg font-bold">Secondary Service</h3>
                    </div>
                    <p className="text-xs text-zinc-400">http://backup.example.com</p>
                  </div>
                  <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-medium ${getCircuitStateColor(secondaryCircuitState)}`}>
                    {secondaryCircuitState}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-zinc-400">Total Requests</span>
                    <span className="text-sm font-semibold">{metrics.secondary.total.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-zinc-400">Success Rate</span>
                    <span className="text-sm font-semibold text-emerald-400">
                      {((metrics.secondary.success / metrics.secondary.total) * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-sm text-zinc-400">Failed</span>
                    <span className="text-sm font-semibold text-rose-400">{metrics.secondary.failed}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-zinc-400">Avg Duration</span>
                    <span className="text-sm font-semibold">{metrics.secondary.avgDuration}ms</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-white/5">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleForceCircuitState('secondary', 'OPEN')}
                      className="flex-1 px-3 py-2 rounded-lg bg-rose-500/10 text-rose-400 text-xs font-semibold hover:bg-rose-500/20 transition-colors"
                    >
                      Force Open
                    </button>
                    <button
                      onClick={() => handleForceCircuitState('secondary', 'CLOSED')}
                      className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors"
                    >
                      Force Close
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Test Controls */}
            <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span>🧪</span>
                Test Controls
              </h3>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simulateFailure}
                    onChange={(e) => setSimulateFailure(e.target.checked)}
                    className="w-5 h-5 rounded bg-zinc-700 border-white/10 text-violet-500 focus:ring-2 focus:ring-violet-500/50"
                  />
                  <span className="text-sm font-medium">Simulate Failures</span>
                </label>
                <button
                  onClick={handleSimulateRequest}
                  className="px-6 py-3 rounded-xl bg-violet-500 hover:bg-violet-600 text-white font-semibold transition-colors"
                >
                  Send Test Request
                </button>
              </div>
            </div>

            {/* Recent Alerts */}
            {alerts.length > 0 && (
              <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span>🚨</span>
                  Recent Alerts
                </h3>
                <div className="space-y-3">
                  {alerts.slice(0, 3).map(alert => (
                    <div
                      key={alert.id}
                      className={`p-4 rounded-xl border ${
                        alert.severity === 'CRITICAL'
                          ? 'bg-rose-500/10 border-rose-500/20'
                          : 'bg-cyan-500/10 border-cyan-500/20'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <span className={`text-xs font-semibold ${
                          alert.severity === 'CRITICAL' ? 'text-rose-400' : 'text-cyan-400'
                        }`}>
                          {alert.type}
                        </span>
                        <span className="text-xs text-zinc-400">{alert.timestamp}</span>
                      </div>
                      <p className="text-sm text-zinc-300">{alert.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Circuits Tab */}
        {selectedTab === 'circuits' && (
          <div className="space-y-6">
            <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
              <h3 className="text-lg font-bold mb-6">Circuit Breaker Configuration</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Thresholds</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                      <span className="text-sm text-zinc-400">Failure Threshold</span>
                      <span className="text-sm font-semibold">3 consecutive failures</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                      <span className="text-sm text-zinc-400">Success Threshold</span>
                      <span className="text-sm font-semibold">2 consecutive successes</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                      <span className="text-sm text-zinc-400">Request Timeout</span>
                      <span className="text-sm font-semibold">10,000ms</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-zinc-400">Reset Timeout</span>
                      <span className="text-sm font-semibold">30,000ms</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Monitoring</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                      <span className="text-sm text-zinc-400">Health Check Interval</span>
                      <span className="text-sm font-semibold">30,000ms</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                      <span className="text-sm text-zinc-400">Health Check Timeout</span>
                      <span className="text-sm font-semibold">5,000ms</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                      <span className="text-sm text-zinc-400">Half-Open Max Attempts</span>
                      <span className="text-sm font-semibold">5 concurrent</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-zinc-400">Monitoring Window</span>
                      <span className="text-sm font-semibold">60,000ms</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* State Diagram */}
            <div className="bg-zinc-800/50 rounded-2xl p-6 border border-white/[0.06] shadow-lg shadow-black/20">
              <h3 className="text-lg font-bold mb-6">Circuit Breaker State Flow</h3>
              <div className="flex items-center justify-center gap-8 py-8">
                <div className="text-center">
                  <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center mb-2">
                    <span className="text-2xl font-bold text-emerald-400">C</span>
                  </div>
                  <span className="text-xs font-semibold text-emerald-400">CLOSED</span>
                  <p className="text-xs text-zinc-500 mt-1">Normal operation</p>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <span className="text-zinc-400">→</span>
                  <span className="text-xs text-zinc-500">3 failures</span>
                </div>

                <div className="text-center">
                  <div className="w-24 h-24 rounded-full bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center mb-2">
                    <span className="text-2xl font-bold text-rose-400">O</span>
                  </div>
                  <span className="text-xs font-semibold text-rose-400">OPEN</span>
                  <p className="text-xs text-zinc-500 mt-1">Reject requests</p>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <span className="text-zinc-400">→</span>
                  <span className="text-xs text-zinc-500">30s timeout</span>
                </div>

                <div className="text-center">
                  <div className="w-24 h-24 rounded-full bg-amber-500/20 border-2 border-amber-500 flex items-center justify-center mb-2">
                    <span className="text-2xl font-bold text-amber-400">H</span>
                  </div>
                  <span className="text-xs font-semibold text-amber-400">HALF-OPEN</span>
                  <p className="text-xs text-zinc-500 mt-1">Testing recovery</p>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <span className="text-zinc-400">→</span>
                  <span className="text-xs text-zinc-500">2 successes</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Requests Tab */}
        {selectedTab === 'requests' && (
          <div className="bg-zinc-800/50 rounded-2xl border border-white/[0.06] shadow-lg shadow-black/20 overflow-hidden">
            <div className="p-6 border-b border-white/5">
              <h3 className="text-lg font-bold">Request Log</h3>
              <p className="text-sm text-zinc-400 mt-1">Recent LLM service requests</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-zinc-900/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Timestamp</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Claim ID</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Service</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wider">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {requestLog.map(req => (
                    <tr key={req.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 text-sm text-zinc-300">{req.timestamp}</td>
                      <td className="px-6 py-4 text-sm font-mono text-zinc-300">{req.claimId}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          req.service === 'primary' 
                            ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                            : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                        }`}>
                          {req.service}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          req.status === 'success'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {req.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-300">{req.duration}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Alerts Tab */}
        {selectedTab === 'alerts' && (
          <div className="space-y-4">
            {alerts.length === 0 ? (
              <div className="bg-zinc-800/50 rounded-2xl p-12 border border-white/[0.06] shadow-lg shadow-black/20 text-center">
                <div className="text-6xl mb-4">✅</div>
                <h3 className="text-lg font-bold mb-2">No Active Alerts</h3>
                <p className="text-sm text-zinc-400">All services are operating normally</p>
              </div>
            ) : (
              alerts.map(alert => (
                <div
                  key={alert.id}
                  className={`bg-zinc-800/50 rounded-2xl p-6 border shadow-lg shadow-black/20 ${
                    alert.severity === 'CRITICAL'
                      ? 'border-rose-500/20'
                      : 'border-cyan-500/20'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{alert.severity === 'CRITICAL' ? '🚨' : 'ℹ️'}</span>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-sm font-bold ${
                            alert.severity === 'CRITICAL' ? 'text-rose-400' : 'text-cyan-400'
                          }`}>
                            {alert.type}
                          </span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            alert.severity === 'CRITICAL'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                          }`}>
                            {alert.service}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-300">{alert.message}</p>
                      </div>
                    </div>
                    <span className="text-xs text-zinc-500">{alert.timestamp}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}