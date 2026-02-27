import React from 'react';

interface CurrencyRank {
  currency: string;
  rank: number;
  score?: number;
}

interface Props {
  rankings: CurrencyRank[];
}

const SovereignLeaderboard: React.FC<Props> = ({ rankings }) => {
  const sorted = [...rankings].sort((a, b) => a.rank - b.rank);

  return (
    <div>
      <div className="text-[10px] font-bold tracking-[0.2em] mb-3" style={{ color: 'hsl(var(--nexus-neon-cyan))' }}>
        SOVEREIGN PREDATOR / PREY MATRIX
      </div>
      <div className="space-y-1">
        {sorted.map((c, i) => {
          const isPredator = c.rank === 1;
          const isPrey = c.rank === sorted.length;
          const barWidth = Math.max(8, ((sorted.length - c.rank + 1) / sorted.length) * 100);

          let textColor = 'hsl(var(--nexus-text-primary))';
          let barColor = 'hsl(var(--nexus-deep-blue))';
          let labelBg = 'transparent';

          if (isPredator) {
            textColor = 'hsl(var(--nexus-neon-green))';
            barColor = 'hsl(var(--nexus-neon-green) / 0.35)';
            labelBg = 'hsl(var(--nexus-neon-green) / 0.1)';
          } else if (isPrey) {
            textColor = 'hsl(var(--nexus-neon-amber))';
            barColor = 'hsl(var(--nexus-neon-amber) / 0.35)';
            labelBg = 'hsl(var(--nexus-neon-amber) / 0.1)';
          }

          return (
            <div
              key={c.currency}
              className="flex items-center gap-2 py-1 px-2 rounded text-xs font-mono transition-all"
              style={{ background: labelBg }}
            >
              <span className="w-4 text-[10px] font-bold" style={{ color: 'hsl(var(--nexus-text-muted))' }}>
                #{c.rank}
              </span>
              <span className="w-8 font-bold text-xs" style={{ color: textColor }}>
                {c.currency}
              </span>
              <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'hsl(var(--nexus-surface))' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${barWidth}%`, background: barColor }}
                />
              </div>
              {isPredator && (
                <span className="text-[8px] font-bold tracking-wider nexus-pulse" style={{ color: 'hsl(var(--nexus-neon-green))' }}>
                  PREDATOR
                </span>
              )}
              {isPrey && (
                <span className="text-[8px] font-bold tracking-wider nexus-pulse" style={{ color: 'hsl(var(--nexus-neon-amber))' }}>
                  PREY
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SovereignLeaderboard;
