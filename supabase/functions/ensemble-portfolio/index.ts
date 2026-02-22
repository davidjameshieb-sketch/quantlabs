// Ensemble Meta-Portfolio Engine v1.0
// Ingests Alpha Discovery strategies, normalizes, decorrelates,
// applies inverse-volatility weighting + dynamic regime routing

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface StrategyInput {
  id: string;
  name: string;
  pair?: string;
  equityCurve: number[];
  totalReturn: number;
  maxDrawdown: number;
  sharpe: number;
  winRate: number;
  profitFactor: number;
  trades: number;
  totalPips: number;
  regimeScores?: { trend: number; range: number; shock: number };
  bestRegime?: string;
  edgeArchetype?: string;
}

interface PortfolioMember {
  id: string;
  name: string;
  pair?: string;
  weight: number;         // inverse-vol weight (0-1, sums to 1)
  regimeWeight: number;   // after regime routing adjustment
  sharpe: number;
  maxDrawdown: number;
  volatility: number;     // annualized daily vol
  normalizedCurve: number[];
  bestRegime?: string;
  edgeArchetype?: string;
  winRate: number;
  profitFactor: number;
  trades: number;
  totalPips: number;
  totalReturn: number;
  rejected: boolean;
  rejectionReason?: string;
}

// ── Math Utilities ──────────────────────────────────────────────────────

function dailyReturns(curve: number[]): number[] {
  const ret: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    ret.push(curve[i - 1] !== 0 ? (curve[i] - curve[i - 1]) / curve[i - 1] : 0);
  }
  return ret;
}

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 10) return 0;
  let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i]; sumB += b[i];
    sumAB += a[i] * b[i];
    sumA2 += a[i] * a[i];
    sumB2 += b[i] * b[i];
  }
  const denom = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB));
  if (denom === 0) return 0;
  return (n * sumAB - sumA * sumB) / denom;
}

function annualizedVol(returns: number[]): number {
  if (returns.length < 2) return 1;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  // Assume M30 bars → ~48 bars/day, ~252 trading days
  return Math.sqrt(variance) * Math.sqrt(48 * 252);
}

function normalizeCurve(curve: number[]): number[] {
  // Normalize so starting equity = 1.0, returns are proportional
  if (curve.length === 0) return [];
  const start = curve[0];
  if (start === 0) return curve.map(() => 1);
  return curve.map(v => v / start);
}

// ── Rolling Correlation Matrix ──────────────────────────────────────────

interface CorrelationEntry {
  stratA: string;
  stratB: string;
  correlation: number;
}

function buildCorrelationMatrix(strategies: { id: string; returns: number[] }[]): CorrelationEntry[] {
  const entries: CorrelationEntry[] = [];
  for (let i = 0; i < strategies.length; i++) {
    for (let j = i + 1; j < strategies.length; j++) {
      const corr = pearsonCorrelation(strategies[i].returns, strategies[j].returns);
      entries.push({ stratA: strategies[i].id, stratB: strategies[j].id, correlation: corr });
    }
  }
  return entries;
}

// ── Decorrelation Filter ────────────────────────────────────────────────

function decorrelationFilter(
  strategies: StrategyInput[],
  maxCorrelation: number,
): { accepted: StrategyInput[]; rejected: { strategy: StrategyInput; reason: string }[] } {
  // Sort by Sharpe descending → best risk-adjusted first
  const sorted = [...strategies].sort((a, b) => (b.sharpe || 0) - (a.sharpe || 0));
  
  const accepted: StrategyInput[] = [];
  const rejected: { strategy: StrategyInput; reason: string }[] = [];
  const acceptedReturns: { id: string; returns: number[] }[] = [];

  for (const strat of sorted) {
    const returns = dailyReturns(normalizeCurve(strat.equityCurve));
    let tooCorrelated = false;
    let correlatedWith = '';

    for (const existing of acceptedReturns) {
      const corr = Math.abs(pearsonCorrelation(returns, existing.returns));
      if (corr > maxCorrelation) {
        tooCorrelated = true;
        correlatedWith = existing.id;
        break;
      }
    }

    if (tooCorrelated) {
      rejected.push({ strategy: strat, reason: `ρ > ${maxCorrelation} with ${correlatedWith} (higher Sharpe kept)` });
    } else {
      accepted.push(strat);
      acceptedReturns.push({ id: strat.id, returns });
    }
  }

  return { accepted, rejected };
}

// ── Inverse Volatility (Risk Parity) Weighting ─────────────────────────

function inverseVolWeights(strategies: StrategyInput[]): Map<string, { weight: number; vol: number }> {
  const vols = new Map<string, number>();
  
  for (const s of strategies) {
    const returns = dailyReturns(normalizeCurve(s.equityCurve));
    const vol = annualizedVol(returns);
    vols.set(s.id, Math.max(vol, 0.001)); // floor to prevent div/0
  }

  // Inverse vol: weight_i = (1/vol_i) / sum(1/vol_j)
  let sumInvVol = 0;
  for (const [, vol] of vols) sumInvVol += 1 / vol;

  const weights = new Map<string, { weight: number; vol: number }>();
  for (const [id, vol] of vols) {
    weights.set(id, { weight: (1 / vol) / sumInvVol, vol });
  }

  return weights;
}

// ── Dynamic Regime Routing ──────────────────────────────────────────────

type Regime = 'trend' | 'range' | 'shock';

function applyRegimeRouting(
  strategies: StrategyInput[],
  baseWeights: Map<string, { weight: number; vol: number }>,
  currentRegime: Regime,
): Map<string, number> {
  const regimeWeights = new Map<string, number>();

  // Classification: which strategies are "tagged" for this regime?
  const regimeAffinity = new Map<string, number>();
  for (const s of strategies) {
    const scores = s.regimeScores || { trend: 1, range: 1, shock: 1 };
    const total = scores.trend + scores.range + scores.shock || 1;
    const affinity = scores[currentRegime] / total;
    regimeAffinity.set(s.id, affinity);
  }

  // Regime routing: boost strategies suited to current regime
  // Shock: 80% to shock-tagged, 20% shared
  // Trend/Range: 60% to tagged, 40% shared
  const regimeConcentration = currentRegime === 'shock' ? 0.80 : 0.60;

  let totalAffinity = 0;
  for (const [, aff] of regimeAffinity) totalAffinity += aff;
  if (totalAffinity === 0) totalAffinity = 1;

  let sumWeights = 0;
  for (const s of strategies) {
    const base = baseWeights.get(s.id)?.weight || 0;
    const affinity = regimeAffinity.get(s.id) || 0;
    const regimePortion = regimeConcentration * (affinity / totalAffinity);
    const basePortion = (1 - regimeConcentration) * base;
    const finalWeight = regimePortion + basePortion;
    regimeWeights.set(s.id, finalWeight);
    sumWeights += finalWeight;
  }

  // Re-normalize to sum = 1
  if (sumWeights > 0) {
    for (const [id, w] of regimeWeights) {
      regimeWeights.set(id, w / sumWeights);
    }
  }

  return regimeWeights;
}

// ── Synthesize Portfolio Equity Curve ────────────────────────────────────

function synthesizeEquityCurve(
  strategies: StrategyInput[],
  weights: Map<string, number>,
): number[] {
  if (strategies.length === 0) return [];

  // Normalize all curves to start at 1.0
  const normalizedCurves = strategies.map(s => ({
    id: s.id,
    curve: normalizeCurve(s.equityCurve),
  }));

  // Find the shortest curve length to align
  const minLen = Math.min(...normalizedCurves.map(c => c.curve.length));
  if (minLen < 2) return [];

  // Weighted sum of normalized curves
  const synthesized: number[] = [];
  for (let i = 0; i < minLen; i++) {
    let weightedVal = 0;
    for (const nc of normalizedCurves) {
      const w = weights.get(nc.id) || 0;
      weightedVal += nc.curve[i] * w;
    }
    synthesized.push(weightedVal);
  }

  // Scale to $1000 base
  const scale = 1000 / (synthesized[0] || 1);
  return synthesized.map(v => Math.round(v * scale * 100) / 100);
}

// ── Compute Portfolio Metrics ───────────────────────────────────────────

function computePortfolioMetrics(curve: number[]) {
  if (curve.length < 2) return { totalReturn: 0, maxDrawdown: 0, sharpe: 0, volatility: 0 };

  const totalReturn = ((curve[curve.length - 1] - curve[0]) / curve[0]) * 100;
  
  let peak = curve[0], maxDD = 0;
  for (const v of curve) {
    if (v > peak) peak = v;
    const dd = (peak - v) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  const returns = dailyReturns(curve);
  const vol = annualizedVol(returns);
  const meanReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const stdReturn = Math.sqrt(returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / (returns.length - 1));
  const sharpe = stdReturn > 0 ? (meanReturn / stdReturn) * Math.sqrt(48 * 252) : 0;

  return {
    totalReturn: Math.round(totalReturn * 100) / 100,
    maxDrawdown: Math.round(maxDD * 10000) / 10000,
    sharpe: Math.round(sharpe * 100) / 100,
    volatility: Math.round(vol * 10000) / 10000,
  };
}

// ── Main Handler ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { strategies, currentRegime = 'trend', maxCorrelation = 0.4 } = body as {
      strategies: StrategyInput[];
      currentRegime?: Regime;
      maxCorrelation?: number;
    };

    if (!strategies || !Array.isArray(strategies) || strategies.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "strategies array required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[ENSEMBLE] Processing ${strategies.length} strategies, regime=${currentRegime}, maxCorr=${maxCorrelation}`);

    // Module 1: Normalization — already handled by normalizeCurve()

    // Module 2: Correlation Matrix Filter
    const { accepted, rejected } = decorrelationFilter(strategies, maxCorrelation);
    console.log(`[ENSEMBLE] Decorrelation: ${accepted.length} accepted, ${rejected.length} rejected`);

    if (accepted.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        portfolio: { members: [], synthesizedCurve: [], metrics: {}, correlationMatrix: [], regime: currentRegime },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build full correlation matrix for accepted strategies
    const corrInputs = accepted.map(s => ({
      id: s.id,
      returns: dailyReturns(normalizeCurve(s.equityCurve)),
    }));
    const correlationMatrix = buildCorrelationMatrix(corrInputs);

    // Module 4: Inverse Volatility Weighting
    const ivWeights = inverseVolWeights(accepted);

    // Module 3: Dynamic Regime Routing
    const regimeWeights = applyRegimeRouting(accepted, ivWeights, currentRegime);

    // Build portfolio members
    const members: PortfolioMember[] = [];

    for (const s of strategies) {
      const isAccepted = accepted.includes(s);
      const rej = rejected.find(r => r.strategy.id === s.id);
      const iv = ivWeights.get(s.id);
      const rw = regimeWeights.get(s.id);

      members.push({
        id: s.id,
        name: s.name,
        pair: s.pair,
        weight: iv?.weight || 0,
        regimeWeight: rw || 0,
        sharpe: s.sharpe || 0,
        maxDrawdown: s.maxDrawdown || 0,
        volatility: iv?.vol || 0,
        normalizedCurve: normalizeCurve(s.equityCurve).slice(0, 200), // truncate for payload size
        bestRegime: s.bestRegime,
        edgeArchetype: s.edgeArchetype,
        winRate: s.winRate,
        profitFactor: s.profitFactor,
        trades: s.trades,
        totalPips: s.totalPips,
        totalReturn: s.totalReturn,
        rejected: !isAccepted,
        rejectionReason: rej?.reason,
      });
    }

    // Synthesize portfolio equity curve
    const synthesizedCurve = synthesizeEquityCurve(accepted, regimeWeights);
    const portfolioMetrics = computePortfolioMetrics(synthesizedCurve);

    // Compute individual strategy contribution to total
    const totalPortfolioReturn = portfolioMetrics.totalReturn;

    console.log(`[ENSEMBLE] Portfolio: ${accepted.length} strategies, Return=${portfolioMetrics.totalReturn}%, MaxDD=${portfolioMetrics.maxDrawdown}, Sharpe=${portfolioMetrics.sharpe}`);

    return new Response(JSON.stringify({
      success: true,
      portfolio: {
        members: members.sort((a, b) => b.regimeWeight - a.regimeWeight),
        synthesizedCurve,
        metrics: portfolioMetrics,
        correlationMatrix,
        regime: currentRegime,
        regimeLabel: currentRegime.toUpperCase(),
        acceptedCount: accepted.length,
        rejectedCount: rejected.length,
        totalStrategies: strategies.length,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[ENSEMBLE] Error:", err);
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
