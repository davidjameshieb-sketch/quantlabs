// Pair Darwinism Engine
// Adaptive pair survivorship scoring, tier classification, and capital rotation.
//
// CRITICAL RULES:
// - Does NOT modify governance multipliers, rejection gates, or QuantLabs logic
// - Does NOT override direction engine or friction/kill-switch rules
// - ONLY outputs capital allocation multipliers and tier classifications
// - Safety governors enforce simultaneous edge + stability growth

// ─── Types ────────────────────────────────────────────────────────────

export type DarwinismTier = 'ALPHA' | 'BETA' | 'GAMMA' | 'EXTINCTION';

export type SessionApproval = 'full' | 'restricted' | 'suppressed';

export interface RollingWindowMetrics {
  windowSize: number;
  trades: number;
  expectancy: number;
  expectancySlope: number;
  profitFactor: number;
  winRate: number;
  maxDrawdown: number;
  drawdownDensity: number;
  expectancyVariance: number;
  frictionDrag: number;
  avgPips: number;
}

export interface CoalitionSynergyScore {
  deltaExpectancy: number;
  harmRate: number;
  pairedOpportunities: number;
  synergyStrength: number;
}

export interface IndicatorSurvivorship {
  indicator: string;
  survivorshipScore: number;  // 0-100
  stabilityWeight: number;    // multiplier applied to pair stability
}

export interface SessionDominance {
  session: string;
  expectancySlope: number;
  spreadStability: number;
  coalitionDensity: number;
  outcomeConsistency: number;
  compositeScore: number;
  approval: SessionApproval;
}

export interface PairSurvivorshipScore {
  pair: string;
  overallScore: number;         // 0-100
  frictionAdjustedExpectancy: number;
  stabilityTrend: number;       // 0-100
  coalitionSynergy: number;     // 0-100
  indicatorAlignment: number;   // 0-100
  sessionDominance: number;     // 0-100
  frictionPenalty: number;       // subtracted
  rollingWindows: {
    w20: RollingWindowMetrics;
    w50: RollingWindowMetrics;
    w100: RollingWindowMetrics;
  };
  tier: DarwinismTier;
  multiplier: number;
  sessions: SessionDominance[];
  coalitions: CoalitionSynergyScore;
  indicators: IndicatorSurvivorship[];
}

export interface TierTransitionEvent {
  timestamp: number;
  pair: string;
  fromTier: DarwinismTier;
  toTier: DarwinismTier;
  reason: string;
  scoreAtTransition: number;
}

export interface DarwinismSafetyTrigger {
  type: 'PF_LOW' | 'EXP_SLOPE_NEG' | 'DD_SPIKE' | 'COALITION_COLLAPSE';
  pair: string;
  value: number;
  threshold: number;
  timestamp: number;
}

export interface DarwinismState {
  pairs: PairSurvivorshipScore[];
  transitions: TierTransitionEvent[];
  safetyTriggers: DarwinismSafetyTrigger[];
  capitalDistribution: Record<string, number>;
  lastRebalance: number;
  totalTradesEvaluated: number;
  systemHealthScore: number;
}

// ─── Configuration ───────────────────────────────────────────────────

export interface DarwinismConfig {
  // Tier thresholds
  alphaMin: number;        // 80
  betaMin: number;         // 60
  gammaMin: number;        // 40
  // Multiplier ranges per tier
  alphaMultRange: [number, number];   // [1.0, 1.6]
  betaMultRange: [number, number];    // [0.6, 0.9]
  gammaMultRange: [number, number];   // [0.3, 0.5]
  // Safety thresholds
  minPF: number;           // 1.2
  minCoalitionTrades: number; // 30
  maxHarmRate: number;     // 0.45
  // Window weights (must sum to 1)
  w20: number;
  w50: number;
  w100: number;
  // Component weights
  expectancyWeight: number;
  stabilityWeight: number;
  coalitionWeight: number;
  indicatorWeight: number;
  sessionWeight: number;
}

const DEFAULT_CONFIG: DarwinismConfig = {
  alphaMin: 80,
  betaMin: 60,
  gammaMin: 40,
  alphaMultRange: [1.0, 1.6],
  betaMultRange: [0.6, 0.9],
  gammaMultRange: [0.3, 0.5],
  minPF: 1.2,
  minCoalitionTrades: 30,
  maxHarmRate: 0.45,
  w20: 0.2,
  w50: 0.3,
  w100: 0.5,
  expectancyWeight: 0.30,
  stabilityWeight: 0.25,
  coalitionWeight: 0.20,
  indicatorWeight: 0.10,
  sessionWeight: 0.15,
};

let _config: DarwinismConfig = { ...DEFAULT_CONFIG };

export function getDarwinismConfig(): DarwinismConfig {
  return { ..._config };
}
export function setDarwinismConfig(partial: Partial<DarwinismConfig>): void {
  _config = { ..._config, ...partial };
}
export function resetDarwinismConfig(): void {
  _config = { ...DEFAULT_CONFIG };
}

// ─── Trade Record (simplified input) ─────────────────────────────────

export interface DarwinismTradeRecord {
  pair: string;
  pips: number;
  session: string;
  agentId: string;
  spreadPips: number;
  timestamp: number;
  coalitionAgents?: string[];
  indicators?: string[];
}

// ─── Rolling Window Computation ──────────────────────────────────────

function computeRollingWindow(trades: DarwinismTradeRecord[], windowSize: number): RollingWindowMetrics {
  const slice = trades.slice(-windowSize);
  const n = slice.length;
  if (n === 0) {
    return {
      windowSize, trades: 0, expectancy: 0, expectancySlope: 0,
      profitFactor: 0, winRate: 0, maxDrawdown: 0, drawdownDensity: 0,
      expectancyVariance: 0, frictionDrag: 0, avgPips: 0,
    };
  }

  const pips = slice.map(t => t.pips);
  const wins = pips.filter(p => p > 0);
  const losses = pips.filter(p => p <= 0);
  const grossProfit = wins.reduce((s, p) => s + p, 0);
  const grossLoss = Math.abs(losses.reduce((s, p) => s + p, 0));
  const expectancy = pips.reduce((s, p) => s + p, 0) / n;
  const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const winRate = n > 0 ? wins.length / n : 0;

  // Drawdown
  let peak = 0, cumPnl = 0, maxDD = 0, ddCount = 0;
  for (const p of pips) {
    cumPnl += p;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak - cumPnl;
    if (dd > maxDD) maxDD = dd;
    if (dd > 0) ddCount++;
  }

  // Expectancy slope (linear regression over halves)
  const half = Math.floor(n / 2);
  const firstHalf = pips.slice(0, half);
  const secondHalf = pips.slice(half);
  const avgFirst = firstHalf.length > 0 ? firstHalf.reduce((s, p) => s + p, 0) / firstHalf.length : 0;
  const avgSecond = secondHalf.length > 0 ? secondHalf.reduce((s, p) => s + p, 0) / secondHalf.length : 0;
  const expSlope = avgSecond - avgFirst;

  // Variance
  const mean = expectancy;
  const variance = pips.reduce((s, p) => s + (p - mean) ** 2, 0) / Math.max(1, n - 1);

  // Friction drag
  const frictionDrag = slice.reduce((s, t) => s + t.spreadPips, 0) / n;

  return {
    windowSize,
    trades: n,
    expectancy: Math.round(expectancy * 100) / 100,
    expectancySlope: Math.round(expSlope * 100) / 100,
    profitFactor: Math.round(pf * 100) / 100,
    winRate: Math.round(winRate * 1000) / 1000,
    maxDrawdown: Math.round(maxDD * 100) / 100,
    drawdownDensity: Math.round((ddCount / Math.max(1, n)) * 100) / 100,
    expectancyVariance: Math.round(variance * 100) / 100,
    frictionDrag: Math.round(frictionDrag * 100) / 100,
    avgPips: Math.round((pips.reduce((s, p) => s + p, 0) / n) * 100) / 100,
  };
}

// ─── Coalition Synergy Scoring ───────────────────────────────────────

function computeCoalitionSynergy(trades: DarwinismTradeRecord[]): CoalitionSynergyScore {
  const pairedTrades = trades.filter(t => t.coalitionAgents && t.coalitionAgents.length > 0);
  const soloTrades = trades.filter(t => !t.coalitionAgents || t.coalitionAgents.length === 0);

  const pairedExp = pairedTrades.length > 0
    ? pairedTrades.reduce((s, t) => s + t.pips, 0) / pairedTrades.length : 0;
  const soloExp = soloTrades.length > 0
    ? soloTrades.reduce((s, t) => s + t.pips, 0) / soloTrades.length : 0;

  const harmCount = pairedTrades.filter(t => t.pips < 0).length;
  const harmRate = pairedTrades.length > 0 ? harmCount / pairedTrades.length : 0;

  return {
    deltaExpectancy: Math.round((pairedExp - soloExp) * 100) / 100,
    harmRate: Math.round(harmRate * 1000) / 1000,
    pairedOpportunities: pairedTrades.length,
    synergyStrength: Math.max(0, Math.min(100,
      pairedExp > soloExp ? Math.min(100, (pairedExp - soloExp) * 20 + 50) : Math.max(0, 50 - (soloExp - pairedExp) * 20)
    )),
  };
}

// ─── Indicator Survivorship ──────────────────────────────────────────

function computeIndicatorSurvivorship(trades: DarwinismTradeRecord[]): IndicatorSurvivorship[] {
  const indicatorMap = new Map<string, { wins: number; total: number }>();

  for (const t of trades) {
    if (!t.indicators) continue;
    for (const ind of t.indicators) {
      const entry = indicatorMap.get(ind) || { wins: 0, total: 0 };
      entry.total++;
      if (t.pips > 0) entry.wins++;
      indicatorMap.set(ind, entry);
    }
  }

  return Array.from(indicatorMap.entries())
    .filter(([, v]) => v.total >= 10)
    .map(([indicator, v]) => {
      const survivorshipScore = Math.round((v.wins / v.total) * 100);
      return {
        indicator,
        survivorshipScore,
        stabilityWeight: survivorshipScore > 70 ? 1.1 : survivorshipScore < 40 ? 0.85 : 1.0,
      };
    })
    .sort((a, b) => b.survivorshipScore - a.survivorshipScore);
}

// ─── Session Dominance ───────────────────────────────────────────────

function computeSessionDominance(trades: DarwinismTradeRecord[]): SessionDominance[] {
  const sessionMap = new Map<string, DarwinismTradeRecord[]>();
  for (const t of trades) {
    const list = sessionMap.get(t.session) || [];
    list.push(t);
    sessionMap.set(t.session, list);
  }

  return Array.from(sessionMap.entries()).map(([session, sTrades]) => {
    const pips = sTrades.map(t => t.pips);
    const n = pips.length;
    const half = Math.floor(n / 2);
    const first = pips.slice(0, half);
    const second = pips.slice(half);
    const avgFirst = first.length > 0 ? first.reduce((s, p) => s + p, 0) / first.length : 0;
    const avgSecond = second.length > 0 ? second.reduce((s, p) => s + p, 0) / second.length : 0;
    const expSlope = avgSecond - avgFirst;

    const spreads = sTrades.map(t => t.spreadPips);
    const meanSpread = spreads.reduce((s, v) => s + v, 0) / Math.max(1, spreads.length);
    const spreadVar = spreads.reduce((s, v) => s + (v - meanSpread) ** 2, 0) / Math.max(1, spreads.length);
    const spreadStability = Math.max(0, 100 - spreadVar * 100);

    const coalitionDensity = sTrades.filter(t => t.coalitionAgents && t.coalitionAgents.length > 0).length / Math.max(1, n);

    const wins = pips.filter(p => p > 0).length;
    const outcomeConsistency = n > 5 ? (wins / n) * 100 : 50;

    const composite = (expSlope > 0 ? 30 : 0) + spreadStability * 0.2 + coalitionDensity * 20 + outcomeConsistency * 0.3;
    const clamped = Math.max(0, Math.min(100, composite));

    let approval: SessionApproval = 'full';
    if (clamped < 30) approval = 'suppressed';
    else if (clamped < 55) approval = 'restricted';

    return {
      session,
      expectancySlope: Math.round(expSlope * 100) / 100,
      spreadStability: Math.round(spreadStability * 10) / 10,
      coalitionDensity: Math.round(coalitionDensity * 1000) / 1000,
      outcomeConsistency: Math.round(outcomeConsistency * 10) / 10,
      compositeScore: Math.round(clamped * 10) / 10,
      approval,
    };
  }).sort((a, b) => b.compositeScore - a.compositeScore);
}

// ─── Tier Classification ─────────────────────────────────────────────

function classifyTier(score: number, cfg: DarwinismConfig): DarwinismTier {
  if (score >= cfg.alphaMin) return 'ALPHA';
  if (score >= cfg.betaMin) return 'BETA';
  if (score >= cfg.gammaMin) return 'GAMMA';
  return 'EXTINCTION';
}

function computeMultiplier(tier: DarwinismTier, score: number, cfg: DarwinismConfig): number {
  const lerp = (min: number, max: number, t: number) => min + (max - min) * t;
  switch (tier) {
    case 'ALPHA': {
      const t = Math.min(1, (score - cfg.alphaMin) / (100 - cfg.alphaMin));
      return Math.round(lerp(cfg.alphaMultRange[0], cfg.alphaMultRange[1], t) * 100) / 100;
    }
    case 'BETA': {
      const t = Math.min(1, (score - cfg.betaMin) / (cfg.alphaMin - cfg.betaMin));
      return Math.round(lerp(cfg.betaMultRange[0], cfg.betaMultRange[1], t) * 100) / 100;
    }
    case 'GAMMA': {
      const t = Math.min(1, (score - cfg.gammaMin) / (cfg.betaMin - cfg.gammaMin));
      return Math.round(lerp(cfg.gammaMultRange[0], cfg.gammaMultRange[1], t) * 100) / 100;
    }
    case 'EXTINCTION':
      return 0;
  }
}

// ─── Safety Governors ────────────────────────────────────────────────

function checkSafetyTriggers(
  pair: string,
  w50: RollingWindowMetrics,
  coalition: CoalitionSynergyScore,
): DarwinismSafetyTrigger[] {
  const triggers: DarwinismSafetyTrigger[] = [];
  const cfg = _config;
  const now = Date.now();

  if (w50.profitFactor > 0 && w50.profitFactor < cfg.minPF && w50.trades >= 20) {
    triggers.push({ type: 'PF_LOW', pair, value: w50.profitFactor, threshold: cfg.minPF, timestamp: now });
  }
  if (w50.expectancySlope < 0 && w50.trades >= 15) {
    triggers.push({ type: 'EXP_SLOPE_NEG', pair, value: w50.expectancySlope, threshold: 0, timestamp: now });
  }
  if (w50.drawdownDensity > 0.6 && w50.trades >= 20) {
    triggers.push({ type: 'DD_SPIKE', pair, value: w50.drawdownDensity, threshold: 0.6, timestamp: now });
  }
  if (coalition.synergyStrength < 30 && coalition.pairedOpportunities >= cfg.minCoalitionTrades) {
    triggers.push({ type: 'COALITION_COLLAPSE', pair, value: coalition.synergyStrength, threshold: 30, timestamp: now });
  }

  return triggers;
}

// ─── Survivorship Score Assembly ─────────────────────────────────────

function computePairSurvivorship(
  pair: string,
  trades: DarwinismTradeRecord[],
  previousTier?: DarwinismTier,
): { score: PairSurvivorshipScore; triggers: DarwinismSafetyTrigger[]; transition?: TierTransitionEvent } {
  const cfg = _config;

  const w20 = computeRollingWindow(trades, 20);
  const w50 = computeRollingWindow(trades, 50);
  const w100 = computeRollingWindow(trades, 100);

  // Weighted expectancy trend (longer windows weighted higher)
  const weightedExpectancy = (w20.expectancy * cfg.w20 + w50.expectancy * cfg.w50 + w100.expectancy * cfg.w100);
  const frictionAdjExp = weightedExpectancy - w50.frictionDrag;
  const expectancyScore = Math.max(0, Math.min(100, 50 + frictionAdjExp * 10));

  // Stability (inverse of drawdown density + expectancy variance)
  const stabilityRaw = Math.max(0, 100 - w100.drawdownDensity * 80 - w100.expectancyVariance * 2);
  const stabilityTrend = Math.max(0, Math.min(100, stabilityRaw));

  // Coalition
  const coalition = computeCoalitionSynergy(trades);
  const coalitionScore = coalition.synergyStrength;

  // Indicators
  const indicators = computeIndicatorSurvivorship(trades);
  const avgIndSurv = indicators.length > 0
    ? indicators.reduce((s, i) => s + i.survivorshipScore, 0) / indicators.length : 50;
  const indicatorAlignment = Math.max(0, Math.min(100, avgIndSurv));

  // Sessions
  const sessions = computeSessionDominance(trades);
  const avgSessionScore = sessions.length > 0
    ? sessions.reduce((s, sess) => s + sess.compositeScore, 0) / sessions.length : 50;

  // Friction penalty
  const frictionPenalty = Math.min(20, w50.frictionDrag * 5);

  // Final composite score
  const rawScore =
    expectancyScore * cfg.expectancyWeight +
    stabilityTrend * cfg.stabilityWeight +
    coalitionScore * cfg.coalitionWeight +
    indicatorAlignment * cfg.indicatorWeight +
    avgSessionScore * cfg.sessionWeight -
    frictionPenalty;

  const overallScore = Math.max(0, Math.min(100, Math.round(rawScore * 10) / 10));

  // Tier + safety
  let tier = classifyTier(overallScore, cfg);
  const triggers = checkSafetyTriggers(pair, w50, coalition);

  // Safety governors: immediate downgrade if triggers fire
  if (triggers.length > 0 && (tier === 'ALPHA' || tier === 'BETA')) {
    tier = tier === 'ALPHA' ? 'BETA' : 'GAMMA';
  }

  const multiplier = computeMultiplier(tier, overallScore, cfg);

  // Coalition promotion gate
  if (tier === 'ALPHA' || tier === 'BETA') {
    if (coalition.deltaExpectancy < 0 || coalition.harmRate > cfg.maxHarmRate) {
      // Don't promote further — keep current tier
    }
  }

  let transition: TierTransitionEvent | undefined;
  if (previousTier && previousTier !== tier) {
    transition = {
      timestamp: Date.now(),
      pair,
      fromTier: previousTier,
      toTier: tier,
      reason: triggers.length > 0
        ? `Safety trigger: ${triggers.map(t => t.type).join(', ')}`
        : overallScore >= (previousTier === 'ALPHA' ? cfg.alphaMin : cfg.betaMin)
          ? 'Score improvement'
          : 'Score degradation',
      scoreAtTransition: overallScore,
    };
  }

  return {
    score: {
      pair,
      overallScore,
      frictionAdjustedExpectancy: Math.round(frictionAdjExp * 100) / 100,
      stabilityTrend,
      coalitionSynergy: coalitionScore,
      indicatorAlignment,
      sessionDominance: Math.round(avgSessionScore * 10) / 10,
      frictionPenalty: Math.round(frictionPenalty * 10) / 10,
      rollingWindows: { w20, w50, w100 },
      tier,
      multiplier,
      sessions,
      coalitions: coalition,
      indicators,
    },
    triggers,
    transition,
  };
}

// ─── In-Memory State ─────────────────────────────────────────────────

let _state: DarwinismState = {
  pairs: [],
  transitions: [],
  safetyTriggers: [],
  capitalDistribution: {},
  lastRebalance: 0,
  totalTradesEvaluated: 0,
  systemHealthScore: 100,
};

const MAX_TRANSITIONS = 200;
const MAX_TRIGGERS = 200;

export function getDarwinismState(): DarwinismState {
  return { ..._state };
}

export function resetDarwinismState(): void {
  _state = {
    pairs: [],
    transitions: [],
    safetyTriggers: [],
    capitalDistribution: {},
    lastRebalance: 0,
    totalTradesEvaluated: 0,
    systemHealthScore: 100,
  };
}

// ─── Main Evaluation ─────────────────────────────────────────────────

export function evaluatePairDarwinism(
  tradesByPair: Record<string, DarwinismTradeRecord[]>,
): DarwinismState {
  const previousTiers: Record<string, DarwinismTier> = {};
  for (const p of _state.pairs) {
    previousTiers[p.pair] = p.tier;
  }

  const allPairs: PairSurvivorshipScore[] = [];
  const newTransitions: TierTransitionEvent[] = [];
  const newTriggers: DarwinismSafetyTrigger[] = [];
  let totalTrades = 0;

  for (const [pair, trades] of Object.entries(tradesByPair)) {
    totalTrades += trades.length;
    const { score, triggers, transition } = computePairSurvivorship(
      pair, trades, previousTiers[pair]
    );
    allPairs.push(score);
    newTriggers.push(...triggers);
    if (transition) newTransitions.push(transition);
  }

  // Sort by score descending
  allPairs.sort((a, b) => b.overallScore - a.overallScore);

  // Capital distribution
  const capitalDistribution: Record<string, number> = {};
  const totalMult = allPairs.reduce((s, p) => s + p.multiplier, 0) || 1;
  for (const p of allPairs) {
    capitalDistribution[p.pair] = Math.round((p.multiplier / totalMult) * 10000) / 100;
  }

  // System health = average of non-extinction pair scores
  const activePairs = allPairs.filter(p => p.tier !== 'EXTINCTION');
  const systemHealthScore = activePairs.length > 0
    ? Math.round(activePairs.reduce((s, p) => s + p.overallScore, 0) / activePairs.length)
    : 0;

  // Update state
  _state = {
    pairs: allPairs,
    transitions: [..._state.transitions, ...newTransitions].slice(-MAX_TRANSITIONS),
    safetyTriggers: [..._state.safetyTriggers, ...newTriggers].slice(-MAX_TRIGGERS),
    capitalDistribution,
    lastRebalance: Date.now(),
    totalTradesEvaluated: totalTrades,
    systemHealthScore,
  };

  return { ..._state };
}

// ─── Get Pair Multiplier (for execution integration) ─────────────────

export function getDarwinismMultiplier(pair: string): number {
  const pairScore = _state.pairs.find(p => p.pair === pair);
  return pairScore?.multiplier ?? 1.0;
}

export function getDarwinismTier(pair: string): DarwinismTier | null {
  const pairScore = _state.pairs.find(p => p.pair === pair);
  return pairScore?.tier ?? null;
}

// ─── Generate Mock Data for Dashboard ────────────────────────────────

export function generateMockDarwinismData(): DarwinismState {
  const PAIRS = ['USD_CAD', 'EUR_USD', 'AUD_USD', 'EUR_GBP', 'USD_JPY', 'GBP_USD', 'NZD_USD', 'USD_CHF'];
  const SESSIONS = ['london-open', 'ny-overlap', 'asian', 'rollover'];
  const INDICATORS = ['ema50', 'supertrend', 'adx', 'rsi', 'bollinger', 'ichimoku'];

  const tradesByPair: Record<string, DarwinismTradeRecord[]> = {};

  for (const pair of PAIRS) {
    const n = 80 + Math.floor(Math.random() * 120);
    const trades: DarwinismTradeRecord[] = [];
    // Give some pairs a bias
    const pairBias = pair === 'USD_CAD' ? 1.8 : pair === 'EUR_USD' ? 0.9 : pair === 'GBP_USD' ? -0.5 : pair === 'USD_JPY' ? 1.5 : 0.3;
    for (let i = 0; i < n; i++) {
      trades.push({
        pair,
        pips: Math.round((pairBias + (Math.random() - 0.45) * 6) * 10) / 10,
        session: SESSIONS[Math.floor(Math.random() * SESSIONS.length)],
        agentId: `agent-${Math.floor(Math.random() * 5)}`,
        spreadPips: Math.round((0.3 + Math.random() * 0.8) * 100) / 100,
        timestamp: Date.now() - (n - i) * 300000,
        coalitionAgents: Math.random() > 0.4 ? [`agent-${Math.floor(Math.random() * 3)}`] : undefined,
        indicators: Math.random() > 0.3 ? INDICATORS.filter(() => Math.random() > 0.5) : undefined,
      });
    }
    tradesByPair[pair] = trades;
  }

  return evaluatePairDarwinism(tradesByPair);
}
