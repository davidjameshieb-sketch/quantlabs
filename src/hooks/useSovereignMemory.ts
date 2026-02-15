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
        const typed: SovereignMemoryEntry[] = data.map(row => ({
          id: row.id,
          memory_type: row.memory_type,
          memory_key: row.memory_key,
          payload: (row.payload ?? {}) as Record<string, unknown>,
          relevance_score: row.relevance_score,
          created_at: row.created_at,
          updated_at: row.updated_at,
          created_by: row.created_by,
          expires_at: row.expires_at,
        }));
        setEntries(typed);
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
