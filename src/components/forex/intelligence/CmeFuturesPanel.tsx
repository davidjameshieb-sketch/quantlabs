// CME Futures Depth Proxy Panel — Institutional "God Order Book"
import { motion } from 'framer-motion';
import { Building2, TrendingUp, TrendingDown, Minus, Target, AlertTriangle, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface PairAnalysis {
  pair: string;
  cmeBias: string;
  volumeDelta: number;
  volumeSurge: number;
  totalVolume: number;
  priceMomentum: number;
  divergenceGate: {
    retailLongPct: number;
    cmeBias: string;
    divergenceStrength: number;
    sizingMultiplier: number;
    recommendedDirection: string;
    signal: string;
  } | null;
  icebergDetection: {
    type: string;
    volumeSurge: number;
    priceMomentum: number;
    signal: string;
  } | null;
  deltaCorrelation: {
    volumeDelta: number;
    priceLag: number;
    expectedDirection: string;
    signal: string;
  } | null;
}

interface Props {
  data: {
    pairsAnalyzed: number;
    divergenceAlerts: number;
    icebergAlerts: number;
    deltaCorrelationAlerts: number;
    pairs: PairAnalysis[];
    generatedAt: string;
  } | null;
}

function BiasIcon({ bias }: { bias: string }) {
  if (bias === 'LONG') return <TrendingUp className="w-3 h-3 text-[hsl(var(--neural-green))]" />;
  if (bias === 'SHORT') return <TrendingDown className="w-3 h-3 text-[hsl(var(--neural-red))]" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

function BiasColor(bias: string): string {
  if (bias === 'LONG') return 'neural-green';
  if (bias === 'SHORT') return 'neural-red';
  return 'primary';
}

export function CmeFuturesPanel({ data }: Props) {
  if (!data) {
    return (
      <div className="rounded-xl border border-border/30 bg-card/40 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">CME Futures Depth</h3>
          <Badge variant="outline" className="text-[8px]">OFFLINE</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground">Waiting for cme-futures-depth-proxy to scan Polygon data</p>
      </div>
    );
  }

  const hasAlerts = data.divergenceAlerts + data.icebergAlerts + data.deltaCorrelationAlerts > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border p-4 space-y-3 ${
        hasAlerts
          ? 'border-[hsl(var(--neural-orange))]/50 bg-[hsl(var(--neural-orange))]/5'
          : 'border-border/30 bg-card/40'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold">CME Futures Depth</h3>
          <Badge className={`text-[8px] ${
            hasAlerts
              ? 'bg-[hsl(var(--neural-orange))]/20 text-[hsl(var(--neural-orange))] border-[hsl(var(--neural-orange))]/30'
              : 'bg-[hsl(var(--neural-green))]/20 text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/30'
          }`}>
            {hasAlerts ? `${data.divergenceAlerts + data.icebergAlerts + data.deltaCorrelationAlerts} ALERTS` : 'ALL CLEAR'}
          </Badge>
        </div>
        <span className="text-[8px] text-muted-foreground">{data.pairsAnalyzed} pairs via Polygon</span>
      </div>

      {/* Alert counters */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-background/50 p-2 text-center">
          <p className={`text-[14px] font-mono font-bold ${data.divergenceAlerts > 0 ? 'text-[hsl(var(--neural-red))]' : 'text-muted-foreground'}`}>
            {data.divergenceAlerts}
          </p>
          <p className="text-[7px] text-muted-foreground">Divergence Gates</p>
        </div>
        <div className="rounded-lg bg-background/50 p-2 text-center">
          <p className={`text-[14px] font-mono font-bold ${data.icebergAlerts > 0 ? 'text-[hsl(var(--neural-blue))]' : 'text-muted-foreground'}`}>
            {data.icebergAlerts}
          </p>
          <p className="text-[7px] text-muted-foreground">Icebergs</p>
        </div>
        <div className="rounded-lg bg-background/50 p-2 text-center">
          <p className={`text-[14px] font-mono font-bold ${data.deltaCorrelationAlerts > 0 ? 'text-[hsl(var(--neural-orange))]' : 'text-muted-foreground'}`}>
            {data.deltaCorrelationAlerts}
          </p>
          <p className="text-[7px] text-muted-foreground">Delta-Corr</p>
        </div>
      </div>

      {/* Pair grid */}
      <div className="space-y-1">
        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Institutional Flow</p>
        {data.pairs.map((p) => (
          <div key={p.pair} className={`flex items-center gap-2 p-1.5 rounded-lg ${
            p.divergenceGate || p.icebergDetection || p.deltaCorrelation
              ? 'bg-[hsl(var(--neural-orange))]/10'
              : 'bg-background/30'
          }`}>
            <BiasIcon bias={p.cmeBias} />
            <span className="text-[10px] font-mono font-bold w-16">{p.pair.replace('_', '/')}</span>
            <span className={`text-[9px] font-bold text-[hsl(var(--${BiasColor(p.cmeBias)}))]`}>
              {p.cmeBias}
            </span>
            <span className="text-[8px] text-muted-foreground ml-auto">
              Δ{(p.volumeDelta * 100).toFixed(0)}% | {p.volumeSurge.toFixed(1)}x vol
            </span>
            {p.divergenceGate && (
              <Badge className="text-[6px] bg-[hsl(var(--neural-red))]/20 text-[hsl(var(--neural-red))] shrink-0">
                <Target className="w-2 h-2 mr-0.5" />{p.divergenceGate.sizingMultiplier}x
              </Badge>
            )}
            {p.icebergDetection && (
              <Badge className="text-[6px] bg-[hsl(var(--neural-blue))]/20 text-[hsl(var(--neural-blue))] shrink-0">
                <AlertTriangle className="w-2 h-2 mr-0.5" />ICE
              </Badge>
            )}
            {p.deltaCorrelation && (
              <Badge className="text-[6px] bg-[hsl(var(--neural-orange))]/20 text-[hsl(var(--neural-orange))] shrink-0">
                <Zap className="w-2 h-2 mr-0.5" />LAG
              </Badge>
            )}
          </div>
        ))}
      </div>

      {/* Active signals detail */}
      {data.pairs.filter(p => p.divergenceGate).map(p => (
        <div key={`div-${p.pair}`} className="rounded-lg bg-[hsl(var(--neural-red))]/10 border border-[hsl(var(--neural-red))]/20 p-2">
          <p className="text-[8px] font-bold text-[hsl(var(--neural-red))]">
            🎯 DIVERGENCE GATE — {p.pair.replace('_', '/')}
          </p>
          <p className="text-[7px] text-muted-foreground">{p.divergenceGate!.signal}</p>
        </div>
      ))}

      {data.pairs.filter(p => p.icebergDetection).map(p => (
        <div key={`ice-${p.pair}`} className="rounded-lg bg-[hsl(var(--neural-blue))]/10 border border-[hsl(var(--neural-blue))]/20 p-2">
          <p className="text-[8px] font-bold text-[hsl(var(--neural-blue))]">
            🧊 ICEBERG — {p.pair.replace('_', '/')}
          </p>
          <p className="text-[7px] text-muted-foreground">{p.icebergDetection!.signal}</p>
        </div>
      ))}

      {data.pairs.filter(p => p.deltaCorrelation).map(p => (
        <div key={`delta-${p.pair}`} className="rounded-lg bg-[hsl(var(--neural-orange))]/10 border border-[hsl(var(--neural-orange))]/20 p-2">
          <p className="text-[8px] font-bold text-[hsl(var(--neural-orange))]">
            ⚡ DELTA-CORRELATION — {p.pair.replace('_', '/')}
          </p>
          <p className="text-[7px] text-muted-foreground">{p.deltaCorrelation!.signal}</p>
        </div>
      ))}
    </motion.div>
  );
}
