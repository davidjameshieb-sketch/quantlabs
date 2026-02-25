// Hedge Strategy Control Center — Atlas Hedge Portfolio (10 Momentum + 10 Counter-Leg)
// Shows portfolio health, active trades, strategy roster, hedge maps, payout projections

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ShieldCheck, Activity, AlertTriangle, BarChart3,
  Brain, Clock, Crown, Loader2, Power,
  RefreshCw, Skull, Target, TrendingDown, TrendingUp, Wifi, Zap,
  XCircle, DollarSign, Heart, Shield,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import HedgeDiscoveryPanel from '@/components/matrix/HedgeDiscoveryPanel';
import AtlasHedgeLiveFeed from '@/components/matrix/AtlasHedgeLiveFeed';
import AtlasNeuralNet from '@/components/matrix/AtlasNeuralNet';

const FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  AUD: '🇦🇺', CAD: '🇨🇦', CHF: '🇨🇭', NZD: '🇳🇿',
};

const OLD_HEDGE_AGENT_ID = 'experimental-lab-atlas-hedge-matrix';
const ATLAS_HEDGE_PREFIX = 'atlas-hedge-';

// ── Health Score Calculator ──
function computeHealthScore(metrics: {
  activeStrategies: number; totalStrategies: number; oandaConnected: boolean;
  recentTrades: number; circuitBreakers: number; winRate: number; profitFactor: number;
}): { score: number; label: string; color: string } {
  let score = 0;
  if (metrics.activeStrategies > 0) score += 15;
  if (metrics.activeStrategies >= 10) score += 10;
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
  const [atlasAgents, setAtlasAgents] = useState<any[]>([]);
  const [toggling, setToggling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTrades, setActiveTrades] = useState<any[]>([]);
  const [closedTrades, setClosedTrades] = useState<any[]>([]);
  const [circuitBreakers, setCircuitBreakers] = useState<any[]>([]);
  const [oandaConnected, setOandaConnected] = useState(false);

  const activeAgents = atlasAgents.filter(a => a.is_active);
  const momAgents = atlasAgents.filter(a => a.agent_id.startsWith('atlas-hedge-m'));
  const ctrAgents = atlasAgents.filter(a => a.agent_id.startsWith('atlas-hedge-c'));
  const isActive = activeAgents.length > 0;
  const atlasAgentIds = atlasAgents.map(a => a.agent_id);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all atlas-hedge agents
      const { data: agents } = await supabase
        .from('agent_configs')
        .select('*')
        .like('agent_id', `${ATLAS_HEDGE_PREFIX}%`)
        .order('agent_id');
      setAtlasAgents(agents ?? []);

      const agentIds = (agents ?? []).map((a: any) => a.agent_id);

      // Fetch active trades for all atlas-hedge agents
      if (agentIds.length > 0) {
        const { data: openTrades } = await supabase
          .from('oanda_orders')
          .select('*')
          .in('agent_id', agentIds)
          .in('status', ['filled', 'open', 'submitted'])
          .is('closed_at', null)
          .order('created_at', { ascending: false })
          .limit(50);
        // Only show trades with confirmed OANDA fills or pending limits
        setActiveTrades((openTrades ?? []).filter(t => t.entry_price != null || t.status === 'open'));

        // Fetch closed trades (last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: closed } = await supabase
          .from('oanda_orders')
          .select('*')
          .in('agent_id', agentIds)
          .in('status', ['closed', 'filled'])
          .not('exit_price', 'is', null)
          .gte('created_at', thirtyDaysAgo)
          .order('created_at', { ascending: false })
          .limit(200);
        setClosedTrades(closed ?? []);
      } else {
        setActiveTrades([]);
        setClosedTrades([]);
      }

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

  // Auto-refresh every 60s to match batch interval
  const [refreshCountdown, setRefreshCountdown] = useState(60);
  useEffect(() => {
    const id = setInterval(() => {
      setRefreshCountdown(prev => {
        if (prev <= 1) {
          fetchAll();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);
    fetchAll();
    return () => clearInterval(id);
  }, [fetchAll]);
  const countdownMin = Math.floor(refreshCountdown / 60);
  const countdownSec = refreshCountdown % 60;
  const countdownDisplay = `${String(countdownMin).padStart(2, '0')}:${String(countdownSec).padStart(2, '0')}`;

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('hedge-trades-atlas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oanda_orders' }, (payload) => {
        const agentId = (payload.new as any)?.agent_id || '';
        if (agentId.startsWith(ATLAS_HEDGE_PREFIX)) fetchAll();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  const toggleAllStrategies = async () => {
    setToggling(true);
    try {
      const newState = !isActive;
      for (const agent of atlasAgents) {
        await supabase
          .from('agent_configs')
          .update({ is_active: newState })
          .eq('agent_id', agent.agent_id);
      }
      toast.success(newState
        ? `Atlas Hedge ACTIVATED — ${atlasAgents.length} strategies now live`
        : `Atlas Hedge DEACTIVATED — all ${atlasAgents.length} strategies paused`
      );
      fetchAll();
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
    activeStrategies: activeAgents.length,
    totalStrategies: atlasAgents.length,
    oandaConnected, recentTrades: activeTrades.length,
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

  // Group trades by agent for breakdown
  const agentTradeMap = new Map<string, { open: number; closed: number; pips: number; wins: number }>();
  activeTrades.forEach(t => {
    const aid = t.agent_id || '';
    if (!agentTradeMap.has(aid)) agentTradeMap.set(aid, { open: 0, closed: 0, pips: 0, wins: 0 });
    agentTradeMap.get(aid)!.open++;
  });
  closedTrades.forEach(t => {
    const aid = t.agent_id || '';
    if (!agentTradeMap.has(aid)) agentTradeMap.set(aid, { open: 0, closed: 0, pips: 0, wins: 0 });
    const entry = agentTradeMap.get(aid)!;
    entry.closed++;
    const isJPY = t.currency_pair?.includes('JPY');
    const mult = isJPY ? 100 : 10000;
    const pips = t.direction === 'long'
      ? ((t.exit_price || 0) - (t.entry_price || 0)) * mult
      : ((t.entry_price || 0) - (t.exit_price || 0)) * mult;
    entry.pips += pips;
    if (pips > 0) entry.wins++;
  });

  return (
    <div className="min-h-screen text-slate-300 font-mono overflow-x-hidden" style={{ background: 'hsl(230 30% 3%)' }}>
      {/* Ambient bg */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/3 w-96 h-96 rounded-full blur-3xl opacity-10" style={{ background: 'radial-gradient(circle, #a855f7, transparent)' }} />
        <div className="absolute bottom-0 right-1/3 w-96 h-96 rounded-full blur-3xl opacity-8" style={{ background: 'radial-gradient(circle, #39ff14, transparent)' }} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur-md border-b border-slate-800/60 px-6 py-3" style={{ background: 'hsl(230 30% 3% / 0.85)' }}>
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#a855f722', border: '1px solid #a855f744' }}>
              <Shield className="w-4 h-4 text-[#a855f7]" />
            </div>
            <div>
              <h1 className="text-sm font-black text-white tracking-tighter leading-none">
                ATLAS HEDGE CONTROL CENTER
              </h1>
              <p className="text-[8px] text-slate-500 tracking-[0.15em] mt-0.5">
                {momAgents.length} MOMENTUM + {ctrAgents.length} COUNTER-LEG = {atlasAgents.length} STRATEGIES
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

        {/* ── Row 1: Master Toggle + Health Gauge + Performance ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Master Toggle */}
          <div className="lg:col-span-4 bg-slate-900/80 backdrop-blur-md border border-[#a855f7]/20 rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              ATLAS HEDGE PORTFOLIO
            </div>
            {atlasAgents.length === 0 ? (
              <div className="text-center space-y-3 py-6">
                <Shield className="w-10 h-10 mx-auto text-slate-600" />
                <p className="text-[10px] text-slate-500 font-mono">No strategies configured yet</p>
                <p className="text-[8px] text-slate-600 font-mono">Use the Deep Search below to discover and activate 10 momentum + 10 counter-leg strategies</p>
              </div>
            ) : (
              <>
                <button
                  onClick={toggleAllStrategies}
                  disabled={toggling}
                  className="relative w-32 h-32 rounded-full transition-all duration-500 flex items-center justify-center group"
                  style={{
                    background: isActive
                      ? 'radial-gradient(circle, #a855f730, #a855f710, transparent)'
                      : 'radial-gradient(circle, #ff005520, #ff005510, transparent)',
                    border: `3px solid ${isActive ? '#a855f7' : '#ff0055'}`,
                    boxShadow: isActive ? '0 0 40px #a855f740, inset 0 0 20px #a855f710' : '0 0 40px #ff005530',
                  }}
                >
                  {toggling ? (
                    <Loader2 className="w-10 h-10 animate-spin" style={{ color: isActive ? '#a855f7' : '#ff0055' }} />
                  ) : (
                    <Power className="w-10 h-10 transition-transform group-hover:scale-110" style={{ color: isActive ? '#a855f7' : '#ff0055' }} />
                  )}
                </button>
                <div className="text-center">
                  <div className="text-lg font-black font-mono" style={{ color: isActive ? '#a855f7' : '#ff0055' }}>
                    {isActive ? 'ACTIVE' : 'INACTIVE'}
                  </div>
                  <div className="text-[8px] text-slate-500 mt-1">
                    {activeAgents.length}/{atlasAgents.length} strategies active
                  </div>
                </div>
                {isActive && (
                  <motion.div
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="flex items-center gap-1.5 text-[9px] font-mono text-[#a855f7]"
                  >
                    <div className="w-2 h-2 rounded-full bg-[#a855f7]" /> BLEND EXECUTOR · 10min cycles
                  </motion.div>
                )}
              </>
            )}
          </div>

          {/* Health Gauge */}
          <div className="lg:col-span-4 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-2xl flex flex-col items-center justify-center gap-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5" style={{ color: health.color }} /> PORTFOLIO HEALTH
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

          {/* Key Performance */}
          <div className="lg:col-span-4 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-yellow-400" /> PERFORMANCE
              <span className="ml-auto flex items-center gap-1 text-[9px] font-mono text-slate-500">
                <Clock className="w-3 h-3" />
                <span className="text-slate-600">Next refresh</span>
                <span className="text-white font-bold">{countdownDisplay}</span>
              </span>
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

        {/* ── Row 2: Strategy Roster (20 strategies) ── */}
        {atlasAgents.length > 0 && (
          <div className="bg-slate-900/80 backdrop-blur-md border border-[#a855f7]/20 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-4 border-b border-[#a855f7]/20 pb-3">
              <Shield className="w-4 h-4 text-[#a855f7]" />
              <h2 className="text-[11px] font-bold tracking-widest text-white uppercase">
                Atlas Hedge Strategy Roster
              </h2>
              <span className="text-[8px] font-mono text-slate-500 ml-auto">
                {momAgents.filter(a => a.is_active).length}M + {ctrAgents.filter(a => a.is_active).length}C active
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Momentum column */}
              <div className="space-y-2">
                <div className="text-[9px] font-bold text-[#39ff14] uppercase tracking-widest flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3" /> MOMENTUM ({momAgents.length})
                </div>
                <p className="text-[7px] text-slate-500 leading-relaxed">
                  Trend continuation — Long strongest, Short weakest. Profits when rank divergence expands.
                </p>
                {momAgents.map(agent => {
                  const cfg = agent.config || {};
                  const stats = agentTradeMap.get(agent.agent_id);
                  return (
                    <div key={agent.agent_id} className="flex items-center gap-2 p-2.5 rounded-lg border" style={{
                      borderColor: agent.is_active ? '#39ff1430' : '#33415530',
                      background: agent.is_active ? '#39ff1408' : '#0f172a40',
                    }}>
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: agent.is_active ? '#39ff14' : '#374151' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold font-mono text-[#39ff14]">
                            #{cfg.predatorRank || '?'} vs #{cfg.preyRank || '?'}
                          </span>
                          <span className="text-[7px] text-slate-500">{cfg.session || 'ALL'}</span>
                          <span className="text-[7px] text-slate-600">{cfg.slPips}p SL · {cfg.tpRatio}R TP</span>
                        </div>
                        <div className="text-[7px] text-slate-500 mt-0.5">
                          BT: PF {cfg.backtestPF} · WR {cfg.backtestWR}% · {cfg.backtestTrades} trades
                          {stats ? ` | Live: ${stats.closed} trades · ${stats.pips >= 0 ? '+' : ''}${stats.pips.toFixed(1)}p` : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Counter-Leg column */}
              <div className="space-y-2">
                <div className="text-[9px] font-bold text-[#ff8800] uppercase tracking-widest flex items-center gap-1.5">
                  <TrendingDown className="w-3 h-3" /> COUNTER-LEG ({ctrAgents.length})
                </div>
                <p className="text-[7px] text-slate-500 leading-relaxed">
                  Mean reversion — Short strongest, Long weakest. Profits when ranks converge, offsetting momentum losses.
                </p>
                {ctrAgents.map(agent => {
                  const cfg = agent.config || {};
                  const stats = agentTradeMap.get(agent.agent_id);
                  return (
                    <div key={agent.agent_id} className="flex items-center gap-2 p-2.5 rounded-lg border" style={{
                      borderColor: agent.is_active ? '#ff880030' : '#33415530',
                      background: agent.is_active ? '#ff880008' : '#0f172a40',
                    }}>
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: agent.is_active ? '#ff8800' : '#374151' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold font-mono text-[#ff8800]">
                            #{cfg.predatorRank || '?'} vs #{cfg.preyRank || '?'}
                          </span>
                          <span className="text-[7px] text-slate-500">{cfg.session || 'ALL'}</span>
                          <span className="text-[7px] text-slate-600">{cfg.slPips}p SL · {cfg.tpRatio}R TP</span>
                        </div>
                        <div className="text-[7px] text-slate-500 mt-0.5">
                          BT: PF {cfg.backtestPF} · WR {cfg.backtestWR}% · {cfg.backtestTrades} trades
                          {stats ? ` | Live: ${stats.closed} trades · ${stats.pips >= 0 ? '+' : ''}${stats.pips.toFixed(1)}p` : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Row 3: Equity Curve + Payout Projection ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-700/40 pb-3">
              <TrendingUp className="w-4 h-4 text-[#39ff14]" />
              <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">Portfolio Equity Curve</h2>
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
                <div className="w-full h-2 bg-slate-800 rounded-full mt-2 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, Math.max(0, totalPips))}%` }}
                    transition={{ duration: 1 }}
                    className="h-full rounded-full"
                    style={{ background: 'linear-gradient(90deg, #a855f7, #39ff14)' }}
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

        {/* ── Row 4: Deep Search (Discovery) ── */}
        <HedgeDiscoveryPanel onPortfolioActivated={fetchAll} />

        {/* ── Row 5: Active Trades ── */}
        <div className="bg-slate-900/80 backdrop-blur-md border border-yellow-500/20 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-700/40 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-yellow-400" />
              <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">Active Trades</h2>
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
              <p className="text-[10px] text-slate-500 font-mono">No active trades</p>
              <p className="text-[8px] text-slate-600 font-mono">
                {isActive ? 'Waiting for blend executor cycle to place trades' : 'Activate the portfolio to start trading'}
              </p>
            </div>
          ) : (() => {
            const momTrades = activeTrades.filter(t => t.agent_id?.startsWith('atlas-hedge-m'));
            const ctrTrades = activeTrades.filter(t => t.agent_id?.startsWith('atlas-hedge-c'));
            // Identify pair collisions: pairs where both MOM and CTR want to trade
            const momPairs = new Set(momTrades.map(t => t.currency_pair));
            const ctrPairs = new Set(ctrTrades.map(t => t.currency_pair));

            const renderTradeCard = (t: any) => {
              const isMom = t.agent_id?.startsWith('atlas-hedge-m');
              const isJPY = t.currency_pair?.includes('JPY');
              const dp = isJPY ? 3 : 5;
              const age = Math.round((Date.now() - new Date(t.created_at).getTime()) / 60000);
              const color = isMom ? '#39ff14' : '#ff8800';
              const base = t.currency_pair?.split('_')[0] || '';
              const quote = t.currency_pair?.split('_')[1] || '';
              return (
                <div key={t.id} className="flex flex-col gap-2 p-3.5 rounded-xl border" style={{ borderColor: `${color}30`, background: `${color}08` }}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold font-mono text-sm" style={{ color }}>
                      {FLAGS[base] || ''}{FLAGS[quote] || ''} {t.currency_pair?.replace('_', '/')} {t.direction?.toUpperCase()}
                    </span>
                    <span className="text-[7px] font-mono px-1.5 py-0.5 rounded" style={{ color, background: `${color}15`, border: `1px solid ${color}30` }}>
                      {isMom ? '⚡ TREND' : '🔄 REVERSION'}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-[9px]">
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
                    <div>
                      <div className="text-slate-500 mb-0.5 uppercase tracking-wider text-[7px]">Agent</div>
                      <div className="font-bold text-slate-300 font-mono text-[8px]">{t.agent_id?.replace('atlas-hedge-', '')}</div>
                    </div>
                  </div>
                </div>
              );
            };

            return (
              <div className="space-y-5">
                {/* Summary bar */}
                <div className="flex items-center gap-3 text-[9px] font-mono">
                  <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: '#39ff1410', border: '1px solid #39ff1430', color: '#39ff14' }}>
                    <TrendingUp className="w-3 h-3" /> {momTrades.length} Trending
                  </span>
                  <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: '#ff880010', border: '1px solid #ff880030', color: '#ff8800' }}>
                    <TrendingDown className="w-3 h-3" /> {ctrTrades.length} Mean Reversion
                  </span>
                  <span className="text-slate-500 ml-auto text-[8px]">
                    Diversification guard prevents same-pair overlap
                  </span>
                </div>

                {/* Momentum trades */}
                {momTrades.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-3.5 h-3.5 text-[#39ff14]" />
                      <span className="text-[9px] font-bold uppercase tracking-widest text-[#39ff14]">
                        Trending / Momentum
                      </span>
                      <span className="text-[7px] text-slate-500 font-mono">
                        Riding rank divergence — long strong, short weak
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {momTrades.map(renderTradeCard)}
                    </div>
                  </div>
                )}

                {/* Counter-leg trades */}
                {ctrTrades.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingDown className="w-3.5 h-3.5 text-[#ff8800]" />
                      <span className="text-[9px] font-bold uppercase tracking-widest text-[#ff8800]">
                        Mean Reversion / Counter-Leg
                      </span>
                      <span className="text-[7px] text-slate-500 font-mono">
                        Fading rank divergence — short strong, long weak
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {ctrTrades.map(renderTradeCard)}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* ── Row 6: Neural Strategy Web ── */}
        <AtlasNeuralNet />

        {/* ── Row 7: Atlas Hedge Live Feed ── */}
        <AtlasHedgeLiveFeed />

        {/* ── Row 7: Circuit Breakers ── */}
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
