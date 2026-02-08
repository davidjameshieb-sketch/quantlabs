// Auto-execution bridge: forwards forex signals to OANDA practice account
import { useState, useCallback, useRef } from 'react';
import { useOandaExecution, OandaOrder } from './useOandaExecution';
import { ForexTradeEntry } from '@/lib/forex/forexTypes';
import { toast } from 'sonner';

export interface AutoExecStatus {
  enabled: boolean;
  processing: boolean;
  totalQueued: number;
  totalExecuted: number;
  totalFailed: number;
  lastExecutedId: string | null;
  log: AutoExecLogEntry[];
}

export interface AutoExecLogEntry {
  signalId: string;
  pair: string;
  direction: 'long' | 'short';
  status: 'pending' | 'filled' | 'rejected';
  message: string;
  timestamp: number;
}

const UNITS = 1000;
const MAX_CONCURRENT = 1; // sequential to avoid flooding OANDA

export function useAutoExecution() {
  const { executeTrade } = useOandaExecution();
  const [status, setStatus] = useState<AutoExecStatus>({
    enabled: true,
    processing: false,
    totalQueued: 0,
    totalExecuted: 0,
    totalFailed: 0,
    lastExecutedId: null,
    log: [],
  });

  // Track which signal IDs have already been sent
  const executedSignals = useRef<Set<string>>(new Set());
  const processingRef = useRef(false);

  const addLogEntry = useCallback((entry: AutoExecLogEntry) => {
    setStatus(prev => ({
      ...prev,
      log: [entry, ...prev.log].slice(0, 100), // keep last 100
    }));
  }, []);

  const executeSignal = useCallback(async (trade: ForexTradeEntry) => {
    const signalId = trade.id;

    // Skip avoided trades and already-executed
    if (trade.outcome === 'avoided') return 'skipped';
    if (executedSignals.current.has(signalId)) return 'skipped';

    executedSignals.current.add(signalId);

    try {
      await executeTrade({
        signalId,
        currencyPair: trade.currencyPair,
        direction: trade.direction,
        units: UNITS,
        confidenceScore: trade.confidenceScore,
        agentId: trade.primaryAgent,
        environment: 'practice',
      });

      addLogEntry({
        signalId,
        pair: trade.currencyPair,
        direction: trade.direction,
        status: 'filled',
        message: `${trade.direction.toUpperCase()} ${UNITS} ${trade.currencyPair} filled`,
        timestamp: Date.now(),
      });

      setStatus(prev => ({
        ...prev,
        totalExecuted: prev.totalExecuted + 1,
        lastExecutedId: signalId,
      }));

      return 'filled';
    } catch (err) {
      addLogEntry({
        signalId,
        pair: trade.currencyPair,
        direction: trade.direction,
        status: 'rejected',
        message: (err as Error).message,
        timestamp: Date.now(),
      });

      setStatus(prev => ({
        ...prev,
        totalFailed: prev.totalFailed + 1,
      }));

      return 'rejected';
    }
  }, [executeTrade, addLogEntry]);

  const runBatch = useCallback(async (trades: ForexTradeEntry[]) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setStatus(prev => ({ ...prev, processing: true }));

    // Filter to eligible trades (not avoided, not already executed)
    const eligible = trades.filter(
      t => t.outcome !== 'avoided' && !executedSignals.current.has(t.id)
    );

    setStatus(prev => ({ ...prev, totalQueued: eligible.length }));

    toast.info(`Auto-execution: ${eligible.length} trades queued for OANDA practice`);

    // Execute sequentially to avoid overwhelming OANDA
    for (const trade of eligible) {
      if (!processingRef.current) break; // check if disabled mid-run
      await executeSignal(trade);
      // Small delay between orders to be respectful to OANDA rate limits
      await new Promise(r => setTimeout(r, 500));
    }

    processingRef.current = false;
    setStatus(prev => ({ ...prev, processing: false, totalQueued: 0 }));

    toast.success('Auto-execution batch complete');
  }, [executeSignal]);

  const enable = useCallback(() => {
    setStatus(prev => ({ ...prev, enabled: true }));
  }, []);

  const disable = useCallback(() => {
    processingRef.current = false;
    setStatus(prev => ({ ...prev, enabled: false, processing: false }));
  }, []);

  const toggle = useCallback(() => {
    setStatus(prev => {
      if (prev.enabled) {
        processingRef.current = false;
        return { ...prev, enabled: false, processing: false };
      }
      return { ...prev, enabled: true };
    });
  }, []);

  const reset = useCallback(() => {
    executedSignals.current.clear();
    setStatus({
      enabled: false,
      processing: false,
      totalQueued: 0,
      totalExecuted: 0,
      totalFailed: 0,
      lastExecutedId: null,
      log: [],
    });
  }, []);

  return {
    status,
    enable,
    disable,
    toggle,
    reset,
    runBatch,
    executedSignals: executedSignals.current,
  };
}
