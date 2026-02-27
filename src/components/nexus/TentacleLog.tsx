import React, { useRef, useEffect } from 'react';

interface Props {
  logs: string[];
  onClear: () => void;
}

const TentacleLog: React.FC<Props> = ({ logs, onClear }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const colorize = (line: string) => {
    if (line.includes('✅') || line.includes('FILLED')) return 'hsl(var(--nexus-neon-green))';
    if (line.includes('❌') || line.includes('REJECTED') || line.includes('Fatal')) return 'hsl(var(--nexus-danger))';
    if (line.includes('⚠') || line.includes('HUNT') || line.includes('BLOCKED') || line.includes('WALL')) return 'hsl(var(--nexus-neon-amber))';
    if (line.includes('🔺') || line.includes('PILLAR') || line.includes('ADI') || line.includes('OBI')) return 'hsl(var(--nexus-neon-cyan))';
    if (line.includes('🧠') || line.includes('BREATH') || line.includes('NEXUS')) return 'hsl(150 80% 65%)';
    if (line.includes('🚀') || line.includes('EXECUTING')) return 'hsl(185 100% 70%)';
    if (line.includes('SOVEREIGN') || line.includes('SOV')) return 'hsl(270 60% 70%)';
    if (line.includes('[SYSTEM]')) return 'hsl(var(--nexus-neon-cyan))';
    return 'hsl(var(--nexus-text-muted))';
  };

  return (
    <div className="rounded-lg border overflow-hidden" style={{ background: 'hsl(var(--nexus-bg))', borderColor: 'hsl(var(--nexus-border))' }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid hsl(var(--nexus-border))' }}>
        <span className="text-[10px] font-bold tracking-[0.15em]" style={{ color: 'hsl(var(--nexus-neon-cyan))' }}>
          TENTACLE LOG // MICRO-EVENTS
        </span>
        <button
          onClick={onClear}
          className="text-[10px] transition-colors hover:opacity-80"
          style={{ color: 'hsl(var(--nexus-text-muted))' }}
        >
          CLEAR
        </button>
      </div>
      <div ref={scrollRef} className="p-3 h-56 overflow-y-auto scrollbar-neural space-y-0.5 font-mono">
        {logs.map((line, i) => (
          <div key={i} className="text-[10px] leading-relaxed" style={{ color: colorize(line) }}>
            {line}
          </div>
        ))}
        {logs.length === 0 && (
          <div className="text-[10px]" style={{ color: 'hsl(var(--nexus-text-muted))' }}>
            Awaiting nexus invocation...
          </div>
        )}
      </div>
    </div>
  );
};

export default TentacleLog;
