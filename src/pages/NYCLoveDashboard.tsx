import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Radio, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ADIRadarHub from '@/components/nexus/ADIRadarHub';
import SovereignLeaderboard from '@/components/nexus/SovereignLeaderboard';
import NexusPressureCard from '@/components/nexus/NexusPressureCard';
import TentacleLog from '@/components/nexus/TentacleLog';
import LiquidityHeatmap from '@/components/nexus/LiquidityHeatmap';
import SessionClock from '@/components/nexus/SessionClock';
import NeuroMatrixCortex, { type NeuroMatrixState, type TentacleState } from '@/components/nexus/NeuroMatrixCortex';

const INSTRUMENTS = ['EUR_USD', 'GBP_USD', 'USD_JPY'];
const USD_CROSSES = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'USD_CHF', 'USD_CAD', 'AUD_USD', 'NZD_USD'];

interface AgentResult {
  success: boolean;
  reason?: string;
  detail?: string;
  engine?: string;
  painWeight?: number;
  executions?: { instrument: string; direction: string; status: string; detail: string; nexusP?: number }[];
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

interface CurrencyRank {
  currency: string;
  rank: number;
}

interface OrderBookData {
  price: number;
  longPct: number;
  shortPct: number;
  buckets: { price: number; longPct: number; shortPct: number }[];
}

interface ActiveTrade {
  instrument: string;
  direction: string;
  entry_price: number;
  status: string;
}

// ── Parse Neuro-Matrix v3 state from agent log + result ──
function parseNeuroMatrixState(result: AgentResult, pricing: Record<string, PricingData>, activeTrades: ActiveTrade[]): NeuroMatrixState {
  const logs = result.log || [];
  const defaultState: NeuroMatrixState = {
    painWeight: result.painWeight ?? 1.0,
    recentWins: 0, recentLosses: 0, maxConsecutiveLosses: 0,
    leadingSynapse: null, leadingVelocity: 0,
    sympatheticWeak: null, sympatheticStrong: null,
    tentacles: [],
    engineVersion: result.engine || 'neuro-matrix-v3',
    timestamp: result.timestamp || '',
  };

  // Parse pain memory: "W=2 L=2 maxConsecL=2 → painWeight=0.70"
  const painLine = logs.find(l => l.includes('PAIN MEMORY'));
  if (painLine) {
    const wMatch = painLine.match(/W=(\d+)/);
    const lMatch = painLine.match(/L=(\d+)/);
    const cMatch = painLine.match(/maxConsecL=(\d+)/);
    if (wMatch) defaultState.recentWins = parseInt(wMatch[1]);
    if (lMatch) defaultState.recentLosses = parseInt(lMatch[1]);
    if (cMatch) defaultState.maxConsecutiveLosses = parseInt(cMatch[1]);
  }

  // Parse leading synapse: "LEADING SYNAPSE: USD_JPY velocity=2.5x"
  const synapseLine = logs.find(l => l.includes('LEADING SYNAPSE:'));
  if (synapseLine) {
    const instMatch = synapseLine.match(/LEADING SYNAPSE: (\w+_\w+)/);
    const velMatch = synapseLine.match(/velocity=(\d+\.?\d*)x/);
    if (instMatch) defaultState.leadingSynapse = instMatch[1];
    if (velMatch) defaultState.leadingVelocity = parseFloat(velMatch[1]);
  }

  // Parse sympathetic liquidity: "SYMPATHETIC LIQUIDITY: GBP_USD wall=2.1% (weak) vs EUR_USD wall=3.5% (thick)"
  const sympathLine = logs.find(l => l.includes('SYMPATHETIC LIQUIDITY:'));
  if (sympathLine) {
    const weakMatch = sympathLine.match(/(\w+_\w+) wall=[\d.]+% \(weak\)/);
    const strongMatch = sympathLine.match(/(\w+_\w+) wall=[\d.]+% \(thick\)/);
    if (weakMatch) defaultState.sympatheticWeak = weakMatch[1];
    if (strongMatch) defaultState.sympatheticStrong = strongMatch[1];
  }

  // Parse Apex target
  const apexLine = logs.find(l => l.includes('APEX TARGET:'));
  const apexInst = apexLine?.match(/APEX TARGET: (\w+_\w+)/)?.[1] || null;

  // Parse secondary targets
  const secondaryLine = logs.find(l => l.includes('SECONDARY:'));
  const secondaryInsts: string[] = [];
  if (secondaryLine) {
    const matches = secondaryLine.matchAll(/(\w+_\w+)\(/g);
    for (const m of matches) secondaryInsts.push(m[1]);
  }

  // Build tentacle states per instrument
  for (const instrument of INSTRUMENTS) {
    const tag = `[${instrument}]`;
    const p = pricing[instrument];
    const trade = activeTrades.find(t => t.instrument === instrument);

    // Parse sovereign direction
    const sovLine = logs.find(l => l.includes(tag) && l.includes('SOVEREIGN:'));
    let sovereignDir: 'BUY' | 'SELL' | null = null;
    if (sovLine?.includes('→ BUY')) sovereignDir = 'BUY';
    else if (sovLine?.includes('→ SELL')) sovereignDir = 'SELL';

    // Parse ADI
    const adiLine = logs.find(l => l.includes(tag) && l.includes('ADI:'));
    let adiConfirmed = 0, adiTotal = 0, isRetailHunt = false;
    if (adiLine) {
      const confMatch = adiLine.match(/confirmed=(\d+)\/(\d+)/);
      if (confMatch) { adiConfirmed = parseInt(confMatch[1]); adiTotal = parseInt(confMatch[2]); }
      isRetailHunt = adiLine.includes('hunt=true');
    }

    // Parse nexus
    const nexusLine = logs.find(l => l.includes(tag) && l.includes('NEXUS:'));
    let nexusProbability = 0, nexusTier: TentacleState['nexusTier'] = 'BLOCKED';
    let executionDir: 'BUY' | 'SELL' | null = sovereignDir;
    let isFaded = false;
    if (nexusLine) {
      const pMatch = nexusLine.match(/P=(\d+\.?\d*)%/);
      if (pMatch) nexusProbability = parseFloat(pMatch[1]) / 100;
      if (nexusLine.includes('OMNI_STRIKE')) nexusTier = 'OMNI_STRIKE';
      else if (nexusLine.includes('PROBE')) nexusTier = 'PROBE';
      else if (nexusLine.includes('SOVEREIGN_ONLY')) nexusTier = 'SOVEREIGN_ONLY';
      const fadeMatch = nexusLine.match(/FADED→(\w+)/);
      if (fadeMatch) { executionDir = fadeMatch[1] as 'BUY' | 'SELL'; isFaded = true; }
    }

    // Parse breath
    const breathLine = logs.find(l => l.includes(tag) && l.includes('BREATH:'));
    let breathRatio = 1, adaptiveSL = 20, adaptiveTP = 60, atrPips = 0;
    if (breathLine) {
      const brMatch = breathLine.match(/breath=(\d+\.?\d*)/);
      const slMatch = breathLine.match(/SL=(\d+\.?\d*)/);
      const tpMatch = breathLine.match(/TP=(\d+\.?\d*)/);
      const atrMatch = breathLine.match(/(?:ATR|TICK-VAR)=(\d+\.?\d*)/);
      if (brMatch) breathRatio = parseFloat(brMatch[1]);
      if (slMatch) adaptiveSL = parseFloat(slMatch[1]);
      if (tpMatch) adaptiveTP = parseFloat(tpMatch[1]);
      if (atrMatch) atrPips = parseFloat(atrMatch[1]);
    }

    // Parse OBI / elephant
    const obiLine = logs.find(l => l.includes(tag) && l.includes('OBI:'));
    let elephantAction = 'PATH_CLEAR', elephantDistance = 0, wallStrength = 0;
    if (obiLine) {
      for (const action of ['STRIKE_THROUGH', 'STOP_RUN_CAPTURE', 'ELEPHANT_REJECTION', 'WAIT_FOR_ABSORPTION', 'PATH_CLEAR']) {
        if (obiLine.includes(action)) { elephantAction = action; break; }
      }
      const distMatch = obiLine.match(/(\d+\.?\d*)p away/);
      if (distMatch) elephantDistance = parseFloat(distMatch[1]);
    }

    // Parse velocity from execution line or general
    let velocityRatio = 0, velocitySpike = false;
    const execLine = logs.find(l => l.includes(tag) && l.includes('EXECUTING:'));
    // Velocity is in nexus detail or synapse lines
    const synapseBoostLine = logs.find(l => l.includes(`SYNAPSE → ${instrument}:`));
    let synapseBoost = 0;
    if (synapseBoostLine) {
      const boostMatch = synapseBoostLine.match(/\+(\d+)% probe/);
      if (boostMatch) synapseBoost = parseInt(boostMatch[1]) / 100;
    }

    // Check execution detail for sizing
    let sizeMultiplier = 1.0, sympatheticMultiplier = 1.0;
    if (execLine) {
      const sizeMatch = execLine.match(/\[(APEX|SECONDARY) (\d+\.?\d*)x/);
      if (sizeMatch) sizeMultiplier = parseFloat(sizeMatch[2]);
      const sympathMatch = execLine.match(/SYMPATH (\d+\.?\d*)x/);
      if (sympathMatch) sympatheticMultiplier = parseFloat(sympathMatch[1]);
    }
    if (instrument === defaultState.sympatheticWeak) sympatheticMultiplier = 1.5;
    if (instrument === defaultState.sympatheticStrong) sympatheticMultiplier = 0.5;

    // Has position?
    const hasPosition = logs.some(l => l.includes(tag) && l.includes('Already has open position'));

    // Gate status
    let gateStatus = 'executable';
    if (hasPosition) gateStatus = 'has_position';
    else if (logs.some(l => l.includes(tag) && l.includes('Spread Shield'))) gateStatus = 'spread_blocked';
    else if (logs.some(l => l.includes(tag) && l.includes('NEXUS BLOCKED'))) gateStatus = 'nexus_blocked';
    else if (logs.some(l => l.includes(tag) && l.includes('ELEPHANT_REJECTION'))) gateStatus = 'elephant_blocked';

    // Nerve
    const nerve: 'NOISE' | 'CLEAN_FLOW' = 'CLEAN_FLOW'; // Default — not always logged

    // Trade P&L from trade monitor logs
    let tradePnlPips: number | undefined;
    let tradeTHS: number | undefined;
    if (trade && p) {
      const isJPY = instrument.includes('JPY');
      const scale = isJPY ? 100 : 10000;
      const entry = trade.entry_price;
      const current = p.mid;
      tradePnlPips = trade.direction === 'long'
        ? (current - entry) * scale
        : (entry - current) * scale;
    }

    defaultState.tentacles.push({
      instrument,
      sovereignDir,
      executionDir: executionDir || sovereignDir,
      isFaded,
      nexusProbability,
      nexusTier,
      velocityRatio,
      velocitySpike,
      breathRatio,
      adaptiveSL,
      adaptiveTP,
      nerve,
      elephantAction,
      elephantDistance,
      wallStrength,
      isApex: instrument === apexInst,
      isSecondary: secondaryInsts.includes(instrument),
      sizeMultiplier: instrument === apexInst ? (secondaryInsts.length === 0 ? 1.5 : 1.0) : 0.5,
      sympatheticMultiplier,
      synapseBoost,
      gateStatus,
      hasPosition,
      tradeDirection: trade?.direction,
      tradeEntry: trade?.entry_price,
      tradePnlPips,
      tradeTHS,
      adiConfirmed,
      adiTotal,
      isRetailHunt,
      spread: p?.spread || 0,
      mid: p?.mid || 0,
    });
  }

  return defaultState;
}

const NYCLoveDashboard = () => {
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null);
  const [pricing, setPricing] = useState<Record<string, PricingData>>({});
  const [rankings, setRankings] = useState<CurrencyRank[]>([]);
  const [orderBooks, setOrderBooks] = useState<Record<string, OrderBookData>>({});
  const [activeTrades, setActiveTrades] = useState<ActiveTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoMode, setAutoMode] = useState(true);
  const [cycleCount, setCycleCount] = useState(0);
  const [neuroState, setNeuroState] = useState<NeuroMatrixState | null>(null);
  const [logs, setLogs] = useState<string[]>([
    '[SYSTEM] Neuro-Matrix v3 Cortex initialized',
    '[SYSTEM] Pillars: ADI Truth Filter | Neural Volatility Buffer | OBI Sniffer',
    '[SYSTEM] Cross-Pair: Leading Synapse | Pain Memory | Sympathetic Liquidity',
    '[SYSTEM] Awaiting nexus invocation...',
  ]);

  // Nexus state derived from agent result
  const [nexusData, setNexusData] = useState<Record<string, {
    probability: number;
    direction: 'BUY' | 'SELL' | null;
    adaptiveSL: number;
    adaptiveTP: number;
    atrPips: number;
    avgAtrPips: number;
    breathRatio: number;
    wallInfo: string | null;
  }>>({});

  // ADI state
  const [adiState, setAdiState] = useState({
    dollarStrength: 0,
    confirmedCrosses: 0,
    totalCrosses: 0,
    isRetailHunt: false,
  });

  // Fetch ADI from sovereign_memory cache (populated by agent)
  const fetchAdiCache = useCallback(async () => {
    try {
      const { data: adiCache } = await supabase
        .from('sovereign_memory')
        .select('payload, updated_at')
        .eq('memory_type', 'adi_cache')
        .eq('memory_key', 'live_adi_state')
        .single();

      if (adiCache?.payload) {
        const cached = adiCache.payload as { pricing?: Record<string, any> };
        const prices = cached.pricing || {};
        const usdCrosses = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'USD_CHF', 'USD_CAD', 'AUD_USD', 'NZD_USD'];
        let total = 0;
        for (const cross of usdCrosses) {
          if (prices[cross]) total++;
        }
        if (total > 0) {
          setAdiState(prev => ({ ...prev, confirmedCrosses: total, totalCrosses: 7 }));
        }
        return;
      }

      const { data: strengthData } = await supabase
        .from('sovereign_memory')
        .select('payload')
        .eq('memory_key', 'live_strength_index')
        .eq('memory_type', 'currency_strength')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (strengthData?.payload) {
        const payload = strengthData.payload as { strengths?: { currency: string; rank: number }[] };
        if (payload.strengths) {
          const usd = payload.strengths.find(s => s.currency === 'USD');
          if (usd) {
            const normalized = 1 - ((usd.rank - 1) / 7) * 2;
            const totalCurrencies = payload.strengths.length;
            const weakerCount = payload.strengths.filter(s => s.rank > usd.rank).length;
            setAdiState({ dollarStrength: Math.round(normalized * 100) / 100, confirmedCrosses: weakerCount, totalCrosses: totalCurrencies - 1, isRetailHunt: false });
          }
        }
      }
    } catch { /* empty */ }
  }, []);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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
            mapped[inst] = { bid: p.bid, ask: p.ask, mid: p.mid, spread: (p.ask - p.bid) * pv };
          }
        }
        setPricing(mapped);
      }
    } catch (e) { console.error('[NEXUS] Pricing error:', e); }
  }, [supabaseUrl, apiKey]);

  const fetchRankings = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('sovereign_memory')
        .select('payload')
        .eq('memory_key', 'live_strength_index')
        .eq('memory_type', 'currency_strength')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (data?.payload) {
        const payload = data.payload as { strengths?: { currency: string; rank: number }[] };
        if (payload.strengths) setRankings(payload.strengths);
      }
    } catch { /* empty */ }
  }, []);

  const fetchOrderBooks = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('market_liquidity_map')
        .select('currency_pair, all_buckets, current_price')
        .in('currency_pair', INSTRUMENTS);

      if (data && data.length > 0) {
        const mapped: Record<string, OrderBookData> = {};
        for (const row of data) {
          const buckets = ((row as any).all_buckets || []) as { price: number; longPct: number; shortPct: number }[];
          mapped[row.currency_pair] = { price: row.current_price || 0, longPct: 0, shortPct: 0, buckets };
        }
        setOrderBooks(mapped);
      }
    } catch { /* empty */ }
  }, []);

  const fetchActiveTrades = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('oanda_orders')
        .select('currency_pair, direction, entry_price, status')
        .eq('agent_id', 'nyc-love')
        .in('status', ['filled', 'open', 'submitted'])
        .eq('environment', 'practice');

      if (data) {
        setActiveTrades(data.map(d => ({
          instrument: d.currency_pair,
          direction: d.direction,
          entry_price: d.entry_price || 0,
          status: d.status,
        })));
      }
    } catch { /* empty */ }
  }, []);

  const runAgent = useCallback(async () => {
    setLoading(true);
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${ts}] 🚀 Invoking Neuro-Matrix v3...`]);

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/nyc-love-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
      });
      const data: AgentResult = await res.json();
      setAgentResult(data);
      setCycleCount(c => c + 1);

      if (data.log) {
        setLogs(prev => [...prev, ...data.log!.map(l => `[${ts}] ${l}`)]);

        // Parse nexus data from logs (for pressure cards)
        const nexusMap: Record<string, typeof nexusData[string]> = {};
        for (const inst of INSTRUMENTS) {
          const tag = `[${inst}]`;
          const nexusLine = data.log.find(l => l.includes(tag) && l.includes('NEXUS:'));
          const breathLine = data.log.find(l => l.includes(tag) && l.includes('BREATH:'));
          const obiLine = data.log.find(l => l.includes(tag) && l.includes('OBI:'));
          const sovLine = data.log.find(l => l.includes(tag) && l.includes('SOVEREIGN:'));

          const pMatch = nexusLine?.match(/P=(\d+\.?\d*)%/);
          const probability = pMatch ? parseFloat(pMatch[1]) / 100 : 0;
          let direction: 'BUY' | 'SELL' | null = null;
          if (sovLine?.includes('→ BUY')) direction = 'BUY';
          else if (sovLine?.includes('→ SELL')) direction = 'SELL';

          const slMatch = breathLine?.match(/SL=(\d+\.?\d*)/);
          const tpMatch = breathLine?.match(/TP=(\d+\.?\d*)/);
          const atrMatch = breathLine?.match(/(?:ATR|TICK-VAR)=(\d+\.?\d*)/);
          const avgMatch = breathLine?.match(/avg=(\d+\.?\d*)/);
          const brMatch = breathLine?.match(/breath=(\d+\.?\d*)/);
          const wallMatch = obiLine?.includes('BLOCKED') ? obiLine.split('OBI: ')[1] : null;

          nexusMap[inst] = {
            probability,
            direction,
            adaptiveSL: slMatch ? parseFloat(slMatch[1]) : 20,
            adaptiveTP: tpMatch ? parseFloat(tpMatch[1]) : 60,
            atrPips: atrMatch ? parseFloat(atrMatch[1]) : 0,
            avgAtrPips: avgMatch ? parseFloat(avgMatch[1]) : 0,
            breathRatio: brMatch ? parseFloat(brMatch[1]) : 1,
            wallInfo: wallMatch || null,
          };
        }
        setNexusData(nexusMap);

        // Parse ADI from logs
        const adiLine = data.log.find(l => l.includes('ADI:'));
        if (adiLine) {
          const adiMatch = adiLine.match(/ADI=(-?\d+\.?\d*)/);
          const confMatch = adiLine.match(/confirmed=(\d+)\/(\d+)/);
          const huntMatch = adiLine.includes('hunt=true');
          setAdiState({
            dollarStrength: adiMatch ? parseFloat(adiMatch[1]) / 100 : 0,
            confirmedCrosses: confMatch ? parseInt(confMatch[1]) : 0,
            totalCrosses: confMatch ? parseInt(confMatch[2]) : 0,
            isRetailHunt: huntMatch,
          });
        }
      }

      // Parse the full Neuro-Matrix state for Cortex visualization
      // Need current pricing to calculate live P&L
      const currentPricing = { ...pricing };
      // Re-fetch trades to get latest
      const { data: freshTrades } = await supabase
        .from('oanda_orders')
        .select('currency_pair, direction, entry_price, status')
        .eq('agent_id', 'nyc-love')
        .in('status', ['filled', 'open', 'submitted'])
        .eq('environment', 'practice');
      const trades = (freshTrades || []).map(d => ({
        instrument: d.currency_pair,
        direction: d.direction,
        entry_price: d.entry_price || 0,
        status: d.status,
      }));
      setActiveTrades(trades);

      const neuro = parseNeuroMatrixState(data, currentPricing, trades);
      setNeuroState(neuro);

      if (data.reason === 'session_gate') {
        setLogs(prev => [...prev, `[${ts}] ⏳ Session gate: ${data.detail}`]);
      }
    } catch (e) {
      setLogs(prev => [...prev, `[${ts}] ❌ Nexus error: ${(e as Error).message}`]);
    } finally {
      setLoading(false);
    }
  }, [supabaseUrl, apiKey, pricing]);

  // Data refresh loops
  useEffect(() => {
    fetchPricing();
    fetchRankings();
    fetchActiveTrades();
    fetchAdiCache();
    fetchOrderBooks();
    const iv = setInterval(() => {
      fetchPricing();
      fetchRankings();
      fetchActiveTrades();
      fetchAdiCache();
      fetchOrderBooks();
    }, 15_000);
    return () => clearInterval(iv);
  }, [fetchPricing, fetchRankings, fetchActiveTrades, fetchAdiCache, fetchOrderBooks]);

  // Auto-mode
  useEffect(() => {
    if (!autoMode) return;
    runAgent();
    const iv = setInterval(runAgent, 5 * 60_000);
    return () => clearInterval(iv);
  }, [autoMode, runAgent]);

  // Update neuro state when pricing changes (live P&L)
  useEffect(() => {
    if (!neuroState || !agentResult) return;
    const updated = parseNeuroMatrixState(agentResult, pricing, activeTrades);
    setNeuroState(updated);
  }, [pricing, activeTrades]);

  return (
    <div className="min-h-screen cyber-grid-bg font-mono" style={{ color: 'hsl(var(--nexus-text-primary))' }}>
      {/* ═══ HEADER ═══ */}
      <div className="sticky top-0 z-50 px-5 py-3 flex justify-between items-center backdrop-blur-md"
        style={{ background: 'hsl(var(--nexus-bg) / 0.9)', borderBottom: '1px solid hsl(var(--nexus-border))' }}>
        <div className="flex items-center gap-3">
          <Link to="/citadel" className="transition-colors hover:opacity-80" style={{ color: 'hsl(var(--nexus-neon-cyan))' }}>
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-base font-bold tracking-tight" style={{ color: 'hsl(var(--nexus-neon-cyan))' }}>
            NYC LOVE <span style={{ color: 'hsl(var(--nexus-text-muted))' }}>//</span> NEURO-MATRIX
          </h1>
          <span className="text-[9px] px-2 py-0.5 rounded" style={{
            color: 'hsl(var(--nexus-neon-green))',
            background: 'hsl(var(--nexus-neon-green) / 0.1)',
            border: '1px solid hsl(var(--nexus-neon-green) / 0.2)',
          }}>v3.0</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] px-2 py-1 rounded" style={{
            background: 'hsl(var(--nexus-surface))',
            border: '1px solid hsl(var(--nexus-border))',
            color: Object.keys(pricing).length > 0 ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-text-muted))',
          }}>
            OANDA: {Object.keys(pricing).length > 0 ? 'LIVE' : '—'}
          </span>
          {neuroState && (
            <span className="text-[9px] px-2 py-1 rounded" style={{
              background: neuroState.painWeight < 0.85 ? 'hsl(var(--nexus-danger) / 0.1)' : 'hsl(var(--nexus-surface))',
              border: `1px solid ${neuroState.painWeight < 0.85 ? 'hsl(var(--nexus-danger) / 0.3)' : 'hsl(var(--nexus-border))'}`,
              color: neuroState.painWeight < 0.85 ? 'hsl(var(--nexus-danger))' : 'hsl(var(--nexus-text-muted))',
            }}>
              PAIN: {(neuroState.painWeight * 100).toFixed(0)}%
          </span>
          )}
          <span className="text-[9px]" style={{ color: 'hsl(var(--nexus-text-muted))' }}>
            cycles: {cycleCount}
          </span>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* ═══ SESSION CLOCK + CONTROLS ═══ */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex-1 max-w-md p-3 rounded-lg" style={{ background: 'hsl(var(--nexus-surface))', border: '1px solid hsl(var(--nexus-border))' }}>
            <SessionClock />
          </div>
          <div className="flex gap-2">
            <button
              onClick={runAgent}
              disabled={loading}
              className="text-xs px-5 py-2.5 rounded font-bold tracking-wider transition-all nexus-glow-cyan"
              style={{
                background: loading ? 'hsl(var(--nexus-surface))' : 'hsl(var(--nexus-neon-cyan) / 0.15)',
                border: '1px solid hsl(var(--nexus-neon-cyan) / 0.4)',
                color: loading ? 'hsl(var(--nexus-text-muted))' : 'hsl(var(--nexus-neon-cyan))',
              }}
            >
              <Zap size={12} className="inline mr-1" />
              {loading ? 'SCANNING...' : 'INVOKE NEXUS'}
            </button>
            <button
              onClick={() => setAutoMode(!autoMode)}
              className="text-xs px-4 py-2.5 rounded font-bold tracking-wider transition-all"
              style={{
                background: autoMode ? 'hsl(var(--nexus-neon-green) / 0.1)' : 'hsl(var(--nexus-surface))',
                border: `1px solid ${autoMode ? 'hsl(var(--nexus-neon-green) / 0.4)' : 'hsl(var(--nexus-border))'}`,
                color: autoMode ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-text-muted))',
              }}
            >
              <Radio size={12} className="inline mr-1" />
              {autoMode ? 'AUTO: ON' : 'AUTO: OFF'}
            </button>
          </div>
        </div>

        {/* ═══ NEURO-MATRIX CORTEX (Everything the tentacles see) ═══ */}
        {neuroState && <NeuroMatrixCortex state={neuroState} />}

        {/* ═══ TOP ROW: ADI Hub + Sovereign Matrix + Spread/Liquidity ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          <div className="md:col-span-4 p-4 rounded-lg" style={{ background: 'hsl(var(--nexus-surface))', border: '1px solid hsl(var(--nexus-border))' }}>
            <ADIRadarHub {...adiState} />
          </div>

          <div className="md:col-span-4 p-4 rounded-lg" style={{ background: 'hsl(var(--nexus-surface))', border: '1px solid hsl(var(--nexus-border))' }}>
            <SovereignLeaderboard rankings={rankings.length > 0 ? rankings : [
              { currency: 'USD', rank: 1 }, { currency: 'EUR', rank: 2 },
              { currency: 'GBP', rank: 3 }, { currency: 'CHF', rank: 4 },
              { currency: 'JPY', rank: 5 }, { currency: 'CAD', rank: 6 },
              { currency: 'AUD', rank: 7 }, { currency: 'NZD', rank: 8 },
            ]} />
          </div>

          <div className="md:col-span-4 space-y-4">
            <div className="p-4 rounded-lg" style={{ background: 'hsl(var(--nexus-surface))', border: '1px solid hsl(var(--nexus-border))' }}>
              <div className="text-[10px] font-bold tracking-[0.2em] mb-3" style={{ color: 'hsl(var(--nexus-neon-cyan))' }}>
                SPREAD SHIELD
              </div>
              <div className="space-y-2">
                {INSTRUMENTS.map(inst => {
                  const p = pricing[inst];
                  const spread = p?.spread || 0;
                  const ok = spread <= 3.0;
                  return (
                    <div key={inst} className="flex justify-between items-center text-xs">
                      <span style={{ color: 'hsl(var(--nexus-text-primary))' }}>{inst.replace('_', '/')}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: ok ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-danger))' }} />
                        <span className="font-bold" style={{ color: ok ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-danger))' }}>
                          {spread.toFixed(1)}p
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-[8px] mt-2 pt-2" style={{ borderTop: '1px solid hsl(var(--nexus-border))', color: 'hsl(var(--nexus-text-muted))' }}>
                HARD CAP: MAX 20% OF ADAPTIVE SL
              </div>
            </div>

            <div className="p-4 rounded-lg" style={{ background: 'hsl(var(--nexus-surface))', border: '1px solid hsl(var(--nexus-border))' }}>
              <div className="text-[10px] font-bold tracking-[0.2em] mb-2" style={{ color: 'hsl(var(--nexus-neon-cyan))' }}>
                LIQUIDITY HEATMAP
              </div>
              {INSTRUMENTS.map(inst => {
                const ob = orderBooks[inst];
                const p = pricing[inst];
                return (
                  <div key={inst} className="mb-2">
                    <div className="text-[8px] mb-1" style={{ color: 'hsl(var(--nexus-text-muted))' }}>{inst.replace('_', '/')}</div>
                    <LiquidityHeatmap instrument={inst} buckets={ob?.buckets || []} currentPrice={p?.mid || 0} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ═══ PRESSURE CARDS ═══ */}
        <div>
          <div className="text-[10px] font-bold tracking-[0.2em] mb-3" style={{ color: 'hsl(var(--nexus-neon-green))' }}>
            NEXUS STRIKE INDICATORS
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {INSTRUMENTS.map(inst => {
              const p = pricing[inst];
              const nd = nexusData[inst];
              const ob = orderBooks[inst];
              const trade = activeTrades.find(t => t.instrument === inst);

              return (
                <NexusPressureCard
                  key={inst}
                  instrument={inst}
                  mid={p?.mid || 0}
                  spread={p?.spread || 0}
                  nexusProbability={nd?.probability || 0}
                  direction={nd?.direction || null}
                  obiLongPct={ob?.longPct || 50}
                  obiShortPct={ob?.shortPct || 50}
                  wallInfo={nd?.wallInfo || null}
                  adaptiveSL={nd?.adaptiveSL || 20}
                  adaptiveTP={nd?.adaptiveTP || 60}
                  atrPips={nd?.atrPips || 0}
                  avgAtrPips={nd?.avgAtrPips || 0}
                  breathRatio={nd?.breathRatio || 1}
                  spreadOk={(p?.spread || 0) <= 3.0}
                  tradeActive={!!trade}
                  tradeDirection={trade?.direction}
                  tradeEntry={trade?.entry_price}
                />
              );
            })}
          </div>
        </div>

        {/* ═══ TENTACLE LOG ═══ */}
        <TentacleLog
          logs={logs}
          onClear={() => setLogs(['[SYSTEM] Tentacle log cleared'])}
        />
      </div>
    </div>
  );
};

export default NYCLoveDashboard;
