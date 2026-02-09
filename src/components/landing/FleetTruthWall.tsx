import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, Shield, Brain, Globe, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

const fleetMetrics = [
  { icon: BarChart3, value: '24,500+', label: 'Total Scalps Executed', color: 'text-neural-cyan' },
  { icon: TrendingUp, value: '+41.2%', label: 'Scalping Profitability (Net)', color: 'text-neural-green' },
  { icon: Shield, value: '1.87', label: 'Profit Factor', color: 'text-neural-purple' },
  { icon: Brain, value: '18', label: 'FX Scalping Agents', color: 'text-primary' },
  { icon: Globe, value: '8', label: 'Major Pairs Traded', color: 'text-neural-orange' },
];

const systemMeters = [
  { label: 'Scalping System Uptime', value: 98, color: 'bg-neural-green' },
  { label: 'Governance Filter Rate', value: 72, color: 'bg-neural-cyan' },
  { label: 'OANDA Execution Ready', value: 100, color: 'bg-neural-purple' },
];

export const FleetTruthWall = () => {
  return (
    <section className="relative py-20 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/10 to-transparent pointer-events-none" />

      <div className="container relative z-10 max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-xs font-medium text-primary mb-5">
            Verified Scalping Performance
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold">
            <span className="text-gradient-neural">Scalping Truth Wall</span>
          </h2>
        </motion.div>

        {/* Aggregated metrics */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-10">
          {fleetMetrics.map((metric, i) => (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="text-center p-5 rounded-xl border border-border/20 bg-background/10 backdrop-blur-sm hover:border-primary/30 transition-colors"
            >
              <metric.icon className={cn('w-5 h-5 mx-auto mb-2', metric.color)} />
              <p className={cn('font-display text-2xl md:text-3xl font-bold mb-1', metric.color)}>
                {metric.value}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-tight">
                {metric.label}
              </p>
            </motion.div>
          ))}
        </div>

        {/* System Status Meters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="max-w-2xl mx-auto rounded-xl border border-border/20 bg-background/10 backdrop-blur-sm p-6"
        >
          <div className="flex items-center gap-2 mb-5">
            <Activity className="w-4 h-4 text-primary" />
            <span className="font-display text-xs font-bold text-foreground uppercase tracking-wider">
              System Status
            </span>
            <span className="relative flex h-2 w-2 ml-auto">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neural-green opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-neural-green" />
            </span>
          </div>
          <div className="space-y-4">
            {systemMeters.map((meter) => (
              <div key={meter.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">{meter.label}</span>
                  <span className="text-xs font-mono font-bold text-foreground">{meter.value}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-border/20 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${meter.value}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, delay: 0.5, ease: 'easeOut' }}
                    className={cn('h-full rounded-full', meter.color)}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};
