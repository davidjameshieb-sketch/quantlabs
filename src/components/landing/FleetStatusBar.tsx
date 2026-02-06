import { motion } from 'framer-motion';
import { Activity, RefreshCw, Shield } from 'lucide-react';

const statusItems = [
  { icon: Activity, label: 'Trading Agents', value: '10 / 10', color: 'text-neural-green' },
  { icon: RefreshCw, label: 'Optimization Engines', value: '4 / 4', color: 'text-neural-cyan' },
  { icon: Shield, label: 'Governance Council', value: '6 / 6', color: 'text-neural-purple' },
];

export const FleetStatusBar = () => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.3 }}
      className="relative z-10 mx-auto max-w-5xl px-4 py-2"
    >
      <div className="flex items-center justify-center gap-6 md:gap-10 rounded-xl border border-border/20 bg-background/10 backdrop-blur-md px-6 py-2.5">
        <span className="hidden md:block text-[10px] font-display uppercase tracking-[0.15em] text-muted-foreground/60">
          AI Fleet Status
        </span>
        <div className="hidden md:block w-px h-4 bg-border/30" />
        {statusItems.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
            <span className="text-[10px] text-muted-foreground">{item.label}:</span>
            <span className={`text-[11px] font-mono font-bold ${item.color}`}>{item.value}</span>
          </div>
        ))}
        {/* Live pulse */}
        <span className="relative flex h-2 w-2 ml-1">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neural-green opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-neural-green" />
        </span>
      </div>
    </motion.div>
  );
};
