import React from 'react';

interface Bucket {
  price: number;
  longPct: number;
  shortPct: number;
}

interface Props {
  instrument: string;
  buckets: Bucket[];
  currentPrice: number;
}

const LiquidityHeatmap: React.FC<Props> = ({ instrument, buckets, currentPrice }) => {
  if (!buckets.length) {
    return (
      <div className="text-[10px] font-mono" style={{ color: 'hsl(var(--nexus-text-muted))' }}>
        No order book data for {instrument.replace('_', '/')}
      </div>
    );
  }

  // Filter buckets near current price (±50 pips)
  const pv = instrument.includes('JPY') ? 0.01 : 0.0001;
  const range = 50 * pv;
  const nearby = buckets
    .filter(b => Math.abs(b.price - currentPrice) < range)
    .sort((a, b) => b.price - a.price);

  const maxPct = Math.max(...nearby.map(b => Math.max(b.longPct, b.shortPct)), 1);

  return (
    <div className="space-y-0.5">
      {nearby.slice(0, 20).map((b, i) => {
        const isCurrentLevel = Math.abs(b.price - currentPrice) < pv * 3;
        const longW = (b.longPct / maxPct) * 100;
        const shortW = (b.shortPct / maxPct) * 100;
        const isElephant = b.longPct > maxPct * 0.7 || b.shortPct > maxPct * 0.7;

        return (
          <div key={i} className="flex items-center gap-1 h-2.5">
            {/* Short side (left) */}
            <div className="w-12 flex justify-end">
              <div
                className="h-full rounded-l"
                style={{
                  width: `${shortW}%`,
                  minWidth: shortW > 0 ? '1px' : '0',
                  background: isElephant && b.shortPct > b.longPct
                    ? 'hsl(var(--nexus-neon-amber))'
                    : 'hsl(var(--nexus-neon-amber) / 0.4)',
                }}
              />
            </div>
            {/* Price label */}
            <span className="text-[7px] w-14 text-center font-mono" style={{
              color: isCurrentLevel ? 'hsl(var(--nexus-neon-cyan))' : 'hsl(var(--nexus-text-muted))',
              fontWeight: isCurrentLevel ? 700 : 400,
            }}>
              {b.price.toFixed(instrument.includes('JPY') ? 2 : 4)}
              {isElephant && ' 🐘'}
            </span>
            {/* Long side (right) */}
            <div className="w-12">
              <div
                className="h-full rounded-r"
                style={{
                  width: `${longW}%`,
                  minWidth: longW > 0 ? '1px' : '0',
                  background: isElephant && b.longPct > b.shortPct
                    ? 'hsl(var(--nexus-neon-green))'
                    : 'hsl(var(--nexus-neon-green) / 0.4)',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default LiquidityHeatmap;
