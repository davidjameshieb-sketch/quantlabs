// Agent configuration registry
// Centralized definitions for all 10 AI agent models

import { AgentId, StrategyBlockType } from './types';
import { MarketType } from '@/lib/market/types';

export interface AgentDefinition {
  id: AgentId;
  name: string;
  description: string;
  coreStrategy: string;
  market: MarketType;
  model: string;
  icon: string;
  color: string;
  baseWinRate: number;
  baseSharpe: number;
  coordinationScore: number;
  strategyBlocks: StrategyBlockType[];
}

export const ALL_AGENT_IDS: AgentId[] = [
  'equities-alpha',
  'forex-macro',
  'crypto-momentum',
  'liquidity-radar',
  'range-navigator',
  'volatility-architect',
  'adaptive-learner',
  'sentiment-reactor',
  'fractal-intelligence',
  'risk-sentinel',
];

export const AGENT_DEFINITIONS: Record<AgentId, AgentDefinition> = {
  'equities-alpha': {
    id: 'equities-alpha',
    name: 'Alpha Engine',
    description: 'Alpha Engine is QuantLabs\' flagship equities-focused AI, engineered for institutional-grade quantitative analysis across the S&P 500 universe. Alpha Engine views markets as directional energy fields — measuring volatility compression, trend efficiency, and momentum acceleration to isolate high-conviction directional opportunities. It employs ATR-normalized confidence scoring to dynamically size positions based on structural clarity, and uses volatility-compression entry timing to enter trades at optimal inflection points. Alpha Engine is the cornerstone of the multi-agent coordination system, often assuming the Lead AI role due to its superior structural analysis and trend-following precision.',
    coreStrategy: 'Institutional trend-following with momentum overlay. Alpha Engine measures volatility compression for precision entry timing, tracks trend efficiency to distinguish clean directional moves from noise, and uses ATR-normalized confidence for dynamic position sizing. Breakout detection identifies compression zones, while macro overlay adjusts exposure based on cross-market correlation.',
    market: 'stocks',
    model: 'Gemini Pro',
    icon: '📈',
    color: 'text-neural-green',
    baseWinRate: 0.61,
    baseSharpe: 1.6,
    coordinationScore: 78,
    strategyBlocks: ['trend-follow', 'momentum', 'breakout', 'volatility-compression', 'macro-overlay'],
  },
  'forex-macro': {
    id: 'forex-macro',
    name: 'Macro Pulse',
    description: 'Macro Pulse is QuantLabs\' forex-specialized AI, calibrated for the 24/5 currency markets where macro forces dominate price action. Macro Pulse views currency pairs as expressions of global capital flow — tracking how monetary policy divergence, interest rate differentials, and cross-border liquidity shifts create persistent directional trends. It applies the Alpha Engine methodology with session-based liquidity adaptation, recognizing that forex markets cycle through distinct behavioral phases across Tokyo, London, and New York sessions. Macro Pulse excels at identifying macro regime transitions before they become consensus.',
    coreStrategy: 'Alpha Engine-calibrated trend-following with macro regime awareness. Macro Pulse measures volatility compression for entry timing across major and cross pairs, tracks efficiency to isolate clean directional flow from session noise, and uses ATR-normalized confidence for position sizing. Session-based liquidity adaptation layers on top, adjusting trade parameters for Tokyo/London/NY session characteristics and overlap periods.',
    market: 'forex',
    model: 'GPT-5',
    icon: '🌐',
    color: 'text-primary',
    baseWinRate: 0.57,
    baseSharpe: 1.4,
    coordinationScore: 72,
    strategyBlocks: ['trend-follow', 'momentum', 'breakout', 'volatility-compression', 'macro-overlay'],
  },
  'crypto-momentum': {
    id: 'crypto-momentum',
    name: 'Momentum Grid',
    description: 'Momentum Grid is QuantLabs\' crypto-focused AI, purpose-built for the 24/7 digital asset markets where volatility is the dominant market feature. Momentum Grid views cryptocurrency markets as high-energy momentum systems — where explosive directional moves emerge from volatility compression phases, and conviction acceleration separates genuine breakouts from liquidation-driven noise. It specializes in detecting the transition from low-volatility squeeze setups to high-expansion moves, using ATR-based conviction scaling optimized for the extreme volatility environment of digital assets.',
    coreStrategy: 'Alpha Engine-calibrated momentum-first strategy with volatility compression detection. Momentum Grid identifies squeeze setups for early entry in explosive moves, tracks trend efficiency to filter genuine directional conviction from liquidation cascade noise, and scales positions via ATR-normalized confidence. Optimized for crypto\'s 24/7 market structure with enhanced sensitivity to rapid regime transitions.',
    market: 'crypto',
    model: 'Gemini Flash',
    icon: '⚡',
    color: 'text-neural-orange',
    baseWinRate: 0.55,
    baseSharpe: 1.3,
    coordinationScore: 68,
    strategyBlocks: ['trend-follow', 'momentum', 'breakout', 'volatility-compression', 'macro-overlay'],
  },
  'liquidity-radar': {
    id: 'liquidity-radar',
    name: 'Liquidity Radar',
    description: 'Liquidity Radar is QuantLabs\' order flow gravity and liquidity migration tracker, designed to identify hidden liquidity magnets, supply/demand vacuum zones, and institutional order absorption areas. Liquidity Radar views markets as gravitational fields where price is naturally pulled toward liquidity clusters. The model tracks how price migrates toward stop clusters, volume voids, and liquidity imbalance zones — revealing where institutional participants are accumulating or distributing. Liquidity Radar improves entry precision across all agents and prevents models from entering trades directly into liquidity traps.',
    coreStrategy: 'Order flow analysis with liquidity migration mapping. Liquidity Radar detects stop-hunt probability zones, forecasts liquidity void breakouts, and recognizes institutional order absorption patterns. Price magnet zone mapping identifies where liquidity clusters create gravitational pull, while volume void analysis reveals vacuum zones where rapid price movement is probable.',
    market: 'stocks',
    model: 'Claude 3.5',
    icon: '🌀',
    color: 'text-cyan-400',
    baseWinRate: 0.58,
    baseSharpe: 1.45,
    coordinationScore: 74,
    strategyBlocks: ['trend-follow', 'breakout', 'range-trading', 'volatility-compression', 'macro-overlay'],
  },
  'range-navigator': {
    id: 'range-navigator',
    name: 'Range Navigator',
    description: 'Range Navigator is QuantLabs\' market equilibrium and oscillation intelligence specialist, designed to detect when markets enter statistically balanced environments where directional edge weakens. Range Navigator views markets as breathing systems oscillating between expansion and compression phases. It tracks mean reversion probability, range boundary elasticity, and rotational capital flow inside consolidation structures. Range Navigator prevents directional models from trading aggressively inside neutral environments, acting as a critical counterbalance to momentum-driven agents.',
    coreStrategy: 'Equilibrium detection with oscillation amplitude forecasting. Range Navigator identifies range-bound market conditions, maps mean reversion opportunities within established boundaries, and recognizes consolidation breakout failure patterns. Oscillation amplitude modeling predicts how far price will rotate within established ranges, while boundary elasticity analysis measures the probability of range expansion vs contraction.',
    market: 'forex',
    model: 'GPT-4o',
    icon: '🧭',
    color: 'text-amber-400',
    baseWinRate: 0.56,
    baseSharpe: 1.35,
    coordinationScore: 65,
    strategyBlocks: ['range-trading', 'mean-reversion', 'volatility-compression', 'trend-follow', 'macro-overlay'],
  },
  'volatility-architect': {
    id: 'volatility-architect',
    name: 'Volatility Architect',
    description: 'Volatility Architect is QuantLabs\' risk expansion and compression cycle forecaster, focused on predicting volatility expansion events before they occur. Volatility Architect views volatility as the heartbeat of market opportunity and risk — studying volatility contraction patterns, options market implied volatility divergence, and price entropy transitions to anticipate explosive movement potential. It stabilizes risk sizing across all agents and improves trade survivability by providing advance warning of regime shifts.',
    coreStrategy: 'Volatility cycle forecasting with entropy transition detection. Volatility Architect predicts expansion events from compression signatures, optimizes stop placement based on expected volatility regimes, and models trade duration probability. Risk environment classification enables dynamic position sizing adjustments across the entire agent fleet before volatility events materialize.',
    market: 'crypto',
    model: 'Gemini Ultra',
    icon: '🌪',
    color: 'text-violet-400',
    baseWinRate: 0.54,
    baseSharpe: 1.5,
    coordinationScore: 70,
    strategyBlocks: ['volatility-compression', 'breakout', 'momentum', 'trend-follow', 'macro-overlay'],
  },
  'adaptive-learner': {
    id: 'adaptive-learner',
    name: 'Adaptive Learning Node',
    description: 'Adaptive Learning Node is QuantLabs\' experimental evolution and edge discovery engine, operating as the evolutionary exploration model within controlled risk boundaries. Adaptive Learning Node searches for structural edge drift and new market behavior patterns before they become mainstream signals — testing emerging parameter relationships and behavioral signal combinations. It ensures QuantLabs evolves instead of stagnating, continuously probing for new alpha sources while respecting the Meta-Controller\'s risk stability anchors.',
    coreStrategy: 'Experimental parameter mutation with edge discovery validation. Adaptive Learning Node tests emerging signal relationships across markets, detects edge decay in established strategies, and validates experimental adaptive logic before promoting discoveries to production models. Controlled risk boundaries ensure exploration never threatens portfolio stability.',
    market: 'stocks',
    model: 'Gemini 2.0',
    icon: '🧪',
    color: 'text-emerald-400',
    baseWinRate: 0.52,
    baseSharpe: 1.15,
    coordinationScore: 58,
    strategyBlocks: ['momentum', 'breakout', 'mean-reversion', 'volatility-compression', 'trend-follow'],
  },
  'sentiment-reactor': {
    id: 'sentiment-reactor',
    name: 'Sentiment Reactor',
    description: 'Sentiment Reactor is QuantLabs\' behavioral crowd psychology interpreter, designed to decode crowd positioning and emotional momentum through social sentiment analytics, volatility skew data, and market positioning imbalance signals. Sentiment Reactor views markets as emotional systems driven by herd psychology and panic cycles — detecting overcrowded trades, sentiment exhaustion patterns, and contrarian inflection points. It protects the entire agent fleet against entering trades when consensus risk becomes unstable.',
    coreStrategy: 'Crowd psychology analysis with contrarian opportunity mapping. Sentiment Reactor detects overcrowded trade positions, recognizes sentiment exhaustion before reversals, and forecasts emotional momentum acceleration. Volatility skew analysis and positioning imbalance signals reveal when market consensus has become fragile, providing early warning of crowd-driven reversals.',
    market: 'crypto',
    model: 'GPT-5 Mini',
    icon: '📊',
    color: 'text-rose-400',
    baseWinRate: 0.53,
    baseSharpe: 1.25,
    coordinationScore: 62,
    strategyBlocks: ['mean-reversion', 'momentum', 'macro-overlay', 'trend-follow', 'range-trading'],
  },
  'fractal-intelligence': {
    id: 'fractal-intelligence',
    name: 'Fractal Intelligence',
    description: 'Fractal Intelligence is QuantLabs\' multi-timeframe pattern symmetry analyzer, examining repeating structural patterns across multiple time horizons simultaneously. Fractal Intelligence studies how short-term structures mirror long-term trend stability and identifies when micro structures break macro symmetry — providing critical signal confirmation layering across all timeframes. It enhances confidence stacking by validating whether micro-structure patterns align with or diverge from macro trend architecture.',
    coreStrategy: 'Multi-timeframe fractal pattern synchronization with structural durability validation. Fractal Intelligence models pattern repetition probability across timeframes, confirms trend durability through structural symmetry analysis, and layers fractal signal confirmation to strengthen conviction scores. When micro-level patterns break macro symmetry, it flags potential trend reversal zones.',
    market: 'indices',
    model: 'Claude 4',
    icon: '🔬',
    color: 'text-sky-400',
    baseWinRate: 0.56,
    baseSharpe: 1.4,
    coordinationScore: 67,
    strategyBlocks: ['trend-follow', 'momentum', 'breakout', 'volatility-compression', 'range-trading'],
  },
  'risk-sentinel': {
    id: 'risk-sentinel',
    name: 'Risk Sentinel',
    description: 'Risk Sentinel is QuantLabs\' portfolio survival and capital preservation guardian, operating as the immune system of the entire AI fleet. Risk Sentinel monitors risk clustering, correlation escalation, drawdown acceleration, and capital stability metrics across all AI agents simultaneously. Risk Sentinel views trading as survival first, performance second — ensuring the system remains evolutionarily stable even during extreme market conditions. It enforces portfolio drawdown containment, exposure concentration limits, and adaptive capital throttling.',
    coreStrategy: 'Portfolio-level risk surveillance with adaptive capital throttling. Risk Sentinel monitors correlation risk across all agent positions, detects drawdown acceleration before critical thresholds, and enforces exposure concentration limits. Adaptive capital throttling reduces system-wide risk during elevated volatility regimes, while correlation risk balancing prevents clustered losses across agents.',
    market: 'stocks',
    model: 'Gemini Pro 2',
    icon: '🛡',
    color: 'text-yellow-400',
    baseWinRate: 0.59,
    baseSharpe: 1.55,
    coordinationScore: 76,
    strategyBlocks: ['macro-overlay', 'volatility-compression', 'range-trading', 'trend-follow', 'mean-reversion'],
  },
};
