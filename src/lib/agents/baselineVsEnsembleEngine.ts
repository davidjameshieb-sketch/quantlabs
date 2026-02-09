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
  outcomeChangedRate: number;
  changedTradeExpectancy: number;
  unchangedTradeExpectancy: number;
  sampleSize: number;
}

export type Verdict = 'improved' | 'neutral' | 'worse' | 'insufficient_sample';

export interface CoverageStats {
  totalEnvKeys: number;
  improvedEnvKeys: number;
  coveragePercent: number;        // % of envKeys where Δ expectancy > 0
  baselineProfitableKeys: number;
  ensembleProfitableKeys: number;
}

export interface BaselineVsEnsembleResult {
  rolling20: RollingComparison;
  rolling50: RollingComparison;
  rolling100: RollingComparison;
  coverage: CoverageStats;
  verdict: Verdict;
  verdictReason: string;
  timestamp: number;
}

// ─── Constants ───────────────────────────────────────────────

const MIN_SAMPLE = 30;
const MATERIALITY_DD_INCREASE = 0.15; // 15% worsening considered material

// ─── PnL Helper ──────────────────────────────────────────────

function pnlPips(entry: number | null, exit: number | null, pair: string, direction: string): number {
  if (!entry || !exit) return 0;
  const isJpy = pair.includes('JPY');
  const mult = isJpy ? 100 : 10000;
  return direction === 'long'
    ? (exit - entry) * mult
    : (entry - exit) * mult;
}

// ─── Classify Baseline vs Ensemble ───────────────────────────
// Baseline = orders where governance_composite is present but
//            no collaboration metadata (ensemble OFF / shadow)
// Ensemble = orders where collaboration was active
//
// Since we don't have a dedicated flag yet, we use variant_id:
//   'baseline' → baseline, anything else → ensemble
// Also handle orders without variant_id as ensemble (live default)

interface ClassifiedOrder extends OrderRecord {
  isBaseline: boolean;
  isEnsemble: boolean;
  pnl: number;
  envKey: EnvironmentKey;
}

function classifyOrders(orders: OrderRecord[]): ClassifiedOrder[] {
  return orders
    .filter(o => o.status === 'closed' && o.entry_price != null && o.exit_price != null)
    .map(o => {
      // Parse variant_id to determine mode
      const variant = (o as any).variant_id || '';
      const isBaseline = variant === 'baseline';
      const isEnsemble = !isBaseline; // default live = ensemble on

      return {
        ...o,
        isBaseline,
        isEnsemble,
        pnl: pnlPips(o.entry_price, o.exit_price, o.currency_pair, o.direction),
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
    outcomeChangedRate: totalOpportunities > 0
      ? Math.round((changedSlice.length / totalOpportunities) * 1000) / 1000
      : 0,
    changedTradeExpectancy: expectancy(changedSlice),
    unchangedTradeExpectancy: expectancy(unchangedSlice),
    sampleSize: totalOpportunities,
  };
}

// ─── Coverage Analysis ───────────────────────────────────────

function computeCoverage(classified: ClassifiedOrder[]): CoverageStats {
  // Group by envKey, compute baseline vs ensemble expectancy per key
  const envMap = new Map<EnvironmentKey, { baseline: number[]; ensemble: number[] }>();

  for (const o of classified) {
    if (!envMap.has(o.envKey)) envMap.set(o.envKey, { baseline: [], ensemble: [] });
    const bucket = envMap.get(o.envKey)!;
    if (o.isBaseline) bucket.baseline.push(o.pnl);
    else bucket.ensemble.push(o.pnl);
  }

  let totalKeys = 0;
  let improvedKeys = 0;
  let baselineProfitable = 0;
  let ensembleProfitable = 0;

  for (const [, data] of envMap) {
    // Need minimum trades in both buckets to compare
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

// ─── Verdict Logic ───────────────────────────────────────────

function determineVerdict(
  rolling100: RollingComparison,
  coverage: CoverageStats,
): { verdict: Verdict; reason: string } {
  // Insufficient sample
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
    : rolling100.deltaMaxDD > 10; // absolute fallback

  // Decision matrix
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
  orders: OrderRecord[],
  learnMode: LearnMode = 'live+practice',
): BaselineVsEnsembleResult {
  const filtered = filterOrdersByLearnMode(orders, learnMode);
  const classified = classifyOrders(filtered);

  // Sort most recent first
  classified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const baselinePnls = classified.filter(o => o.isBaseline).map(o => o.pnl);
  const ensemblePnls = classified.filter(o => o.isEnsemble).map(o => o.pnl);

  // For outcome-changed analysis, we'd need paired data.
  // Since we're comparing shadow baseline vs live ensemble on same opportunities,
  // we approximate: trades in envKeys present in BOTH buckets where direction differs
  const changedPnls: number[] = [];
  const unchangedPnls: number[] = [];

  // Group by envKey to find overlapping opportunities
  const envBaseline = new Map<EnvironmentKey, number[]>();
  const envEnsemble = new Map<EnvironmentKey, number[]>();
  for (const o of classified) {
    const map = o.isBaseline ? envBaseline : envEnsemble;
    if (!map.has(o.envKey)) map.set(o.envKey, []);
    map.get(o.envKey)!.push(o.pnl);
  }

  for (const [ek, ePnls] of envEnsemble) {
    if (envBaseline.has(ek)) {
      // This envKey had both baseline and ensemble trades — decisions could have changed
      changedPnls.push(...ePnls);
    } else {
      // Ensemble-only = unchanged (no baseline comparison)
      unchangedPnls.push(...ePnls);
    }
  }

  const rolling20 = computeRollingComparison(baselinePnls, ensemblePnls, 20, changedPnls, unchangedPnls);
  const rolling50 = computeRollingComparison(baselinePnls, ensemblePnls, 50, changedPnls, unchangedPnls);
  const rolling100 = computeRollingComparison(baselinePnls, ensemblePnls, 100, changedPnls, unchangedPnls);

  const coverage = computeCoverage(classified);
  const { verdict, reason } = determineVerdict(rolling100, coverage);

  return {
    rolling20,
    rolling50,
    rolling100,
    coverage,
    verdict,
    verdictReason: reason,
    timestamp: Date.now(),
  };
}
