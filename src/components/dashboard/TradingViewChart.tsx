import { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, CandlestickData, Time, HistogramData, CandlestickSeries, HistogramSeries, SeriesMarker } from 'lightweight-charts';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { motion } from 'framer-motion';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { TickerInfo, Timeframe, OHLC } from '@/lib/market/types';
import { getMarketData } from '@/lib/market/dataGenerator';
import { TIMEFRAME_LABELS } from '@/lib/market/tickers';
import { ConditionLabel, getConditionColor, getConditionDisplayText } from '@/lib/market/backtestEngine';
import { cn } from '@/lib/utils';
import { CandlestickChart, LineChart } from 'lucide-react';

interface TradingViewChartProps {
  ticker: TickerInfo;
  className?: string;
  showTimeframes?: boolean;
  height?: number;
  showConditionReplay?: boolean;
}

type ChartType = 'candlestick' | 'heikin-ashi';

// Convert OHLC to Heikin Ashi
const toHeikinAshi = (data: OHLC[]): OHLC[] => {
  if (data.length === 0) return [];
  
  const result: OHLC[] = [];
  
  for (let i = 0; i < data.length; i++) {
    const current = data[i];
    const prev = i > 0 ? result[i - 1] : current;
    
    const haClose = (current.open + current.high + current.low + current.close) / 4;
    const haOpen = (prev.open + prev.close) / 2;
    const haHigh = Math.max(current.high, haOpen, haClose);
    const haLow = Math.min(current.low, haOpen, haClose);
    
    result.push({
      timestamp: current.timestamp,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: current.volume,
    });
  }
  
  return result;
};

// Generate condition zones for overlay
interface ConditionZone {
  startTime: number;
  endTime: number;
  condition: ConditionLabel;
  forwardReturn?: number;
  winRate?: number;
  sampleSize?: number;
}

const generateConditionZones = (data: OHLC[]): ConditionZone[] => {
  const zones: ConditionZone[] = [];
  let currentZone: Partial<ConditionZone> | null = null;
  
  for (let i = 20; i < data.length; i++) {
    const bar = data[i];
    const prevBars = data.slice(Math.max(0, i - 20), i);
    
    // Simple condition detection based on price action
    const avgClose = prevBars.reduce((sum, b) => sum + b.close, 0) / prevBars.length;
    const volatility = prevBars.reduce((sum, b) => sum + (b.high - b.low), 0) / prevBars.length;
    const trend = (bar.close - prevBars[0].close) / prevBars[0].close;
    const efficiency = Math.abs(trend) / (volatility * 20 / avgClose);
    
    let condition: ConditionLabel;
    if (efficiency > 0.5 && trend > 0.02) {
      condition = 'high-conviction-bullish';
    } else if (efficiency > 0.5 && trend < -0.02) {
      condition = 'high-conviction-bearish';
    } else if (efficiency < 0.2) {
      condition = 'noisy-avoid';
    } else if (volatility / avgClose < 0.01) {
      condition = 'compression-breakout-imminent';
    } else {
      condition = 'mixed';
    }
    
    // Create or extend zone
    if (currentZone && currentZone.condition === condition) {
      currentZone.endTime = bar.timestamp;
    } else {
      if (currentZone && currentZone.startTime && currentZone.endTime) {
        zones.push(currentZone as ConditionZone);
      }
      currentZone = {
        startTime: bar.timestamp,
        endTime: bar.timestamp,
        condition,
        forwardReturn: (Math.random() - 0.4) * 0.05, // Simulated
        winRate: 0.4 + Math.random() * 0.3,
        sampleSize: Math.floor(20 + Math.random() * 80),
      };
    }
  }
  
  if (currentZone && currentZone.startTime && currentZone.endTime) {
    zones.push(currentZone as ConditionZone);
  }
  
  return zones;
};

export const TradingViewChart = ({ 
  ticker, 
  className, 
  showTimeframes = true,
  height = 400,
  showConditionReplay = true,
}: TradingViewChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candlestickSeriesRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volumeSeriesRef = useRef<any>(null);
  
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [chartType, setChartType] = useState<ChartType>('heikin-ashi');
  const [showOverlay, setShowOverlay] = useState(true);
  const [showOutcomes, setShowOutcomes] = useState(true);
  const [hoveredZone, setHoveredZone] = useState<ConditionZone | null>(null);
  
  // Get data
  const rawData = useMemo(() => {
    return getMarketData(ticker, timeframe, 200);
  }, [ticker, timeframe]);
  
  const chartData = useMemo(() => {
    return chartType === 'heikin-ashi' ? toHeikinAshi(rawData) : rawData;
  }, [rawData, chartType]);
  
  const conditionZones = useMemo(() => {
    return generateConditionZones(rawData);
  }, [rawData]);
  
  // Calculate price change
  const currentPrice = chartData[chartData.length - 1]?.close || 0;
  const firstPrice = chartData[0]?.open || 0;
  const priceChange = currentPrice - firstPrice;
  const percentChange = firstPrice > 0 ? (priceChange / firstPrice) * 100 : 0;
  const isPositive = priceChange >= 0;
  
  // Initialize and update chart
  useEffect(() => {
    if (!chartContainerRef.current) return;
    
    // Create chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: height,
      layout: {
        background: { color: 'transparent' },
        textColor: 'hsl(var(--muted-foreground))',
        fontSize: 11,
        fontFamily: "'Inter', system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: 'rgba(128, 128, 128, 0.2)' },
        horzLines: { color: 'rgba(128, 128, 128, 0.2)' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: 'rgba(59, 130, 246, 0.5)',
          width: 1,
          style: 2,
          labelBackgroundColor: 'rgb(59, 130, 246)',
        },
        horzLine: {
          color: 'rgba(59, 130, 246, 0.5)',
          width: 1,
          style: 2,
          labelBackgroundColor: 'rgb(59, 130, 246)',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(128, 128, 128, 0.3)',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: 'rgba(128, 128, 128, 0.3)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
    });
    
    chartRef.current = chart;
    
    // Add candlestick series using v5 API
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: 'hsl(142, 71%, 45%)',
      downColor: 'hsl(0, 84%, 60%)',
      borderUpColor: 'hsl(142, 71%, 45%)',
      borderDownColor: 'hsl(0, 84%, 60%)',
      wickUpColor: 'hsl(142, 71%, 45%)',
      wickDownColor: 'hsl(0, 84%, 60%)',
    });
    
    candlestickSeriesRef.current = candleSeries;
    
    // Add volume series using v5 API
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: 'rgba(59, 130, 246, 0.3)',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    
    volumeSeriesRef.current = volumeSeries;
    
    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [height]);
  
  // Update data
  useEffect(() => {
    if (!candlestickSeriesRef.current || !volumeSeriesRef.current) return;
    
    const candleData: CandlestickData<Time>[] = chartData.map(bar => ({
      time: (bar.timestamp / 1000) as Time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }));
    
    const volumeData: HistogramData<Time>[] = chartData.map(bar => ({
      time: (bar.timestamp / 1000) as Time,
      value: bar.volume || 0,
      color: bar.close >= bar.open 
        ? 'rgba(34, 197, 94, 0.4)' 
        : 'rgba(239, 68, 68, 0.4)',
    }));
    
    candlestickSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);
    
    // Fit content with some margin
    chartRef.current?.timeScale().fitContent();
  }, [chartData]);
  
  // Draw condition markers
  useEffect(() => {
    if (!candlestickSeriesRef.current || !showOverlay) return;
    
    // Create markers for condition zones
    const markers: SeriesMarker<Time>[] = conditionZones.map(zone => ({
      time: (zone.startTime / 1000) as Time,
      position: 'aboveBar',
      color: getConditionColor(zone.condition),
      shape: 'circle',
      text: '',
    }));
    
    if (candlestickSeriesRef.current.setMarkers) {
      candlestickSeriesRef.current.setMarkers(showOverlay ? markers : []);
    }
  }, [conditionZones, showOverlay]);
  
  return (
    <Card className={cn('border-border/50 bg-card/50', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <CardTitle className="font-display text-lg">
              Price Chart
            </CardTitle>
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
            
            {/* Chart type toggle */}
            <div className="flex items-center gap-1 ml-2">
              <Button
                variant={chartType === 'candlestick' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                onClick={() => setChartType('candlestick')}
              >
                <CandlestickChart className="w-4 h-4" />
              </Button>
              <Button
                variant={chartType === 'heikin-ashi' ? 'default' : 'ghost'}
                size="sm"
                className="h-7 px-2"
                onClick={() => setChartType('heikin-ashi')}
                title="Heikin Ashi"
              >
                <LineChart className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Condition Replay toggle */}
            {showConditionReplay && (
              <div className="flex items-center gap-2">
                <Switch
                  id="condition-replay"
                  checked={showOverlay}
                  onCheckedChange={setShowOverlay}
                />
                <Label htmlFor="condition-replay" className="text-xs cursor-pointer">
                  Condition Replay
                </Label>
              </div>
            )}
            
            {showOverlay && (
              <div className="flex items-center gap-2">
                <Switch
                  id="outcomes"
                  checked={showOutcomes}
                  onCheckedChange={setShowOutcomes}
                />
                <Label htmlFor="outcomes" className="text-xs cursor-pointer">
                  Show Outcomes
                </Label>
              </div>
            )}
            
            {showTimeframes && (
              <Tabs value={timeframe} onValueChange={(v) => setTimeframe(v as Timeframe)}>
                <TabsList className="bg-muted/50 h-8">
                  {(['15m', '1h', '4h', '1d'] as Timeframe[]).map(tf => (
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
        </div>
        
        {/* Chart type indicator */}
        <p className="text-xs text-muted-foreground mt-1">
          {chartType === 'heikin-ashi' ? 'Heikin Ashi' : 'Candlestick'} Chart
          {showOverlay && ' • Condition zones highlighted'}
        </p>
      </CardHeader>
      
      <CardContent className="relative">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div ref={chartContainerRef} style={{ height }} className="rounded-lg overflow-hidden" />
        </motion.div>
        
        {/* Condition Legend */}
        {showOverlay && (
          <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-border/30">
            {(['high-conviction-bullish', 'high-conviction-bearish', 'mixed', 'noisy-avoid', 'compression-breakout-imminent'] as ConditionLabel[]).map(label => (
              <div key={label} className="flex items-center gap-2 text-xs">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: getConditionColor(label) }}
                />
                <span className="text-muted-foreground">{getConditionDisplayText(label)}</span>
              </div>
            ))}
          </div>
        )}
        
        {/* Hovered zone info */}
        {hoveredZone && showOutcomes && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-24 left-4 right-4 p-3 rounded-lg bg-card border border-border shadow-lg"
          >
            <div className="flex items-center gap-2 mb-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: getConditionColor(hoveredZone.condition) }}
              />
              <span className="font-medium text-sm">{getConditionDisplayText(hoveredZone.condition)}</span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-muted-foreground">Avg 10-bar Return</span>
                <p className={cn(
                  'font-medium',
                  (hoveredZone.forwardReturn || 0) > 0 ? 'text-neural-green' : 'text-neural-red'
                )}>
                  {((hoveredZone.forwardReturn || 0) * 100).toFixed(2)}%
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Win Rate</span>
                <p className="font-medium">{((hoveredZone.winRate || 0) * 100).toFixed(0)}%</p>
              </div>
              <div>
                <span className="text-muted-foreground">Sample Size</span>
                <p className="font-medium">{hoveredZone.sampleSize}</p>
              </div>
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
};
