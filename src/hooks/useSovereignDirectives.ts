// Hook: reads sovereign_memory directive_override entries, grouped by pillar
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DirectiveEntry {
  id: string;
  memory_key: string;
  payload: Record<string, unknown>;
  relevance_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface PillarSummary {
  pillar: string;
  label: string;
  directives: DirectiveEntry[];
  l0Count: number;
  activeCount: number;
  totalCount: number;
}

const PILLAR_MAP: Record<string, string> = {
  P0: 'Foundation (Always-On)',
  P1: 'Adversarial (Defense)',
  P2: 'Anticipatory (Offense)',
  P3: 'Evolutionary (R&D)',
  P4: 'Microstructure (Lens)',
};

function inferPillar(payload: Record<string, unknown>): string {
  const p = (payload.pillar as string) || '';
  if (p.startsWith('P')) return p.split(' ')[0];
  const cat = ((payload.category as string) || '').toLowerCase();
  const name = ((payload.name as string) || '').toLowerCase();
  const all = `${cat} ${name}`;
  if (all.includes('foundation') || all.includes('kill') || all.includes('circuit') || all.includes('risk budget')) return 'P0';
  if (all.includes('adversarial') || all.includes('defense') || all.includes('trap') || all.includes('sentiment')) return 'P1';
  if (all.includes('anticipat') || all.includes('predict') || all.includes('intermarket') || all.includes('macro')) return 'P2';
  if (all.includes('evolution') || all.includes('adapt') || all.includes('alpha') || all.includes('attribution')) return 'P3';
  if (all.includes('microstructure') || all.includes('orderbook') || all.includes('liquidity') || all.includes('ghost')) return 'P4';
  return 'P0'; // default
}

export function useSovereignDirectives(pollMs = 30_000) {
  const [directives, setDirectives] = useState<DirectiveEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('sovereign_memory')
        .select('id,memory_key,payload,relevance_score,created_at,updated_at')
        .eq('memory_type', 'directive_override')
        .order('relevance_score', { ascending: false })
        .limit(500);

      if (!error && data) {
        setDirectives(data.map(r => ({
          id: r.id,
          memory_key: r.memory_key,
          payload: (r.payload ?? {}) as Record<string, unknown>,
          relevance_score: r.relevance_score,
          created_at: r.created_at,
          updated_at: r.updated_at,
        })));
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, pollMs);
    return () => clearInterval(id);
  }, [fetchData, pollMs]);

  const pillars = useMemo<PillarSummary[]>(() => {
    const groups: Record<string, DirectiveEntry[]> = { P0: [], P1: [], P2: [], P3: [], P4: [] };
    for (const d of directives) {
      const p = inferPillar(d.payload);
      if (!groups[p]) groups[p] = [];
      groups[p].push(d);
    }
    return Object.entries(PILLAR_MAP).map(([key, label]) => {
      const items = groups[key] || [];
      return {
        pillar: key,
        label,
        directives: items,
        l0Count: items.filter(d => {
          const c = ((d.payload.complexity as string) || '').toLowerCase();
          return c === 'low' || c.includes('l0') || c.includes('hardwir');
        }).length,
        activeCount: items.length, // all loaded are "active" in memory
        totalCount: items.length,
      };
    });
  }, [directives]);

  return { directives, pillars, loading, totalCount: directives.length };
}
