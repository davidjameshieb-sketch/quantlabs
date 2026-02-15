// Adversarial Slippage Guard — Fill Quality Heatmap
import { motion } from 'framer-motion';
import { ShieldAlert, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { SlippageProfile } from '@/hooks/useIntelligenceState';

interface Props {
  profiles: SlippageProfile[];
}

export function AdversarialSlippagePanel({ profiles }: Props) {
  if (!profiles?.length) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldAlert className="w-4 h-4 text-[hsl(var(--neural-red))]" />
          <h3 className="text-sm font-bold">Slippage Guard</h3>
          <Badge variant="outline" className="text-[8px]">NO DATA</Badge>
        </div>
      </div>
    );
  }

  const sorted = [...profiles].sort((a, b) => b.adverseFillRate - a.adverseFillRate);
  const suspect = profiles.filter(p => p.patternDetected === 'SUSPECT').length;
  const adversarial = profiles.filter(p => p.patternDetected === 'ADVERSARIAL').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/30 bg-card/40 p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-[hsl(var(--neural-red))]" />
          <h3 className="text-sm font-bold">Execution Quality</h3>
          <Badge className={`text-[8px] ${
            adversarial > 0
              ? 'bg-[hsl(var(--neural-red))]/20 text-[hsl(var(--neural-red))]'
              : suspect > 0
              ? 'bg-[hsl(var(--neural-orange))]/20 text-[hsl(var(--neural-orange))]'
              : 'bg-[hsl(var(--neural-green))]/20 text-[hsl(var(--neural-green))]'
          }`}>
            {adversarial > 0 ? `${adversarial} ADVERSARIAL` : suspect > 0 ? `${suspect} SUSPECT` : 'ALL CLEAN'}
          </Badge>
        </div>
      </div>

      <div className="space-y-1.5">
        {sorted.map(p => {
          const Icon = p.patternDetected === 'ADVERSARIAL' ? XCircle
            : p.patternDetected === 'SUSPECT' ? AlertTriangle
            : CheckCircle;
          const iconColor = p.patternDetected === 'ADVERSARIAL' ? 'text-[hsl(var(--neural-red))]'
            : p.patternDetected === 'SUSPECT' ? 'text-[hsl(var(--neural-orange))]'
            : 'text-[hsl(var(--neural-green))]';

          return (
            <div key={p.instrument} className="flex items-center gap-2 p-2 rounded-lg bg-background/30 border border-border/20">
              <Icon className={`w-3.5 h-3.5 ${iconColor} shrink-0`} />
              <span className="text-[10px] font-mono font-bold w-16">{p.instrument.replace('_','/')}</span>

              {/* Adverse fill rate bar */}
              <div className="flex-1 h-2 rounded-full bg-muted/20 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, p.adverseFillRate * 100)}%`,
                    background: p.adverseFillRate > 0.5 ? 'hsl(var(--neural-red))'
                      : p.adverseFillRate > 0.25 ? 'hsl(var(--neural-orange))'
                      : 'hsl(var(--neural-green))',
                  }}
                />
              </div>

              <span className="text-[9px] font-mono text-muted-foreground w-10 text-right">
                {(p.adverseFillRate * 100).toFixed(0)}%
              </span>
              <span className="text-[8px] text-muted-foreground w-14 text-right">
                {p.avgSlippage.toFixed(2)}p avg
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
