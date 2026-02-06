import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Lock,
  Zap,
  Activity,
  Ban,
  Eye,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { UpgradeModal } from '@/components/dashboard/UpgradeModal';
import { useAuth } from '@/contexts/AuthContext';
import { AgentDecision, AIAgent, AgentId } from '@/lib/agents/types';
import { ALL_AGENT_IDS } from '@/lib/agents/agentConfig';
import { AGENT_TRADE_META } from '@/lib/agents/agentMeta';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface LiveTradeBookProps {
  agents: Record<AgentId, AIAgent>;
}

const LIVE_HIDDEN_COUNT = 5;

const strategyColors: Record<string, string> = {
  pressing: 'bg-neural-green/20 text-neural-green border-neural-green/30',
  tracking: 'bg-primary/20 text-primary border-primary/30',
  holding: 'bg-neural-orange/20 text-neural-orange border-neural-orange/30',
  watching: 'bg-muted/30 text-muted-foreground border-border/50',
  avoiding: 'bg-neural-red/20 text-neural-red border-neural-red/30',
};

/** Simulated "last updated" ticker that auto-advances */
const useAutoRefreshLabel = () => {
  const [secondsAgo, setSecondsAgo] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSecondsAgo(s => (s >= 900 ? 0 : s + 1)), 1000);
    return () => clearInterval(id);
  }, []);
  if (secondsAgo < 60) return `${secondsAgo}s ago`;
  return `${Math.floor(secondsAgo / 60)}m ago`;
};

const formatTimestamp = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const formatTimeAgo = (ts: number) => {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
};

interface TradeRowData extends AgentDecision {
  agentId: AgentId;
}

export const LiveTradeBook = ({ agents }: LiveTradeBookProps) => {
  const { subscribed } = useAuth();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const refreshLabel = useAutoRefreshLabel();

  // Merge all agent decisions and sort by recency
  const allTrades: TradeRowData[] = useMemo(() => {
    return ALL_AGENT_IDS
      .flatMap(id =>
        agents[id].recentDecisions.map(d => ({ ...d, agentId: id }))
      )
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [agents]);

  // Split into "live" (5 most recent) and "history" (rest)
  const liveTrades = allTrades.slice(0, LIVE_HIDDEN_COUNT);
  const historyTrades = allTrades.slice(LIVE_HIDDEN_COUNT);

  // Simulated price movement (subtle pulse effect on live rows)
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setPulse(p => !p), 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div className="space-y-4">
        {/* Header bar */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <h2 className="font-display text-lg font-bold">Live Trade Book</h2>
            <Badge
              variant="outline"
              className="text-[10px] border-primary/30 bg-primary/10 text-primary gap-1"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neural-green opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-neural-green" />
              </span>
              15-min delayed
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            Updated {refreshLabel}
            <Badge variant="secondary" className="text-[10px]">
              {allTrades.length} signals
            </Badge>
          </div>
        </div>

        {/* ── LIVE SECTION (gated for free users) ────────────────────── */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent overflow-hidden">
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <CardTitle className="text-sm font-display">
                  Active Signals
                </CardTitle>
                <Badge className="text-[10px] bg-primary/20 text-primary border-primary/30 hover:bg-primary/20">
                  {LIVE_HIDDEN_COUNT} live
                </Badge>
              </div>
              {subscribed && (
                <Badge variant="outline" className="text-[10px] border-neural-green/30 bg-neural-green/10 text-neural-green gap-1">
                  <Eye className="w-2.5 h-2.5" />
                  Edge Access
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-1">
            {subscribed ? (
              <div className="space-y-1.5">
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_60px_70px_60px_60px_50px] gap-2 px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                  <span>Ticker</span>
                  <span className="text-center">Bias</span>
                  <span className="text-center">Strategy</span>
                  <span className="text-center">Conf.</span>
                  <span className="text-center">R:R</span>
                  <span className="text-right">Time</span>
                </div>
                <Separator className="opacity-30" />
                <AnimatePresence>
                  {liveTrades.map((trade, i) => (
                    <TradeRow
                      key={`${trade.ticker}-${trade.timestamp}`}
                      trade={trade}
                      isLive
                      pulse={pulse && i === 0}
                      index={i}
                    />
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              /* ── Gate for free users ── */
              <div className="relative">
                {/* Blurred preview */}
                <div className="space-y-1.5 filter blur-[6px] select-none pointer-events-none opacity-50">
                  <div className="grid grid-cols-[1fr_60px_70px_60px_60px_50px] gap-2 px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                    <span>Ticker</span>
                    <span className="text-center">Bias</span>
                    <span className="text-center">Strategy</span>
                    <span className="text-center">Conf.</span>
                    <span className="text-center">R:R</span>
                    <span className="text-right">Time</span>
                  </div>
                  <Separator className="opacity-30" />
                  {liveTrades.slice(0, 3).map((trade) => (
                    <div key={`blur-${trade.ticker}-${trade.timestamp}`} className="h-10 rounded bg-muted/20" />
                  ))}
                </div>
                {/* Overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card/60 backdrop-blur-sm rounded-lg">
                  <div className="p-2 rounded-full bg-primary/10">
                    <Lock className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {LIVE_HIDDEN_COUNT} Live Signals Hidden
                  </p>
                  <p className="text-xs text-muted-foreground text-center max-w-xs">
                    Upgrade to Edge Access to see AI trades when they happen — near real-time intelligence.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setUpgradeOpen(true)}
                    className="mt-1 gap-1 text-xs h-8"
                  >
                    <Zap className="w-3 h-3" />
                    Unlock Live Book
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── HISTORY SECTION (visible to all) ───────────────────── */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <CardTitle className="text-sm font-display">
                  Trade History
                </CardTitle>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                {historyTrades.length} past signals
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-1">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_60px_70px_60px_60px_50px] gap-2 px-2 py-1 text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
              <span>Ticker</span>
              <span className="text-center">Bias</span>
              <span className="text-center">Strategy</span>
              <span className="text-center">Conf.</span>
              <span className="text-center">R:R</span>
              <span className="text-right">Time</span>
            </div>
            <Separator className="opacity-30 mb-1" />
            <ScrollArea className="h-[420px]">
              <div className="space-y-1 pr-2">
                {historyTrades.map((trade, i) => (
                  <TradeRow
                    key={`hist-${trade.ticker}-${trade.timestamp}-${i}`}
                    trade={trade}
                    isLive={false}
                    pulse={false}
                    index={i}
                  />
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        feature="liveTradeSignals"
        headline="Unlock the Live Trade Book"
        description="See AI trade signals the moment they fire — near real-time, 15-minute delayed intelligence across all markets."
      />
    </>
  );
};

/* ─── Individual trade row ────────────────────────────────────────── */

const TradeRow = ({
  trade,
  isLive,
  pulse,
  index,
}: {
  trade: TradeRowData;
  isLive: boolean;
  pulse: boolean;
  index: number;
}) => {
  const meta = AGENT_TRADE_META[trade.agentId];
  const isBullish = trade.bias === 'bullish';

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      className={cn(
        'grid grid-cols-[1fr_60px_70px_60px_60px_50px] gap-2 items-center px-2 py-2 rounded-md text-xs transition-colors',
        isLive
          ? 'hover:bg-primary/10 border border-transparent hover:border-primary/20'
          : 'hover:bg-muted/30',
        pulse && 'bg-primary/5'
      )}
    >
      {/* Ticker + Agent */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-sm" title={meta.short}>{meta.icon}</span>
        <Link
          to={`/dashboard/ticker/${trade.ticker}`}
          className="font-display font-bold text-sm truncate hover:text-primary transition-colors"
        >
          {trade.ticker}
        </Link>
        {isLive && (
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neural-green opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-neural-green" />
          </span>
        )}
      </div>

      {/* Bias */}
      <div className="flex items-center justify-center gap-1">
        {isBullish ? (
          <TrendingUp className="w-3 h-3 text-neural-green" />
        ) : (
          <TrendingDown className="w-3 h-3 text-neural-red" />
        )}
        <span
          className={cn(
            'font-bold uppercase text-[10px]',
            isBullish ? 'text-neural-green' : 'text-neural-red'
          )}
        >
          {trade.bias === 'bullish' ? 'BUY' : 'SELL'}
        </span>
      </div>

      {/* Strategy */}
      <div className="flex justify-center">
        <Badge
          variant="outline"
          className={cn('text-[9px] px-1.5 py-0 leading-4', strategyColors[trade.strategy])}
        >
          {trade.strategy === 'avoiding' && <Ban className="w-2 h-2 mr-0.5" />}
          {trade.strategy.toUpperCase()}
        </Badge>
      </div>

      {/* Confidence */}
      <div className="text-center">
        <span
          className={cn(
            'font-mono font-medium',
            trade.confidence > 70 ? 'text-neural-green' : trade.confidence > 50 ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          {trade.confidence.toFixed(0)}%
        </span>
      </div>

      {/* R:R */}
      <div className="text-center font-mono text-muted-foreground">
        {trade.riskReward.toFixed(1)}
      </div>

      {/* Time */}
      <div className="text-right text-muted-foreground whitespace-nowrap">
        {isLive ? formatTimestamp(trade.timestamp) : formatTimeAgo(trade.timestamp)}
      </div>
    </motion.div>
  );
};
