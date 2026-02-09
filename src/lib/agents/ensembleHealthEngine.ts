// ═══════════════════════════════════════════════════════════════
// Ensemble Health & Contribution Loop — Execution Grade
// Verifies combined agents cooperate profitably, manage risk,
// and learn safely. Does NOT modify collaboration engine.
// ═══════════════════════════════════════════════════════════════

import { AgentId } from './types';
import { ALL_AGENT_IDS } from './agentConfig';
import {
  OrderRecord,
  filterOrdersByLearnMode,
  LearnMode,
  computeSingleAgentStats,
} from './agentCollaborationEngine';
import {
  buildEnvKeyFromRaw,
  type EnvironmentKey,
} from '@/lib/forex/environmentSignature';

// ─── Types ───────────────────────────────────────────────────

export interface RollingMetrics {
  window: number;
  expectancy: number;       // friction-adjusted pips
  profitFactor: number;
  maxDrawdown: number;      // pips
  drawdownSlope: number;    // pips per trade (negative = worsening)
  outcomeChangedRate: number; // 0-1
  tradeCount: number;
}

export interface EnsembleHealthSnapshot {
  rolling20: RollingMetrics;
  rolling50: RollingMetrics;
  rolling100: RollingMetrics;
  modeUptime: ModeUptimeCounts;
  rollbackActive: boolean;
  rollbackReason: string | null;
  timestamp: number;
}

export interface ModeUptimeCounts {
  active: number;
  fallback: number;
  independent: number;
  disabled: number;
}

export interface AgentContribution {
  agentId: AgentId;
  deltaExpectancy: number;       // Δ expectancy when agent participates vs not
  pipsGainedSynergy: number;
  pipsSavedVeto: number;
  harmRate: number;              // 0-1, fraction of trades correlated with negative expectancy
  totalTrades: number;
  participatingTrades: number;
  isFlaggedHarmful: boolean;
  envKeyBreakdown: AgentEnvContribution[];
}

export interface AgentEnvContribution {
  envKey: EnvironmentKey;
  deltaExpectancy: number;
  trades: number;
  harmRate: number;
  isFlaggedHarmful: boolean;
}

export interface EnsembleRollbackState {
  active: boolean;
  triggeredAt: number | null;
  reason: string | null;
  baselineExpectancy: number;
  ensembleExpectancy: number;
  recoveryThreshold: number;
}

export interface WeightUpdateLog {
  timestamp: number;
  agentId: AgentId;
  envKey: EnvironmentKey;
  previousWeight: number;
  newWeight: number;
  reason: string;
  sampleSize: number;
}

// ─── Constants ───────────────────────────────────────────────

const HARM_MIN_SAMPLE = 30;
const HARM_RATE_THRESHOLD = 0.55;
const ROLLBACK_LOOKBACK = 100;
const ROLLBACK_DEGRADATION = 0.20;
const RECOVERY_THRESHOLD = 0.05; // must outperform baseline by 5% to recover
const VELOCITY_MAX_DELTA = 0.10;

// ─── State ───────────────────────────────────────────────────

let rollbackState: EnsembleRollbackState = {
  active: false,
  triggeredAt: null,
  reason: null,
  baselineExpectancy: 0,
  ensembleExpectancy: 0,
  recoveryThreshold: 0,
};

let modeUptime: ModeUptimeCounts = { active: 0, fallback: 0, independent: 0, disabled: 0 };
let weightLogs: WeightUpdateLog[] = [];

// ─── Getters ─────────────────────────────────────────────────

export function getEnsembleRollbackState(): EnsembleRollbackState {
  return { ...rollbackState };
}

export function getModeUptime(): ModeUptimeCounts {
  return { ...modeUptime };
}

export function getWeightUpdateLogs(): WeightUpdateLog[] {
  return [...weightLogs];
}

export function recordModeUptime(mode: keyof ModeUptimeCounts): void {
  modeUptime[mode]++;
}

export function logWeightUpdate(log: WeightUpdateLog): void {
  weightLogs.push(log);
  if (weightLogs.length > 500) weightLogs = weightLogs.slice(-500);
}

// ─── PnL Helpers ─────────────────────────────────────────────

function computePnlPips(entry: number | null, exit: number | null, pair: string): number {
  if (!entry || !exit) return 0;
  const isJpy = pair.includes('JPY');
  return (exit - entry) * (isJpy ? 100 : 10000);
}

function getClosedOrders(orders: OrderRecord[]): OrderRecord[] {
  return orders.filter(o => o.status === 'closed' && o.entry_price && o.exit_price);
}

function buildOrderEnvKey(o: OrderRecord): EnvironmentKey {
  return buildEnvKeyFromRaw(
    o.session_label || 'unknown',
    o.regime_label || 'unknown',
    o.currency_pair,
    o.direction,
    o.agent_id || undefined,
  );
}

// ─── Rolling Metrics Calculator ──────────────────────────────

export function computeRollingMetrics(
  orders: OrderRecord[],
  window: number,
  outcomeChangedCount: number = 0,
): RollingMetrics {
  const closed = getClosedOrders(orders);
  const recent = closed.slice(0, window);

  if (recent.length === 0) {
    return { window, expectancy: 0, profitFactor: 0, maxDrawdown: 0, drawdownSlope: 0, outcomeChangedRate: 0, tradeCount: 0 };
  }

  const pnls = recent.map(o => computePnlPips(o.entry_price, o.exit_price, o.currency_pair));
  const totalPnl = pnls.reduce((s, p) => s + p, 0);
  const expectancy = totalPnl / pnls.length;

  const grossWin = pnls.filter(p => p > 0).reduce((s, p) => s + p, 0);
  const grossLoss = Math.abs(pnls.filter(p => p < 0).reduce((s, p) => s + p, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;

  // Max drawdown and slope
  let peak = 0;
  let maxDD = 0;
  let cumPnl = 0;
  const ddSeries: number[] = [];

  for (const p of pnls) {
    cumPnl += p;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak - cumPnl;
    if (dd > maxDD) maxDD = dd;
    ddSeries.push(dd);
  }

  // Drawdown slope: linear regression of DD series
  let ddSlope = 0;
  if (ddSeries.length > 1) {
    const n = ddSeries.length;
    const xMean = (n - 1) / 2;
    const yMean = ddSeries.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (ddSeries[i] - yMean);
      den += (i - xMean) ** 2;
    }
    ddSlope = den > 0 ? num / den : 0;
  }

  return {
    window,
    expectancy: Math.round(expectancy * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    maxDrawdown: Math.round(maxDD * 100) / 100,
    drawdownSlope: Math.round(ddSlope * 1000) / 1000,
    outcomeChangedRate: recent.length > 0 ? Math.round((outcomeChangedCount / recent.length) * 1000) / 1000 : 0,
    tradeCount: recent.length,
  };
}

// ─── Agent Contribution Accounting ───────────────────────────

export function computeAgentContributions(
  orders: OrderRecord[],
): AgentContribution[] {
  const closed = getClosedOrders(orders);
  if (closed.length === 0) return [];

  // Overall expectancy
  const allPnls = closed.map(o => computePnlPips(o.entry_price, o.exit_price, o.currency_pair));
  const overallExp = allPnls.reduce((s, p) => s + p, 0) / allPnls.length;

  const contributions: AgentContribution[] = [];

  for (const agentId of ALL_AGENT_IDS) {
    const participating = closed.filter(o => o.agent_id === agentId);
    const notParticipating = closed.filter(o => o.agent_id !== agentId);

    if (participating.length === 0) {
      contributions.push({
        agentId,
        deltaExpectancy: 0,
        pipsGainedSynergy: 0,
        pipsSavedVeto: 0,
        harmRate: 0,
        totalTrades: closed.length,
        participatingTrades: 0,
        isFlaggedHarmful: false,
        envKeyBreakdown: [],
      });
      continue;
    }

    const partPnls = participating.map(o => computePnlPips(o.entry_price, o.exit_price, o.currency_pair));
    const partExp = partPnls.reduce((s, p) => s + p, 0) / partPnls.length;
    const notPartExp = notParticipating.length > 0
      ? notParticipating.map(o => computePnlPips(o.entry_price, o.exit_price, o.currency_pair)).reduce((s, p) => s + p, 0) / notParticipating.length
      : 0;

    const deltaExp = partExp - notPartExp;
    const negTrades = partPnls.filter(p => p < 0).length;
    const harmRate = partPnls.length > 0 ? negTrades / partPnls.length : 0;

    // Synergy pips: positive delta × trade count
    const pipsGained = deltaExp > 0 ? deltaExp * participating.length : 0;
    // Veto/saved pips: negative pnl trades that were avoided (simplified)
    const pipsSaved = 0; // needs collaboration context

    // EnvKey breakdown
    const envMap = new Map<EnvironmentKey, { pnls: number[]; notPartPnls: number[] }>();
    for (const o of participating) {
      const ek = buildOrderEnvKey(o);
      if (!envMap.has(ek)) envMap.set(ek, { pnls: [], notPartPnls: [] });
      envMap.get(ek)!.pnls.push(computePnlPips(o.entry_price, o.exit_price, o.currency_pair));
    }
    for (const o of notParticipating) {
      const ek = buildOrderEnvKey(o);
      if (envMap.has(ek)) {
        envMap.get(ek)!.notPartPnls.push(computePnlPips(o.entry_price, o.exit_price, o.currency_pair));
      }
    }

    const envBreakdown: AgentEnvContribution[] = [];
    for (const [ek, data] of envMap) {
      const envPartExp = data.pnls.reduce((s, p) => s + p, 0) / data.pnls.length;
      const envNotPartExp = data.notPartPnls.length > 0
        ? data.notPartPnls.reduce((s, p) => s + p, 0) / data.notPartPnls.length
        : 0;
      const envHarmRate = data.pnls.filter(p => p < 0).length / data.pnls.length;
      envBreakdown.push({
        envKey: ek,
        deltaExpectancy: Math.round((envPartExp - envNotPartExp) * 100) / 100,
        trades: data.pnls.length,
        harmRate: Math.round(envHarmRate * 100) / 100,
        isFlaggedHarmful: data.pnls.length >= HARM_MIN_SAMPLE && envHarmRate >= HARM_RATE_THRESHOLD,
      });
    }

    contributions.push({
      agentId,
      deltaExpectancy: Math.round(deltaExp * 100) / 100,
      pipsGainedSynergy: Math.round(pipsGained * 100) / 100,
      pipsSavedVeto: Math.round(pipsSaved * 100) / 100,
      harmRate: Math.round(harmRate * 100) / 100,
      totalTrades: closed.length,
      participatingTrades: participating.length,
      isFlaggedHarmful: participating.length >= HARM_MIN_SAMPLE && harmRate >= HARM_RATE_THRESHOLD,
      envKeyBreakdown: envBreakdown.sort((a, b) => b.trades - a.trades),
    });
  }

  return contributions.sort((a, b) => b.deltaExpectancy - a.deltaExpectancy);
}

// ─── Ensemble Safety Rollback ────────────────────────────────

export function evaluateEnsembleRollback(
  ensembleExpectancy: number,
  baselineExpectancy: number,
): EnsembleRollbackState {
  if (rollbackState.active) {
    // Check recovery: ensemble must outperform baseline by recovery threshold
    if (baselineExpectancy > 0 && ensembleExpectancy > baselineExpectancy * (1 + RECOVERY_THRESHOLD)) {
      rollbackState = {
        active: false,
        triggeredAt: null,
        reason: null,
        baselineExpectancy,
        ensembleExpectancy,
        recoveryThreshold: baselineExpectancy * (1 + RECOVERY_THRESHOLD),
      };
      console.log(`[ENSEMBLE] Rollback RECOVERED: ensemble ${ensembleExpectancy.toFixed(2)}p > recovery ${(baselineExpectancy * (1 + RECOVERY_THRESHOLD)).toFixed(2)}p`);
    }
    return { ...rollbackState };
  }

  // Check trigger
  if (baselineExpectancy > 0) {
    const degradation = (baselineExpectancy - ensembleExpectancy) / Math.abs(baselineExpectancy);
    if (degradation >= ROLLBACK_DEGRADATION) {
      rollbackState = {
        active: true,
        triggeredAt: Date.now(),
        reason: `Ensemble expectancy ${ensembleExpectancy.toFixed(2)}p is ${(degradation * 100).toFixed(0)}% worse than baseline ${baselineExpectancy.toFixed(2)}p`,
        baselineExpectancy,
        ensembleExpectancy,
        recoveryThreshold: baselineExpectancy * (1 + RECOVERY_THRESHOLD),
      };
      console.log(`[ENSEMBLE] Rollback TRIGGERED: ${rollbackState.reason}`);
    }
  }

  return { ...rollbackState };
}

export function resetEnsembleRollback(): void {
  rollbackState = {
    active: false,
    triggeredAt: null,
    reason: null,
    baselineExpectancy: 0,
    ensembleExpectancy: 0,
    recoveryThreshold: 0,
  };
}

// ─── Full Health Snapshot ────────────────────────────────────

export function computeEnsembleHealth(
  orders: OrderRecord[],
  learnMode: LearnMode = 'live+practice',
  outcomeChangedCount: number = 0,
): EnsembleHealthSnapshot {
  const filtered = filterOrdersByLearnMode(orders, learnMode);
  const sorted = [...filtered].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const rolling20 = computeRollingMetrics(sorted, 20, Math.round(outcomeChangedCount * 0.2));
  const rolling50 = computeRollingMetrics(sorted, 50, Math.round(outcomeChangedCount * 0.5));
  const rolling100 = computeRollingMetrics(sorted, 100, outcomeChangedCount);

  // Evaluate rollback using rolling100 vs a simple baseline (solo agent avg)
  const singleStats = computeSingleAgentStats(filtered);
  const soloExps = Object.values(singleStats).filter(s => s.soloTrades > 0).map(s => s.soloExpectancy);
  const baselineExp = soloExps.length > 0 ? soloExps.reduce((s, e) => s + e, 0) / soloExps.length : 0;
  evaluateEnsembleRollback(rolling100.expectancy, baselineExp);

  return {
    rolling20,
    rolling50,
    rolling100,
    modeUptime: getModeUptime(),
    rollbackActive: rollbackState.active,
    rollbackReason: rollbackState.reason,
    timestamp: Date.now(),
  };
}

// ─── CSV Export Helpers ──────────────────────────────────────

export function exportContributionsCSV(contributions: AgentContribution[]): string {
  const header = 'Agent,Delta Expectancy,Pips Gained (Synergy),Pips Saved (Veto),Harm Rate,Trades,Participating,Flagged Harmful';
  const rows = contributions.map(c =>
    `${c.agentId},${c.deltaExpectancy},${c.pipsGainedSynergy},${c.pipsSavedVeto},${c.harmRate},${c.totalTrades},${c.participatingTrades},${c.isFlaggedHarmful}`
  );
  return [header, ...rows].join('\n');
}

export function exportEnvContributionsCSV(contributions: AgentContribution[]): string {
  const header = 'Agent,EnvKey,Delta Expectancy,Trades,Harm Rate,Flagged Harmful';
  const rows: string[] = [];
  for (const c of contributions) {
    for (const env of c.envKeyBreakdown) {
      rows.push(`${c.agentId},${env.envKey},${env.deltaExpectancy},${env.trades},${env.harmRate},${env.isFlaggedHarmful}`);
    }
  }
  return [header, ...rows].join('\n');
}

export function exportHealthCSV(health: EnsembleHealthSnapshot): string {
  const header = 'Window,Expectancy,Profit Factor,Max Drawdown,DD Slope,Outcome Changed Rate,Trades';
  const rows = [health.rolling20, health.rolling50, health.rolling100].map(r =>
    `${r.window},${r.expectancy},${r.profitFactor},${r.maxDrawdown},${r.drawdownSlope},${r.outcomeChangedRate},${r.tradeCount}`
  );
  return [header, ...rows].join('\n');
}
