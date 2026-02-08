// Rolling Window Degradation Engine
// Tracks performance across 50/200 trade and 30-day rolling windows.
// Detects metric degradation and produces auto-protection triggers
// that throttle trade density when edge quality decays.

import { ForexTradeEntry, ForexRegime } from './forexTypes';

// ─── Rolling Window Sizes ───

export type RollingWindowSize = '50' | '200' | '30d';

export const ROLLING_WINDOW_LABELS: Record<RollingWindowSize, string> = {
  '50': 'Last 50 Trades',
  '200': 'Last 200 Trades',
  '30d': 'Last 30 Days',
};

// ─── Threshold Config ───

interface DegradationThresholds {
  minWinRate: number;
  minCaptureRatio: number;
  maxAvgLoss: number;         // max avg loss magnitude (%)
  minPayoutAsymmetry: number; // min win/loss ratio
  maxAvgDuration: number;     // max avg duration (minutes)
  minExpectancy: number;      // min net expectancy after friction
  maxDrawdown: number;        // max peak drawdown (%)
}

const DEFAULT_THRESHOLDS: DegradationThresholds = {
  minWinRate: 0.60,
  minCaptureRatio: 0.50,
  maxAvgLoss: 0.10,
  minPayoutAsymmetry: 3.0,
  maxAvgDuration: 20,
  minExpectancy: 0.01,
  maxDrawdown: 3.0,
};

// ─── Rolling Window Metrics ───

export interface RollingWindowMetrics {
  windowSize: RollingWindowSize;
  tradeCount: number;
  winRate: number;
  avgWinSize: number;
  avgLossSize: number;
  payoutAsymmetry: number;    // avgWin / avgLoss
  avgCaptureRatio: number;
  avgDuration: number;
  avgFrictionCost: number;
  netExpectancy: number;      // after friction
  netPnl: number;
  maxDrawdown: number;
  profitFactor: number;
  sharpe: number;
}

// ─── Degradation Alert ───

export type DegradationSeverity = 'warning' | 'critical';

export interface DegradationAlert {
  metric: string;
  current: number;
  threshold: number;
  severity: DegradationSeverity;
  direction: 'below' | 'above';
  message: string;
}

// ─── Protection Action ───

export type ProtectionAction =
  | 'throttle-density'
  | 'raise-gating'
  | 'tighten-duration'
  | 'defensive-exits'
  | 'restrict-pairs'
  | 'reduce-size';

export interface AutoProtectionTrigger {
  action: ProtectionAction;
  reason: string;
  severity: DegradationSeverity;
  adjustmentFactor: number;  // multiplier (e.g., 0.5 = halve density)
}

// ─── Complete Rolling Health State ───

export interface RollingHealthState {
  windows: Record<RollingWindowSize, RollingWindowMetrics>;
  alerts: DegradationAlert[];
  protectionTriggers: AutoProtectionTrigger[];
  isHealthy: boolean;
  healthScore: number;         // 0-100
  protectionLevel: 'none' | 'light' | 'moderate' | 'heavy';
  doNotTrade: string[];        // conditions that should block all trading
  topFixes: string[];          // "3 fixes now" list
  timestamp: number;
}

// ─── Compute Rolling Window Metrics ───

function sliceWindow(trades: ForexTradeEntry[], window: RollingWindowSize): ForexTradeEntry[] {
  const executed = trades.filter(t => t.outcome !== 'avoided');
  if (window === '30d') {
    const cutoff = Date.now() - 30 * 86400000;
    return executed.filter(t => t.timestamp >= cutoff);
  }
  const count = window === '50' ? 50 : 200;
  return executed.slice(0, count); // trades already sorted by recency
}

function computeWindowMetrics(trades: ForexTradeEntry[], windowSize: RollingWindowSize): RollingWindowMetrics {
  const wins = trades.filter(t => t.pnlPercent > 0);
  const losses = trades.filter(t => t.pnlPercent <= 0);

  const avgWinSize = wins.length > 0
    ? wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length
    : 0;
  const avgLossSize = losses.length > 0
    ? Math.abs(losses.reduce((s, t) => s + t.pnlPercent, 0) / losses.length)
    : 0.001; // avoid div by zero

  const netPnl = trades.reduce((s, t) => s + t.pnlPercent, 0);
  const avgFriction = trades.length > 0
    ? trades.reduce((s, t) => s + t.frictionCost, 0) / trades.length
    : 0;
  const avgReturn = trades.length > 0 ? netPnl / trades.length : 0;

  const grossProfit = wins.reduce((s, t) => s + t.pnlPercent, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPercent, 0));

  // Sharpe
  const stdDev = trades.length > 1
    ? Math.sqrt(trades.reduce((s, t) => s + Math.pow(t.pnlPercent - avgReturn, 2), 0) / (trades.length - 1))
    : 1;

  // Max drawdown (sequential)
  let peak = 0, maxDd = 0, cumPnl = 0;
  for (const t of trades) {
    cumPnl += t.pnlPercent;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak - cumPnl;
    if (dd > maxDd) maxDd = dd;
  }

  return {
    windowSize,
    tradeCount: trades.length,
    winRate: trades.length > 0 ? wins.length / trades.length : 0,
    avgWinSize,
    avgLossSize,
    payoutAsymmetry: avgLossSize > 0 ? avgWinSize / avgLossSize : 99,
    avgCaptureRatio: trades.length > 0
      ? trades.reduce((s, t) => s + t.captureRatio, 0) / trades.length
      : 0,
    avgDuration: trades.length > 0
      ? trades.reduce((s, t) => s + t.tradeDuration, 0) / trades.length
      : 0,
    avgFrictionCost: avgFriction,
    netExpectancy: avgReturn - avgFriction,
    netPnl,
    maxDrawdown: maxDd,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0,
    sharpe: stdDev > 0 ? avgReturn / stdDev : 0,
  };
}

// ─── Detect Degradation ───

function detectDegradation(
  metrics: RollingWindowMetrics,
  thresholds: DegradationThresholds = DEFAULT_THRESHOLDS
): DegradationAlert[] {
  const alerts: DegradationAlert[] = [];

  const check = (metric: string, value: number, threshold: number, direction: 'below' | 'above', message: string) => {
    const failed = direction === 'below' ? value < threshold : value > threshold;
    if (failed) {
      const gap = direction === 'below'
        ? ((threshold - value) / threshold * 100).toFixed(0)
        : ((value - threshold) / threshold * 100).toFixed(0);
      const severity: DegradationSeverity = parseFloat(gap) > 25 ? 'critical' : 'warning';
      alerts.push({ metric, current: value, threshold, severity, direction, message: `${message} (${gap}% ${direction === 'below' ? 'below' : 'above'} threshold)` });
    }
  };

  check('Win Rate', metrics.winRate, thresholds.minWinRate, 'below', `Win rate ${(metrics.winRate * 100).toFixed(1)}% below ${(thresholds.minWinRate * 100).toFixed(0)}%`);
  check('Capture Ratio', metrics.avgCaptureRatio, thresholds.minCaptureRatio, 'below', `Capture ratio ${(metrics.avgCaptureRatio * 100).toFixed(0)}% below ${(thresholds.minCaptureRatio * 100).toFixed(0)}%`);
  check('Avg Loss', metrics.avgLossSize, thresholds.maxAvgLoss, 'above', `Avg loss ${metrics.avgLossSize.toFixed(3)}% exceeds ${thresholds.maxAvgLoss}%`);
  check('Payout Asymmetry', metrics.payoutAsymmetry, thresholds.minPayoutAsymmetry, 'below', `Win/loss ratio ${metrics.payoutAsymmetry.toFixed(1)}:1 below ${thresholds.minPayoutAsymmetry}:1`);
  check('Avg Duration', metrics.avgDuration, thresholds.maxAvgDuration, 'above', `Avg duration ${metrics.avgDuration.toFixed(0)}min exceeds ${thresholds.maxAvgDuration}min`);
  check('Net Expectancy', metrics.netExpectancy, thresholds.minExpectancy, 'below', `Net expectancy ${metrics.netExpectancy.toFixed(4)}% below ${thresholds.minExpectancy}%`);
  check('Max Drawdown', metrics.maxDrawdown, thresholds.maxDrawdown, 'above', `Drawdown ${metrics.maxDrawdown.toFixed(2)}% exceeds ${thresholds.maxDrawdown}%`);

  return alerts;
}

// ─── Generate Auto-Protection Triggers ───

function generateProtectionTriggers(alerts: DegradationAlert[]): AutoProtectionTrigger[] {
  const triggers: AutoProtectionTrigger[] = [];

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;

  // Map specific degradations to protection actions
  for (const alert of alerts) {
    if (alert.metric === 'Win Rate' && alert.severity === 'critical') {
      triggers.push({ action: 'raise-gating', reason: alert.message, severity: 'critical', adjustmentFactor: 0.6 });
    }
    if (alert.metric === 'Avg Loss') {
      triggers.push({ action: 'defensive-exits', reason: alert.message, severity: alert.severity, adjustmentFactor: 0.7 });
    }
    if (alert.metric === 'Avg Duration') {
      triggers.push({ action: 'tighten-duration', reason: alert.message, severity: alert.severity, adjustmentFactor: 0.75 });
    }
    if (alert.metric === 'Net Expectancy' && alert.severity === 'critical') {
      triggers.push({ action: 'throttle-density', reason: alert.message, severity: 'critical', adjustmentFactor: 0.4 });
    }
    if (alert.metric === 'Max Drawdown') {
      triggers.push({ action: 'reduce-size', reason: alert.message, severity: alert.severity, adjustmentFactor: 0.5 });
    }
    if (alert.metric === 'Payout Asymmetry') {
      triggers.push({ action: 'restrict-pairs', reason: alert.message, severity: alert.severity, adjustmentFactor: 0.8 });
    }
  }

  // Global escalation
  if (criticalCount >= 3) {
    triggers.push({ action: 'throttle-density', reason: `${criticalCount} critical degradations — emergency throttle`, severity: 'critical', adjustmentFactor: 0.2 });
  } else if (warningCount >= 4) {
    triggers.push({ action: 'throttle-density', reason: `${warningCount} warnings — precautionary throttle`, severity: 'warning', adjustmentFactor: 0.6 });
  }

  return triggers;
}

// ─── Derive "Do Not Trade" Conditions ───

function deriveDoNotTrade(alerts: DegradationAlert[], metrics: Record<RollingWindowSize, RollingWindowMetrics>): string[] {
  const conditions: string[] = [];

  if (alerts.some(a => a.metric === 'Net Expectancy' && a.severity === 'critical')) {
    conditions.push('Expectancy negative after friction — all new entries suspended');
  }
  if (alerts.some(a => a.metric === 'Max Drawdown' && a.severity === 'critical')) {
    conditions.push('Drawdown exceeds critical threshold — position sizing halved');
  }
  if (alerts.some(a => a.metric === 'Win Rate' && a.severity === 'critical') && alerts.some(a => a.metric === 'Avg Loss' && a.severity === 'critical')) {
    conditions.push('Win rate + loss size both critical — full trade suspension recommended');
  }

  // Check for regime-specific issues across windows
  const short = metrics['50'];
  const long = metrics['200'];
  if (short.tradeCount > 10 && long.tradeCount > 50 && short.winRate < long.winRate * 0.8) {
    conditions.push('Recent performance degrading vs historical — possible regime shift');
  }

  return conditions;
}

// ─── Derive "3 Fixes Now" List ───

function deriveTopFixes(alerts: DegradationAlert[], metrics: Record<RollingWindowSize, RollingWindowMetrics>): string[] {
  const fixes: string[] = [];

  // Sort by severity then gap size
  const sorted = [...alerts].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    return 0;
  });

  for (const alert of sorted.slice(0, 3)) {
    if (alert.metric === 'Win Rate') fixes.push('Raise governance composite threshold to filter weaker setups');
    else if (alert.metric === 'Avg Loss') fixes.push('Tighten loss compression — review lossShrinker bounds');
    else if (alert.metric === 'Payout Asymmetry') fixes.push('Increase minimum friction ratio gate from 3× to 4×');
    else if (alert.metric === 'Avg Duration') fixes.push('Reduce max duration caps in exhaustion/compression regimes');
    else if (alert.metric === 'Net Expectancy') fixes.push('Restrict to top-5 performing pairs until expectancy recovers');
    else if (alert.metric === 'Max Drawdown') fixes.push('Activate position size reduction (50%) until drawdown stabilizes');
    else if (alert.metric === 'Capture Ratio') fixes.push('Implement tighter give-back caps on partial profits');
  }

  // Always include if no alerts
  if (fixes.length === 0) {
    fixes.push('System healthy — maintain current parameters');
    fixes.push('Consider shadow-testing +5% friction gate increase');
    fixes.push('Review session performance for Asian session viability');
  }

  return fixes.slice(0, 3);
}

// ─── Main Export ───

export function computeRollingHealth(trades: ForexTradeEntry[]): RollingHealthState {
  const windows: Record<RollingWindowSize, RollingWindowMetrics> = {
    '50': computeWindowMetrics(sliceWindow(trades, '50'), '50'),
    '200': computeWindowMetrics(sliceWindow(trades, '200'), '200'),
    '30d': computeWindowMetrics(sliceWindow(trades, '30d'), '30d'),
  };

  // Collect alerts from all windows (prioritize shorter windows)
  const allAlerts: DegradationAlert[] = [];
  for (const ws of ['50', '200', '30d'] as RollingWindowSize[]) {
    const windowAlerts = detectDegradation(windows[ws]);
    for (const alert of windowAlerts) {
      // Prefix with window label to distinguish
      allAlerts.push({ ...alert, message: `[${ROLLING_WINDOW_LABELS[ws]}] ${alert.message}` });
    }
  }

  // Deduplicate by metric (keep worst)
  const uniqueAlerts = new Map<string, DegradationAlert>();
  for (const alert of allAlerts) {
    const existing = uniqueAlerts.get(alert.metric);
    if (!existing || alert.severity === 'critical') {
      uniqueAlerts.set(alert.metric, alert);
    }
  }
  const alerts = Array.from(uniqueAlerts.values());

  const protectionTriggers = generateProtectionTriggers(alerts);
  const doNotTrade = deriveDoNotTrade(alerts, windows);
  const topFixes = deriveTopFixes(alerts, windows);

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;

  const healthScore = Math.max(0, Math.min(100,
    100 - criticalCount * 20 - warningCount * 8
  ));

  const protectionLevel: RollingHealthState['protectionLevel'] =
    criticalCount >= 3 ? 'heavy'
    : criticalCount >= 1 ? 'moderate'
    : warningCount >= 2 ? 'light'
    : 'none';

  return {
    windows,
    alerts,
    protectionTriggers,
    isHealthy: criticalCount === 0 && warningCount <= 1,
    healthScore,
    protectionLevel,
    doNotTrade,
    topFixes,
    timestamp: Date.now(),
  };
}
