// Compact inline status meter — small circular gauge for panel metrics
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface StatusMeterProps {
  value: number;
  maxValue?: number;
  label: string;
  size?: number;
  className?: string;
}

export const StatusMeter = ({
  value,
  maxValue = 100,
  label,
  size = 52,
  className,
}: StatusMeterProps) => {
  const pct = Math.min((value / maxValue) * 100, 100);
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const dashOffset = circumference - (pct / 100) * circumference;

  const color = pct >= 70 ? 'text-neural-green' : pct >= 40 ? 'text-neural-orange' : 'text-neural-red';
  const strokeClass = pct >= 70 ? 'stroke-neural-green' : pct >= 40 ? 'stroke-neural-orange' : 'stroke-neural-red';

  return (
    <div className={cn('flex flex-col items-center gap-0.5', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={strokeWidth}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={strokeClass}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn('text-[10px] font-display font-bold', color)}>
            {Math.round(value)}
          </span>
        </div>
      </div>
      <span className="text-[7px] text-muted-foreground text-center leading-tight max-w-[60px]">{label}</span>
    </div>
  );
};

/** Row of inline meters for a panel */
export const StatusMeterRow = ({ meters, className }: { meters: StatusMeterProps[]; className?: string }) => (
  <div className={cn('flex items-end justify-center gap-3 py-2', className)}>
    {meters.map((m, i) => (
      <StatusMeter key={i} {...m} />
    ))}
  </div>
);
