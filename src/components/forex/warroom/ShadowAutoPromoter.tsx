// Shadow Agent Auto-Promoter — Shows backtester results with one-click deploy
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Rocket, FlaskConical, CheckCircle, XCircle, AlertTriangle,
  Loader2, Zap,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BacktestResult {
  id: string;
  memory_key: string;
  payload: {
    agentId?: string;
    recommendation?: string;
    winRate?: number;
    profitFactor?: number;
    maxDrawdownPips?: number;
    totalTrades?: number;
    netPips?: number;
    strategy?: string;
    pairs?: string[];
    sessions?: string[];
    regimes?: string[];
    [key: string]: unknown;
  };
  created_at: string;
}

export function ShadowAutoPromoter() {
  const [results, setResults] = useState<BacktestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState<string | null>(null);

  const fetchResults = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('sovereign_memory')
        .select('*')
        .eq('memory_type', 'backtest_result')
        .order('created_at', { ascending: false })
        .limit(30);

      if (!error && data) {
        const typed: BacktestResult[] = data.map(row => ({
          id: row.id,
          memory_key: row.memory_key,
          payload: (row.payload ?? {}) as BacktestResult['payload'],
          created_at: row.created_at,
        }));
        setResults(typed);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResults();
    const id = setInterval(fetchResults, 15_000);
    return () => clearInterval(id);
  }, [fetchResults]);

  const handleDeploy = async (result: BacktestResult) => {
    const agentId = result.payload.agentId || result.memory_key;
    setDeploying(agentId);

    try {
      // Write deployment record to sovereign_memory
      const { error } = await supabase
        .from('sovereign_memory')
        .upsert({
          memory_type: 'AGENT_DEPLOYMENT',
          memory_key: `deploy:${agentId}`,
          payload: {
            agentId,
            deployedFrom: 'auto-promoter',
            backtestId: result.id,
            strategy: result.payload.strategy,
            pairs: result.payload.pairs,
            sessions: result.payload.sessions,
            regimes: result.payload.regimes,
            backtestWinRate: result.payload.winRate,
            backtestPF: result.payload.profitFactor,
            deployedAt: new Date().toISOString(),
            status: 'active',
            sizing: 0.5, // start at 0.5x, FM can promote to 1.0x
          },
          relevance_score: 95,
          created_by: 'auto-promoter-ui',
        } as any);

      if (error) throw error;

      // Also write a gate_bypass so the FM loop picks it up
      await supabase
        .from('gate_bypasses')
        .insert({
          gate_id: `AGENT_DEPLOY:${agentId}`,
          reason: `Auto-promoted from backtester. WR: ${result.payload.winRate?.toFixed(1)}%, PF: ${result.payload.profitFactor?.toFixed(2)}, Net: ${result.payload.netPips?.toFixed(1)}p`,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(), // 30 days
          pair: result.payload.pairs?.[0] || null,
          created_by: 'auto-promoter-ui',
        });

      toast.success(`Agent "${agentId}" deployed at 0.5x sizing`);
      fetchResults();
    } catch (err) {
      toast.error(`Deploy failed: ${(err as Error).message}`);
    } finally {
      setDeploying(null);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-muted-foreground text-xs">
        <FlaskConical className="w-8 h-8 mx-auto mb-2 opacity-20" />
        Loading backtester results…
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-xs">
        <FlaskConical className="w-8 h-8 mx-auto mb-2 opacity-20" />
        No backtest results yet — FM can run via recursive-backtester
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/30">
        <Rocket className="w-4 h-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">
          Shadow Auto-Promoter
        </span>
        <Badge variant="secondary" className="ml-auto text-[10px] h-5 px-1.5 font-mono">
          {results.length}
        </Badge>
      </div>
      <ScrollArea className="h-[450px]">
        <div className="p-3 space-y-2">
          {results.map((r) => {
            const p = r.payload;
            const rec = p.recommendation || 'UNKNOWN';
            const isDeploy = rec === 'DEPLOY';
            const isRefine = rec === 'REFINE';
            const isReject = rec === 'REJECT';

            return (
              <div
                key={r.id}
                className="bg-muted/15 rounded-lg px-3 py-2.5 hover:bg-muted/25 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  {isDeploy && <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
                  {isRefine && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                  {isReject && <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                  {!isDeploy && !isRefine && !isReject && (
                    <FlaskConical className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="font-mono font-bold text-foreground text-[11px] truncate">
                    {p.agentId || r.memory_key}
                  </span>
                  <Badge
                    className={`text-[9px] h-4 px-1.5 font-mono border-0 ${
                      isDeploy
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : isRefine
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-red-500/20 text-red-300'
                    }`}
                  >
                    {rec}
                  </Badge>
                  <span className="text-[9px] text-muted-foreground ml-auto">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-3 text-[10px] font-mono pl-5 mb-1.5">
                  {p.winRate != null && (
                    <span className={p.winRate >= 55 ? 'text-emerald-400' : 'text-muted-foreground'}>
                      WR: {p.winRate.toFixed(1)}%
                    </span>
                  )}
                  {p.profitFactor != null && (
                    <span className={p.profitFactor >= 1.5 ? 'text-emerald-400' : 'text-muted-foreground'}>
                      PF: {p.profitFactor.toFixed(2)}
                    </span>
                  )}
                  {p.netPips != null && (
                    <span className={p.netPips >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      Net: {p.netPips >= 0 ? '+' : ''}{p.netPips.toFixed(1)}p
                    </span>
                  )}
                  {p.totalTrades != null && (
                    <span className="text-muted-foreground">{p.totalTrades} trades</span>
                  )}
                  {p.maxDrawdownPips != null && (
                    <span className="text-red-400/70">DD: {p.maxDrawdownPips.toFixed(1)}p</span>
                  )}
                </div>

                {/* Strategy / pairs info */}
                <div className="flex flex-wrap gap-1 pl-5 mb-1.5">
                  {p.strategy && (
                    <Badge variant="outline" className="text-[8px] h-4 px-1 font-mono">
                      {p.strategy}
                    </Badge>
                  )}
                  {p.pairs?.map((pair) => (
                    <Badge key={pair} variant="outline" className="text-[8px] h-4 px-1 font-mono">
                      {pair}
                    </Badge>
                  ))}
                  {p.sessions?.map((s) => (
                    <Badge key={s} variant="outline" className="text-[8px] h-4 px-1 font-mono opacity-60">
                      {s}
                    </Badge>
                  ))}
                </div>

                {/* Deploy button */}
                {isDeploy && (
                  <div className="pl-5">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-6 text-[10px] font-mono gap-1"
                      disabled={deploying === (p.agentId || r.memory_key)}
                      onClick={() => handleDeploy(r)}
                    >
                      {deploying === (p.agentId || r.memory_key) ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Zap className="w-3 h-3" />
                      )}
                      Deploy at 0.5x
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </motion.div>
  );
}
