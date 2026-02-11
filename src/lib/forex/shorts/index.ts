// ─── Short Engine — Public API ───
// Two engines, same dashboards. Completely isolated from the long system.

export {
  type ShortRegime,
  type ShortStopConfig,
  type ShortGateId,
  type ShortGateEntry,
  type ShortEntrySignal,
  type SnapbackSurvivalMetrics,
  type ShortSurvivorshipEntry,
  type ShortShadowResult,
  type ShortShadowStatus,
  type ShortEngineConfig,
  SHORT_REGIME_LABELS,
  SHORT_TRADEABLE_REGIMES,
  SHORT_SUPPRESSED_REGIMES,
  DEFAULT_SHORT_STOP_CONFIG,
  DEFAULT_SHORT_ENGINE_CONFIG,
} from './shortTypes';

export {
  classifyShortRegime,
  type ShortRegimeClassification,
} from './shortRegimeDetector';

export {
  computeShortInitialStop,
  evaluateShortStopPhase,
  computeShortTrailingStop,
  getRegimeStopAdjustment,
  type ShortStopLevel,
} from './shortStopGeometry';

export {
  evaluateShortProposal,
  type ShortGovernanceResult,
  type ShortGovernanceMultipliers,
} from './shortGovernance';

export {
  computeSnapbackSurvival,
  scoreShortSurvivorship,
  type ShortTradeRecord,
} from './shortSurvivorshipScorer';

export {
  evaluateShortShadow,
  type ShortShadowMetrics,
  type ShortBaselineMetrics,
} from './shortShadowValidator';

export {
  routeTradeProposal,
  validateRouterIntegrity,
  type EngineSelection,
  type RouterDecision,
} from './shortRouter';
