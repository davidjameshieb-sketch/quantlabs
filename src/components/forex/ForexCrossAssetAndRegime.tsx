// Forex Cross-Asset Influence & Regime Timeline
// Informational panel for external market influence on forex trades

import React from 'react';
import { Globe, TrendingUp, Gem, BarChart3 } from 'lucide-react';
import { CrossAssetInfluence, ForexTradeEntry, FOREX_REGIME_LABELS, FOREX_REGIME_COLORS, ForexRegime } from '@/lib/forex/forexTypes';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ─── Cross-Asset Influence Panel ───

interface CrossAssetInfluencePanelProps {
  influence: CrossAssetInfluence;
}

const InfluenceBar = React.forwardRef<HTMLDivElement, { label: string; value: number; icon: React.ElementType }>(
  ({ label, value, icon: Icon }, ref) => {
    const absVal = Math.abs(value);
    const isPositive = value >= 0;
    return (
      <div ref={ref} className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Icon className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-medium">{label}</span>
          </div>
          <span className={cn(
            'text-[10px] font-mono font-bold',
            isPositive ? 'text-neural-green' : 'text-neural-red'
          )}>
            {isPositive ? '+' : ''}{value.toFixed(1)}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden relative">
          <div className="absolute left-1/2 w-px h-full bg-border/50" />
          <div
            className={cn(
              'h-full rounded-full transition-all absolute',
              isPositive ? 'bg-neural-green left-1/2' : 'bg-neural-red right-1/2',
            )}
            style={{
              width: `${absVal / 2}%`,
              ...(isPositive ? { left: '50%' } : { right: '50%' }),
            }}
          />
        </div>
      </div>
    );
  }
);
InfluenceBar.displayName = 'InfluenceBar';

export const CrossAssetInfluencePanel = ({ influence }: CrossAssetInfluencePanelProps) => (
  <div className="p-4 rounded-xl bg-card/50 border border-border/50 space-y-3">
    <div className="flex items-center gap-2">
      <Globe className="w-4 h-4 text-primary" />
      <h3 className="text-xs font-display font-bold">Cross-Asset Influence</h3>
      <Badge variant="outline" className="text-[8px] ml-auto">Informational Only</Badge>
    </div>
    <p className="text-[10px] text-muted-foreground">
      External market factors that influenced forex trading decisions. Performance results are forex-only.
    </p>
    <div className="space-y-2.5">
      <InfluenceBar label="Crypto Sentiment Influence" value={influence.cryptoSentiment} icon={Gem} />
      <InfluenceBar label="Equity Risk Sentiment" value={influence.equityRiskSentiment} icon={TrendingUp} />
      <InfluenceBar label="Commodity Correlation" value={influence.commodityCorrelation} icon={BarChart3} />
    </div>
  </div>
);

// ─── Regime Timeline Panel ───

interface ForexRegimeTimelineProps {
  trades: ForexTradeEntry[];
}

export const ForexRegimeTimeline = ({ trades }: ForexRegimeTimelineProps) => {
  const regimeCounts: Record<ForexRegime, number> = {
    trending: 0,
    ranging: 0,
    'high-volatility': 0,
    'low-liquidity': 0,
  };
  trades.forEach(t => regimeCounts[t.regime]++);
  const total = trades.length || 1;

  return (
    <div className="p-4 rounded-xl bg-card/50 border border-border/50 space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-primary" />
        <h3 className="text-xs font-display font-bold">Forex Regime Distribution</h3>
      </div>

      {/* Stacked bar */}
      <div className="h-4 rounded-full overflow-hidden flex">
        {(Object.keys(regimeCounts) as ForexRegime[]).map(regime => {
          const pct = (regimeCounts[regime] / total) * 100;
          if (pct === 0) return null;
          const colorMap: Record<ForexRegime, string> = {
            trending: 'bg-neural-green',
            ranging: 'bg-primary',
            'high-volatility': 'bg-neural-orange',
            'low-liquidity': 'bg-neural-red',
          };
          return (
            <div
              key={regime}
              className={cn('h-full transition-all', colorMap[regime])}
              style={{ width: `${pct}%` }}
              title={`${FOREX_REGIME_LABELS[regime]}: ${pct.toFixed(0)}%`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(regimeCounts) as ForexRegime[]).map(regime => (
          <div key={regime} className="flex items-center justify-between p-2 rounded-lg border border-border/30">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className={cn('text-[8px] px-1.5', FOREX_REGIME_COLORS[regime])}>
                {FOREX_REGIME_LABELS[regime]}
              </Badge>
            </div>
            <span className="text-[10px] font-mono font-bold">
              {regimeCounts[regime]} ({((regimeCounts[regime] / total) * 100).toFixed(0)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
