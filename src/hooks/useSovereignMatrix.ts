// Sovereign Matrix v20.0 — Mechanical Chomp
// Hook for fetching matrix signals and firing tiered execution

import { useState, useCallback } from 'react';
import { toast } from 'sonner';

export interface MatrixSignal {
  instrument: string;
  baseCurrency: string;
  quoteCurrency: string;
  baseScore: number;
  quoteScore: number;
  baseRank: number;
  quoteRank: number;
  gate1: boolean;
  gate2: boolean;
  gate2Detail: { highest20: number; lowest20: number; close: number };
  gate3: boolean;
  gate3Detail: { slope: number };
  direction: 'long' | 'short' | null;
  triplelock: boolean;
  atlasBlock: { blockHigh: number; blockLow: number; candleTime: string } | null;
  currentPrice: number;
  sobScore: number;
}

export interface MatrixResult {
  timestamp: string;
  environment: 'practice' | 'live';
  currencyScores: Record<string, number>;
  currencyRanks: Record<string, number>;
  sortedCurrencies: string[];
  predator: string;
  prey: string;
  bestChompPair: string;
  signals: MatrixSignal[];
  strikes: MatrixSignal[];
  strikeCount: number;
}

// Scaling protocol: 500 + 500 + 250 = 1250 units
export const TIER_UNITS = { T1: 500, T2: 500, T3: 250 } as const;
// Pip offsets for T2 and T3 entries from T1
export const TIER_PIP_OFFSETS = { T2: 15, T3: 30 } as const;

// Pip value for SL/TP calculation
export function pips(n: number, pair: string): number {
  return pair.includes('JPY') ? n / 100 : n / 10000;
}

// Compute weighted anchor price as tiers fill
export function computeAnchor(
  t1Price: number,
  t2Price: number | null,
  t3Price: number | null
): number {
  const totalUnits = 500 + (t2Price != null ? 500 : 0) + (t3Price != null ? 250 : 0);
  const weighted =
    500 * t1Price +
    (t2Price != null ? 500 * t2Price : 0) +
    (t3Price != null ? 250 * t3Price : 0);
  return weighted / totalUnits;
}

// Direct anon-key call to oanda-execute — works without a user session
async function callExecuteDirect(body: Record<string, unknown>) {
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oanda-execute`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(body),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Execute failed: ${res.status}`);
  return data;
}

export function useSovereignMatrix() {
  const [loading, setLoading] = useState(false);
  const [matrixResult, setMatrixResult] = useState<MatrixResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scanMatrix = useCallback(async (
    environment: 'practice' | 'live' = 'live',
    pair?: string
  ) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sovereign-matrix`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ environment, pair }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Matrix scan failed');

      setMatrixResult(data);
      if (data.strikeCount > 0) {
        toast.success(`🔒 ${data.strikeCount} TRIPLE-LOCK STRIKE${data.strikeCount > 1 ? 'S' : ''} detected`);
      }
      return data as MatrixResult;
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast.error('Matrix scan failed: ' + msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fire T1: 500 units at market — uses direct anon-key call, no session required
  const fireT1 = useCallback(async (
    signal: MatrixSignal,
    environment: 'practice' | 'live'
  ) => {
    // CRITICAL: Use OANDA instrument format (EUR_USD), NOT slash format (EUR/USD).
    // oanda-execute stores currency_pair in DB as-is, and toOandaInstrument() converts / → _
    // for the API call. Sending EUR_USD avoids a double-conversion and ensures DB consistency.
    const pair = signal.instrument; // Already in OANDA format e.g. EUR_USD
    setLoading(true);
    try {
      const data = await callExecuteDirect({
        action: 'execute',
        signalId: `SMVC20-T1-${signal.instrument}-${Date.now()}`,
        currencyPair: pair,
        direction: signal.direction!,
        units: TIER_UNITS.T1,
        confidenceScore: 3,
        agentId: 'sovereign-matrix-v20',
        environment,
      });
      if (data.success) {
        toast.success(`T1 fired: ${signal.direction!.toUpperCase()} ${TIER_UNITS.T1}u ${pair}`);
      }
      return data;
    } catch (err) {
      toast.error('T1 execution failed: ' + (err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fire T2: 500 units (manual trigger at +15 pips from T1)
  const fireT2 = useCallback(async (
    signal: MatrixSignal,
    environment: 'practice' | 'live'
  ) => {
    const pair = signal.instrument; // OANDA format EUR_USD
    setLoading(true);
    try {
      const data = await callExecuteDirect({
        action: 'execute',
        signalId: `SMVC20-T2-${signal.instrument}-${Date.now()}`,
        currencyPair: pair,
        direction: signal.direction!,
        units: TIER_UNITS.T2,
        confidenceScore: 3,
        agentId: 'sovereign-matrix-v20-T2',
        environment,
      });
      if (data.success) {
        toast.success(`T2 fired: ${signal.direction!.toUpperCase()} ${TIER_UNITS.T2}u ${pair}`);
      }
      return data;
    } catch (err) {
      toast.error('T2 execution failed: ' + (err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fire T3: 250 units (manual trigger at +30 pips from T1)
  const fireT3 = useCallback(async (
    signal: MatrixSignal,
    environment: 'practice' | 'live'
  ) => {
    const pair = signal.instrument; // OANDA format EUR_USD
    setLoading(true);
    try {
      const data = await callExecuteDirect({
        action: 'execute',
        signalId: `SMVC20-T3-${signal.instrument}-${Date.now()}`,
        currencyPair: pair,
        direction: signal.direction!,
        units: TIER_UNITS.T3,
        confidenceScore: 3,
        agentId: 'sovereign-matrix-v20-T3',
        environment,
      });
      if (data.success) {
        toast.success(`T3 fired: ${signal.direction!.toUpperCase()} ${TIER_UNITS.T3}u ${pair}`);
      }
      return data;
    } catch (err) {
      toast.error('T3 execution failed: ' + (err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    matrixResult,
    error,
    scanMatrix,
    fireT1,
    fireT2,
    fireT3,
  };
}
