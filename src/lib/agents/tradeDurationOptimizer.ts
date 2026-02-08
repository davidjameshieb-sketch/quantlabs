// Trade Duration Optimization Engine
// Analyzes trade lifecycle timing, penalizes capital stagnation,
// identifies optimal duration windows, and adjusts exit timing dynamically.

import { TimeframeLayer, TimeframeAlignmentState } from './mtfTypes';

// ─── Seeded RNG ───

class DurRNG {
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

export type RegimeType = 'trending' | 'ranging' | 'volatile' | 'quiet';

export interface DurationBucket {
  minBars: number;
  maxBars: number;
  label: string;
  winRate: number;
  avgReturn: number;
  avgCaptureRatio: number;
  tradeCount: number;
  profitFactor: number;
}

export interface WinLossDurationComparison {
  avgWinDuration: number;
  avgLossDuration: number;
  medianWinDuration: number;
  medianLossDuration: number;
  winDurationStdDev: number;
  lossDurationStdDev: number;
  durationRatio: number;          // win/loss duration ratio
  insight: string;
}

export interface OptimalDurationWindow {
  regime: RegimeType;
  layer: TimeframeLayer;
  optimalMinBars: number;
  optimalMaxBars: number;
  peakCaptureBar: number;         // bar where capture ratio peaks
  diminishingReturnsBar: number;  // bar where holding becomes negative EV
  confidenceLevel: number;        // 0-100
  description: string;
}

export interface CapitalStagnationEvent {
  tradeId: string;
  ticker: string;
  stagnationStartBar: number;
  stagnationEndBar: number;
  durationBars: number;
  capitalLocked: number;          // $ locked in stale position
  opportunityCost: number;        // estimated missed returns
  resolved: boolean;
  resolution: 'exited' | 'progressed' | 'pending';
}

export interface MomentumPersistenceMetrics {
  currentMomentum: number;        // 0-1
  momentumDecayRate: number;      // per bar
  projectedExitBar: number;       // when momentum crosses threshold
  threshold: number;              // exit trigger
  barsAboveThreshold: number;
  dynamicAdjustment: number;      // multiplier for exit timing
}

export interface TradeDurationOptimizerState {
  // Duration distribution analysis
  durationBuckets: DurationBucket[];
  winLossComparison: WinLossDurationComparison;

  // Optimal windows by regime
  optimalWindows: OptimalDurationWindow[];

  // Capital stagnation tracking
  stagnationEvents: CapitalStagnationEvent[];
  totalCapitalStagnationCost: number;
  stagnationFrequency: number;    // 0-1

  // Momentum persistence
  momentumPersistence: MomentumPersistenceMetrics;

  // Aggregate KPIs
  avgDurationEfficiency: number;  // 0-1
  optimalExitAccuracy: number;    // % of trades exited within optimal window
  capitalTurnoverRate: number;    // trades per unit capital per period
  durationAdjustedSharpe: number; // Sharpe after duration optimization

  timestamp: number;
}

// ─── Engine ───

const generateDurationBuckets = (rng: DurRNG): DurationBucket[] => {
  const buckets: Array<{ min: number; max: number; label: string }> = [
    { min: 1, max: 5, label: 'Scalp (1-5 bars)' },
    { min: 6, max: 15, label: 'Short (6-15 bars)' },
    { min: 16, max: 40, label: 'Swing (16-40 bars)' },
    { min: 41, max: 80, label: 'Position (41-80 bars)' },
    { min: 81, max: 200, label: 'Extended (81-200 bars)' },
  ];

  return buckets.map(b => ({
    minBars: b.min,
    maxBars: b.max,
    label: b.label,
    winRate: rng.range(0.42, 0.72),
    avgReturn: rng.range(-0.005, 0.035),
    avgCaptureRatio: rng.range(0.4, 0.85),
    tradeCount: Math.floor(rng.range(15, 120)),
    profitFactor: rng.range(0.8, 3.2),
  }));
};

const generateWinLossComparison = (rng: DurRNG): WinLossDurationComparison => {
  const avgWin = rng.range(12, 45);
  const avgLoss = rng.range(6, 25);
  const ratio = avgWin / avgLoss;

  let insight: string;
  if (ratio > 1.5) {
    insight = `Winners held ${ratio.toFixed(1)}x longer than losers — patience rewarded, consider extending runner duration`;
  } else if (ratio > 1.0) {
    insight = `Winners slightly longer (${ratio.toFixed(1)}x) — cut losers faster to improve capital efficiency`;
  } else {
    insight = `Losers held longer than winners (${ratio.toFixed(1)}x) — critical: implement tighter time-decay stops`;
  }

  return {
    avgWinDuration: avgWin,
    avgLossDuration: avgLoss,
    medianWinDuration: avgWin * rng.range(0.8, 1.1),
    medianLossDuration: avgLoss * rng.range(0.85, 1.15),
    winDurationStdDev: avgWin * rng.range(0.3, 0.6),
    lossDurationStdDev: avgLoss * rng.range(0.4, 0.7),
    durationRatio: ratio,
    insight,
  };
};

const generateOptimalWindows = (rng: DurRNG): OptimalDurationWindow[] => {
  const regimes: RegimeType[] = ['trending', 'ranging', 'volatile', 'quiet'];
  const layers: TimeframeLayer[] = ['HTF', 'MTF', 'LTF'];

  return regimes.flatMap(regime =>
    layers.map(layer => {
      const baseMin = layer === 'HTF' ? 20 : layer === 'MTF' ? 8 : 2;
      const baseMax = layer === 'HTF' ? 120 : layer === 'MTF' ? 50 : 20;
      const regimeMult = regime === 'trending' ? 1.3 : regime === 'ranging' ? 0.7 : regime === 'volatile' ? 0.8 : 1.0;

      const optMin = Math.floor(baseMin * regimeMult);
      const optMax = Math.floor(baseMax * regimeMult);
      const peak = Math.floor(rng.range(optMin * 0.6, optMax * 0.8));
      const diminishing = Math.floor(optMax * rng.range(0.85, 1.2));

      return {
        regime,
        layer,
        optimalMinBars: optMin,
        optimalMaxBars: optMax,
        peakCaptureBar: peak,
        diminishingReturnsBar: diminishing,
        confidenceLevel: rng.range(55, 95),
        description: `${regime} ${layer}: optimal ${optMin}-${optMax} bars, peak capture at bar ${peak}`,
      };
    })
  );
};

const generateStagnationEvents = (rng: DurRNG, count: number): CapitalStagnationEvent[] => {
  const tickers = ['AAPL', 'EUR/USD', 'BTC/USD', 'SPY', 'GBP/JPY', 'TSLA'];

  return Array.from({ length: count }, (_, i) => {
    const start = Math.floor(rng.range(5, 50));
    const duration = Math.floor(rng.range(5, 30));
    const resolved = rng.bool(0.7);

    return {
      tradeId: `stag-${i}-${Date.now()}`,
      ticker: rng.pick(tickers),
      stagnationStartBar: start,
      stagnationEndBar: start + duration,
      durationBars: duration,
      capitalLocked: rng.range(500, 5000),
      opportunityCost: rng.range(20, 200),
      resolved,
      resolution: resolved ? (rng.bool(0.6) ? 'exited' : 'progressed') : 'pending',
    };
  });
};

const generateMomentumPersistence = (rng: DurRNG): MomentumPersistenceMetrics => {
  const momentum = rng.range(0.2, 0.95);
  const decayRate = rng.range(0.01, 0.06);
  const threshold = rng.range(0.25, 0.45);
  const projectedBar = momentum > threshold
    ? Math.floor((momentum - threshold) / decayRate)
    : 0;

  return {
    currentMomentum: momentum,
    momentumDecayRate: decayRate,
    projectedExitBar: projectedBar,
    threshold,
    barsAboveThreshold: Math.floor(rng.range(0, 40)),
    dynamicAdjustment: momentum > 0.7 ? 1.3 : momentum > 0.4 ? 1.0 : 0.7,
  };
};

// ─── Main Export ───

export const createTradeDurationOptimizerState = (): TradeDurationOptimizerState => {
  const rng = new DurRNG(557);

  const buckets = generateDurationBuckets(rng);
  const winLoss = generateWinLossComparison(rng);
  const windows = generateOptimalWindows(rng);
  const stagnation = generateStagnationEvents(rng, 6);
  const momentum = generateMomentumPersistence(rng);

  const totalStagnationCost = stagnation.reduce((s, e) => s + e.opportunityCost, 0);

  return {
    durationBuckets: buckets,
    winLossComparison: winLoss,
    optimalWindows: windows,
    stagnationEvents: stagnation,
    totalCapitalStagnationCost: totalStagnationCost,
    stagnationFrequency: rng.range(0.05, 0.2),
    momentumPersistence: momentum,

    avgDurationEfficiency: rng.range(0.55, 0.88),
    optimalExitAccuracy: rng.range(45, 82),
    capitalTurnoverRate: rng.range(1.5, 4.5),
    durationAdjustedSharpe: rng.range(1.2, 2.6),

    timestamp: Date.now(),
  };
};
