import React from 'react';
import { Brain, Zap, Shield, Crosshair, Activity, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

// ── Types matching the Neuro-Matrix v3 agent output ──

export interface TentacleState {
  instrument: string;
  sovereignDir: 'BUY' | 'SELL' | null;
  executionDir: 'BUY' | 'SELL' | null;
  isFaded: boolean;
  nexusProbability: number;
  nexusTier: 'OMNI_STRIKE' | 'PROBE' | 'SOVEREIGN_ONLY' | 'BLOCKED';
  velocityRatio: number;
  velocitySpike: boolean;
  breathRatio: number;
  adaptiveSL: number;
  adaptiveTP: number;
  nerve: 'NOISE' | 'CLEAN_FLOW';
  elephantAction: string;
  elephantDistance: number;
  wallStrength: number;
  isApex: boolean;
  isSecondary: boolean;
  sizeMultiplier: number;
  sympatheticMultiplier: number;
  synapseBoost: number;
  gateStatus: string;
  hasPosition: boolean;
  tradeDirection?: string;
  tradeEntry?: number;
  tradePnlPips?: number;
  tradeTHS?: number;
  adiConfirmed: number;
  adiTotal: number;
  isRetailHunt: boolean;
  spread: number;
  mid: number;
}

export interface NeuroMatrixState {
  painWeight: number;
  recentWins: number;
  recentLosses: number;
  maxConsecutiveLosses: number;
  leadingSynapse: string | null;
  leadingVelocity: number;
  sympatheticWeak: string | null;
  sympatheticStrong: string | null;
  tentacles: TentacleState[];
  engineVersion: string;
  timestamp: string;
}

interface Props {
  state: NeuroMatrixState;
}

// ── Sub-components ──

const PainMemoryGauge: React.FC<{ weight: number; wins: number; losses: number; maxConsecL: number }> = ({ weight, wins, losses, maxConsecL }) => {
  const pct = weight * 100;
  const isHurting = weight < 0.85;
  const isCritical = weight < 0.65;
  const barColor = isCritical ? 'hsl(var(--nexus-danger))' : isHurting ? 'hsl(var(--nexus-neon-amber))' : 'hsl(var(--nexus-neon-green))';

  return (
    <div className="p-3 rounded-lg" style={{ background: 'hsl(var(--nexus-bg))', border: `1px solid ${isCritical ? 'hsl(var(--nexus-danger) / 0.3)' : 'hsl(var(--nexus-border))'}` }}>
      <div className="flex items-center gap-2 mb-2">
        <Brain size={12} style={{ color: barColor }} />
        <span className="text-[10px] font-bold tracking-[0.15em]" style={{ color: barColor }}>
          PAIN AVOIDANCE MEMORY
        </span>
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <div className="h-4 rounded-full overflow-hidden" style={{ background: 'hsl(var(--nexus-surface))' }}>
            <div className="h-full rounded-full transition-all duration-1000 relative" style={{ width: `${pct}%`, background: barColor }}>
              <span className="absolute right-1 top-0 text-[8px] font-bold leading-4" style={{ color: 'hsl(var(--nexus-bg))' }}>
                {pct.toFixed(0)}%
              </span>
            </div>
          </div>
          <div className="flex justify-between text-[7px] mt-0.5" style={{ color: 'hsl(var(--nexus-text-muted))' }}>
            <span>TURTLE (0.55)</span>
            <span>FULL AGGRESSION (1.0)</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] font-bold tabular-nums" style={{ color: 'hsl(var(--nexus-text-primary))' }}>
            W:{wins} L:{losses}
          </div>
          <div className="text-[8px]" style={{ color: maxConsecL >= 2 ? 'hsl(var(--nexus-danger))' : 'hsl(var(--nexus-text-muted))' }}>
            {maxConsecL} consec loss{maxConsecL !== 1 ? 'es' : ''}
          </div>
        </div>
      </div>
      {isHurting && (
        <div className="mt-2 text-[8px] px-2 py-1 rounded" style={{ background: 'hsl(var(--nexus-danger) / 0.08)', color: 'hsl(var(--nexus-danger))' }}>
          <AlertTriangle size={9} className="inline mr-1" />
          System hurting — velocity threshold raised to {(1.5 + (1.0 - weight) * 0.5).toFixed(2)}x, ADI trust reduced
        </div>
      )}
    </div>
  );
};

const SynapseConnectionMap: React.FC<{ 
  leadingSynapse: string | null; leadingVelocity: number;
  sympatheticWeak: string | null; sympatheticStrong: string | null;
  tentacles: TentacleState[];
}> = ({ leadingSynapse, leadingVelocity, sympatheticWeak, sympatheticStrong, tentacles }) => {
  return (
    <div className="p-3 rounded-lg" style={{ background: 'hsl(var(--nexus-bg))', border: '1px solid hsl(var(--nexus-border))' }}>
      <div className="flex items-center gap-2 mb-2">
        <Zap size={12} style={{ color: 'hsl(var(--nexus-neon-cyan))' }} />
        <span className="text-[10px] font-bold tracking-[0.15em]" style={{ color: 'hsl(var(--nexus-neon-cyan))' }}>
          CROSS-PAIR NEURAL SYNAPSES
        </span>
      </div>

      {/* Leading Synapse */}
      <div className="mb-2">
        <div className="text-[8px] mb-1" style={{ color: 'hsl(var(--nexus-text-muted))' }}>LEADING SYNAPSE (FLINCH DETECTOR)</div>
        {leadingSynapse ? (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: 'hsl(var(--nexus-neon-cyan) / 0.08)', border: '1px solid hsl(var(--nexus-neon-cyan) / 0.2)' }}>
            <Zap size={10} style={{ color: 'hsl(var(--nexus-neon-cyan))' }} />
            <span className="text-[10px] font-bold" style={{ color: 'hsl(var(--nexus-neon-cyan))' }}>
              {leadingSynapse.replace('_', '/')}
            </span>
            <span className="text-[9px]" style={{ color: 'hsl(var(--nexus-text-primary))' }}>
              V={leadingVelocity.toFixed(1)}x SHOCKWAVE
            </span>
            <span className="text-[8px] ml-auto" style={{ color: 'hsl(var(--nexus-neon-green))' }}>
              → probing other pairs
            </span>
          </div>
        ) : (
          <div className="text-[9px] px-2 py-1" style={{ color: 'hsl(var(--nexus-text-muted))' }}>
            No velocity spike detected (&lt;2.0x) — all tentacles sensing independently
          </div>
        )}
      </div>

      {/* Synapse Boost Per-Pair */}
      <div className="flex gap-1 mb-2">
        {tentacles.map(t => (
          <div key={t.instrument} className="flex-1 px-2 py-1 rounded text-center" style={{
            background: t.synapseBoost > 0 ? 'hsl(var(--nexus-neon-cyan) / 0.06)' : 'hsl(var(--nexus-surface))',
            border: `1px solid ${t.synapseBoost > 0 ? 'hsl(var(--nexus-neon-cyan) / 0.2)' : 'hsl(var(--nexus-border))'}`,
          }}>
            <div className="text-[8px]" style={{ color: 'hsl(var(--nexus-text-muted))' }}>{t.instrument.replace('_', '/')}</div>
            <div className="text-[10px] font-bold" style={{ 
              color: t.synapseBoost > 0 ? 'hsl(var(--nexus-neon-cyan))' : 'hsl(var(--nexus-text-muted))'
            }}>
              {t.synapseBoost > 0 ? `+${(t.synapseBoost * 100).toFixed(0)}%` : '—'}
            </div>
          </div>
        ))}
      </div>

      {/* Sympathetic Liquidity Routing */}
      <div className="text-[8px] mb-1" style={{ color: 'hsl(var(--nexus-text-muted))' }}>SYMPATHETIC LIQUIDITY ROUTING</div>
      {sympatheticWeak || sympatheticStrong ? (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: 'hsl(var(--nexus-neon-green) / 0.05)', border: '1px solid hsl(var(--nexus-neon-green) / 0.15)' }}>
          <span className="text-[9px]" style={{ color: 'hsl(var(--nexus-neon-green))' }}>
            💧 Capital flows: {sympatheticWeak?.replace('_', '/')} → 1.5x (weak wall)
          </span>
          <span className="text-[9px] ml-auto" style={{ color: 'hsl(var(--nexus-neon-amber))' }}>
            {sympatheticStrong?.replace('_', '/')} → 0.5x (thick wall)
          </span>
        </div>
      ) : (
        <div className="text-[9px] px-2 py-1" style={{ color: 'hsl(var(--nexus-text-muted))' }}>
          No significant wall differential — equal routing
        </div>
      )}
    </div>
  );
};

const TentacleCard: React.FC<{ t: TentacleState }> = ({ t }) => {
  const isJPY = t.instrument.includes('JPY');
  const prec = isJPY ? 3 : 5;
  const pct = Math.round(t.nexusProbability * 100);

  // Tier colors
  const tierColors: Record<string, string> = {
    'OMNI_STRIKE': 'hsl(var(--nexus-neon-green))',
    'PROBE': 'hsl(var(--nexus-neon-cyan))',
    'SOVEREIGN_ONLY': 'hsl(var(--nexus-neon-amber))',
    'BLOCKED': 'hsl(var(--nexus-danger))',
  };
  const tierColor = tierColors[t.nexusTier] || 'hsl(var(--nexus-text-muted))';

  // Elephant action colors
  const elephantColors: Record<string, string> = {
    'STRIKE_THROUGH': 'hsl(var(--nexus-neon-green))',
    'STOP_RUN_CAPTURE': 'hsl(var(--nexus-neon-cyan))',
    'PATH_CLEAR': 'hsl(var(--nexus-text-muted))',
    'WAIT_FOR_ABSORPTION': 'hsl(var(--nexus-neon-amber))',
    'ELEPHANT_REJECTION': 'hsl(var(--nexus-danger))',
  };
  const elephantColor = elephantColors[t.elephantAction] || 'hsl(var(--nexus-text-muted))';

  const elephantIcons: Record<string, string> = {
    'STRIKE_THROUGH': '🐘💥',
    'STOP_RUN_CAPTURE': '🎯',
    'PATH_CLEAR': '✓',
    'WAIT_FOR_ABSORPTION': '🐘⏳',
    'ELEPHANT_REJECTION': '🐘🛑',
  };

  return (
    <div className="rounded-lg overflow-hidden" style={{
      background: 'hsl(var(--nexus-surface))',
      border: `1px solid ${t.isApex ? 'hsl(var(--nexus-neon-green) / 0.5)' : t.isSecondary ? 'hsl(var(--nexus-neon-cyan) / 0.3)' : 'hsl(var(--nexus-border))'}`,
    }}>
      {/* Apex/Secondary indicator bar */}
      {(t.isApex || t.isSecondary) && (
        <div className="h-1" style={{
          background: t.isApex
            ? 'linear-gradient(90deg, hsl(var(--nexus-neon-green)), hsl(var(--nexus-neon-cyan)))'
            : 'hsl(var(--nexus-neon-cyan) / 0.5)',
        }} />
      )}

      <div className="p-3">
        {/* Header: Instrument + Direction + Tier */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: 'hsl(var(--nexus-text-primary))' }}>
              {t.instrument.replace('_', '/')}
            </span>
            {t.executionDir && (
              <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{
                color: t.executionDir === 'BUY' ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-neon-amber))',
                background: t.executionDir === 'BUY' ? 'hsl(var(--nexus-neon-green) / 0.1)' : 'hsl(var(--nexus-neon-amber) / 0.1)',
              }}>
                {t.executionDir === 'BUY' ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                {t.executionDir}
                {t.isFaded && <span className="ml-0.5 text-[7px]">(FADED)</span>}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {t.isApex && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{
                color: 'hsl(var(--nexus-neon-green))',
                background: 'hsl(var(--nexus-neon-green) / 0.12)',
                border: '1px solid hsl(var(--nexus-neon-green) / 0.3)',
              }}>⚡ APEX</span>
            )}
            {t.isSecondary && (
              <span className="text-[8px] px-1.5 py-0.5 rounded" style={{
                color: 'hsl(var(--nexus-neon-cyan))',
                background: 'hsl(var(--nexus-neon-cyan) / 0.08)',
              }}>2nd</span>
            )}
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{
              color: tierColor,
              background: `${tierColor}15`,
            }}>
              {t.nexusTier}
            </span>
          </div>
        </div>

        {/* Conviction Bar */}
        <div className="mb-2">
          <div className="flex justify-between text-[8px] mb-0.5">
            <span style={{ color: 'hsl(var(--nexus-text-muted))' }}>CONVICTION</span>
            <span className="font-bold" style={{ color: tierColor }}>{pct}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'hsl(var(--nexus-bg))' }}>
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: tierColor }} />
          </div>
        </div>

        {/* Sensor Grid: 2x3 */}
        <div className="grid grid-cols-3 gap-1 mb-2">
          {/* Velocity */}
          <div className="p-1.5 rounded text-center" style={{ background: 'hsl(var(--nexus-bg))' }}>
            <div className="text-[7px]" style={{ color: 'hsl(var(--nexus-text-muted))' }}>VELOCITY</div>
            <div className="text-[11px] font-bold tabular-nums" style={{
              color: t.velocitySpike ? 'hsl(var(--nexus-neon-cyan))' : 'hsl(var(--nexus-text-primary))',
            }}>
              {t.velocityRatio.toFixed(1)}x
            </div>
            {t.velocitySpike && <div className="text-[6px]" style={{ color: 'hsl(var(--nexus-neon-cyan))' }}>SPIKE</div>}
          </div>

          {/* Breath */}
          <div className="p-1.5 rounded text-center" style={{ background: 'hsl(var(--nexus-bg))' }}>
            <div className="text-[7px]" style={{ color: 'hsl(var(--nexus-text-muted))' }}>BREATH</div>
            <div className="text-[11px] font-bold tabular-nums" style={{
              color: t.breathRatio > 1.3 ? 'hsl(var(--nexus-neon-amber))' : 'hsl(var(--nexus-text-primary))',
            }}>
              {t.breathRatio.toFixed(2)}x
            </div>
            <div className="text-[6px]" style={{ color: 'hsl(var(--nexus-text-muted))' }}>
              SL:{t.adaptiveSL}p
            </div>
          </div>

          {/* Nerve */}
          <div className="p-1.5 rounded text-center" style={{ background: 'hsl(var(--nexus-bg))' }}>
            <div className="text-[7px]" style={{ color: 'hsl(var(--nexus-text-muted))' }}>NERVE</div>
            <div className="text-[10px] font-bold" style={{
              color: t.nerve === 'CLEAN_FLOW' ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-neon-amber))',
            }}>
              {t.nerve === 'CLEAN_FLOW' ? '✓ CLEAN' : '⚡ NOISE'}
            </div>
          </div>

          {/* ADI */}
          <div className="p-1.5 rounded text-center" style={{ background: 'hsl(var(--nexus-bg))' }}>
            <div className="text-[7px]" style={{ color: 'hsl(var(--nexus-text-muted))' }}>ADI</div>
            <div className="text-[10px] font-bold" style={{
              color: t.isRetailHunt ? 'hsl(var(--nexus-danger))' : 'hsl(var(--nexus-neon-green))',
            }}>
              {t.isRetailHunt ? '⚠ HUNT' : `${t.adiConfirmed}/${t.adiTotal}`}
            </div>
          </div>

          {/* Elephant */}
          <div className="p-1.5 rounded text-center" style={{ background: 'hsl(var(--nexus-bg))' }}>
            <div className="text-[7px]" style={{ color: 'hsl(var(--nexus-text-muted))' }}>ELEPHANT</div>
            <div className="text-[9px] font-bold" style={{ color: elephantColor }}>
              {elephantIcons[t.elephantAction] || '—'} {t.elephantAction === 'PATH_CLEAR' ? 'CLEAR' : t.elephantDistance > 0 ? `${t.elephantDistance.toFixed(0)}p` : '—'}
            </div>
          </div>

          {/* Spread */}
          <div className="p-1.5 rounded text-center" style={{ background: 'hsl(var(--nexus-bg))' }}>
            <div className="text-[7px]" style={{ color: 'hsl(var(--nexus-text-muted))' }}>SPREAD</div>
            <div className="text-[11px] font-bold tabular-nums" style={{
              color: t.spread <= 3.0 ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-danger))',
            }}>
              {t.spread.toFixed(1)}p
            </div>
          </div>
        </div>

        {/* Sizing / Capital Allocation */}
        <div className="flex items-center gap-1 text-[8px] mb-1">
          <span style={{ color: 'hsl(var(--nexus-text-muted))' }}>SIZING:</span>
          <span style={{ color: 'hsl(var(--nexus-text-primary))' }}>
            tier={t.nexusTier === 'OMNI_STRIKE' ? '1.0x' : '0.5x'}
          </span>
          {t.sympatheticMultiplier !== 1.0 && (
            <span style={{ color: 'hsl(var(--nexus-neon-green))' }}>
              × sympath={t.sympatheticMultiplier}x
            </span>
          )}
          {t.sizeMultiplier !== 1.0 && (
            <span style={{ color: t.isApex ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-neon-cyan))' }}>
              × apex={t.sizeMultiplier}x
            </span>
          )}
        </div>

        {/* Gate Status */}
        {t.gateStatus !== 'executable' && !t.hasPosition && (
          <div className="text-[8px] px-2 py-1 rounded" style={{
            background: 'hsl(var(--nexus-danger) / 0.08)',
            color: 'hsl(var(--nexus-danger))',
          }}>
            🚫 {t.gateStatus.replace('_', ' ').toUpperCase()}
          </div>
        )}

        {/* Active Trade Info */}
        {t.hasPosition && (
          <div className="pt-2 mt-1" style={{ borderTop: '1px solid hsl(var(--nexus-neon-green) / 0.2)' }}>
            <div className="flex items-center justify-between text-[9px]">
              <span style={{ color: 'hsl(var(--nexus-neon-green))' }}>
                ● LIVE {t.tradeDirection?.toUpperCase()} @ {t.tradeEntry?.toFixed(prec)}
              </span>
              {t.tradePnlPips !== undefined && (
                <span className="font-bold" style={{
                  color: t.tradePnlPips >= 0 ? 'hsl(var(--nexus-neon-green))' : 'hsl(var(--nexus-danger))',
                }}>
                  {t.tradePnlPips >= 0 ? '+' : ''}{t.tradePnlPips.toFixed(1)}p
                </span>
              )}
            </div>
            {t.tradeTHS !== undefined && (
              <div className="flex items-center gap-1 mt-1">
                <div className="text-[7px]" style={{ color: 'hsl(var(--nexus-text-muted))' }}>THS</div>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'hsl(var(--nexus-bg))' }}>
                  <div className="h-full rounded-full" style={{
                    width: `${t.tradeTHS}%`,
                    background: t.tradeTHS >= 70 ? 'hsl(var(--nexus-neon-green))' : t.tradeTHS >= 50 ? 'hsl(var(--nexus-neon-amber))' : 'hsl(var(--nexus-danger))',
                  }} />
                </div>
                <span className="text-[8px] font-bold tabular-nums" style={{
                  color: t.tradeTHS >= 70 ? 'hsl(var(--nexus-neon-green))' : t.tradeTHS >= 50 ? 'hsl(var(--nexus-neon-amber))' : 'hsl(var(--nexus-danger))',
                }}>{t.tradeTHS}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main Cortex Component ──

const NeuroMatrixCortex: React.FC<Props> = ({ state }) => {
  return (
    <div className="space-y-3">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} style={{ color: 'hsl(var(--nexus-neon-green))' }} />
          <span className="text-[11px] font-bold tracking-[0.2em]" style={{ color: 'hsl(var(--nexus-neon-green))' }}>
            NEURO-MATRIX CORTEX
          </span>
          <span className="text-[8px] px-1.5 py-0.5 rounded" style={{
            color: 'hsl(var(--nexus-neon-cyan))',
            background: 'hsl(var(--nexus-neon-cyan) / 0.08)',
            border: '1px solid hsl(var(--nexus-neon-cyan) / 0.2)',
          }}>
            {state.engineVersion}
          </span>
        </div>
        {state.timestamp && (
          <span className="text-[8px] tabular-nums" style={{ color: 'hsl(var(--nexus-text-muted))' }}>
            {new Date(state.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Row 1: Pain Memory + Synapse Map */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <PainMemoryGauge
          weight={state.painWeight}
          wins={state.recentWins}
          losses={state.recentLosses}
          maxConsecL={state.maxConsecutiveLosses}
        />
        <SynapseConnectionMap
          leadingSynapse={state.leadingSynapse}
          leadingVelocity={state.leadingVelocity}
          sympatheticWeak={state.sympatheticWeak}
          sympatheticStrong={state.sympatheticStrong}
          tentacles={state.tentacles}
        />
      </div>

      {/* Row 2: Per-Instrument Tentacle Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {state.tentacles.map(t => (
          <TentacleCard key={t.instrument} t={t} />
        ))}
      </div>
    </div>
  );
};

export default NeuroMatrixCortex;
