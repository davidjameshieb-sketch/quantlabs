// Multi-Agent Trade Intelligence Ledger
// Redesigned Live Trade Book with collaborative AI event display and drill-down hierarchy

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Clock, Lock, Zap, Activity,
  Ban, Eye, ChevronDown, ChevronRight, Users, Cpu, Shield,
  Award, BookOpen, ArrowUpDown, AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { UpgradeModal } from '@/components/dashboard/UpgradeModal';
import { LedgerFilterBar } from './LedgerFilterBar';
import { AgentContributionPanel } from './AgentContributionPanel';
import { MetaControllerTradePanel } from './MetaControllerTradePanel';
import { TradeLifecycleTimeline } from './TradeLifecycleTimeline';
import { TradeQualityAnalytics } from './TradeQualityAnalytics';
import { GovernanceAlertsPanel } from './GovernanceAlertsPanel';
import { AgentLedgerView } from './AgentLedgerView';
import { useAuth } from '@/contexts/AuthContext';
import { AgentId, AIAgent } from '@/lib/agents/types';
import { AGENT_DEFINITIONS } from '@/lib/agents/agentConfig';
import {
  LedgerTradeEntry, LedgerFilters,
  LEDGER_STATUS_LABELS, LEDGER_STATUS_COLORS,
  CLASSIFICATION_LABELS, CLASSIFICATION_COLORS,
} from '@/lib/agents/ledgerTypes';
import { generateLedgerEntries, filterLedgerEntries, generateAgentLedgerSummary } from '@/lib/agents/ledgerEngine';
import { ALL_AGENT_IDS } from '@/lib/agents/agentConfig';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface LiveTradeBookProps {
  agents: Record<AgentId, AIAgent>;
}

const LIVE_COUNT = 5;

const useAutoRefreshLabel = () => {
  const [secondsAgo, setSecondsAgo] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSecondsAgo(s => (s >= 900 ? 0 : s + 1)), 1000);
    return () => clearInterval(id);
  }, []);
  if (secondsAgo < 60) return `${secondsAgo}s ago`;
  return `${Math.floor(secondsAgo / 60)}m ago`;
};

const formatDuration = (mins: number) => {
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${(mins / 60).toFixed(1)}h`;
  return `${(mins / 1440).toFixed(1)}d`;
};

export const LiveTradeBook = ({ agents }: LiveTradeBookProps) => {
  const { subscribed } = useAuth();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<'agents' | 'governance' | 'lifecycle' | 'quality'>('agents');
  const [selectedLedgerAgent, setSelectedLedgerAgent] = useState<string | null>(null);
  const [filters, setFilters] = useState<LedgerFilters>({
    agent: 'all',
    tradeStatus: 'all',
    direction: 'all',
    regime: 'all',
    approvalLevel: 'all',
    consensusStrength: 'all',
    classification: 'all',
    outcome: 'all',
  });
  const refreshLabel = useAutoRefreshLabel();

  const allEntries = useMemo(() => generateLedgerEntries(agents), [agents]);
  const filteredEntries = useMemo(() => filterLedgerEntries(allEntries, filters), [allEntries, filters]);

  const liveEntries = filteredEntries.slice(0, LIVE_COUNT);
  const historyEntries = filteredEntries.slice(LIVE_COUNT);

  const agentSummaries = useMemo(
    () => ALL_AGENT_IDS.map(id => generateAgentLedgerSummary(id, allEntries)),
    [allEntries]
  );

  // All governance alerts across trades
  const allAlerts = useMemo(
    () => allEntries.flatMap(e => e.alerts).filter(a => !a.resolved).sort((a, b) => b.timestamp - a.timestamp).slice(0, 8),
    [allEntries]
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedTradeId(prev => prev === id ? null : id);
    setExpandedSection('agents');
  }, []);

  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setPulse(p => !p), 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            <h2 className="font-display text-lg font-bold">Multi-Agent Trade Intelligence Ledger</h2>
            <Badge variant="outline" className="text-[10px] border-primary/30 bg-primary/10 text-primary gap-1">
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
            <Badge variant="secondary" className="text-[10px]">{allEntries.length} signals</Badge>
          </div>
        </div>

        {/* Governance Alerts */}
        {allAlerts.length > 0 && <GovernanceAlertsPanel alerts={allAlerts} />}

        {/* Tabs: Intelligence Ledger / Agent Ledger */}
        <Tabs defaultValue="ledger" className="w-full">
          <TabsList className="w-full justify-start bg-card/50 border border-border/50 p-1 h-auto gap-1">
            <TabsTrigger value="ledger" className="gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border-primary/30 data-[state=active]:shadow-none border border-transparent px-4 py-2">
              <BookOpen className="w-4 h-4" />
              <span className="font-medium text-xs">Trade Intelligence Ledger</span>
            </TabsTrigger>
            <TabsTrigger value="agent-ledger" className="gap-2 data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:border-primary/30 data-[state=active]:shadow-none border border-transparent px-4 py-2">
              <Users className="w-4 h-4" />
              <span className="font-medium text-xs">AI Model Ledger</span>
            </TabsTrigger>
          </TabsList>

          {/* Trade Intelligence Ledger */}
          <TabsContent value="ledger" className="mt-4 space-y-4">
            {/* Filters */}
            <LedgerFilterBar
              filters={filters}
              onFiltersChange={setFilters}
              totalCount={allEntries.length}
              filteredCount={filteredEntries.length}
            />

            {/* Active Signals (gated) */}
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent overflow-hidden">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" />
                    <CardTitle className="text-sm font-display">Active Signals</CardTitle>
                    <Badge className="text-[10px] bg-primary/20 text-primary border-primary/30 hover:bg-primary/20">{LIVE_COUNT} live</Badge>
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
                  <div className="space-y-1">
                    <LedgerHeader />
                    <Separator className="opacity-30" />
                    <AnimatePresence>
                      {liveEntries.map((entry, i) => (
                        <LedgerRow
                          key={entry.id}
                          entry={entry}
                          isLive
                          pulse={pulse && i === 0}
                          index={i}
                          expanded={expandedTradeId === entry.id}
                          expandedSection={expandedSection}
                          onToggle={() => toggleExpand(entry.id)}
                          onSectionChange={setExpandedSection}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="space-y-1.5 filter blur-[6px] select-none pointer-events-none opacity-50">
                      <LedgerHeader />
                      <Separator className="opacity-30" />
                      {liveEntries.slice(0, 3).map((e) => <div key={e.id} className="h-12 rounded bg-muted/20" />)}
                    </div>
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card/60 backdrop-blur-sm rounded-lg">
                      <div className="p-2 rounded-full bg-primary/10"><Lock className="w-5 h-5 text-primary" /></div>
                      <p className="text-sm font-medium text-foreground">{LIVE_COUNT} Live Signals Hidden</p>
                      <p className="text-xs text-muted-foreground text-center max-w-xs">
                        Upgrade to Edge Access for near real-time multi-agent trade intelligence.
                      </p>
                      <Button size="sm" onClick={() => setUpgradeOpen(true)} className="mt-1 gap-1 text-xs h-8">
                        <Zap className="w-3 h-3" />Unlock Live Ledger
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Trade History */}
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-display">Trade History</CardTitle>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{historyEntries.length} past signals</Badge>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-1">
                <LedgerHeader />
                <Separator className="opacity-30 mb-1" />
                <ScrollArea className="h-[500px]">
                  <div className="space-y-0.5 pr-2">
                    {historyEntries.map((entry, i) => (
                      <LedgerRow
                        key={entry.id}
                        entry={entry}
                        isLive={false}
                        pulse={false}
                        index={i}
                        expanded={expandedTradeId === entry.id}
                        expandedSection={expandedSection}
                        onToggle={() => toggleExpand(entry.id)}
                        onSectionChange={setExpandedSection}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Model Ledger */}
          <TabsContent value="agent-ledger" className="mt-4">
            <AgentLedgerView
              summaries={agentSummaries}
              onSelectAgent={(id) => {
                setSelectedLedgerAgent(id);
                setFilters(f => ({ ...f, agent: id as AgentId }));
              }}
              selectedAgentId={selectedLedgerAgent}
            />
            {selectedLedgerAgent && (
              <div className="mt-4">
                <Card className="border-border/50 bg-card/50">
                  <CardHeader className="pb-2 pt-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{AGENT_DEFINITIONS[selectedLedgerAgent as AgentId].icon}</span>
                      <CardTitle className="text-sm font-display">
                        {AGENT_DEFINITIONS[selectedLedgerAgent as AgentId].name} — Trade History
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <LedgerHeader />
                    <Separator className="opacity-30 mb-1" />
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-0.5 pr-2">
                        {filteredEntries.map((entry, i) => (
                          <LedgerRow
                            key={entry.id}
                            entry={entry}
                            isLive={false}
                            pulse={false}
                            index={i}
                            expanded={expandedTradeId === entry.id}
                            expandedSection={expandedSection}
                            onToggle={() => toggleExpand(entry.id)}
                            onSectionChange={setExpandedSection}
                          />
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        feature="liveTradeSignals"
        headline="Unlock the Multi-Agent Trade Ledger"
        description="See collaborative AI trade intelligence the moment it fires — multi-agent contributions, governance decisions, and full lifecycle transparency."
      />
    </>
  );
};

/* ─── Column Header ─── */
const LedgerHeader = () => (
  <div className="grid grid-cols-[20px_1fr_52px_56px_56px_52px_52px_48px_48px_20px] gap-1.5 px-2 py-1 text-[9px] text-muted-foreground uppercase tracking-wider font-medium">
    <span></span>
    <span>Ticker / Agent</span>
    <span className="text-center">Dir.</span>
    <span className="text-center">Status</span>
    <span className="text-center">Entry</span>
    <span className="text-center">P&L</span>
    <span className="text-center">Risk</span>
    <span className="text-center">Cons.</span>
    <span className="text-center">Gov.</span>
    <span></span>
  </div>
);

/* ─── Ledger Row ─── */
interface LedgerRowProps {
  entry: LedgerTradeEntry;
  isLive: boolean;
  pulse: boolean;
  index: number;
  expanded: boolean;
  expandedSection: 'agents' | 'governance' | 'lifecycle' | 'quality';
  onToggle: () => void;
  onSectionChange: (section: 'agents' | 'governance' | 'lifecycle' | 'quality') => void;
}

const LedgerRow = ({ entry, isLive, pulse, index, expanded, expandedSection, onToggle, onSectionChange }: LedgerRowProps) => {
  const initiator = AGENT_DEFINITIONS[entry.initiatorAgentId];
  const isPositive = entry.pnlPercent > 0;
  const isAvoided = entry.direction === 'avoided';

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
    >
      {/* Summary Row */}
      <div
        className={cn(
          'grid grid-cols-[20px_1fr_52px_56px_56px_52px_52px_48px_48px_20px] gap-1.5 items-center px-2 py-2 rounded-md text-xs cursor-pointer transition-colors',
          isLive ? 'hover:bg-primary/10 border border-transparent hover:border-primary/20' : 'hover:bg-muted/30',
          pulse && 'bg-primary/5',
          expanded && 'bg-primary/5 border-primary/20 border'
        )}
        onClick={onToggle}
      >
        {/* Expand icon */}
        <div className="flex items-center justify-center">
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-primary" />
            : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          }
        </div>

        {/* Ticker + Agent */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm" title={initiator.name}>{initiator.icon}</span>
          <Link
            to={`/dashboard/ticker/${entry.ticker}`}
            className="font-display font-bold text-sm truncate hover:text-primary transition-colors"
            onClick={e => e.stopPropagation()}
          >
            {entry.ticker}
          </Link>
          {isLive && (
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neural-green opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-neural-green" />
            </span>
          )}
          {entry.contributions.length > 1 && (
            <span className="text-[9px] text-muted-foreground">+{entry.contributions.length - 1}</span>
          )}
        </div>

        {/* Direction */}
        <div className="flex items-center justify-center gap-0.5">
          {isAvoided ? (
            <Ban className="w-3 h-3 text-neural-red" />
          ) : entry.direction === 'long' ? (
            <TrendingUp className="w-3 h-3 text-neural-green" />
          ) : (
            <TrendingDown className="w-3 h-3 text-neural-red" />
          )}
          <span className={cn(
            'font-bold uppercase text-[9px]',
            isAvoided ? 'text-muted-foreground' : entry.direction === 'long' ? 'text-neural-green' : 'text-neural-red'
          )}>
            {entry.direction === 'long' ? 'LONG' : entry.direction === 'short' ? 'SHORT' : 'AVOID'}
          </span>
        </div>

        {/* Status */}
        <div className="flex justify-center">
          <Badge variant="outline" className={cn('text-[8px] px-1 py-0 leading-4', LEDGER_STATUS_COLORS[entry.tradeStatus])}>
            {LEDGER_STATUS_LABELS[entry.tradeStatus]}
          </Badge>
        </div>

        {/* Entry Price */}
        <div className="text-center font-mono text-[10px]">${entry.entryPrice.toFixed(2)}</div>

        {/* P&L */}
        <div className="text-center">
          <span className={cn(
            'font-mono font-bold text-[10px]',
            isAvoided ? 'text-muted-foreground' : isPositive ? 'text-neural-green' : 'text-neural-red'
          )}>
            {isAvoided ? '—' : `${isPositive ? '+' : ''}${entry.pnlPercent.toFixed(2)}%`}
          </span>
        </div>

        {/* Risk Allocation */}
        <div className="text-center font-mono text-[10px] text-muted-foreground">
          {entry.riskAllocation.toFixed(1)}%
        </div>

        {/* Consensus */}
        <div className="text-center">
          <span className={cn(
            'font-mono font-bold text-[10px]',
            entry.consensusScore > 75 ? 'text-neural-green' : entry.consensusScore > 50 ? 'text-neural-orange' : 'text-neural-red'
          )}>
            {entry.consensusScore.toFixed(0)}%
          </span>
        </div>

        {/* Governance */}
        <div className="flex justify-center">
          <span className={cn(
            'text-[8px] font-bold',
            entry.governance.tradeApprovalStatus === 'approved' ? 'text-neural-green'
              : entry.governance.tradeApprovalStatus === 'throttled' ? 'text-neural-orange'
                : 'text-neural-red'
          )}>
            {entry.governance.tradeApprovalStatus === 'approved' ? '✓' : entry.governance.tradeApprovalStatus === 'throttled' ? '⚠' : '✗'}
          </span>
        </div>

        {/* Time */}
        <div className="text-right text-[10px] text-muted-foreground">
          {formatDuration(entry.tradeDuration)}
        </div>
      </div>

      {/* Expanded Drill-Down */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="ml-5 mr-2 mb-2 p-4 rounded-lg bg-card/80 border border-border/40 space-y-4">
              {/* Section Tabs */}
              <div className="flex flex-wrap gap-1.5">
                {([
                  { key: 'agents', label: 'Agent Contributions', icon: <Users className="w-3 h-3" /> },
                  { key: 'governance', label: 'Governance Intelligence', icon: <Cpu className="w-3 h-3" /> },
                  { key: 'lifecycle', label: 'Trade Lifecycle', icon: <Clock className="w-3 h-3" /> },
                  { key: 'quality', label: 'Quality Analytics', icon: <Award className="w-3 h-3" /> },
                ] as const).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => onSectionChange(tab.key)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-medium border transition-colors',
                      expandedSection === tab.key
                        ? 'bg-primary/20 text-primary border-primary/30'
                        : 'bg-muted/20 text-muted-foreground border-border/30 hover:bg-muted/40'
                    )}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Section Content */}
              {expandedSection === 'agents' && (
                <AgentContributionPanel
                  contributions={entry.contributions}
                  consensusScore={entry.consensusScore}
                  conflictDetected={entry.conflictDetected}
                />
              )}

              {expandedSection === 'governance' && (
                <MetaControllerTradePanel governance={entry.governance} />
              )}

              {expandedSection === 'lifecycle' && (
                <TradeLifecycleTimeline lifecycle={entry.lifecycle} />
              )}

              {expandedSection === 'quality' && (
                <TradeQualityAnalytics quality={entry.quality} />
              )}

              {/* Trade alerts for this entry */}
              {entry.alerts.length > 0 && (
                <>
                  <Separator className="bg-border/20" />
                  <GovernanceAlertsPanel alerts={entry.alerts} />
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
