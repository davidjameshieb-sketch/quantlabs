// ═══════════════════════════════════════════════════════════════
// Baseline vs Ensemble Profitability Engine — Measurement Only
// Compares thin-slice baseline (collaboration OFF) vs global
// ensemble (collaboration ON) across identical opportunities.
// ═══════════════════════════════════════════════════════════════

import {
  OrderRecord,
  filterOrdersByLearnMode,
  LearnMode,
} from './agentCollaborationEngine';
import {
  buildEnvKeyFromRaw,
  type EnvironmentKey,
} from '@/lib/forex/environmentSignature';

// ─── Types ───────────────────────────────────────────────────

export interface RollingComparison {
  window: number;
  baselineExpectancy: number;
  ensembleExpectancy: number;
  deltaExpectancy: number;
  baselinePF: number;
  ensemblePF: number;
  deltaPF: number;
  baselineMaxDD: number;
  ensembleMaxDD: number;
  deltaMaxDD: number;
  baselineDDSlope: number;
  ensembleDDSlope: number;
  deltaDDSlope: number;
  baselineWinRate: number;
  ensembleWinRate: number;
  deltaWinRate: number;
  outcomeChangedRate: number;
  changedTradeExpectancy: number;
  unchangedTradeExpectancy: number;
  changedTradePnL: number;
  sampleSize: number;
}

export type Verdict = 'improved' | 'neutral' | 'worse' | 'insufficient_sample';

export interface CoverageStats {
  totalEnvKeys: number;
  improvedEnvKeys: number;
  coveragePercent: number;
  baselineProfitableKeys: number;
  ensembleProfitableKeys: number;
}

export interface AggregateSummary {
  baselineTotalPnL: number;
  ensembleTotalPnL: number;
  deltaTotalPnL: number;
  baselineTrades: number;
  ensembleTrades: number;
  baselineWinRate: number;
  ensembleWinRate: number;
  changedTradesCount: number;
  changedTradesPnL: number;
  unchangedTradesCount: number;
  unchangedTradesPnL: number;
}

export interface BaselineVsEnsembleResult {
  rolling20: RollingComparison;
  rolling50: RollingComparison;
  rolling100: RollingComparison;
  coverage: CoverageStats;
  aggregate: AggregateSummary;
  verdict: Verdict;
  verdictReason: string;
  timestamp: number;
}

// ─── Extended Order with friction ────────────────────────────

export interface ExtendedOrderRecord extends OrderRecord {
  slippage_pips?: number | null;
  spread_at_entry?: number | null;
  variant_id?: string;
}

// ─── Constants ───────────────────────────────────────────────

const MIN_SAMPLE = 30;
const MATERIALITY_DD_INCREASE = 0.15;

// ─── PnL Helper (friction-adjusted) ─────────────────────────

function pnlPips(
  entry: number | null,
  exit: number | null,
  pair: string,
  direction: string,
  slippage: number | null | undefined,
  spread: number | null | undefined,
): number {
  if (!entry || !exit) return 0;
  const isJpy = pair.includes('JPY');
  const mult = isJpy ? 100 : 10000;
  const raw = direction === 'long'
    ? (exit - entry) * mult
    : (entry - exit) * mult;
  // Subtract friction
  const frictionPips = (slippage ?? 0) + (spread ?? 0);
  return raw - frictionPips;
}

// ─── Classify Baseline vs Ensemble ───────────────────────────

interface ClassifiedOrder extends ExtendedOrderRecord {
  isBaseline: boolean;
  isEnsemble: boolean;
  pnl: number;
  envKey: EnvironmentKey;
}

function classifyOrders(orders: ExtendedOrderRecord[]): ClassifiedOrder[] {
  return orders
    .filter(o => o.status === 'closed' && o.entry_price != null && o.exit_price != null)
    .map(o => {
      const variant = o.variant_id || '';
      const isBaseline = variant === 'baseline';
      const isEnsemble = !isBaseline;

      return {
        ...o,
        isBaseline,
        isEnsemble,
        pnl: pnlPips(
          o.entry_price, o.exit_price,
          o.currency_pair, o.direction,
          o.slippage_pips, o.spread_at_entry,
        ),
        envKey: buildEnvKeyFromRaw(
          o.session_label || 'unknown',
          o.regime_label || 'unknown',
          o.currency_pair,
          o.direction,
          o.agent_id || undefined,
        ),
      };
    });
}

// ─── Metric Calculators ──────────────────────────────────────

function expectancy(pnls: number[]): number {
  if (pnls.length === 0) return 0;
  return Math.round((pnls.reduce((s, p) => s + p, 0) / pnls.length) * 100) / 100;
}

function profitFactor(pnls: number[]): number {
  const gp = pnls.filter(p => p > 0).reduce((s, p) => s + p, 0);
  const gl = Math.abs(pnls.filter(p => p < 0).reduce((s, p) => s + p, 0));
  if (gl === 0) return gp > 0 ? 99 : 0;
  return Math.round((gp / gl) * 100) / 100;
}

function maxDrawdown(pnls: number[]): number {
  let peak = 0, maxDD = 0, cum = 0;
  for (const p of pnls) {
    cum += p;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  }
  return Math.round(maxDD * 100) / 100;
}

function drawdownSlope(pnls: number[]): number {
  if (pnls.length < 5) return 0;
  // Compute cumulative equity, find DD at each point, return slope via linear regression
  const ddSeries: number[] = [];
  let peak = 0, cum = 0;
  for (const p of pnls) {
    cum += p;
    if (cum > peak) peak = cum;
    ddSeries.push(peak - cum);
  }
  const n = ddSeries.length;
  const xMean = (n - 1) / 2;
  const yMean = ddSeries.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (ddSeries[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : Math.round((num / den) * 1000) / 1000;
}

function winRate(pnls: number[]): number {
  if (pnls.length === 0) return 0;
  return Math.round((pnls.filter(p => p > 0).length / pnls.length) * 1000) / 10;
}

function totalPnl(pnls: number[]): number {
  return Math.round(pnls.reduce((s, p) => s + p, 0) * 100) / 100;
}

// ─── Rolling Comparison ──────────────────────────────────────

function computeRollingComparison(
  baselinePnls: number[],
  ensemblePnls: number[],
  window: number,
  changedPnls: number[] = [],
  unchangedPnls: number[] = [],
): RollingComparison {
  const bSlice = baselinePnls.slice(0, window);
  const eSlice = ensemblePnls.slice(0, window);
  const totalOpportunities = Math.max(bSlice.length, eSlice.length);

  const bExp = expectancy(bSlice);
  const eExp = expectancy(eSlice);
  const bPF = profitFactor(bSlice);
  const ePF = profitFactor(eSlice);
  const bDD = maxDrawdown(bSlice);
  const eDD = maxDrawdown(eSlice);
  const bDDS = drawdownSlope(bSlice);
  const eDDS = drawdownSlope(eSlice);
  const bWR = winRate(bSlice);
  const eWR = winRate(eSlice);

  const changedSlice = changedPnls.slice(0, window);
  const unchangedSlice = unchangedPnls.slice(0, window);

  return {
    window,
    baselineExpectancy: bExp,
    ensembleExpectancy: eExp,
    deltaExpectancy: Math.round((eExp - bExp) * 100) / 100,
    baselinePF: bPF,
    ensemblePF: ePF,
    deltaPF: Math.round((ePF - bPF) * 100) / 100,
    baselineMaxDD: bDD,
    ensembleMaxDD: eDD,
    deltaMaxDD: Math.round((eDD - bDD) * 100) / 100,
    baselineDDSlope: bDDS,
    ensembleDDSlope: eDDS,
    deltaDDSlope: Math.round((eDDS - bDDS) * 1000) / 1000,
    baselineWinRate: bWR,
    ensembleWinRate: eWR,
    deltaWinRate: Math.round((eWR - bWR) * 10) / 10,
    outcomeChangedRate: totalOpportunities > 0
      ? Math.round((changedSlice.length / totalOpportunities) * 1000) / 1000
      : 0,
    changedTradeExpectancy: expectancy(changedSlice),
    unchangedTradeExpectancy: expectancy(unchangedSlice),
    changedTradePnL: totalPnl(changedSlice),
    sampleSize: totalOpportunities,
  };
}

// ─── Coverage Analysis ───────────────────────────────────────

function computeCoverage(classified: ClassifiedOrder[]): CoverageStats {
  const envMap = new Map<EnvironmentKey, { baseline: number[]; ensemble: number[] }>();

  for (const o of classified) {
    if (!envMap.has(o.envKey)) envMap.set(o.envKey, { baseline: [], ensemble: [] });
    const bucket = envMap.get(o.envKey)!;
    if (o.isBaseline) bucket.baseline.push(o.pnl);
    else bucket.ensemble.push(o.pnl);
  }

  let totalKeys = 0, improvedKeys = 0, baselineProfitable = 0, ensembleProfitable = 0;

  for (const [, data] of envMap) {
    if (data.baseline.length < 3 && data.ensemble.length < 3) continue;
    totalKeys++;
    const bExp = expectancy(data.baseline);
    const eExp = expectancy(data.ensemble);
    if (bExp > 0) baselineProfitable++;
    if (eExp > 0) ensembleProfitable++;
    if (eExp > bExp) improvedKeys++;
  }

  return {
    totalEnvKeys: totalKeys,
    improvedEnvKeys: improvedKeys,
    coveragePercent: totalKeys > 0 ? Math.round((improvedKeys / totalKeys) * 1000) / 10 : 0,
    baselineProfitableKeys: baselineProfitable,
    ensembleProfitableKeys: ensembleProfitable,
  };
}

// ─── Aggregate Summary ───────────────────────────────────────

function computeAggregate(
  baselinePnls: number[],
  ensemblePnls: number[],
  changedPnls: number[],
  unchangedPnls: number[],
): AggregateSummary {
  return {
    baselineTotalPnL: totalPnl(baselinePnls),
    ensembleTotalPnL: totalPnl(ensemblePnls),
    deltaTotalPnL: totalPnl(ensemblePnls) - totalPnl(baselinePnls),
    baselineTrades: baselinePnls.length,
    ensembleTrades: ensemblePnls.length,
    baselineWinRate: winRate(baselinePnls),
    ensembleWinRate: winRate(ensemblePnls),
    changedTradesCount: changedPnls.length,
    changedTradesPnL: totalPnl(changedPnls),
    unchangedTradesCount: unchangedPnls.length,
    unchangedTradesPnL: totalPnl(unchangedPnls),
  };
}

// ─── Verdict Logic ───────────────────────────────────────────

function determineVerdict(
  rolling100: RollingComparison,
  coverage: CoverageStats,
): { verdict: Verdict; reason: string } {
  if (rolling100.sampleSize < MIN_SAMPLE) {
    return {
      verdict: 'insufficient_sample',
      reason: `Only ${rolling100.sampleSize} trades available (need ${MIN_SAMPLE}). Cannot draw conclusions.`,
    };
  }

  const expImproved = rolling100.deltaExpectancy > 0;
  const coverageImproved = coverage.ensembleProfitableKeys > coverage.baselineProfitableKeys;
  const ddMateriallyWorse = rolling100.baselineMaxDD > 0
    ? (rolling100.ensembleMaxDD - rolling100.baselineMaxDD) / rolling100.baselineMaxDD > MATERIALITY_DD_INCREASE
    : rolling100.deltaMaxDD > 10;

  if (expImproved && coverageImproved && !ddMateriallyWorse) {
    return {
      verdict: 'improved',
      reason: `Expectancy improved by ${rolling100.deltaExpectancy}p, coverage expanded (${coverage.baselineProfitableKeys}→${coverage.ensembleProfitableKeys} profitable envKeys), drawdown stable.`,
    };
  }

  if (expImproved && !coverageImproved) {
    return {
      verdict: 'neutral',
      reason: `Expectancy improved (+${rolling100.deltaExpectancy}p) but coverage did not expand (${coverage.baselineProfitableKeys}→${coverage.ensembleProfitableKeys} keys). Edge was NOT expanded.`,
    };
  }

  if (!expImproved && coverageImproved) {
    return {
      verdict: 'neutral',
      reason: `Coverage expanded (${coverage.baselineProfitableKeys}→${coverage.ensembleProfitableKeys} keys) but expectancy dropped (${rolling100.deltaExpectancy}p). Edge was diluted.`,
    };
  }

  if (ddMateriallyWorse) {
    return {
      verdict: 'worse',
      reason: `Drawdown materially worsened (${rolling100.baselineMaxDD}p→${rolling100.ensembleMaxDD}p, +${(((rolling100.ensembleMaxDD - rolling100.baselineMaxDD) / Math.max(rolling100.baselineMaxDD, 1)) * 100).toFixed(0)}%).`,
    };
  }

  if (!expImproved && !coverageImproved) {
    return {
      verdict: 'worse',
      reason: `Expectancy declined (${rolling100.deltaExpectancy}p) and coverage did not improve. Ensemble underperforms baseline.`,
    };
  }

  return { verdict: 'neutral', reason: 'No clear signal — metrics are mixed.' };
}

// ─── Main Entry Point ────────────────────────────────────────

export function computeBaselineVsEnsemble(
  orders: ExtendedOrderRecord[],
  learnMode: LearnMode = 'live+practice',
): BaselineVsEnsembleResult {
  const filtered = filterOrdersByLearnMode(orders as OrderRecord[], learnMode);
  const classified = classifyOrders(filtered as ExtendedOrderRecord[]);

  classified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const baselinePnls = classified.filter(o => o.isBaseline).map(o => o.pnl);
  const ensemblePnls = classified.filter(o => o.isEnsemble).map(o => o.pnl);

  const changedPnls: number[] = [];
  const unchangedPnls: number[] = [];

  const envBaseline = new Map<EnvironmentKey, number[]>();
  const envEnsemble = new Map<EnvironmentKey, number[]>();
  for (const o of classified) {
    const map = o.isBaseline ? envBaseline : envEnsemble;
    if (!map.has(o.envKey)) map.set(o.envKey, []);
    map.get(o.envKey)!.push(o.pnl);
  }

  for (const [ek, ePnls] of envEnsemble) {
    if (envBaseline.has(ek)) {
      changedPnls.push(...ePnls);
    } else {
      unchangedPnls.push(...ePnls);
    }
  }

  const rolling20 = computeRollingComparison(baselinePnls, ensemblePnls, 20, changedPnls, unchangedPnls);
  const rolling50 = computeRollingComparison(baselinePnls, ensemblePnls, 50, changedPnls, unchangedPnls);
  const rolling100 = computeRollingComparison(baselinePnls, ensemblePnls, 100, changedPnls, unchangedPnls);

  const coverage = computeCoverage(classified);
  const aggregate = computeAggregate(baselinePnls, ensemblePnls, changedPnls, unchangedPnls);
  const { verdict, reason } = determineVerdict(rolling100, coverage);

  return {
    rolling20,
    rolling50,
    rolling100,
    coverage,
    aggregate,
    verdict,
    verdictReason: reason,
    timestamp: Date.now(),
  };
}
