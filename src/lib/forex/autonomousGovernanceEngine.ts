// Autonomous Governance Evolution Engine
// Three autonomous functions + Continuous Feedback Loop
//
// 1. Autonomous Agent Tiering — instant demotion/promotion based on rolling performance
// 2. Dynamic Gate Calibration — real-time G1-G12 threshold adjustment per regime
// 3. Session-Pair Blacklisting — toxic window detection and auto-blocking
//
// BOUNDARIES (Central Bank reserves):
// - Risk sizing (max drawdown, max position %) — NOT adjustable
// - Global kill-switch — NOT adjustable
// - Capital allocation ceiling — NOT adjustable

// ─── Types ────────────────────────────────────────────────────────

export type AutonomousTier = 'A' | 'B' | 'C' | 'D';

export interface AgentPerformanceSnapshot {
  agentId: string;
  winRate: number;
  expectancy: number;
  profitFactor: number;
  netPips: number;
  tradeCount: number;
  avgMAE: number;           // average Maximum Adverse Excursion in R
  recentWinRate20: number;  // last 20 trades
  recentExpectancy20: number;
  maxConsecutiveLosses: number;
  currentTier: AutonomousTier;
  lastTierChange: number;
}

export interface TierChangeEvent {
  timestamp: number;
  agentId: string;
  fromTier: AutonomousTier;
  toTier: AutonomousTier;
  reason: string;
  triggerMetric: string;
  triggerValue: number;
  triggerThreshold: number;
  autoApplied: boolean;     // true = autonomous, no manual approval
}

// ─── Gate Calibration ─────────────────────────────────────────────

export interface GateOverride {
  gateId: string;
  parameter: string;
  originalValue: number;
  overrideValue: number;
  regime: string;
  reason: string;
  appliedAt: number;
  expiresAt: number | null;  // null = permanent until next recalibration
  autoApplied: boolean;
}

export interface RegimeGateProfile {
  regime: string;
  winRate: number;
  expectancy: number;
  tradeCount: number;
  g11AtrThreshold: number;
  compositeMinimum: number;
  frictionK: number;
  lastCalibration: number;
}

// ─── Session-Pair Blacklisting ────────────────────────────────────

export type BlacklistMode = 'monitoring-only' | 'reduced-sizing' | 'full-block';

export interface SessionPairBlacklist {
  pair: string;
  session: string;
  mode: BlacklistMode;
  reason: string;
  appliedAt: number;
  expiresAt: number;        // auto-expires (8h default for session blocks)
  winRate: number;
  expectancy: number;
  tradeCount: number;
  autoApplied: boolean;
}

// ─── Feedback Loop ────────────────────────────────────────────────

export interface FeedbackEvent {
  timestamp: number;
  tradeId: string;
  agentId: string;
  pair: string;
  direction: string;
  session: string;
  regime: string;
  pnlPips: number;
  won: boolean;
  maeR: number;
  adjustmentsMade: string[];
}

// ─── Engine State ─────────────────────────────────────────────────

interface EngineState {
  agentSnapshots: Map<string, AgentPerformanceSnapshot>;
  tierHistory: TierChangeEvent[];
  activeGateOverrides: GateOverride[];
  activeBlacklists: SessionPairBlacklist[];
  feedbackLog: FeedbackEvent[];
  regimeProfiles: Map<string, RegimeGateProfile>;
  lastEvolutionCycle: number;
  totalFeedbackEvents: number;
}

const _state: EngineState = {
  agentSnapshots: new Map(),
  tierHistory: [],
  activeGateOverrides: [],
  activeBlacklists: [],
  feedbackLog: [],
  regimeProfiles: new Map(),
  lastEvolutionCycle: 0,
  totalFeedbackEvents: 0,
};

// ─── Configuration Thresholds ─────────────────────────────────────

const TIER_THRESHOLDS = {
  // Instant demotion triggers (any ONE fires = immediate tier change)
  demoteToC: {
    maeThreshold: 0.90,         // avg MAE > 0.90R → shadow mode
    maxConsecutiveLosses: 5,    // 5 in a row → shadow mode
    winRateFloor: 0.25,         // WR < 25% over 20 trades → shadow mode
    expectancyFloor: -2.0,      // expectancy < -2.0 pips → shadow mode
    minSampleSize: 10,          // need at least 10 trades to trigger
  },
  demoteToB: {
    winRateFloor: 0.35,         // WR 25-35% → reduced allocation
    expectancyFloor: -0.5,      // negative but recoverable
    minSampleSize: 15,
  },
  promoteToA: {
    winRateMin: 0.50,           // WR >= 50%
    expectancyMin: 0.3,         // positive expectancy
    profitFactorMin: 1.15,      // PF > 1.15
    minSampleSize: 30,          // need 30+ trades
    recoveryThreshold: 0.45,    // for agents recovering from C: need 45% WR
  },
  promoteToB: {
    winRateMin: 0.40,           // WR >= 40%
    expectancyMin: 0.0,         // breakeven or better
    minSampleSize: 20,
  },
} as const;

const GATE_CALIBRATION = {
  // Per-regime dynamic thresholds
  g11AtrStretch: {
    default: 1.8,
    tightenTo: 1.6,              // if regime WR < 40%
    loosenTo: 2.0,               // if regime WR > 60% AND expectancy > 1.0
    triggerWinRate: 0.40,
    triggerSampleSize: 15,
  },
  compositeMinimum: {
    default: 0.72,
    tightenTo: 0.80,             // if regime shows degradation
    loosenTo: 0.65,              // if regime is proven profitable
    triggerWinRate: 0.40,
    triggerSampleSize: 20,
  },
  frictionK: {
    default: 3.0,
    tightenTo: 4.0,              // if friction-related losses > 30%
    loosenTo: 2.5,               // if execution quality consistently > 80
    triggerThreshold: 0.30,
  },
} as const;

const SESSION_BLACKLIST = {
  monitoringThreshold: {
    minTrades: 8,
    maxExpectancy: -1.5,         // expectancy < -1.5 → monitoring only
    maxWinRate: 0.30,            // WR < 30% → monitoring only
  },
  reducedSizingThreshold: {
    minTrades: 12,
    maxExpectancy: -2.5,
    maxWinRate: 0.25,
  },
  fullBlockThreshold: {
    minTrades: 15,
    maxExpectancy: -4.0,
    maxWinRate: 0.20,
  },
  defaultExpiryMs: 8 * 60 * 60 * 1000, // 8 hours
} as const;

// ═══════════════════════════════════════════════════════════════
// §1 — AUTONOMOUS AGENT TIERING
// ═══════════════════════════════════════════════════════════════

export function evaluateAgentTier(snapshot: AgentPerformanceSnapshot): TierChangeEvent | null {
  const { agentId, currentTier, tradeCount } = snapshot;
  const now = Date.now();

  // Cooldown: no tier changes within 30 minutes of last change
  if (now - snapshot.lastTierChange < 30 * 60 * 1000) return null;

  // ── Instant Demotion to C (Shadow) ──
  if (tradeCount >= TIER_THRESHOLDS.demoteToC.minSampleSize && currentTier !== 'C' && currentTier !== 'D') {
    if (snapshot.avgMAE > TIER_THRESHOLDS.demoteToC.maeThreshold) {
      return createTierChange(agentId, currentTier, 'C',
        `MAE ${snapshot.avgMAE.toFixed(2)}R > ${TIER_THRESHOLDS.demoteToC.maeThreshold}R — catastrophic adverse excursion`,
        'avgMAE', snapshot.avgMAE, TIER_THRESHOLDS.demoteToC.maeThreshold);
    }
    if (snapshot.maxConsecutiveLosses >= TIER_THRESHOLDS.demoteToC.maxConsecutiveLosses) {
      return createTierChange(agentId, currentTier, 'C',
        `${snapshot.maxConsecutiveLosses} consecutive losses — pattern failure detected`,
        'consecutiveLosses', snapshot.maxConsecutiveLosses, TIER_THRESHOLDS.demoteToC.maxConsecutiveLosses);
    }
    if (snapshot.recentWinRate20 < TIER_THRESHOLDS.demoteToC.winRateFloor) {
      return createTierChange(agentId, currentTier, 'C',
        `Recent WR ${(snapshot.recentWinRate20 * 100).toFixed(0)}% < ${(TIER_THRESHOLDS.demoteToC.winRateFloor * 100)}% floor — demoted before next trade`,
        'recentWinRate20', snapshot.recentWinRate20, TIER_THRESHOLDS.demoteToC.winRateFloor);
    }
    if (snapshot.recentExpectancy20 < TIER_THRESHOLDS.demoteToC.expectancyFloor) {
      return createTierChange(agentId, currentTier, 'C',
        `Recent expectancy ${snapshot.recentExpectancy20.toFixed(2)}p < ${TIER_THRESHOLDS.demoteToC.expectancyFloor}p — value-destructive`,
        'recentExpectancy20', snapshot.recentExpectancy20, TIER_THRESHOLDS.demoteToC.expectancyFloor);
    }
  }

  // ── Demotion to B (Reduced) ──
  if (tradeCount >= TIER_THRESHOLDS.demoteToB.minSampleSize && currentTier === 'A') {
    if (snapshot.recentWinRate20 < TIER_THRESHOLDS.demoteToB.winRateFloor) {
      return createTierChange(agentId, 'A', 'B',
        `WR degraded to ${(snapshot.recentWinRate20 * 100).toFixed(0)}% — reducing allocation`,
        'recentWinRate20', snapshot.recentWinRate20, TIER_THRESHOLDS.demoteToB.winRateFloor);
    }
    if (snapshot.recentExpectancy20 < TIER_THRESHOLDS.demoteToB.expectancyFloor) {
      return createTierChange(agentId, 'A', 'B',
        `Expectancy dropped to ${snapshot.recentExpectancy20.toFixed(2)}p — watchlist`,
        'recentExpectancy20', snapshot.recentExpectancy20, TIER_THRESHOLDS.demoteToB.expectancyFloor);
    }
  }

  // ── Promotion to A ──
  if (currentTier === 'B' && tradeCount >= TIER_THRESHOLDS.promoteToA.minSampleSize) {
    if (snapshot.winRate >= TIER_THRESHOLDS.promoteToA.winRateMin &&
        snapshot.expectancy >= TIER_THRESHOLDS.promoteToA.expectancyMin &&
        snapshot.profitFactor >= TIER_THRESHOLDS.promoteToA.profitFactorMin) {
      return createTierChange(agentId, 'B', 'A',
        `Performance validated: WR=${(snapshot.winRate * 100).toFixed(0)}%, exp=${snapshot.expectancy.toFixed(2)}p, PF=${snapshot.profitFactor.toFixed(2)}`,
        'winRate', snapshot.winRate, TIER_THRESHOLDS.promoteToA.winRateMin);
    }
  }

  // ── Recovery from C to B (requires recovery threshold) ──
  if (currentTier === 'C' && tradeCount >= TIER_THRESHOLDS.promoteToB.minSampleSize) {
    if (snapshot.recentWinRate20 >= TIER_THRESHOLDS.promoteToA.recoveryThreshold &&
        snapshot.recentExpectancy20 >= TIER_THRESHOLDS.promoteToB.expectancyMin) {
      return createTierChange(agentId, 'C', 'B',
        `Recovery detected: recent WR=${(snapshot.recentWinRate20 * 100).toFixed(0)}% ≥ ${(TIER_THRESHOLDS.promoteToA.recoveryThreshold * 100)}% recovery threshold`,
        'recentWinRate20', snapshot.recentWinRate20, TIER_THRESHOLDS.promoteToA.recoveryThreshold);
    }
  }

  return null;
}

function createTierChange(
  agentId: string, from: AutonomousTier, to: AutonomousTier,
  reason: string, metric: string, value: number, threshold: number,
): TierChangeEvent {
  return {
    timestamp: Date.now(),
    agentId,
    fromTier: from,
    toTier: to,
    reason,
    triggerMetric: metric,
    triggerValue: value,
    triggerThreshold: threshold,
    autoApplied: true,
  };
}

// ═══════════════════════════════════════════════════════════════
// §2 — DYNAMIC GATE CALIBRATION
// ═══════════════════════════════════════════════════════════════

export function calibrateGatesForRegime(
  regime: string,
  regimeWinRate: number,
  regimeExpectancy: number,
  regimeTradeCount: number,
  avgExecutionQuality: number = 70,
  frictionLossRate: number = 0.0,
): GateOverride[] {
  const overrides: GateOverride[] = [];
  const now = Date.now();

  if (regimeTradeCount < GATE_CALIBRATION.g11AtrStretch.triggerSampleSize) return overrides;

  // ── G11 ATR Stretch Calibration ──
  if (regimeWinRate < GATE_CALIBRATION.g11AtrStretch.triggerWinRate) {
    overrides.push({
      gateId: 'G11_EXTENSION_EXHAUSTION',
      parameter: 'atrStretchThreshold',
      originalValue: GATE_CALIBRATION.g11AtrStretch.default,
      overrideValue: GATE_CALIBRATION.g11AtrStretch.tightenTo,
      regime,
      reason: `Regime '${regime}' WR=${(regimeWinRate * 100).toFixed(0)}% < ${(GATE_CALIBRATION.g11AtrStretch.triggerWinRate * 100)}% — tightening G11 from ${GATE_CALIBRATION.g11AtrStretch.default}x to ${GATE_CALIBRATION.g11AtrStretch.tightenTo}x ATR`,
      appliedAt: now,
      expiresAt: null,
      autoApplied: true,
    });
  } else if (regimeWinRate > 0.60 && regimeExpectancy > 1.0) {
    overrides.push({
      gateId: 'G11_EXTENSION_EXHAUSTION',
      parameter: 'atrStretchThreshold',
      originalValue: GATE_CALIBRATION.g11AtrStretch.default,
      overrideValue: GATE_CALIBRATION.g11AtrStretch.loosenTo,
      regime,
      reason: `Regime '${regime}' WR=${(regimeWinRate * 100).toFixed(0)}%, exp=${regimeExpectancy.toFixed(1)}p — proven edge, loosening G11 to ${GATE_CALIBRATION.g11AtrStretch.loosenTo}x`,
      appliedAt: now,
      expiresAt: null,
      autoApplied: true,
    });
  }

  // ── Composite Score Minimum Calibration ──
  if (regimeTradeCount >= GATE_CALIBRATION.compositeMinimum.triggerSampleSize) {
    if (regimeWinRate < GATE_CALIBRATION.compositeMinimum.triggerWinRate) {
      overrides.push({
        gateId: 'COMPOSITE_MINIMUM',
        parameter: 'compositeScoreMin',
        originalValue: GATE_CALIBRATION.compositeMinimum.default,
        overrideValue: GATE_CALIBRATION.compositeMinimum.tightenTo,
        regime,
        reason: `Regime '${regime}' underperforming — hiking composite minimum from ${GATE_CALIBRATION.compositeMinimum.default} to ${GATE_CALIBRATION.compositeMinimum.tightenTo}`,
        appliedAt: now,
        expiresAt: null,
        autoApplied: true,
      });
    } else if (regimeWinRate > 0.55 && regimeExpectancy > 0.5) {
      overrides.push({
        gateId: 'COMPOSITE_MINIMUM',
        parameter: 'compositeScoreMin',
        originalValue: GATE_CALIBRATION.compositeMinimum.default,
        overrideValue: GATE_CALIBRATION.compositeMinimum.loosenTo,
        regime,
        reason: `Regime '${regime}' proven profitable — relaxing composite to ${GATE_CALIBRATION.compositeMinimum.loosenTo}`,
        appliedAt: now,
        expiresAt: null,
        autoApplied: true,
      });
    }
  }

  // ── Friction K Calibration ──
  if (frictionLossRate > GATE_CALIBRATION.frictionK.triggerThreshold) {
    overrides.push({
      gateId: 'G1_FRICTION',
      parameter: 'frictionK',
      originalValue: GATE_CALIBRATION.frictionK.default,
      overrideValue: GATE_CALIBRATION.frictionK.tightenTo,
      regime,
      reason: `Friction losses ${(frictionLossRate * 100).toFixed(0)}% > ${(GATE_CALIBRATION.frictionK.triggerThreshold * 100)}% — raising K to ${GATE_CALIBRATION.frictionK.tightenTo}`,
      appliedAt: now,
      expiresAt: null,
      autoApplied: true,
    });
  } else if (avgExecutionQuality > 80) {
    overrides.push({
      gateId: 'G1_FRICTION',
      parameter: 'frictionK',
      originalValue: GATE_CALIBRATION.frictionK.default,
      overrideValue: GATE_CALIBRATION.frictionK.loosenTo,
      regime,
      reason: `Execution quality ${avgExecutionQuality.toFixed(0)} > 80 — relaxing friction K to ${GATE_CALIBRATION.frictionK.loosenTo}`,
      appliedAt: now,
      expiresAt: null,
      autoApplied: true,
    });
  }

  return overrides;
}

// ═══════════════════════════════════════════════════════════════
// §3 — SESSION-PAIR BLACKLISTING
// ═══════════════════════════════════════════════════════════════

export function evaluateSessionPairBlacklist(
  pair: string,
  session: string,
  winRate: number,
  expectancy: number,
  tradeCount: number,
): SessionPairBlacklist | null {
  const now = Date.now();

  // ── Full Block ──
  if (tradeCount >= SESSION_BLACKLIST.fullBlockThreshold.minTrades &&
      expectancy < SESSION_BLACKLIST.fullBlockThreshold.maxExpectancy &&
      winRate < SESSION_BLACKLIST.fullBlockThreshold.maxWinRate) {
    return {
      pair, session, mode: 'full-block',
      reason: `TOXIC: ${pair}/${session} WR=${(winRate * 100).toFixed(0)}%, exp=${expectancy.toFixed(1)}p over ${tradeCount} trades — FULL BLOCK`,
      appliedAt: now,
      expiresAt: now + SESSION_BLACKLIST.defaultExpiryMs,
      winRate, expectancy, tradeCount,
      autoApplied: true,
    };
  }

  // ── Reduced Sizing ──
  if (tradeCount >= SESSION_BLACKLIST.reducedSizingThreshold.minTrades &&
      expectancy < SESSION_BLACKLIST.reducedSizingThreshold.maxExpectancy &&
      winRate < SESSION_BLACKLIST.reducedSizingThreshold.maxWinRate) {
    return {
      pair, session, mode: 'reduced-sizing',
      reason: `DEGRADED: ${pair}/${session} WR=${(winRate * 100).toFixed(0)}%, exp=${expectancy.toFixed(1)}p — reduced to 0.3x sizing`,
      appliedAt: now,
      expiresAt: now + SESSION_BLACKLIST.defaultExpiryMs,
      winRate, expectancy, tradeCount,
      autoApplied: true,
    };
  }

  // ── Monitoring Only ──
  if (tradeCount >= SESSION_BLACKLIST.monitoringThreshold.minTrades &&
      expectancy < SESSION_BLACKLIST.monitoringThreshold.maxExpectancy &&
      winRate < SESSION_BLACKLIST.monitoringThreshold.maxWinRate) {
    return {
      pair, session, mode: 'monitoring-only',
      reason: `CAUTION: ${pair}/${session} WR=${(winRate * 100).toFixed(0)}%, exp=${expectancy.toFixed(1)}p — monitoring only (shadow-logged)`,
      appliedAt: now,
      expiresAt: now + SESSION_BLACKLIST.defaultExpiryMs,
      winRate, expectancy, tradeCount,
      autoApplied: true,
    };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// §4 — CONTINUOUS FEEDBACK LOOP
// Triggers on every closed trade — micro-adjusts governance in real-time
// ═══════════════════════════════════════════════════════════════

export interface FeedbackResult {
  tierChanges: TierChangeEvent[];
  gateOverrides: GateOverride[];
  newBlacklists: SessionPairBlacklist[];
  expiredBlacklists: string[];
  adjustmentsSummary: string[];
}

export function processTradeFeedback(
  tradeResult: {
    agentId: string;
    pair: string;
    direction: string;
    session: string;
    regime: string;
    pnlPips: number;
    maeR: number;
    tradeId: string;
  },
  allAgentSnapshots: AgentPerformanceSnapshot[],
  regimeStats: Record<string, { winRate: number; expectancy: number; tradeCount: number }>,
  sessionPairStats: Record<string, { winRate: number; expectancy: number; tradeCount: number }>,
): FeedbackResult {
  const result: FeedbackResult = {
    tierChanges: [],
    gateOverrides: [],
    newBlacklists: [],
    expiredBlacklists: [],
    adjustmentsSummary: [],
  };

  const now = Date.now();
  _state.totalFeedbackEvents++;

  // Record feedback event
  const feedbackEvent: FeedbackEvent = {
    timestamp: now,
    tradeId: tradeResult.tradeId,
    agentId: tradeResult.agentId,
    pair: tradeResult.pair,
    direction: tradeResult.direction,
    session: tradeResult.session,
    regime: tradeResult.regime,
    pnlPips: tradeResult.pnlPips,
    won: tradeResult.pnlPips > 0,
    maeR: tradeResult.maeR,
    adjustmentsMade: [],
  };

  // ── 1. Evaluate Agent Tiering ──
  for (const snapshot of allAgentSnapshots) {
    const tierChange = evaluateAgentTier(snapshot);
    if (tierChange) {
      result.tierChanges.push(tierChange);
      result.adjustmentsSummary.push(
        `[TIER] ${tierChange.agentId}: ${tierChange.fromTier} → ${tierChange.toTier} (${tierChange.reason})`
      );
      feedbackEvent.adjustmentsMade.push(`tier:${tierChange.agentId}:${tierChange.fromTier}→${tierChange.toTier}`);

      // Update state
      _state.tierHistory.push(tierChange);
      const existing = _state.agentSnapshots.get(snapshot.agentId);
      if (existing) {
        existing.currentTier = tierChange.toTier;
        existing.lastTierChange = now;
      }
    }
  }

  // ── 2. Calibrate Gates per Regime ──
  for (const [regime, stats] of Object.entries(regimeStats)) {
    if (stats.tradeCount < 10) continue;
    const gateOverrides = calibrateGatesForRegime(regime, stats.winRate, stats.expectancy, stats.tradeCount);
    for (const override of gateOverrides) {
      // Don't duplicate existing overrides for same gate+regime
      const existing = _state.activeGateOverrides.findIndex(
        o => o.gateId === override.gateId && o.regime === override.regime
      );
      if (existing >= 0) {
        _state.activeGateOverrides[existing] = override;
      } else {
        _state.activeGateOverrides.push(override);
      }
      result.gateOverrides.push(override);
      result.adjustmentsSummary.push(`[GATE] ${override.gateId}: ${override.parameter} ${override.originalValue} → ${override.overrideValue} (${regime})`);
      feedbackEvent.adjustmentsMade.push(`gate:${override.gateId}:${override.regime}`);
    }
  }

  // ── 3. Evaluate Session-Pair Blacklists ──
  for (const [key, stats] of Object.entries(sessionPairStats)) {
    const [pair, session] = key.split('|');
    if (!pair || !session || stats.tradeCount < 5) continue;

    const blacklist = evaluateSessionPairBlacklist(pair, session, stats.winRate, stats.expectancy, stats.tradeCount);
    if (blacklist) {
      // Don't duplicate
      const existing = _state.activeBlacklists.findIndex(b => b.pair === pair && b.session === session);
      if (existing >= 0) {
        _state.activeBlacklists[existing] = blacklist;
      } else {
        _state.activeBlacklists.push(blacklist);
      }
      result.newBlacklists.push(blacklist);
      result.adjustmentsSummary.push(`[BLACKLIST] ${pair}/${session}: ${blacklist.mode} (${blacklist.reason})`);
      feedbackEvent.adjustmentsMade.push(`blacklist:${pair}:${session}:${blacklist.mode}`);
    }
  }

  // ── 4. Expire old blacklists ──
  _state.activeBlacklists = _state.activeBlacklists.filter(b => {
    if (b.expiresAt < now) {
      result.expiredBlacklists.push(`${b.pair}/${b.session}`);
      result.adjustmentsSummary.push(`[BLACKLIST-EXPIRED] ${b.pair}/${b.session} — re-enabled for trading`);
      return false;
    }
    return true;
  });

  _state.feedbackLog.push(feedbackEvent);
  // Keep log bounded
  if (_state.feedbackLog.length > 500) {
    _state.feedbackLog = _state.feedbackLog.slice(-250);
  }

  _state.lastEvolutionCycle = now;

  return result;
}

// ═══════════════════════════════════════════════════════════════
// §5 — STATE ACCESSORS
// ═══════════════════════════════════════════════════════════════

export function getActiveTierChanges(): TierChangeEvent[] {
  return _state.tierHistory.slice(-50);
}

export function getActiveGateOverrides(): GateOverride[] {
  return _state.activeGateOverrides;
}

export function getActiveBlacklists(): SessionPairBlacklist[] {
  return _state.activeBlacklists.filter(b => b.expiresAt > Date.now());
}

export function getBlacklistForPairSession(pair: string, session: string): SessionPairBlacklist | null {
  return _state.activeBlacklists.find(
    b => b.pair === pair && b.session === session && b.expiresAt > Date.now()
  ) ?? null;
}

export function getGateOverrideForRegime(gateId: string, regime: string): GateOverride | null {
  return _state.activeGateOverrides.find(
    o => o.gateId === gateId && o.regime === regime
  ) ?? null;
}

export function getAgentAutonomousTier(agentId: string): AutonomousTier | null {
  return _state.agentSnapshots.get(agentId)?.currentTier ?? null;
}

export function getFeedbackStats(): {
  totalEvents: number;
  totalTierChanges: number;
  totalGateOverrides: number;
  activeBlacklists: number;
  lastCycle: number;
} {
  return {
    totalEvents: _state.totalFeedbackEvents,
    totalTierChanges: _state.tierHistory.length,
    totalGateOverrides: _state.activeGateOverrides.length,
    activeBlacklists: _state.activeBlacklists.filter(b => b.expiresAt > Date.now()).length,
    lastCycle: _state.lastEvolutionCycle,
  };
}

export function getFullEvolutionState(): {
  agentSnapshots: AgentPerformanceSnapshot[];
  recentTierChanges: TierChangeEvent[];
  activeGateOverrides: GateOverride[];
  activeBlacklists: SessionPairBlacklist[];
  recentFeedback: FeedbackEvent[];
  regimeProfiles: RegimeGateProfile[];
  stats: ReturnType<typeof getFeedbackStats>;
} {
  return {
    agentSnapshots: Array.from(_state.agentSnapshots.values()),
    recentTierChanges: _state.tierHistory.slice(-20),
    activeGateOverrides: _state.activeGateOverrides,
    activeBlacklists: _state.activeBlacklists.filter(b => b.expiresAt > Date.now()),
    recentFeedback: _state.feedbackLog.slice(-20),
    regimeProfiles: Array.from(_state.regimeProfiles.values()),
    stats: getFeedbackStats(),
  };
}

// ─── Manual Overrides (Floor Manager Controls) ───────────────

export function forceAgentTier(agentId: string, tier: AutonomousTier, reason: string): TierChangeEvent {
  const existing = _state.agentSnapshots.get(agentId);
  const fromTier = existing?.currentTier ?? 'B';

  const event: TierChangeEvent = {
    timestamp: Date.now(),
    agentId,
    fromTier,
    toTier: tier,
    reason: `MANUAL: ${reason}`,
    triggerMetric: 'manual',
    triggerValue: 0,
    triggerThreshold: 0,
    autoApplied: false,
  };

  _state.tierHistory.push(event);
  if (existing) {
    existing.currentTier = tier;
    existing.lastTierChange = Date.now();
  }

  return event;
}

export function forceSessionPairBlacklist(
  pair: string, session: string, mode: BlacklistMode, reason: string, durationMs?: number,
): SessionPairBlacklist {
  const blacklist: SessionPairBlacklist = {
    pair, session, mode,
    reason: `MANUAL: ${reason}`,
    appliedAt: Date.now(),
    expiresAt: Date.now() + (durationMs ?? SESSION_BLACKLIST.defaultExpiryMs),
    winRate: 0, expectancy: 0, tradeCount: 0,
    autoApplied: false,
  };

  const existing = _state.activeBlacklists.findIndex(b => b.pair === pair && b.session === session);
  if (existing >= 0) {
    _state.activeBlacklists[existing] = blacklist;
  } else {
    _state.activeBlacklists.push(blacklist);
  }

  return blacklist;
}

export function clearBlacklist(pair: string, session: string): boolean {
  const idx = _state.activeBlacklists.findIndex(b => b.pair === pair && b.session === session);
  if (idx >= 0) {
    _state.activeBlacklists.splice(idx, 1);
    return true;
  }
  return false;
}

export function clearAllBlacklists(): number {
  const count = _state.activeBlacklists.length;
  _state.activeBlacklists = [];
  return count;
}

// ─── Reset (for testing) ─────────────────────────────────────

export function resetAutonomousGovernance(): void {
  _state.agentSnapshots.clear();
  _state.tierHistory = [];
  _state.activeGateOverrides = [];
  _state.activeBlacklists = [];
  _state.feedbackLog = [];
  _state.regimeProfiles.clear();
  _state.lastEvolutionCycle = 0;
  _state.totalFeedbackEvents = 0;
}
