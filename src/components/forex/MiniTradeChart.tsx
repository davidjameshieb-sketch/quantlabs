// Mini price action chart for individual trades
// Shows a synthetic price path between entry and exit with markers

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface MiniTradeChartProps {
  entryPrice: number;
  exitPrice: number | null;
  direction: string;
  className?: string;
}

function generatePricePath(entry: number, exit: number, points: number = 20): number[] {
  const path: number[] = [entry];
  const range = Math.abs(exit - entry);
  const trend = exit > entry ? 1 : -1;
  
  for (let i = 1; i < points - 1; i++) {
    const progress = i / (points - 1);
    // Base trend movement with noise
    const trendComponent = entry + (exit - entry) * progress;
    const noise = (Math.sin(i * 2.7) * 0.3 + Math.cos(i * 1.3) * 0.2) * range;
    // Add some mean-reverting noise
    const overshoot = Math.sin(progress * Math.PI * 2) * range * 0.15;
    path.push(trendComponent + noise * (1 - progress * 0.5) + overshoot);
  }
  path.push(exit);
  return path;
}

export function MiniTradeChart({ entryPrice, exitPrice, direction, className }: MiniTradeChartProps) {
  const exit = exitPrice ?? entryPrice; // flat line if no exit
  const isWin = direction === 'long' ? exit > entryPrice : exit < entryPrice;
  const isScratch = Math.abs(exit - entryPrice) < (entryPrice * 0.00005);

  const { pathD, entryY, exitY, width, height } = useMemo(() => {
    const w = 140;
    const h = 40;
    const padding = 4;
    const points = generatePricePath(entryPrice, exit, 24);
    
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || entryPrice * 0.0001;
    
    const scaleY = (v: number) => padding + ((max - v) / range) * (h - padding * 2);
    const scaleX = (i: number) => padding + (i / (points.length - 1)) * (w - padding * 2);
    
    const d = points.map((p, i) => 
      `${i === 0 ? 'M' : 'L'} ${scaleX(i).toFixed(1)} ${scaleY(p).toFixed(1)}`
    ).join(' ');
    
    return {
      pathD: d,
      entryY: scaleY(entryPrice),
      exitY: scaleY(exit),
      width: w,
      height: h,
    };
  }, [entryPrice, exit]);

  const strokeColor = isScratch
    ? 'hsl(var(--muted-foreground))'
    : isWin
    ? '#34d399'
    : '#f87171';

  const entryColor = '#60a5fa'; // blue for entry
  const exitColor = exitPrice != null ? strokeColor : '#a78bfa'; // match win/loss or purple for "still open"

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('shrink-0', className)}
      style={{ width, height }}
    >
      {/* Entry horizontal dashed line */}
      <line
        x1={4} y1={entryY} x2={width - 4} y2={entryY}
        stroke="hsl(var(--muted-foreground))"
        strokeWidth={0.5}
        strokeDasharray="2 2"
        opacity={0.3}
      />
      {/* Price path */}
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Entry marker */}
      <circle cx={4} cy={entryY} r={2.5} fill={entryColor} />
      {/* Exit marker */}
      {exitPrice != null ? (
        <circle cx={width - 4} cy={exitY} r={2.5} fill={exitColor} />
      ) : (
        <circle cx={width - 4} cy={exitY} r={2.5} fill={exitColor} opacity={0.5}>
          <animate attributeName="opacity" values="0.3;0.8;0.3" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  );
}
