import { useState, useCallback } from 'react';
import { toast } from 'sonner';

export interface RankComboResult {
  strongRank: number;
  weakRank: number;
  trades: number;
  wins: number;
  losses: number;
  totalPips: number;
  grossProfit: number;
  grossLoss: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
}

export interface BacktestResult {
  timestamp: string;
  environment: string;
  candlesPerPair: number;
  totalSnapshots: number;
  pairsLoaded: number;
  comboResults: RankComboResult[];
  equityCurves: Record<string, Array<{ time: string; equity: number }>>;
  drawdownCurve: Array<{ time: string; drawdown: number }>;
  bestCombo: RankComboResult;
  dateRange: { start: string; end: string };
}

export function useRankExpectancy() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runBacktest = useCallback(async (
    environment: 'practice' | 'live' = 'practice',
    candles = 5000
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rank-expectancy-backtest`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ environment, candles }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Backtest failed');

      setResult(data);
      toast.success(`Backtest complete: ${data.totalSnapshots} snapshots, best combo ${data.bestCombo.strongRank}v${data.bestCombo.weakRank}`);
      return data as BacktestResult;
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast.error('Backtest failed: ' + msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, result, error, runBacktest };
}
