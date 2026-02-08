// OANDA Broker Connection, Execution Safety & Health Dashboard
import { motion } from 'framer-motion';
import { Wifi } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { OandaConnectionPanel } from '@/components/forex/OandaConnectionPanel';
import { OandaOrderLog } from '@/components/forex/OandaOrderLog';
import { ForexExecutionStatus } from '@/components/forex/ForexExecutionStatus';
import { AutoExecutionPanel } from '@/components/forex/AutoExecutionPanel';
import { ExecutionHealthPanel } from '@/components/forex/ExecutionHealthPanel';
import { IntelligenceModeBadge } from '@/components/dashboard/IntelligenceModeBadge';
import { useMemo, useCallback, useEffect } from 'react';
import { generateForexTrades } from '@/lib/forex';
import { createAgents } from '@/lib/agents/agentEngine';
import { useAutoExecution } from '@/hooks/useAutoExecution';
import { useOandaExecution } from '@/hooks/useOandaExecution';

const ForexOanda = () => {
  const agents = useMemo(() => createAgents(), []);
  const allTrades = useMemo(() => generateForexTrades(agents), [agents]);
  const { connected, orders, fetchOrderHistory, fetchAccountSummary } = useOandaExecution();
  const autoExec = useAutoExecution();

  const eligibleTrades = useMemo(
    () => allTrades.filter(t => t.outcome !== 'avoided'),
    [allTrades]
  );

  const handleRunBatch = useCallback(() => {
    autoExec.runBatch(allTrades);
  }, [autoExec, allTrades]);

  // Fetch real order data for the execution health panel on mount
  useEffect(() => {
    fetchAccountSummary('practice');
    fetchOrderHistory('practice');
  }, [fetchAccountSummary, fetchOrderHistory]);

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
            Live broker connection, execution safety gates, auto-execution bridge, and health monitoring.
          </p>
        </motion.div>

        {/* OANDA Broker Connection */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <OandaConnectionPanel />
        </motion.div>

        {/* Execution Health & Safety */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.07 }}>
          <div className="p-4 rounded-xl bg-card/50 border border-border/50 space-y-3">
            <h3 className="text-xs font-display font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              EXECUTION HEALTH & SAFETY
            </h3>
            <ExecutionHealthPanel orders={orders} />
          </div>
        </motion.div>

        {/* Auto-Execution Bridge */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
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
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }}>
          <ForexExecutionStatus trades={allTrades} />
        </motion.div>

        {/* OANDA Execution Log */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
          <OandaOrderLog />
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default ForexOanda;
