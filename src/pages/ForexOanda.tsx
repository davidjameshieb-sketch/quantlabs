// OANDA Broker Connection & Execution Dashboard
import { motion } from 'framer-motion';
import { Wifi } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { OandaConnectionPanel } from '@/components/forex/OandaConnectionPanel';
import { OandaOrderLog } from '@/components/forex/OandaOrderLog';
import { ForexExecutionStatus } from '@/components/forex/ForexExecutionStatus';
import { IntelligenceModeBadge } from '@/components/dashboard/IntelligenceModeBadge';
import { useMemo } from 'react';
import { generateForexTrades } from '@/lib/forex';
import { createAgents } from '@/lib/agents/agentEngine';

const ForexOanda = () => {
  const agents = useMemo(() => createAgents(), []);
  const allTrades = useMemo(() => generateForexTrades(agents), [agents]);

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
            Live broker connection, account overview, and execution log.
          </p>
        </motion.div>

        {/* OANDA Broker Connection */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <OandaConnectionPanel />
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
