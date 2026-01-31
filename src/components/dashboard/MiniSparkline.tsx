import { memo, useMemo } from 'react';
import { TickerInfo, OHLC } from '@/lib/market/types';
import { getMarketData } from '@/lib/market/dataGenerator';
import { cn } from '@/lib/utils';

interface MiniSparklineProps {
  ticker: TickerInfo;
  height?: number;
  className?: string;
}

export const MiniSparkline = memo(({ ticker, height = 50, className }: MiniSparklineProps) => {
  // Use simulated data for sparklines to avoid exhausting API rate limits
  // Real API data is reserved for the main TradingViewChart when viewing a specific ticker
  const liveData = useMemo(() => getMarketData(ticker, '15m', 32), [ticker]);
  // Calculate chart bounds and scale
  const { minPrice, maxPrice, priceRange } = useMemo(() => {
    if (liveData.length === 0) return { minPrice: 0, maxPrice: 0, priceRange: 1 };
    
    let min = Infinity;
    let max = -Infinity;
    
    for (const bar of liveData) {
      if (bar.low < min) min = bar.low;
      if (bar.high > max) max = bar.high;
    }
    
    const padding = (max - min) * 0.1;
    return {
      minPrice: min - padding,
      maxPrice: max + padding,
      priceRange: (max - min + padding * 2) || 1,
    };
  }, [liveData]);

  const isPositive = liveData.length >= 2 && 
    liveData[liveData.length - 1].close >= liveData[0].open;

  const bullColor = 'hsl(var(--neural-green))';
  const bearColor = 'hsl(var(--neural-red))';
  const trendColor = isPositive ? bullColor : bearColor;

  // Generate SVG path for price line (using closes)
  const linePath = useMemo(() => {
    if (liveData.length < 2) return '';
    
    const points = liveData.map((bar, i) => {
      const x = (i / (liveData.length - 1)) * 100;
      const y = 100 - ((bar.close - minPrice) / priceRange) * 100;
      return `${x},${y}`;
    });
    
    return `M${points.join(' L')}`;
  }, [liveData, minPrice, priceRange]);

  // Generate area path for gradient fill
  const areaPath = useMemo(() => {
    if (liveData.length < 2) return '';
    
    const points = liveData.map((bar, i) => {
      const x = (i / (liveData.length - 1)) * 100;
      const y = 100 - ((bar.close - minPrice) / priceRange) * 100;
      return `${x},${y}`;
    });
    
    return `M0,100 L${points.join(' L')} L100,100 Z`;
  }, [liveData, minPrice, priceRange]);

  // Generate mini candlesticks with volume simulation
  const candlesticks = useMemo(() => {
    const barWidth = 100 / liveData.length;
    return liveData.map((bar, i) => {
      const x = (i / (liveData.length - 1)) * 100;
      const openY = 100 - ((bar.open - minPrice) / priceRange) * 100;
      const closeY = 100 - ((bar.close - minPrice) / priceRange) * 100;
      const highY = 100 - ((bar.high - minPrice) / priceRange) * 100;
      const lowY = 100 - ((bar.low - minPrice) / priceRange) * 100;
      const isBullish = bar.close >= bar.open;
      
      // Simulated volume (random for visual effect)
      const volume = 0.3 + Math.random() * 0.7;
      
      return {
        x,
        openY,
        closeY,
        highY,
        lowY,
        bodyTop: Math.min(openY, closeY),
        bodyHeight: Math.max(Math.abs(closeY - openY), 1.5), // Minimum body height
        color: isBullish ? bullColor : bearColor,
        isBullish,
        barWidth: barWidth * 0.7, // 70% of available space
        volume,
      };
    });
  }, [liveData, minPrice, priceRange, bullColor, bearColor]);

  const gradientId = `sparkline-gradient-${ticker.symbol}`;
  const glowId = `sparkline-glow-${ticker.symbol}`;

  return (
    <div className={cn('relative', className)} style={{ height }}>
      <svg 
        viewBox="0 0 100 100" 
        preserveAspectRatio="none" 
        className="w-full h-full"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Gradient fill */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={trendColor} stopOpacity={0.4} />
            <stop offset="50%" stopColor={trendColor} stopOpacity={0.15} />
            <stop offset="100%" stopColor={trendColor} stopOpacity={0.02} />
          </linearGradient>
          
          {/* Glow filter */}
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        
        {/* Area fill */}
        <path
          d={areaPath}
          fill={`url(#${gradientId})`}
          className="transition-all duration-300"
        />
        
        {/* Mini candlestick wicks and bodies */}
        <g className="transition-all duration-200">
          {candlesticks.map((candle, i) => (
            <g key={i}>
              {/* Wick line (shadow) */}
              <line
                x1={candle.x}
                y1={candle.highY}
                x2={candle.x}
                y2={candle.lowY}
                stroke={candle.color}
                strokeWidth="0.4"
                strokeOpacity={0.8}
              />
              {/* Body with rounded corners */}
              <rect
                x={candle.x - candle.barWidth / 2}
                y={candle.bodyTop}
                width={candle.barWidth}
                height={Math.max(candle.bodyHeight, 1.2)}
                fill={candle.isBullish ? candle.color : 'transparent'}
                stroke={candle.color}
                strokeWidth={candle.isBullish ? 0 : 0.3}
                fillOpacity={candle.isBullish ? 0.95 : 0}
                rx="0.3"
              />
              {/* Bearish body fill */}
              {!candle.isBullish && (
                <rect
                  x={candle.x - candle.barWidth / 2}
                  y={candle.bodyTop}
                  width={candle.barWidth}
                  height={Math.max(candle.bodyHeight, 1.2)}
                  fill={candle.color}
                  fillOpacity={0.85}
                  rx="0.3"
                />
              )}
            </g>
          ))}
        </g>
        
        {/* Volume bars at bottom */}
        <g className="transition-all duration-200">
          {candlesticks.map((candle, i) => (
            <rect
              key={`vol-${i}`}
              x={candle.x - candle.barWidth / 2}
              y={92 - candle.volume * 8}
              width={candle.barWidth}
              height={candle.volume * 8}
              fill={candle.color}
              fillOpacity={0.25}
              rx="0.2"
            />
          ))}
        </g>
        
        {/* Main price line with glow */}
        <path
          d={linePath}
          fill="none"
          stroke={trendColor}
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${glowId})`}
          className="transition-all duration-300"
          vectorEffect="non-scaling-stroke"
        />
        
        {/* Current price dot - static to avoid constant repaints */}
        {liveData.length > 0 && (
          <circle
            cx={100}
            cy={100 - ((liveData[liveData.length - 1].close - minPrice) / priceRange) * 100}
            r="2"
            fill={trendColor}
          />
        )}
      </svg>
    </div>
  );
});
