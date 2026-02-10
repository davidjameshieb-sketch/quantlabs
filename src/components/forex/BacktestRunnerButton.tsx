// One-click backtest runner — runs per-agent backtests for all 18 agents
import { useState, useCallback } from 'react';
import { FlaskConical, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { runBacktest, persistBacktestTrades, clearBacktestTrades, DEFAULT_BACKTEST_CONFIG } from '@/lib/forex/backtest';
import { ALL_AGENT_IDS } from '@/lib/agents/agentConfig';
import { toast } from 'sonner';

export const BacktestRunnerButton = () => {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ trades: number; inserted: number } | null>(null);

  const handleRun = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setProgress(5);
    setResult(null);

    try {
      // Step 1: Clear all previous backtest trades
      toast.info('Clearing previous backtest data…');
      await clearBacktestTrades('baseline');
      setProgress(10);

      const agents = ALL_AGENT_IDS as string[];
      let totalTrades = 0;
      let totalInserted = 0;
      let totalErrors = 0;

      // Step 2: Run backtest per agent
      for (let a = 0; a < agents.length; a++) {
        const agentId = agents[a];
        const pct = 10 + Math.round((a / agents.length) * 75);
        setProgress(pct);

        toast.info(`Backtesting agent ${a + 1}/${agents.length}: ${agentId}…`);

        // Let UI breathe between agents
        await new Promise(r => requestAnimationFrame(r));

        const config = {
          ...DEFAULT_BACKTEST_CONFIG,
          startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
          endDate: new Date(),
          variantId: 'baseline',
          agentId,
        };

        const { trades } = runBacktest(config);
        totalTrades += trades.length;

        // Persist this agent's trades
        if (trades.length > 0) {
          const persistence = await persistBacktestTrades(trades);
          totalInserted += persistence.inserted;
          totalErrors += persistence.errors;
        }
      }

      setProgress(100);
      setResult({ trades: totalTrades, inserted: totalInserted });

      if (totalErrors > 0) {
        toast.warning(`Backtest complete: ${totalInserted}/${totalTrades} persisted across ${agents.length} agents (${totalErrors} errors)`);
      } else {
        toast.success(`Backtest complete: ${totalTrades} trades across ${agents.length} agents — all persisted`);
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
        {running ? 'Running…' : result ? `${result.inserted} trades stored` : 'Run Per-Agent Backtest (90d)'}
      </Button>
      {running && (
        <div className="flex items-center gap-2">
          <Progress value={progress} className="h-1.5 w-24" />
          <span className="text-[9px] text-muted-foreground">{progress}%</span>
        </div>
      )}
    </div>
  );
};
