import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Zap, BarChart3, Activity, ArrowLeft, Radio, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Execution {
  instrument: string;
  direction: string;
  status: string;
  detail: string;
}

interface AgentResult {
  success: boolean;
  reason?: string;
  detail?: string;
  agent?: string;
  session?: string;
  executions?: Execution[];
  log?: string[];
  timestamp?: string;
  error?: string;
}

interface PricingData {
  bid: number;
  ask: number;
  spread: number;
  mid: number;
}

const INSTRUMENTS = ['EUR_USD', 'GBP_USD', 'USD_JPY'];

const NYCLoveDashboard = () => {
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null);
  const [pricing, setPricing] = useState<Record<string, PricingData>>({});
  const [loading, setLoading] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);
  const [logs, setLogs] = useState<string[]>([
    '[SYSTEM] NYC Love Agent dashboard initialized',
    '[SYSTEM] Awaiting manual trigger or auto-scan activation...',
  ]);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  // Fetch live pricing for spread shield display
  const fetchPricing = useCallback(async () => {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/oanda-pricing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
      });
      const data = await res.json();
      if (data.prices) {
        const mapped: Record<string, PricingData> = {};
        for (const inst of INSTRUMENTS) {
          const display = inst.replace('_', '/');
          if (data.prices[display]) {
            const p = data.prices[display];
            const pv = inst.includes('JPY') ? 100 : 10000;
            mapped[inst] = {
              bid: p.bid,
              ask: p.ask,
              mid: p.mid,
              spread: (p.ask - p.bid) * pv,
            };
          }
        }
        setPricing(mapped);
      }
    } catch (e) {
      console.error('[NYC-LOVE] Pricing fetch error:', e);
    }
  }, [supabaseUrl, apiKey]);

  // Invoke the NYC Love Agent edge function
  const runAgent = useCallback(async () => {
    setLoading(true);
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${ts}] Invoking NYC Love Agent...`]);

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/nyc-love-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
      });
      const data: AgentResult = await res.json();
      setAgentResult(data);
      setCycleCount(c => c + 1);

      // Append agent logs
      if (data.log) {
        setLogs(prev => [...prev, ...data.log!.map(l => `[${ts}] ${l}`)]);
      }
      if (data.reason === 'session_gate') {
        setLogs(prev => [...prev, `[${ts}] ⏳ Session gate: ${data.detail}`]);
      }
      if (data.executions) {
        for (const ex of data.executions) {
          const icon = ex.status === 'filled' ? '✅' : ex.status === 'spread_blocked' ? '🛡️' : '⚠️';
          setLogs(prev => [...prev, `[${ts}] ${icon} ${ex.instrument} ${ex.direction} → ${ex.status} (${ex.detail})`]);
        }
      }
    } catch (e) {
      setLogs(prev => [...prev, `[${ts}] ❌ Agent error: ${(e as Error).message}`]);
    } finally {
      setLoading(false);
    }
  }, [supabaseUrl, apiKey]);

  // Auto-refresh pricing
  useEffect(() => {
    fetchPricing();
    const iv = setInterval(fetchPricing, 10_000);
    return () => clearInterval(iv);
  }, [fetchPricing]);

  // Auto-mode: run agent every 5 minutes
  useEffect(() => {
    if (!autoMode) return;
    runAgent();
    const iv = setInterval(runAgent, 5 * 60_000);
    return () => clearInterval(iv);
  }, [autoMode, runAgent]);

  // Compute average spread across instruments
  const avgSpread = INSTRUMENTS.reduce((s, i) => s + (pricing[i]?.spread || 0), 0) / Math.max(Object.keys(pricing).length, 1);
  const spreadOk = avgSpread <= 1.2;

  // Session status
  const now = new Date();
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const utcMinutes = utcH * 60 + utcM;
  const sessionActive = utcMinutes >= 780 && utcMinutes <= 870;

  const lastExecCount = agentResult?.executions?.filter(e => e.status === 'filled').length || 0;

  return (
    <div className="min-h-screen bg-black text-blue-100 font-mono">
      {/* Header */}
      <div className="border-b border-blue-900/60 px-6 py-3 flex justify-between items-center bg-slate-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link to="/citadel" className="text-blue-500 hover:text-blue-300 transition-colors">
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-lg font-bold tracking-tighter text-blue-400">
            NYC LOVE <span className="text-blue-600">//</span> LIVE_FEED
          </h1>
          <div className="h-4 w-px bg-blue-900" />
          <span className="text-[10px] text-blue-600">agent_id: nyc-love</span>
        </div>
        <div className="flex gap-3 items-center">
          <span className="bg-blue-950/80 px-3 py-1 rounded text-[10px] border border-blue-800/50">
            OANDA: {Object.keys(pricing).length > 0 ? 'CONNECTED' : 'WAITING'}
          </span>
          <span className={`px-3 py-1 rounded text-[10px] border ${sessionActive
            ? 'bg-green-950/80 border-green-800/50 text-green-400'
            : 'bg-yellow-950/80 border-yellow-800/50 text-yellow-400'
          }`}>
            {sessionActive ? 'SESSION: ACTIVE' : 'SESSION: DORMANT'}
          </span>
          <span className="text-[10px] text-blue-600">
            {utcH.toString().padStart(2, '0')}:{utcM.toString().padStart(2, '0')} UTC
          </span>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Controls */}
        <div className="flex gap-3 items-center">
          <button
            onClick={runAgent}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:text-blue-600 text-white text-xs px-4 py-2 rounded font-bold tracking-wider transition-colors"
          >
            {loading ? 'SCANNING...' : '▶ INVOKE AGENT'}
          </button>
          <button
            onClick={() => setAutoMode(!autoMode)}
            className={`text-xs px-4 py-2 rounded font-bold tracking-wider transition-colors border ${autoMode
              ? 'bg-green-900/50 border-green-700 text-green-400 hover:bg-green-900/70'
              : 'bg-slate-900/50 border-slate-700 text-slate-400 hover:bg-slate-800/50'
            }`}
          >
            <Radio size={12} className="inline mr-1" />
            {autoMode ? 'AUTO: ON (5min)' : 'AUTO: OFF'}
          </button>
          <span className="text-[10px] text-blue-600 ml-auto">cycles: {cycleCount}</span>
        </div>

        {/* 3 Core Gauges */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Spread Shield */}
          <div className="bg-slate-900/40 p-5 border border-blue-900/30 rounded-lg">
            <div className="flex items-center gap-2 mb-3 text-blue-400 text-xs font-bold tracking-wider">
              <Shield size={14} /> SPREAD SHIELD
            </div>
            <div className="space-y-2">
              {INSTRUMENTS.map(inst => {
                const p = pricing[inst];
                const spread = p?.spread || 0;
                const ok = spread <= 1.2;
                return (
                  <div key={inst} className="flex justify-between items-center text-xs">
                    <span className="text-blue-300">{inst.replace('_', '/')}</span>
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${ok ? 'text-green-400' : 'text-red-400'}`}>
                        {spread.toFixed(1)}
                      </span>
                      <span className="text-blue-700">pips</span>
                      {ok
                        ? <span className="text-green-500 text-[10px]">✓</span>
                        : <AlertTriangle size={10} className="text-red-500" />
                      }
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={`text-[10px] mt-3 pt-2 border-t border-blue-900/30 ${spreadOk ? 'text-green-500' : 'text-red-400'}`}>
              {spreadOk ? '✓ ALL WITHIN LIMIT (1.2)' : '⚠ SPREAD BREACH DETECTED'}
            </div>
          </div>

          {/* Velocity Feeler */}
          <div className="bg-slate-900/40 p-5 border border-purple-900/30 rounded-lg">
            <div className="flex items-center gap-2 mb-3 text-purple-400 text-xs font-bold tracking-wider">
              <Zap size={14} /> VELOCITY FEELER
            </div>
            {agentResult?.executions ? (
              <div className="space-y-2">
                {agentResult.executions.map((ex, i) => {
                  const isSpike = ex.detail.includes('vel=');
                  return (
                    <div key={i} className="flex justify-between items-center text-xs">
                      <span className="text-purple-300">{ex.instrument.replace('_', '/')}</span>
                      <span className={`font-bold ${ex.status === 'filled' ? 'text-green-400' : 'text-purple-500'}`}>
                        {ex.status.toUpperCase()}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-purple-600 text-xs">Awaiting agent invocation...</div>
            )}
            <div className="text-[10px] mt-3 pt-2 border-t border-purple-900/30 text-purple-500">
              THRESHOLD: 1.5x AVG VOLUME
            </div>
          </div>

          {/* Sovereign Gauge */}
          <div className="bg-slate-900/40 p-5 border border-orange-900/30 rounded-lg">
            <div className="flex items-center gap-2 mb-3 text-orange-400 text-xs font-bold tracking-wider">
              <BarChart3 size={14} /> SOVEREIGN GAUGE
            </div>
            <div className="space-y-2">
              {INSTRUMENTS.map(inst => {
                const p = pricing[inst];
                return (
                  <div key={inst} className="flex justify-between items-center text-xs">
                    <span className="text-orange-300">{inst.replace('_', '/')}</span>
                    <span className="text-orange-200 font-bold">
                      {p ? p.mid.toFixed(inst.includes('JPY') ? 3 : 5) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="text-[10px] mt-3 pt-2 border-t border-orange-900/30 text-orange-500">
              DIRECTION: SOVEREIGN MATRIX RANKS
            </div>
          </div>
        </div>

        {/* Execution Summary */}
        {agentResult && (
          <div className="bg-slate-900/40 border border-blue-900/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3 text-xs font-bold tracking-wider text-blue-400">
              <Activity size={14} /> LAST CYCLE RESULT
              <span className="ml-auto text-[10px] text-blue-600">
                {agentResult.timestamp ? new Date(agentResult.timestamp).toLocaleTimeString() : '—'}
              </span>
            </div>
            {agentResult.reason === 'session_gate' ? (
              <div className="text-yellow-400 text-xs flex items-center gap-2">
                <AlertTriangle size={12} />
                {agentResult.detail}
              </div>
            ) : agentResult.executions && agentResult.executions.length > 0 ? (
              <div className="space-y-1">
                {agentResult.executions.map((ex, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs py-1 border-b border-blue-900/20 last:border-0">
                    <span className="text-blue-300 w-16">{ex.instrument.replace('_', '/')}</span>
                    <span className={`w-12 font-bold ${ex.direction === 'BUY' ? 'text-green-400' : ex.direction === 'SELL' ? 'text-red-400' : 'text-slate-500'}`}>
                      {ex.direction === 'long' ? <TrendingUp size={12} className="inline text-green-400" /> : ex.direction === 'short' ? <TrendingDown size={12} className="inline text-red-400" /> : null}
                      {' '}{ex.direction}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      ex.status === 'filled' ? 'bg-green-900/50 text-green-400' :
                      ex.status === 'spread_blocked' ? 'bg-red-900/50 text-red-400' :
                      ex.status === 'skipped' ? 'bg-yellow-900/50 text-yellow-400' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      {ex.status}
                    </span>
                    <span className="text-blue-600 text-[10px] ml-auto truncate max-w-[200px]">{ex.detail}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-blue-600 text-xs">No executions this cycle</div>
            )}
          </div>
        )}

        {/* Live Log Feed */}
        <div className="bg-slate-950/80 border border-blue-900/40 rounded-lg">
          <div className="flex items-center justify-between px-4 py-2 border-b border-blue-900/30">
            <span className="text-[10px] font-bold tracking-wider text-blue-500">AGENT LOG FEED</span>
            <button
              onClick={() => setLogs(['[SYSTEM] Log cleared'])}
              className="text-[10px] text-blue-700 hover:text-blue-400 transition-colors"
            >
              CLEAR
            </button>
          </div>
          <div className="p-4 h-64 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-blue-900">
            {logs.map((line, i) => (
              <div key={i} className={`text-[11px] leading-relaxed ${
                line.includes('✅') ? 'text-green-400' :
                line.includes('❌') ? 'text-red-400' :
                line.includes('🛡️') ? 'text-yellow-400' :
                line.includes('[SYSTEM]') ? 'text-blue-400' :
                line.includes('EXECUTING') ? 'text-cyan-400' :
                'text-blue-300/70'
              }`}>
                {line}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NYCLoveDashboard;
