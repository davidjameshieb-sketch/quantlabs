// Global Data Status Bar — shows snapshot health across all dashboard types
import { useSnapshot } from '@/hooks/useSnapshot';
import { Badge } from '@/components/ui/badge';
import { Activity, CheckCircle, AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const SNAPSHOT_TYPES = [
  { type: 'forex_performance_overview', label: 'Performance' },
  { type: 'edge_health_summary', label: 'Edge Health' },
  { type: 'agent_scorecards', label: 'Agents' },
  { type: 'tier_b_promotion_analysis', label: 'Tier-B' },
];

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

export const SnapshotStatusBar = () => {
  const navSnapshot = useSnapshot({
    snapshotType: 'dashboard_nav_status',
    scopeKey: 'global',
    ttlMs: 120_000,
    autoCompute: true,
  });

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-card/50 border border-border/30">
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
