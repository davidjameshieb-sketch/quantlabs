// Rolling Sharpe ratio chart with cumulative P&L overlay
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Area, ComposedChart } from 'recharts';
import { BarChart3, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SharpePoint } from '@/hooks/useTradeAnalytics';

interface RollingSharpeChartProps {
  data: SharpePoint[];
  overallSharpe: number;
}

export const RollingSharpeChart = ({ data, overallSharpe }: RollingSharpeChartProps) => {
  if (data.length === 0) {
    return (
      <div className="p-6 rounded-xl bg-card/50 border border-border/50 text-center">
        <p className="text-sm text-muted-foreground">Need at least 20 closed trades for rolling Sharpe.</p>
      </div>
    );
  }

  const latestSharpe = data[data.length - 1]?.sharpe ?? 0;
  const minSharpe = Math.min(...data.map(d => d.sharpe));
  const maxSharpe = Math.max(...data.map(d => d.sharpe));

  return (
    <div className="rounded-xl bg-card/50 border border-border/50 overflow-hidden">
      <div className="p-3 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-display font-bold">ROLLING SHARPE RATIO</h3>
          <span className="text-[9px] text-muted-foreground">(20-trade window)</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[9px] text-muted-foreground">Current</span>
            <p className={cn(
              'text-sm font-mono font-bold',
              latestSharpe >= 1.5 ? 'text-neural-green' :
              latestSharpe >= 0.5 ? 'text-yellow-500' : 'text-neural-red'
            )}>
              {latestSharpe.toFixed(2)}
            </p>
          </div>
          <div className="text-right">
            <span className="text-[9px] text-muted-foreground">Overall</span>
            <p className={cn(
              'text-sm font-mono font-bold',
              overallSharpe >= 1.5 ? 'text-neural-green' :
              overallSharpe >= 0.5 ? 'text-yellow-500' : 'text-neural-red'
            )}>
              {overallSharpe.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className="p-3">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="cumPnlGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(v: string) => v.slice(5)} // MM-DD
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="sharpe"
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              domain={[Math.min(minSharpe - 0.5, -1), Math.max(maxSharpe + 0.5, 3)]}
            />
            <YAxis
              yAxisId="pnl"
              orientation="right"
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
            />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: '11px',
              }}
              formatter={(value: number, name: string) => {
                if (name === 'sharpe') return [value.toFixed(2), 'Sharpe'];
                if (name === 'cumPnlPips') return [`${value.toFixed(1)}p`, 'Cum P&L'];
                return [value, name];
              }}
            />
            <ReferenceLine yAxisId="sharpe" y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" opacity={0.5} />
            <ReferenceLine yAxisId="sharpe" y={1} stroke="hsl(142 76% 36%)" strokeDasharray="3 3" opacity={0.3} label={{ value: 'Good', fontSize: 8, fill: 'hsl(142 76% 36%)' }} />
            <ReferenceLine yAxisId="sharpe" y={2} stroke="hsl(142 76% 36%)" strokeDasharray="3 3" opacity={0.2} label={{ value: 'Excellent', fontSize: 8, fill: 'hsl(142 76% 36%)' }} />

            <Area
              yAxisId="pnl"
              type="monotone"
              dataKey="cumPnlPips"
              fill="url(#cumPnlGrad)"
              stroke="hsl(var(--primary))"
              strokeWidth={1}
              strokeOpacity={0.3}
            />
            <Line
              yAxisId="sharpe"
              type="monotone"
              dataKey="sharpe"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Legend strip */}
        <div className="flex items-center justify-center gap-4 mt-2 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 rounded bg-primary inline-block" /> Sharpe Ratio
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-primary/15 inline-block" /> Cumulative P&L (pips)
          </span>
          <span>
            {latestSharpe >= 2 ? '🔥 Excellent' :
             latestSharpe >= 1 ? '✅ Good' :
             latestSharpe >= 0 ? '⚠️ Marginal' : '🔴 Negative'}
          </span>
        </div>
      </div>
    </div>
  );
};
