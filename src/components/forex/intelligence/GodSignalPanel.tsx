// God Signal + Hawkometer combined panel
import { motion } from 'framer-motion';
import { Crown, Thermometer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Props {
  godSignal: Record<string, unknown> | null;
  hawkometer: Record<string, unknown> | null;
}

export function GodSignalPanel({ godSignal, hawkometer }: Props) {
  const godPairs = godSignal ? Object.entries(godSignal).filter(([k]) => k.includes('/') || k.includes('_')) : [];
  const hawkBanks = hawkometer ? Object.entries(hawkometer).filter(([k]) => 
    ['fed', 'ecb', 'boj', 'boe', 'rba'].some(b => k.toLowerCase().includes(b))
  ) : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/30 bg-card/40 p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <Crown className="w-4 h-4 text-[hsl(var(--neural-orange))]" />
        <h3 className="text-sm font-bold">God Signal & Hawkometer</h3>
        <Badge variant="outline" className="text-[8px] border-[hsl(var(--neural-orange))]/40 text-[hsl(var(--neural-orange))]">
          INSTITUTIONAL
        </Badge>
      </div>

      {/* God Signal pairs */}
      <div>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1.5">Institutional Consensus</p>
        {godPairs.length > 0 ? (
          <div className="grid grid-cols-2 gap-1">
            {godPairs.slice(0, 8).map(([pair, data]: [string, any]) => {
              const bias = data?.consensus || data?.bias || 'NEUTRAL';
              const confidence = data?.confidence || data?.score || 0;
              const isLong = bias === 'LONG' || bias === 'BULLISH';
              const isShort = bias === 'SHORT' || bias === 'BEARISH';

              return (
                <div key={pair} className="flex items-center justify-between p-1.5 rounded bg-background/30 border border-border/10">
                  <span className="text-[9px] font-mono">{pair.replace('_','/')}</span>
                  <div className="flex items-center gap-1">
                    <Badge className={`text-[7px] px-1 py-0 ${
                      isLong ? 'bg-[hsl(var(--neural-green))]/20 text-[hsl(var(--neural-green))]'
                      : isShort ? 'bg-[hsl(var(--neural-red))]/20 text-[hsl(var(--neural-red))]'
                      : 'bg-muted/20 text-muted-foreground'
                    }`}>
                      {bias}
                    </Badge>
                    {confidence > 0 && (
                      <span className="text-[7px] text-muted-foreground">{Math.round(confidence)}%</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[9px] text-muted-foreground">Awaiting God Signal scan...</p>
        )}
      </div>

      {/* Hawkometer */}
      <div>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1.5">
          <Thermometer className="w-3 h-3 inline mr-1" />Central Bank Tone
        </p>
        {hawkBanks.length > 0 ? (
          <div className="space-y-1">
            {hawkBanks.map(([bank, data]: [string, any]) => {
              const score = data?.hawkishScore || data?.score || 50;
              const label = bank.replace(/_/g, ' ').toUpperCase();
              return (
                <div key={bank} className="flex items-center gap-2">
                  <span className="text-[9px] font-mono w-10">{label.slice(0, 4)}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted/20 overflow-hidden relative">
                    {/* Center line */}
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-muted-foreground/30" />
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${score}%`,
                        background: score > 60 ? 'hsl(var(--neural-red))'
                          : score > 40 ? 'hsl(var(--neural-orange))'
                          : 'hsl(var(--neural-green))',
                      }}
                    />
                  </div>
                  <span className="text-[8px] font-mono w-6 text-right">{Math.round(score)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[9px] text-muted-foreground">Awaiting Hawkometer scan...</p>
        )}
      </div>
    </motion.div>
  );
}
