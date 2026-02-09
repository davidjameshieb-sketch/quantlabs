// Removal Reasons bar chart
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props {
  reasons: Record<string, number>;
  totalRemoved: number;
}

const COLORS = [
  'hsl(var(--neural-red))',
  'hsl(var(--neural-orange))',
  'hsl(var(--primary))',
  'hsl(var(--neural-green))',
  'hsl(var(--muted-foreground))',
];

const LABELS: Record<string, string> = {
  blocked_session: 'Blocked Session',
  blocked_pair: 'Blocked Pair',
  blocked_direction: 'Blocked Direction',
  blocked_agent: 'Blocked Agent',
  session_not_allowed: 'Session Not Allowed',
  regime_not_allowed: 'Regime Not Allowed',
  low_composite: 'Low Composite',
  low_ql_confidence: 'Low QL Confidence',
  high_spread: 'High Spread',
  high_friction: 'High Friction',
  conditional: 'Conditional Rule',
};

export const RemovalReasonsChart = ({ reasons, totalRemoved }: Props) => {
  const data = Object.entries(reasons)
    .map(([key, count]) => ({
      name: LABELS[key] || key,
      count,
      pct: Math.round((count / totalRemoved) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <Card className="border-border/30 bg-card/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-display">Removal Reasons ({totalRemoved} trades removed)</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 100, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={95} />
              <Tooltip
                contentStyle={{ fontSize: 11, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                formatter={(v: number, _n: string, p: any) => [`${v} (${p.payload.pct}%)`, 'Trades']}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
