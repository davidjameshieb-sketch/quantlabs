// Optimization Team Agent Configuration Registry
// 4 dedicated optimization agents refining trading strategies

export type OptimizationAgentId =
  | 'risk-calibrator'
  | 'timing-precision'
  | 'capital-flow'
  | 'performance-catalyst';

export interface OptimizationAgentDefinition {
  id: OptimizationAgentId;
  name: string;
  title: string;
  description: string;
  optimizationFocus: string;
  model: string;
  icon: string;
  color: string;
  methodology: string;
  optimizationTargets: string[];
}

export const ALL_OPTIMIZATION_IDS: OptimizationAgentId[] = [
  'risk-calibrator',
  'timing-precision',
  'capital-flow',
  'performance-catalyst',
];

export const OPTIMIZATION_DEFINITIONS: Record<OptimizationAgentId, OptimizationAgentDefinition> = {
  'risk-calibrator': {
    id: 'risk-calibrator',
    name: 'Risk Calibration Engine',
    title: 'Dynamic Risk Parameter Optimization',
    description: 'Continuously refines risk parameters across all trading agents — including stop-loss placement, position sizing ratios, and drawdown recovery protocols. Analyzes historical drawdown patterns and volatility regime transitions to adaptively calibrate risk exposure, ensuring each agent maintains optimal risk-reward balance without over-constraining profitable opportunities.',
    optimizationFocus: 'Risk Management',
    model: 'Gemini Pro',
    icon: '🎯',
    color: 'text-neural-green',
    methodology: 'ATR-adaptive stop calibration, volatility regime risk scaling, drawdown recovery optimization',
    optimizationTargets: [
      'Stop-loss placement precision',
      'Position sizing optimization',
      'Drawdown recovery speed',
      'Risk-reward ratio enhancement',
    ],
  },
  'timing-precision': {
    id: 'timing-precision',
    name: 'Timing Precision Engine',
    title: 'Entry & Exit Timing Optimization',
    description: 'Optimizes trade entry and exit timing across the fleet by analyzing volatility compression signatures, session-based liquidity patterns, and momentum acceleration curves. Refines when agents commit to positions and when they capture profits — reducing timing slippage and improving the percentage of trades that reach optimal exit points before mean reversion.',
    optimizationFocus: 'Trade Timing',
    model: 'GPT-5 Mini',
    icon: '⏱',
    color: 'text-neural-cyan',
    methodology: 'Volatility compression entry timing, momentum exhaustion exit detection, session liquidity mapping',
    optimizationTargets: [
      'Entry timing precision',
      'Exit point optimization',
      'Timing slippage reduction',
      'Session-optimal execution',
    ],
  },
  'capital-flow': {
    id: 'capital-flow',
    name: 'Capital Flow Optimizer',
    title: 'Dynamic Capital Allocation Intelligence',
    description: 'Manages the dynamic allocation of capital across all trading agents based on real-time performance scoring, conviction confidence, and regime-specific opportunity density. Ensures high-performing agents receive proportionally greater capital allocation while underperforming models are throttled — maintaining the exploitation/exploration capital balance defined by the Meta-Controller.',
    optimizationFocus: 'Capital Allocation',
    model: 'Gemini 2.0',
    icon: '💰',
    color: 'text-neural-orange',
    methodology: 'Performance-weighted allocation, conviction-scaled sizing, regime-adaptive capital distribution',
    optimizationTargets: [
      'Performance-based allocation weighting',
      'Conviction confidence scaling',
      'Exploitation/exploration balance',
      'Capital utilization efficiency',
    ],
  },
  'performance-catalyst': {
    id: 'performance-catalyst',
    name: 'Performance Catalyst',
    title: 'Strategy Enhancement & Edge Refinement',
    description: 'Analyzes cross-agent performance patterns to identify systematic enhancement opportunities. Studies win-rate decay curves, strategy correlation clustering, and edge durability metrics to recommend parameter mutations and strategy block reweighting. Acts as the continuous improvement engine that prevents strategy stagnation across the fleet.',
    optimizationFocus: 'Performance Enhancement',
    model: 'GPT-5',
    icon: '🚀',
    color: 'text-neural-purple',
    methodology: 'Edge decay detection, cross-agent performance correlation, strategy block reweighting optimization',
    optimizationTargets: [
      'Win-rate improvement',
      'Edge durability extension',
      'Strategy correlation reduction',
      'Parameter mutation validation',
    ],
  },
};
