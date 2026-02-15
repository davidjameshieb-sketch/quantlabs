// Hook: reads all sovereign_memory intelligence data for dashboard visualization
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DarkPoolProfile {
  instrument: string;
  currentPrice: number;
  totalDepthScore: number;
  thinZones: Array<{ from: number; to: number; severity: string }>;
  optimalEntryZone: { price: number; side: string; reason: string } | null;
}

export interface CorrelationEntry {
  pair1: string;
  pair2: string;
  pearson: number;
  rolling20: number;
  rolling50: number;
  decoupled: boolean;
  decouplingMagnitude: number;
  regime: string;
}

export interface DecouplingAlert {
  pair1: string;
  pair2: string;
  expectedCorr: number;
  actualCorr: number;
  delta: number;
  signal: string;
  tradeable: boolean;
}

export interface SentimentProfile {
  instrument: string;
  retailLongPct: number;
  retailShortPct: number;
  institutionalBias: string;
  divergenceScore: number;
  trapProbability: number;
  trapDirection: string;
  actionable: boolean;
  signal: string;
}

export interface SlippageProfile {
  instrument: string;
  totalFills: number;
  avgSlippage: number;
  adverseFillRate: number;
  patternDetected: string;
  avgSpread: number;
  recommendation: string;
}

export interface IntelligenceState {
  darkPool: { profiles: DarkPoolProfile[]; generatedAt: string } | null;
  correlation: { matrix: CorrelationEntry[]; alerts: DecouplingAlert[]; generatedAt: string } | null;
  sentiment: { profiles: SentimentProfile[]; generatedAt: string } | null;
  slippage: { profiles: SlippageProfile[]; generatedAt: string } | null;
  hawkometer: Record<string, unknown> | null;
  godSignal: Record<string, unknown> | null;
  fixingVolatility: Record<string, unknown> | null;
  crossVenueDom: Record<string, unknown> | null;
  flashCrash: Record<string, unknown> | null;
  loading: boolean;
  lastUpdated: Date | null;
}

const MEMORY_KEYS = [
  { type: 'dark_pool_proxy', key: 'liquidity_depth_curve' },
  { type: 'correlation_matrix', key: 'live_pearson_heatmap' },
  { type: 'sentiment_divergence', key: 'retail_vs_institutional' },
  { type: 'adversarial_slippage', key: 'fill_quality_audit' },
  { type: 'hawkometer_analysis', key: null },
  { type: 'god_signal', key: null },
  { type: 'fixing_volatility', key: 'london_4pm_fix' },
  { type: 'cross_venue_dom', key: 'aggregated_depth' },
  { type: 'flash_crash_monitor', key: 'killswitch_status' },
];

export function useIntelligenceState(pollMs = 30_000): IntelligenceState {
  const [state, setState] = useState<IntelligenceState>({
    darkPool: null,
    correlation: null,
    sentiment: null,
    slippage: null,
    hawkometer: null,
    godSignal: null,
    fixingVolatility: null,
    crossVenueDom: null,
    flashCrash: null,
    loading: true,
    lastUpdated: null,
  });

  const fetchData = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('sovereign_memory')
        .select('memory_type, memory_key, payload, updated_at')
        .in('memory_type', MEMORY_KEYS.map(k => k.type))
        .order('updated_at', { ascending: false })
        .limit(20);

      if (!data) return;

      const byType: Record<string, any> = {};
      for (const row of data) {
        if (!byType[row.memory_type]) byType[row.memory_type] = row.payload;
      }

      setState({
        darkPool: byType.dark_pool_proxy || null,
        correlation: byType.correlation_matrix || null,
        sentiment: byType.sentiment_divergence || null,
        slippage: byType.adversarial_slippage || null,
        hawkometer: byType.hawkometer_analysis || null,
        godSignal: byType.god_signal || null,
        fixingVolatility: byType.fixing_volatility || null,
        crossVenueDom: byType.cross_venue_dom || null,
        flashCrash: byType.flash_crash_monitor || null,
        loading: false,
        lastUpdated: new Date(),
      });
    } catch {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, pollMs);
    return () => clearInterval(id);
  }, [fetchData, pollMs]);

  return state;
}
