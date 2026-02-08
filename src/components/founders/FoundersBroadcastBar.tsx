import { motion } from 'framer-motion';
import { Radio, Zap } from 'lucide-react';
import { useFoundersCountdown } from '@/hooks/useFoundersEvent';
import { cn } from '@/lib/utils';

/** Full-width intelligence broadcast banner — persistent across pages */
export const FoundersBroadcastBar = () => {
  const { time, active } = useFoundersCountdown();

  if (!active) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="fixed top-0 left-0 right-0 z-[60] h-9 flex items-center justify-center gap-3 px-4 overflow-hidden"
      style={{
        background: 'linear-gradient(90deg, hsl(var(--primary) / 0.15) 0%, hsl(var(--neural-purple) / 0.15) 50%, hsl(var(--primary) / 0.15) 100%)',
        borderBottom: '1px solid hsl(var(--primary) / 0.25)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Pulse dot */}
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
      </span>

      {/* Message — desktop */}
      <span className="hidden md:inline text-[11px] font-display font-medium text-primary tracking-wide">
        FOUNDERS ACCESS ACTIVE
      </span>
      <span className="hidden lg:inline text-[10px] text-muted-foreground">
        — Full AI Intelligence Network Open
      </span>

      {/* Mobile short label */}
      <span className="md:hidden text-[10px] font-display font-bold text-primary tracking-wider">
        FOUNDERS ACCESS
      </span>

      {/* Separator */}
      <span className="hidden sm:inline text-muted-foreground/30">│</span>

      {/* Countdown */}
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[11px] font-bold text-foreground tabular-nums tracking-tight">
          {String(time.days).padStart(2, '0')}
          <span className="text-muted-foreground/50">d</span>
          {' '}
          {String(time.hours).padStart(2, '0')}
          <span className="text-muted-foreground/50">h</span>
          {' '}
          {String(time.minutes).padStart(2, '0')}
          <span className="text-muted-foreground/50">m</span>
          {' '}
          {String(time.seconds).padStart(2, '0')}
          <span className="text-muted-foreground/50">s</span>
        </span>
      </div>
    </motion.div>
  );
};
