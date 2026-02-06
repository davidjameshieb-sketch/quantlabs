// Tier-based feature access control - Simplified Free + Elite model
import type { MarketType, Timeframe } from './types';

export interface TierFeatures {
  // Data access
  intradayData: boolean;
  
  // Analysis features
  advancedBacktesting: boolean;
  aiDecisionOverlays: boolean;
  performanceBreakdowns: boolean;
  signalTracking: boolean;
  
  // AI features
  chatQueries: boolean;
  advancedChat: boolean;
  
  // Additional features
  historicalContext: boolean;
  exportSummaries: boolean;
  priorityAccess: boolean;
}

// "free" = 0, "elite" = 1
const TIER_FEATURES: Record<string, TierFeatures> = {
  free: {
    intradayData: false,
    advancedBacktesting: false,
    aiDecisionOverlays: false,
    performanceBreakdowns: false,
    signalTracking: false,
    chatQueries: true,
    advancedChat: false,
    historicalContext: false,
    exportSummaries: false,
    priorityAccess: false,
  },
  elite: {
    intradayData: true,
    advancedBacktesting: true,
    aiDecisionOverlays: true,
    performanceBreakdowns: true,
    signalTracking: true,
    chatQueries: true,
    advancedChat: true,
    historicalContext: true,
    exportSummaries: true,
    priorityAccess: true,
  },
};

export type TierName = 'free' | 'elite';

export const TIER_DISPLAY_NAMES: Record<TierName, string> = {
  free: 'Free',
  elite: 'QuantLabs Elite Access',
};

export const TIER_PRICES: Record<TierName, { current: number; original: number }> = {
  free: { current: 0, original: 0 },
  elite: { current: 45, original: 95 },
};

export const getTierFeatures = (tier: TierName): TierFeatures => {
  return TIER_FEATURES[tier] || TIER_FEATURES.free;
};

export const canAccessFeature = (tier: TierName, feature: keyof TierFeatures): boolean => {
  const features = getTierFeatures(tier);
  return features[feature] === true;
};

export const isElite = (tier: TierName): boolean => tier === 'elite';

// Get upgrade prompt based on what feature the user is trying to access
export const getUpgradePrompt = (currentTier: TierName, feature: string): string | null => {
  if (currentTier === 'elite') return null;
  
  const prompts: Record<string, string> = {
    intradayData: 'Upgrade to Elite for 15-minute delayed intraday data',
    advancedBacktesting: 'Upgrade to Elite for advanced AI backtesting analytics',
    aiDecisionOverlays: 'Upgrade to Elite for AI decision overlays',
    performanceBreakdowns: 'Upgrade to Elite for quantitative performance breakdowns',
    signalTracking: 'Upgrade to Elite for full intraday signal tracking',
    advancedChat: 'Upgrade to Elite for advanced AI chat capabilities',
    historicalContext: 'Upgrade to Elite for historical regime analysis',
    exportSummaries: 'Upgrade to Elite to export analysis summaries',
  };
  
  return prompts[feature] || null;
};

// Legacy compatibility helpers
export const TIER_NAMES: Record<number, string> = {
  0: 'Free',
  1: 'QuantLabs Elite Access',
};
