// OANDA Broker Connection & Execution Dashboard
import { motion } from 'framer-motion';
import { Wifi } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { OandaConnectionPanel } from '@/components/forex/OandaConnectionPanel';
import { OandaOrderLog } from '@/components/forex/OandaOrderLog';
import { ForexExecutionStatus } from '@/components/forex/ForexExecutionStatus';
import { AutoExecutionPanel } from '@/components/forex/AutoExecutionPanel';
import { IntelligenceModeBadge } from '@/components/dashboard/IntelligenceModeBadge';
import { useMemo, useCallback, useEffect, useRef } from 'react';
import { generateForexTrades } from '@/lib/forex';
import { createAgents } from '@/lib/agents/agentEngine';
import { useAutoExecution } from '@/hooks/useAutoExecution';
import { useOandaExecution } from '@/hooks/useOandaExecution';

const ForexOanda = () => {
  const agents = useMemo(() => createAgents(), []);
  const allTrades = useMemo(() => generateForexTrades(agents), [agents]);
  const { connected } = useOandaExecution();
  const autoExec = useAutoExecution();
  const hasAutoRun = useRef(false);

  const eligibleTrades = useMemo(
    () => allTrades.filter(t => t.outcome !== 'avoided'),
    [allTrades]
  );

  const handleRunBatch = useCallback(() => {
    autoExec.runBatch(allTrades);
  }, [autoExec, allTrades]);

  // Auto-execute all trades when OANDA connects and auto-exec is enabled
  useEffect(() => {
    if (connected && autoExec.status.enabled && !hasAutoRun.current && !autoExec.status.processing) {
      hasAutoRun.current = true;
      autoExec.runBatch(allTrades);
    }
  }, [connected, autoExec.status.enabled, autoExec.status.processing, allTrades, autoExec]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-1">
            <Wifi className="w-7 h-7 text-primary" />
            <h1 className="font-display text-2xl md:text-3xl font-bold text-gradient-neural">
              OANDA Broker
            </h1>
            <IntelligenceModeBadge />
          </div>
          <p className="text-muted-foreground text-sm">
            Live broker connection, auto-execution bridge, and execution log.
          </p>
        </motion.div>

        {/* OANDA Broker Connection */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <OandaConnectionPanel />
        </motion.div>

        {/* Auto-Execution Bridge */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <AutoExecutionPanel
            status={autoExec.status}
            onToggle={autoExec.toggle}
            onRunBatch={handleRunBatch}
            onReset={autoExec.reset}
            tradeCount={eligibleTrades.length}
            connected={connected}
          />
        </motion.div>

        {/* Execution Status */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <ForexExecutionStatus trades={allTrades} />
        </motion.div>

        {/* OANDA Execution Log */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <OandaOrderLog />
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default ForexOanda;
