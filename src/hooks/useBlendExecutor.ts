// Hook for triggering the Decorrelated Portfolio Blend auto-executor
import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';

export interface BlendComponent {
  id: string;
  predatorRank: number;
  preyRank: number;
  requireG3: boolean;
  slType: string;
  entryType: string;
  weight: number;
  label: string;
  fixedPips?: number;
  tpRatio?: number;
  invertDirection?: boolean;
  agentId?: string;
}

export interface BlendExecution {
  component: string;
  label: string;
  pair: string;
  direction: string;
  status: string;
  units?: number;
  weight?: number;
  entryPrice?: number;
  slPrice?: number;
  tpPrice?: number;
  slType?: string;
  entryTrigger?: string;
  oandaTradeId?: string;
  error?: string;
  skipReason?: string;
}

export interface BlendCycleResult {
  success: boolean;
  reason?: string;
  detail?: string;
  cycle?: {
    componentsEvaluated: number;
    executed: number;
    skipped: number;
    errors: number;
    existingPositions: number;
    maxPositions: number;
  };
  currencyRanks?: Record<string, number>;
  sortedCurrencies?: string[];
  executions?: BlendExecution[];
  timestamp?: string;
  error?: string;
}

export function useBlendExecutor() {
  const [running, setRunning] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [lastResult, setLastResult] = useState<BlendCycleResult | null>(null);
  const [cycleCount, setCycleCount] = useState(0);
  const componentsRef = useRef<BlendComponent[] | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setComponents = useCallback((components: BlendComponent[] | null) => {
    componentsRef.current = components;
  }, []);

  const runCycle = useCallback(async (): Promise<BlendCycleResult | null> => {
    setRunning(true);
    try {
      const body: Record<string, unknown> = {};
      if (componentsRef.current && componentsRef.current.length > 0) {
        body.components = componentsRef.current;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/decorrelated-blend-executor`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify(body),
        }
      );

      const data: BlendCycleResult = await res.json();
      setLastResult(data);
      setCycleCount(c => c + 1);

      if (data.cycle?.executed && data.cycle.executed > 0) {
        toast.success(`Blend Executor: ${data.cycle.executed} trade(s) filled`);
      }

      return data;
    } catch (err) {
      const errResult: BlendCycleResult = { success: false, error: (err as Error).message };
      setLastResult(errResult);
      toast.error('Blend executor error: ' + (err as Error).message);
      return errResult;
    } finally {
      setRunning(false);
    }
  }, []);

  const startAuto = useCallback(() => {
    if (intervalRef.current) return;
    setAutoMode(true);
    runCycle();
    intervalRef.current = setInterval(runCycle, 10 * 60 * 1000);
    toast.success('Portfolio Blend auto-executor STARTED (10min cycles)');
  }, [runCycle]);

  const stopAuto = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setAutoMode(false);
    toast.info('Portfolio Blend auto-executor STOPPED');
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return {
    running,
    autoMode,
    lastResult,
    cycleCount,
    runCycle,
    startAuto,
    stopAuto,
    setComponents,
  };
}
