// THE CITADEL — V12.5.1 Live Command View
// Aero-Light High-Contrast theme with 4 operational zones

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Shield, Swords, Eye, Clock, Zap, Activity,
  TrendingUp, TrendingDown, AlertTriangle, RefreshCw,
  Target, Crosshair, Skull, Crown, Lock, Unlock,
  ChevronRight, Radio, BookOpen,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import CitadelOrderBook, { type OrderBookEntry } from '@/components/matrix/CitadelOrderBook';

// ── Constants ──
const CORE_AGENTS = ['atlas-hedge-m4', 'atlas-hedge-m6', 'atlas-hedge-m8', 'atlas-hedge-m9'];
const JPY_PAIRS = ['USD_JPY', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'NZD_JPY', 'CAD_JPY', 'CHF_JPY'];
const FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  AUD: '🇦🇺', CAD: '🇨🇦', CHF: '🇨🇭', NZD: '🇳🇿',
};

const AGENT_ROLES: Record<string, { role: string; description: string }> = {
  'atlas-hedge-m4': { role: 'Momentum Sniper', description: 'JPY specialist targeting high-velocity pullbacks' },
  'atlas-hedge-m6': { role: 'Cross-Asset Flow', description: 'Patience trap hunter on #1 Strength currency' },
  'atlas-hedge-m8': { role: 'Pivot Point Momentum', description: 'Major-pair momentum and pivot breakouts' },
  'atlas-hedge-m9': { role: 'Matrix Divergence', description: 'Widest rank-gap hunter, double-exposure specialist' },
};

function generateVerdict(
  agentId: string,
  pair: string,
  direction: string,
  ranks: Record<string, number>
): { verdict: string; grade: 'CORRECT' | 'ALIGNED' | 'WARNING' } {
  const parts = pair.replace('_', '/').split('/');
  const base = parts[0] || '';
  const quote = parts[1] || '';
  const baseRank = ranks[base];
  const quoteRank = ranks[quote];
  const role = AGENT_ROLES[agentId];
  const roleName = role?.role ?? agentId.replace('atlas-hedge-', '');

  if (baseRank == null || quoteRank == null) {
    return { verdict: `${roleName}: Ranks unavailable for ${base}/${quote}.`, grade: 'ALIGNED' };
  }

  const gap = Math.abs(baseRank - quoteRank);
  const isLong = direction === 'long';
  const strongCur = isLong ? base : quote;
  const weakCur = isLong ? quote : base;
  const strongRank = ranks[strongCur];
  const weakRank = ranks[weakCur];

  // Agent-specific context
  let agentContext = '';
  if (agentId === 'atlas-hedge-m4') {
    const hasJpy = pair.includes('JPY');
    agentContext = hasJpy
      ? `m4 is your JPY specialist. ${isLong ? 'Buying' : 'Selling'} the freight-train.`
      : `m4 operating outside JPY — watch for reduced edge.`;
  } else if (agentId === 'atlas-hedge-m6') {
    agentContext = `m6 waits for the Trap to be hit, targeting the current #1 Strength.`;
  } else if (agentId === 'atlas-hedge-m8') {
    agentContext = `m8 focuses on major-pair momentum and pivot breakouts.`;
  } else if (agentId === 'atlas-hedge-m9') {
    agentContext = `m9 is hunting for the widest rank gap. Double-exposure specialist.`;
  }

  if (gap >= 5) {
    return {
      grade: 'CORRECT',
      verdict: `CORRECT. ${agentContext} ${strongCur} is #${strongRank} (strong) and ${weakCur} is #${weakRank} (weak) — textbook divergence play.`,
    };
  }
  if (gap >= 3) {
    return {
      grade: 'ALIGNED',
      verdict: `ALIGNED. Gap is narrowing but still valid for ${roleName}. ${base} #${baseRank} vs ${quote} #${quoteRank}.`,
    };
  }
  return {
    grade: 'WARNING',
    verdict: `WARNING. Matrix convergence detected. ${base} #${baseRank} vs ${quote} #${quoteRank}. Logic Integrity declining.`,
  };
}

function getPipMult(pair: string) {
  return pair.includes('JPY') ? 100 : 10000;
}

function computePips(direction: string, entry: number, exit: number, pair: string) {
  const mult = getPipMult(pair);
  return direction === 'long' ? (exit - entry) * mult : (entry - exit) * mult;
}

function formatPrice(price: number, pair: string) {
  return price.toFixed(pair.includes('JPY') ? 3 : 5);
}

function getSession(): string {
  const h = new Date().getUTCHours();
  if (h >= 0 && h < 8) return 'ASIA';
  if (h >= 8 && h < 15) return 'LONDON';
  if (h >= 15 && h < 21) return 'NEW YORK';
  return 'ASIA';
}

function getSessionRibbon() {
  const s = getSession();
  const sessions = ['ASIA', 'LONDON', 'NEW YORK'];
  return sessions.map(name => ({
    name,
    active: name === s,
    next: sessions[(sessions.indexOf(s) + 1) % 3] === name,
  }));
}

// ── Types ──
interface AgentStatus {
  agentId: string;
  label: string;
  status: 'ACTIVE' | 'PENDING' | 'READY';
  dailyPips: number;
  dailyWinRate: number;
  dailyTrades: number;
  currentPair: string | null;
  currentDirection: string | null;
  equityCurve: number[];
}

interface LiveTrade {
  id: string;
  oandaTradeId: string;
  pair: string;
  direction: string;
  entryPrice: number;
  currentPrice: number;
  pnlPips: number;
  logicIntegrity: number | null;
  entryRankGap: number | null;
  currentRankGap: number | null;
  shieldStatus: string;
  agentId: string;
  slPrice: number | null;
  tradeAge: string;
}

interface LimitTrap {
  id: string;
  oandaOrderId: string | null;
  pair: string;
  agentId: string;
  strategy: string;
  type: string;
  entryPrice: number;
  distance: number;
  expiryMinutes: number;
  direction: string;
}

interface MatrixData {
  sortedCurrencies: string[];
  currencyRanks: Record<string, number>;
  currencyScores: Record<string, number>;
  predator: string;
  prey: string;
  timestamp: string;
}

// ══════════════════════════════════════════════════
// THE CITADEL
// ══════════════════════════════════════════════════

const TheCitadel = () => {
  const [loading, setLoading] = useState(true);
  const [accountBalance, setAccountBalance] = useState<number | null>(null);
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [liveTrades, setLiveTrades] = useState<LiveTrade[]>([]);
  const [limitTraps, setLimitTraps] = useState<LimitTrap[]>([]);
  const [matrix, setMatrix] = useState<MatrixData | null>(null);
  const [jpyVelocity, setJpyVelocity] = useState<number>(0);
  const [jpyAlert, setJpyAlert] = useState(false);
  const [leakCount, setLeakCount] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [matrixDuration, setMatrixDuration] = useState('—');
  const [orderBook, setOrderBook] = useState<OrderBookEntry[]>([]);
  const [zone2Tab, setZone2Tab] = useState<'shield' | 'orderbook'>('shield');

  // JPY slot count from live trades + pending limits
  const jpySlotCount = useMemo(() => {
    const filledJpy = liveTrades.filter(t => t.pair.includes('JPY')).length;
    const pendingJpy = limitTraps.filter(t => t.pair.includes('JPY')).length;
    return filledJpy + pendingJpy;
  }, [liveTrades, limitTraps]);

  const fetchAll = useCallback(async () => {
    try {
      // Parallel fetches
      const [accountRes, openTradesRes, agentConfigsRes, closedTodayRes, matrixRes, jpyMemRes, orderBookRes] = await Promise.all([
        // Account balance
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oanda-execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ action: 'account-summary', environment: 'practice' }),
        }).then(r => r.json()).catch(() => null),

        // Open trades (filled + submitted/pending limit)
        supabase.from('oanda_orders')
          .select('*')
          .like('agent_id', 'atlas-hedge-%')
          .in('status', ['filled', 'open', 'submitted'])
          .is('closed_at', null)
          .eq('baseline_excluded', false)
          .order('created_at', { ascending: false }),

        // Agent configs
        supabase.from('agent_configs')
          .select('agent_id, config, is_active')
          .like('agent_id', 'atlas-hedge-%')
          .order('agent_id'),

        // Closed today
        supabase.from('oanda_orders')
          .select('agent_id, currency_pair, direction, entry_price, exit_price, oanda_trade_id')
          .like('agent_id', 'atlas-hedge-%')
          .eq('status', 'closed')
          .not('entry_price', 'is', null)
          .not('exit_price', 'is', null)
          .not('oanda_trade_id', 'is', null)
          .eq('baseline_excluded', false)
          .gte('closed_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),

        // Matrix
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sovereign-matrix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ environment: 'practice' }),
        }).then(r => r.json()).catch(() => null),

        // JPY velocity from sovereign_memory
        supabase.from('sovereign_memory')
          .select('payload, updated_at')
          .eq('memory_key', 'jpy_rank_tracker')
          .eq('memory_type', 'risk_monitor')
          .limit(1)
          .maybeSingle(),

        // Order book — all orders from last 90 days
        supabase.from('oanda_orders')
          .select('id, currency_pair, agent_id, direction, status, entry_price, exit_price, requested_price, slippage_pips, spread_at_entry, fill_latency_ms, sovereign_override_tag, sovereign_override_status, created_at, closed_at, oanda_trade_id, oanda_order_id')
          .like('agent_id', 'atlas-hedge-%')
          .eq('baseline_excluded', false)
          .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(500),
      ]);

      // Account
      if (accountRes?.success && accountRes.account) {
        setAccountBalance(parseFloat(accountRes.account.balance));
      }

      // Matrix
      if (matrixRes?.success) {
        setMatrix({
          sortedCurrencies: matrixRes.sortedCurrencies,
          currencyRanks: matrixRes.currencyRanks,
          currencyScores: matrixRes.currencyScores,
          predator: matrixRes.predator,
          prey: matrixRes.prey,
          timestamp: matrixRes.timestamp,
        });
      }

      // JPY velocity
      if (jpyMemRes.data?.payload) {
        const p = jpyMemRes.data.payload as Record<string, unknown>;
        const prevRank = (p.previousRank as number) ?? 4;
        const curRank = matrixRes?.currencyRanks?.JPY ?? 4;
        const shift = Math.abs(curRank - prevRank);
        const updatedAt = jpyMemRes.data.updated_at;
        const mins = updatedAt ? (Date.now() - new Date(updatedAt).getTime()) / 60000 : 999;
        const velocity = mins > 0 ? (shift / mins) * 15 : 0; // per 15 min
        setJpyVelocity(Math.round(velocity * 1000) / 1000);
        setJpyAlert(shift >= 4 && mins <= 30);
      }

      const openTrades = openTradesRes.data || [];
      const configs = agentConfigsRes.data || [];
      const closedToday = closedTodayRes.data || [];

      // Build agent statuses for Core 4
      const dailyByAgent = new Map<string, { pips: number; wins: number; total: number }>();
      closedToday.forEach((t: any) => {
        const aid = t.agent_id || '';
        if (!dailyByAgent.has(aid)) dailyByAgent.set(aid, { pips: 0, wins: 0, total: 0 });
        const e = dailyByAgent.get(aid)!;
        const p = computePips(t.direction, t.entry_price, t.exit_price, t.currency_pair);
        e.pips += p;
        e.total++;
        if (p > 0) e.wins++;
      });

      const agentStatuses: AgentStatus[] = CORE_AGENTS.map(aid => {
        const cfg = configs.find((c: any) => c.agent_id === aid);
        const daily = dailyByAgent.get(aid);
        const trade = openTrades.find((t: any) => t.agent_id === aid && t.status === 'filled' && t.oanda_trade_id);
        const pending = openTrades.find((t: any) => t.agent_id === aid && t.status !== 'filled');

        return {
          agentId: aid,
          label: aid.replace('atlas-hedge-', '').toUpperCase(),
          status: trade ? 'ACTIVE' : pending ? 'PENDING' : 'READY',
          dailyPips: Math.round((daily?.pips ?? 0) * 10) / 10,
          dailyWinRate: daily && daily.total > 0 ? Math.round((daily.wins / daily.total) * 100) : 0,
          dailyTrades: daily?.total ?? 0,
          currentPair: trade?.currency_pair || null,
          currentDirection: trade?.direction || null,
          equityCurve: [],
        };
      });
      setAgents(agentStatuses);

      // Check for leaks (non-core agents with open trades)
      const nonCoreActive = openTrades.filter((t: any) =>
        t.status === 'filled' && t.oanda_trade_id && !CORE_AGENTS.includes(t.agent_id || '')
      );
      setLeakCount(nonCoreActive.length);

      // Live trades (filled only)
      const filled = openTrades.filter((t: any) => t.status === 'filled' && t.oanda_trade_id && t.entry_price);
      const liveTradeData: LiveTrade[] = filled.map((t: any) => {
        const gov = (typeof t.governance_payload === 'object' && t.governance_payload) ? t.governance_payload as Record<string, unknown> : {};
        const entryRankGap = gov.entryRankGap as number | undefined;
        const pair = t.currency_pair;
        const pairParts = pair.split('_');
        let currentGap: number | null = null;
        let logicIntegrity: number | null = null;

        if (entryRankGap != null && matrixRes?.currencyRanks && pairParts.length === 2) {
          const baseRank = matrixRes.currencyRanks[pairParts[0]] ?? 4;
          const quoteRank = matrixRes.currencyRanks[pairParts[1]] ?? 4;
          currentGap = Math.abs(baseRank - quoteRank);
          logicIntegrity = entryRankGap > 0 ? Math.round((currentGap / entryRankGap) * 100) : null;
        }

        // Current price from unrealizedPL or fallback
        const currentPriceFallback = t.entry_price;
        const mfePrice = t.mfe_price ?? t.entry_price;
        const pnlPips = t.ue_r != null && t.r_pips != null ? Math.round(t.ue_r * t.r_pips * 10) / 10 : 0;

        const ageMs = Date.now() - new Date(t.created_at).getTime();
        const ageMins = Math.floor(ageMs / 60000);
        const tradeAge = ageMins < 60 ? `${ageMins}m` : `${Math.floor(ageMins / 60)}h ${ageMins % 60}m`;

        let shieldStatus = '🟢 HOLDING';
        if (logicIntegrity != null) {
          if (logicIntegrity < 20) shieldStatus = '🔴 HARD KILL ARMED';
          else if (logicIntegrity < 40) shieldStatus = '🟠 SOVEREIGN EXIT ARMED';
          else if (logicIntegrity < 60) shieldStatus = '🟡 LOGIC DECAYING';
          else shieldStatus = '🟢 MATRIX STRONG';
        }

        return {
          id: t.id,
          oandaTradeId: t.oanda_trade_id,
          pair,
          direction: t.direction,
          entryPrice: t.entry_price,
          currentPrice: currentPriceFallback,
          pnlPips,
          logicIntegrity,
          entryRankGap: entryRankGap ?? null,
          currentRankGap: currentGap,
          shieldStatus,
          agentId: t.agent_id || '',
          slPrice: null, // Would need OANDA trade data
          tradeAge,
        };
      });
      setLiveTrades(liveTradeData);

      // Limit traps (submitted/open without oanda_trade_id meaning pending limit)
      const pending = openTrades.filter((t: any) =>
        (t.status === 'submitted' || t.status === 'open') && t.requested_price
      );
      const trapData: LimitTrap[] = pending.map((t: any) => {
        const ageMs = Date.now() - new Date(t.created_at).getTime();
        const expiryMins = Math.max(0, 60 - Math.floor(ageMs / 60000));
        const isMom = (t.agent_id || '').includes('-m');

        return {
          id: t.id,
          oandaOrderId: t.oanda_order_id,
          pair: t.currency_pair,
          agentId: t.agent_id || '',
          strategy: isMom ? 'MOM' : 'CTR',
          type: t.direction === 'long' ? 'BUY_LIMIT' : 'SELL_LIMIT',
          entryPrice: t.requested_price,
          distance: 0, // Would need current price
          expiryMinutes: expiryMins,
          direction: t.direction,
        };
      });
      setLimitTraps(trapData);

      // Order Book
      const obData = (orderBookRes.data || []).map((o: any) => {
        const pair = o.currency_pair;
        let pnlPips: number | null = null;
        if (o.entry_price && o.exit_price) {
          const mult = pair.includes('JPY') ? 100 : 10000;
          pnlPips = Math.round((o.direction === 'long'
            ? (o.exit_price - o.entry_price) * mult
            : (o.entry_price - o.exit_price) * mult) * 10) / 10;
        }
        return {
          id: o.id,
          pair,
          agentId: o.agent_id || '',
          direction: o.direction,
          status: o.status,
          entryPrice: o.entry_price,
          exitPrice: o.exit_price,
          requestedPrice: o.requested_price,
          pnlPips,
          slippage: o.slippage_pips,
          spread: o.spread_at_entry,
          fillLatency: o.fill_latency_ms,
          sovereignTag: o.sovereign_override_tag,
          sovereignStatus: o.sovereign_override_status,
          logicIntegrityAtExit: null,
          createdAt: o.created_at,
          closedAt: o.closed_at,
          oandaTradeId: o.oanda_trade_id,
          oandaOrderId: o.oanda_order_id,
        } as OrderBookEntry;
      });
      setOrderBook(obData);

      setLastRefresh(new Date());
    } catch (err) {
      console.error('[CITADEL] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh: matrix 60s, price 5s concept (using 15s for API limits)
  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('citadel-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oanda_orders' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  const session = getSession();
  const sessionRibbon = getSessionRibbon();

  return (
    <div className="min-h-screen font-mono text-slate-800" style={{ background: '#f0f4f8' }}>
      {/* JPY Alert Flash */}
      <AnimatePresence>
        {jpyAlert && (
          <motion.div
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            className="fixed top-0 left-0 right-0 z-50 text-center py-2 text-xs font-black tracking-widest"
            style={{ background: '#ff6b00', color: '#fff' }}
          >
            🚨 JPY SQUEEZE DETECTED — VELOCITY SPIKE — ALL JPY POSITIONS AT RISK 🚨
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl border-b px-6 py-3"
        style={{ background: 'rgba(255,255,255,0.92)', borderColor: '#e2e8f0' }}>
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #1e293b, #334155)' }}>
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight text-slate-900">
                THE CITADEL
              </h1>
              <p className="text-[9px] text-slate-400 tracking-[0.2em] uppercase">
                V12.5.1 Live Command View
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Balance */}
            <div className="text-right">
              <div className="text-[9px] text-slate-400 uppercase tracking-wider">Account</div>
              <div className="text-sm font-black text-slate-900">
                ${accountBalance != null ? accountBalance.toFixed(2) : '—'}
              </div>
            </div>

            {/* Session */}
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg"
              style={{ background: '#f1f5f9', border: '1px solid #e2e8f0' }}>
              <Radio className="w-3 h-3 text-emerald-500" />
              <span className="text-[10px] font-bold text-slate-700">{session}</span>
            </div>

            {/* Nav */}
            <div className="flex gap-1">
              <Link to="/hedge">
                <button className="text-[9px] px-2.5 py-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all">
                  HEDGE
                </button>
              </Link>
              <Link to="/matrix">
                <button className="text-[9px] px-2.5 py-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all">
                  MATRIX
                </button>
              </Link>
            </div>

            <button onClick={fetchAll} disabled={loading}
              className="text-[9px] px-2.5 py-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all flex items-center gap-1">
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto p-5 space-y-5">

        {/* ═══════════════════════════════════════════════════
            ZONE 1: THE WAR ROOM — Core 4 Agent Status
        ═══════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Swords className="w-4 h-4 text-slate-700" />
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Zone 1 — The War Room
              </h2>
              <span className="text-[9px] text-slate-400">Core 4 Specialists</span>
            </div>
            {leakCount > 0 && (
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold"
                style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
                <AlertTriangle className="w-3 h-3" />
                LEAK: {leakCount} non-core agent{leakCount > 1 ? 's' : ''} active
              </motion.div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {agents.map(agent => {
              const isActive = agent.status === 'ACTIVE';
              const isPending = agent.status === 'PENDING';
              return (
                <motion.div
                  key={agent.agentId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl p-4 transition-all"
                  style={{
                    background: isActive ? '#fff' : '#fafbfc',
                    border: `1px solid ${isActive ? '#3b82f6' : isPending ? '#f59e0b' : '#e5e7eb'}`,
                    boxShadow: isActive ? '0 4px 20px rgba(59,130,246,0.08)' : 'none',
                  }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-slate-900">{agent.label}</span>
                      <span className="text-[8px] px-1.5 py-0.5 rounded font-bold"
                        style={{
                          background: isActive ? '#dbeafe' : isPending ? '#fef3c7' : '#f3f4f6',
                          color: isActive ? '#2563eb' : isPending ? '#d97706' : '#9ca3af',
                        }}>
                        {agent.status}
                      </span>
                    </div>
                    <div className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-emerald-400' : isPending ? 'bg-amber-400' : 'bg-slate-300'}`}
                      style={{ boxShadow: isActive ? '0 0 8px #34d399' : 'none' }} />
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-lg p-2" style={{ background: '#f8fafc' }}>
                      <div className="text-[7px] text-slate-400 uppercase tracking-wider">24h Pips</div>
                      <div className="text-sm font-black" style={{ color: agent.dailyPips >= 0 ? '#16a34a' : '#dc2626' }}>
                        {agent.dailyPips >= 0 ? '+' : ''}{agent.dailyPips}
                      </div>
                    </div>
                    <div className="rounded-lg p-2" style={{ background: '#f8fafc' }}>
                      <div className="text-[7px] text-slate-400 uppercase tracking-wider">Win %</div>
                      <div className="text-sm font-black text-slate-700">
                        {agent.dailyTrades > 0 ? `${agent.dailyWinRate}%` : 'N/A'}
                      </div>
                    </div>
                  </div>

                  {/* Active pair */}
                  {agent.currentPair && (
                    <div className="mt-2.5 flex items-center gap-1.5 text-[10px]">
                      <Crosshair className="w-3 h-3 text-blue-500" />
                      <span className="font-bold text-slate-700">{agent.currentPair?.replace('_', '/')}</span>
                      <span className={agent.currentDirection === 'long' ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>
                        {agent.currentDirection?.toUpperCase()}
                      </span>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Leak Gauge */}
          <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
            <Shield className="w-3 h-3" />
            LEAK GAUGE: <span className={leakCount > 0 ? 'text-red-500 font-bold' : 'text-emerald-500 font-bold'}>
              {leakCount > 0 ? `${leakCount} ACTIVE` : '0.00 (All quarantined agents dormant)'}
            </span>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════
            ZONE 2: THE DEFENSIVE SHIELD — Live Positions
        ═══════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-slate-700" />
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Zone 2 — The Defensive Shield
              </h2>
            </div>
            <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: '#f1f5f9' }}>
              <button
                onClick={() => setZone2Tab('shield')}
                className="px-3 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center gap-1"
                style={{
                  background: zone2Tab === 'shield' ? '#fff' : 'transparent',
                  color: zone2Tab === 'shield' ? '#1e293b' : '#94a3b8',
                  boxShadow: zone2Tab === 'shield' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                <Shield className="w-3 h-3" /> Live Positions
              </button>
              <button
                onClick={() => setZone2Tab('orderbook')}
                className="px-3 py-1.5 rounded-md text-[10px] font-bold transition-all flex items-center gap-1"
                style={{
                  background: zone2Tab === 'orderbook' ? '#fff' : 'transparent',
                  color: zone2Tab === 'orderbook' ? '#1e293b' : '#94a3b8',
                  boxShadow: zone2Tab === 'orderbook' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                <BookOpen className="w-3 h-3" /> Order Book
                <span className="text-[8px] font-mono opacity-60">{orderBook.length}</span>
              </button>
            </div>
          </div>

          {zone2Tab === 'shield' ? (
            <>
              {liveTrades.length === 0 ? (
                <div className="rounded-xl p-8 text-center" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
                  <Shield className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No active positions</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {liveTrades.map(trade => {
                    const integrityColor = trade.logicIntegrity == null ? '#94a3b8'
                      : trade.logicIntegrity >= 60 ? '#16a34a'
                      : trade.logicIntegrity >= 40 ? '#f59e0b'
                      : trade.logicIntegrity >= 20 ? '#ea580c'
                      : '#dc2626';

                    return (
                      <motion.div
                        key={trade.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="rounded-xl p-4"
                        style={{
                          background: '#fff',
                          border: `1px solid ${integrityColor}30`,
                          boxShadow: `0 2px 12px ${integrityColor}10`,
                        }}
                      >
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                              style={{ background: `${integrityColor}10`, border: `1px solid ${integrityColor}30` }}>
                              {trade.direction === 'long'
                                ? <TrendingUp className="w-5 h-5" style={{ color: integrityColor }} />
                                : <TrendingDown className="w-5 h-5" style={{ color: integrityColor }} />
                              }
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-base font-black text-slate-900">
                                  {trade.pair.replace('_', '/')}
                                </span>
                                <span className={`text-xs font-bold ${trade.direction === 'long' ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {trade.direction.toUpperCase()}
                                </span>
                                <span className="text-[9px] text-slate-400">#{trade.oandaTradeId}</span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500">
                                <span>Entry: <strong className="text-slate-700">{formatPrice(trade.entryPrice, trade.pair)}</strong></span>
                                <span>Age: <strong className="text-slate-700">{trade.tradeAge}</strong></span>
                                <span className="text-[9px] text-slate-400">({trade.agentId.replace('atlas-hedge-', '')})</span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-lg font-black" style={{ color: trade.pnlPips >= 0 ? '#16a34a' : '#dc2626' }}>
                              {trade.pnlPips >= 0 ? '+' : ''}{trade.pnlPips.toFixed(1)}p
                            </div>
                            <div className="text-[9px] text-slate-400 mt-0.5">Unrealized P&L</div>
                          </div>
                        </div>

                        {/* Logic Integrity Bar */}
                        <div className="mt-3 pt-3" style={{ borderTop: '1px solid #f1f5f9' }}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-slate-600">Logic Integrity</span>
                              {trade.entryRankGap != null && (
                                <span className="text-[9px] text-slate-400">
                                  Gap: {trade.entryRankGap} → {trade.currentRankGap ?? '?'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black" style={{ color: integrityColor }}>
                                {trade.logicIntegrity != null ? `${trade.logicIntegrity}%` : '—'}
                              </span>
                              <span className="text-[9px]">{trade.shieldStatus}</span>
                            </div>
                          </div>
                          <div className="h-2 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: integrityColor }}
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(100, trade.logicIntegrity ?? 100)}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut' }}
                            />
                          </div>
                          <div className="flex justify-between mt-1 text-[8px] text-slate-400">
                            <span>20% Hard Kill</span>
                            <span>40% Sovereign Exit</span>
                            <span>100% Full Edge</span>
                          </div>
                        </div>

                        {/* Trade Methodology Audit Strip */}
                        {(() => {
                          const role = AGENT_ROLES[trade.agentId];
                          const verdict = matrix?.currencyRanks
                            ? generateVerdict(trade.agentId, trade.pair, trade.direction, matrix.currencyRanks)
                            : null;
                          const gradeColor = verdict?.grade === 'CORRECT' ? '#16a34a'
                            : verdict?.grade === 'WARNING' ? '#dc2626' : '#f59e0b';
                          return (
                            <div className="mt-3 pt-3 space-y-1.5" style={{ borderTop: '1px solid #f1f5f9' }}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                                  style={{ background: '#dbeafe', color: '#2563eb' }}>
                                  {trade.agentId.replace('atlas-hedge-', '').toUpperCase()}
                                </span>
                                <span className="text-[10px] font-bold text-slate-700">
                                  {role?.role ?? 'Unknown'}
                                </span>
                                <span className="text-[9px] text-slate-400">|</span>
                                <span className={`text-[10px] font-bold ${trade.direction === 'long' ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {trade.direction.toUpperCase()}
                                </span>
                              </div>
                              {verdict && (
                                <div className="flex items-start gap-1.5 text-[10px] leading-snug"
                                  style={{ color: gradeColor }}>
                                  <span className="font-black shrink-0">{verdict.grade}</span>
                                  <span className="text-slate-600">{verdict.verdict.replace(/^(CORRECT|ALIGNED|WARNING)\.\s*/, '')}</span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <CitadelOrderBook orders={orderBook} currencyRanks={matrix?.currencyRanks ?? null} />
          )}
        </section>

        {/* ═══════════════════════════════════════════════════
            ZONE 3: THE TRAP MONITOR — Pending Limit Orders
        ═══════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-slate-700" />
              <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Zone 3 — The Trap Monitor
              </h2>
              <span className="text-[9px] text-slate-400">Active Limit Orders</span>
            </div>

            {/* JPY Slot Tracker */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ background: jpySlotCount >= 2 ? '#fef2f2' : '#f0fdf4', border: `1px solid ${jpySlotCount >= 2 ? '#fecaca' : '#bbf7d0'}` }}>
              <span className="text-[9px] font-bold" style={{ color: jpySlotCount >= 2 ? '#dc2626' : '#16a34a' }}>
                JPY SLOTS
              </span>
              <div className="flex gap-0.5">
                {[0, 1].map(i => (
                  <div key={i} className="w-3 h-3 rounded-full"
                    style={{
                      background: i < jpySlotCount ? (jpySlotCount >= 2 ? '#dc2626' : '#16a34a') : '#e5e7eb',
                      border: `1px solid ${i < jpySlotCount ? (jpySlotCount >= 2 ? '#b91c1c' : '#15803d') : '#d1d5db'}`,
                    }} />
                ))}
              </div>
              <span className="text-[9px] font-mono" style={{ color: jpySlotCount >= 2 ? '#dc2626' : '#16a34a' }}>
                {jpySlotCount}/2 {jpySlotCount >= 2 ? '🔒' : ''}
              </span>
            </div>
          </div>

          {limitTraps.length === 0 ? (
            <div className="rounded-xl p-6 text-center" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
              <Target className="w-6 h-6 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No active limit traps</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
              <table className="w-full text-[11px]">
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                    <th className="text-left px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Pair</th>
                    <th className="text-left px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Agent</th>
                    <th className="text-left px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Role</th>
                    <th className="text-left px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Type</th>
                    <th className="text-right px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Entry</th>
                    <th className="text-left px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Verdict</th>
                    <th className="text-right px-3 py-2.5 font-bold text-slate-500 uppercase tracking-wider text-[9px]">Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {limitTraps.map(trap => {
                    const role = AGENT_ROLES[trap.agentId];
                    const verdict = matrix?.currencyRanks
                      ? generateVerdict(trap.agentId, trap.pair, trap.direction, matrix.currencyRanks)
                      : null;
                    const gradeColor = verdict?.grade === 'CORRECT' ? '#16a34a'
                      : verdict?.grade === 'WARNING' ? '#dc2626' : '#f59e0b';
                    return (
                      <tr key={trap.id} className="border-b" style={{ borderColor: '#f1f5f9' }}>
                        <td className="px-3 py-2.5 font-bold text-slate-800">
                          {trap.pair.replace('_', '/')}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                            style={{ background: '#dbeafe', color: '#2563eb' }}>
                            {trap.agentId.replace('atlas-hedge-', '').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-[10px] font-bold text-slate-700">
                          {role?.role ?? '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`font-bold ${trap.direction === 'long' ? 'text-emerald-600' : 'text-red-600'}`}>
                            {trap.type}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-700">
                          {formatPrice(trap.entryPrice, trap.pair)}
                        </td>
                        <td className="px-3 py-2.5 min-w-[320px]">
                          {verdict && (
                            <div className="flex items-start gap-1 text-[10px] leading-snug">
                              <span className="font-black shrink-0" style={{ color: gradeColor }}>{verdict.grade}</span>
                              <span className="text-slate-500">{verdict.verdict.replace(/^(CORRECT|ALIGNED|WARNING)\.\s*/, '')}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`font-bold ${trap.expiryMinutes <= 5 ? 'text-red-500' : trap.expiryMinutes <= 15 ? 'text-amber-500' : 'text-slate-600'}`}>
                            {trap.expiryMinutes}m
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ═══════════════════════════════════════════════════
            ZONE 4: REGIME & VELOCITY
        ═══════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-slate-700" />
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Zone 4 — Regime & Velocity
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* 28-Cross Matrix */}
            <div className="rounded-xl p-4 col-span-1 md:col-span-2"
              style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                28-Cross Matrix Rankings
              </div>
              {matrix ? (
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    {matrix.sortedCurrencies.map((cur, i) => {
                      const isFirst = i === 0;
                      const isLast = i === matrix.sortedCurrencies.length - 1;
                      return (
                        <div key={cur} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg"
                          style={{
                            background: isFirst ? '#f0fdf4' : isLast ? '#fef2f2' : '#f8fafc',
                            border: `1px solid ${isFirst ? '#bbf7d0' : isLast ? '#fecaca' : '#e5e7eb'}`,
                          }}>
                          <span className="text-[10px] font-black" style={{
                            color: isFirst ? '#16a34a' : isLast ? '#dc2626' : '#475569'
                          }}>
                            #{i + 1}
                          </span>
                          <span className="text-sm">{FLAGS[cur] || ''}</span>
                          <span className="text-[11px] font-bold text-slate-700">{cur}</span>
                          <span className="text-[9px] text-slate-400 font-mono">
                            {matrix.currencyScores[cur]?.toFixed(4)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    <span>
                      <Crown className="w-3 h-3 inline text-emerald-500 mr-1" />
                      Predator: <strong className="text-slate-700">{FLAGS[matrix.predator]} {matrix.predator}</strong>
                    </span>
                    <span>vs</span>
                    <span>
                      <Skull className="w-3 h-3 inline text-red-500 mr-1" />
                      Prey: <strong className="text-slate-700">{FLAGS[matrix.prey]} {matrix.prey}</strong>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-300">Loading matrix…</div>
              )}
            </div>

            {/* JPY Velocity + Session */}
            <div className="space-y-3">
              {/* JPY Velocity */}
              <div className="rounded-xl p-4"
                style={{
                  background: jpyAlert ? '#fef2f2' : '#fff',
                  border: `1px solid ${jpyAlert ? '#fecaca' : '#e5e7eb'}`,
                }}>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  JPY Velocity
                </div>
                <div className="text-2xl font-black" style={{ color: jpyAlert ? '#dc2626' : jpyVelocity > 0.03 ? '#f59e0b' : '#16a34a' }}>
                  {jpyVelocity.toFixed(3)}
                </div>
                <div className="text-[9px] text-slate-400 mt-1">
                  rank shift / 15min
                </div>
                <div className="mt-2 text-[10px] font-bold" style={{ color: jpyAlert ? '#dc2626' : '#16a34a' }}>
                  {jpyAlert ? '🚨 SQUEEZE THRESHOLD BREACHED' : '✅ Stable'}
                </div>
              </div>

              {/* Session Ribbon */}
              <div className="rounded-xl p-4" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Session Ribbon
                </div>
                <div className="space-y-1.5">
                  {sessionRibbon.map(s => (
                    <div key={s.name} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px]"
                      style={{
                        background: s.active ? '#f0fdf4' : '#f8fafc',
                        border: `1px solid ${s.active ? '#bbf7d0' : '#e5e7eb'}`,
                      }}>
                      <div className={`w-2 h-2 rounded-full ${s.active ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                      <span className={`font-bold ${s.active ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {s.name}
                      </span>
                      <span className="ml-auto text-slate-400 text-[9px]">
                        {s.active ? 'ACTIVE' : s.next ? 'NEXT' : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center text-[9px] text-slate-400 py-4">
          Last refresh: {lastRefresh.toLocaleTimeString()} · Auto-refresh: 15s
        </div>
      </div>
    </div>
  );
};

export default TheCitadel;
