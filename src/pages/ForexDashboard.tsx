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
  }, [filteredTrades]);

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
                  const maturity = total >= 50 ? 'Mature' : total >= 20 ? 'Growing' : total >= 5 ? 'Early' : 'Bootstrap';
                  // Derive best/worst pair from pairBreakdown
                  const pairEntries = Object.values(executionMetrics?.pairBreakdown ?? {});
                  const bestPair = pairEntries.length > 0 ? pairEntries.reduce((a, b) => (a.winCount / Math.max(a.filled, 1)) > (b.winCount / Math.max(b.filled, 1)) ? a : b) : null;
                  const worstPair = pairEntries.length > 0 ? pairEntries.reduce((a, b) => (a.winCount / Math.max(a.filled, 1)) < (b.winCount / Math.max(b.filled, 1)) ? a : b) : null;
                  return [
                    { label: 'Learning Maturity', value: maturity, status: total >= 50 ? 'good' as const : total >= 20 ? 'warn' as const : 'neutral' as const },
                    { label: 'Sample Size', value: `${total} trades`, status: total > 30 ? 'good' as const : total > 10 ? 'warn' as const : 'bad' as const },
                    { label: 'Record', value: `${wc}W / ${lc}L`, status: wc > lc ? 'good' as const : wc === lc ? 'warn' as const : 'bad' as const },
                    { label: 'Realized P&L', value: `${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}p`, status: pnl >= 0 ? 'good' as const : 'bad' as const },
                    { label: 'Avg Execution Quality', value: `${quality.toFixed(0)}%`, status: quality >= 75 ? 'good' as const : quality >= 50 ? 'warn' as const : 'bad' as const },
                    { label: 'Avg Fill Latency', value: `${latency.toFixed(0)}ms`, status: latency < 200 ? 'good' as const : latency < 500 ? 'warn' as const : 'bad' as const },
                    { label: 'Avg Friction Score', value: `${(friction * 100).toFixed(0)}%`, status: friction < 0.3 ? 'good' as const : friction < 0.6 ? 'warn' as const : 'bad' as const },
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
                    { label: 'Governance State', value: state, status: state === 'NORMAL' ? 'good' as const : state === 'DEFENSIVE' ? 'warn' as const : 'bad' as const },
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
                    { label: 'Governance State', value: state, status: state === 'NORMAL' ? 'good' as const : state === 'DEFENSIVE' ? 'warn' as const : 'bad' as const },
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
                  <EquityCurveChart
                    data={tradeAnalytics.rollingSharpe}
                    totalPnlPips={tradeAnalytics.totalPnlPips}
                    totalTrades={tradeAnalytics.totalClosedTrades}
                  />

                  {/* Performance Overview */}
                  <ForexPerformanceOverview
                    metrics={performance}
                    governanceStats={governanceStats}
                    trades={filteredTrades}
                    realMetrics={executionMetrics}
                    tradeAnalytics={tradeAnalytics}
                  />

                  {/* Agent Accountability */}
                  <AgentAccountabilityPanel metrics={executionMetrics} />

                  {/* Rolling Sharpe */}
                  <RollingSharpeChart
                    data={tradeAnalytics.rollingSharpe}
                    overallSharpe={tradeAnalytics.overallSharpe}
                  />

                  {/* Session Heatmap & Pair P&L */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <SessionHeatmap sessions={tradeAnalytics.sessionAnalytics} />
                    <PairPnLBreakdown pairs={tradeAnalytics.pairAnalytics} />
                  </div>

                  {/* Trade History Table */}
                  <ForexTradeHistoryTable trades={filteredTrades} />
                </div>
              </LazyTabContent>
            </TabsContent>

            {/* ─── TAB 3: Governance ─── */}
            <TabsContent value="governance" className="space-y-4">
              <LazyTabContent label="Governance">
                <div className="space-y-4">
                  <LongOnlySettingsPanel />
                  <AdaptiveGovernancePanel data={governanceDashboard} />
                  <GovernanceHealthDashboard trades={filteredTrades} />
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
