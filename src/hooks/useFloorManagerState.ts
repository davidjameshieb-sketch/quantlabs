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

      const CATEGORIES = ['AGENT_SUSPEND', 'CIRCUIT_BREAKER', 'SIZING_OVERRIDE', 'SESSION_BLACKLIST', 'BLACKLIST_ADD', 'GATE_THRESHOLD', 'EVOLUTION_PARAM', 'DYNAMIC_GATE'];
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
