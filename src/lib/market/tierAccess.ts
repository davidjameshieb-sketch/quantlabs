// Tier-based feature access control
import type { MarketType, Timeframe } from './types';
import type { Sector } from './sectors';

export interface TierFeatures {
  // Market access
  markets: MarketType[];
  maxTickers: number;
  
  // Timeframe access
  timeframes: Timeframe[];
  multiTimeframe: boolean;
  
  // Analysis features
  sectorDashboards: boolean;
  convictionViews: boolean;
  priceFilters: boolean;
  volumeFilters: boolean;
  
  // AI features
  chatQueries: boolean;
  advancedChat: boolean;
  
  // Additional features
  historicalContext: boolean;
  customDashboards: boolean;
  exportSummaries: boolean;
  fullTransparency: boolean;
}

const TIER_FEATURES: Record<number, TierFeatures> = {
  // Tier 1: Observer ($20/mo)
  1: {
    markets: ['stocks', 'crypto'],
    maxTickers: 50,
    timeframes: ['1h', '4h'],
    multiTimeframe: false,
    sectorDashboards: false,
    convictionViews: false,
    priceFilters: false,
    volumeFilters: false,
    chatQueries: true,
    advancedChat: false,
    historicalContext: false,
    customDashboards: false,
    exportSummaries: false,
    fullTransparency: false,
  },
  // Tier 2: Analyst ($40/mo)
  2: {
    markets: ['stocks', 'crypto', 'forex'],
    maxTickers: 150,
    timeframes: ['15m', '1h', '4h', '1d'],
    multiTimeframe: true,
    sectorDashboards: false,
    convictionViews: true,
    priceFilters: true,
    volumeFilters: false,
    chatQueries: true,
    advancedChat: false,
    historicalContext: false,
    customDashboards: false,
    exportSummaries: false,
    fullTransparency: false,
  },
  // Tier 3: Strategist ($60/mo)
  3: {
    markets: ['stocks', 'crypto', 'forex', 'commodities', 'indices'],
    maxTickers: 500,
    timeframes: ['5m', '15m', '1h', '4h', '1d', '1w'],
    multiTimeframe: true,
    sectorDashboards: true,
    convictionViews: true,
    priceFilters: true,
    volumeFilters: true,
    chatQueries: true,
    advancedChat: true,
    historicalContext: false,
    customDashboards: false,
    exportSummaries: false,
    fullTransparency: false,
  },
  // Tier 4: Architect ($80/mo)
  4: {
    markets: ['stocks', 'crypto', 'forex', 'commodities', 'indices'],
    maxTickers: 1000,
    timeframes: ['1m', '5m', '15m', '1h', '4h', '1d', '1w'],
    multiTimeframe: true,
    sectorDashboards: true,
    convictionViews: true,
    priceFilters: true,
    volumeFilters: true,
    chatQueries: true,
    advancedChat: true,
    historicalContext: true,
    customDashboards: true,
    exportSummaries: false,
    fullTransparency: false,
  },
  // Tier 5: Mastermind ($99/mo)
  5: {
    markets: ['stocks', 'crypto', 'forex', 'commodities', 'indices'],
    maxTickers: -1, // Unlimited
    timeframes: ['1m', '5m', '15m', '1h', '4h', '1d', '1w'],
    multiTimeframe: true,
    sectorDashboards: true,
    convictionViews: true,
    priceFilters: true,
    volumeFilters: true,
    chatQueries: true,
    advancedChat: true,
    historicalContext: true,
    customDashboards: true,
    exportSummaries: true,
    fullTransparency: true,
  },
};

export const TIER_NAMES: Record<number, string> = {
  1: 'Observer',
  2: 'Analyst',
  3: 'Strategist',
  4: 'Architect',
  5: 'Mastermind',
};

export const TIER_PRICES: Record<number, number> = {
  1: 20,
  2: 40,
  3: 60,
  4: 80,
  5: 99,
};

export const getTierFeatures = (tier: number): TierFeatures => {
  return TIER_FEATURES[tier] || TIER_FEATURES[1];
};

export const canAccessMarket = (tier: number, market: MarketType): boolean => {
  const features = getTierFeatures(tier);
  return features.markets.includes(market);
};

export const canAccessTimeframe = (tier: number, timeframe: Timeframe): boolean => {
  const features = getTierFeatures(tier);
  return features.timeframes.includes(timeframe);
};

export const canAccessFeature = (tier: number, feature: keyof Omit<TierFeatures, 'markets' | 'timeframes' | 'maxTickers'>): boolean => {
  const features = getTierFeatures(tier);
  return features[feature] === true;
};

export const getTickerLimit = (tier: number): number => {
  const features = getTierFeatures(tier);
  return features.maxTickers;
};

// Get upgrade prompt based on what feature the user is trying to access
export const getUpgradePrompt = (currentTier: number, feature: string): string | null => {
  if (currentTier >= 5) return null;
  
  const prompts: Record<string, { minTier: number; message: string }> = {
    sectorDashboards: {
      minTier: 3,
      message: 'Upgrade to Strategist to access Sector Dashboards',
    },
    convictionViews: {
      minTier: 2,
      message: 'Upgrade to Analyst to access Conviction Views',
    },
    advancedChat: {
      minTier: 3,
      message: 'Upgrade to Strategist for advanced AI chat capabilities',
    },
    historicalContext: {
      minTier: 4,
      message: 'Upgrade to Architect for historical regime analysis',
    },
    customDashboards: {
      minTier: 4,
      message: 'Upgrade to Architect to create custom dashboards',
    },
    exportSummaries: {
      minTier: 5,
      message: 'Upgrade to Mastermind to export analysis summaries',
    },
  };
  
  const prompt = prompts[feature];
  if (!prompt) return null;
  if (currentTier >= prompt.minTier) return null;
  
  return prompt.message;
};
