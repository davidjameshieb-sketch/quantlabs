// Section 6: Edge Decay Timeline
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { DecayPoint, EdgeDiscoveryResult } from '@/lib/forex/edgeDiscoveryEngine';

interface Props {
  decay: DecayPoint[];
  status: EdgeDiscoveryResult['edgeDecayStatus'];
}

export const EdgeDecayTimeline = ({ decay, status }: Props) => {
  if (decay.length < 3) {
    return (
      <Card className="border-border/30 bg-card/50">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Insufficient data for decay analysis (need 50+ trades).
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/30 bg-card/50">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-xs font-display font-bold">Edge Decay Monitor</span>
          </div>
          <Badge
            variant="outline"
            className={`text-[9px] ${
              status === 'STABLE' ? 'border-neural-green/50 text-neural-green'
                : status === 'DEGRADING' ? 'border-neural-orange/50 text-neural-orange'
                : status === 'CRITICAL' ? 'border-neural-red/50 text-neural-red'
                : ''
            }`}
          >
            {status}
          </Badge>
        </div>

        {/* Expectancy drift */}
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">Rolling 50-Trade Expectancy (pips)</div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={decay} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
                <XAxis dataKey="index" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 11 }} />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="expectancy" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Win rate + Sharpe drift */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] text-muted-foreground mb-1">Rolling Win Rate</div>
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={decay} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
                  <XAxis dataKey="index" tick={{ fontSize: 8 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 8 }} domain={[0, 1]} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `${(v * 100).toFixed(0)}%`} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 10 }} formatter={(v: number) => [`${(v * 100).toFixed(1)}%`]} />
                  <ReferenceLine y={0.5} stroke="hsl(var(--neural-orange))" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="winRate" stroke="hsl(var(--neural-green))" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground mb-1">Rolling Sharpe</div>
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={decay} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
                  <XAxis dataKey="index" tick={{ fontSize: 8 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 8 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 10 }} />
                  <ReferenceLine y={1} stroke="hsl(var(--neural-green))" strokeDasharray="3 3" />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="sharpe" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
