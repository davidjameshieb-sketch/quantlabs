// SnapshotPanel — Wrapper that shows loading/stale/error states for snapshot-driven panels
import { ReactNode } from 'react';
import { RefreshCw, AlertTriangle, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SnapshotResult } from '@/hooks/useSnapshot';

interface SnapshotPanelProps {
  snapshot: SnapshotResult;
  children: (data: any) => ReactNode;
  title?: string;
  /** Show compact inline status (default) or full card skeleton */
  variant?: 'card' | 'inline';
}

function formatAge(asOf: Date | null): string {
  if (!asOf) return 'Never';
  const seconds = Math.floor((Date.now() - asOf.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export const SnapshotPanel = ({ snapshot, children, title, variant = 'card' }: SnapshotPanelProps) => {
  const { data, loading, stale, error, asOf, status, refresh } = snapshot;

  // Full loading (no cached data)
  if (loading && !data) {
    return (
      <Card className="border-border/30 bg-card/50">
        <CardContent className="p-6 space-y-3">
          {title && <Skeleton className="h-6 w-48" />}
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Error with no cached data
  if (status === 'error' && !data) {
    return (
      <Card className="border-destructive/30 bg-card/50">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>{error || 'Failed to load snapshot'}</span>
            </div>
            <Button variant="outline" size="sm" onClick={refresh} className="text-xs h-7 gap-1">
              <RefreshCw className="w-3 h-3" />Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty data
  if (status === 'empty' || (data && (data as any).noData)) {
    return (
      <Card className="border-border/30 bg-card/50">
        <CardContent className="p-6 text-center text-muted-foreground text-sm">
          No data available. Accumulate trades then click Recompute.
          <div className="mt-2">
            <Button variant="outline" size="sm" onClick={refresh} className="text-xs h-7 gap-1">
              <RefreshCw className="w-3 h-3" />Compute
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Data available (possibly stale or computing)
  return (
    <div className="space-y-0">
      {/* Status bar */}
      <div className="flex items-center justify-between px-1 py-1">
        <div className="flex items-center gap-2">
          {stale && (
            <Badge variant="outline" className="text-[9px] border-neural-orange/40 text-neural-orange gap-1">
              <Clock className="w-2.5 h-2.5" />Stale
            </Badge>
          )}
          {status === 'computing' && (
            <Badge variant="outline" className="text-[9px] border-primary/40 text-primary gap-1 animate-pulse">
              <RefreshCw className="w-2.5 h-2.5 animate-spin" />Updating…
            </Badge>
          )}
          {asOf && (
            <span className="text-[9px] text-muted-foreground">
              Updated {formatAge(asOf)}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={refresh}
          className="text-[10px] h-6 px-2 gap-1 text-muted-foreground hover:text-foreground"
          disabled={status === 'computing'}
        >
          <RefreshCw className={`w-3 h-3 ${status === 'computing' ? 'animate-spin' : ''}`} />
          Recompute
        </Button>
      </div>

      {/* Content */}
      {children(data)}
    </div>
  );
};
