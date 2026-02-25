// AtlasHedgeLiveFeed — Real Trade Activity Feed from oanda_orders
// Groups recent atlas-hedge trades into time batches with audit details

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, ShieldCheck, Bot, Clock, Target, Wallet, CheckSquare,
  TrendingUp, TrendingDown, ChevronDown, RefreshCw,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { supabase } from '@/integrations/supabase/client';

// ── Helpers ──

const ATLAS_HEDGE_PREFIX = 'atlas-hedge-';

function getPips(trade: any): number {
  if (!trade.entry_price || !trade.exit_price) return 0;
  const isJPY = trade.currency_pair?.includes('JPY');
  const mult = isJPY ? 100 : 10000;
  return trade.direction === 'long'
    ? (trade.exit_price - trade.entry_price) * mult
    : (trade.entry_price - trade.exit_price) * mult;
}

function formatPair(pair: string): string {
  return pair?.replace('_', '/') || pair;
}

function getStrategyType(agentId: string): 'MOM' | 'CTR' {
  return agentId?.includes('-m') ? 'MOM' : 'CTR';
}

function getTradeType(trade: any): 'OPEN' | 'CLOSE' {
  return trade.exit_price != null ? 'CLOSE' : 'OPEN';
}

// ── Batch grouping ──

interface TradeBatch {
  batchId: string;
  timeWindow: string;
  startTime: Date;
  trades: any[];
  netPnlPips: number;
}

function groupIntoBatches(trades: any[]): TradeBatch[] {
  if (trades.length === 0) return [];

  // Sort by created_at desc
  const sorted = [...trades].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Group into 30-minute windows
  const batches: TradeBatch[] = [];
  let currentBatch: any[] = [];
  let batchStart: Date | null = null;

  for (const trade of sorted) {
    const tradeTime = new Date(trade.created_at);

    if (!batchStart || (batchStart.getTime() - tradeTime.getTime()) > 30 * 60 * 1000) {
      if (currentBatch.length > 0 && batchStart) {
        const oldest = new Date(currentBatch[currentBatch.length - 1].created_at);
        batches.push(createBatch(currentBatch, oldest, batchStart));
      }
      currentBatch = [trade];
      batchStart = tradeTime;
    } else {
      currentBatch.push(trade);
    }
  }

  if (currentBatch.length > 0 && batchStart) {
    const oldest = new Date(currentBatch[currentBatch.length - 1].created_at);
    batches.push(createBatch(currentBatch, oldest, batchStart));
  }

  return batches;
}

function createBatch(trades: any[], start: Date, end: Date): TradeBatch {
  const fmt = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const netPips = trades.reduce((sum, t) => sum + getPips(t), 0);

  return {
    batchId: `B-${end.getTime().toString(36).toUpperCase().slice(-8)}`,
    timeWindow: `${fmt(start)} → ${fmt(end)}`,
    startTime: end,
    trades,
    netPnlPips: Math.round(netPips * 10) / 10,
  };
}

// ── Sub-Components ──

function PnlDisplay({ value }: { value: number }) {
  const color = value > 0 ? 'text-[#39ff14]' : value < 0 ? 'text-[#ff0055]' : 'text-slate-500';
  const prefix = value > 0 ? '+' : '';
  return <span className={`font-mono font-bold ${color}`}>{prefix}{value.toFixed(1)}p</span>;
}

function StratBadge({ strategy }: { strategy: 'MOM' | 'CTR' }) {
  return strategy === 'MOM' ? (
    <Badge className="bg-[#39ff14]/15 text-[#39ff14] border-[#39ff14]/30 text-[9px] px-1.5 py-0 font-mono rounded-sm hover:bg-[#39ff14]/20">
      MOM
    </Badge>
  ) : (
    <Badge className="bg-[#ff8800]/15 text-[#ff8800] border-[#ff8800]/30 text-[9px] px-1.5 py-0 font-mono rounded-sm hover:bg-[#ff8800]/20">
      CTR
    </Badge>
  );
}

function TradeHoverContent({ trade }: { trade: any }) {
  const isClose = trade.exit_price != null;
  const pips = getPips(trade);

  return (
    <div className="space-y-2 p-1">
      <div className={`text-[10px] font-mono font-bold tracking-widest uppercase border-b border-slate-700/50 pb-1.5 ${isClose ? 'text-[#a855f7]' : 'text-[#00ffea]'}`}>
        {isClose ? 'EXIT DETAILS' : 'ENTRY DETAILS'}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-start gap-1.5">
          <CheckSquare className="w-3 h-3 mt-0.5 shrink-0 text-[#39ff14]" />
          <span className="text-[10px] font-mono text-slate-300">Agent: {trade.agent_id}</span>
        </div>
        <div className="flex items-start gap-1.5">
          <CheckSquare className="w-3 h-3 mt-0.5 shrink-0 text-[#39ff14]" />
          <span className="text-[10px] font-mono text-slate-300">Entry: {trade.entry_price || 'Pending'}</span>
        </div>
        {isClose && (
          <>
            <div className="flex items-start gap-1.5">
              <CheckSquare className="w-3 h-3 mt-0.5 shrink-0 text-[#39ff14]" />
              <span className="text-[10px] font-mono text-slate-300">Exit: {trade.exit_price}</span>
            </div>
            <div className="flex items-start gap-1.5">
              <CheckSquare className={`w-3 h-3 mt-0.5 shrink-0 ${pips >= 0 ? 'text-[#39ff14]' : 'text-[#ff0055]'}`} />
              <span className="text-[10px] font-mono text-slate-300">Result: {pips > 0 ? '+' : ''}{pips.toFixed(1)} pips</span>
            </div>
          </>
        )}
        {trade.gate_result && (
          <div className="flex items-start gap-1.5">
            <CheckSquare className="w-3 h-3 mt-0.5 shrink-0 text-[#39ff14]" />
            <span className="text-[10px] font-mono text-slate-300">Gate: {trade.gate_result}</span>
          </div>
        )}
        {trade.session_label && (
          <div className="flex items-start gap-1.5">
            <CheckSquare className="w-3 h-3 mt-0.5 shrink-0 text-[#39ff14]" />
            <span className="text-[10px] font-mono text-slate-300">Session: {trade.session_label}</span>
          </div>
        )}
        {trade.regime_label && (
          <div className="flex items-start gap-1.5">
            <CheckSquare className="w-3 h-3 mt-0.5 shrink-0 text-[#39ff14]" />
            <span className="text-[10px] font-mono text-slate-300">Regime: {trade.regime_label}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TradeRow({ trade, index }: { trade: any; index: number }) {
  const isClose = trade.exit_price != null;
  const strategy = getStrategyType(trade.agent_id);
  const pips = getPips(trade);
  const Icon = isClose ? TrendingDown : TrendingUp;
  const iconColor = isClose
    ? (pips > 0 ? 'text-[#39ff14]' : 'text-[#ff0055]')
    : 'text-[#00ffea]';

  const telemetryLine = isClose
    ? `↳ ${trade.agent_id?.replace('atlas-hedge-', '')} | Entry: ${trade.entry_price} → Exit: ${trade.exit_price} | ${pips > 0 ? '+' : ''}${pips.toFixed(1)}p`
    : `↳ ${trade.agent_id?.replace('atlas-hedge-', '')} | Entry: ${trade.entry_price || 'pending'} | Status: ${trade.status}`;

  return (
    <div className={`${index % 2 === 0 ? 'bg-slate-800/20' : 'bg-transparent'} px-2 py-1.5`}>
      <div className="flex items-center gap-2 text-xs">
        <Icon className={`w-3 h-3 shrink-0 ${iconColor}`} />
        <span className="font-mono font-bold text-[10px] text-slate-400 w-10">{isClose ? 'CLOSE' : 'OPEN'}</span>
        <StratBadge strategy={strategy} />
        <span className={`font-mono text-[10px] font-bold ${trade.direction === 'long' ? 'text-[#39ff14]' : 'text-[#ff0055]'}`}>
          {trade.direction?.toUpperCase()}
        </span>
        <span className="font-mono text-[10px] text-white font-semibold">{formatPair(trade.currency_pair)}</span>
        <span className="flex-1" />
        {isClose && <PnlDisplay value={Math.round(pips * 10) / 10} />}
      </div>

      <HoverCard openDelay={150} closeDelay={100}>
        <HoverCardTrigger asChild>
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5 pl-5 cursor-help hover:text-slate-300 transition-colors">
            {telemetryLine}
          </div>
        </HoverCardTrigger>
        <HoverCardContent
          side="top"
          align="start"
          className="w-72 bg-slate-900/95 backdrop-blur-xl border border-slate-700/60 shadow-2xl"
        >
          <TradeHoverContent trade={trade} />
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}

function BatchCard({ batch }: { batch: TradeBatch }) {
  const [collapseOpen, setCollapseOpen] = useState(false);
  const visibleTrades = batch.trades.slice(0, 3);
  const hiddenTrades = batch.trades.slice(3);

  const closedCount = batch.trades.filter(t => t.exit_price != null).length;
  const openCount = batch.trades.length - closedCount;

  return (
    <motion.div
      initial={{ opacity: 0, y: -30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <Card className="bg-slate-900/70 backdrop-blur-sm border-slate-800/60 overflow-hidden">
        {/* Card Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/40">
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3 text-slate-500" />
            <span className="text-[10px] font-mono text-slate-400">{batch.timeWindow}</span>
            <span className="text-[9px] font-mono text-slate-600">#{batch.batchId}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs">
              <PnlDisplay value={batch.netPnlPips} />
            </div>
            <Badge
              variant="outline"
              className="text-[9px] font-mono px-1.5 py-0 border-slate-700 text-slate-400"
            >
              {closedCount > 0 && `${closedCount} closed`}
              {closedCount > 0 && openCount > 0 && ' · '}
              {openCount > 0 && `${openCount} opened`}
            </Badge>
          </div>
        </div>

        <CardContent className="p-0">
          {visibleTrades.map((trade, i) => (
            <TradeRow key={trade.id || i} trade={trade} index={i} />
          ))}

          {hiddenTrades.length > 0 && (
            <Collapsible open={collapseOpen} onOpenChange={setCollapseOpen}>
              <CollapsibleTrigger className="w-full px-3 py-1.5 text-[10px] font-mono text-[#00ffea] hover:text-white hover:bg-slate-800/40 transition-colors flex items-center gap-1 cursor-pointer">
                <ChevronDown className={`w-3 h-3 transition-transform ${collapseOpen ? 'rotate-180' : ''}`} />
                View {hiddenTrades.length} more executions…
              </CollapsibleTrigger>
              <CollapsibleContent>
                {hiddenTrades.map((trade, i) => (
                  <TradeRow key={trade.id || i + 3} trade={trade} index={i + 3} />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}

          <Separator className="bg-slate-800/40" />

          {/* Portfolio context */}
          <div className="flex items-start gap-2 px-3 py-2 border-t border-slate-800/30">
            <ShieldCheck className="w-3 h-3 mt-0.5 shrink-0 text-slate-600" />
            <span className="text-[10px] font-mono text-slate-600 leading-tight">
              Real OANDA executions from the Atlas Hedge portfolio. {closedCount} position{closedCount !== 1 ? 's' : ''} closed, {openCount} opened in this window.
            </span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Main Component ──

export default function AtlasHedgeLiveFeed() {
  const [batches, setBatches] = useState<TradeBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [cumulativePnl, setCumulativePnl] = useState(0);
  const [totalTrades, setTotalTrades] = useState(0);

  const fetchTrades = useCallback(async () => {
    try {
      // Get all atlas-hedge agent IDs
      const { data: agents } = await supabase
        .from('agent_configs')
        .select('agent_id')
        .like('agent_id', `${ATLAS_HEDGE_PREFIX}%`);

      if (!agents || agents.length === 0) {
        setBatches([]);
        setLoading(false);
        return;
      }

      const agentIds = agents.map(a => a.agent_id);

      // Fetch recent trades (last 48 hours) — both open and closed
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data: trades } = await supabase
        .from('oanda_orders')
        .select('*')
        .in('agent_id', agentIds)
        .in('status', ['filled', 'open', 'closed'])
        .not('entry_price', 'is', null)
        .eq('baseline_excluded', false)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(200);

      const allTrades = trades ?? [];
      setTotalTrades(allTrades.length);

      // Calculate cumulative PnL from closed trades
      const pnl = allTrades
        .filter(t => t.exit_price != null)
        .reduce((sum, t) => sum + getPips(t), 0);
      setCumulativePnl(Math.round(pnl * 10) / 10);

      // Group into batches
      setBatches(groupIntoBatches(allTrades));
    } catch (err) {
      console.error('[AtlasHedgeLiveFeed] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + 60s polling
  useEffect(() => {
    fetchTrades();
    const id = setInterval(fetchTrades, 60000);
    return () => clearInterval(id);
  }, [fetchTrades]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('atlas-live-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oanda_orders' }, (payload) => {
        const agentId = (payload.new as any)?.agent_id || '';
        if (agentId.startsWith(ATLAS_HEDGE_PREFIX)) fetchTrades();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchTrades]);

  const pnlColor = cumulativePnl > 0 ? 'text-[#39ff14]' : cumulativePnl < 0 ? 'text-[#ff0055]' : 'text-slate-500';

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/40 rounded-2xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="sticky top-0 z-10 backdrop-blur-xl bg-slate-900/90 border-b border-slate-700/40 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-[#a855f7]" />
            <span className="text-[10px] font-mono font-bold text-[#a855f7] uppercase tracking-widest">
              TRADE LOG
            </span>
          </div>
          <Separator orientation="vertical" className="h-3 bg-slate-700" />
          <span className="text-[10px] font-mono text-slate-400">
            Last 48h · {totalTrades} executions
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Wallet className="w-3 h-3 text-slate-500" />
            <span className="text-[10px] font-mono text-slate-500">PnL:</span>
            <span className={`text-xs font-mono font-bold ${pnlColor}`}>
              {cumulativePnl > 0 ? '+' : ''}{cumulativePnl.toFixed(1)}p
            </span>
          </div>
          <button onClick={fetchTrades} className="text-slate-500 hover:text-white transition-colors">
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Feed */}
      <ScrollArea className="h-[600px]">
        <div className="p-3 space-y-2">
          {loading && batches.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-4 h-4 animate-spin text-slate-500" />
              <span className="text-[10px] font-mono text-slate-500 ml-2">Loading trade history…</span>
            </div>
          ) : batches.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="w-6 h-6 mx-auto text-slate-600 mb-2" />
              <p className="text-[10px] font-mono text-slate-500">No trade activity in the last 48 hours.</p>
              <p className="text-[9px] font-mono text-slate-600 mt-1">The system is monitoring for entry signals.</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {batches.map(batch => (
                <BatchCard key={batch.batchId} batch={batch} />
              ))}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
