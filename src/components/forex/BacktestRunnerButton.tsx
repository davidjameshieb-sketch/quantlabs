// One-click backtest runner — runs per-agent backtests for all 18 agents
import { useState, useCallback } from 'react';
import { FlaskConical, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { runBacktest, persistBacktestTrades, DEFAULT_BACKTEST_CONFIG } from '@/lib/forex/backtest';
import { ALL_AGENT_IDS } from '@/lib/agents/agentConfig';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export const BacktestRunnerButton = () => {
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentAgent, setCurrentAgent] = useState('');
  const [result, setResult] = useState<{ trades: number; inserted: number } | null>(null);

  const handleRun = useCallback(async () => {
    if (running || !user) return;
    setRunning(true);
    setProgress(5);
    setResult(null);

    try {
      // Step 1: Check which agents already have backtest data
      toast.info('Checking existing backtest data…');
      const { data: existing } = await supabase
        .from('oanda_orders')
        .select('agent_id')
        .eq('user_id', user.id)
        .eq('environment', 'backtest')
        .in('status', ['filled', 'closed'])
        .not('entry_price', 'is', null)
        .not('exit_price', 'is', null);

      const existingAgents = new Set(
        (existing || []).map((r: any) => r.agent_id).filter(Boolean)
      );

      const agents = (ALL_AGENT_IDS as string[]).filter(
        id => !existingAgents.has(id)
      );

      if (agents.length === 0) {
        toast.success('All 18 agents already have backtest data!');
        setResult({ trades: 0, inserted: 0 });
        setRunning(false);
        return;
      }

      toast.info(`Running backtest for ${agents.length} missing agent(s)…`);
      setProgress(10);

      let totalTrades = 0;
      let totalInserted = 0;
      let totalErrors = 0;

      // Step 2: Run backtest per missing agent
      for (let a = 0; a < agents.length; a++) {
        const agentId = agents[a];
        const pct = 10 + Math.round(((a + 1) / agents.length) * 85);
        setProgress(pct);
        setCurrentAgent(agentId);

        toast.info(`Backtesting ${a + 1}/${agents.length}: ${agentId}…`);

        // Let UI breathe between agents
        await new Promise(r => setTimeout(r, 50));

        const config = {
          ...DEFAULT_BACKTEST_CONFIG,
          startDate: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
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
      setCurrentAgent('');
      setResult({ trades: totalTrades, inserted: totalInserted });

      if (totalErrors > 0) {
        toast.warning(`Done: ${totalInserted}/${totalTrades} persisted across ${agents.length} agents (${totalErrors} errors)`);
      } else {
        toast.success(`Done: ${totalTrades} trades across ${agents.length} agents — all persisted`);
      }
    } catch (err: any) {
      console.error('[BacktestRunner]', err);
      toast.error(`Backtest failed: ${err.message}`);
    } finally {
      setRunning(false);
      setCurrentAgent('');
    }
  }, [running, user]);

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
        {running ? `${currentAgent}…` : result ? `${result.inserted} trades stored` : 'Run Missing Agent Backtests'}
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
