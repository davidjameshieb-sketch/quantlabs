import { createContext, useContext, useState, ReactNode } from 'react';

export type ExplanationMode = 'beginner' | 'technical';

interface ExplanationModeContextType {
  mode: ExplanationMode;
  setMode: (mode: ExplanationMode) => void;
  toggleMode: () => void;
}

const ExplanationModeContext = createContext<ExplanationModeContextType | undefined>(undefined);

export const ExplanationModeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<ExplanationMode>('beginner');

  const toggleMode = () => {
    setMode(prev => prev === 'beginner' ? 'technical' : 'beginner');
  };

  return (
    <ExplanationModeContext.Provider value={{ mode, setMode, toggleMode }}>
      {children}
    </ExplanationModeContext.Provider>
  );
};

export const useExplanationMode = () => {
  const context = useContext(ExplanationModeContext);
  if (!context) {
    throw new Error('useExplanationMode must be used within an ExplanationModeProvider');
  }
  return context;
};

// Explanation content for each metric - both beginner and technical versions
export const EXPLANATIONS = {
  efficiency: {
    beginner: {
      title: "How Clean is the Movement?",
      description: "Think of efficiency like a road trip. Did you take the highway (clean, direct) or get lost on back roads (noisy, choppy)? High efficiency means price moved directly toward its goal.",
      tip: "🟢 Clean = Highway driving. 🟡 Mixed = Some detours. 🔴 Noisy = Lost in traffic.",
    },
    technical: {
      title: "Movement Efficiency Ratio",
      description: "Efficiency = |Net Move| / Total Path Length. Measures directional conviction by comparing the straight-line distance traveled vs the actual price path with all its oscillations.",
      formula: "Efficiency = (Close - Open) / Σ|High_i - Low_i|",
      tip: "Values > 0.60 indicate trending conditions. < 0.30 suggests ranging/choppy markets.",
    },
  },
  confidence: {
    beginner: {
      title: "How Strong is the Trend?",
      description: "Confidence is like measuring how far apart two train tracks are. When the fast and slow trend lines separate widely, it shows strong directional commitment - like a confident stride vs hesitant steps.",
      tip: "📈 High confidence = Big separation between trend lines. The market is making a clear choice.",
    },
    technical: {
      title: "Trend Core Divergence",
      description: "Confidence measures the spread between Fast (8-period RQK) and Slow (21-period RQK) trend cores, normalized by ATR to account for volatility context.",
      formula: "Confidence = min((|FastCore - SlowCore| / ATR) × 100, 100)",
      tip: "> 80% = Strong structural divergence. 40-80% = Developing. < 40% = Compressed cores.",
    },
  },
  strategy: {
    beginner: {
      title: "What Should I Do?",
      description: "The AI looks at trend strength and movement quality to suggest the best approach - like a GPS telling you whether to accelerate, cruise, or pull over and wait.",
      states: {
        pressing: "🚀 Full speed ahead - optimal conditions for trend-following",
        tracking: "🎯 Standard cruising - good setup, stay alert",
        holding: "⏸️ Hold position - choppy but trend intact",
        watching: "👀 Observe only - setup forming, not ready yet",
        avoiding: "🛑 Stay away - no edge, chop zone",
      },
    },
    technical: {
      title: "Strategy State Matrix",
      description: "Strategy is derived from a 2D matrix of Macro Strength (from confidence) and Efficiency Verdict. Each combination maps to an optimal approach state.",
      states: {
        pressing: "Strong + Clean: Maximum conviction. Trend structure with efficient execution.",
        tracking: "Strong + Mixed: Trend present but with noise. Standard trend-following.",
        holding: "Strong + Noisy: Bias valid but execution choppy. Reduce position size.",
        watching: "Moderate + Not Noisy: Setup developing. Monitor for entry signals.",
        avoiding: "Weak/Noisy: No statistical edge. Opportunity cost of capital.",
      },
    },
  },
  signals: {
    beginner: {
      title: "AI Signal Lights",
      description: "These toggles light up when specific conditions are met - like dashboard warning lights in a car, but for trading conditions. Green means that signal is active.",
      signals: {
        trendActive: "Trend is ON - price is moving directionally",
        cleanFlow: "Movement is smooth, not choppy",
        highConviction: "Strong commitment to the direction",
        structureGaining: "The trend is getting stronger",
        volatilityExpanding: "Price swings are growing larger",
        trendingMode: "Market is trending, not ranging",
      },
    },
    technical: {
      title: "Neural Signal Matrix",
      description: "Boolean state indicators derived from core metrics. Each signal represents a specific market condition threshold being met.",
      signals: {
        trendActive: "|FastCore - SlowCore| > 0.5 × ATR",
        cleanFlow: "Efficiency Score > 0.60",
        highConviction: "Confidence > 70%",
        structureGaining: "SpreadDelta > 0 (cores diverging)",
        volatilityExpanding: "Current ATR > 14-period ATR SMA",
        trendingMode: "Efficiency ≥ 0.30 (not in chop)",
      },
    },
  },
  trendCore: {
    beginner: {
      title: "Dual Trend Lines",
      description: "Imagine two moving averages: one that reacts quickly (Fast Core - blue) and one that moves slowly (Slow Core - pink). When they separate, a trend is forming. When they cross, the trend may be changing.",
      tip: "📊 Watch the gap between lines - wider gap = stronger trend direction.",
    },
    technical: {
      title: "Rational Quadratic Kernel Cores",
      description: "Fast Core (8-period RQK) captures momentum. Slow Core (21-period RQK) represents structure. The spread between them and its rate of change (delta) indicate trend health.",
      formula: "Spread = FastCore - SlowCore | SpreadDelta = Spread_t - Spread_(t-1)",
      tip: "Positive spread with positive delta = strengthening bullish structure.",
    },
  },
} as const;
