// Discovery Risk Mode Engine
// Risk allocation overlay on top of governance + QuantLabs pipeline.
//
// CRITICAL RULES:
// - Does NOT modify governance multipliers or rejection gates
// - Does NOT modify QuantLabs directional logic
// - Does NOT alter composite score calculations
// - ONLY adjusts trade blocking and position sizing
// - Shadow edge evaluation continues unaffected

// ─── Configuration ───────────────────────────────────────────

export interface DiscoveryRiskConfig {
  enabled: boolean;
  edgeBoostMultiplier: number;
  baselineReductionMultiplier: number;
  spreadBlockThreshold: number;        // pips
  ignitionMinComposite: number;
}

const DEFAULT_CONFIG: DiscoveryRiskConfig = {
  enabled: true,
  edgeBoostMultiplier: 1.35,
  baselineReductionMultiplier: 0.55,
  spreadBlockThreshold: 1.0,
  ignitionMinComposite: 0.75,
};

let _config: DiscoveryRiskConfig = { ...DEFAULT_CONFIG };

export function getDiscoveryRiskConfig(): DiscoveryRiskConfig {
  return { ..._config };
}

export function setDiscoveryRiskConfig(partial: Partial<DiscoveryRiskConfig>): void {
  _config = { ..._config, ...partial };
}

export function resetDiscoveryRiskConfig(): void {
  _config = { ...DEFAULT_CONFIG };
}

// ─── Environment Classification ─────────────────────────────

export type RiskLabel = 'BLOCKED' | 'REDUCED' | 'NORMAL' | 'EDGE_BOOST';

export interface EnvironmentClassification {
  isEdgeCandidate: boolean;
  isHistoricallyDestructive: boolean;
  environmentLabel: string;
  matchedEdgeRule: string | null;
  matchedDestructiveRule: string | null;
}

export interface RiskAllocation {
  blocked: boolean;
  positionSizeMultiplier: number;
  riskLabel: RiskLabel;
}

export interface DiscoveryRiskDecision {
  environmentLabel: string;
  isEdgeCandidate: boolean;
  isHistoricallyDestructive: boolean;
  riskLabel: RiskLabel;
  multiplierApplied: number;
  blockedByDiscoveryRisk: boolean;
}

// ─── AUD Cross Detection ─────────────────────────────────────

const AUD_CROSSES = [
  'AUD_JPY', 'AUD_USD', 'AUD_NZD', 'AUD_CAD', 'AUD_CHF',
  'EUR_AUD', 'GBP_AUD',
];

function isAudCross(symbol: string): boolean {
  const normalized = symbol.replace('/', '_').toUpperCase();
  return AUD_CROSSES.some(pair => normalized === pair || normalized === pair.replace('_', ''));
}

// ─── Edge Candidate Rules ─────────────────────────────────────

interface EnvironmentContext {
  symbol: string;
  session: string;
  regime: string;
  direction: string;
  compositeScore: number;
  spreadPips: number;
  agentId: string;
}

const EDGE_CANDIDATE_RULES: Array<{
  id: string;
  label: string;
  test: (ctx: EnvironmentContext) => boolean;
}> = [
  {
    id: 'ny_expansion_long',
    label: 'NY Overlap + Expansion + Long',
    test: (ctx) =>
      (ctx.session === 'ny-overlap' || ctx.session === 'ny') &&
      (ctx.regime === 'expansion' || ctx.regime === 'trending') &&
      ctx.direction === 'long',
  },
  {
    id: 'asian_usdcad_expansion_long',
    label: 'Asian + USD_CAD + Expansion + Long',
    test: (ctx) =>
      (ctx.session === 'asian' || ctx.session === 'asia' || ctx.session === 'tokyo') &&
      ctx.symbol.replace('/', '_').toUpperCase() === 'USD_CAD' &&
      (ctx.regime === 'expansion' || ctx.regime === 'trending') &&
      ctx.direction === 'long',
  },
  {
    id: 'london_audusd_expansion_long',
    label: 'London Open + AUD_USD + Expansion + Long',
    test: (ctx) =>
      (ctx.session === 'london-open' || ctx.session === 'london') &&
      ctx.symbol.replace('/', '_').toUpperCase() === 'AUD_USD' &&
      (ctx.regime === 'expansion' || ctx.regime === 'trending') &&
      ctx.direction === 'long',
  },
  {
    id: 'eurgbp_long',
    label: 'EUR_GBP + Long',
    test: (ctx) =>
      ctx.symbol.replace('/', '_').toUpperCase() === 'EUR_GBP' &&
      ctx.direction === 'long',
  },
  {
    id: 'usdjpy_compression',
    label: 'USD_JPY + Compression',
    test: (ctx) =>
      ctx.symbol.replace('/', '_').toUpperCase() === 'USD_JPY' &&
      (ctx.regime === 'compression' || ctx.regime === 'ranging'),
  },
];

// ─── Historically Destructive Rules ──────────────────────────

const DESTRUCTIVE_RULES: Array<{
  id: string;
  label: string;
  test: (ctx: EnvironmentContext, cfg: DiscoveryRiskConfig) => boolean;
}> = [
  {
    id: 'aud_cross',
    label: 'AUD cross pair',
    test: (ctx) => isAudCross(ctx.symbol),
  },
  {
    id: 'gbp_usd',
    label: 'GBP_USD',
    test: (ctx) => ctx.symbol.replace('/', '_').toUpperCase() === 'GBP_USD',
  },
  {
    id: 'gbp_jpy',
    label: 'GBP_JPY',
    test: (ctx) => ctx.symbol.replace('/', '_').toUpperCase() === 'GBP_JPY',
  },
  {
    id: 'sentiment_reactor',
    label: 'Agent: sentiment-reactor',
    test: (ctx) => ctx.agentId === 'sentiment-reactor',
  },
  {
    id: 'range_navigator',
    label: 'Agent: range-navigator',
    test: (ctx) => ctx.agentId === 'range-navigator',
  },
  {
    id: 'rollover_short',
    label: 'Rollover + Short',
    test: (ctx) =>
      ctx.session === 'rollover' && ctx.direction === 'short',
  },
  {
    id: 'high_spread',
    label: 'Spread > threshold',
    test: (ctx, cfg) => ctx.spreadPips > cfg.spreadBlockThreshold,
  },
  {
    id: 'ignition_low_composite',
    label: 'Ignition + Low Composite',
    test: (ctx, cfg) =>
      ctx.regime === 'ignition' && ctx.compositeScore < cfg.ignitionMinComposite,
  },
];

// ─── Classification Function ─────────────────────────────────

export function classifyTradeEnvironment(
  symbol: string,
  session: string,
  regime: string,
  direction: string,
  compositeScore: number,
  spreadPips: number,
  agentId: string,
): EnvironmentClassification {
  const cfg = _config;
  const ctx: EnvironmentContext = {
    symbol, session, regime, direction,
    compositeScore, spreadPips, agentId,
  };

  let matchedEdgeRule: string | null = null;
  let matchedDestructiveRule: string | null = null;

  for (const rule of EDGE_CANDIDATE_RULES) {
    if (rule.test(ctx)) {
      matchedEdgeRule = rule.label;
      break;
    }
  }

  for (const rule of DESTRUCTIVE_RULES) {
    if (rule.test(ctx, cfg)) {
      matchedDestructiveRule = rule.label;
      break;
    }
  }

  const isEdgeCandidate = matchedEdgeRule !== null;
  const isHistoricallyDestructive = matchedDestructiveRule !== null;

  const parts = [session, regime, symbol.replace('/', '_'), direction];
  const environmentLabel = parts.join(' | ');

  return {
    isEdgeCandidate,
    isHistoricallyDestructive,
    environmentLabel,
    matchedEdgeRule,
    matchedDestructiveRule,
  };
}

// ─── Risk Allocation Function ────────────────────────────────

export function applyDiscoveryRiskAllocation(
  classification: EnvironmentClassification,
): RiskAllocation {
  const cfg = _config;

  if (!cfg.enabled) {
    return { blocked: false, positionSizeMultiplier: 1.0, riskLabel: 'NORMAL' };
  }

  if (classification.isHistoricallyDestructive) {
    return { blocked: true, positionSizeMultiplier: 0, riskLabel: 'BLOCKED' };
  }

  if (classification.isEdgeCandidate) {
    return {
      blocked: false,
      positionSizeMultiplier: cfg.edgeBoostMultiplier,
      riskLabel: 'EDGE_BOOST',
    };
  }

  return {
    blocked: false,
    positionSizeMultiplier: cfg.baselineReductionMultiplier,
    riskLabel: 'REDUCED',
  };
}

// ─── Combined Decision ───────────────────────────────────────

export function evaluateDiscoveryRisk(
  symbol: string,
  session: string,
  regime: string,
  direction: string,
  compositeScore: number,
  spreadPips: number,
  agentId: string,
): DiscoveryRiskDecision {
  const cfg = _config;

  if (!cfg.enabled) {
    return {
      environmentLabel: `${session} | ${regime} | ${symbol} | ${direction}`,
      isEdgeCandidate: false,
      isHistoricallyDestructive: false,
      riskLabel: 'NORMAL',
      multiplierApplied: 1.0,
      blockedByDiscoveryRisk: false,
    };
  }

  const classification = classifyTradeEnvironment(
    symbol, session, regime, direction,
    compositeScore, spreadPips, agentId,
  );

  const allocation = applyDiscoveryRiskAllocation(classification);

  return {
    environmentLabel: classification.environmentLabel,
    isEdgeCandidate: classification.isEdgeCandidate,
    isHistoricallyDestructive: classification.isHistoricallyDestructive,
    riskLabel: allocation.riskLabel,
    multiplierApplied: allocation.positionSizeMultiplier,
    blockedByDiscoveryRisk: allocation.blocked,
  };
}

// ─── In-Memory Discovery Risk Stats (for dashboard) ──────────

export interface DiscoveryRiskStats {
  totalEvaluated: number;
  blockedCount: number;
  edgeBoostedCount: number;
  reducedCount: number;
  normalCount: number;
  blockedByEnvironment: Record<string, number>;
  pnlByRiskLabel: Record<RiskLabel, number>;
  edgeCandidateWinRate: number;
  baselineWinRate: number;
  capitalEfficiencyGain: number;   // % improvement from edge weighting
}

const MAX_DECISION_LOG = 2000;
let _decisionLog: DiscoveryRiskDecision[] = [];
let _pnlByLabel: Record<RiskLabel, number> = { BLOCKED: 0, REDUCED: 0, NORMAL: 0, EDGE_BOOST: 0 };
let _edgeWins = 0;
let _edgeTotal = 0;
let _baseWins = 0;
let _baseTotal = 0;

export function logDiscoveryRiskDecision(
  decision: DiscoveryRiskDecision,
  pnlPips?: number,
  isWin?: boolean,
): void {
  _decisionLog.push(decision);
  if (_decisionLog.length > MAX_DECISION_LOG) {
    _decisionLog = _decisionLog.slice(-MAX_DECISION_LOG);
  }

  if (pnlPips !== undefined) {
    _pnlByLabel[decision.riskLabel] += pnlPips;
  }

  if (isWin !== undefined) {
    if (decision.isEdgeCandidate) {
      _edgeTotal++;
      if (isWin) _edgeWins++;
    } else {
      _baseTotal++;
      if (isWin) _baseWins++;
    }
  }
}

export function getDiscoveryRiskStats(): DiscoveryRiskStats {
  const blockedCount = _decisionLog.filter(d => d.riskLabel === 'BLOCKED').length;
  const edgeBoostedCount = _decisionLog.filter(d => d.riskLabel === 'EDGE_BOOST').length;
  const reducedCount = _decisionLog.filter(d => d.riskLabel === 'REDUCED').length;
  const normalCount = _decisionLog.filter(d => d.riskLabel === 'NORMAL').length;

  const blockedByEnvironment: Record<string, number> = {};
  for (const d of _decisionLog) {
    if (d.blockedByDiscoveryRisk) {
      blockedByEnvironment[d.environmentLabel] = (blockedByEnvironment[d.environmentLabel] || 0) + 1;
    }
  }

  const edgeCandidateWinRate = _edgeTotal > 0 ? _edgeWins / _edgeTotal : 0;
  const baselineWinRate = _baseTotal > 0 ? _baseWins / _baseTotal : 0;

  const edgePnl = _pnlByLabel['EDGE_BOOST'];
  const basePnl = _pnlByLabel['REDUCED'] + _pnlByLabel['NORMAL'];
  const totalPnl = edgePnl + basePnl;
  const capitalEfficiencyGain = totalPnl !== 0 && basePnl !== 0
    ? ((edgePnl / Math.max(1, edgeBoostedCount)) - (basePnl / Math.max(1, reducedCount + normalCount)))
    : 0;

  return {
    totalEvaluated: _decisionLog.length,
    blockedCount,
    edgeBoostedCount,
    reducedCount,
    normalCount,
    blockedByEnvironment,
    pnlByRiskLabel: { ..._pnlByLabel },
    edgeCandidateWinRate,
    baselineWinRate,
    capitalEfficiencyGain,
  };
}

export function clearDiscoveryRiskStats(): void {
  _decisionLog = [];
  _pnlByLabel = { BLOCKED: 0, REDUCED: 0, NORMAL: 0, EDGE_BOOST: 0 };
  _edgeWins = 0;
  _edgeTotal = 0;
  _baseWins = 0;
  _baseTotal = 0;
}
