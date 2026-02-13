// Floor Manager's View — Complete governance + neural forensic dashboard
import { motion } from 'framer-motion';
import { Eye, RefreshCw, Brain } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useFloorManagerState } from '@/hooks/useFloorManagerState';
import { PrimeDirectiveGauge } from './PrimeDirectiveGauge';
import { GateStatusPanel } from './GateStatusPanel';
import { AgentForensicPanel } from './AgentForensicPanel';
import { ExecutionSizingPanel } from './ExecutionSizingPanel';
import { GhostTapePanel } from './GhostTapePanel';
import { RegimeMismatchPanel } from './RegimeMismatchPanel';
import { ConfidenceCompetencePanel } from './ConfidenceCompetencePanel';
import { FailurePatternTicker } from './FailurePatternTicker';
import { IndicatorConsensusPanel } from './IndicatorConsensusPanel';
import { PairOpportunityHeatmap } from './PairOpportunityHeatmap';

interface Props {
  openTrades?: Array<{
    currency_pair: string;
    direction: string;
    trade_health_score: number | null;
    mae_r: number | null;
    agent_id: string | null;
  }>;
}

export function FloorManagerView({ openTrades }: Props) {
  const state = useFloorManagerState(15_000);

  const totalOverrides = state.bypasses.length + state.gateThresholds.length +
    state.blacklists.length + state.suspendedAgents.length +
    (state.circuitBreaker ? 1 : 0) + (state.sizingOverride ? 1 : 0) +
    state.evolutionParams.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="w-5 h-5 text-primary" />
          <h2 className="font-display text-lg font-bold">Floor Manager's View</h2>
          <Badge variant="outline" className="text-[9px]">{totalOverrides} active overrides</Badge>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: '3s' }} />
          <span>Live · 15s poll</span>
        </div>
      </div>

      {/* Top Row: Prime Directive + Gate Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <PrimeDirectiveGauge state={state} />
        <div className="md:col-span-2">
          <GateStatusPanel state={state} />
        </div>
      </div>

      {/* Bottom Row: Agent Forensics + Execution Sizing */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AgentForensicPanel state={state} openTrades={openTrades} />
        <ExecutionSizingPanel state={state} />
      </div>

      {/* ── Neural Forensic Engine ── */}
      <div className="flex items-center gap-2 pt-2">
        <Brain className="w-4 h-4 text-[hsl(var(--neural-purple))]" />
        <h3 className="text-sm font-display font-bold text-[hsl(var(--neural-purple))]">Neural Forensic Engine</h3>
      </div>

      {/* Ghost Tape + Failure Pattern Ticker */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GhostTapePanel />
        <FailurePatternTicker />
      </div>

      {/* Regime Mismatch + Confidence vs Competence */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RegimeMismatchPanel />
        <ConfidenceCompetencePanel />
      </div>

      {/* Live Pair Opportunity Heatmap */}
      <PairOpportunityHeatmap />

      {/* Indicator Consensus Engine Room */}
      <IndicatorConsensusPanel />
    </motion.div>
  );
}
