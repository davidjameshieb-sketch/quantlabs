// Forex Command Center — Consolidated live trading dashboard
// 4 tabs: Command Center, Performance, Governance, Archive

import { useState, useMemo, useEffect, useCallback } from 'react';
import { LongOnlyFilterProvider } from '@/contexts/LongOnlyFilterContext';
import { motion } from 'framer-motion';
import {
  Globe, TrendingUp, Shield, BarChart3, ChevronDown,
  Zap, PieChart, Activity,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { IntelligenceModeBadge } from '@/components/dashboard/IntelligenceModeBadge';
import { LongOnlyBadge } from '@/components/forex/LongOnlyBanner';
import { LazyTabContent } from '@/components/forex/LazyTabContent';

// Command Center components
import { ExecutionProofPanel } from '@/components/forex/ExecutionProofPanel';
import { LiveEdgeExecutionDashboard } from '@/components/forex/LiveEdgeExecutionDashboard';
import { LiveForexTradesPanel } from '@/components/forex/LiveForexTradesPanel';
import { LiveExecutionHero } from '@/components/forex/LiveExecutionHero';
import { GovernanceStateBanner } from '@/components/forex/GovernanceStateBanner';
import { SystemLearningPanel } from '@/components/forex/SystemLearningPanel';
import { CounterfactualPanel } from '@/components/forex/CounterfactualPanel';
import { TradeQualityWatchdog } from '@/components/forex/TradeQualityWatchdog';

// Performance components
import { EquityCurveChart } from '@/components/forex/EquityCurveChart';
import { AgentAccountabilityPanel } from '@/components/forex/AgentAccountabilityPanel';
import { SessionHeatmap } from '@/components/forex/SessionHeatmap';
import { PairPnLBreakdown } from '@/components/forex/PairPnLBreakdown';
import { RollingSharpeChart } from '@/components/forex/RollingSharpeChart';
import { ForexPerformanceOverview } from '@/components/forex/ForexPerformanceOverview';
import { ForexTradeHistoryTable } from '@/components/forex/ForexTradeHistoryTable';

// Governance components
import { AdaptiveGovernancePanel } from '@/components/forex/AdaptiveGovernancePanel';
import { GovernanceHealthDashboard } from '@/components/forex/GovernanceHealthDashboard';
import { LongOnlySettingsPanel } from '@/components/forex/LongOnlySettingsPanel';

// Archive (lazy-loaded legacy dashboards)
import { ForexArchiveDashboards } from '@/components/forex/ForexArchiveDashboards';

import {
  generateForexTrades,
  filterForexTrades,
  computeForexPerformance,
  fetchOandaLivePrices,
  hasLivePrices,
  getLastGovernanceStats,
  computeGovernanceDashboard,
} from '@/lib/forex';
import { ForexDashboardFilters } from '@/lib/forex/forexTypes';
import { createAgents } from '@/lib/agents/agentEngine';
import { useOandaExecution } from '@/hooks/useOandaExecution';
import { useOandaPerformance } from '@/hooks/useOandaPerformance';
import { useTradeAnalytics } from '@/hooks/useTradeAnalytics';
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders';
import { PanelCheatSheet, CheatSheetLine } from '@/components/forex/PanelCheatSheet';

const govStateDisplay = (s: string) => s === 'HALT' ? 'COOLDOWN' : s;

const ForexDashboard = () => {
  const [longOnlyFilter, setLongOnlyFilter] = useState(false);
  const [filters, setFilters] = useState<ForexDashboardFilters>({
    period: '30d',
    outcome: 'all',
    regime: 'all',
    pair: 'all',
    agent: 'all',
    era: 'post-direction',
    environment: 'all',
    directionEngine: 'all',
    direction: 'all',
  });

  const [livePricesReady, setLivePricesReady] = useState(hasLivePrices());

  const { connected, account, openTrades, fetchAccountSummary } = useOandaExecution();
  const { metrics: executionMetrics } = useOandaPerformance();
  const tradeAnalytics = useTradeAnalytics(executionMetrics);
  useRealtimeOrders({
    onOrderChange: () => fetchAccountSummary('live'),
    enableAlerts: true,
  });

  useEffect(() => {
    fetchOandaLivePrices().then(() => setLivePricesReady(true));
    fetchAccountSummary('live');
  }, [fetchAccountSummary]);

  const agents = useMemo(() => createAgents(), []);
  const allTrades = useMemo(() => generateForexTrades(agents), [agents, livePricesReady]);
  const filteredTrades = useMemo(() => filterForexTrades(allTrades, filters), [allTrades, filters]);
  const performance = useMemo(() => computeForexPerformance(filteredTrades), [filteredTrades]);
  const governanceStats = useMemo(() => getLastGovernanceStats(), [allTrades]);

  const governanceDashboard = useMemo(() => {
    // Prefer real OANDA orders for governance dashboard if available
    const realOrders = executionMetrics?.recentOrders ?? [];
    if (realOrders.length > 0) {
      const orderRecords = realOrders
        .filter(o => o.entry_price != null)
        .map(o => ({
          currency_pair: o.currency_pair,
          direction: o.direction,
          status: o.status === 'closed' || (o.exit_price != null) ? 'closed' : o.status,
          entry_price: o.entry_price,
          exit_price: o.exit_price ?? null,
          execution_quality_score: o.execution_quality_score ?? null,
          slippage_pips: o.slippage_pips ?? null,
          session_label: o.session_label ?? null,
        }));
      return computeGovernanceDashboard(orderRecords);
    }
    // Fallback to simulated trades
    const orderRecords = filteredTrades
      .filter(t => t.outcome !== 'avoided')
      .map(t => ({
        currency_pair: t.currencyPair.replace('/', '_'),
        direction: t.direction,
        status: t.outcome === 'win' || t.outcome === 'loss' ? 'closed' : 'filled',
        entry_price: t.entryPrice,
        exit_price: t.exitPrice ?? null,
        execution_quality_score: Math.round(t.captureRatio * 100),
        slippage_pips: t.frictionCost * 10000,
        session_label: null,
      }));
    return computeGovernanceDashboard(orderRecords);
  }, [filteredTrades, executionMetrics]);

  return (
    <LongOnlyFilterProvider value={{ longOnlyFilter }}>
      <DashboardLayout>
        <div className="space-y-6">
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <Globe className="w-7 h-7 text-primary" />
                  <h1 className="font-display text-2xl md:text-3xl font-bold text-gradient-neural">
                    Forex Command Center
                  </h1>
                  <IntelligenceModeBadge />
                  <LongOnlyBadge />
                </div>
                <p className="text-muted-foreground text-sm">
                  Live execution intelligence — indicator-confirmed, coalition-governed, safety-gated.
                </p>
              </div>
              <div className="hidden md:flex items-center gap-2 text-[10px] text-muted-foreground">
                <TrendingUp className="w-3.5 h-3.5 text-primary" />
                <span>{tradeAnalytics.totalClosedTrades} closed trades · {tradeAnalytics.totalPnlPips >= 0 ? '+' : ''}{tradeAnalytics.totalPnlPips}p net</span>
              </div>
            </div>
          </motion.div>

          {/* Governance State Banner — always visible */}
          <GovernanceStateBanner
            state={governanceDashboard.currentState}
            reasons={governanceDashboard.stateReasons}
            promotedPairs={governanceDashboard.promotedPairs}
            restrictedPairs={governanceDashboard.restrictedPairs}
            bannedPairs={governanceDashboard.bannedPairs}
            sessionBudgets={governanceDashboard.sessionBudgets}
          />

          {/* 4-Tab Layout */}
          <Tabs defaultValue="command-center" className="space-y-4">
            <TabsList className="bg-card/50 border border-border/30 h-auto gap-1 p-1">
              <TabsTrigger value="command-center" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Zap className="w-3.5 h-3.5" />Command Center
              </TabsTrigger>
              <TabsTrigger value="performance" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <BarChart3 className="w-3.5 h-3.5" />Performance
              </TabsTrigger>
              <TabsTrigger value="governance" className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Shield className="w-3.5 h-3.5" />Governance
              </TabsTrigger>
              <TabsTrigger value="archive" className="text-xs gap-1.5 text-muted-foreground">
                <ChevronDown className="w-3.5 h-3.5" />Archive
              </TabsTrigger>
            </TabsList>

            {/* ─── TAB 1: Command Center ─── */}
            <TabsContent value="command-center" className="space-y-4">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                {/* Live Execution Hero */}
                <PanelCheatSheet title="Account & Execution" lines={(() => {
                  const bal = account ? parseFloat(account.balance) : 0;
                  const upl = account ? parseFloat(account.unrealizedPL) : 0;
                  const rpl = account ? parseFloat(account.pl) : 0;
                  const nav = bal + upl;
                  const marginUsed = account ? parseFloat(account.marginUsed ?? '0') : 0;
                  const marginAvail = account ? parseFloat(account.marginAvailable ?? '0') : 0;
                  const marginPct = nav > 0 ? (marginUsed / nav) * 100 : 0;
                  const wr = executionMetrics?.winRate ?? 0;
                  const avgSlip = executionMetrics?.avgSlippage ?? 0;
                  return [
                    { label: 'NAV (Bal + UPL)', value: `$${nav.toFixed(2)}`, status: nav >= bal ? 'good' as const : 'warn' as const },
                    { label: 'Balance', value: `$${bal.toFixed(2)}`, status: 'neutral' as const },
                    { label: 'Unrealized P&L', value: `${upl >= 0 ? '+' : ''}$${upl.toFixed(2)}`, status: upl >= 0 ? 'good' as const : 'bad' as const },
                    { label: 'Realized P&L', value: `${rpl >= 0 ? '+' : ''}$${rpl.toFixed(2)}`, status: rpl >= 0 ? 'good' as const : 'bad' as const },
                    { label: 'Margin Used / Avail', value: `$${marginUsed.toFixed(0)} / $${marginAvail.toFixed(0)}`, status: marginPct > 50 ? 'bad' as const : marginPct > 25 ? 'warn' as const : 'good' as const },
                    { label: 'Margin Utilization', value: `${marginPct.toFixed(1)}%`, status: marginPct > 50 ? 'bad' as const : marginPct > 25 ? 'warn' as const : 'good' as const },
                    { label: 'Open Positions', value: `${openTrades.length}`, status: openTrades.length > 5 ? 'bad' as const : openTrades.length > 3 ? 'warn' as const : 'neutral' as const },
                    { label: 'Win Rate', value: `${(wr * 100).toFixed(1)}%`, status: wr >= 0.55 ? 'good' as const : wr >= 0.45 ? 'warn' as const : 'bad' as const },
                    { label: 'Avg Slippage', value: `${avgSlip.toFixed(2)}p`, status: avgSlip <= 0.3 ? 'good' as const : avgSlip <= 1 ? 'warn' as const : 'bad' as const },
                    { label: 'Broker Link', value: connected ? 'LIVE' : 'OFFLINE', status: connected ? 'good' as const : 'bad' as const },
                  ];
                })()}>
                  <LiveExecutionHero
                    account={account}
                    connected={connected}
                    openTradeCount={openTrades.length}
                    executionMetrics={executionMetrics}
                  />
                </PanelCheatSheet>

                {/* System Learning Status */}
                <PanelCheatSheet title="Adaptation & Learning" lines={(() => {
                  const total = executionMetrics ? (executionMetrics.winCount + executionMetrics.lossCount) : 0;
                  const wc = executionMetrics?.winCount ?? 0;
                  const lc = executionMetrics?.lossCount ?? 0;
                  const quality = executionMetrics?.avgExecutionQuality ?? 0;
                  const pnl = executionMetrics?.realizedPnl ?? 0;
                  const latency = executionMetrics?.avgFillLatency ?? 0;
                  const friction = executionMetrics?.avgFrictionScore ?? 0;
                  const pairCount = Object.keys(executionMetrics?.pairBreakdown ?? {}).length;
                  const maturity = total >= 500 ? 'Mature' : total >= 200 ? 'Converging' : total >= 75 ? 'Growing' : total >= 20 ? 'Early' : 'Bootstrap';
                  // Derive best/worst pair from pairBreakdown by win rate, with trade count tiebreaker
                  const pairEntries = Object.values(executionMetrics?.pairBreakdown ?? {}).filter(p => p.filled >= 5);
                  const pairWR = (p: typeof pairEntries[0]) => p.winCount / Math.max(p.filled, 1);
                  const bestPair = pairEntries.length > 0 ? pairEntries.reduce((a, b) => {
                    const diff = pairWR(b) - pairWR(a);
                    return diff !== 0 ? (diff < 0 ? a : b) : (a.filled > b.filled ? a : b);
                  }) : null;
                  const worstPair = pairEntries.length > 0 ? pairEntries.reduce((a, b) => {
                    const diff = pairWR(a) - pairWR(b);
                    return diff !== 0 ? (diff < 0 ? a : b) : (a.filled > b.filled ? a : b);
                  }) : null;
                  return [
                    { label: 'Learning Maturity', value: maturity, status: total >= 500 ? 'good' as const : total >= 75 ? 'warn' as const : 'neutral' as const },
                    { label: 'Sample Size', value: `${total} trades`, status: total > 30 ? 'good' as const : total > 10 ? 'warn' as const : 'bad' as const },
                    { label: 'Record', value: `${wc}W / ${lc}L`, status: wc > lc ? 'good' as const : wc === lc ? 'warn' as const : 'bad' as const },
                    { label: 'Realized P&L', value: `${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}p`, status: pnl >= 0 ? 'good' as const : 'bad' as const },
                    { label: 'Avg Execution Quality', value: `${quality.toFixed(0)}%`, status: quality >= 75 ? 'good' as const : quality >= 50 ? 'warn' as const : 'bad' as const },
                    { label: 'Avg Fill Latency', value: `${latency.toFixed(0)}ms`, status: latency < 200 ? 'good' as const : latency < 500 ? 'warn' as const : 'bad' as const },
                    { label: 'Avg Friction Score', value: friction > 1 ? `${friction.toFixed(1)}` : `${(friction * 100).toFixed(0)}%`, status: (friction > 1 ? friction < 30 : friction < 0.3) ? 'good' as const : (friction > 1 ? friction < 60 : friction < 0.6) ? 'warn' as const : 'bad' as const },
                    { label: 'Pairs Traded', value: `${pairCount}`, status: pairCount >= 3 ? 'good' as const : 'neutral' as const },
                    { label: 'Best Pair (WR)', value: bestPair ? bestPair.pair : '—', status: 'good' as const },
                    { label: 'Worst Pair (WR)', value: worstPair ? worstPair.pair : '—', status: 'bad' as const },
                    { label: 'Data Pipeline', value: executionMetrics?.hasData ? 'ACTIVE' : 'WAITING', status: executionMetrics?.hasData ? 'good' as const : 'warn' as const },
                  ];
                })()}>
                  <SystemLearningPanel executionMetrics={executionMetrics} />
                </PanelCheatSheet>

                {/* Trade Quality Watchdog */}
                <PanelCheatSheet title="Quality & Risk Metrics" lines={(() => {
                  const pnl = tradeAnalytics.totalPnlPips;
                  const sharpe = tradeAnalytics.overallSharpe;
                  const closed = tradeAnalytics.totalClosedTrades;
                  const sessions = tradeAnalytics.sessionAnalytics ?? [];
                  const bestSession = sessions.length > 0 ? sessions.reduce((a, b) => a.netPnlPips > b.netPnlPips ? a : b) : null;
                  const worstSession = sessions.length > 0 ? sessions.reduce((a, b) => a.netPnlPips < b.netPnlPips ? a : b) : null;
                  const pairs = tradeAnalytics.pairAnalytics ?? [];
                  const activePairs = pairs.filter(p => p.tradeCount > 0).length;
                  const avgPipsPerTrade = closed > 0 ? pnl / closed : 0;
                  const bestPair = pairs.length > 0 ? pairs.reduce((a, b) => a.netPnlPips > b.netPnlPips ? a : b) : null;
                  const worstPair = pairs.length > 0 ? pairs.reduce((a, b) => a.netPnlPips < b.netPnlPips ? a : b) : null;
                  const avgWinRate = pairs.length > 0 ? pairs.reduce((s, p) => s + p.winRate, 0) / pairs.length : 0;
                  return [
                    { label: 'Net P&L', value: `${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}p`, status: pnl >= 0 ? 'good' as const : 'bad' as const },
                    { label: 'Pips / Trade', value: `${avgPipsPerTrade >= 0 ? '+' : ''}${avgPipsPerTrade.toFixed(2)}p`, status: avgPipsPerTrade > 0 ? 'good' as const : 'bad' as const },
                    { label: 'Sharpe Ratio', value: sharpe.toFixed(2), status: sharpe > 1.5 ? 'good' as const : sharpe > 0.5 ? 'warn' as const : 'bad' as const },
                    { label: 'Closed Trades', value: `${closed}`, status: closed > 20 ? 'good' as const : 'neutral' as const },
                    { label: 'Active Pairs', value: `${activePairs}`, status: activePairs >= 3 ? 'good' as const : 'neutral' as const },
                    { label: 'Avg Win Rate', value: `${(avgWinRate * 100).toFixed(1)}%`, status: avgWinRate >= 0.55 ? 'good' as const : avgWinRate >= 0.45 ? 'warn' as const : 'bad' as const },
                    { label: 'Best Pair', value: bestPair ? `${bestPair.pair} (${bestPair.netPnlPips >= 0 ? '+' : ''}${bestPair.netPnlPips.toFixed(1)}p)` : '—', status: 'good' as const },
                    { label: 'Worst Pair', value: worstPair ? `${worstPair.pair} (${worstPair.netPnlPips >= 0 ? '+' : ''}${worstPair.netPnlPips.toFixed(1)}p)` : '—', status: 'bad' as const },
                    { label: 'Best Session', value: bestSession ? `${bestSession.session} (${bestSession.netPnlPips >= 0 ? '+' : ''}${bestSession.netPnlPips.toFixed(1)}p)` : '—', status: 'good' as const },
                    { label: 'Worst Session', value: worstSession ? `${worstSession.session} (${worstSession.netPnlPips >= 0 ? '+' : ''}${worstSession.netPnlPips.toFixed(1)}p)` : '—', status: 'bad' as const },
                  ];
                })()}>
                  <TradeQualityWatchdog realMetrics={executionMetrics} />
                </PanelCheatSheet>

                {/* Execution Proof — Integrity verification */}
                <PanelCheatSheet title="Integrity Gate Stack" lines={(() => {
                  const state = governanceDashboard.currentState;
                  const promoted = governanceDashboard.promotedPairs.length;
                  const restricted = governanceDashboard.restrictedPairs.length;
                  const banned = governanceDashboard.bannedPairs.length;
                  const budgets = governanceDashboard.sessionBudgets ?? {};
                  const activeBudgets = Object.entries(budgets).filter(([, v]) => (v as any)?.remaining > 0).length;
                  return [
                    { label: 'Governance State', value: govStateDisplay(state), status: state === 'NORMAL' ? 'good' as const : state === 'DEFENSIVE' ? 'warn' as const : 'bad' as const },
                    { label: 'Gate Layers', value: 'MTF → Regime → Safety → Coalition → Gov', status: 'neutral' as const },
                    { label: 'Promoted Pairs', value: `${promoted}`, status: promoted > 0 ? 'good' as const : 'neutral' as const },
                    { label: 'Restricted Pairs', value: `${restricted}`, status: restricted > 0 ? 'warn' as const : 'good' as const },
                    { label: 'Banned Pairs', value: `${banned}`, status: banned > 0 ? 'bad' as const : 'good' as const },
                    { label: 'Session Budgets Active', value: `${activeBudgets}`, status: activeBudgets > 0 ? 'good' as const : 'warn' as const },
                    { label: 'All Layers Must Pass', value: 'YES — any fail = trade blocked', status: 'neutral' as const },
                  ];
                })()}>
                  <ExecutionProofPanel />
                </PanelCheatSheet>

                {/* Counterfactual */}
                <PanelCheatSheet title="Counterfactual Tracker" lines={(() => {
                  const avoided = allTrades.filter(t => t.outcome === 'avoided');
                  const totalBlocked = avoided.length;
                  const wouldHaveWon = avoided.filter(t => (t as any).counterfactualResult === 'would_have_won').length;
                  const wouldHaveLost = avoided.filter(t => (t as any).counterfactualResult === 'would_have_lost').length;
                  const pending = totalBlocked - wouldHaveWon - wouldHaveLost;
                  const overFilterRate = totalBlocked > 0 ? ((wouldHaveWon / totalBlocked) * 100) : 0;
                  return [
                    { label: 'Total Blocked Trades', value: `${totalBlocked}`, status: totalBlocked > 10 ? 'warn' as const : 'neutral' as const },
                    { label: 'Would Have Won', value: `${wouldHaveWon}`, status: wouldHaveWon > 0 ? 'warn' as const : 'good' as const },
                    { label: 'Would Have Lost', value: `${wouldHaveLost}`, status: wouldHaveLost > 0 ? 'good' as const : 'neutral' as const },
                    { label: 'Pending Resolution', value: `${pending}`, status: pending > 5 ? 'warn' as const : 'neutral' as const },
                    { label: 'Over-Filter Rate', value: `${overFilterRate.toFixed(1)}%`, status: overFilterRate > 30 ? 'bad' as const : overFilterRate > 15 ? 'warn' as const : 'good' as const },
                    { label: 'Resolution Window', value: '15min after rejection', status: 'neutral' as const },
                    { label: 'Cron Schedule', value: 'Every 5 minutes', status: 'good' as const },
                  ];
                })()}>
                  <CounterfactualPanel />
                </PanelCheatSheet>

                {/* Live Trades */}
                <PanelCheatSheet title="Open Positions" lines={(() => {
                  const totalUPL = openTrades.reduce((sum, t) => sum + (parseFloat(t.unrealizedPL ?? '0')), 0);
                  const longCount = openTrades.filter(t => parseInt(t.currentUnits ?? '0') > 0).length;
                  const shortCount = openTrades.filter(t => parseInt(t.currentUnits ?? '0') < 0).length;
                  const pairs = [...new Set(openTrades.map(t => t.instrument))];
                  return [
                    { label: 'Open Positions', value: `${openTrades.length}`, status: openTrades.length > 5 ? 'bad' as const : openTrades.length > 3 ? 'warn' as const : 'good' as const },
                    { label: 'Long / Short', value: `${longCount}L / ${shortCount}S`, status: 'neutral' as const },
                    { label: 'Combined UPL', value: `${totalUPL >= 0 ? '+' : ''}$${totalUPL.toFixed(2)}`, status: totalUPL >= 0 ? 'good' as const : 'bad' as const },
                    { label: 'Pairs Exposed', value: pairs.length > 0 ? pairs.join(', ') : 'None', status: pairs.length > 4 ? 'warn' as const : 'neutral' as const },
                    { label: 'Broker Connection', value: connected ? 'LIVE' : 'OFFLINE', status: connected ? 'good' as const : 'bad' as const },
                    { label: 'Max Concurrent Limit', value: '6 positions', status: openTrades.length >= 6 ? 'bad' as const : 'neutral' as const },
                  ];
                })()}>
                  <LiveForexTradesPanel />
                </PanelCheatSheet>

                {/* Live Edge Execution */}
                <PanelCheatSheet title="Edge Decision Engine" lines={(() => {
                  const state = governanceDashboard.currentState;
                  const promoted = governanceDashboard.promotedPairs;
                  const restricted = governanceDashboard.restrictedPairs;
                  const banned = governanceDashboard.bannedPairs;
                  const reasons = governanceDashboard.stateReasons ?? [];
                  return [
                    { label: 'Engine Mode', value: 'Dual-Edge (Long + Short)', status: 'neutral' as const },
                    { label: 'Governance State', value: govStateDisplay(state), status: state === 'NORMAL' ? 'good' as const : state === 'DEFENSIVE' ? 'warn' as const : 'bad' as const },
                    { label: 'Promoted Pairs', value: promoted.length > 0 ? promoted.join(', ') : 'None', status: promoted.length > 0 ? 'good' as const : 'neutral' as const },
                    { label: 'Restricted Pairs', value: restricted.length > 0 ? restricted.join(', ') : 'None', status: restricted.length > 0 ? 'warn' as const : 'good' as const },
                    { label: 'Banned Pairs', value: banned.length > 0 ? banned.join(', ') : 'None', status: banned.length > 0 ? 'bad' as const : 'good' as const },
                    { label: 'State Reasons', value: reasons.length > 0 ? reasons[0] : 'Normal operations', status: reasons.length > 0 ? 'warn' as const : 'good' as const },
                    { label: 'Indicator Confirmation', value: 'Required before entry', status: 'neutral' as const },
                    { label: 'Coalition Quorum', value: 'Required for execution', status: 'neutral' as const },
                  ];
                })()}>
                  <LiveEdgeExecutionDashboard />
                </PanelCheatSheet>
              </motion.div>
            </TabsContent>

            {/* ─── TAB 2: Performance ─── */}
            <TabsContent value="performance" className="space-y-4">
              <LazyTabContent label="Performance">
                <div className="space-y-4">
                  {/* Equity Curve */}
                  <PanelCheatSheet title="Equity Curve" lines={(() => {
                    const pnl = tradeAnalytics.totalPnlPips;
                    const trades = tradeAnalytics.totalClosedTrades;
                    const sharpeData = tradeAnalytics.rollingSharpe ?? [];
                    const latestSharpe = sharpeData.length > 0 ? sharpeData[sharpeData.length - 1]?.sharpe ?? 0 : 0;
                    const peakPnl = sharpeData.reduce((max, d) => Math.max(max, d.cumPnlPips ?? 0), 0);
                    const drawdown = peakPnl > 0 ? ((peakPnl - pnl) / peakPnl * 100) : 0;
                    return [
                      { label: 'Net P&L (Pips)', value: `${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}p`, status: pnl >= 0 ? 'good' as const : 'bad' as const },
                      { label: 'Total Closed Trades', value: `${trades}`, status: trades > 20 ? 'good' as const : 'neutral' as const },
                      { label: 'Peak P&L', value: `${peakPnl.toFixed(1)}p`, status: 'neutral' as const },
                      { label: 'Drawdown from Peak', value: `${drawdown.toFixed(1)}%`, status: drawdown > 10 ? 'bad' as const : drawdown > 5 ? 'warn' as const : 'good' as const },
                      { label: 'Rolling Sharpe (Latest)', value: latestSharpe.toFixed(2), status: latestSharpe > 1.5 ? 'good' as const : latestSharpe > 0.5 ? 'warn' as const : 'bad' as const },
                      { label: 'Curve Trend', value: pnl > 0 ? 'POSITIVE' : 'NEGATIVE', status: pnl > 0 ? 'good' as const : 'bad' as const },
                    ];
                  })()}>
                    <EquityCurveChart
                      data={tradeAnalytics.rollingSharpe}
                      totalPnlPips={tradeAnalytics.totalPnlPips}
                      totalTrades={tradeAnalytics.totalClosedTrades}
                    />
                  </PanelCheatSheet>

                  {/* Performance Overview */}
                  <PanelCheatSheet title="Performance Overview" lines={(() => {
                    const wr = executionMetrics?.winRate ?? 0;
                    const wc = executionMetrics?.winCount ?? 0;
                    const lc = executionMetrics?.lossCount ?? 0;
                    const pf = wc > 0 && lc > 0 ? (wc / lc) : 0;
                    const pnl = executionMetrics?.realizedPnl ?? 0;
                    const govState = governanceDashboard.currentState;
                    return [
                      { label: 'Win Rate', value: `${(wr * 100).toFixed(1)}%`, status: wr >= 0.55 ? 'good' as const : wr >= 0.45 ? 'warn' as const : 'bad' as const },
                      { label: 'Record', value: `${wc}W / ${lc}L`, status: wc > lc ? 'good' as const : 'bad' as const },
                      { label: 'Win/Loss Ratio', value: pf > 0 ? pf.toFixed(2) : '—', status: pf > 1.5 ? 'good' as const : pf > 1 ? 'warn' as const : 'bad' as const },
                      { label: 'Realized P&L', value: `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`, status: pnl >= 0 ? 'good' as const : 'bad' as const },
                      { label: 'Governance State', value: govStateDisplay(govState), status: govState === 'NORMAL' ? 'good' as const : 'warn' as const },
                      { label: 'Execution Quality', value: `${(executionMetrics?.avgExecutionQuality ?? 0).toFixed(0)}%`, status: (executionMetrics?.avgExecutionQuality ?? 0) >= 75 ? 'good' as const : 'warn' as const },
                    ];
                  })()}>
                    <ForexPerformanceOverview
                      metrics={performance}
                      governanceStats={governanceStats}
                      trades={filteredTrades}
                      realMetrics={executionMetrics}
                      tradeAnalytics={tradeAnalytics}
                    />
                  </PanelCheatSheet>

                  {/* Agent Accountability */}
                  <PanelCheatSheet title="Agent Accountability" lines={(() => {
                    const agents = Object.values(executionMetrics?.agentBreakdown ?? {});
                    const totalFilled = agents.reduce((s, a) => s + a.filled, 0);
                    const topAgent = agents.length > 0 ? agents.reduce((a, b) => a.filled > b.filled ? a : b) : null;
                    const avgQuality = agents.length > 0 ? agents.reduce((s, a) => s + a.avgQuality, 0) / agents.length : 0;
                    return [
                      { label: 'Active Agents', value: `${agents.length}`, status: agents.length >= 3 ? 'good' as const : 'neutral' as const },
                      { label: 'Total Agent Fills', value: `${totalFilled}`, status: totalFilled > 20 ? 'good' as const : 'neutral' as const },
                      { label: 'Top Agent', value: topAgent ? `${topAgent.agentId} (${topAgent.filled})` : '—', status: 'neutral' as const },
                      { label: 'Avg Agent Quality', value: `${avgQuality.toFixed(0)}%`, status: avgQuality >= 75 ? 'good' as const : avgQuality >= 50 ? 'warn' as const : 'bad' as const },
                    ];
                  })()}>
                    <AgentAccountabilityPanel metrics={executionMetrics} />
                  </PanelCheatSheet>

                  {/* Rolling Sharpe */}
                  <PanelCheatSheet title="Rolling Sharpe" lines={(() => {
                    const sharpe = tradeAnalytics.overallSharpe;
                    const data = tradeAnalytics.rollingSharpe ?? [];
                    const latest = data.length > 0 ? data[data.length - 1]?.sharpe ?? 0 : 0;
                    const peak = data.reduce((max, d) => Math.max(max, d.sharpe ?? 0), 0);
                    const trough = data.reduce((min, d) => Math.min(min, d.sharpe ?? 99), 99);
                    return [
                      { label: 'Overall Sharpe', value: sharpe.toFixed(2), status: sharpe > 1.5 ? 'good' as const : sharpe > 0.5 ? 'warn' as const : 'bad' as const },
                      { label: 'Latest Rolling', value: latest.toFixed(2), status: latest > 1.0 ? 'good' as const : latest > 0 ? 'warn' as const : 'bad' as const },
                      { label: 'Peak Sharpe', value: peak < 99 ? peak.toFixed(2) : '—', status: 'good' as const },
                      { label: 'Trough Sharpe', value: trough < 99 ? trough.toFixed(2) : '—', status: trough < 0 ? 'bad' as const : 'warn' as const },
                      { label: 'Data Points', value: `${data.length}`, status: data.length > 10 ? 'good' as const : 'neutral' as const },
                    ];
                  })()}>
                    <RollingSharpeChart
                      data={tradeAnalytics.rollingSharpe}
                      overallSharpe={tradeAnalytics.overallSharpe}
                    />
                  </PanelCheatSheet>

                  {/* Session Heatmap & Pair P&L */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <PanelCheatSheet title="Session Performance" lines={(() => {
                      const sessions = tradeAnalytics.sessionAnalytics ?? [];
                      const best = sessions.length > 0 ? sessions.reduce((a, b) => a.netPnlPips > b.netPnlPips ? a : b) : null;
                      const worst = sessions.length > 0 ? sessions.reduce((a, b) => a.netPnlPips < b.netPnlPips ? a : b) : null;
                      const totalTrades = sessions.reduce((s, se) => s + se.tradeCount, 0);
                      return [
                        { label: 'Sessions Tracked', value: `${sessions.length}`, status: sessions.length > 0 ? 'good' as const : 'neutral' as const },
                        { label: 'Total Session Trades', value: `${totalTrades}`, status: totalTrades > 20 ? 'good' as const : 'neutral' as const },
                        { label: 'Best Session', value: best ? `${best.session} (+${best.netPnlPips.toFixed(1)}p)` : '—', status: 'good' as const },
                        { label: 'Worst Session', value: worst ? `${worst.session} (${worst.netPnlPips.toFixed(1)}p)` : '—', status: 'bad' as const },
                      ];
                    })()}>
                      <SessionHeatmap sessions={tradeAnalytics.sessionAnalytics} />
                    </PanelCheatSheet>
                    <PanelCheatSheet title="Pair P&L Breakdown" lines={(() => {
                      const pairs = tradeAnalytics.pairAnalytics ?? [];
                      const profitable = pairs.filter(p => p.netPnlPips > 0).length;
                      const losing = pairs.filter(p => p.netPnlPips < 0).length;
                      const best = pairs.length > 0 ? pairs.reduce((a, b) => a.netPnlPips > b.netPnlPips ? a : b) : null;
                      const worst = pairs.length > 0 ? pairs.reduce((a, b) => a.netPnlPips < b.netPnlPips ? a : b) : null;
                      const totalNet = pairs.reduce((s, p) => s + p.netPnlPips, 0);
                      return [
                        { label: 'Active Pairs', value: `${pairs.length}`, status: pairs.length >= 3 ? 'good' as const : 'neutral' as const },
                        { label: 'Profitable / Losing', value: `${profitable} / ${losing}`, status: profitable > losing ? 'good' as const : 'bad' as const },
                        { label: 'Total Net P&L', value: `${totalNet >= 0 ? '+' : ''}${totalNet.toFixed(1)}p`, status: totalNet >= 0 ? 'good' as const : 'bad' as const },
                        { label: 'Best Pair', value: best ? `${best.pair} (+${best.netPnlPips.toFixed(1)}p)` : '—', status: 'good' as const },
                        { label: 'Worst Pair', value: worst ? `${worst.pair} (${worst.netPnlPips.toFixed(1)}p)` : '—', status: 'bad' as const },
                      ];
                    })()}>
                      <PairPnLBreakdown pairs={tradeAnalytics.pairAnalytics} />
                    </PanelCheatSheet>
                  </div>

                  {/* Trade History Table */}
                  <PanelCheatSheet title="Trade History" lines={(() => {
                    const total = filteredTrades.length;
                    const executed = filteredTrades.filter(t => t.outcome !== 'avoided').length;
                    const blocked = filteredTrades.filter(t => t.outcome === 'avoided').length;
                    const wins = filteredTrades.filter(t => t.outcome === 'win').length;
                    const losses = filteredTrades.filter(t => t.outcome === 'loss').length;
                    return [
                      { label: 'Total Records', value: `${total}`, status: 'neutral' as const },
                      { label: 'Executed', value: `${executed}`, status: executed > 0 ? 'good' as const : 'neutral' as const },
                      { label: 'Blocked by Governance', value: `${blocked}`, status: blocked > executed ? 'warn' as const : 'neutral' as const },
                      { label: 'Record', value: `${wins}W / ${losses}L`, status: wins > losses ? 'good' as const : 'bad' as const },
                      { label: 'Active Filters', value: filters.period, status: 'neutral' as const },
                    ];
                  })()}>
                    <ForexTradeHistoryTable trades={filteredTrades} />
                  </PanelCheatSheet>
                </div>
              </LazyTabContent>
            </TabsContent>

            {/* ─── TAB 3: Governance ─── */}
            <TabsContent value="governance" className="space-y-4">
              <LazyTabContent label="Governance">
                <div className="space-y-4">
                  <PanelCheatSheet title="Long-Only Settings" lines={[
                    { label: 'Mode', value: longOnlyFilter ? 'LONG ONLY' : 'DUAL (Long + Short)', status: longOnlyFilter ? 'warn' as const : 'good' as const },
                    { label: 'Short Eligible Pairs', value: 'EUR/GBP, USD/CAD, AUD/USD', status: 'neutral' as const },
                    { label: 'Configuration', value: 'User-controlled override', status: 'neutral' as const },
                  ]}>
                    <LongOnlySettingsPanel />
                  </PanelCheatSheet>
                  <PanelCheatSheet title="Adaptive Governance" lines={(() => {
                    const state = governanceDashboard.currentState;
                    const w20 = governanceDashboard.windows.w20;
                    const w50 = governanceDashboard.windows.w50;
                    const pairCount = governanceDashboard.pairAllocations.length;
                    const promoted = governanceDashboard.promotedPairs.length;
                    const restricted = governanceDashboard.restrictedPairs.length;
                    const banned = governanceDashboard.bannedPairs.length;
                    const shadows = governanceDashboard.shadowCandidates.length;
                    const eligible = governanceDashboard.shadowCandidates.filter(c => c.eligible).length;
                    return [
                      { label: 'Governance State', value: govStateDisplay(state), status: state === 'NORMAL' ? 'good' as const : state === 'DEFENSIVE' ? 'warn' as const : 'bad' as const },
                      { label: '20-Trade Win Rate', value: `${(w20.winRate * 100).toFixed(1)}%`, status: w20.winRate >= 0.55 ? 'good' as const : w20.winRate >= 0.45 ? 'warn' as const : 'bad' as const },
                      { label: '20-Trade Expectancy', value: `${w20.expectancy >= 0 ? '+' : ''}${w20.expectancy.toFixed(2)}p`, status: w20.expectancy > 0.5 ? 'good' as const : w20.expectancy >= 0 ? 'warn' as const : 'bad' as const },
                      { label: '50-Trade Expectancy', value: `${w50.expectancy >= 0 ? '+' : ''}${w50.expectancy.toFixed(2)}p`, status: w50.expectancy > 0.5 ? 'good' as const : w50.expectancy >= 0 ? 'warn' as const : 'bad' as const },
                      { label: 'Slippage Drift', value: w20.slippageDrift ? 'DETECTED' : 'None', status: w20.slippageDrift ? 'bad' as const : 'good' as const },
                      { label: 'Active Pairs', value: `${pairCount}`, status: pairCount > 0 ? 'good' as const : 'warn' as const },
                      { label: 'Promoted / Restricted / Banned', value: `${promoted} / ${restricted} / ${banned}`, status: banned > 0 ? 'bad' as const : restricted > 0 ? 'warn' as const : 'good' as const },
                      { label: 'Shadow Candidates', value: `${shadows} (${eligible} eligible)`, status: eligible > 0 ? 'good' as const : 'neutral' as const },
                    ];
                  })()}>
                    <AdaptiveGovernancePanel data={governanceDashboard} />
                  </PanelCheatSheet>
                  <PanelCheatSheet title="Governance Health" lines={(() => {
                    const executed = filteredTrades.filter(t => t.outcome !== 'avoided').length;
                    const total = filteredTrades.length;
                    const blocked = total - executed;
                    const blockRate = total > 0 ? (blocked / total * 100) : 0;
                    return [
                      { label: 'Total Evaluations', value: `${total}`, status: total > 50 ? 'good' as const : 'neutral' as const },
                      { label: 'Executed', value: `${executed}`, status: executed > 0 ? 'good' as const : 'warn' as const },
                      { label: 'Blocked', value: `${blocked}`, status: blocked > executed ? 'warn' as const : 'good' as const },
                      { label: 'Block Rate', value: `${blockRate.toFixed(1)}%`, status: blockRate > 60 ? 'bad' as const : blockRate > 40 ? 'warn' as const : 'good' as const },
                      { label: 'Health Monitor', value: 'ACTIVE', status: 'good' as const },
                    ];
                  })()}>
                    <GovernanceHealthDashboard trades={filteredTrades} />
                  </PanelCheatSheet>
                </div>
              </LazyTabContent>
            </TabsContent>

            {/* ─── TAB 4: Archive ─── */}
            <TabsContent value="archive" className="space-y-4">
              <LazyTabContent label="Archive">
                <ForexArchiveDashboards
                  allTrades={allTrades}
                  filteredTrades={filteredTrades}
                  filters={filters}
                  setFilters={setFilters}
                  performance={performance}
                  governanceStats={governanceStats}
                  executionMetrics={executionMetrics}
                  tradeAnalytics={tradeAnalytics}
                  longOnlyFilter={longOnlyFilter}
                  onLongOnlyToggle={(enabled: boolean) => {
                    setLongOnlyFilter(enabled);
                    setFilters(prev => ({ ...prev, direction: enabled ? 'long' : 'all' }));
                  }}
                />
              </LazyTabContent>
            </TabsContent>
          </Tabs>
        </div>
      </DashboardLayout>
    </LongOnlyFilterProvider>
  );
};

export default ForexDashboard;
