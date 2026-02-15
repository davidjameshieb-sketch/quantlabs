// Global Data Status Bar — shows snapshot health + pillar coverage across all dashboard types
import { useSnapshot } from '@/hooks/useSnapshot';
import { useSovereignDirectives } from '@/hooks/useSovereignDirectives';
import { Badge } from '@/components/ui/badge';
import { Activity, RefreshCw, Shield, Swords, Crosshair, Dna, Microscope } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SNAPSHOT_TYPES = [
  { type: 'forex_performance_overview', label: 'Performance' },
  { type: 'edge_health_summary', label: 'Edge Health' },
  { type: 'agent_scorecards', label: 'Agents' },
  { type: 'tier_b_promotion_analysis', label: 'Tier-B' },
];

const PILLAR_ICONS: Record<string, React.ElementType> = {
  P0: Shield, P1: Swords, P2: Crosshair, P3: Dna, P4: Microscope,
};

const PILLAR_COLORS: Record<string, string> = {
  P0: 'bg-red-500', P1: 'bg-orange-500', P2: 'bg-cyan-500',
  P3: 'bg-purple-500', P4: 'bg-amber-500',
};

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ready: 'bg-neural-green',
    stale: 'bg-neural-orange',
    computing: 'bg-primary animate-pulse',
    error: 'bg-neural-red',
    loading: 'bg-muted-foreground animate-pulse',
    empty: 'bg-muted-foreground',
  };
  return <span className={`w-1.5 h-1.5 rounded-full inline-block ${colors[status] || colors.empty}`} />;
}

function MiniPillarBar({ pillar, l0Count, total }: { pillar: string; l0Count: number; total: number }) {
  const pct = total > 0 ? Math.round((l0Count / total) * 100) : 0;
  const bgColor = PILLAR_COLORS[pillar] || 'bg-primary';

  return (
    <div className="flex items-center gap-1" title={`${pillar}: ${l0Count}/${total} L0 (${pct}%)`}>
      <span className="text-[8px] font-mono text-muted-foreground">{pillar}</span>
      <div className="h-1 w-6 rounded-full bg-muted/30 overflow-hidden">
        <div className={`h-full rounded-full ${bgColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export const SnapshotStatusBar = () => {
  const navSnapshot = useSnapshot({
    snapshotType: 'dashboard_nav_status',
    scopeKey: 'global',
    ttlMs: 120_000,
    autoCompute: true,
  });

  const { pillars, totalCount, loading: pillarsLoading } = useSovereignDirectives(60_000);

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-card/50 border border-border/30 flex-wrap">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Activity className="w-3 h-3" />
        <span className="font-medium">Data Status</span>
      </div>
      {SNAPSHOT_TYPES.map((st) => (
        <div key={st.type} className="flex items-center gap-1 text-[9px] text-muted-foreground">
          <StatusDot status={navSnapshot.data?.pages?.[`${st.type}:all:30`]?.status || 'empty'} />
          <span>{st.label}</span>
        </div>
      ))}

      {/* Pillar health mini-bars */}
      {!pillarsLoading && totalCount > 0 && (
        <>
          <div className="w-px h-3 bg-border/50 mx-1" />
          <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
            <span className="font-medium">{totalCount}d</span>
          </div>
          {pillars.map(p => (
            <MiniPillarBar key={p.pillar} pillar={p.pillar} l0Count={p.l0Count} total={p.totalCount} />
          ))}
        </>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={navSnapshot.refresh}
        className="h-5 px-1.5 text-[9px] text-muted-foreground"
      >
        <RefreshCw className={`w-2.5 h-2.5 ${navSnapshot.status === 'computing' ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  );
};
