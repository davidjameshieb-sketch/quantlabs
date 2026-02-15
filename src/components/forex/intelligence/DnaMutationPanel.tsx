// Recursive DNA Mutation Engine Panel
import { motion } from 'framer-motion';
import { Dna, Zap, ShieldCheck, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Mutation {
  rule: string;
  targetDna: string;
  agents: string[] | 'ALL';
  applied: boolean;
  reason: string;
}

interface Props {
  data: {
    mutationsEvaluated: number;
    mutationsApplied: number;
    mutations: Mutation[];
    feedsAvailable: string[];
    scanTime: string;
  } | null;
  activeDna: {
    activeDna: string;
    reason: string;
    appliedAt: string;
    expiresAt: string;
  } | null;
}

const DNA_COLORS: Record<string, string> = {
  PREDATORY_MEAN_REVERSION: 'neural-red',
  BREAKOUT_CAPTURE: 'neural-green',
  DEFENSIVE_SNIPER: 'neural-blue',
  HAWKISH_MOMENTUM: 'neural-orange',
  LIQUIDITY_HUNTER: 'neural-red',
};

const DNA_LABELS: Record<string, string> = {
  PREDATORY_MEAN_REVERSION: '🔴 Predatory Mean Reversion',
  BREAKOUT_CAPTURE: '🟢 Breakout Capture',
  DEFENSIVE_SNIPER: '🔵 Defensive Sniper',
  HAWKISH_MOMENTUM: '🟠 Hawkish Momentum',
  LIQUIDITY_HUNTER: '🔴 Liquidity Hunter',
};

export function DnaMutationPanel({ data, activeDna }: Props) {
  if (!data && !activeDna) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Dna className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">DNA Mutation Engine</h3>
          <Badge variant="outline" className="text-[8px]">STANDBY</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground">Waiting for recursive-dna-mutator to scan feeds</p>
      </div>
    );
  }

  const hasActiveMutation = !!activeDna?.activeDna;
  const activeColor = hasActiveMutation ? (DNA_COLORS[activeDna!.activeDna] || 'primary') : 'primary';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border p-4 space-y-3 ${
        hasActiveMutation
          ? `border-[hsl(var(--${activeColor}))]/50 bg-[hsl(var(--${activeColor}))]/5`
          : 'border-border/30 bg-card/40'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dna className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">DNA Mutation Engine</h3>
          {hasActiveMutation ? (
            <Badge className="text-[8px] bg-[hsl(var(--neural-orange))]/20 text-[hsl(var(--neural-orange))] border-[hsl(var(--neural-orange))]/30">
              <Zap className="w-2.5 h-2.5 mr-1" />MUTATED
            </Badge>
          ) : (
            <Badge className="text-[8px] bg-[hsl(var(--neural-green))]/20 text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/30">
              <ShieldCheck className="w-2.5 h-2.5 mr-1" />BASELINE
            </Badge>
          )}
        </div>
        {data && (
          <span className="text-[9px] text-muted-foreground">
            <RefreshCw className="w-3 h-3 inline mr-1" />
            {data.feedsAvailable.length} feeds
          </span>
        )}
      </div>

      {/* Active DNA */}
      {hasActiveMutation && activeDna && (
        <div className="rounded-lg bg-background/50 border border-primary/20 p-3 space-y-1">
          <p className="text-[10px] font-bold text-primary">
            {DNA_LABELS[activeDna.activeDna] || activeDna.activeDna}
          </p>
          <p className="text-[8px] text-muted-foreground leading-relaxed">{activeDna.reason}</p>
          <div className="flex gap-3 mt-1">
            <span className="text-[8px] text-muted-foreground">
              Applied: {new Date(activeDna.appliedAt).toLocaleTimeString()}
            </span>
            <span className="text-[8px] text-muted-foreground">
              Expires: {new Date(activeDna.expiresAt).toLocaleTimeString()}
            </span>
          </div>
        </div>
      )}

      {/* Scan stats */}
      {data && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-background/50 p-2 text-center">
            <p className="text-[16px] font-mono font-bold text-primary">{data.mutationsEvaluated}</p>
            <p className="text-[8px] text-muted-foreground">Rules Evaluated</p>
          </div>
          <div className="rounded-lg bg-background/50 p-2 text-center">
            <p className="text-[16px] font-mono font-bold text-[hsl(var(--neural-orange))]">{data.mutationsApplied}</p>
            <p className="text-[8px] text-muted-foreground">Mutations Applied</p>
          </div>
        </div>
      )}

      {/* Recent mutation log */}
      {data && data.mutations.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Mutation Log</p>
          {data.mutations.map((m, i) => (
            <div key={i} className={`flex items-center gap-2 p-1.5 rounded-lg ${
              m.applied ? 'bg-[hsl(var(--neural-orange))]/10' : 'bg-background/30'
            }`}>
              {m.applied ? (
                <Zap className="w-3 h-3 shrink-0 text-[hsl(var(--neural-orange))]" />
              ) : (
                <ShieldCheck className="w-3 h-3 shrink-0 text-muted-foreground" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-bold truncate">
                  {DNA_LABELS[m.targetDna] || m.targetDna}
                </p>
                <p className="text-[8px] text-muted-foreground truncate">{m.reason}</p>
              </div>
              <Badge className={`text-[6px] shrink-0 ${
                m.applied
                  ? 'bg-[hsl(var(--neural-orange))]/20 text-[hsl(var(--neural-orange))]'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {m.applied ? 'FIRED' : 'SKIPPED'}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
