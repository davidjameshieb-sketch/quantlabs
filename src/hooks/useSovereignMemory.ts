// Hook: reads sovereign_memory entries by type with polling
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SovereignMemoryEntry {
  id: string;
  memory_type: string;
  memory_key: string;
  payload: Record<string, unknown>;
  relevance_score: number | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  expires_at: string | null;
}

export function useSovereignMemory(types: string[], pollMs = 15_000, limit = 50) {
  const [entries, setEntries] = useState<SovereignMemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('sovereign_memory')
        .select('*')
        .in('memory_type', types)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (!error && data) {
        setEntries(data as unknown as SovereignMemoryEntry[]);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [types.join(','), limit]);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, pollMs);
    return () => clearInterval(id);
  }, [fetchData, pollMs]);

  return { entries, loading };
}
