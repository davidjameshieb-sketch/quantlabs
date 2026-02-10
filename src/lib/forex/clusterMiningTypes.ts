// Cluster Mining Types — Shared between edge function response and frontend

export interface ClusterMetrics {
  signature: string;
  trades: number;
  win_rate: number;
  expectancy_pips: number;
  net_pips: number;
  pf: number | null;
  stddev_pips: number;
  max_dd_pips: number;
  downside_deviation: number;
  stability_score: number;
}

export interface NoiseIndicator {
  indicator: string;
  expectancy_delta: number;
  stability_delta: number;
  false_positive_rate: number;
  verdict: 'ignore' | 'blocker_only' | 'session_conditional' | 'keep';
  affected_sessions: string[];
  states: {
    state: string;
    count: number;
    avg_pips: number;
    fp_rate: number;
  }[];
}

export interface CoalitionEntry {
  agents: string[];
  size: number;
  trades: number;
  expectancy: number;
  baseline_avg: number;
  lift: number;
  stddev: number;
  max_dd: number;
  score: number;
}

export interface GranularityResult {
  total_clusters: number;
  qualifying_clusters: number;
  super_edge_zones: ClusterMetrics[];
  kill_zones: ClusterMetrics[];
}

export interface ClusterMiningResponse {
  results: Record<string, Record<string, GranularityResult>>;
  noise_kill_list: Record<string, NoiseIndicator[]>;
  coalitions: Record<string, { best: CoalitionEntry[]; do_not_pair: CoalitionEntry[] }>;
  json_config: {
    pair: string;
    direction: string;
    lookback_days: number;
    timeframe_hierarchy: { decision: string; execution_filter: string; regime_veto: string };
    allowed_sessions: string[];
    blocked_sessions: string[];
    approved_clusters: string[];
    blocked_clusters: string[];
    recommended_coalition: Record<string, string[]>;
  };
  meta: {
    total_trades: number;
    lookback_days: number;
    timeframes: string[];
    generated_at: string;
  };
}

export const NOISE_VERDICT_LABELS: Record<string, { label: string; color: string }> = {
  ignore: { label: 'Ignore', color: 'text-red-400' },
  blocker_only: { label: 'Blocker Only', color: 'text-amber-400' },
  session_conditional: { label: 'Session-Only', color: 'text-blue-400' },
  keep: { label: 'Keep', color: 'text-emerald-400' },
};

export const INDICATOR_DISPLAY_NAMES: Record<string, string> = {
  ema50: '50 EMA', supertrend: 'Supertrend', adx: 'ADX', rsi: 'RSI (14)',
  trendEff: 'Trend Efficiency', pivots: 'Pivot Points', bollinger: 'Bollinger Bands',
  ichimoku: 'Ichimoku', heikinAshi: 'Heikin-Ashi', stochastics: 'Stochastics',
  donchian: 'Donchian', parabolicSAR: 'Parabolic SAR', cci: 'CCI',
  keltner: 'Keltner', roc: 'ROC', elderForce: 'Elder Force',
};
