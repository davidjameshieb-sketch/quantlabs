import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MetricGaugeProps {
  value: number;
  label: string;
  maxValue?: number;
  size?: 'sm' | 'md' | 'lg';
  colorClass?: string;
  className?: string;
}

export const MetricGauge = ({
  value,
  label,
  maxValue = 100,
  size = 'md',
  colorClass = 'text-primary',
  className,
}: MetricGaugeProps) => {
  const percentage = Math.min((value / maxValue) * 100, 100);
  
  const dimensions = {
    sm: { size: 80, strokeWidth: 6, fontSize: 'text-lg' },
    md: { size: 120, strokeWidth: 8, fontSize: 'text-2xl' },
    lg: { size: 160, strokeWidth: 10, fontSize: 'text-3xl' },
  };
  
  const { size: svgSize, strokeWidth, fontSize } = dimensions[size];
  const radius = (svgSize - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div className="relative" style={{ width: svgSize, height: svgSize }}>
        <svg
          width={svgSize}
          height={svgSize}
          className="transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={strokeWidth}
          />
          
          {/* Foreground arc */}
          <motion.circle
            cx={svgSize / 2}
            cy={svgSize / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className={colorClass}
          />
        </svg>
        
        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.3 }}
            className={cn('font-display font-bold', fontSize)}
          >
            {value.toFixed(0)}
          </motion.span>
          {maxValue !== 100 && (
            <span className="text-xs text-muted-foreground">
              / {maxValue}
            </span>
          )}
        </div>
      </div>
      
      <span className="mt-2 text-sm text-muted-foreground">{label}</span>
    </div>
  );
};
