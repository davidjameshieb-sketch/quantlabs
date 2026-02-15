// Fixing Volatility Alert Panel — London 4PM Fix Monitor
import { motion } from 'framer-motion';
import { Clock, Zap, AlertTriangle, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface FixProfile {
  avgTickVelocity: number;
  maxTickVelocity: number;
  recentTickVelocity: number;
  compressionRatio: number;
  isCompressed: boolean;
  isSpiking: boolean;
  directionPips: number;
  direction: string;
}

interface Props {
  data: {
    fixPhase: string;
    alertLevel: string;
    compressedPairs: string[];
    spikingPairs: string[];
    profiles: Record<string, FixProfile>;
    isFixRelevant: boolean;
  } | null;
}

export function FixingVolatilityPanel({ data }: Props) {
  if (!data) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-[hsl(var(--neural-orange))]" />
          <h3 className="text-sm font-bold">London 4PM Fix</h3>
          <Badge variant="outline" className="text-[8px]">NO DATA</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground">Run fixing-volatility-alert to populate</p>
      </div>
    );
  }

  const phaseColors: Record<string, string> = {
    FIX_ACTIVE: 'bg-[hsl(var(--neural-red))]/20 text-[hsl(var(--neural-red))] border-[hsl(var(--neural-red))]/30',
    PRE_FIX: 'bg-[hsl(var(--neural-orange))]/20 text-[hsl(var(--neural-orange))] border-[hsl(var(--neural-orange))]/30',
    POST_FIX: 'bg-[hsl(var(--neural-cyan))]/20 text-[hsl(var(--neural-cyan))] border-[hsl(var(--neural-cyan))]/30',
    inactive: 'bg-muted/20 text-muted-foreground border-border/30',
  };

  const profiles = Object.entries(data.profiles || {});

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/30 bg-card/40 p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[hsl(var(--neural-orange))]" />
          <h3 className="text-sm font-bold">London 4PM Fix</h3>
          <Badge className={`text-[8px] ${phaseColors[data.fixPhase] || phaseColors.inactive}`}>
            {data.fixPhase === 'inactive' ? 'INACTIVE' : data.fixPhase.replace('_', ' ')}
          </Badge>
        </div>
        {data.alertLevel !== 'none' && (
          <Badge className={`text-[7px] ${
            data.alertLevel === 'critical' ? 'bg-[hsl(var(--neural-red))]/20 text-[hsl(var(--neural-red))]'
            : data.alertLevel === 'high' ? 'bg-[hsl(var(--neural-orange))]/20 text-[hsl(var(--neural-orange))]'
            : 'bg-muted/20 text-muted-foreground'
          }`}>
            ALERT: {data.alertLevel.toUpperCase()}
          </Badge>
        )}
      </div>

      {/* Compression / Spike alerts */}
      {(data.compressedPairs.length > 0 || data.spikingPairs.length > 0) && (
        <div className="space-y-1">
          {data.compressedPairs.length > 0 && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-[hsl(var(--neural-orange))]/5 border border-[hsl(var(--neural-orange))]/20">
              <Shield className="w-3 h-3 text-[hsl(var(--neural-orange))]" />
              <span className="text-[9px] text-[hsl(var(--neural-orange))]">
                Compressed: {data.compressedPairs.join(', ')} — coiling before fix
              </span>
            </div>
          )}
          {data.spikingPairs.length > 0 && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-[hsl(var(--neural-red))]/5 border border-[hsl(var(--neural-red))]/20">
              <Zap className="w-3 h-3 text-[hsl(var(--neural-red))]" />
              <span className="text-[9px] text-[hsl(var(--neural-red))]">
                Spiking: {data.spikingPairs.join(', ')} — fix explosion detected
              </span>
            </div>
          )}
        </div>
      )}

      {/* Tick velocity per pair */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {profiles.map(([pair, p]) => {
          const velColor = p.isSpiking ? 'text-[hsl(var(--neural-red))]'
            : p.isCompressed ? 'text-[hsl(var(--neural-orange))]'
            : 'text-[hsl(var(--neural-green))]';
          const dirIcon = p.direction === 'bullish' ? '↑' : p.direction === 'bearish' ? '↓' : '→';

          return (
            <div key={pair} className="p-2 rounded-lg bg-background/30 border border-border/20 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono font-bold">{pair.replace('_', '/')}</span>
                <span className={`text-[9px] font-mono ${velColor}`}>
                  {p.recentTickVelocity.toFixed(1)} p/5s
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-muted/30 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (p.recentTickVelocity / (p.maxTickVelocity || 1)) * 100)}%`,
                    background: p.isSpiking ? 'hsl(var(--neural-red))'
                      : p.isCompressed ? 'hsl(var(--neural-orange))'
                      : 'hsl(var(--neural-green))',
                  }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[7px] text-muted-foreground">
                  Compression: {p.compressionRatio.toFixed(1)}x
                </span>
                <span className={`text-[8px] font-mono ${
                  p.direction === 'bullish' ? 'text-[hsl(var(--neural-green))]'
                  : p.direction === 'bearish' ? 'text-[hsl(var(--neural-red))]'
                  : 'text-muted-foreground'
                }`}>
                  {dirIcon} {p.directionPips > 0 ? '+' : ''}{p.directionPips}p
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
