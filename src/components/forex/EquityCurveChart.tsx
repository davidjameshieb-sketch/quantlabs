// Equity Curve Chart
// Plots cumulative P&L over time from real OANDA execution data

import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SharpePoint } from '@/hooks/useTradeAnalytics';

interface EquityCurveChartProps {
  data: SharpePoint[];
  totalPnlPips: number;
  totalTrades: number;
}

export const EquityCurveChart = ({ data, totalPnlPips, totalTrades }: EquityCurveChartProps) => {
  const { maxDrawdown, peakPnl } = useMemo(() => {
    let peak = 0;
    let maxDd = 0;
    for (const d of data) {
      if (d.cumPnlPips > peak) peak = d.cumPnlPips;
      const dd = peak - d.cumPnlPips;
      if (dd > maxDd) maxDd = dd;
    }
    return { maxDrawdown: Math.round(maxDd * 10) / 10, peakPnl: Math.round(peak * 10) / 10 };
  }, [data]);

  const isPositive = totalPnlPips >= 0;

  if (data.length < 2) {
    return (
      <Card className="bg-card/60 border-border/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Equity Curve
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground text-center py-8">
            Need at least 20 closed trades to display equity curve
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {isPositive ? (
            <TrendingUp className="w-4 h-4 text-[hsl(var(--neural-green))]" />
          ) : (
            <TrendingDown className="w-4 h-4 text-[hsl(var(--neural-red))]" />
          )}
          Equity Curve
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className={cn('text-[9px]',
              isPositive ? 'text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/30' : 'text-[hsl(var(--neural-red))] border-[hsl(var(--neural-red))]/30'
            )}>
              {isPositive ? '+' : ''}{totalPnlPips}p net
            </Badge>
            <Badge variant="outline" className="text-[9px] text-muted-foreground">
              Peak: +{peakPnl}p
            </Badge>
            <Badge variant="outline" className="text-[9px] text-[hsl(var(--neural-red))] border-[hsl(var(--neural-red))]/30">
              MaxDD: -{maxDrawdown}p
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={isPositive ? 'hsl(var(--neural-green))' : 'hsl(var(--neural-red))'} stopOpacity={0.3} />
                <stop offset="95%" stopColor={isPositive ? 'hsl(var(--neural-green))' : 'hsl(var(--neural-red))'} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.2)" />
            <XAxis
              dataKey="tradeCount"
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              label={{ value: 'Trade #', position: 'insideBottom', offset: -2, fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `${v}p`}
            />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '11px',
              }}
              formatter={(value: number) => [`${value.toFixed(1)}p`, 'Cumulative P&L']}
              labelFormatter={(label) => `Trade #${label}`}
            />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground) / 0.3)" strokeDasharray="4 4" />
            <Area
              type="monotone"
              dataKey="cumPnlPips"
              stroke={isPositive ? 'hsl(var(--neural-green))' : 'hsl(var(--neural-red))'}
              strokeWidth={2}
              fill="url(#equityGrad)"
              dot={false}
              activeDot={{ r: 3, strokeWidth: 1 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
