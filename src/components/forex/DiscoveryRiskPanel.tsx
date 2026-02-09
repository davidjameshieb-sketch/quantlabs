// Discovery Risk Mode Dashboard Panel
// Visualizes environment classification, blocked trades, and capital efficiency

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Shield, ShieldAlert, ShieldCheck, TrendingUp, Ban, AlertTriangle, Zap, Target } from 'lucide-react';
import {
  getDiscoveryRiskConfig,
  setDiscoveryRiskConfig,
  getDiscoveryRiskStats,
  classifyTradeEnvironment,
  applyDiscoveryRiskAllocation,
  type DiscoveryRiskStats,
  type RiskLabel,
} from '@/lib/forex/discoveryRiskEngine';
import { setAdaptiveEdgeEnabled, getAdaptiveEdgeEnabled } from '@/lib/forex/environmentSignature';
import type { ForexTradeEntry } from '@/lib/forex/forexTypes';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

interface DiscoveryRiskPanelProps {
  trades: ForexTradeEntry[];
}

const RISK_LABEL_COLORS: Record<RiskLabel, string> = {
  BLOCKED: 'hsl(var(--neural-red))',
  REDUCED: 'hsl(var(--neural-orange))',
  NORMAL: 'hsl(var(--muted-foreground))',
  EDGE_BOOST: 'hsl(var(--neural-green))',
};

const RISK_LABEL_BADGES: Record<RiskLabel, { variant: 'default' | 'destructive' | 'outline' | 'secondary'; icon: typeof Shield }> = {
  BLOCKED: { variant: 'destructive', icon: Ban },
  REDUCED: { variant: 'outline', icon: AlertTriangle },
  NORMAL: { variant: 'secondary', icon: Shield },
  EDGE_BOOST: { variant: 'default', icon: Zap },
};

export function DiscoveryRiskPanel({ trades }: DiscoveryRiskPanelProps) {
  const config = getDiscoveryRiskConfig();

  // Simulate classification across all executed trades
  const analysis = useMemo(() => {
    const executed = trades.filter(t => t.outcome !== 'avoided');
    const stats: Record<RiskLabel, { count: number; pnl: number; wins: number }> = {
      BLOCKED: { count: 0, pnl: 0, wins: 0 },
      REDUCED: { count: 0, pnl: 0, wins: 0 },
      NORMAL: { count: 0, pnl: 0, wins: 0 },
      EDGE_BOOST: { count: 0, pnl: 0, wins: 0 },
    };

    const blockedEnvs: Record<string, number> = {};
    const destructiveReasons: Record<string, number> = {};

    for (const t of executed) {
      const session = t.spreadCondition === 'tight' ? 'ny-overlap'
        : t.spreadCondition === 'wide' ? 'asian' : 'london-open';
      const regime = t.regime === 'trending' ? 'expansion'
        : t.regime === 'ranging' ? 'compression'
        : t.regime === 'high-volatility' ? 'ignition' : 'exhaustion';

      const classification = classifyTradeEnvironment(
        t.currencyPair, session, regime, t.direction,
        t.confidenceScore / 100, t.frictionCost * 10000, t.primaryAgent,
      );

      const allocation = applyDiscoveryRiskAllocation(classification);
      const label = allocation.riskLabel;
      stats[label].count++;
      stats[label].pnl += t.pnlPercent;
      if (t.pnlPercent > 0) stats[label].wins++;

      if (allocation.blocked) {
        blockedEnvs[classification.environmentLabel] = (blockedEnvs[classification.environmentLabel] || 0) + 1;
        if (classification.matchedDestructiveRule) {
          destructiveReasons[classification.matchedDestructiveRule] = (destructiveReasons[classification.matchedDestructiveRule] || 0) + 1;
        }
      }
    }

    // Simulated P&L comparison
    const baselinePnl = executed.reduce((s, t) => s + t.pnlPercent, 0);
    const filteredPnl = stats.EDGE_BOOST.pnl + stats.REDUCED.pnl + stats.NORMAL.pnl;
    const blockedPnl = stats.BLOCKED.pnl;

    const topBlockedEnvs = Object.entries(blockedEnvs)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);

    const topDestructiveReasons = Object.entries(destructiveReasons)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6);

    return {
      stats,
      baselinePnl,
      filteredPnl,
      blockedPnl,
      totalExecuted: executed.length,
      topBlockedEnvs,
      topDestructiveReasons,
      capitalEfficiency: stats.BLOCKED.count > 0 && stats.BLOCKED.pnl < 0
        ? `+${Math.abs(stats.BLOCKED.pnl).toFixed(2)}%`
        : '0%',
    };
  }, [trades]);

  const pieData = Object.entries(analysis.stats)
    .filter(([, v]) => v.count > 0)
    .map(([label, v]) => ({
      name: label,
      value: v.count,
      fill: RISK_LABEL_COLORS[label as RiskLabel],
    }));

  const reasonBarData = analysis.topDestructiveReasons.map(([reason, count]) => ({
    reason: reason.length > 20 ? reason.slice(0, 18) + '…' : reason,
    count,
  }));

  const pnlByLabel = Object.entries(analysis.stats)
    .filter(([, v]) => v.count > 0)
    .map(([label, v]) => ({
      label,
      pnl: Number(v.pnl.toFixed(3)),
      winRate: v.count > 0 ? Math.round((v.wins / v.count) * 100) : 0,
      trades: v.count,
      fill: RISK_LABEL_COLORS[label as RiskLabel],
    }));

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-border/30 bg-card/60 backdrop-blur">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" />
              <CardTitle className="text-sm font-display">Discovery Risk Mode</CardTitle>
              <Badge variant={config.enabled ? 'default' : 'outline'} className="text-[9px]">
                {config.enabled ? 'ACTIVE' : 'DISABLED'}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Enable</span>
              <Switch
                checked={config.enabled}
                onCheckedChange={(checked) => {
                  setDiscoveryRiskConfig({ enabled: checked });
                  setAdaptiveEdgeEnabled(checked);
                }}
              />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Risk allocation overlay — blocks destructive environments, boosts edge candidates, reduces baseline exposure.
          </p>
        </CardHeader>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          { label: 'BLOCKED', icon: Ban, color: 'text-neural-red', bgColor: 'bg-neural-red/10' },
          { label: 'EDGE_BOOST', icon: Zap, color: 'text-neural-green', bgColor: 'bg-neural-green/10' },
          { label: 'REDUCED', icon: AlertTriangle, color: 'text-neural-orange', bgColor: 'bg-neural-orange/10' },
          { label: 'NORMAL', icon: Shield, color: 'text-muted-foreground', bgColor: 'bg-muted/30' },
        ] as const).map(({ label, icon: Icon, color, bgColor }) => {
          const s = analysis.stats[label];
          const pct = analysis.totalExecuted > 0
            ? Math.round((s.count / analysis.totalExecuted) * 100)
            : 0;
          return (
            <Card key={label} className={`border-border/30 ${bgColor}`}>
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                  <span className="text-[10px] font-medium">{label.replace('_', ' ')}</span>
                </div>
                <div className="text-lg font-bold">{s.count}</div>
                <div className="text-[9px] text-muted-foreground">{pct}% · P&L: {s.pnl >= 0 ? '+' : ''}{s.pnl.toFixed(2)}%</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Capital Efficiency Summary */}
      <Card className="border-border/30 bg-card/60">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-primary" />
            <span className="text-xs font-display font-bold">Capital Efficiency Impact</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-[9px] text-muted-foreground mb-1">Baseline P&L</div>
              <div className={`text-sm font-bold ${analysis.baselinePnl >= 0 ? 'text-neural-green' : 'text-neural-red'}`}>
                {analysis.baselinePnl >= 0 ? '+' : ''}{analysis.baselinePnl.toFixed(2)}%
              </div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground mb-1">Blocked P&L (saved)</div>
              <div className={`text-sm font-bold ${analysis.blockedPnl <= 0 ? 'text-neural-green' : 'text-neural-red'}`}>
                {analysis.blockedPnl <= 0 ? `+${Math.abs(analysis.blockedPnl).toFixed(2)}` : `-${analysis.blockedPnl.toFixed(2)}`}%
              </div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground mb-1">Filtered P&L</div>
              <div className={`text-sm font-bold ${analysis.filteredPnl >= 0 ? 'text-neural-green' : 'text-neural-red'}`}>
                {analysis.filteredPnl >= 0 ? '+' : ''}{analysis.filteredPnl.toFixed(2)}%
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* P&L by Risk Label */}
        <Card className="border-border/30 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-display">P&L by Risk Label</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={pnlByLabel}>
                <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip
                  contentStyle={{ fontSize: 10, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  formatter={(value: number, name: string) => [
                    `${value >= 0 ? '+' : ''}${value.toFixed(3)}%`,
                    name === 'pnl' ? 'P&L' : name,
                  ]}
                />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                  {pnlByLabel.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Blocking Reasons */}
        <Card className="border-border/30 bg-card/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-display">Top Block Reasons</CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {reasonBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={reasonBarData} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 9 }} />
                  <YAxis dataKey="reason" type="category" tick={{ fontSize: 8 }} width={100} />
                  <Tooltip contentStyle={{ fontSize: 10, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} />
                  <Bar dataKey="count" fill="hsl(var(--neural-red))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[180px] text-[10px] text-muted-foreground">
                No blocked trades
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edge vs Baseline Performance */}
      <Card className="border-border/30 bg-card/60">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-neural-green" />
            <CardTitle className="text-xs font-display">Edge Candidate vs Baseline Performance</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {pnlByLabel.map(({ label, pnl, winRate, trades: count }) => (
              <div key={label} className="text-center p-2 rounded bg-muted/20">
                <div className="text-[9px] text-muted-foreground mb-1">{label.replace('_', ' ')}</div>
                <div className={`text-sm font-bold ${pnl >= 0 ? 'text-neural-green' : 'text-neural-red'}`}>
                  {pnl >= 0 ? '+' : ''}{pnl.toFixed(3)}%
                </div>
                <div className="text-[9px] text-muted-foreground mt-0.5">
                  {count} trades · {winRate}% WR
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Config */}
      <Card className="border-border/30 bg-card/60">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <CardTitle className="text-xs font-display">Configuration</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px]">
            <div>
              <span className="text-muted-foreground">Edge Boost</span>
              <div className="font-bold">{config.edgeBoostMultiplier}×</div>
            </div>
            <div>
              <span className="text-muted-foreground">Baseline Reduction</span>
              <div className="font-bold">{config.baselineReductionMultiplier}×</div>
            </div>
            <div>
              <span className="text-muted-foreground">Spread Block</span>
              <div className="font-bold">{config.spreadBlockThreshold} pip</div>
            </div>
            <div>
              <span className="text-muted-foreground">Ignition Min Composite</span>
              <div className="font-bold">{config.ignitionMinComposite}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
