// Live edge health stats — now reads from snapshot layer instead of raw DB scans
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useSnapshot } from '@/hooks/useSnapshot';

export type HealthColor = 'green' | 'yellow' | 'red';

export interface SessionStat {
  session: string;
  trades: number;
  wins: number;
  netPips: number;
  color: HealthColor;
}

export interface PairStat {
  pair: string;
  trades: number;
  winRate: number;
  netPips: number;
  pf: number;
  color: HealthColor;
}

export interface EdgeHealthStats {
  status: HealthColor;
  statusLabel: string;
  totalTrades: number;
  overallWinRate: number;
  overallExpectancy: number;
  overallPF: number;
  longWR: number;
  shortWR: number;
  longNet: number;
  shortNet: number;
  sessions: SessionStat[];
  topPairs: PairStat[];
  worstPairs: PairStat[];
  lastUpdated: Date | null;
  /** Indicates data era — 'post-revamp' means only indicator-confirmed trades */
  dataEra: 'post-revamp' | 'legacy' | 'unknown';
}

const EMPTY: EdgeHealthStats = {
  status: 'red',
  statusLabel: 'No Data',
  totalTrades: 0,
  overallWinRate: 0,
  overallExpectancy: 0,
  overallPF: 0,
  longWR: 0,
  shortWR: 0,
  longNet: 0,
  shortNet: 0,
  sessions: [],
  topPairs: [],
  worstPairs: [],
  lastUpdated: null,
  dataEra: 'unknown',
};

export function useEdgeHealthStats(pollIntervalMs = 60_000): EdgeHealthStats {
  const snapshot = useSnapshot<any>({
    snapshotType: 'edge_health_summary',
    scopeKey: 'all:30',
    ttlMs: 60_000,
    autoCompute: true,
    pollMs: pollIntervalMs,
  });

  if (!snapshot.data || snapshot.data.noData) return EMPTY;

  const d = snapshot.data;
  return {
    status: (d.status || 'red') as HealthColor,
    statusLabel: d.statusLabel || 'No Data',
    totalTrades: d.totalTrades || 0,
    overallWinRate: d.overallWinRate || 0,
    overallExpectancy: d.overallExpectancy || 0,
    overallPF: d.overallPF || 0,
    longWR: 0,
    shortWR: 0,
    longNet: d.longNet || 0,
    shortNet: d.shortNet || 0,
    sessions: [],
    topPairs: [],
    worstPairs: [],
    lastUpdated: snapshot.asOf,
    dataEra: 'post-revamp',
  };
}
