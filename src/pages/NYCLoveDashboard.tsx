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

const INSTRUMENTS = ['EUR_USD', 'GBP_USD', 'USD_JPY'];
const USD_CROSSES = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'USD_CHF', 'USD_CAD', 'AUD_USD', 'NZD_USD'];

interface AgentResult {
  success: boolean;
  reason?: string;
  detail?: string;
  engine?: string;
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

const NYCLoveDashboard = () => {
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null);
  const [pricing, setPricing] = useState<Record<string, PricingData>>({});
  const [rankings, setRankings] = useState<CurrencyRank[]>([]);
  const [orderBooks, setOrderBooks] = useState<Record<string, OrderBookData>>({});
  const [activeTrades, setActiveTrades] = useState<ActiveTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);
  const [logs, setLogs] = useState<string[]>([
    '[SYSTEM] Sovereign Neural Nexus v2.0 initialized',
    '[SYSTEM] Pillars: ADI Truth Filter | Neural Volatility Buffer | OBI Sniffer',
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
      // Try the dedicated ADI cache first
      const { data: adiCache } = await supabase
        .from('sovereign_memory')
        .select('payload, updated_at')
        .eq('memory_type', 'adi_cache')
        .eq('memory_key', 'live_adi_state')
        .single();

      if (adiCache?.payload) {
        const cached = adiCache.payload as { pricing?: Record<string, any> };
        const prices = cached.pricing || {};
        // Calculate ADI from cached pricing
        const usdCrosses = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'USD_CHF', 'USD_CAD', 'AUD_USD', 'NZD_USD'];
        let bullCount = 0, bearCount = 0, total = 0;
        for (const cross of usdCrosses) {
          const p = prices[cross];
          if (!p) continue;
          total++;
          // Simple: if spread is tight, market is active for this cross
          const isUsdBase = cross.startsWith('USD_');
          // Use mid price direction as a simple indicator
          if (p.mid) {
            bullCount++; // We have data = confirmed cross
          }
        }
        if (total > 0) {
          setAdiState(prev => ({
            ...prev,
            confirmedCrosses: total,
            totalCrosses: 7,
          }));
        }
        return;
      }

      // Fallback: compute from live sovereign strength data
      const { data: strengthData } = await supabase
        .from('sovereign_memory')
        .select('payload')
        .eq('memory_key', 'live_strength_index')
        .eq('memory_type', 'currency_strength')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (strengthData?.payload) {
        const payload = strengthData.payload as { strengths?: { currency: string; rank: number; score?: number }[] };
        if (payload.strengths) {
          const usd = payload.strengths.find(s => s.currency === 'USD');
          if (usd) {
            // Derive dollar strength from rank: rank 1 = +1.0, rank 8 = -1.0
            const normalized = 1 - ((usd.rank - 1) / 7) * 2; // rank 1→+1, rank 4.5→0, rank 8→-1
            const totalCurrencies = payload.strengths.length;
            // Count how many currencies are weaker than USD (higher rank = weaker)
            const weakerCount = payload.strengths.filter(s => s.rank > usd.rank).length;
            setAdiState({
              dollarStrength: Math.round(normalized * 100) / 100,
              confirmedCrosses: weakerCount,
              totalCrosses: totalCurrencies - 1,
              isRetailHunt: false,
            });
          }
        }
      }
    } catch { /* empty */ }
  }, []);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  // Fetch pricing
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

  // Fetch sovereign rankings
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
        if (payload.strengths) {
          setRankings(payload.strengths);
        }
      }
    } catch { /* empty */ }
  }, []);

  // Fetch order book / liquidity heatmap data
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
          mapped[row.currency_pair] = {
            price: row.current_price || 0,
            longPct: 0,
            shortPct: 0,
            buckets,
          };
        }
        setOrderBooks(mapped);
      }
    } catch { /* empty */ }
  }, []);

  // Fetch active trades
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

  // Invoke agent
  const runAgent = useCallback(async () => {
    setLoading(true);
    const ts = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${ts}] 🚀 Invoking Sovereign Neural Nexus...`]);

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

        // Parse nexus data from logs
        const nexusMap: Record<string, typeof nexusData[string]> = {};
        for (const inst of INSTRUMENTS) {
          const tag = `[${inst}]`;
          const nexusLine = data.log.find(l => l.includes(tag) && l.includes('NEXUS:'));
          const breathLine = data.log.find(l => l.includes(tag) && l.includes('BREATH:'));
          const obiLine = data.log.find(l => l.includes(tag) && l.includes('OBI:'));
          const sovLine = data.log.find(l => l.includes(tag) && l.includes('SOVEREIGN:'));

          // Parse probability from nexus line
          const pMatch = nexusLine?.match(/P=(\d+\.?\d*)%/);
          const probability = pMatch ? parseFloat(pMatch[1]) / 100 : 0;

          // Parse direction from sovereign line
          let direction: 'BUY' | 'SELL' | null = null;
          if (sovLine?.includes('→ BUY')) direction = 'BUY';
          else if (sovLine?.includes('→ SELL')) direction = 'SELL';

          // Parse breath data
          const slMatch = breathLine?.match(/SL=(\d+\.?\d*)/);
          const tpMatch = breathLine?.match(/TP=(\d+\.?\d*)/);
          const atrMatch = breathLine?.match(/ATR=(\d+\.?\d*)/);
          const avgMatch = breathLine?.match(/avg=(\d+\.?\d*)/);
          const brMatch = breathLine?.match(/breath=(\d+\.?\d*)/);

          // Parse wall info
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

      if (data.reason === 'session_gate') {
        setLogs(prev => [...prev, `[${ts}] ⏳ Session gate: ${data.detail}`]);
      }

      // Refresh active trades after agent run
      fetchActiveTrades();
    } catch (e) {
      setLogs(prev => [...prev, `[${ts}] ❌ Nexus error: ${(e as Error).message}`]);
    } finally {
      setLoading(false);
    }
  }, [supabaseUrl, apiKey, fetchActiveTrades]);

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
            NYC LOVE <span style={{ color: 'hsl(var(--nexus-text-muted))' }}>//</span> SOVEREIGN NEURAL NEXUS
          </h1>
          <span className="text-[9px] px-2 py-0.5 rounded" style={{
            color: 'hsl(var(--nexus-neon-green))',
            background: 'hsl(var(--nexus-neon-green) / 0.1)',
            border: '1px solid hsl(var(--nexus-neon-green) / 0.2)',
          }}>v2.0</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] px-2 py-1 rounded" style={{
            background: 'hsl(var(--nexus-surface))',
            border: '1px solid hsl(var(--nexus-border))',
            color: Object.keys(pricing).length > 0 ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-text-muted))',
          }}>
            OANDA: {Object.keys(pricing).length > 0 ? 'LIVE' : '—'}
          </span>
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

        {/* ═══ TOP ROW: ADI Hub + Sovereign Matrix + Spread Shield ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* ADI Radar Hub */}
          <div className="md:col-span-4 p-4 rounded-lg" style={{ background: 'hsl(var(--nexus-surface))', border: '1px solid hsl(var(--nexus-border))' }}>
            <ADIRadarHub {...adiState} />
          </div>

          {/* Sovereign Leaderboard */}
          <div className="md:col-span-4 p-4 rounded-lg" style={{ background: 'hsl(var(--nexus-surface))', border: '1px solid hsl(var(--nexus-border))' }}>
            <SovereignLeaderboard rankings={rankings.length > 0 ? rankings : [
              { currency: 'USD', rank: 1 }, { currency: 'EUR', rank: 2 },
              { currency: 'GBP', rank: 3 }, { currency: 'CHF', rank: 4 },
              { currency: 'JPY', rank: 5 }, { currency: 'CAD', rank: 6 },
              { currency: 'AUD', rank: 7 }, { currency: 'NZD', rank: 8 },
            ]} />
          </div>

          {/* Spread Shield + Liquidity */}
          <div className="md:col-span-4 space-y-4">
            {/* Spread Shield */}
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

            {/* Global Liquidity Mini */}
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
                    <LiquidityHeatmap
                      instrument={inst}
                      buckets={ob?.buckets || []}
                      currentPrice={p?.mid || 0}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ═══ PRESSURE CARDS (NEXUS STRIKE INDICATORS) ═══ */}
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
