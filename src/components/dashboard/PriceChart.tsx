import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Bar,
} from 'recharts';
import { motion } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TickerInfo, Timeframe, OHLC } from '@/lib/market/types';
import { getMarketDataAsync } from '@/lib/market/marketDataService';
import { TIMEFRAME_LABELS } from '@/lib/market/tickers';
import { cn } from '@/lib/utils';

interface PriceChartProps {
  ticker: TickerInfo;
  className?: string;
  showTimeframes?: boolean;
  height?: number;
}

const formatPrice = (value: number, type: string) => {
  if (type === 'forex') {
    return value.toFixed(4);
  }
  if (value >= 10000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return value.toFixed(2);
};

const formatTime = (timestamp: number, timeframe: Timeframe) => {
  const date = new Date(timestamp);
  if (timeframe === '1d' || timeframe === '1w') {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

export const PriceChart = ({ 
  ticker, 
  className, 
  showTimeframes = true,
  height = 400 
}: PriceChartProps) => {
  const [timeframe, setTimeframe] = useState<Timeframe>('1d'); // Default to daily for real data
  const [liveData, setLiveData] = useState<OHLC[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch real market data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getMarketDataAsync(ticker, timeframe, 50);
      setLiveData(data);
    } catch (err) {
      setError('Failed to load market data');
      console.error('Chart data error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [ticker, timeframe]);

  // Load data on mount and when ticker/timeframe changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh data periodically (every 60 seconds for real data)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [fetchData]);

  // Calculate chart data with formatting
  const chartData = useMemo(() => {
    return liveData.map((bar, index) => {
      const isGreen = bar.close >= bar.open;
      return {
        timestamp: bar.timestamp,
        time: formatTime(bar.timestamp, timeframe),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        // For area chart coloring
        areaFill: bar.close,
        // For candle body
        candleBody: Math.abs(bar.close - bar.open),
        candleBase: Math.min(bar.open, bar.close),
        isGreen,
      };
    });
  }, [liveData, timeframe]);

  const currentPrice = chartData[chartData.length - 1]?.close || 0;
  const firstPrice = chartData[0]?.open || 0;
  const priceChange = currentPrice - firstPrice;
  const percentChange = firstPrice > 0 ? (priceChange / firstPrice) * 100 : 0;
  const isPositive = priceChange >= 0;

  const minPrice = Math.min(...chartData.map(d => d.low));
  const maxPrice = Math.max(...chartData.map(d => d.high));
  const priceRange = maxPrice - minPrice;
  const yDomain = [minPrice - priceRange * 0.05, maxPrice + priceRange * 0.05];

  return (
    <Card className={cn('border-border/50 bg-card/50', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg flex items-center gap-3">
            Price Chart
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                isPositive 
                  ? 'bg-neural-green/20 text-neural-green border-neural-green/30' 
                  : 'bg-neural-red/20 text-neural-red border-neural-red/30'
              )}
            >
              {isPositive ? '+' : ''}{percentChange.toFixed(2)}%
            </Badge>
          </CardTitle>
          
          {showTimeframes && (
            <Tabs value={timeframe} onValueChange={(v) => setTimeframe(v as Timeframe)}>
              <TabsList className="bg-muted/50 h-8">
                {(['1d', '1w'] as Timeframe[]).map(tf => (
                  <TabsTrigger
                    key={tf}
                    value={tf}
                    className="text-xs px-3 h-6 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    {TIMEFRAME_LABELS[tf]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          style={{ height }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`areaGradient-${ticker.symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop 
                    offset="0%" 
                    stopColor={isPositive ? 'hsl(var(--neural-green))' : 'hsl(var(--neural-red))'} 
                    stopOpacity={0.3} 
                  />
                  <stop 
                    offset="100%" 
                    stopColor={isPositive ? 'hsl(var(--neural-green))' : 'hsl(var(--neural-red))'} 
                    stopOpacity={0.05} 
                  />
                </linearGradient>
              </defs>
              
              <XAxis 
                dataKey="time" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis 
                domain={yDomain}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
                tickFormatter={(v) => formatPrice(v, ticker.type)}
                width={60}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  boxShadow: '0 10px 40px -10px hsl(var(--primary) / 0.2)',
                }}
                labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                formatter={(value: number) => [formatPrice(value, ticker.type), '']}
                labelFormatter={(label) => label}
              />
              
              <ReferenceLine 
                y={currentPrice} 
                stroke={isPositive ? 'hsl(var(--neural-green))' : 'hsl(var(--neural-red))'} 
                strokeDasharray="3 3"
                strokeWidth={1}
              />
              
              <Area
                type="monotone"
                dataKey="close"
                stroke={isPositive ? 'hsl(var(--neural-green))' : 'hsl(var(--neural-red))'}
                strokeWidth={2}
                fill={`url(#areaGradient-${ticker.symbol})`}
                animationDuration={300}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </motion.div>
      </CardContent>
    </Card>
  );
};
