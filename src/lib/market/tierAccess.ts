// Tier-based feature access control - Simplified Free + Edge model
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

// "free" = 0, "edge" = 1
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
  edge: {
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

export type TierName = 'free' | 'edge';

export const TIER_DISPLAY_NAMES: Record<TierName, string> = {
  free: 'Free',
  edge: 'QuantLabs Edge Access',
};

export const TIER_PRICES: Record<TierName, { current: number; original: number }> = {
  free: { current: 0, original: 0 },
  edge: { current: 45, original: 95 },
};

export const getTierFeatures = (tier: TierName): TierFeatures => {
  return TIER_FEATURES[tier] || TIER_FEATURES.free;
};

export const canAccessFeature = (tier: TierName, feature: keyof TierFeatures): boolean => {
  const features = getTierFeatures(tier);
  return features[feature] === true;
};

export const isEdge = (tier: TierName): boolean => tier === 'edge';

// Get upgrade prompt based on what feature the user is trying to access
export const getUpgradePrompt = (currentTier: TierName, feature: string): string | null => {
  if (currentTier === 'edge') return null;
  
  const prompts: Record<string, string> = {
    intradayData: 'Upgrade to Edge Access for 15-minute delayed intraday data',
    advancedBacktesting: 'Upgrade to Edge Access for advanced AI backtesting analytics',
    aiDecisionOverlays: 'Upgrade to Edge Access for AI decision overlays',
    performanceBreakdowns: 'Upgrade to Edge Access for quantitative performance breakdowns',
    signalTracking: 'Upgrade to Edge Access for full intraday signal tracking',
    advancedChat: 'Upgrade to Edge Access for advanced AI chat capabilities',
    historicalContext: 'Upgrade to Edge Access for historical regime analysis',
    exportSummaries: 'Upgrade to Edge Access to export analysis summaries',
  };
  
  return prompts[feature] || null;
};

// Legacy compatibility helpers
export const TIER_NAMES: Record<number, string> = {
  0: 'Free',
  1: 'QuantLabs Edge Access',
};
