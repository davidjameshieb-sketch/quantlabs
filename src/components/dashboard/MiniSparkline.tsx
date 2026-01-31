import { useMemo, useState, useEffect } from 'react';
import { TickerInfo, OHLC } from '@/lib/market/types';
import { getMarketData } from '@/lib/market/dataGenerator';
import { cn } from '@/lib/utils';

interface MiniSparklineProps {
  ticker: TickerInfo;
  height?: number;
  className?: string;
}

export const MiniSparkline = ({ ticker, height = 50, className }: MiniSparklineProps) => {
  const baseData = useMemo(() => {
    return getMarketData(ticker, '15m', 48); // More data points for detail
  }, [ticker]);

  const [liveData, setLiveData] = useState<OHLC[]>(baseData);

  // Simulate real-time updates
  useEffect(() => {
    setLiveData(baseData);
    
    const interval = setInterval(() => {
      setLiveData(prevData => {
        if (prevData.length === 0) return prevData;
        
        const lastBar = prevData[prevData.length - 1];
        const volatility = ticker.type === 'forex' ? 0.0002 : 
                          ticker.type === 'crypto' ? 0.002 : 0.001;
        const change = (Math.random() - 0.5) * 2 * volatility * lastBar.close;
        const newClose = lastBar.close + change;
        
        const updatedLastBar: OHLC = {
          ...lastBar,
          close: newClose,
          high: Math.max(lastBar.high, newClose),
          low: Math.min(lastBar.low, newClose),
        };
        
        return [...prevData.slice(0, -1), updatedLastBar];
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [baseData, ticker.type]);

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

  // Generate mini candlesticks
  const candlesticks = useMemo(() => {
    return liveData.map((bar, i) => {
      const x = (i / (liveData.length - 1)) * 100;
      const openY = 100 - ((bar.open - minPrice) / priceRange) * 100;
      const closeY = 100 - ((bar.close - minPrice) / priceRange) * 100;
      const highY = 100 - ((bar.high - minPrice) / priceRange) * 100;
      const lowY = 100 - ((bar.low - minPrice) / priceRange) * 100;
      const isBullish = bar.close >= bar.open;
      
      return {
        x,
        openY,
        closeY,
        highY,
        lowY,
        bodyTop: Math.min(openY, closeY),
        bodyHeight: Math.abs(closeY - openY) || 0.5,
        color: isBullish ? bullColor : bearColor,
        isBullish,
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
        <g className="transition-all duration-300">
          {candlesticks.map((candle, i) => (
            <g key={i}>
              {/* Wick line */}
              <line
                x1={candle.x}
                y1={candle.highY}
                x2={candle.x}
                y2={candle.lowY}
                stroke={candle.color}
                strokeWidth="0.3"
                strokeOpacity={0.6}
              />
              {/* Body */}
              <rect
                x={candle.x - 0.6}
                y={candle.bodyTop}
                width="1.2"
                height={Math.max(candle.bodyHeight, 0.8)}
                fill={candle.isBullish ? candle.color : candle.color}
                fillOpacity={candle.isBullish ? 0.9 : 0.7}
                rx="0.2"
              />
            </g>
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
        
        {/* Current price dot */}
        {liveData.length > 0 && (
          <circle
            cx={100}
            cy={100 - ((liveData[liveData.length - 1].close - minPrice) / priceRange) * 100}
            r="2"
            fill={trendColor}
            className="animate-pulse"
          >
            <animate
              attributeName="r"
              values="1.5;2.5;1.5"
              dur="2s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="1;0.6;1"
              dur="2s"
              repeatCount="indefinite"
            />
          </circle>
        )}
      </svg>
      
      {/* Shimmer overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" 
        style={{ 
          transform: 'translateX(-100%)',
          animation: 'shimmer 2s infinite',
        }} 
      />
    </div>
  );
};
