// Hedge Strategy Control Center — Full visibility into the Atlas Snap Hedge Matrix
// Shows science, active trades, health meter, hedge maps, payout projections

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ShieldCheck, Activity, AlertTriangle, ArrowRight, BarChart3,
  Brain, CheckCircle2, Clock, Crown, Layers, Loader2, Power,
  RefreshCw, Skull, Target, TrendingDown, TrendingUp, Wifi, Zap,
  XCircle, DollarSign, Heart, Shield, Lock,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  AUD: '🇦🇺', CAD: '🇨🇦', CHF: '🇨🇭', NZD: '🇳🇿',
};

const HEDGE_AGENT_ID = 'experimental-lab-atlas-hedge-matrix';

// ── Health Score Calculator ──
function computeHealthScore(metrics: {
  isActive: boolean; oandaConnected: boolean; recentTrades: number;
  circuitBreakers: number; winRate: number; profitFactor: number;
}): { score: number; label: string; color: string } {
  let score = 0;
  if (metrics.isActive) score += 25;
  if (metrics.oandaConnected) score += 20;
  if (metrics.recentTrades > 0) score += 15;
  if (metrics.circuitBreakers === 0) score += 10;
  if (metrics.winRate >= 55) score += 15;
  else if (metrics.winRate >= 45) score += 8;
  if (metrics.profitFactor >= 1.5) score += 15;
  else if (metrics.profitFactor >= 1.0) score += 8;

  const label = score >= 80 ? 'EXCELLENT' : score >= 60 ? 'HEALTHY' : score >= 40 ? 'DEGRADED' : 'CRITICAL';
  const color = score >= 80 ? '#39ff14' : score >= 60 ? '#00ffea' : score >= 40 ? '#ff8800' : '#ff0055';
  return { score, label, color };
}

// ── Radial Gauge ──
function HealthGauge({ score, label, color }: { score: number; label: string; color: string }) {
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-44 h-44">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r={radius} fill="none" stroke="#1e293b" strokeWidth="10" />
          <motion.circle
            cx="80" cy="80" r={radius} fill="none" stroke={color} strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black font-mono" style={{ color }}>{score}</span>
          <span className="text-[9px] font-mono uppercase tracking-widest text-slate-500">/ 100</span>
        </div>
      </div>
      <span className="text-[10px] font-mono font-bold uppercase tracking-widest" style={{ color }}>{label}</span>
    </div>
  );
}

// ── Mini Equity Curve ──
function MiniCurve({ data, height = 80, color = '#39ff14' }: { data: number[]; height?: number; color?: string }) {
  if (data.length < 2) return null;
  const w = 400, h = height, pad = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((v - min) / range) * (h - 2 * pad);
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="hedge-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${pad},${h - pad} ${points.join(' ')} ${w - pad},${h - pad}`} fill="url(#hedge-grad)" />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

// ── MAIN PAGE ──
const HedgeControlCenter = () => {
  const [isActive, setIsActive] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<any>(null);
  const [activeTrades, setActiveTrades] = useState<any[]>([]);
  const [closedTrades, setClosedTrades] = useState<any[]>([]);
  const [circuitBreakers, setCircuitBreakers] = useState<any[]>([]);
  const [oandaConnected, setOandaConnected] = useState(false);
  const [lastCycleResult, setLastCycleResult] = useState<any>(null);
  const [executing, setExecuting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch config
      const { data: cfgData } = await supabase
        .from('agent_configs')
        .select('*')
        .eq('agent_id', HEDGE_AGENT_ID)
        .single();
      setConfig(cfgData);
      setIsActive(cfgData?.is_active ?? false);

      // Fetch active trades
      const { data: openTrades } = await supabase
        .from('oanda_orders')
        .select('*')
        .eq('agent_id', HEDGE_AGENT_ID)
        .in('status', ['filled', 'open', 'pending'])
        .order('created_at', { ascending: false })
        .limit(20);
      setActiveTrades(openTrades ?? []);

      // Fetch closed trades (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: closed } = await supabase
        .from('oanda_orders')
        .select('*')
        .eq('agent_id', HEDGE_AGENT_ID)
        .in('status', ['closed', 'filled'])
        .not('exit_price', 'is', null)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(100);
      setClosedTrades(closed ?? []);

      // Check circuit breakers
      const { data: breakers } = await supabase
        .from('gate_bypasses')
        .select('*')
        .like('gate_id', 'CIRCUIT_BREAKER:%')
        .eq('revoked', false)
        .gte('expires_at', new Date().toISOString())
        .limit(5);
      setCircuitBreakers(breakers ?? []);

      // Check OANDA connection
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oanda-execute`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ action: 'account-summary', environment: 'practice' }),
          }
        );
        const data = await res.json();
        setOandaConnected(data.success === true);
      } catch { setOandaConnected(false); }
    } catch (err) {
      console.error('[HedgeCC] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('hedge-trades')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oanda_orders', filter: `agent_id=eq.${HEDGE_AGENT_ID}` }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  // Trigger hedge executor edge function
  const runHedgeCycle = useCallback(async () => {
    setExecuting(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hedge-executor`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({}),
        }
      );
      const data = await res.json();
      setLastCycleResult(data);
      if (data.success) {
        const filled = data.cycle?.filled || 0;
        const skipped = data.cycle?.skipped || 0;
        if (filled > 0) {
          toast.success(`Hedge cycle: ${filled} trade(s) executed`);
        } else if (data.reason === 'strategy_inactive') {
          toast.info('Hedge strategy is inactive');
        } else if (data.reason === 'all_legs_open') {
          toast.info('All hedge legs already open');
        } else {
          toast.info(`Hedge cycle: ${skipped} leg(s) skipped (gates not met)`);
        }
      } else {
        toast.error(`Hedge cycle failed: ${data.reason || data.error}`);
      }
      fetchAll();
    } catch (err) {
      toast.error(`Hedge cycle error: ${(err as Error).message}`);
    } finally {
      setExecuting(false);
    }
  }, [fetchAll]);

  // Auto-poll every 10 minutes while active
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      console.log('[HedgeCC] Auto-polling hedge executor cycle');
      runHedgeCycle();
    }, 10 * 60 * 1000); // 10 minutes
    return () => clearInterval(interval);
  }, [isActive, runHedgeCycle]);

  const toggleHedge = async () => {
    setToggling(true);
    try {
      const newState = !isActive;
      if (config) {
        const { error } = await supabase
          .from('agent_configs')
          .update({ is_active: newState })
          .eq('agent_id', HEDGE_AGENT_ID);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('agent_configs')
          .upsert({
            agent_id: HEDGE_AGENT_ID,
            config: {
              strategyName: 'Atlas Snap Hedge Matrix',
              engineSource: 'experimental-lab',
              type: 'hedge',
              components: ['#1v#8 (50%)', '#2v#7 (30%)', '#3v#6 (20%)'],
              activatedAt: new Date().toISOString(),
              autoExecute: true,
            } as any,
            is_active: newState,
          }, { onConflict: 'agent_id' });
        if (error) throw error;
      }
      setIsActive(newState);
      toast.success(newState ? 'Hedge strategy ACTIVATED — running first cycle...' : 'Hedge strategy DEACTIVATED');
      fetchAll();

      // Immediately trigger execution cycle on activation
      if (newState) {
        setTimeout(() => runHedgeCycle(), 500);
      }
    } catch (err) {
      toast.error(`Toggle failed: ${(err as Error).message}`);
    } finally {
      setToggling(false);
    }
  };

  // Compute metrics
  const wins = closedTrades.filter(t => {
    const isJPY = t.currency_pair?.includes('JPY');
    const mult = isJPY ? 100 : 10000;
    const pips = t.direction === 'long'
      ? (t.exit_price - t.entry_price) * mult
      : (t.entry_price - t.exit_price) * mult;
    return pips > 0;
  });
  const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
  const totalPips = closedTrades.reduce((sum, t) => {
    const isJPY = t.currency_pair?.includes('JPY');
    const mult = isJPY ? 100 : 10000;
    const pips = t.direction === 'long'
      ? ((t.exit_price || 0) - (t.entry_price || 0)) * mult
      : ((t.entry_price || 0) - (t.exit_price || 0)) * mult;
    return sum + pips;
  }, 0);
  const grossProfit = closedTrades.reduce((sum, t) => {
    const isJPY = t.currency_pair?.includes('JPY');
    const mult = isJPY ? 100 : 10000;
    const pips = t.direction === 'long'
      ? ((t.exit_price || 0) - (t.entry_price || 0)) * mult
      : ((t.entry_price || 0) - (t.exit_price || 0)) * mult;
    return pips > 0 ? sum + pips : sum;
  }, 0);
  const grossLoss = closedTrades.reduce((sum, t) => {
    const isJPY = t.currency_pair?.includes('JPY');
    const mult = isJPY ? 100 : 10000;
    const pips = t.direction === 'long'
      ? ((t.exit_price || 0) - (t.entry_price || 0)) * mult
      : ((t.entry_price || 0) - (t.exit_price || 0)) * mult;
    return pips < 0 ? sum + Math.abs(pips) : sum;
  }, 0);
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 5 : 0;

  const health = computeHealthScore({
    isActive, oandaConnected, recentTrades: activeTrades.length,
    circuitBreakers: circuitBreakers.length, winRate, profitFactor,
  });

  // Equity curve from closed trades
  const equityCurve = closedTrades.slice().reverse().reduce((acc: number[], t) => {
    const isJPY = t.currency_pair?.includes('JPY');
    const mult = isJPY ? 100 : 10000;
    const pips = t.direction === 'long'
      ? ((t.exit_price || 0) - (t.entry_price || 0)) * mult
      : ((t.entry_price || 0) - (t.exit_price || 0)) * mult;
    const prev = acc.length > 0 ? acc[acc.length - 1] : 1000;
    acc.push(prev + pips);
    return acc;
  }, [1000]);

  // Payout projection
  const dailyPips = closedTrades.length > 0 ? totalPips / Math.max(1, Math.ceil((Date.now() - new Date(closedTrades[closedTrades.length - 1]?.created_at || Date.now()).getTime()) / (86400000))) : 0;
  const monthlyProjection = dailyPips * 21;
  const nextPayoutDays = monthlyProjection > 0 ? Math.max(1, Math.ceil((100 - totalPips) / Math.max(0.1, dailyPips))) : null;

  // Group trades by pair for hedge map
  const pairMap = new Map<string, { long: number; short: number; netPips: number }>();
  [...activeTrades, ...closedTrades].forEach(t => {
    const pair = t.currency_pair || '';
    if (!pairMap.has(pair)) pairMap.set(pair, { long: 0, short: 0, netPips: 0 });
    const entry = pairMap.get(pair)!;
    if (t.direction === 'long') entry.long++;
    else entry.short++;
    if (t.exit_price && t.entry_price) {
      const isJPY = pair.includes('JPY');
      const mult = isJPY ? 100 : 10000;
      entry.netPips += t.direction === 'long'
        ? (t.exit_price - t.entry_price) * mult
        : (t.entry_price - t.exit_price) * mult;
    }
  });

  // Hedge legs
  const hedgeLegs = [
    { label: '#1 vs #8', weight: '50%', desc: 'Primary divergence — strongest vs weakest currency', color: '#00ffea' },
    { label: '#2 vs #7', weight: '30%', desc: 'Secondary spread — second strongest vs second weakest', color: '#39ff14' },
    { label: '#3 vs #6', weight: '20%', desc: 'Tertiary hedge — third rank pair for correlation dampening', color: '#7fff00' },
  ];

  return (
    <div className="min-h-screen text-slate-300 font-mono overflow-x-hidden" style={{ background: 'hsl(230 30% 3%)' }}>
      {/* Ambient bg */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/3 w-96 h-96 rounded-full blur-3xl opacity-10" style={{ background: 'radial-gradient(circle, #39ff14, transparent)' }} />
        <div className="absolute bottom-0 right-1/3 w-96 h-96 rounded-full blur-3xl opacity-8" style={{ background: 'radial-gradient(circle, #00ffea, transparent)' }} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur-md border-b border-slate-800/60 px-6 py-3" style={{ background: 'hsl(230 30% 3% / 0.85)' }}>
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#39ff1422', border: '1px solid #39ff1444' }}>
              <ShieldCheck className="w-4 h-4 text-[#39ff14]" />
            </div>
            <div>
              <h1 className="text-sm font-black text-white tracking-tighter leading-none">
                HEDGE CONTROL CENTER
              </h1>
              <p className="text-[8px] text-slate-500 tracking-[0.15em] mt-0.5">
                ATLAS SNAP HEDGE MATRIX · CASCADING RANK PAIRS · STRUCTURAL PROTECTION
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link to="/matrix">
              <button className="flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-all">
                <Activity className="w-3 h-3" /> MATRIX
              </button>
            </Link>
            <Link to="/oanda">
              <button className="flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-all">
                <Wifi className="w-3 h-3" /> OANDA
              </button>
            </Link>
            <button onClick={fetchAll} disabled={loading} className="flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:text-white transition-all">
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> REFRESH
            </button>
          </div>
        </div>
      </header>

      <div className="relative max-w-[1440px] mx-auto p-6 space-y-5">

        {/* ── Row 1: Master Toggle + Health Gauge + Status Cards ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Master Toggle */}
          <div className="lg:col-span-4 bg-slate-900/80 backdrop-blur-md border border-[#39ff14]/20 rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">HEDGE STRATEGY</div>
            <button
              onClick={toggleHedge}
              disabled={toggling}
              className="relative w-32 h-32 rounded-full transition-all duration-500 flex items-center justify-center group"
              style={{
                background: isActive
                  ? 'radial-gradient(circle, #39ff1430, #39ff1410, transparent)'
                  : 'radial-gradient(circle, #ff005520, #ff005510, transparent)',
                border: `3px solid ${isActive ? '#39ff14' : '#ff0055'}`,
                boxShadow: isActive ? '0 0 40px #39ff1440, inset 0 0 20px #39ff1410' : '0 0 40px #ff005530',
              }}
            >
              {toggling ? (
                <Loader2 className="w-10 h-10 animate-spin" style={{ color: isActive ? '#39ff14' : '#ff0055' }} />
              ) : (
                <Power className="w-10 h-10 transition-transform group-hover:scale-110" style={{ color: isActive ? '#39ff14' : '#ff0055' }} />
              )}
            </button>
            <div className="text-center">
              <div className="text-lg font-black font-mono" style={{ color: isActive ? '#39ff14' : '#ff0055' }}>
                {isActive ? 'ACTIVE' : 'INACTIVE'}
              </div>
              <div className="text-[8px] text-slate-500 mt-1">
                {isActive ? 'Hedge strategy is live and trading' : 'Click to activate hedge strategy'}
              </div>
            </div>
            {isActive && (
              <>
                <motion.div
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="flex items-center gap-1.5 text-[9px] font-mono text-[#39ff14]"
                >
                  <div className="w-2 h-2 rounded-full bg-[#39ff14]" /> AUTO-EXECUTING · 10min cycles
                </motion.div>
                <button
                  onClick={runHedgeCycle}
                  disabled={executing}
                  className="flex items-center gap-1.5 text-[9px] font-mono px-4 py-2 rounded-lg border border-[#00ffea]/40 text-[#00ffea] hover:bg-[#00ffea]/10 transition-all disabled:opacity-50"
                >
                  {executing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                  {executing ? 'EXECUTING...' : 'RUN CYCLE NOW'}
                </button>
              </>
            )}
            {lastCycleResult && (
              <div className="w-full mt-2 p-2 rounded-lg border border-slate-700/50 bg-slate-800/50">
                <div className="text-[8px] font-mono uppercase tracking-widest text-slate-500 mb-1">LAST CYCLE</div>
                {lastCycleResult.cycle ? (
                  <div className="text-[9px] font-mono text-slate-300 space-y-0.5">
                    <div>Legs evaluated: {lastCycleResult.cycle.legsEvaluated}</div>
                    <div style={{ color: lastCycleResult.cycle.filled > 0 ? '#39ff14' : '#ff8800' }}>
                      Filled: {lastCycleResult.cycle.filled} | Skipped: {lastCycleResult.cycle.skipped}
                    </div>
                    {lastCycleResult.legs?.filter((l: any) => l.reason).map((l: any, i: number) => (
                      <div key={i} className="text-[8px] text-slate-500 truncate" title={l.reason}>
                        {l.leg}: {l.reason}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[9px] font-mono text-slate-400">{lastCycleResult.reason || lastCycleResult.error}</div>
                )}
              </div>
            )}
          </div>

          {/* Health Gauge */}
          <div className="lg:col-span-4 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-2xl flex flex-col items-center justify-center gap-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5" style={{ color: health.color }} /> STRATEGY HEALTH
            </div>
            <HealthGauge score={health.score} label={health.label} color={health.color} />
            <div className="grid grid-cols-2 gap-2 w-full text-center">
              {[
                { label: 'OANDA', ok: oandaConnected, val: oandaConnected ? 'Connected' : 'Offline' },
                { label: 'BREAKERS', ok: circuitBreakers.length === 0, val: circuitBreakers.length === 0 ? 'Clear' : `${circuitBreakers.length} Active` },
              ].map(c => (
                <div key={c.label} className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-2">
                  <div className="text-[7px] text-slate-500 uppercase tracking-wider">{c.label}</div>
                  <div className="text-[10px] font-bold font-mono" style={{ color: c.ok ? '#39ff14' : '#ff0055' }}>
                    {c.ok ? '✓' : '✗'} {c.val}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Key Performance Metrics */}
          <div className="lg:col-span-4 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-yellow-400" /> PERFORMANCE
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'NET PIPS', value: `${totalPips >= 0 ? '+' : ''}${totalPips.toFixed(1)}`, color: totalPips >= 0 ? '#39ff14' : '#ff0055' },
                { label: 'WIN RATE', value: `${winRate.toFixed(1)}%`, color: winRate >= 55 ? '#39ff14' : winRate >= 45 ? '#ff8800' : '#ff0055' },
                { label: 'PROFIT FACTOR', value: profitFactor.toFixed(2), color: profitFactor >= 1.5 ? '#39ff14' : profitFactor >= 1 ? '#00ffea' : '#ff0055' },
                { label: 'TRADES', value: `${closedTrades.length}`, color: '#00ffea' },
                { label: 'OPEN POSITIONS', value: `${activeTrades.length}`, color: '#ff8800' },
                { label: 'DAILY PIPS', value: `${dailyPips >= 0 ? '+' : ''}${dailyPips.toFixed(1)}`, color: dailyPips >= 0 ? '#39ff14' : '#ff0055' },
              ].map(m => (
                <div key={m.label} className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-3 text-center">
                  <div className="text-[7px] text-slate-500 uppercase tracking-wider mb-1">{m.label}</div>
                  <div className="text-sm font-bold font-mono" style={{ color: m.color }}>{m.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Row 2: The Science + Hedge Map ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* How the Hedge Works */}
          <div className="lg:col-span-6 bg-slate-900/80 backdrop-blur-md border border-purple-500/20 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-4 border-b border-purple-500/20 pb-3">
              <Brain className="w-4 h-4 text-purple-400" />
              <h2 className="text-[11px] font-bold tracking-widest text-purple-300 uppercase">How the Hedge Works — The Science</h2>
            </div>

            <div className="space-y-4">
              <div className="bg-purple-950/20 border border-purple-500/15 rounded-xl p-4 space-y-3">
                <h3 className="text-[10px] font-bold text-purple-300 uppercase tracking-widest">Currency Rank Divergence Theory</h3>
                <p className="text-[9px] text-slate-400 leading-relaxed">
                  The Atlas Snap Hedge Matrix exploits the mathematical certainty that when 8 currencies are ranked by strength,
                  the <span className="text-[#00ffea] font-bold">strongest (#1)</span> and <span className="text-[#ff0055] font-bold">weakest (#8)</span> currencies
                  create the maximum divergence. By trading <span className="text-[#39ff14] font-bold">3 cascading rank pairs simultaneously</span>,
                  the portfolio hedges against single-pair risk while capturing multi-dimensional currency flow.
                </p>
              </div>

              {hedgeLegs.map((leg, i) => (
                <div key={leg.label} className="flex gap-3 p-3 rounded-xl border" style={{ borderColor: `${leg.color}30`, background: `${leg.color}08` }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${leg.color}20`, border: `1px solid ${leg.color}40` }}>
                    <span className="text-[11px] font-bold font-mono" style={{ color: leg.color }}>{leg.weight}</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: leg.color }}>{leg.label} — {leg.weight} Weight</p>
                    <p className="text-[9px] text-slate-400 leading-relaxed">{leg.desc}</p>
                  </div>
                </div>
              ))}

              <div className="bg-slate-950/60 border border-yellow-500/20 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-[9px] font-bold text-yellow-400 uppercase tracking-widest">Why Hedging Reduces Risk</span>
                </div>
                <p className="text-[8px] text-slate-400 leading-relaxed">
                  When the primary divergence (#1v#8) compresses during macro events, the secondary spreads (#2v#7, #3v#6) typically
                  <span className="text-[#39ff14] font-bold"> widen</span>, absorbing losses from the primary leg. This inverse correlation
                  creates a self-balancing portfolio where single-event drawdowns are <span className="text-yellow-400 font-bold">structurally dampened</span>.
                </p>
              </div>
            </div>
          </div>

          {/* Hedge Topology Map */}
          <div className="lg:col-span-6 bg-slate-900/80 backdrop-blur-md border border-[#39ff14]/20 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-4 border-b border-[#39ff14]/20 pb-3">
              <Target className="w-4 h-4 text-[#39ff14]" />
              <h2 className="text-[11px] font-bold tracking-widest text-[#39ff14]/80 uppercase">Hedge Topology Map</h2>
            </div>

            {/* Visual hedge diagram */}
            <div className="relative bg-slate-950/80 border border-slate-800/50 rounded-xl p-6 min-h-[280px]">
              {/* Center hub */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full flex items-center justify-center"
                style={{ background: isActive ? '#39ff1415' : '#ff005515', border: `2px solid ${isActive ? '#39ff14' : '#ff0055'}` }}>
                <div className="text-center">
                  <ShieldCheck className="w-5 h-5 mx-auto" style={{ color: isActive ? '#39ff14' : '#ff0055' }} />
                  <div className="text-[7px] font-mono font-bold" style={{ color: isActive ? '#39ff14' : '#ff0055' }}>HEDGE</div>
                </div>
              </div>

              {/* Leg nodes */}
              {hedgeLegs.map((leg, i) => {
                const angle = (i * 120 - 90) * (Math.PI / 180);
                const r = 110;
                const cx = 50 + Math.cos(angle) * 35;
                const cy = 50 + Math.sin(angle) * 35;
                return (
                  <motion.div
                    key={leg.label}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.2 }}
                    className="absolute w-24 h-20 rounded-xl flex flex-col items-center justify-center border"
                    style={{
                      left: `${cx}%`, top: `${cy}%`, transform: 'translate(-50%, -50%)',
                      borderColor: `${leg.color}55`, background: `${leg.color}10`,
                    }}
                  >
                    <span className="text-[10px] font-bold font-mono" style={{ color: leg.color }}>{leg.label}</span>
                    <span className="text-[8px] text-slate-500 font-mono">{leg.weight}</span>
                    <motion.div
                      animate={isActive ? { opacity: [0.3, 1, 0.3] } : {}}
                      transition={{ repeat: Infinity, duration: 2, delay: i * 0.3 }}
                      className="w-2 h-2 rounded-full mt-1"
                      style={{ background: isActive ? leg.color : '#374151' }}
                    />
                  </motion.div>
                );
              })}

              {/* Connection lines (SVG) */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                {hedgeLegs.map((leg, i) => {
                  const angle = (i * 120 - 90) * (Math.PI / 180);
                  const cx = 50 + Math.cos(angle) * 35;
                  const cy = 50 + Math.sin(angle) * 35;
                  return (
                    <line key={i} x1="50" y1="50" x2={cx} y2={cy}
                      stroke={isActive ? leg.color : '#374151'} strokeWidth="0.3" strokeDasharray={isActive ? 'none' : '2 2'} opacity="0.5" />
                  );
                })}
              </svg>
            </div>

            {/* Pair breakdown */}
            {pairMap.size > 0 && (
              <div className="mt-4 space-y-1">
                <div className="text-[8px] text-slate-500 uppercase tracking-widest mb-2">Active Pair Coverage</div>
                {Array.from(pairMap.entries()).map(([pair, data]) => (
                  <div key={pair} className="flex items-center gap-2 text-[9px] font-mono">
                    <span className="text-slate-300 w-16">{pair.replace('_', '/')}</span>
                    <span className="text-[#00ffea]">{data.long}L</span>
                    <span className="text-[#ff0055]">{data.short}S</span>
                    <span className={data.netPips >= 0 ? 'text-[#39ff14]' : 'text-[#ff0055]'}>
                      {data.netPips >= 0 ? '+' : ''}{data.netPips.toFixed(1)}p
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Row 3: Equity Curve + Payout Projection ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Equity Curve */}
          <div className="lg:col-span-8 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-700/40 pb-3">
              <TrendingUp className="w-4 h-4 text-[#39ff14]" />
              <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">Hedge Equity Curve</h2>
              <span className="text-[8px] font-mono text-slate-500 ml-auto">{closedTrades.length} closed trades · 30 day window</span>
            </div>
            {equityCurve.length > 2 ? (
              <MiniCurve data={equityCurve} height={160} color={totalPips >= 0 ? '#39ff14' : '#ff0055'} />
            ) : (
              <div className="py-12 text-center text-[10px] text-slate-500 font-mono">
                No closed trades yet — equity curve will appear after first completed trades
              </div>
            )}
          </div>

          {/* Payout Projection */}
          <div className="lg:col-span-4 bg-slate-900/80 backdrop-blur-md border border-yellow-500/20 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-4 border-b border-yellow-500/20 pb-3">
              <DollarSign className="w-4 h-4 text-yellow-400" />
              <h2 className="text-[11px] font-bold tracking-widest text-yellow-300 uppercase">Payout Projection</h2>
            </div>
            <div className="space-y-4">
              <div className="bg-gradient-to-b from-yellow-950/30 to-slate-950 border border-yellow-500/20 rounded-xl p-4 text-center">
                <div className="text-[8px] text-yellow-500/60 uppercase tracking-wider mb-1">Monthly Projection</div>
                <div className="text-2xl font-black font-mono text-yellow-400">
                  {monthlyProjection >= 0 ? '+' : ''}{monthlyProjection.toFixed(1)}p
                </div>
                <div className="text-[8px] text-slate-500 font-mono mt-1">
                  Based on {dailyPips.toFixed(1)} pips/day average
                </div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800/40 rounded-xl p-4 text-center">
                <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-1">Next +100 Pips Target</div>
                <div className="text-xl font-black font-mono" style={{ color: nextPayoutDays && nextPayoutDays < 30 ? '#39ff14' : '#ff8800' }}>
                  {nextPayoutDays ? `~${nextPayoutDays} days` : '—'}
                </div>
                <div className="text-[8px] text-slate-500 font-mono mt-1">
                  {totalPips.toFixed(1)} / 100 pips earned
                </div>
                {/* Progress bar */}
                <div className="w-full h-2 bg-slate-800 rounded-full mt-2 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, Math.max(0, totalPips))}%` }}
                    transition={{ duration: 1 }}
                    className="h-full rounded-full"
                    style={{ background: 'linear-gradient(90deg, #39ff14, #00ffea)' }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-3 text-center">
                  <div className="text-[7px] text-slate-500 uppercase tracking-wider mb-1">7D Pips</div>
                  <div className="text-sm font-bold font-mono" style={{ color: dailyPips * 7 >= 0 ? '#39ff14' : '#ff0055' }}>
                    {(dailyPips * 7).toFixed(1)}
                  </div>
                </div>
                <div className="bg-slate-950/60 border border-slate-800/40 rounded-lg p-3 text-center">
                  <div className="text-[7px] text-slate-500 uppercase tracking-wider mb-1">Annual Est</div>
                  <div className="text-sm font-bold font-mono text-yellow-400">
                    {(monthlyProjection * 12).toFixed(0)}p
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 4: Active Hedge Trades ── */}
        <div className="bg-slate-900/80 backdrop-blur-md border border-yellow-500/20 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-700/40 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-yellow-400" />
              <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">Active Hedge Trades</h2>
            </div>
            {activeTrades.length > 0 && (
              <span className="flex items-center gap-1.5 text-[9px] font-mono text-yellow-400">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                {activeTrades.length} OPEN
              </span>
            )}
          </div>
          {activeTrades.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <ShieldCheck className="w-10 h-10 mx-auto text-slate-600" />
              <p className="text-[10px] text-slate-500 font-mono">No active hedge trades</p>
              <p className="text-[8px] text-slate-600 font-mono">
                {isActive ? 'Waiting for next blend executor cycle to place trades' : 'Activate the hedge strategy to start trading'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeTrades.map(t => {
                const isLong = t.direction === 'long';
                const isJPY = t.currency_pair?.includes('JPY');
                const dp = isJPY ? 3 : 5;
                const age = Math.round((Date.now() - new Date(t.created_at).getTime()) / 60000);
                const color = isLong ? '#00ffea' : '#ff0055';
                return (
                  <div key={t.id} className="flex flex-col gap-2 p-3.5 rounded-xl border" style={{ borderColor: `${color}30`, background: `${color}08` }}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold font-mono text-sm" style={{ color }}>
                        {t.currency_pair?.replace('_', '/')} {t.direction?.toUpperCase()}
                      </span>
                      <span className="flex items-center gap-1 text-[9px] font-mono" style={{ color }}>
                        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: color }} />
                        {t.status?.toUpperCase()}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[9px]">
                      <div>
                        <div className="text-slate-500 mb-0.5 uppercase tracking-wider text-[7px]">Units</div>
                        <div className="font-bold text-white font-mono">{Math.abs(t.units).toLocaleString()}u</div>
                      </div>
                      <div>
                        <div className="text-yellow-500/70 mb-0.5 uppercase tracking-wider text-[7px]">Entry</div>
                        <div className="font-bold text-yellow-400 font-mono">{t.entry_price ? t.entry_price.toFixed(dp) : '—'}</div>
                      </div>
                      <div>
                        <div className="text-slate-500 mb-0.5 uppercase tracking-wider text-[7px]">Age</div>
                        <div className="font-bold text-slate-300 font-mono">{age < 60 ? `${age}m` : `${Math.round(age / 60)}h`}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Row 5: Circuit Breakers ── */}
        {circuitBreakers.length > 0 && (
          <div className="bg-slate-900/80 backdrop-blur-md border border-[#ff0055]/30 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-4 border-b border-[#ff0055]/20 pb-3">
              <AlertTriangle className="w-4 h-4 text-[#ff0055]" />
              <h2 className="text-[11px] font-bold tracking-widest text-[#ff0055] uppercase">Active Circuit Breakers</h2>
            </div>
            <div className="space-y-2">
              {circuitBreakers.map((b, i) => (
                <div key={i} className="flex items-center gap-2 bg-[#ff0055]/5 border border-[#ff0055]/20 rounded-lg p-3">
                  <XCircle className="w-4 h-4 text-[#ff0055] shrink-0" />
                  <div className="flex-1">
                    <div className="text-[9px] font-bold font-mono text-[#ff0055]">{b.gate_id}</div>
                    <div className="text-[8px] text-slate-400">{b.reason}</div>
                  </div>
                  <div className="text-[8px] text-slate-500 font-mono">
                    Expires: {new Date(b.expires_at).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default HedgeControlCenter;
