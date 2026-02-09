// One-click 90-day backtest runner with progress feedback
import { useState, useCallback } from 'react';
import { FlaskConical, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { runBacktest, persistBacktestTrades, clearBacktestTrades, DEFAULT_BACKTEST_CONFIG } from '@/lib/forex/backtest';
import { toast } from 'sonner';

export const BacktestRunnerButton = () => {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ trades: number; inserted: number } | null>(null);

  const handleRun = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setProgress(10);
    setResult(null);

    try {
      // Step 1: Clear previous backtest trades
      toast.info('Clearing previous backtest data…');
      await clearBacktestTrades('baseline');
      setProgress(20);

      // Step 2: Run the backtest (synchronous, CPU-bound)
      toast.info('Running 90-day backtest on 8 majors…');
      setProgress(30);

      // Use requestAnimationFrame to let the UI update before heavy computation
      await new Promise(r => requestAnimationFrame(r));

      const config = {
        ...DEFAULT_BACKTEST_CONFIG,
        startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        endDate: new Date(),
        variantId: 'baseline',
      };

      const { trades, summary } = runBacktest(config);
      setProgress(70);

      toast.info(`Generated ${trades.length} trades. Persisting…`);

      // Step 3: Persist to DB
      const persistence = await persistBacktestTrades(trades);
      setProgress(100);

      setResult({ trades: trades.length, inserted: persistence.inserted });

      if (persistence.errors > 0) {
        toast.warning(`Backtest complete: ${persistence.inserted}/${trades.length} persisted (${persistence.errors} errors)`);
      } else {
        toast.success(
          `Backtest complete: ${trades.length} trades | Win rate: ${(summary.winRate * 100).toFixed(1)}% | Net: ${summary.netPips >= 0 ? '+' : ''}${summary.netPips.toFixed(1)}p | PF: ${summary.profitFactor.toFixed(2)} | Sharpe: ${summary.sharpe.toFixed(2)}`
        );
      }
    } catch (err: any) {
      console.error('[BacktestRunner]', err);
      toast.error(`Backtest failed: ${err.message}`);
    } finally {
      setRunning(false);
    }
  }, [running]);

  return (
    <div className="flex items-center gap-3">
      <Button
        size="sm"
        variant="outline"
        onClick={handleRun}
        disabled={running}
        className="text-[10px] h-7 gap-1.5 border-neural-orange/30 text-neural-orange hover:bg-neural-orange/10"
      >
        {running ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : result ? (
          <CheckCircle2 className="w-3 h-3" />
        ) : (
          <FlaskConical className="w-3 h-3" />
        )}
        {running ? 'Running…' : result ? `${result.inserted} trades stored` : 'Run 90-Day Backtest'}
      </Button>
      {running && (
        <Progress value={progress} className="h-1.5 w-24" />
      )}
    </div>
  );
};
