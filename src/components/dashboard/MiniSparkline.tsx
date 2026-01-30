import { useMemo, useState, useEffect } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { TickerInfo, OHLC } from '@/lib/market/types';
import { getMarketData } from '@/lib/market/dataGenerator';

interface MiniSparklineProps {
  ticker: TickerInfo;
  height?: number;
  className?: string;
}

export const MiniSparkline = ({ ticker, height = 40, className }: MiniSparklineProps) => {
  const baseData = useMemo(() => {
    return getMarketData(ticker, '1h', 24);
  }, [ticker]);

  const [liveData, setLiveData] = useState<OHLC[]>(baseData);

  // Simulate real-time updates
  useEffect(() => {
    setLiveData(baseData);
    
    const interval = setInterval(() => {
      setLiveData(prevData => {
        if (prevData.length === 0) return prevData;
        
        const lastBar = prevData[prevData.length - 1];
        const volatility = ticker.type === 'forex' ? 0.0001 : 
                          ticker.type === 'crypto' ? 0.001 : 0.0005;
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
    }, 2000);

    return () => clearInterval(interval);
  }, [baseData, ticker.type]);

  const chartData = useMemo(() => {
    return liveData.map(bar => ({
      close: bar.close,
    }));
  }, [liveData]);

  const isPositive = liveData.length >= 2 && 
    liveData[liveData.length - 1].close >= liveData[0].open;

  const color = isPositive ? 'hsl(var(--neural-green))' : 'hsl(var(--neural-red))';

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`sparkline-${ticker.symbol}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="close"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#sparkline-${ticker.symbol})`}
            animationDuration={300}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
