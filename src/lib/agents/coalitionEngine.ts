// Coalition Performance Engine
// Measures which agent combinations (coalitions) increase profitability + reduce drawdown.
// Groups by envKey, symbol, session, regime. Computes lift vs pair/solo baselines.
// Analysis-only — does NOT modify governance, direction, or safety logic.

import {
  buildEnvironmentFeatures,
  buildEnvironmentKey,
  normalizeSession,
  normalizeRegime,
  normalizeDirection,
  normalizeSymbol,
  isAdaptiveEdgeActive,
  type EnvironmentKey,
} from '@/lib/forex/environmentSignature';

// ─── Types ────────────────────────────────────────────────────────────

export type CoalitionLabel = 'BOOST' | 'RISKY' | 'HARMFUL' | 'INSUFFICIENT_DATA';
export type LearnMode = 'live' | 'backtest';

export interface CoalitionTradeRecord {
  agent_id: string;
  direction: string;
  currency_pair: string;
  entry_price: number;
  exit_price: number;
  session_label: string | null;
  regime_label: string | null;
  spread_at_entry: number | null;
  environment: string;
  created_at: string;
}

export interface CoalitionMetrics {
  trades: number;
  winRate: number;
  expectancy: number;       // friction-adjusted (spread deducted)
  profitFactor: number;
  sharpe: number;
  maxDD: number;
  ddSlope: number;
  stabilityScore: number;   // inverse variance of expectancy across time buckets
  coveragePct: number;      // % of total trades in grouping
  sampleConfident: boolean; // meets minimum threshold
}

export interface CoalitionLift {
  deltaExpectancy: number;
  deltaPF: number;
  deltaSharpe: number;
  deltaMaxDD: number;
  deltaStability: number;
}

export interface CoalitionEntry {
  coalitionKey: string;       // canonical sorted: "agentA|agentB"
  agents: string[];
  size: number;
  label: CoalitionLabel;
  metrics: CoalitionMetrics;
  liftVsBaseline: CoalitionLift;
  liftVsSolo: CoalitionLift | null;  // vs best solo agent in coalition
  envKey: string;                     // grouping key (or 'global')
  symbol: string;
  session: string;
  regime: string;
  provenStatus: 'PROVEN' | 'CANDIDATE' | 'INSUFFICIENT';
}

export interface CoalitionRecommendation {
  action: 'DEPLOY' | 'SHADOW' | 'AVOID';
  coalitionKey: string;
  agents: string[];
  symbol: string;
  suggestedMultiplierBand: [number, number];
  reasoning: string;
  metrics: CoalitionMetrics;
}

export interface CoalitionAnalysisResult {
  coalitions: CoalitionEntry[];
  recommendations: CoalitionRecommendation[];
  globalRollup: CoalitionEntry[];
  bySymbol: Record<string, CoalitionEntry[]>;
  bySession: Record<string, CoalitionEntry[]>;
  byRegime: Record<string, CoalitionEntry[]>;
  totalTrades: number;
  learnMode: LearnMode;
}

// ─── Constants ────────────────────────────────────────────────────────

const PAIRING_WINDOW_MS = 20 * 60 * 1000; // 20 minutes
const MAX_COALITION_SIZE = 4;
const MIN_SAMPLE_SYMBOL = 60;
const MIN_SAMPLE_ENVKEY = 20;
const PROVEN_SAMPLE = 120;
const STABILITY_BUCKETS = 5; // split trades into N time buckets for variance

// ─── Coalition Key Builder ───────────────────────────────────────────

export function buildCoalitionKey(agents: string[]): string {
  const unique = [...new Set(agents)].sort();
  return unique.join('|');
}

export function parseCoalitionKey(key: string): string[] {
  return key.split('|');
}

// ─── PnL Calculator (friction-adjusted) ──────────────────────────────

function calcFrictionAdjustedPips(trade: CoalitionTradeRecord): number {
  const isJpy = trade.currency_pair.includes('JPY');
  const mult = isJpy ? 100 : 10000;
  const rawPips = trade.direction === 'long'
    ? (trade.exit_price - trade.entry_price) * mult
    : (trade.entry_price - trade.exit_price) * mult;

  // FIX: spread_at_entry is stored in price units (e.g., 0.00008), convert to pips
  const spreadPrice = trade.spread_at_entry ?? 0;
  const spreadPips = spreadPrice * mult; // Convert price-unit spread to pip-unit spread
  return rawPips - spreadPips;
}

// ─── Metrics Calculator ──────────────────────────────────────────────

function computeCoalitionMetrics(
  trades: CoalitionTradeRecord[],
  totalInGrouping: number
): CoalitionMetrics {
  if (trades.length === 0) {
    return { trades: 0, winRate: 0, expectancy: 0, profitFactor: 0, sharpe: 0, maxDD: 0, ddSlope: 0, stabilityScore: 0, coveragePct: 0, sampleConfident: false };
  }

  const pips = trades.map(calcFrictionAdjustedPips);
  const wins = pips.filter(p => p > 0).length;
  const grossProfit = pips.filter(p => p > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(pips.filter(p => p <= 0).reduce((a, b) => a + b, 0));
  const netPips = pips.reduce((a, b) => a + b, 0);
  const expectancy = netPips / trades.length;
  const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;

  // Sharpe
  const variance = pips.reduce((a, p) => a + (p - expectancy) ** 2, 0) / (pips.length - 1 || 1);
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (expectancy / std) * Math.sqrt(252) : 0;

  // Max DD + slope
  let peak = 0, maxDD = 0, cumPnl = 0;
  const ddPoints: number[] = [];
  for (const p of pips) {
    cumPnl += p;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak - cumPnl;
    if (dd > maxDD) maxDD = dd;
    ddPoints.push(dd);
  }

  let ddSlope = 0;
  const ddWindow = ddPoints.slice(-50);
  if (ddWindow.length >= 10) {
    const n = ddWindow.length;
    const xMean = (n - 1) / 2;
    const yMean = ddWindow.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (ddWindow[i] - yMean);
      den += (i - xMean) ** 2;
    }
    ddSlope = den > 0 ? num / den : 0;
  }

  // Stability: variance of expectancy across time buckets
  let stabilityScore = 0;
  if (trades.length >= STABILITY_BUCKETS * 5) {
    const bucketSize = Math.floor(trades.length / STABILITY_BUCKETS);
    const bucketExpectancies: number[] = [];
    for (let i = 0; i < STABILITY_BUCKETS; i++) {
      const start = i * bucketSize;
      const end = i === STABILITY_BUCKETS - 1 ? trades.length : (i + 1) * bucketSize;
      const bucketPips = pips.slice(start, end);
      const bExp = bucketPips.reduce((a, b) => a + b, 0) / bucketPips.length;
      bucketExpectancies.push(bExp);
    }
    const meanBucket = bucketExpectancies.reduce((a, b) => a + b, 0) / bucketExpectancies.length;
    const bucketVar = bucketExpectancies.reduce((a, b) => a + (b - meanBucket) ** 2, 0) / bucketExpectancies.length;
    stabilityScore = bucketVar > 0 ? 1 / (1 + bucketVar) : 1;
  }

  return {
    trades: trades.length,
    winRate: wins / trades.length,
    expectancy,
    profitFactor: pf,
    sharpe,
    maxDD,
    ddSlope,
    stabilityScore,
    coveragePct: totalInGrouping > 0 ? (trades.length / totalInGrouping) * 100 : 0,
    sampleConfident: trades.length >= MIN_SAMPLE_SYMBOL,
  };
}

// ─── Lift Calculation ────────────────────────────────────────────────

function computeLift(coalition: CoalitionMetrics, baseline: CoalitionMetrics): CoalitionLift {
  return {
    deltaExpectancy: coalition.expectancy - baseline.expectancy,
    deltaPF: coalition.profitFactor - baseline.profitFactor,
    deltaSharpe: coalition.sharpe - baseline.sharpe,
    deltaMaxDD: coalition.maxDD - baseline.maxDD,
    deltaStability: coalition.stabilityScore - baseline.stabilityScore,
  };
}

function labelCoalition(lift: CoalitionLift, metrics: CoalitionMetrics, minSample: number): CoalitionLabel {
  if (metrics.trades < minSample) return 'INSUFFICIENT_DATA';
  if (lift.deltaExpectancy > 0 && lift.deltaPF >= 0 && lift.deltaMaxDD <= 0) return 'BOOST';
  if (lift.deltaExpectancy > 0 && lift.deltaMaxDD > 0) return 'RISKY';
  return 'HARMFUL';
}

function getProvenStatus(metrics: CoalitionMetrics): 'PROVEN' | 'CANDIDATE' | 'INSUFFICIENT' {
  if (metrics.trades >= PROVEN_SAMPLE && metrics.stabilityScore >= 0.3) return 'PROVEN';
  if (metrics.trades >= MIN_SAMPLE_ENVKEY) return 'CANDIDATE';
  return 'INSUFFICIENT';
}

// ─── Coalition Discovery (group co-occurring agents) ─────────────────

interface TradeWithTimestamp extends CoalitionTradeRecord {
  _ts: number;
  _pips: number;
}

function discoverCoalitions(trades: CoalitionTradeRecord[]): Map<string, CoalitionTradeRecord[]> {
  // Sort by time
  const sorted: TradeWithTimestamp[] = trades
    .map(t => ({ ...t, _ts: new Date(t.created_at).getTime(), _pips: calcFrictionAdjustedPips(t) }))
    .sort((a, b) => a._ts - b._ts);

  // Group trades into windows by (symbol + session + regime + direction)
  const windowKey = (t: CoalitionTradeRecord) =>
    `${t.currency_pair}|${t.session_label || ''}|${t.regime_label || ''}|${t.direction}`;

  // Find co-occurring agents within pairing window for same context
  const coalitionTrades = new Map<string, CoalitionTradeRecord[]>();

  // Sliding window approach
  for (let i = 0; i < sorted.length; i++) {
    const anchor = sorted[i];
    const wk = windowKey(anchor);
    const windowAgents = new Set<string>();
    windowAgents.add(anchor.agent_id);

    // Collect agents in window
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j]._ts - anchor._ts > PAIRING_WINDOW_MS) break;
      if (windowKey(sorted[j]) === wk) {
        windowAgents.add(sorted[j].agent_id);
      }
    }

    if (windowAgents.size < 2) continue;

    // Generate combinations up to MAX_COALITION_SIZE
    const agents = [...windowAgents].sort();
    const combos = generateCombinations(agents, 2, Math.min(agents.length, MAX_COALITION_SIZE));

    for (const combo of combos) {
      const ck = buildCoalitionKey(combo);
      if (!coalitionTrades.has(ck)) coalitionTrades.set(ck, []);
      // Add the anchor trade (avoid duplicating — use signal uniqueness)
      const existing = coalitionTrades.get(ck)!;
      if (!existing.some(e => e.created_at === anchor.created_at && e.agent_id === anchor.agent_id)) {
        existing.push(anchor);
      }
    }
  }

  return coalitionTrades;
}

function generateCombinations(arr: string[], minSize: number, maxSize: number): string[][] {
  const results: string[][] = [];
  for (let size = minSize; size <= maxSize; size++) {
    combine(arr, size, 0, [], results);
  }
  return results;
}

function combine(arr: string[], size: number, start: number, current: string[], results: string[][]): void {
  if (current.length === size) {
    results.push([...current]);
    return;
  }
  for (let i = start; i < arr.length; i++) {
    current.push(arr[i]);
    combine(arr, size, i + 1, current, results);
    current.pop();
  }
}

// ─── Grouping Helper ─────────────────────────────────────────────────

interface GroupedTrades {
  envKey: string;
  symbol: string;
  session: string;
  regime: string;
  trades: CoalitionTradeRecord[];
}

function groupTradesByContext(trades: CoalitionTradeRecord[]): GroupedTrades[] {
  const groups = new Map<string, GroupedTrades>();

  for (const t of trades) {
    const session = normalizeSession(t.session_label || 'unknown');
    const regime = normalizeRegime(t.regime_label || 'unknown');
    const symbol = normalizeSymbol(t.currency_pair);
    const direction = normalizeDirection(t.direction);

    const features = buildEnvironmentFeatures({
      symbol: t.currency_pair,
      session,
      regime,
      direction,
    });
    const envKey = buildEnvironmentKey(features);

    const gk = `${envKey}::${symbol}::${session}::${regime}`;
    if (!groups.has(gk)) {
      groups.set(gk, { envKey, symbol, session, regime, trades: [] });
    }
    groups.get(gk)!.trades.push(t);
  }

  return [...groups.values()];
}

// ─── Solo Baseline ───────────────────────────────────────────────────

function computeSoloBaseline(
  allTrades: CoalitionTradeRecord[],
  agents: string[],
  symbol: string
): CoalitionMetrics | null {
  // Find best solo agent for this symbol
  let bestMetrics: CoalitionMetrics | null = null;

  for (const agent of agents) {
    const agentTrades = allTrades.filter(t =>
      t.agent_id === agent && normalizeSymbol(t.currency_pair) === symbol
    );
    if (agentTrades.length < 10) continue;
    const m = computeCoalitionMetrics(agentTrades, agentTrades.length);
    if (!bestMetrics || m.expectancy > bestMetrics.expectancy) {
      bestMetrics = m;
    }
  }

  return bestMetrics;
}

// ─── Main Analysis ──────────────────────────────────────────────────

export function analyzeCoalitions(
  trades: CoalitionTradeRecord[],
  learnMode: LearnMode = 'live'
): CoalitionAnalysisResult {
  // Filter by learn mode
  const validEnvs = learnMode === 'live' ? ['live', 'practice', 'backtest'] : ['backtest'];
  const filtered = trades.filter(t =>
    validEnvs.includes(t.environment) &&
    t.session_label && t.regime_label &&
    t.entry_price && t.exit_price &&
    t.agent_id && t.agent_id !== 'manual-test' && t.agent_id !== 'unknown' && t.agent_id !== 'backtest-engine'
  );

  // Discover coalitions
  const coalitionTradeMap = discoverCoalitions(filtered);
  const allCoalitions: CoalitionEntry[] = [];

  // Compute pair baselines (all trades per symbol)
  const symbolBaselines = new Map<string, CoalitionMetrics>();
  const bySymbolTrades = new Map<string, CoalitionTradeRecord[]>();
  for (const t of filtered) {
    const sym = normalizeSymbol(t.currency_pair);
    if (!bySymbolTrades.has(sym)) bySymbolTrades.set(sym, []);
    bySymbolTrades.get(sym)!.push(t);
  }
  for (const [sym, st] of bySymbolTrades) {
    symbolBaselines.set(sym, computeCoalitionMetrics(st, st.length));
  }

  // For each coalition, compute metrics per symbol rollup
  for (const [coalitionKey, cTrades] of coalitionTradeMap) {
    const agents = parseCoalitionKey(coalitionKey);

    // Group by symbol for rollup
    const bySymbol = new Map<string, CoalitionTradeRecord[]>();
    for (const t of cTrades) {
      const sym = normalizeSymbol(t.currency_pair);
      if (!bySymbol.has(sym)) bySymbol.set(sym, []);
      bySymbol.get(sym)!.push(t);
    }

    for (const [symbol, symTrades] of bySymbol) {
      const totalInSymbol = bySymbolTrades.get(symbol)?.length || 1;
      const metrics = computeCoalitionMetrics(symTrades, totalInSymbol);

      // Baselines
      const pairBaseline = symbolBaselines.get(symbol);
      const liftVsBaseline = pairBaseline ? computeLift(metrics, pairBaseline) : {
        deltaExpectancy: 0, deltaPF: 0, deltaSharpe: 0, deltaMaxDD: 0, deltaStability: 0,
      };

      // Solo baseline
      const soloBaseline = computeSoloBaseline(filtered, agents, symbol);
      const liftVsSolo = soloBaseline ? computeLift(metrics, soloBaseline) : null;

      const label = labelCoalition(liftVsBaseline, metrics, MIN_SAMPLE_SYMBOL);

      // Determine dominant session/regime from trades
      const sessionCounts = new Map<string, number>();
      const regimeCounts = new Map<string, number>();
      for (const t of symTrades) {
        const s = normalizeSession(t.session_label || 'unknown');
        const r = normalizeRegime(t.regime_label || 'unknown');
        sessionCounts.set(s, (sessionCounts.get(s) || 0) + 1);
        regimeCounts.set(r, (regimeCounts.get(r) || 0) + 1);
      }
      const topSession = [...sessionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
      const topRegime = [...regimeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

      const features = buildEnvironmentFeatures({
        symbol, session: topSession, regime: topRegime, direction: 'LONG',
      });
      const envKey = buildEnvironmentKey(features);

      allCoalitions.push({
        coalitionKey,
        agents,
        size: agents.length,
        label,
        metrics,
        liftVsBaseline,
        liftVsSolo,
        envKey,
        symbol,
        session: topSession,
        regime: topRegime,
        provenStatus: getProvenStatus(metrics),
      });
    }
  }

  // Sort by ΔExpectancy then PF
  allCoalitions.sort((a, b) =>
    b.liftVsBaseline.deltaExpectancy - a.liftVsBaseline.deltaExpectancy ||
    b.liftVsBaseline.deltaPF - a.liftVsBaseline.deltaPF
  );

  // Rollups
  const bySymbolRollup: Record<string, CoalitionEntry[]> = {};
  const bySessionRollup: Record<string, CoalitionEntry[]> = {};
  const byRegimeRollup: Record<string, CoalitionEntry[]> = {};

  for (const c of allCoalitions) {
    if (!bySymbolRollup[c.symbol]) bySymbolRollup[c.symbol] = [];
    bySymbolRollup[c.symbol].push(c);

    if (!bySessionRollup[c.session]) bySessionRollup[c.session] = [];
    bySessionRollup[c.session].push(c);

    if (!byRegimeRollup[c.regime]) byRegimeRollup[c.regime] = [];
    byRegimeRollup[c.regime].push(c);
  }

  // Generate recommendations
  const recommendations = generateRecommendations(allCoalitions);

  return {
    coalitions: allCoalitions,
    recommendations,
    globalRollup: allCoalitions,
    bySymbol: bySymbolRollup,
    bySession: bySessionRollup,
    byRegime: byRegimeRollup,
    totalTrades: filtered.length,
    learnMode,
  };
}

// ─── Recommendations ─────────────────────────────────────────────────

function generateRecommendations(coalitions: CoalitionEntry[]): CoalitionRecommendation[] {
  const recs: CoalitionRecommendation[] = [];
  const seenKeys = new Set<string>();

  // Deploy: top BOOST + PROVEN coalitions per symbol
  const bySymbol = new Map<string, CoalitionEntry[]>();
  for (const c of coalitions) {
    if (!bySymbol.has(c.symbol)) bySymbol.set(c.symbol, []);
    bySymbol.get(c.symbol)!.push(c);
  }

  for (const [symbol, entries] of bySymbol) {
    // Deploy top 3 BOOST+PROVEN
    const deployable = entries.filter(c => c.label === 'BOOST' && c.provenStatus === 'PROVEN');
    for (const c of deployable.slice(0, 3)) {
      const rk = `${c.coalitionKey}::${symbol}`;
      if (seenKeys.has(rk)) continue;
      seenKeys.add(rk);
      recs.push({
        action: 'DEPLOY',
        coalitionKey: c.coalitionKey,
        agents: c.agents,
        symbol,
        suggestedMultiplierBand: [1.05, 1.15],
        reasoning: `PROVEN BOOST: ΔExp ${c.liftVsBaseline.deltaExpectancy.toFixed(3)}p, ΔPF ${c.liftVsBaseline.deltaPF.toFixed(2)}, ${c.metrics.trades} trades`,
        metrics: c.metrics,
      });
    }

    // Shadow: BOOST + CANDIDATE or INSUFFICIENT
    const shadowable = entries.filter(c =>
      (c.label === 'BOOST' || c.label === 'RISKY') &&
      (c.provenStatus === 'CANDIDATE' || c.provenStatus === 'INSUFFICIENT')
    );
    for (const c of shadowable.slice(0, 3)) {
      const rk = `${c.coalitionKey}::${symbol}`;
      if (seenKeys.has(rk)) continue;
      seenKeys.add(rk);
      recs.push({
        action: 'SHADOW',
        coalitionKey: c.coalitionKey,
        agents: c.agents,
        symbol,
        suggestedMultiplierBand: [0, 0],
        reasoning: `Promising but ${c.provenStatus}: ${c.metrics.trades} trades (need ${PROVEN_SAMPLE} for PROVEN)`,
        metrics: c.metrics,
      });
    }

    // Avoid: HARMFUL with sufficient data
    const harmful = entries.filter(c => c.label === 'HARMFUL' && c.metrics.trades >= MIN_SAMPLE_SYMBOL);
    for (const c of harmful.slice(0, 3)) {
      const rk = `${c.coalitionKey}::${symbol}`;
      if (seenKeys.has(rk)) continue;
      seenKeys.add(rk);
      recs.push({
        action: 'AVOID',
        coalitionKey: c.coalitionKey,
        agents: c.agents,
        symbol,
        suggestedMultiplierBand: [0, 0],
        reasoning: `HARMFUL: ΔExp ${c.liftVsBaseline.deltaExpectancy.toFixed(3)}p, PF ${c.metrics.profitFactor.toFixed(2)}, ${c.metrics.trades} trades`,
        metrics: c.metrics,
      });
    }
  }

  // Sort: DEPLOY first, then SHADOW, then AVOID
  const order: Record<string, number> = { DEPLOY: 0, SHADOW: 1, AVOID: 2 };
  recs.sort((a, b) => order[a.action] - order[b.action]);

  return recs;
}

// ─── Safe Execution Toggle ───────────────────────────────────────────

let _coalitionBoostingEnabled = false;
let _coalitionBoostDisabledUntil: number | null = null;
let _coalitionBoostTradeWindow: number[] = []; // recent expectancies

export function isCoalitionBoostingActive(): boolean {
  if (!_coalitionBoostingEnabled) return false;
  if (!isAdaptiveEdgeActive()) return false;
  if (_coalitionBoostDisabledUntil && Date.now() < _coalitionBoostDisabledUntil) return false;
  return true;
}

export function setCoalitionBoostingEnabled(enabled: boolean): void {
  _coalitionBoostingEnabled = enabled;
  console.log(`[COALITION] Boosting ${enabled ? 'ENABLED' : 'DISABLED'}`);
}

export function getCoalitionBoostingEnabled(): boolean {
  return _coalitionBoostingEnabled;
}

/**
 * Record a coalition-boosted trade outcome for fallback monitoring.
 * If weighted expectancy degrades ≥20% vs baseline over last 100 trades, auto-disable for 24h.
 */
export function recordCoalitionTradeOutcome(
  expectancy: number,
  baselineExpectancy: number
): void {
  _coalitionBoostTradeWindow.push(expectancy);
  if (_coalitionBoostTradeWindow.length > 100) _coalitionBoostTradeWindow.shift();

  if (_coalitionBoostTradeWindow.length >= 100) {
    const avgExp = _coalitionBoostTradeWindow.reduce((a, b) => a + b, 0) / _coalitionBoostTradeWindow.length;
    if (baselineExpectancy > 0 && avgExp < baselineExpectancy * 0.8) {
      _coalitionBoostDisabledUntil = Date.now() + 24 * 60 * 60 * 1000;
      _coalitionBoostingEnabled = false;
      _coalitionBoostTradeWindow = [];
      console.warn(`[COALITION] Auto-disabled for 24h: avgExp ${avgExp.toFixed(3)} < 80% of baseline ${baselineExpectancy.toFixed(3)}`);
    }
  }
}

/**
 * Get the multiplier adjustment for a coalition (SOFT tier: +0.05 to +0.15).
 * Returns 0 if boosting is not active.
 */
export function getCoalitionMultiplier(
  coalitionKey: string,
  recommendations: CoalitionRecommendation[],
  symbol: string
): number {
  if (!isCoalitionBoostingActive()) return 0;

  const rec = recommendations.find(r =>
    r.coalitionKey === coalitionKey && r.symbol === symbol && r.action === 'DEPLOY'
  );
  if (!rec) return 0;

  // SOFT tier: limited impact
  return Math.min(0.15, Math.max(0.05, rec.suggestedMultiplierBand[0]));
}
