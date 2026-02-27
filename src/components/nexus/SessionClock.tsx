import React, { useState, useEffect } from 'react';

const SessionClock: React.FC = () => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const utcS = now.getUTCSeconds();
  const utcMinutes = utcH * 60 + utcM;

  // NYC session: 13:30–21:30 UTC
  const sessionStart = 810; // 13:30
  const sessionEnd = 1290; // 21:30
  const isActive = utcMinutes >= sessionStart && utcMinutes <= sessionEnd;

  // Time remaining to session end (4:30 PM EST = 21:30 UTC)
  let remainingMin = 0;
  if (isActive) {
    remainingMin = sessionEnd - utcMinutes;
  }
  const remH = Math.floor(remainingMin / 60);
  const remM = remainingMin % 60;

  // Progress through session
  const sessionDuration = sessionEnd - sessionStart;
  const elapsed = isActive ? utcMinutes - sessionStart : 0;
  const progressPct = isActive ? (elapsed / sessionDuration) * 100 : 0;

  return (
    <div className="flex items-center gap-4 font-mono">
      {/* UTC Clock */}
      <div className="text-center">
        <div className="text-[8px] tracking-wider mb-0.5" style={{ color: 'hsl(var(--nexus-text-muted))' }}>UTC</div>
        <div className="text-sm font-bold tabular-nums" style={{ color: 'hsl(var(--nexus-text-primary))' }}>
          {String(utcH).padStart(2, '0')}:{String(utcM).padStart(2, '0')}:{String(utcS).padStart(2, '0')}
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-8" style={{ background: 'hsl(var(--nexus-border))' }} />

      {/* Session status */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-2 h-2 rounded-full nexus-pulse"
            style={{ background: isActive ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-text-muted))' }}
          />
          <span className="text-[10px] font-bold tracking-wider" style={{
            color: isActive ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-text-muted))',
          }}>
            {isActive ? 'SESSION LIVE' : 'DORMANT'}
          </span>
          {isActive && (
            <span className="text-[10px] ml-auto" style={{ color: 'hsl(var(--nexus-neon-amber))' }}>
              {remH}h {remM}m → CLOSE
            </span>
          )}
        </div>
        {/* Progress bar */}
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'hsl(var(--nexus-surface))' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progressPct}%`,
              background: progressPct > 80 ? 'hsl(var(--nexus-neon-amber))' : 'hsl(var(--nexus-neon-green))',
            }}
          />
        </div>
        <div className="flex justify-between text-[7px] mt-0.5" style={{ color: 'hsl(var(--nexus-text-muted))' }}>
          <span>8:30 AM EST</span>
          <span>4:30 PM EST</span>
        </div>
      </div>
    </div>
  );
};

export default SessionClock;
