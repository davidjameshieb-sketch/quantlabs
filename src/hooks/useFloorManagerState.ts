// Hook: reads live governance state from gate_bypasses DB table
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface GateBypasses {
  id: string;
  gate_id: string;
  pair: string | null;
  reason: string;
  expires_at: string;
  created_at: string;
  revoked: boolean;
}

export interface FloorManagerState {
  bypasses: GateBypasses[];
  suspendedAgents: GateBypasses[];
  circuitBreaker: GateBypasses | null;
  sizingOverride: GateBypasses | null;
  blacklists: GateBypasses[];
  gateThresholds: GateBypasses[];
  evolutionParams: GateBypasses[];
  dynamicGates: GateBypasses[];
  dnaMutations: GateBypasses[];
  indicatorWeights: GateBypasses[];
  shadowAgents: GateBypasses[];
  webSearchLogs: GateBypasses[];
  aiModelLogs: GateBypasses[];
  dataFetchLogs: GateBypasses[];
  cycleLogs: GateBypasses[];
  loading: boolean;
  lastUpdated: Date | null;
}

const EMPTY: FloorManagerState = {
  bypasses: [],
  suspendedAgents: [],
  circuitBreaker: null,
  sizingOverride: null,
  blacklists: [],
  gateThresholds: [],
  evolutionParams: [],
  dynamicGates: [],
  dnaMutations: [],
  indicatorWeights: [],
  shadowAgents: [],
  webSearchLogs: [],
  aiModelLogs: [],
  dataFetchLogs: [],
  cycleLogs: [],
  loading: true,
  lastUpdated: null,
};

export function useFloorManagerState(pollMs = 15_000): FloorManagerState {
  const [state, setState] = useState<FloorManagerState>(EMPTY);

  const fetch = useCallback(async () => {
    try {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('gate_bypasses')
        .select('*')
        .eq('revoked', false)
        .gte('expires_at', now)
        .order('created_at', { ascending: false });

      if (error || !data) {
        setState(prev => ({ ...prev, loading: false }));
        return;
      }

      const active = data as GateBypasses[];

      const CATEGORIES = ['AGENT_SUSPEND', 'CIRCUIT_BREAKER', 'SIZING_OVERRIDE', 'SESSION_BLACKLIST', 'BLACKLIST_ADD', 'GATE_THRESHOLD', 'EVOLUTION_PARAM', 'DYNAMIC_GATE', 'AGENT_DNA_MUTATION', 'INDICATOR_WEIGHT', 'SHADOW_AGENT', 'WEB_SEARCH_LOG', 'AI_MODEL_LOG', 'DATA_FETCH_LOG', 'SOVEREIGN_LOOP_LOG'];
      const startsWith = (id: string, prefix: string) => id === prefix || id.startsWith(prefix + ':');
      const matchesAny = (id: string) => CATEGORIES.some(c => startsWith(id, c));

      setState({
        bypasses: active.filter(b => !matchesAny(b.gate_id)),
        suspendedAgents: active.filter(b => startsWith(b.gate_id, 'AGENT_SUSPEND')),
        circuitBreaker: active.find(b => startsWith(b.gate_id, 'CIRCUIT_BREAKER')) ?? null,
        sizingOverride: active.find(b => startsWith(b.gate_id, 'SIZING_OVERRIDE')) ?? null,
        blacklists: active.filter(b => startsWith(b.gate_id, 'SESSION_BLACKLIST') || startsWith(b.gate_id, 'BLACKLIST_ADD')),
        gateThresholds: active.filter(b => startsWith(b.gate_id, 'GATE_THRESHOLD')),
        evolutionParams: active.filter(b => startsWith(b.gate_id, 'EVOLUTION_PARAM')),
        dynamicGates: active.filter(b => startsWith(b.gate_id, 'DYNAMIC_GATE')),
        dnaMutations: active.filter(b => startsWith(b.gate_id, 'AGENT_DNA_MUTATION')),
        indicatorWeights: active.filter(b => startsWith(b.gate_id, 'INDICATOR_WEIGHT')),
        shadowAgents: active.filter(b => startsWith(b.gate_id, 'SHADOW_AGENT')),
        webSearchLogs: active.filter(b => startsWith(b.gate_id, 'WEB_SEARCH_LOG')),
        aiModelLogs: active.filter(b => startsWith(b.gate_id, 'AI_MODEL_LOG')),
        dataFetchLogs: active.filter(b => startsWith(b.gate_id, 'DATA_FETCH_LOG')),
        cycleLogs: active.filter(b => startsWith(b.gate_id, 'SOVEREIGN_LOOP_LOG')),
        loading: false,
        lastUpdated: new Date(),
      });
    } catch {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, pollMs);
    return () => clearInterval(id);
  }, [fetch, pollMs]);

  return state;
}
