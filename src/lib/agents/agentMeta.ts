// Shared agent metadata helpers
// Single source of truth for agent display info across all components

import { AgentId } from './types';
import { AGENT_DEFINITIONS, ALL_AGENT_IDS } from './agentConfig';

export interface AgentMeta {
  name: string;
  icon: string;
  color: string;
  short: string;
}

const SHORT_CODES: Record<AgentId, string> = {
  'equities-alpha': 'AE',
  'forex-macro': 'MP',
  'crypto-momentum': 'MG',
  'liquidity-radar': 'LR',
  'range-navigator': 'RN',
  'volatility-architect': 'VA',
  'adaptive-learner': 'AL',
  'sentiment-reactor': 'SR',
  'fractal-intelligence': 'FI',
  'risk-sentinel': 'RS',
  // FX Specialists
  'session-momentum': 'SM',
  'carry-flow': 'CF',
  'correlation-regime': 'CR',
  'spread-microstructure': 'XM',
  'news-event-shield': 'NS',
  // Cross-Asset Intelligence
  'cross-asset-sync': 'CA',
  'execution-optimizer': 'EO',
  'regime-transition': 'RT',
};

export const getAgentMeta = (id: AgentId): AgentMeta => {
  const def = AGENT_DEFINITIONS[id];
  return {
    name: def.name,
    icon: def.icon,
    color: def.color,
    short: SHORT_CODES[id],
  };
};

export const AGENT_META_MAP: Record<AgentId, { name: string; icon: string }> = 
  Object.fromEntries(
    ALL_AGENT_IDS.map(id => [id, { name: AGENT_DEFINITIONS[id].name, icon: AGENT_DEFINITIONS[id].icon }])
  ) as Record<AgentId, { name: string; icon: string }>;

export const AGENT_TRADE_META: Record<AgentId, { icon: string; color: string; short: string }> =
  Object.fromEntries(
    ALL_AGENT_IDS.map(id => {
      const def = AGENT_DEFINITIONS[id];
      return [id, { icon: def.icon, color: def.color, short: SHORT_CODES[id] }];
    })
  ) as Record<AgentId, { icon: string; color: string; short: string }>;
