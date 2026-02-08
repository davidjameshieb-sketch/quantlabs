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
    description: 'Macro Pulse is QuantLabs\' high-frequency forex scalping AI, engineered for rapid-fire execution across major currency pairs on OANDA. Macro Pulse views FX markets as continuous micro-opportunity streams — exploiting session-specific liquidity surges, tight-spread windows, and sub-15-minute momentum pulses to generate high-volume trade flow. It combines macro regime awareness with scalping precision, prioritizing trade count and capital velocity over individual trade size. Macro Pulse thrives during London/NY overlap sessions where liquidity depth enables maximum scalp frequency with minimal slippage.',
    coreStrategy: 'High-volume scalping with macro session awareness. Macro Pulse targets 1-15 minute trade windows on major pairs, using spread stability detection for entry timing, ATR-micro confidence for rapid position sizing, and session-optimized aggression scaling. Trades are designed for quick capture and fast exit — volume over magnitude. Anti-overtrading governors prevent degradation during low-liquidity windows.',
    market: 'forex',
    model: 'GPT-5',
    icon: '🌐',
    color: 'text-primary',
    baseWinRate: 0.64,
    baseSharpe: 1.55,
    coordinationScore: 78,
    strategyBlocks: ['momentum', 'breakout', 'volatility-compression', 'trend-follow', 'macro-overlay'],
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
    description: 'Liquidity Radar is QuantLabs\' FX order flow and liquidity mapping engine, optimized to support high-frequency scalping by detecting micro-liquidity pockets, stop-hunt zones, and spread widening events in real-time. Liquidity Radar scans bid/ask depth across OANDA-compatible pairs to identify optimal scalp entry windows where spread-to-move ratios are most favorable. It prevents the scalping fleet from entering trades into liquidity traps or during spread blow-outs, directly improving scalp capture rates and reducing friction-based losses.',
    coreStrategy: 'Micro-liquidity analysis for scalping optimization. Liquidity Radar detects stop-hunt probability zones at scalping timeframes, maps spread stability windows for optimal entry timing, and tracks order flow imbalances that signal 1-5 minute directional micro-moves. Price magnet zone mapping at scalp scale identifies where quick fills and tight exits are most probable.',
    market: 'forex',
    model: 'Claude 3.5',
    icon: '🌀',
    color: 'text-cyan-400',
    baseWinRate: 0.61,
    baseSharpe: 1.50,
    coordinationScore: 76,
    strategyBlocks: ['breakout', 'momentum', 'range-trading', 'volatility-compression', 'macro-overlay'],
  },
  'range-navigator': {
    id: 'range-navigator',
    name: 'Range Navigator',
    description: 'Range Navigator is QuantLabs\' FX range-scalping specialist, purpose-built for high-frequency mean-reversion scalps within identified equilibrium zones. Range Navigator detects micro-range boundaries on major pairs and executes rapid fade trades at range extremes — buying support bounces and selling resistance rejections in sub-10-minute windows. It provides critical counterbalance to momentum scalps by capturing rotational flow during consolidation phases, ensuring the fleet maintains high trade volume even in non-trending conditions.',
    coreStrategy: 'High-frequency range-fade scalping with boundary elasticity timing. Range Navigator identifies micro-consolidation structures on 1-5 minute timeframes, executes mean-reversion scalps at statistical boundaries, and exits within 2-12 minutes. Oscillation amplitude modeling predicts rotation distance for precise take-profit placement, while session-aware aggression prevents fade scalps during breakout-prone windows.',
    market: 'forex',
    model: 'GPT-4o',
    icon: '🧭',
    color: 'text-amber-400',
    baseWinRate: 0.62,
    baseSharpe: 1.50,
    coordinationScore: 72,
    strategyBlocks: ['range-trading', 'mean-reversion', 'volatility-compression', 'momentum', 'macro-overlay'],
  },
  'volatility-architect': {
    id: 'volatility-architect',
    name: 'Volatility Architect',
    description: 'Volatility Architect is QuantLabs\' FX volatility regime engine, retuned to power high-frequency scalping by forecasting micro-volatility expansion windows. Volatility Architect identifies the precise moments when compression phases transition to ignition — the highest-probability scalping windows where breakout moves generate rapid pip capture with minimal drawdown. It dynamically adjusts the entire scalping fleet\'s aggression level based on real-time volatility phase detection, throttling trade frequency during exhaustion phases and maximizing output during ignition/expansion.',
    coreStrategy: 'Micro-volatility cycle detection for scalping regime optimization. Volatility Architect forecasts compression-to-ignition transitions for breakout scalp timing, classifies volatility phases to modulate fleet-wide trade frequency, and optimizes stop/target distances based on current ATR micro-regime. Session-volatility correlation tracking ensures scalping aggression aligns with historical session behavior.',
    market: 'forex',
    model: 'Gemini Ultra',
    icon: '🌪',
    color: 'text-violet-400',
    baseWinRate: 0.60,
    baseSharpe: 1.55,
    coordinationScore: 74,
    strategyBlocks: ['volatility-compression', 'breakout', 'momentum', 'trend-follow', 'macro-overlay'],
  },
  'adaptive-learner': {
    id: 'adaptive-learner',
    name: 'Adaptive Learning Node',
    description: 'Adaptive Learning Node is QuantLabs\' scalping evolution engine, continuously probing for new micro-edge patterns in FX price action. It tests emerging scalp signal combinations — micro-breakout timing, spread-momentum correlations, and session-specific entry optimizations — to discover new alpha sources for the high-frequency fleet. Every discovery is validated against historical scalp performance before promotion to production, ensuring the scalping system evolves without introducing fragile parameters.',
    coreStrategy: 'Experimental scalp-edge discovery with controlled validation. Adaptive Learning Node tests emerging micro-pattern relationships across FX sessions, detects edge decay in established scalp strategies, and validates new timing/entry parameter mutations. Controlled risk boundaries ensure exploration trades remain sub-1000-unit positions with tight stop-loss.',
    market: 'forex',
    model: 'Gemini 2.0',
    icon: '🧪',
    color: 'text-emerald-400',
    baseWinRate: 0.58,
    baseSharpe: 1.30,
    coordinationScore: 64,
    strategyBlocks: ['momentum', 'breakout', 'mean-reversion', 'volatility-compression', 'trend-follow'],
  },
  'sentiment-reactor': {
    id: 'sentiment-reactor',
    name: 'Sentiment Reactor',
    description: 'Sentiment Reactor is QuantLabs\' FX crowd positioning interpreter, adapted for scalping-speed sentiment analysis. It detects micro-sentiment shifts in forex positioning data — COT report deltas, retail positioning imbalances, and options skew changes — to identify contrarian scalp opportunities where crowd consensus is about to snap. Sentiment Reactor fires rapid fade signals when retail positioning becomes extreme, enabling the fleet to scalp against crowded trades with 2-8 minute hold times.',
    coreStrategy: 'Rapid contrarian scalping via positioning imbalance detection. Sentiment Reactor monitors real-time retail FX positioning ratios for extreme readings, triggers fade scalps against overcrowded directional bets, and exits within minutes as mean-reversion momentum kicks in. Pairs with highest retail concentration get priority for counter-sentiment scalps.',
    market: 'forex',
    model: 'GPT-5 Mini',
    icon: '📊',
    color: 'text-rose-400',
    baseWinRate: 0.59,
    baseSharpe: 1.40,
    coordinationScore: 68,
    strategyBlocks: ['mean-reversion', 'momentum', 'macro-overlay', 'range-trading', 'trend-follow'],
  },
  'fractal-intelligence': {
    id: 'fractal-intelligence',
    name: 'Fractal Intelligence',
    description: 'Fractal Intelligence is QuantLabs\' multi-timeframe scalp confirmation engine, examining micro-structural patterns across 1m, 5m, and 15m FX charts simultaneously. Fractal Intelligence validates scalp entries by confirming that micro price structures align with higher-timeframe momentum direction — preventing the fleet from taking counter-trend scalps that carry hidden reversal risk. It serves as the confidence-stacking layer for the scalping system, boosting conviction when fractal alignment is strong.',
    coreStrategy: 'Multi-timeframe micro-fractal confirmation for scalp validation. Fractal Intelligence checks 1m/5m/15m structural alignment before scalp entry, detects when micro-patterns diverge from higher-timeframe trend, and layers fractal confirmation scores to filter low-conviction scalps. Rapid re-evaluation occurs every 30 seconds to keep alignment data fresh for the fleet.',
    market: 'forex',
    model: 'Claude 4',
    icon: '🔬',
    color: 'text-sky-400',
    baseWinRate: 0.60,
    baseSharpe: 1.48,
    coordinationScore: 72,
    strategyBlocks: ['trend-follow', 'momentum', 'breakout', 'volatility-compression', 'range-trading'],
  },
  'risk-sentinel': {
    id: 'risk-sentinel',
    name: 'Risk Sentinel',
    description: 'Risk Sentinel is QuantLabs\' scalping-fleet risk guardian, operating as the immune system for high-frequency FX execution. Risk Sentinel monitors aggregate scalp exposure, correlation clustering across concurrent positions, drawdown velocity from rapid-fire trades, and spread-cost accumulation. In a high-volume scalping environment, Risk Sentinel is critical — preventing death-by-a-thousand-cuts scenarios where marginal losses from spread friction compound faster than gains. It enforces maximum concurrent position limits, daily loss governors, and anti-overtrading throttles.',
    coreStrategy: 'High-frequency risk surveillance with scalping-specific governors. Risk Sentinel monitors real-time aggregate exposure across all concurrent scalps, detects when spread costs are eroding edge, enforces maximum daily trade count limits, and triggers fleet-wide throttling when drawdown velocity exceeds adaptive thresholds. Position correlation monitoring prevents clustered USD-correlated scalps from creating hidden directional risk.',
    market: 'forex',
    model: 'Gemini Pro 2',
    icon: '🛡',
    color: 'text-yellow-400',
    baseWinRate: 0.63,
    baseSharpe: 1.60,
    coordinationScore: 80,
    strategyBlocks: ['macro-overlay', 'volatility-compression', 'range-trading', 'trend-follow', 'mean-reversion'],
  },
};
