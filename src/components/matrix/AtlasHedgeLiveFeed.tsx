// AtlasHedgeLiveFeed — 10-Minute Batch Processing Timeline
// High-density Bloomberg-terminal aesthetic with progressive disclosure via HoverCards

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, ShieldCheck, Bot, Clock, Target, Wallet, CheckSquare,
  TrendingUp, TrendingDown, ChevronDown,
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

// ── Data Schema ──

interface AuditSnapshot {
  predatorRank: number;
  preyRank: number;
  spread: number;
  volRegime: 'EXPAND' | 'CONTRACT' | 'FLAT';
  triggerSpeedMs?: number;
  exitSpread?: number;
  barsHeld?: number;
}

interface TradeAction {
  type: 'OPEN' | 'CLOSE';
  pair: string;
  strategy: 'MOM' | 'CTR';
  direction: 'LONG' | 'SHORT';
  pnlMoney?: number;
  pnlPips?: number;
  auditSnapshot: AuditSnapshot;
}

interface BatchPulse {
  batchId: string;
  timeWindow: string;
  netPnlMoney: number;
  netPnlPips: number;
  totalTrades: number;
  actions: TradeAction[];
}

// ── Snark Banks ──

const SNARK_WIN = [
  "Extracting alpha from retail inefficiency.",
  "Ranks diverged nicely. The liquidity gods are pleased.",
  "Pure mathematical inevitability. Don't get emotional about it.",
  "Dispersion harvesting on schedule. Variance is our friend.",
  "Edge captured. The matrix doesn't negotiate.",
];

const SNARK_LOSS = [
  "Paid the spread tax. Cost of doing business.",
  "Variance happens. 19 other strategies are picking up the slack.",
  "Temporary drawdown. Just noise in the dispersion envelope.",
  "Friction absorbed. The ensemble shrugs.",
  "Drawdown noted. Statistically irrelevant over N trades.",
];

const SNARK_IDLE = [
  "No structural edge detected. Capital preservation is an active position.",
  "Matrix ranks stagnant. Refusing to pay the spread for zero edge.",
  "Standing down. No divergence worth the transaction cost.",
  "Flat. Waiting for the matrix to speak.",
];

// ── Mock Pairs ──

const PAIRS = [
  'GBP/JPY', 'EUR/USD', 'AUD/NZD', 'GBP/AUD', 'EUR/GBP',
  'USD/CAD', 'NZD/JPY', 'AUD/JPY', 'GBP/NZD', 'EUR/AUD',
];

const VOL_REGIMES: AuditSnapshot['volRegime'][] = ['EXPAND', 'CONTRACT', 'FLAT'];

// ── Mock Engine ──

function generateBatch(): BatchPulse {
  const now = new Date();
  const start = new Date(now.getTime() - 10 * 60 * 1000);
  const fmt = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const timeWindow = `${fmt(start)} → ${fmt(now)}`;

  const tradeCount = Math.random() < 0.15 ? 0 : Math.floor(Math.random() * 6) + 1;
  const actions: TradeAction[] = [];

  for (let i = 0; i < tradeCount; i++) {
    const isClose = Math.random() > 0.5;
    const strategy = Math.random() > 0.5 ? 'MOM' : 'CTR';
    const direction = Math.random() > 0.5 ? 'LONG' : 'SHORT';
    const pair = PAIRS[Math.floor(Math.random() * PAIRS.length)];
    const volRegime = VOL_REGIMES[Math.floor(Math.random() * 3)];

    // Generate valid rank pair: predator must differ from prey, spread = |predator - prey|
    const predatorRank = Math.floor(Math.random() * 8) + 1; // 1-8
    let preyRank: number;
    do {
      preyRank = Math.floor(Math.random() * 8) + 1;
    } while (preyRank === predatorRank);
    const spread = Math.abs(predatorRank - preyRank); // max 7, mathematically correct

    const action: TradeAction = {
      type: isClose ? 'CLOSE' : 'OPEN',
      pair,
      strategy,
      direction,
      auditSnapshot: {
        predatorRank,
        preyRank,
        spread,
        volRegime,
        triggerSpeedMs: isClose ? undefined : Math.floor(Math.random() * 200) + 30,
        exitSpread: isClose ? Math.max(1, spread - Math.floor(Math.random() * 5)) : undefined,
        barsHeld: isClose ? Math.floor(Math.random() * 40) + 2 : undefined,
      },
    };

    if (isClose) {
      const pips = (Math.random() - 0.45) * 30;
      action.pnlPips = Math.round(pips * 10) / 10;
      action.pnlMoney = Math.round(pips * 1.1 * 100) / 100;
    }

    actions.push(action);
  }

  const netPnlPips = actions.reduce((s, a) => s + (a.pnlPips || 0), 0);
  const netPnlMoney = actions.reduce((s, a) => s + (a.pnlMoney || 0), 0);

  return {
    batchId: `B-${Date.now().toString(36).toUpperCase()}`,
    timeWindow,
    netPnlMoney: Math.round(netPnlMoney * 100) / 100,
    netPnlPips: Math.round(netPnlPips * 10) / 10,
    totalTrades: tradeCount,
    actions,
  };
}

function pickSnark(pnl: number, tradeCount: number): string {
  if (tradeCount === 0) return SNARK_IDLE[Math.floor(Math.random() * SNARK_IDLE.length)];
  const bank = pnl > 0 ? SNARK_WIN : SNARK_LOSS;
  return bank[Math.floor(Math.random() * bank.length)];
}

// ── Countdown Hook ──

function useCountdown(intervalSec: number) {
  const [remaining, setRemaining] = useState(intervalSec);

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(prev => (prev <= 1 ? intervalSec : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [intervalSec]);

  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Sub-Components ──

function PnlDisplay({ value, isMoney = false }: { value: number; isMoney?: boolean }) {
  const color = value > 0 ? 'text-[#39ff14]' : value < 0 ? 'text-[#ff0055]' : 'text-slate-500';
  const prefix = value > 0 ? '+' : '';
  const display = isMoney
    ? `${prefix}$${Math.abs(value).toFixed(2)}`
    : `${prefix}${value.toFixed(1)}p`;
  return <span className={`font-mono font-bold ${color}`}>{display}</span>;
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

function OpenHoverContent({ audit }: { audit: AuditSnapshot }) {
  const spreadPass = audit.spread >= 6;
  return (
    <div className="space-y-2 p-1">
      <div className="text-[10px] font-mono font-bold text-[#00ffea] tracking-widest uppercase border-b border-slate-700/50 pb-1.5">
        SYSTEM AUDIT: ENTRY LOG
      </div>
      <div className="space-y-1.5">
        {[
          { pass: spreadPass, label: `Matrix Divergence Confirmed (Spread ≥ 6) → ${audit.spread}` },
          { pass: true, label: 'Diversification Guard Passed' },
          { pass: true, label: `Volatility Gate Cleared (${audit.volRegime})` },
          { pass: true, label: `First-In-Wins Execution: ${audit.triggerSpeedMs}ms` },
        ].map((item, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <CheckSquare className={`w-3 h-3 mt-0.5 shrink-0 ${item.pass ? 'text-[#39ff14]' : 'text-[#ff0055]'}`} />
            <span className="text-[10px] font-mono text-slate-300">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CloseHoverContent({ audit }: { audit: AuditSnapshot }) {
  const spreadDelta = audit.spread - (audit.exitSpread || audit.spread);
  return (
    <div className="space-y-2 p-1">
      <div className="text-[10px] font-mono font-bold text-[#a855f7] tracking-widest uppercase border-b border-slate-700/50 pb-1.5">
        SYSTEM AUDIT: EXIT LOG
      </div>
      <div className="space-y-1.5">
        {[
          'Position Lock Released',
          `Rank Delta: Spread compressed by ${spreadDelta}`,
          'Strategy Cycle Complete',
        ].map((label, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <CheckSquare className="w-3 h-3 mt-0.5 shrink-0 text-[#39ff14]" />
            <span className="text-[10px] font-mono text-slate-300">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TradeRow({ action, index }: { action: TradeAction; index: number }) {
  const isOpen = action.type === 'OPEN';
  const Icon = isOpen ? TrendingUp : TrendingDown;
  const iconColor = isOpen ? 'text-[#00ffea]' : action.pnlPips && action.pnlPips > 0 ? 'text-[#39ff14]' : 'text-[#ff0055]';
  const a = action.auditSnapshot;

  const telemetryLine = isOpen
    ? `↳ ${action.strategy} | Ranks: #${a.predatorRank}v#${a.preyRank} | Spread: ${a.spread} | Vol: ${a.volRegime}`
    : `↳ Result | Entry Spread: ${a.spread} → Exit Spread: ${a.exitSpread} | Bars Held: ${a.barsHeld}`;

  return (
    <div className={`${index % 2 === 0 ? 'bg-slate-800/20' : 'bg-transparent'} px-2 py-1.5`}>
      {/* Main Row */}
      <div className="flex items-center gap-2 text-xs">
        <Icon className={`w-3 h-3 shrink-0 ${iconColor}`} />
        <span className="font-mono font-bold text-[10px] text-slate-400 w-10">{action.type}</span>
        <StratBadge strategy={action.strategy} />
        <span className={`font-mono text-[10px] font-bold ${action.direction === 'LONG' ? 'text-[#39ff14]' : 'text-[#ff0055]'}`}>
          {action.direction}
        </span>
        <span className="font-mono text-[10px] text-white font-semibold">{action.pair}</span>
        <span className="flex-1" />
        {action.pnlPips !== undefined && (
          <PnlDisplay value={action.pnlPips} />
        )}
      </div>

      {/* Inline Audit Row with HoverCard */}
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
          {isOpen
            ? <OpenHoverContent audit={a} />
            : <CloseHoverContent audit={a} />}
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}

function BatchCard({ batch }: { batch: BatchPulse }) {
  const [collapseOpen, setCollapseOpen] = useState(false);
  const snark = pickSnark(batch.netPnlPips, batch.totalTrades);
  const snarkTint = batch.netPnlPips > 0
    ? 'text-[#39ff14]/60 bg-[#39ff14]/5'
    : batch.netPnlPips < 0
      ? 'text-[#ff0055]/60 bg-[#ff0055]/5'
      : 'text-slate-500 bg-slate-800/30';

  const visibleActions = batch.actions.slice(0, 3);
  const hiddenActions = batch.actions.slice(3);

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
              {batch.totalTrades} trades
            </Badge>
          </div>
        </div>

        <CardContent className="p-0">
          {/* Trade Rows */}
          {batch.totalTrades === 0 ? (
            <div className="px-3 py-3 text-[10px] font-mono text-slate-600 text-center italic">
              No executions this cycle. Matrix dormant.
            </div>
          ) : (
            <>
              {visibleActions.map((action, i) => (
                <TradeRow key={i} action={action} index={i} />
              ))}

              {hiddenActions.length > 0 && (
                <Collapsible open={collapseOpen} onOpenChange={setCollapseOpen}>
                  <CollapsibleTrigger className="w-full px-3 py-1.5 text-[10px] font-mono text-[#00ffea] hover:text-white hover:bg-slate-800/40 transition-colors flex items-center gap-1 cursor-pointer">
                    <ChevronDown className={`w-3 h-3 transition-transform ${collapseOpen ? 'rotate-180' : ''}`} />
                    View {hiddenActions.length} more executions…
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    {hiddenActions.map((action, i) => (
                      <TradeRow key={i + 3} action={action} index={i + 3} />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </>
          )}

          <Separator className="bg-slate-800/40" />

          {/* QuantSnark */}
          <div className={`flex items-start gap-2 px-3 py-2 ${snarkTint} rounded-none`}>
            <Bot className="w-3 h-3 mt-0.5 shrink-0 opacity-60" />
            <span className="text-xs italic font-mono leading-tight opacity-70">{snark}</span>
          </div>

          {/* Portfolio Thesis */}
          <div className="flex items-start gap-2 px-3 py-2 border-t border-slate-800/30">
            <ShieldCheck className="w-3 h-3 mt-0.5 shrink-0 text-slate-600" />
            <span className="text-[10px] font-mono text-slate-600 leading-tight">
              System Integrity Normal. The Atlas Hedge maintains delta-neutrality via 20 decorrelated Momentum & Counter-Leg strategies. Individual batch variance is irrelevant to long-term dispersion yield.
            </span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Main Component ──

export default function AtlasHedgeLiveFeed() {
  const [batches, setBatches] = useState<BatchPulse[]>(() => [generateBatch()]);
  const [cumulativePnl, setCumulativePnl] = useState(0);
  const countdown = useCountdown(60);

  useEffect(() => {
    const id = setInterval(() => {
      const newBatch = generateBatch();
      setBatches(prev => [newBatch, ...prev].slice(0, 20));
      setCumulativePnl(prev => Math.round((prev + newBatch.netPnlPips) * 10) / 10);
    }, 60000);

    return () => clearInterval(id);
  }, []);

  const pnlColor = cumulativePnl > 0 ? 'text-[#39ff14]' : cumulativePnl < 0 ? 'text-[#ff0055]' : 'text-slate-500';

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/40 rounded-2xl overflow-hidden shadow-2xl">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 backdrop-blur-xl bg-slate-900/90 border-b border-slate-700/40 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#39ff14] animate-pulse" />
            <span className="text-[10px] font-mono font-bold text-[#39ff14] uppercase tracking-widest">
              SYSTEM LIVE
            </span>
          </div>
          <Separator orientation="vertical" className="h-3 bg-slate-700" />
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-500" />
            <span className="text-[10px] font-mono text-slate-400">
              Next Matrix Pulse in <span className="text-white font-bold">{countdown}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Wallet className="w-3 h-3 text-slate-500" />
          <span className="text-[10px] font-mono text-slate-500">Session PnL:</span>
          <span className={`text-xs font-mono font-bold ${pnlColor}`}>
            {cumulativePnl > 0 ? '+' : ''}{cumulativePnl.toFixed(1)}p
          </span>
        </div>
      </div>

      {/* Feed */}
      <ScrollArea className="h-[600px]">
        <div className="p-3 space-y-2">
          <AnimatePresence initial={false}>
            {batches.map(batch => (
              <BatchCard key={batch.batchId} batch={batch} />
            ))}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
}
