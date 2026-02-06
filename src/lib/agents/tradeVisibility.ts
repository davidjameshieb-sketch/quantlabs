// Trade Visibility Delay System
// Controls what AI trade intelligence is visible based on subscription tier.
//
// Free users: see trades only after 24h delay OR when trade is "closed" (>4h old)
// Premium users: see all trades (near real-time, ~15min platform default)

import { AgentDecision } from './types';

/** How many ms before a trade is considered "closed" for simulation purposes */
const TRADE_CLOSE_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

/** Delay window for free users: 24 hours */
const FREE_DELAY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Determines if a simulated trade is considered "closed" */
export const isTradeClosed = (decision: AgentDecision): boolean => {
  return Date.now() - decision.timestamp > TRADE_CLOSE_THRESHOLD_MS;
};

/** Determines if a trade is visible to free users under the delay rules */
export const isTradeVisibleToFree = (decision: AgentDecision): boolean => {
  // Visible if trade is closed OR 24h have passed since signal
  return isTradeClosed(decision) || (Date.now() - decision.timestamp > FREE_DELAY_WINDOW_MS);
};

/** Filter an array of decisions based on subscription status */
export const filterDecisionsByTier = (
  decisions: AgentDecision[],
  isSubscribed: boolean
): AgentDecision[] => {
  if (isSubscribed) return decisions;
  return decisions.filter(isTradeVisibleToFree);
};

/** Count how many trades are hidden from free users */
export const getHiddenTradeCount = (decisions: AgentDecision[]): number => {
  return decisions.filter(d => !isTradeVisibleToFree(d)).length;
};

/** Get the intelligence mode label based on subscription */
export const getIntelligenceMode = (isSubscribed: boolean) => {
  if (isSubscribed) {
    return {
      label: 'Edge Intelligence',
      description: 'Near Real-Time AI Trade Signals',
      badge: 'edge' as const,
    };
  }
  return {
    label: 'Historical Intelligence',
    description: 'Signals released after delay',
    badge: 'free' as const,
  };
};
