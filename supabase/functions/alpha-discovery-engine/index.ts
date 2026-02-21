// Alpha Discovery Engine — Unsupervised Decision Tree Rule Miner
// Implements CART Decision Tree with max_depth 4-5, feature engineering,
// rule extraction, and Pearson correlation filtering

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OANDA_HOST = "https://api-fxtrade.oanda.com";
const OANDA_PRACTICE_HOST = "https://api-fxpractice.oanda.com";

const PAIRS = [
  "EUR_USD", "GBP_USD", "AUD_USD", "NZD_USD",
  "USD_CAD", "USD_CHF", "USD_JPY",
  "EUR_GBP", "EUR_JPY", "GBP_JPY", "AUD_JPY",
];

const ALL_CURRENCIES = ["EUR", "GBP", "AUD", "NZD", "USD", "CAD", "CHF", "JPY"];

// ── Types ──────────────────────────────────────────────────────────────────
interface Candle {
  time: string;
  volume: number;
  high: number;
  low: number;
  open: number;
  close: number;
}

interface FeatureRow {
  time: string;
  pair: string;
  close: number;
  atr: number;
  hurst: number;
  predatorRank: number;
  preyRank: number;
  gate1: boolean;
  gate2: boolean;
  gate3: boolean;
  session: number; // 0=asia, 1=london, 2=ny, 3=nyclose
  rollingVol: number;
  mfe8: number;        // max favorable excursion next 8 bars
  mae8: number;        // max adverse excursion next 8 bars
  isPerfectTrade: number; // binary target
  futureReturn4H: number;
}

interface TreeNode {
  featureIndex: number | null;
  threshold: number | null;
  left: TreeNode | null;
  right: TreeNode | null;
  prediction: number | null;
  samples: number;
  positives: number;
  winRate: number;
  isLeaf: boolean;
  depth: number;
}

interface DiscoveredRule {
  conditions: Array<{ feature: string; operator: '<=' | '>'; threshold: number }>;
  winRate: number;
  samples: number;
  profitFactor: number;
  totalPips: number;
  trades: number;
  equityCurve: number[];
  correlationToBase: number;
  plainEnglish: string;
}

// ── Feature Names ──
const FEATURE_NAMES = [
  'predatorRank', 'preyRank', 'gate1', 'gate2', 'gate3',
  'session', 'atr', 'hurst', 'rollingVol',
];

const FEATURE_LABELS: Record<string, string> = {
  predatorRank: 'Predator Rank',
  preyRank: 'Prey Rank',
  gate1: 'Gate 1 (Momentum)',
  gate2: 'Gate 2 (Structural Breach)',
  gate3: 'Gate 3 (Micro Z-OFI)',
  session: 'Trading Session',
  atr: 'ATR (Volatility)',
  hurst: 'Hurst Exponent',
  rollingVol: 'Rolling Volatility',
};

// ── Helper Functions ───────────────────────────────────────────────────────

async function fetchCandles(
  instrument: string, count: number, env: "practice" | "live", token: string
): Promise<Candle[]> {
  const host = env === "live" ? OANDA_HOST : OANDA_PRACTICE_HOST;
  const url = `${host}/v3/instruments/${instrument}/candles?count=${count}&granularity=M30&price=M`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.candles || [])
    .filter((c: { complete?: boolean }) => c.complete !== false)
    .map((c: { time: string; volume: number; mid: { h: string; l: string; o: string; c: string } }) => ({
      time: c.time, volume: c.volume,
      high: parseFloat(c.mid.h), low: parseFloat(c.mid.l),
      open: parseFloat(c.mid.o), close: parseFloat(c.mid.c),
    }));
}

function computeATR(candles: Candle[], period = 14): number[] {
  const atrs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period) { atrs.push(0); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const tr = Math.max(
        candles[j].high - candles[j].low,
        Math.abs(candles[j].high - candles[j - 1].close),
        Math.abs(candles[j].low - candles[j - 1].close)
      );
      sum += tr;
    }
    atrs.push(sum / period);
  }
  return atrs;
}

function computeHurst(closes: number[], window = 20): number {
  if (closes.length < window) return 0.5;
  const slice = closes.slice(-window);
  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    returns.push(Math.log(slice[i] / slice[i - 1]));
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const deviations = returns.map(r => r - mean);
  const cumDev: number[] = [];
  let cumSum = 0;
  for (const d of deviations) { cumSum += d; cumDev.push(cumSum); }
  const R = Math.max(...cumDev) - Math.min(...cumDev);
  const S = Math.sqrt(deviations.reduce((a, d) => a + d * d, 0) / deviations.length);
  if (S === 0) return 0.5;
  const RS = R / S;
  return Math.log(RS) / Math.log(returns.length);
}

function getSession(time: string): number {
  const h = new Date(time).getUTCHours();
  if (h < 7) return 0;   // Asia
  if (h < 12) return 1;  // London
  if (h < 17) return 2;  // NY
  return 3;               // NY Close
}

function linearRegressionSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += values[i]; sumXY += i * values[i]; sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

// ── Currency Ranking (simplified from sovereign-matrix) ────────────────────

function computePercentReturn(candles: Candle[], periods = 20): number {
  if (candles.length < 2) return 0;
  const slice = candles.slice(-Math.min(periods, candles.length));
  let total = 0;
  for (const c of slice) {
    if (c.open !== 0) total += ((c.close - c.open) / c.open) * 100;
  }
  return total / slice.length;
}

// ── CART Decision Tree Implementation ──────────────────────────────────────

function giniImpurity(labels: number[]): number {
  if (labels.length === 0) return 0;
  const pos = labels.filter(l => l === 1).length;
  const p = pos / labels.length;
  return 2 * p * (1 - p);
}

function findBestSplit(
  features: number[][], labels: number[], featureIndices: number[]
): { featureIndex: number; threshold: number; gain: number } | null {
  const parentGini = giniImpurity(labels);
  let bestGain = 0;
  let bestFeature = -1;
  let bestThreshold = 0;

  for (const fi of featureIndices) {
    const values = [...new Set(features.map(r => r[fi]))].sort((a, b) => a - b);
    for (let t = 0; t < values.length - 1; t++) {
      const threshold = (values[t] + values[t + 1]) / 2;
      const leftLabels: number[] = [];
      const rightLabels: number[] = [];
      for (let i = 0; i < features.length; i++) {
        if (features[i][fi] <= threshold) leftLabels.push(labels[i]);
        else rightLabels.push(labels[i]);
      }
      if (leftLabels.length < 3 || rightLabels.length < 3) continue;
      const leftGini = giniImpurity(leftLabels);
      const rightGini = giniImpurity(rightLabels);
      const weightedGini = (leftLabels.length * leftGini + rightLabels.length * rightGini) / labels.length;
      const gain = parentGini - weightedGini;
      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = fi;
        bestThreshold = threshold;
      }
    }
  }
  return bestGain > 0.001 ? { featureIndex: bestFeature, threshold: bestThreshold, gain: bestGain } : null;
}

function buildTree(
  features: number[][], labels: number[], depth: number, maxDepth: number, minSamples: number
): TreeNode {
  const positives = labels.filter(l => l === 1).length;
  const winRate = labels.length > 0 ? positives / labels.length : 0;

  if (depth >= maxDepth || labels.length < minSamples || winRate === 0 || winRate === 1) {
    return {
      featureIndex: null, threshold: null, left: null, right: null,
      prediction: winRate >= 0.5 ? 1 : 0,
      samples: labels.length, positives, winRate, isLeaf: true, depth,
    };
  }

  const featureIndices = Array.from({ length: features[0]?.length || 0 }, (_, i) => i);
  const split = findBestSplit(features, labels, featureIndices);

  if (!split) {
    return {
      featureIndex: null, threshold: null, left: null, right: null,
      prediction: winRate >= 0.5 ? 1 : 0,
      samples: labels.length, positives, winRate, isLeaf: true, depth,
    };
  }

  const leftFeatures: number[][] = [];
  const leftLabels: number[] = [];
  const rightFeatures: number[][] = [];
  const rightLabels: number[] = [];

  for (let i = 0; i < features.length; i++) {
    if (features[i][split.featureIndex] <= split.threshold) {
      leftFeatures.push(features[i]);
      leftLabels.push(labels[i]);
    } else {
      rightFeatures.push(features[i]);
      rightLabels.push(labels[i]);
    }
  }

  return {
    featureIndex: split.featureIndex,
    threshold: split.threshold,
    left: buildTree(leftFeatures, leftLabels, depth + 1, maxDepth, minSamples),
    right: buildTree(rightFeatures, rightLabels, depth + 1, maxDepth, minSamples),
    prediction: null,
    samples: labels.length, positives, winRate,
    isLeaf: false, depth,
  };
}

// ── Extract High-Probability Leaf Paths ────────────────────────────────────

interface LeafPath {
  conditions: Array<{ featureIndex: number; operator: '<=' | '>'; threshold: number }>;
  winRate: number;
  samples: number;
  positives: number;
}

function extractLeafPaths(
  node: TreeNode,
  path: Array<{ featureIndex: number; operator: '<=' | '>'; threshold: number }> = []
): LeafPath[] {
  if (node.isLeaf) {
    return [{ conditions: [...path], winRate: node.winRate, samples: node.samples, positives: node.positives }];
  }
  const results: LeafPath[] = [];
  if (node.left && node.featureIndex !== null && node.threshold !== null) {
    results.push(...extractLeafPaths(node.left, [
      ...path, { featureIndex: node.featureIndex, operator: '<=', threshold: node.threshold }
    ]));
  }
  if (node.right && node.featureIndex !== null && node.threshold !== null) {
    results.push(...extractLeafPaths(node.right, [
      ...path, { featureIndex: node.featureIndex, operator: '>', threshold: node.threshold }
    ]));
  }
  return results;
}

// ── Pearson Correlation ────────────────────────────────────────────────────

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;
  let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i]; sumB += b[i]; sumAB += a[i] * b[i];
    sumA2 += a[i] * a[i]; sumB2 += b[i] * b[i];
  }
  const num = n * sumAB - sumA * sumB;
  const den = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB));
  return den === 0 ? 0 : num / den;
}

// ── Simulate Rule Equity Curve ─────────────────────────────────────────────

function simulateRule(
  rows: FeatureRow[],
  conditions: Array<{ featureIndex: number; operator: '<=' | '>'; threshold: number }>
): { equityCurve: number[]; trades: number; wins: number; grossProfit: number; grossLoss: number; totalPips: number } {
  let equity = 1000;
  const curve: number[] = [equity];
  let trades = 0, wins = 0, grossProfit = 0, grossLoss = 0, totalPips = 0;

  for (const row of rows) {
    const featureVec = [
      row.predatorRank, row.preyRank,
      row.gate1 ? 1 : 0, row.gate2 ? 1 : 0, row.gate3 ? 1 : 0,
      row.session, row.atr, row.hurst, row.rollingVol,
    ];
    let match = true;
    for (const cond of conditions) {
      const val = featureVec[cond.featureIndex];
      if (cond.operator === '<=') { if (val > cond.threshold) { match = false; break; } }
      else { if (val <= cond.threshold) { match = false; break; } }
    }
    if (!match) { curve.push(equity); continue; }

    trades++;
    const pipResult = row.futureReturn4H * 10000; // approximate pips
    const isJPY = row.pair.includes('JPY');
    const pips = isJPY ? row.futureReturn4H * 100 : row.futureReturn4H * 10000;
    totalPips += pips;
    if (pips > 0) { wins++; grossProfit += pips; }
    else { grossLoss += Math.abs(pips); }
    equity += pips * 0.1;
    curve.push(equity);
  }

  return { equityCurve: curve, trades, wins, grossProfit, grossLoss, totalPips };
}

// ── Convert conditions to plain English ────────────────────────────────────

function conditionsToEnglish(
  conditions: Array<{ featureIndex: number; operator: '<=' | '>'; threshold: number }>
): string {
  const parts = conditions.map(c => {
    const name = FEATURE_NAMES[c.featureIndex];
    const label = FEATURE_LABELS[name] || name;
    const op = c.operator === '<=' ? '≤' : '>';
    let valStr = '';
    if (name === 'gate1' || name === 'gate2' || name === 'gate3') {
      valStr = c.threshold < 0.5 ? 'FALSE' : 'TRUE';
      return `${label} is ${c.operator === '<=' ? valStr : (c.threshold < 0.5 ? 'TRUE' : 'FALSE')}`;
    }
    if (name === 'session') {
      const sessions = ['Asia', 'London', 'New York', 'NY Close'];
      const sessionIdx = Math.round(c.threshold);
      return `Session ${op} ${sessions[sessionIdx] || sessionIdx}`;
    }
    valStr = c.threshold < 1 ? c.threshold.toFixed(4) : c.threshold.toFixed(1);
    return `${label} ${op} ${valStr}`;
  });
  return 'IF ' + parts.join(' AND ') + ' THEN Trade';
}

// ── Main Handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const environment: "practice" | "live" = body.environment || "live";
    const maxDepth = body.maxDepth || 4;
    const minWinRate = body.minWinRate || 0.65;
    const maxCorrelation = body.maxCorrelation || 0.3;
    const candleCount = Math.min(body.candles || 5000, 5000);

    const apiToken = environment === "live"
      ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
      : Deno.env.get("OANDA_API_TOKEN");

    if (!apiToken) {
      return new Response(
        JSON.stringify({ error: "OANDA API token not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ALPHA DISCOVERY] Fetching ${candleCount} M30 candles for ${PAIRS.length} pairs (env: ${environment})`);

    // ── Step 1: Fetch candles for all pairs ──
    const pairResults = await Promise.allSettled(
      PAIRS.map(async (pair) => {
        const candles = await fetchCandles(pair, candleCount, environment, apiToken);
        return { pair, candles };
      })
    );

    // ── Step 2: Compute currency rankings per snapshot ──
    // For simplicity, we compute a single ranking from the most recent 20 candles
    // Then build feature rows from all candles
    const allRows: FeatureRow[] = [];
    const baselineReturns: number[] = []; // baseline strategy returns

    for (const result of pairResults) {
      if (result.status !== "fulfilled" || !result.value.candles || result.value.candles.length < 30) continue;
      const { pair, candles } = result.value;
      const parts = pair.split("_");
      if (parts.length !== 2) continue;

      const atrs = computeATR(candles, 14);

      // Build feature rows
      for (let i = 20; i < candles.length - 8; i++) {
        const window = candles.slice(i - 20, i);
        const closes = window.map(c => c.close);
        const currentATR = atrs[i] || atrs[i - 1] || 0.001;

        // Compute rankings from window
        const pctReturn = computePercentReturn(window, 20);
        // Simplified: use sign of return for rank proxy
        const predatorRank = pctReturn > 0.01 ? 1 : pctReturn > 0.005 ? 2 : pctReturn > 0 ? 3 : 4;
        const preyRank = pctReturn < -0.01 ? 8 : pctReturn < -0.005 ? 7 : pctReturn < 0 ? 6 : 5;

        // Gate computations
        const snap20High = Math.max(...window.map(c => c.high));
        const snap20Low = Math.min(...window.map(c => c.low));
        const gate1 = predatorRank <= 2 && preyRank >= 7;
        const gate2 = candles[i].close > snap20High || candles[i].close < snap20Low;
        const slope = linearRegressionSlope(closes);
        const gate3 = Math.abs(slope) > 0;

        // Hurst exponent
        const hurst = computeHurst(closes, 20);

        // Rolling volatility
        const rollingVol = closes.length > 1
          ? Math.sqrt(closes.slice(1).reduce((s, c, idx) => s + Math.pow(Math.log(c / closes[idx]), 2), 0) / (closes.length - 1))
          : 0;

        // Future return (MFE over next 8 bars)
        const futureSlice = candles.slice(i + 1, i + 9);
        let mfe = 0, mae = 0;
        const isLongBias = pctReturn > 0;
        for (const fc of futureSlice) {
          if (isLongBias) {
            const fav = fc.high - candles[i].close;
            const adv = candles[i].close - fc.low;
            if (fav > mfe) mfe = fav;
            if (adv > mae) mae = adv;
          } else {
            const fav = candles[i].close - fc.low;
            const adv = fc.high - candles[i].close;
            if (fav > mfe) mfe = fav;
            if (adv > mae) mae = adv;
          }
        }

        const futureReturn = isLongBias ? mfe : mfe;
        const isPerfect = (mfe > 1.5 * currentATR && mae < 0.5 * currentATR) ? 1 : 0;

        // Baseline strategy return (rank 1 vs 8, all gates)
        const baseReturn = (gate1 && gate2 && gate3) ? (isLongBias ? mfe : -mfe) : 0;
        baselineReturns.push(baseReturn);

        allRows.push({
          time: candles[i].time,
          pair,
          close: candles[i].close,
          atr: currentATR,
          hurst,
          predatorRank,
          preyRank,
          gate1,
          gate2,
          gate3,
          session: getSession(candles[i].time),
          rollingVol,
          mfe8: mfe,
          mae8: mae,
          isPerfectTrade: isPerfect,
          futureReturn4H: futureReturn,
        });
      }
    }

    console.log(`[ALPHA DISCOVERY] Built ${allRows.length} feature rows, ${allRows.filter(r => r.isPerfectTrade === 1).length} perfect trades`);

    if (allRows.length < 100) {
      return new Response(
        JSON.stringify({ error: "Insufficient data for ML discovery", rowCount: allRows.length }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Step 3: Build feature matrix & train Decision Tree ──
    const features = allRows.map(r => [
      r.predatorRank, r.preyRank,
      r.gate1 ? 1 : 0, r.gate2 ? 1 : 0, r.gate3 ? 1 : 0,
      r.session, r.atr, r.hurst, r.rollingVol,
    ]);
    const labels = allRows.map(r => r.isPerfectTrade);

    console.log(`[ALPHA DISCOVERY] Training Decision Tree (max_depth=${maxDepth}, samples=${features.length})`);
    const tree = buildTree(features, labels, 0, maxDepth, 10);

    // ── Step 4: Extract high-probability leaf paths ──
    const leafPaths = extractLeafPaths(tree);
    const highProbPaths = leafPaths
      .filter(lp => lp.winRate >= minWinRate && lp.samples >= 20)
      .sort((a, b) => b.winRate - a.winRate);

    console.log(`[ALPHA DISCOVERY] Found ${highProbPaths.length} paths with ≥${(minWinRate * 100).toFixed(0)}% win rate`);

    // ── Step 5: Simulate each rule & compute correlation ──
    const baseEquity: number[] = [];
    let baseEq = 1000;
    for (const br of baselineReturns) {
      baseEq += br * 10000 * 0.001;
      baseEquity.push(baseEq);
    }
    // Compute baseline daily returns
    const baseDailyReturns: number[] = [];
    const step = 48; // ~1 day of M30 bars
    for (let i = step; i < baseEquity.length; i += step) {
      baseDailyReturns.push((baseEquity[i] - baseEquity[i - step]) / baseEquity[i - step]);
    }

    const discoveredRules: DiscoveredRule[] = [];

    for (const path of highProbPaths) {
      const sim = simulateRule(allRows, path.conditions);
      if (sim.trades < 15) continue;

      // Compute daily returns for this rule
      const ruleDailyReturns: number[] = [];
      for (let i = step; i < sim.equityCurve.length; i += step) {
        ruleDailyReturns.push(
          (sim.equityCurve[i] - sim.equityCurve[i - step]) / sim.equityCurve[i - step]
        );
      }

      const corr = Math.abs(pearsonCorrelation(baseDailyReturns, ruleDailyReturns));

      const pf = sim.grossLoss > 0 ? sim.grossProfit / sim.grossLoss : sim.grossProfit > 0 ? 999 : 0;

      const conditions = path.conditions.map(c => ({
        feature: FEATURE_NAMES[c.featureIndex],
        operator: c.operator,
        threshold: c.threshold,
      }));

      discoveredRules.push({
        conditions,
        winRate: path.winRate,
        samples: path.samples,
        profitFactor: Math.round(pf * 100) / 100,
        totalPips: Math.round(sim.totalPips * 10) / 10,
        trades: sim.trades,
        equityCurve: sim.equityCurve.length > 200
          ? sim.equityCurve.filter((_, i) => i % Math.ceil(sim.equityCurve.length / 200) === 0)
          : sim.equityCurve,
        correlationToBase: Math.round(corr * 1000) / 1000,
        plainEnglish: conditionsToEnglish(path.conditions),
      });
    }

    // ── Step 6: Filter by correlation & sort ──
    const uncorrelatedRules = discoveredRules
      .filter(r => r.correlationToBase <= maxCorrelation && r.profitFactor > 1.0)
      .sort((a, b) => {
        // Sort by PF * WR composite score
        const scoreA = a.profitFactor * a.winRate;
        const scoreB = b.profitFactor * b.winRate;
        return scoreB - scoreA;
      })
      .slice(0, 10); // Top 10

    // Also return all rules (before correlation filter) for transparency
    const allRulesSorted = discoveredRules
      .sort((a, b) => b.profitFactor * b.winRate - a.profitFactor * a.winRate)
      .slice(0, 20);

    console.log(`[ALPHA DISCOVERY] ${uncorrelatedRules.length} uncorrelated rules (corr ≤ ${maxCorrelation}), ${discoveredRules.length} total rules discovered`);

    // Tree structure for visualization
    const treeStats = {
      totalLeaves: leafPaths.length,
      highProbLeaves: highProbPaths.length,
      maxDepthReached: maxDepth,
      totalSamples: allRows.length,
      perfectTradeRate: (allRows.filter(r => r.isPerfectTrade === 1).length / allRows.length * 100).toFixed(2),
    };

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        environment,
        dataPoints: allRows.length,
        treeStats,
        featureNames: FEATURE_NAMES,
        featureLabels: FEATURE_LABELS,
        uncorrelatedRules,
        allRules: allRulesSorted,
        baselineEquityCurve: baseEquity.length > 200
          ? baseEquity.filter((_, i) => i % Math.ceil(baseEquity.length / 200) === 0)
          : baseEquity,
        config: { maxDepth, minWinRate, maxCorrelation, candleCount },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[ALPHA DISCOVERY] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
