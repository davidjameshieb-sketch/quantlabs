import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Rocket, ShieldCheck, CheckCircle2, XCircle, AlertTriangle,
  TrendingUp, Target, Activity, Layers, BarChart3
} from 'lucide-react';
import { useEdgeGoLive } from '@/hooks/useEdgeGoLive';
import type { GoLiveCheckItem, GoLiveMetrics, MaturityLevel, RollingStabilityPoint } from '@/lib/forex/edgeGoLiveEngine';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend
} from 'recharts';

// ─── Level Config ─────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<number, { label: string; color: string; icon: typeof Rocket; desc: string }> = {
  0: { label: 'Discovery', color: 'text-muted-foreground', icon: Target, desc: 'Collecting shadow data — normal trading' },
  1: { label: 'Shadow Verified', color: 'text-blue-400', icon: ShieldCheck, desc: 'Shadow edge confirmed — still normal trading' },
  2: { label: 'Edge Weighting', color: 'text-yellow-400', icon: TrendingUp, desc: 'Edge trades sized 1.35× / non-edge 0.65×' },
  3: { label: 'Conditional Edge-Only', color: 'text-orange-400', icon: Layers, desc: 'Only edge environments OR composite ≥ 0.85' },
  4: { label: 'Full Edge-Only', color: 'text-neural-green', icon: Rocket, desc: 'Execute ONLY in verified edge environments' },
};

// ─── Sub-components ──────────────────────────────────────────────────

function LevelIndicator({ level }: { level: MaturityLevel }) {
  const cfg = LEVEL_CONFIG[level];
  const Icon = cfg.icon;
  return (
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg bg-card border border-border/40 ${cfg.color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold font-display ${cfg.color}`}>Level {level}</span>
          <Badge variant="outline" className={`text-[9px] ${cfg.color} border-current`}>
            {cfg.label}
          </Badge>
        </div>
        <p className="text-[10px] text-muted-foreground">{cfg.desc}</p>
      </div>
    </div>
  );
}

function LadderProgress({ level }: { level: MaturityLevel }) {
  const colors = [
    'bg-muted-foreground',
    'bg-primary/70',
    'bg-primary',
    'bg-accent',
    'bg-neural-green',
  ];
  return (
    <div className="flex items-center gap-1 w-full">
      {[0, 1, 2, 3, 4].map(l => (
        <div
          key={l}
          className={`h-2 flex-1 rounded-full transition-colors ${l <= level ? colors[l] : 'bg-muted/30'}`}
        />
      ))}
    </div>
  );
}

function ChecklistSection({ checks, targetLevel }: { checks: GoLiveCheckItem[]; targetLevel: MaturityLevel }) {
  const levelChecks = checks.filter(c => c.requiredForLevel === targetLevel);
  if (levelChecks.length === 0) return null;
  const cfg = LEVEL_CONFIG[targetLevel];

  return (
    <div className="space-y-1.5">
      <span className={`text-[10px] font-semibold ${cfg.color}`}>Level {targetLevel} — {cfg.label}</span>
      {levelChecks.map(c => (
        <div key={c.id} className="flex items-center gap-2 text-[10px]">
          {c.passed
            ? <CheckCircle2 className="w-3.5 h-3.5 text-neural-green flex-shrink-0" />
            : <XCircle className="w-3.5 h-3.5 text-neural-red flex-shrink-0" />}
          <span className={c.passed ? 'text-muted-foreground' : 'text-foreground'}>{c.label}</span>
          <span className="text-[8px] text-muted-foreground ml-auto font-mono">{c.detail}</span>
        </div>
      ))}
    </div>
  );
}

function StabilityChart({ data }: { data: RollingStabilityPoint[] }) {
  if (data.length < 2) {
    return (
      <div className="text-[10px] text-muted-foreground text-center py-4">
        Insufficient rolling data for stability chart
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.2)" />
        <XAxis dataKey="dayLabel" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} />
        <YAxis tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} domain={[0, 'auto']} />
        <Tooltip
          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 10 }}
        />
        <Legend wrapperStyle={{ fontSize: 9 }} />
        <ReferenceLine y={1.2} stroke="hsl(var(--destructive))" strokeDasharray="3 3" label="" />
        <Line type="monotone" dataKey="expectancyRatio" name="Exp Ratio" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="ddRatio" name="DD Ratio" stroke="#f97316" strokeWidth={1.5} dot={false} />
        <Line type="monotone" dataKey="predictiveness" name="Predict." stroke="#22c55e" strokeWidth={1.5} dot={false} />
        <Line type="monotone" dataKey="clusterStability" name="Cluster" stroke="#8b5cf6" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function MetricsGrid({ metrics }: { metrics: GoLiveMetrics }) {
  const items = [
    { label: 'Shadow Edge Trades', value: metrics.shadowEdgeTrades, fmt: String(metrics.shadowEdgeTrades) },
    { label: 'Baseline Trades', value: metrics.baselineTrades, fmt: String(metrics.baselineTrades) },
    { label: 'Edge Expectancy', value: metrics.shadowEdgeExpectancy, fmt: `${metrics.shadowEdgeExpectancy > 0 ? '+' : ''}${metrics.shadowEdgeExpectancy}p` },
    { label: 'Base Expectancy', value: metrics.baselineExpectancy, fmt: `${metrics.baselineExpectancy > 0 ? '+' : ''}${metrics.baselineExpectancy}p` },
    { label: 'Exp. Ratio', value: metrics.expectancyRatio, fmt: `${metrics.expectancyRatio}×` },
    { label: 'DD Ratio', value: metrics.ddRatio, fmt: `${metrics.ddRatio}` },
    { label: 'Predictiveness', value: metrics.compositePredictivenessScore, fmt: `${metrics.compositePredictivenessScore}` },
    { label: 'Cluster Stability', value: metrics.clusterStabilityScore, fmt: `${metrics.clusterStabilityScore}` },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map(item => (
        <div key={item.label} className="bg-muted/20 rounded-md p-2 text-center">
          <div className="text-[8px] text-muted-foreground">{item.label}</div>
          <div className="text-xs font-mono font-bold">{item.fmt}</div>
        </div>
      ))}
    </div>
  );
}

function CoverageRow({ label, coverage }: { label: string; coverage: Record<string, number> }) {
  return (
    <div className="space-y-1">
      <span className="text-[9px] text-muted-foreground font-semibold">{label}</span>
      <div className="flex gap-1.5 flex-wrap">
        {Object.entries(coverage).map(([k, v]) => (
          <Badge
            key={k}
            variant={v >= 15 ? 'default' : 'outline'}
            className={`text-[8px] px-1.5 ${v >= 15 ? '' : 'opacity-50'}`}
          >
            {k}: {v}
          </Badge>
        ))}
      </div>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────

export function EdgeGoLivePanel() {
  const { result, loading, error } = useEdgeGoLive();

  if (loading) {
    return (
      <Card className="bg-card/60 border-border/30">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Loading edge go-live data…
        </CardContent>
      </Card>
    );
  }

  if (error || !result) {
    return (
      <Card className="bg-card/60 border-border/30">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {error || 'No trade data available for Edge Go-Live analysis'}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card className="bg-card/60 border-border/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Rocket className="w-4 h-4 text-primary" />
            Edge Go-Live Ladder
            {result.downgradeTriggered && (
              <Badge variant="destructive" className="text-[8px] ml-auto">
                <AlertTriangle className="w-3 h-3 mr-0.5" />
                DOWNGRADE
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <LevelIndicator level={result.maturityLevel} />
          <LadderProgress level={result.maturityLevel} />

          {result.sizingRule && (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-2 text-[10px]">
              <span className="font-semibold text-yellow-400">Sizing Rule Active: </span>
              Edge trades ×{result.sizingRule.edgeMultiplier} / Non-edge ×{result.sizingRule.nonEdgeMultiplier}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Metrics */}
      <Card className="bg-card/60 border-border/30">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            Shadow vs Baseline Metrics
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <MetricsGrid metrics={result.metrics} />
        </CardContent>
      </Card>

      {/* Coverage */}
      <Card className="bg-card/60 border-border/30">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            Coverage & Parity
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-2">
          <CoverageRow label="Session Coverage" coverage={result.metrics.sessionCoverage as unknown as Record<string, number>} />
          <CoverageRow label="Regime Coverage" coverage={result.metrics.regimeCoverage as unknown as Record<string, number>} />
          <CoverageRow label="Direction Parity" coverage={result.metrics.directionParity as unknown as Record<string, number>} />
        </CardContent>
      </Card>

      {/* Checklist */}
      <Card className="bg-card/60 border-border/30">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Go-Live Checklist
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-3">
          {[1, 2, 3, 4].map(l => (
            <ChecklistSection key={l} checks={result.checks} targetLevel={l as MaturityLevel} />
          ))}
        </CardContent>
      </Card>

      {/* Why not edge-only yet? */}
      {result.passFailReasons.length > 0 && (
        <Card className="bg-card/60 border-border/30 border-neural-red/20">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs text-neural-red flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Why Not {LEVEL_CONFIG[Math.min(4, result.maturityLevel + 1) as MaturityLevel].label} Yet?
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="space-y-1">
              {result.passFailReasons.map((reason, i) => (
                <div key={i} className="text-[10px] text-muted-foreground">{reason}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rolling Stability */}
      <Card className="bg-card/60 border-border/30">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-xs flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            7-Day Rolling Stability
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <StabilityChart data={result.rollingStability} />
        </CardContent>
      </Card>
    </div>
  );
}
