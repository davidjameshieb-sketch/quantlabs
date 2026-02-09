// Section 5: Predictive Validation — Does scoring predict performance?
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brain, CheckCircle, XCircle, HelpCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import type { PredictiveCheck, EdgeDiscoveryResult } from '@/lib/forex/edgeDiscoveryEngine';

interface Props {
  checks: PredictiveCheck[];
  verdict: EdgeDiscoveryResult['overallScoringVerdict'];
}

const verdictIcon = (v: PredictiveCheck['verdict']) => {
  if (v === 'PREDICTIVE') return <CheckCircle className="w-3.5 h-3.5 text-neural-green" />;
  if (v === 'NON-PREDICTIVE') return <XCircle className="w-3.5 h-3.5 text-neural-red" />;
  return <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />;
};

export const EdgePredictiveValidation = ({ checks, verdict }: Props) => (
  <div className="space-y-4">
    <Card className="border-border/30 bg-card/50">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            <span className="text-xs font-display font-bold">Scoring Predictive Validation</span>
          </div>
          <Badge
            variant="outline"
            className={`text-[9px] ${
              verdict === 'SCORING PREDICTIVE'
                ? 'border-neural-green/50 text-neural-green'
                : verdict === 'SCORING NON-PREDICTIVE'
                  ? 'border-neural-red/50 text-neural-red'
                  : ''
            }`}
          >
            {verdict}
          </Badge>
        </div>

        {checks.map((check, i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center gap-2">
              {verdictIcon(check.verdict)}
              <span className="text-xs font-bold">{check.dimension}</span>
              <span className="text-[10px] text-muted-foreground">
                Correlation: <span className="font-mono">{check.correlation}</span>
              </span>
              <Badge variant="outline" className="text-[8px]">{check.verdict}</Badge>
            </div>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={check.buckets} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 11 }}
                    formatter={(v: number) => [`${v}p`, 'Expectancy']}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  <Bar dataKey="expectancy" radius={[3, 3, 0, 0]}>
                    {check.buckets.map((b, j) => (
                      <Cell key={j} fill={b.expectancy > 0 ? 'hsl(var(--neural-green))' : 'hsl(var(--neural-red))'} fillOpacity={0.7} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  </div>
);
