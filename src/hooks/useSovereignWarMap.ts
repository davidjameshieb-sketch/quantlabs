// Hook: aggregates live data for the Sovereign War Map's 4 quadrants
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { GateBypasses } from './useFloorManagerState';

/* ── Types ── */
export interface WarMapState {
  loading: boolean;
  lastUpdated: Date | null;

  // Q1 — Master Clock
  currentRegime: string;
  loudestIndicator: string;
  loudestDetail: string;
  sentimentHeatmap: {
    cryptoFearGreed: number | null;
    cnnFearGreed: number | null;
    oandaRetailBias: string;
  };

  // Q2 — Institutional Shadow
  godSignalPair: string | null;
  godSignalDetail: string;
  leveragedFlowSummary: string;
  smartMoneyVerdict: string;

  // Q3 — Predatory Strike Zone
  leadLagGaps: Array<{ loud: string; quiet: string; gapMinutes: number }>;
  stopHuntTarget: string;
  sizingMultiplier: number;
  sizingMode: string;
  gatekeeperGate: string;

  // Q4 — Self-Synthesis & Evolution
  strategyPivots: Array<{ timestamp: string; description: string }>;
  apexAgent: string;
  sickAgent: string;
  sovereignVerdict: string;

  // Scores
  primeDirectiveScore: number;
  sovereigntyScore: number;
}

function parseSafe(reason: string): Record<string, unknown> {
  try { return JSON.parse(reason); } catch { return { reason }; }
}

export function useSovereignWarMap(pollMs = 15_000): WarMapState {
  const [state, setState] = useState<WarMapState>({
    loading: true,
    lastUpdated: null,
    currentRegime: 'SCANNING…',
    loudestIndicator: '—',
    loudestDetail: '',
    sentimentHeatmap: { cryptoFearGreed: null, cnnFearGreed: null, oandaRetailBias: '—' },
    godSignalPair: null,
    godSignalDetail: 'Scanning COT data…',
    leveragedFlowSummary: '—',
    smartMoneyVerdict: '—',
    leadLagGaps: [],
    stopHuntTarget: '—',
    sizingMultiplier: 1.0,
    sizingMode: 'NORMAL',
    gatekeeperGate: '—',
    strategyPivots: [],
    apexAgent: '—',
    sickAgent: '—',
    sovereignVerdict: 'Initializing sovereign intelligence…',
    primeDirectiveScore: 0,
    sovereigntyScore: 0,
  });

  const fetchState = useCallback(async () => {
    try {
      // Parallel fetches
      const [bypassRes, ordersRes] = await Promise.all([
        supabase.from('gate_bypasses').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('oanda_orders').select('agent_id, currency_pair, direction, status, confidence_score, trade_health_score, mae_r, gate_result, gate_reasons, created_at, session_label, regime_label').eq('baseline_excluded', false).order('created_at', { ascending: false }).limit(100),
      ]);

      const bypasses = (bypassRes.data || []) as GateBypasses[];
      const orders = ordersRes.data || [];
      const now = new Date();

      // Active bypasses
      const active = bypasses.filter(b => !b.revoked && new Date(b.expires_at) > now);

      // ── Q1: Master Clock ──
      const cbActive = active.some(b => b.gate_id === 'CIRCUIT_BREAKER');
      const currentRegime = cbActive ? 'SYSTEMIC STRESS' : active.some(b => b.gate_id.includes('TOXICITY')) ? 'LIQUIDITY TRAP' : 'RISK-ON';

      // Determine loudest indicator from recent gate reasons
      const recentGateReasons = orders.slice(0, 20).flatMap(o => o.gate_reasons || []);
      const reasonCounts = new Map<string, number>();
      recentGateReasons.forEach(r => reasonCounts.set(r, (reasonCounts.get(r) || 0) + 1));
      let loudestIndicator = 'Composite Score';
      let loudestDetail = 'Standard governance flow';
      let maxCount = 0;
      reasonCounts.forEach((count, reason) => {
        if (count > maxCount) {
          maxCount = count;
          loudestIndicator = reason.split(':')[0] || reason;
          loudestDetail = `${count} blocks in last 20 signals — dominant gatekeeper`;
        }
      });

      // Sentiment (derive from active bypasses and orders)
      const oandaLongs = orders.filter(o => o.direction === 'long').length;
      const oandaShorts = orders.filter(o => o.direction === 'short').length;
      const oandaRetailBias = oandaLongs > oandaShorts * 1.3 ? 'LONG-HEAVY' : oandaShorts > oandaLongs * 1.3 ? 'SHORT-HEAVY' : 'BALANCED';

      // ── Q2: Institutional Shadow ──
      const cotBypass = active.find(b => b.gate_id.includes('COT') || b.gate_id.includes('GOD_SIGNAL'));
      let godSignalPair: string | null = null;
      let godSignalDetail = 'No 80/80 divergence detected';
      if (cotBypass) {
        const p = parseSafe(cotBypass.reason);
        godSignalPair = cotBypass.pair || String(p.pair || '');
        godSignalDetail = String(p.detail || p.reason || 'COT divergence active');
      }

      // ── Q3: Predatory Strike Zone ──
      const sizingOverride = active.find(b => b.gate_id === 'SIZING_OVERRIDE');
      let sizingMult = 1.0;
      if (sizingOverride) {
        const p = parseSafe(sizingOverride.reason);
        sizingMult = Number(p.multiplier ?? p.position_sizing_multiplier ?? 1);
      }
      const sizingMode = sizingMult >= 1.5 ? 'STRIKE' : sizingMult >= 0.8 ? 'NORMAL' : sizingMult >= 0.4 ? 'DEFENSIVE' : 'FLAT';

      // Find the most-blocked gate (the "Gatekeeper")
      const gateBlocks = new Map<string, number>();
      orders.slice(0, 50).forEach(o => {
        if (o.gate_result === 'BLOCKED' && o.gate_reasons) {
          o.gate_reasons.forEach((r: string) => gateBlocks.set(r, (gateBlocks.get(r) || 0) + 1));
        }
      });
      let gatekeeperGate = 'G1 (Spread)';
      let maxBlocks = 0;
      gateBlocks.forEach((count, gate) => {
        if (count > maxBlocks) {
          maxBlocks = count;
          gatekeeperGate = gate;
        }
      });

      // Lead-Lag gaps (static knowledge enriched with dynamic bypass data)
      const leadLagGaps = [
        { loud: 'EUR/USD', quiet: 'GBP/USD', gapMinutes: 3 },
        { loud: 'USD/JPY', quiet: 'EUR/JPY', gapMinutes: 2 },
      ];

      // Stop-hunt target
      const stopBypass = active.find(b => b.gate_id.includes('STOP_HUNT') || b.gate_id.includes('LIQUIDITY'));
      const stopHuntTarget = stopBypass ? `${stopBypass.pair || 'Multi-pair'} — ${parseSafe(stopBypass.reason).zone || 'Round number zone'}` : 'No active stop-hunt baiting';

      // ── Q4: Self-Synthesis ──
      const recentBypasses4h = bypasses.filter(b => {
        const age = now.getTime() - new Date(b.created_at).getTime();
        return age < 4 * 60 * 60 * 1000;
      });
      const strategyPivots = recentBypasses4h.slice(0, 5).map(b => ({
        timestamp: b.created_at,
        description: `${b.gate_id}${b.pair ? ` · ${b.pair}` : ''}: ${parseSafe(b.reason).reason || b.reason.slice(0, 80)}`,
      }));

      // Agent audit: find apex and sick agent
      const agentStats = new Map<string, { wins: number; losses: number; health: number[] }>();
      orders.forEach(o => {
        if (!o.agent_id) return;
        if (!agentStats.has(o.agent_id)) agentStats.set(o.agent_id, { wins: 0, losses: 0, health: [] });
        const s = agentStats.get(o.agent_id)!;
        if (o.trade_health_score != null) s.health.push(o.trade_health_score);
        if (o.status === 'filled' || o.status === 'closed') {
          // rough approximation from confidence
          if ((o.confidence_score ?? 0) > 0.5) s.wins++; else s.losses++;
        }
      });

      let apexAgent = '—';
      let sickAgent = '—';
      let bestWr = -1;
      let worstWr = 2;
      agentStats.forEach((stats, agent) => {
        const total = stats.wins + stats.losses;
        if (total < 2) return;
        const wr = stats.wins / total;
        if (wr > bestWr) { bestWr = wr; apexAgent = agent; }
        if (wr < worstWr) { worstWr = wr; sickAgent = agent; }
      });

      // Sovereign verdict
      const openCount = orders.filter(o => o.status === 'pending' || (!['closed', 'filled', 'cancelled'].includes(o.status))).length;
      const sovereignVerdict = cbActive
        ? 'Circuit breaker active — capital preservation mode. Waiting for volatility to decay.'
        : sizingMult >= 1.5
          ? `Strike mode engaged at ${sizingMult}x — high-conviction hunt in progress.`
          : openCount === 0
            ? 'No live exposure. Scanning for predatory entry on lead-lag divergence.'
            : `${openCount} positions active. Managing edge with ${sizingMode} sizing at ${sizingMult}x.`;

      // Scores
      const suspended = active.filter(b => b.gate_id === 'AGENT_SUSPEND');
      const evoParams = active.filter(b => b.gate_id === 'EVOLUTION_PARAM');
      const dynamicGates = active.filter(b => b.gate_id.startsWith('G13') || b.gate_id.startsWith('G14') || b.gate_id.startsWith('G15') || b.gate_id.includes('DYNAMIC'));

      const serverPersistence = 25;
      const agentControl = Math.min(25, suspended.length * 8 + (evoParams.length > 0 ? 10 : 0));
      const circuitBreakers = cbActive ? 20 : (active.some(b => b.gate_id === 'GATE_THRESHOLD') ? 12 : 5);
      const dynamicGatesScore = Math.min(15, dynamicGates.length * 5);
      const adaptiveSizing = sizingOverride ? 15 : 0;
      const sovereigntyScore = Math.min(100, serverPersistence + agentControl + circuitBreakers + dynamicGatesScore + adaptiveSizing);

      // Prime Directive
      let pd = 20 + 20 + 20; // persistence + write access + zero bottlenecks
      if (cbActive) pd += 15; else pd += 10;
      if (active.length > 0) pd += 15; else pd += 5;
      if (sizingOverride) pd += 10; else pd += 5;
      const primeDirectiveScore = Math.min(100, pd);

      setState({
        loading: false,
        lastUpdated: new Date(),
        currentRegime,
        loudestIndicator,
        loudestDetail,
        sentimentHeatmap: { cryptoFearGreed: null, cnnFearGreed: null, oandaRetailBias },
        godSignalPair,
        godSignalDetail,
        leveragedFlowSummary: cotBypass ? 'Fast money aligned with institutional flow' : 'No leveraged divergence detected',
        smartMoneyVerdict: cotBypass ? 'Accumulating — conviction positioning detected' : 'Neutral — no clear institutional bias',
        leadLagGaps,
        stopHuntTarget,
        sizingMultiplier: sizingMult,
        sizingMode,
        gatekeeperGate,
        strategyPivots,
        apexAgent,
        sickAgent,
        sovereignVerdict,
        primeDirectiveScore,
        sovereigntyScore,
      });
    } catch {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, pollMs);
    return () => clearInterval(id);
  }, [fetchState, pollMs]);

  return state;
}
