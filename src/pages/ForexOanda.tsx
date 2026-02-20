// OANDA Broker Connection & Execution Page
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wifi } from 'lucide-react';
import { OandaConnectionPanel } from '@/components/forex/OandaConnectionPanel';
import { OandaOrderLog } from '@/components/forex/OandaOrderLog';
import { useOandaExecution } from '@/hooks/useOandaExecution';

const ForexOanda = () => {
  const { fetchAccountSummary, fetchOrderHistory } = useOandaExecution();

  useEffect(() => {
    fetchAccountSummary('practice');
    fetchOrderHistory('practice');
  }, [fetchAccountSummary, fetchOrderHistory]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-1">
            <Wifi className="w-7 h-7 text-primary" />
            <h1 className="font-display text-2xl md:text-3xl font-bold">OANDA Broker</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Live broker connection, open positions, and execution order log.
          </p>
        </motion.div>

        {/* OANDA Connection */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <OandaConnectionPanel />
        </motion.div>

        {/* Order Log */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <OandaOrderLog />
        </motion.div>
      </div>
    </div>
  );
};

export default ForexOanda;
