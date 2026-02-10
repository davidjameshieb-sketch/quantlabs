// useSnapshot — Universal hook to read pre-computed analytics from analytics_snapshots
// Falls back to stale data with "Updating…" status when refreshing
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface SnapshotResult<T = any> {
  data: T | null;
  loading: boolean;
  stale: boolean;
  error: string | null;
  asOf: Date | null;
  status: 'loading' | 'ready' | 'stale' | 'computing' | 'error' | 'empty';
  refresh: () => void;
}

interface UseSnapshotOptions {
  /** Snapshot type identifier */
  snapshotType: string;
  /** Scope key (e.g. 'all:30', 'backtest:90') */
  scopeKey?: string;
  /** TTL in ms before marking as stale (default: 300_000 = 5 min) */
  ttlMs?: number;
  /** Auto-trigger compute on mount if no snapshot exists (default: true) */
  autoCompute?: boolean;
  /** Extra params for compute (environment, window_days, etc.) */
  computeParams?: Record<string, any>;
  /** Poll interval in ms (0 = no polling, default: 0) */
  pollMs?: number;
}

export function useSnapshot<T = any>(opts: UseSnapshotOptions): SnapshotResult<T> {
  const { user } = useAuth();
  const {
    snapshotType,
    scopeKey = 'all:30',
    ttlMs = 300_000,
    autoCompute = true,
    computeParams = {},
    pollMs = 0,
  } = opts;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<Date | null>(null);
  const [status, setStatus] = useState<SnapshotResult['status']>('loading');
  const computingRef = useRef(false);

  // Read snapshot from DB
  const readSnapshot = useCallback(async () => {
    try {
      const { data: snap, error: err } = await supabase
        .from('analytics_snapshots')
        .select('payload, status, as_of_ts, updated_at')
        .eq('snapshot_type', snapshotType)
        .eq('scope_key', scopeKey)
        .maybeSingle();

      if (err) throw err;

      if (!snap) {
        setStatus('empty');
        setLoading(false);
        return null;
      }

      const payload = snap.payload as T;
      const snapAsOf = new Date(snap.as_of_ts);
      const age = Date.now() - snapAsOf.getTime();
      const isStale = age > ttlMs;

      setData(payload);
      setAsOf(snapAsOf);
      setStale(isStale);
      setError(snap.status === 'error' ? (snap.payload as any)?.error || 'Unknown error' : null);
      setStatus(snap.status === 'error' ? 'error' : isStale ? 'stale' : 'ready');
      setLoading(false);

      return { isStale, status: snap.status };
    } catch (e: any) {
      setError(e.message);
      setStatus('error');
      setLoading(false);
      return null;
    }
  }, [snapshotType, scopeKey, ttlMs]);

  // Trigger server-side compute
  const triggerCompute = useCallback(async () => {
    if (computingRef.current) return;
    computingRef.current = true;
    setStatus((prev) => (prev === 'loading' ? 'loading' : 'computing'));

    try {
      // Parse scope_key for environment/window
      const [environment = 'all', windowStr = '30'] = scopeKey.split(':');
      const windowDays = parseInt(windowStr) || 30;

      await supabase.functions.invoke('compute-snapshot', {
        body: {
          snapshot_type: snapshotType,
          scope_key: scopeKey,
          user_id: user?.id,
          environment,
          window_days: windowDays,
          ...computeParams,
        },
      });

      // Re-read after compute
      await readSnapshot();
    } catch (e: any) {
      console.error(`[useSnapshot] Compute failed for ${snapshotType}:`, e);
      setError(e.message);
      setStatus('error');
    } finally {
      computingRef.current = false;
    }
  }, [snapshotType, scopeKey, user?.id, computeParams, readSnapshot]);

  // Initial load
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const result = await readSnapshot();
      if (cancelled) return;

      // Auto-compute if empty or stale
      if (autoCompute && (!result || result.isStale || result.status === 'error')) {
        triggerCompute();
      }
    };

    init();
    return () => { cancelled = true; };
  }, [readSnapshot, autoCompute, triggerCompute]);

  // Optional polling
  useEffect(() => {
    if (!pollMs || pollMs <= 0) return;
    const interval = setInterval(async () => {
      const result = await readSnapshot();
      if (result?.isStale && autoCompute) {
        triggerCompute();
      }
    }, pollMs);
    return () => clearInterval(interval);
  }, [pollMs, readSnapshot, autoCompute, triggerCompute]);

  return {
    data,
    loading: loading && !data,
    stale,
    error,
    asOf,
    status,
    refresh: triggerCompute,
  };
}
