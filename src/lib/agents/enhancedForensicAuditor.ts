// Enhanced Forensic Trade Performance Auditor
// Extends base forensic records with exit latency scoring,
// expanded leakage categories, and PnL-ranked attribution.

import { AgentId } from './types';
import { TimeframeLayer } from './mtfTypes';

// ─── Seeded RNG ───

class ForensicRNG {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
  range(min: number, max: number): number { return min + this.next() * (max - min); }
  pick<T>(arr: T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  bool(prob = 0.5): boolean { return this.next() < prob; }
}

// ─── Types ───

export type EnhancedLeakageCategory =
  | 'late-exit-timing'
  | 'premature-runner-termination'
  | 'time-stagnation-decay'
  | 'regime-mismatch-exit'
  | 'volatility-misalignment-trailing'
  | 'cross-tf-signal-conflict';

export interface ExitLatencyScore {
  optimalExitBar: number;
  actualExitBar: number;
  latencyBars: number;
  latencyPenalty: number;     // 0-1, how much capture was lost
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  description: string;
}

export interface EnhancedForensicRecord {
  tradeId: string;
  ticker: string;
  agentId: AgentId;
  timestamp: number;

  // Core metrics
  entryPrice: number;
  exitPrice: number;
  mfe: number;
  mae: number;
  realizedPnl: number;
  captureRatio: number;
  giveBackPct: number;

  // Duration
  durationBars: number;
  optimalExitBar: number;
  durationEfficiency: number;

  // Alignment
  alignmentAtEntry: number;   // 0-100
  alignmentAtExit: number;
  avgAlignmentOverLife: number;

  // Exit latency
  exitLatency: ExitLatencyScore;

  // Leakage attribution for this trade
  primaryLeakage: EnhancedLeakageCategory | null;
  leakagePnlImpact: number;  // $ impact
}

export interface EnhancedLeakageAttribution {
  category: EnhancedLeakageCategory;
  totalPnlImpact: number;        // total $ lost to this category
  avgImpactPerTrade: number;
  occurrenceCount: number;
  severity: 'minor' | 'moderate' | 'critical';
  percentOfTotalLeakage: number; // 0-100
  description: string;
  recommendation: string;
}

export interface EnhancedForensicReport {
  period: string;
  totalTrades: number;
  totalPnl: number;
  avgCaptureRatio: number;
  avgExitLatencyGrade: string;

  // Leakage ranked by PnL impact
  leakageAttributions: EnhancedLeakageAttribution[];
  totalLeakagePnl: number;

  // Top/bottom trades
  bestTrades: EnhancedForensicRecord[];
  worstTrades: EnhancedForensicRecord[];

  // Exit quality distribution
  exitGradeDistribution: Record<string, number>;

  // Per-agent performance
  agentPerformance: Array<{
    agentId: AgentId;
    tradeCount: number;
    avgCaptureRatio: number;
    avgExitLatencyGrade: string;
    totalPnl: number;
  }>;

  timestamp: number;
}

// ─── Helpers ───

const LEAKAGE_DESCRIPTIONS: Record<EnhancedLeakageCategory, { desc: string; rec: string }> = {
  'late-exit-timing': {
    desc: 'Exit executed after optimal point — profit erosion from delayed response',
    rec: 'Reduce LTF reversal detection latency; implement pre-signal momentum collapse alerts',
  },
  'premature-runner-termination': {
    desc: 'Runner position closed while HTF trend continuation still viable',
    rec: 'Increase HTF persistence threshold before permitting runner exit; widen trailing on strong trends',
  },
  'time-stagnation-decay': {
    desc: 'Capital locked in non-progressing position — opportunity cost incurred',
    rec: 'Implement progressive time-decay stops; set maximum stale-bar thresholds per regime',
  },
  'regime-mismatch-exit': {
    desc: 'Exit policy mismatched to current market regime — wrong trailing mode applied',
    rec: 'Improve regime classification accuracy; use walk-forward regime validation',
  },
  'volatility-misalignment-trailing': {
    desc: 'Trailing stop width inappropriate for current volatility conditions',
    rec: 'Implement adaptive ATR-based trailing width; tighten during contraction, relax during expansion',
  },
  'cross-tf-signal-conflict': {
    desc: 'Conflicting signals from different timeframe layers triggered suboptimal exit',
    rec: 'Increase conflict tolerance when HTF+MTF agree; require multi-layer confirmation for exit',
  },
};

const getGrade = (latencyBars: number, totalBars: number): 'A' | 'B' | 'C' | 'D' | 'F' => {
  const ratio = latencyBars / Math.max(1, totalBars);
  if (ratio < 0.05) return 'A';
  if (ratio < 0.12) return 'B';
  if (ratio < 0.22) return 'C';
  if (ratio < 0.35) return 'D';
  return 'F';
};

// ─── Engine ───

const generateForensicRecords = (rng: ForensicRNG, count: number): EnhancedForensicRecord[] => {
  const tickers = ['AAPL', 'EUR/USD', 'BTC/USD', 'SPY', 'GBP/JPY', 'TSLA', 'ETH/USD', 'NVDA'];
  const agents: AgentId[] = ['equities-alpha', 'forex-macro', 'crypto-momentum', 'liquidity-radar', 'fractal-intelligence'];
  const categories: EnhancedLeakageCategory[] = [
    'late-exit-timing', 'premature-runner-termination', 'time-stagnation-decay',
    'regime-mismatch-exit', 'volatility-misalignment-trailing', 'cross-tf-signal-conflict',
  ];

  return Array.from({ length: count }, (_, i) => {
    const entryPrice = rng.range(50, 500);
    const mfeMultiple = rng.range(0.02, 0.12);
    const mfe = entryPrice * mfeMultiple;
    const captureRatio = rng.range(0.3, 0.95);
    const realizedPnl = mfe * captureRatio;
    const exitPrice = entryPrice + realizedPnl * (rng.bool(0.65) ? 1 : -0.3);
    const mae = entryPrice * rng.range(0.005, 0.04);

    const durationBars = Math.floor(rng.range(5, 150));
    const optimalExitBar = Math.floor(durationBars * rng.range(0.4, 0.9));
    const latencyBars = Math.abs(durationBars - optimalExitBar);
    const grade = getGrade(latencyBars, durationBars);
    const latencyPenalty = latencyBars / Math.max(1, durationBars);

    const hasLeakage = rng.bool(0.6);
    const primaryLeakage = hasLeakage ? rng.pick(categories) : null;
    const leakagePnlImpact = hasLeakage ? rng.range(5, 150) : 0;

    return {
      tradeId: `ef-${i}-${Date.now()}`,
      ticker: rng.pick(tickers),
      agentId: rng.pick(agents),
      timestamp: Date.now() - Math.floor(rng.range(0, 30 * 86400000)),
      entryPrice,
      exitPrice,
      mfe,
      mae,
      realizedPnl,
      captureRatio,
      giveBackPct: 1 - captureRatio,
      durationBars,
      optimalExitBar,
      durationEfficiency: optimalExitBar / durationBars,
      alignmentAtEntry: rng.range(40, 98),
      alignmentAtExit: rng.range(20, 85),
      avgAlignmentOverLife: rng.range(35, 90),
      exitLatency: {
        optimalExitBar,
        actualExitBar: durationBars,
        latencyBars,
        latencyPenalty,
        grade,
        description: `Exit ${latencyBars} bars after optimal — ${grade} grade (${(latencyPenalty * 100).toFixed(0)}% penalty)`,
      },
      primaryLeakage,
      leakagePnlImpact,
    };
  });
};

// ─── Main Export ───

export const createEnhancedForensicReport = (): EnhancedForensicReport => {
  const rng = new ForensicRNG(683);
  const records = generateForensicRecords(rng, 50);

  const totalPnl = records.reduce((s, r) => s + r.realizedPnl, 0);
  const avgCapture = records.reduce((s, r) => s + r.captureRatio, 0) / records.length;

  // Grade distribution
  const gradeDistribution: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  records.forEach(r => { gradeDistribution[r.exitLatency.grade]++; });

  // Average grade
  const gradeValues: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
  const avgGradeVal = records.reduce((s, r) => s + gradeValues[r.exitLatency.grade], 0) / records.length;
  const avgGrade = avgGradeVal >= 3.5 ? 'A' : avgGradeVal >= 2.5 ? 'B' : avgGradeVal >= 1.5 ? 'C' : avgGradeVal >= 0.5 ? 'D' : 'F';

  // Leakage attribution grouped by category
  const categories: EnhancedLeakageCategory[] = [
    'late-exit-timing', 'premature-runner-termination', 'time-stagnation-decay',
    'regime-mismatch-exit', 'volatility-misalignment-trailing', 'cross-tf-signal-conflict',
  ];

  const totalLeakagePnl = records.reduce((s, r) => s + r.leakagePnlImpact, 0);

  const leakageAttributions: EnhancedLeakageAttribution[] = categories.map(cat => {
    const matching = records.filter(r => r.primaryLeakage === cat);
    const totalImpact = matching.reduce((s, r) => s + r.leakagePnlImpact, 0);
    const meta = LEAKAGE_DESCRIPTIONS[cat];

    return {
      category: cat,
      totalPnlImpact: totalImpact,
      avgImpactPerTrade: matching.length > 0 ? totalImpact / matching.length : 0,
      occurrenceCount: matching.length,
      severity: (totalImpact > 300 ? 'critical' : totalImpact > 100 ? 'moderate' : 'minor') as 'critical' | 'moderate' | 'minor',
      percentOfTotalLeakage: totalLeakagePnl > 0 ? (totalImpact / totalLeakagePnl) * 100 : 0,
      description: meta.desc,
      recommendation: meta.rec,
    };
  }).sort((a, b) => b.totalPnlImpact - a.totalPnlImpact);

  // Per-agent performance
  const agentIds = [...new Set(records.map(r => r.agentId))];
  const agentPerformance = agentIds.map(agentId => {
    const agentRecords = records.filter(r => r.agentId === agentId);
    const agentAvgCapture = agentRecords.reduce((s, r) => s + r.captureRatio, 0) / agentRecords.length;
    const agentAvgGradeVal = agentRecords.reduce((s, r) => s + gradeValues[r.exitLatency.grade], 0) / agentRecords.length;
    const agentAvgGrade = agentAvgGradeVal >= 3.5 ? 'A' : agentAvgGradeVal >= 2.5 ? 'B' : agentAvgGradeVal >= 1.5 ? 'C' : 'D';

    return {
      agentId,
      tradeCount: agentRecords.length,
      avgCaptureRatio: agentAvgCapture,
      avgExitLatencyGrade: agentAvgGrade,
      totalPnl: agentRecords.reduce((s, r) => s + r.realizedPnl, 0),
    };
  }).sort((a, b) => b.totalPnl - a.totalPnl);

  const sorted = [...records].sort((a, b) => b.captureRatio - a.captureRatio);

  return {
    period: '30d',
    totalTrades: records.length,
    totalPnl,
    avgCaptureRatio: avgCapture,
    avgExitLatencyGrade: avgGrade,
    leakageAttributions,
    totalLeakagePnl,
    bestTrades: sorted.slice(0, 5),
    worstTrades: sorted.slice(-5).reverse(),
    exitGradeDistribution: gradeDistribution,
    agentPerformance,
    timestamp: Date.now(),
  };
};
