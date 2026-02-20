// OANDA Broker Connection & Execution Page
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wifi, Grid3x3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
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
          <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
            <div className="flex items-center gap-3">
              <Wifi className="w-7 h-7 text-primary" />
              <div>
                <h1 className="font-display text-2xl md:text-3xl font-bold">OANDA Broker</h1>
                <p className="text-muted-foreground text-sm">Live connection · open positions · execution log</p>
              </div>
            </div>
            <Link to="/matrix">
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                <Grid3x3 className="w-3.5 h-3.5" />
                Sovereign Matrix
              </Button>
            </Link>
          </div>
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
