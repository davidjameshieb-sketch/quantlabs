import React from 'react';

interface ADIProps {
  dollarStrength: number; // -1 to 1
  confirmedCrosses: number;
  totalCrosses: number;
  isRetailHunt: boolean;
}

const ADIRadarHub: React.FC<ADIProps> = ({ dollarStrength, confirmedCrosses, totalCrosses, isRetailHunt }) => {
  const angle = ((dollarStrength + 1) / 2) * 360;
  const pct = totalCrosses > 0 ? Math.round((confirmedCrosses / totalCrosses) * 100) : 0;
  const radius = 72;
  const cx = 90, cy = 90;

  // Draw radar segments
  const segments = 7;
  const segmentLines = Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius };
  });

  // Strength arc
  const strengthAngle = Math.abs(dollarStrength) * Math.PI;
  const arcDir = dollarStrength >= 0 ? 1 : -1;
  const endX = cx + Math.cos(-Math.PI / 2 + arcDir * strengthAngle) * (radius - 8);
  const endY = cy + Math.sin(-Math.PI / 2 + arcDir * strengthAngle) * (radius - 8);

  return (
    <div className="flex flex-col items-center">
      <div className="text-[10px] font-bold tracking-[0.2em] mb-3" style={{ color: 'hsl(var(--nexus-neon-cyan))' }}>
        ABSOLUTE DOLLAR TRIANGULATION
      </div>
      <div className="relative w-[180px] h-[180px]">
        <svg viewBox="0 0 180 180" className="w-full h-full">
          {/* Grid circles */}
          {[30, 50, 72].map(r => (
            <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--nexus-border))" strokeWidth="0.5" opacity="0.4" />
          ))}
          {/* Segment lines */}
          {segmentLines.map((pt, i) => (
            <line key={i} x1={cx} y1={cy} x2={pt.x} y2={pt.y} stroke="hsl(var(--nexus-border))" strokeWidth="0.5" opacity="0.3" />
          ))}
          {/* Strength arc */}
          <circle
            cx={cx} cy={cy} r={radius - 8}
            fill="none"
            stroke={isRetailHunt ? 'hsl(var(--nexus-neon-amber))' : 'hsl(var(--nexus-neon-green))'}
            strokeWidth="3"
            strokeDasharray={`${Math.abs(dollarStrength) * (2 * Math.PI * (radius - 8)) / 2} ${2 * Math.PI * (radius - 8)}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
            opacity="0.8"
          />
          {/* Center value */}
          <text x={cx} y={cy - 8} textAnchor="middle" fill="hsl(var(--nexus-text-primary))" fontSize="22" fontFamily="'Orbitron', monospace" fontWeight="700">
            {(dollarStrength * 100).toFixed(0)}
          </text>
          <text x={cx} y={cy + 8} textAnchor="middle" fill="hsl(var(--nexus-text-muted))" fontSize="8" fontFamily="monospace">
            {dollarStrength >= 0 ? 'USD BULL' : 'USD BEAR'}
          </text>
          <text x={cx} y={cy + 22} textAnchor="middle" fill="hsl(var(--nexus-neon-cyan))" fontSize="8" fontFamily="monospace">
            {confirmedCrosses}/{totalCrosses} CONFIRMED
          </text>
        </svg>
        {isRetailHunt && (
          <div className="absolute bottom-0 left-0 right-0 text-center">
            <span className="text-[9px] font-bold px-2 py-0.5 rounded nexus-pulse" style={{ color: 'hsl(var(--nexus-neon-amber))', background: 'hsl(var(--nexus-neon-amber) / 0.12)', border: '1px solid hsl(var(--nexus-neon-amber) / 0.3)' }}>
              ⚠ RETAIL LIQUIDITY HUNT
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ADIRadarHub;
