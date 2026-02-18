import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, TrendingUp, TrendingDown, Target, Clock, Activity,
  ChevronDown, ChevronUp, CheckCircle, XCircle, Minus,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface ClimaxEvent {
  id: string;
  pair: string;
  displayPair: string;
  climaxTime: Date;
  direction: 'long' | 'short';
  entryPrice: number;
  exitPrice: number | null;
  closedAt: Date | null;
  durationSec: number | null;
  pips: number | null;
  result: 'WIN' | 'LOSS' | 'BREAKEVEN' | 'OPEN';
  phase: 'COIL' | 'EXPANSION' | 'CLIMAX_PEAK' | 'DECAY';
  // Gate metrics at entry (stored from ripple-stream)
  gates: {
    hurst: number | null;
    efficiency: number | null;
    zOfi: number | null;
    vpin: number | null;
    verified: boolean; // true if gate data was stored at entry
  };
}

// ── Momentum Phase Bar ───────────────────────────────────────────────────────

const PHASES = [
  { key: 'COIL',         label: 'Coil',      desc: '4/4 Gates Open',          color: 'bg-[hsl(var(--neural-cyan))]',   glow: 'shadow-[0_0_8px_hsl(var(--neural-cyan))]' },
  { key: 'EXPANSION',    label: 'Expansion',  desc: 'Ghost Move (High-E)',      color: 'bg-[hsl(var(--neural-green))]',  glow: 'shadow-[0_0_8px_hsl(var(--neural-green))]' },
  { key: 'CLIMAX_PEAK',  label: 'Peak',       desc: 'Z-OFI > 2.5σ Exhaustion', color: 'bg-yellow-400',                  glow: 'shadow-[0_0_12px_theme(colors.yellow.400)]' },
  { key: 'DECAY',        label: 'Decay/Flush',desc: '3/4 Gate Flush',          color: 'bg-[hsl(var(--neural-red))]',   glow: 'shadow-[0_0_8px_hsl(var(--neural-red))]' },
] as const;

function MomentumPhaseLegend() {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PHASES.map((p, i) => (
        <div key={p.key} className="flex items-center gap-1 text-[9px]">
          {i > 0 && <ChevronDown className="w-2.5 h-2.5 text-muted-foreground rotate-[-90deg]" />}
          <div className={cn('w-2.5 h-2.5 rounded-sm', p.color)} />
          <span className="text-muted-foreground">{p.label}</span>
        </div>
      ))}
    </div>
  );
}

function MomentumHeatmapRow({ event }: { event: ClimaxEvent }) {
  const durationSec = event.durationSec ?? 60;
  // Map duration to phase width ratios:
  // Coil phase = entry signal (instant), Expansion = 0→30% duration, Peak = 60-80%, Decay = last 20%
  const totalWidth = 100;
  const coilW   = Math.min(15, totalWidth);
  const expW    = Math.min(40, totalWidth - coilW);
  const peakW   = Math.min(25, totalWidth - coilW - expW);
  const decayW  = totalWidth - coilW - expW - peakW;

  const pips = event.pips ?? 0;
  const isWin = pips > 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground">
        <span>{event.displayPair}</span>
        <span>{event.climaxTime.toLocaleTimeString()}</span>
        <span className={cn('font-bold', isWin ? 'text-[hsl(var(--neural-green))]' : pips < 0 ? 'text-[hsl(var(--neural-red))]' : 'text-muted-foreground')}>
          {event.result === 'OPEN' ? '⚡ OPEN' : `${pips >= 0 ? '+' : ''}${pips}p`}
        </span>
      </div>
      {/* Phase bar */}
      <div className="h-4 rounded-md overflow-hidden flex">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${coilW}%` }}
          transition={{ duration: 0.4, delay: 0 }}
          className={cn('h-full', PHASES[0].color, 'opacity-90')}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${expW}%` }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className={cn('h-full', PHASES[1].color, 'opacity-90')}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${peakW}%` }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className={cn('h-full', PHASES[2].color, 'opacity-90')}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${decayW}%` }}
          transition={{ duration: 0.4, delay: 0.55 }}
          className={cn('h-full', PHASES[3].color, 'opacity-90')}
        />
      </div>
      {/* Duration marker */}
      <div className="text-[8px] text-muted-foreground/60 font-mono">
        {durationSec < 60
          ? `${durationSec}s trade`
          : `${Math.round(durationSec / 60)}m trade`
        } · {event.direction === 'long' ? '↑ Long' : '↓ Short'} @ {event.entryPrice}
        {event.exitPrice ? ` → ${event.exitPrice}` : ' (open)'}
      </div>
    </div>
  );
}

// ── Event Log Table ──────────────────────────────────────────────────────────

function ResultBadge({ result, pips }: { result: ClimaxEvent['result']; pips: number | null }) {
  if (result === 'OPEN') return (
    <Badge className="text-[9px] bg-[hsl(var(--neural-cyan))]/20 text-[hsl(var(--neural-cyan))] border-[hsl(var(--neural-cyan))]/30 animate-pulse">
      <Zap className="w-2.5 h-2.5 mr-1" /> LIVE
    </Badge>
  );
  if (result === 'WIN') return (
    <Badge className="text-[9px] bg-[hsl(var(--neural-green))]/20 text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/30">
      <CheckCircle className="w-2.5 h-2.5 mr-1" /> +{pips}p
    </Badge>
  );
  if (result === 'LOSS') return (
    <Badge className="text-[9px] bg-[hsl(var(--neural-red))]/20 text-[hsl(var(--neural-red))] border-[hsl(var(--neural-red))]/30">
      <XCircle className="w-2.5 h-2.5 mr-1" /> {pips}p
    </Badge>
  );
  return (
    <Badge variant="outline" className="text-[9px]">
      <Minus className="w-2.5 h-2.5 mr-1" /> 0p
    </Badge>
  );
}

// ── Data hook ────────────────────────────────────────────────────────────────

function useClimaxEvents() {
  const [events, setEvents] = useState<ClimaxEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('oanda_orders')
        .select('id, currency_pair, direction, status, entry_price, exit_price, created_at, closed_at, oanda_trade_id, governance_payload, gate_result, gate_reasons')
        .in('status', ['filled', 'closed'])
        .eq('environment', 'live')
        .not('oanda_trade_id', 'is', null)
        .not('entry_price', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);

      if (!data) { setLoading(false); return; }

      const mapped: ClimaxEvent[] = data.map((row) => {
        const pair = row.currency_pair as string;
        const displayPair = pair.replace('_', '/');
        const isJpy = /JPY/.test(pair);
        const entry = row.entry_price as number | null;
        const exit  = row.exit_price  as number | null;
        const dir   = row.direction as 'long' | 'short';
        const createdAt = new Date(row.created_at);
        const closedAt  = row.closed_at ? new Date(row.closed_at) : null;
        const durationSec = closedAt ? Math.round((closedAt.getTime() - createdAt.getTime()) / 1000) : null;

        let pips: number | null = null;
        if (entry != null && exit != null) {
          const mult = isJpy ? 100 : 10000;
          pips = Math.round((dir === 'long' ? (exit - entry) : (entry - exit)) * mult * 10) / 10;
        }

        // 'filled' = currently open at broker (has trade_id but no exit yet)
        // 'closed' = completed trade with exit_price
        const result: ClimaxEvent['result'] =
          row.status === 'filled' && exit == null ? 'OPEN' :
          pips == null ? 'OPEN' :
          pips > 0.5   ? 'WIN' :
          pips < -0.5  ? 'LOSS' : 'BREAKEVEN';

        // Infer momentum phase from duration
        const phase: ClimaxEvent['phase'] =
          result === 'OPEN'       ? 'COIL' :
          durationSec != null && durationSec < 30 ? 'DECAY' :
          durationSec != null && durationSec < 90 ? 'CLIMAX_PEAK' :
          result === 'WIN'        ? 'EXPANSION' : 'DECAY';

        // Extract gate metrics from governance_payload (stored by ripple-stream at entry)
        const payload = row.governance_payload as any;
        const gatesPayload = payload?.gates;
        const gates: ClimaxEvent['gates'] = {
          hurst:      gatesPayload?.hurst      ?? null,
          efficiency: gatesPayload?.efficiency ?? null,
          zOfi:       gatesPayload?.zOfi       ?? null,
          vpin:       gatesPayload?.vpin       ?? null,
          verified:   !!gatesPayload,
        };

        return {
          id: row.id,
          pair,
          displayPair,
          climaxTime: createdAt,
          direction: dir,
          entryPrice: entry ?? 0,
          exitPrice: exit,
          closedAt,
          durationSec,
          pips,
          result,
          phase,
          gates,
        };
      });

      setEvents(mapped);
      setLoading(false);
    }
    fetch();

    // Realtime updates
    const channel = supabase
      .channel('climax-events-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oanda_orders' }, fetch)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { events, loading };
}

// ── Gate Legend ──────────────────────────────────────────────────────────────

function GateLegend() {
  return (
    <div className="border border-border/30 rounded-md p-3 bg-muted/10 space-y-2">
      <div className="flex items-center gap-2 text-[10px] font-semibold text-foreground">
        <div className="w-2 h-2 rounded-full bg-yellow-400" />
        Climax Protocol v2.0 — Entry requires ALL 4 gates:
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px] font-mono">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--neural-green))]" />
          <span className="text-muted-foreground">Efficiency</span>
          <span className="text-foreground font-bold">≥ 7x</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--neural-cyan))]" />
          <span className="text-muted-foreground">Hurst</span>
          <span className="text-foreground font-bold">≥ 0.62</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
          <span className="text-muted-foreground">Z-OFI</span>
          <span className="text-foreground font-bold">&gt; 2.5σ</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--neural-red))]" />
          <span className="text-muted-foreground">VPIN</span>
          <span className="text-foreground font-bold">&gt; 0.60</span>
        </div>
      </div>
      <div className="border-t border-border/20 pt-2 space-y-1 text-[9px] font-mono text-muted-foreground">
        <p><span className="text-[hsl(var(--neural-cyan))] font-bold">⚡ LIVE</span> = Trade currently open at broker (no exit price yet).</p>
        <p><span className="text-yellow-400 font-bold">⚠ NOTE:</span> Gate values (Efficiency, Hurst, Z-OFI, VPIN) are not stored per-trade in the database — trades are filtered by <span className="text-foreground">david-atlas engine</span> only. To verify gate thresholds were met at entry, cross-reference with sovereign_memory physics snapshots.</p>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ClimaxBacktestLog() {
  const { events, loading } = useClimaxEvents();
  const [showAll, setShowAll] = useState(false);
  const [selectedPair, setSelectedPair] = useState<string | null>(null);

  const uniquePairs = [...new Set(events.map(e => e.displayPair))];

  const filtered = selectedPair
    ? events.filter(e => e.displayPair === selectedPair)
    : events;

  const displayed = showAll ? filtered : filtered.slice(0, 15);

  const wins   = events.filter(e => e.result === 'WIN').length;
  const losses = events.filter(e => e.result === 'LOSS').length;
  const open   = events.filter(e => e.result === 'OPEN').length;
  const totalPips = events.reduce((sum, e) => sum + (e.pips ?? 0), 0);
  const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* ── Gate Legend & Definitions ── */}
      <GateLegend />

      {/* ── Momentum Heatmap ── */}
      <Card className="border-border/30 bg-card/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <h3 className="font-display text-sm font-bold">Momentum Heatmap</h3>
            <Badge variant="outline" className="text-[9px]">Climax Phase Anatomy</Badge>
          </div>
        </div>

        <MomentumPhaseLegend />

        <div className="text-[9px] text-muted-foreground font-mono border border-border/20 rounded-md p-2 bg-muted/20 space-y-0.5">
          {PHASES.map(p => (
            <div key={p.key} className="flex items-center gap-2">
              <div className={cn('w-2 h-2 rounded-sm shrink-0', p.color)} />
              <span className="text-foreground font-semibold">{p.label}:</span>
              <span>{p.desc}</span>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 w-32 bg-muted/30 rounded animate-pulse" />
                <div className="h-4 w-full bg-muted/20 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {events.slice(0, 8).map(event => (
              <MomentumHeatmapRow key={event.id} event={event} />
            ))}
            {events.length === 0 && (
              <p className="text-[10px] text-muted-foreground text-center py-4 font-mono">
                No live trade data yet. Trades appear here as CLIMAX strikes fire.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* ── Climax Event Log ── */}
      <Card className="border-border/30 bg-card/50 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            <h3 className="font-display text-sm font-bold">Climax Strike Log</h3>
            <Badge variant="outline" className="text-[9px]">Legacy Gates · Live</Badge>
          </div>
          {/* Summary stats */}
          <div className="flex items-center gap-2">
            <Badge className="text-[9px] bg-[hsl(var(--neural-green))]/20 text-[hsl(var(--neural-green))] border-[hsl(var(--neural-green))]/30">
              {wins}W
            </Badge>
            <Badge className="text-[9px] bg-[hsl(var(--neural-red))]/20 text-[hsl(var(--neural-red))] border-[hsl(var(--neural-red))]/30">
              {losses}L
            </Badge>
            {open > 0 && (
              <Badge className="text-[9px] bg-[hsl(var(--neural-cyan))]/20 text-[hsl(var(--neural-cyan))] border-[hsl(var(--neural-cyan))]/30 animate-pulse">
                {open} Live
              </Badge>
            )}
            <Badge variant="outline" className={cn('text-[9px]', totalPips >= 0 ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]')}>
              {totalPips >= 0 ? '+' : ''}{Math.round(totalPips * 10) / 10}p total
            </Badge>
            <Badge variant="outline" className="text-[9px]">{winRate}% WR</Badge>
          </div>
        </div>

        {/* Pair filter chips */}
        {uniquePairs.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedPair(null)}
              className={cn(
                'text-[9px] font-mono px-2 py-0.5 rounded-full border transition-all',
                selectedPair === null
                  ? 'bg-primary/20 border-primary/40 text-primary'
                  : 'border-border/30 text-muted-foreground hover:border-border/60'
              )}
            >ALL</button>
            {uniquePairs.map(p => (
              <button
                key={p}
                onClick={() => setSelectedPair(prev => prev === p ? null : p)}
                className={cn(
                  'text-[9px] font-mono px-2 py-0.5 rounded-full border transition-all',
                  selectedPair === p
                    ? 'bg-primary/20 border-primary/40 text-primary'
                    : 'border-border/30 text-muted-foreground hover:border-border/60'
                )}
              >{p}</button>
            ))}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 bg-muted/20 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] font-mono">
              <thead>
                <tr className="border-b border-border/30">
                  {['Pair', 'Time', 'Dir', 'Entry', 'Exit', 'Dur', 'Pips', 'H ≥0.62', 'E ≥7x', 'Z >2.5σ', 'V >0.60', 'Result'].map(h => (
                    <th key={h} className="text-left py-1.5 px-2 text-muted-foreground font-semibold uppercase tracking-wider whitespace-nowrap text-[9px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <AnimatePresence mode="popLayout">
                <tbody>
                  {displayed.map((event, i) => {
                    const { gates } = event;
                    // Gate pass/fail indicators
                    const hurstPass = gates.hurst != null ? gates.hurst >= 0.62 : null;
                    const effPass   = gates.efficiency != null ? gates.efficiency >= 7 : null;
                    const zPass     = gates.zOfi != null ? Math.abs(gates.zOfi) > 2.5 : null;
                    const vpinPass  = gates.vpin != null ? gates.vpin > 0.60 : null;

                    function GatePill({ pass, value, fmt }: { pass: boolean | null; value: number | null; fmt: (v: number) => string }) {
                      if (pass === null || value === null) return (
                        <span className="text-muted-foreground/40 text-[8px]">—</span>
                      );
                      return (
                        <span className={cn(
                          'inline-flex items-center gap-0.5 text-[8px] font-bold',
                          pass ? 'text-[hsl(var(--neural-green))]' : 'text-[hsl(var(--neural-red))]'
                        )}>
                          <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', pass ? 'bg-[hsl(var(--neural-green))]' : 'bg-[hsl(var(--neural-red))]')} />
                          {fmt(value)}
                        </span>
                      );
                    }

                    return (
                      <motion.tr
                        key={event.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.02 }}
                        className={cn(
                          'border-b border-border/10 hover:bg-muted/10 transition-colors',
                          event.result === 'OPEN' && 'bg-[hsl(var(--neural-cyan))]/5',
                        )}
                      >
                        <td className="py-1.5 px-2 font-bold text-foreground whitespace-nowrap">{event.displayPair}</td>
                        <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5 opacity-50" />
                            {event.climaxTime.toLocaleTimeString()}
                          </div>
                        </td>
                        <td className="py-1.5 px-2 whitespace-nowrap">
                          {event.direction === 'long'
                            ? <span className="flex items-center gap-0.5 text-[hsl(var(--neural-green))]"><TrendingUp className="w-3 h-3" />L</span>
                            : <span className="flex items-center gap-0.5 text-[hsl(var(--neural-red))]"><TrendingDown className="w-3 h-3" />S</span>
                          }
                        </td>
                        <td className="py-1.5 px-2 text-foreground">{event.entryPrice}</td>
                        <td className="py-1.5 px-2 text-muted-foreground">{event.exitPrice ?? '—'}</td>
                        <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">
                          {event.durationSec == null ? '—' :
                            event.durationSec < 60 ? `${event.durationSec}s` :
                            `${Math.floor(event.durationSec / 60)}m${event.durationSec % 60}s`
                          }
                        </td>
                        <td className={cn('py-1.5 px-2 font-bold',
                          (event.pips ?? 0) > 0 ? 'text-[hsl(var(--neural-green))]' :
                          (event.pips ?? 0) < 0 ? 'text-[hsl(var(--neural-red))]' :
                          'text-muted-foreground'
                        )}>
                          {event.pips == null ? '—' : `${event.pips >= 0 ? '+' : ''}${event.pips}p`}
                        </td>
                        {/* Gate columns */}
                        <td className="py-1.5 px-2">
                          <GatePill pass={hurstPass} value={gates.hurst} fmt={v => v.toFixed(3)} />
                        </td>
                        <td className="py-1.5 px-2">
                          <GatePill pass={effPass} value={gates.efficiency} fmt={v => `${v.toFixed(1)}x`} />
                        </td>
                        <td className="py-1.5 px-2">
                          <GatePill pass={zPass} value={gates.zOfi} fmt={v => `${v.toFixed(2)}σ`} />
                        </td>
                        <td className="py-1.5 px-2">
                          <GatePill pass={vpinPass} value={gates.vpin} fmt={v => v.toFixed(3)} />
                        </td>
                        <td className="py-1.5 px-2">
                          <ResultBadge result={event.result} pips={event.pips} />
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </AnimatePresence>
            </table>

            {displayed.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Target className="w-6 h-6 mx-auto mb-2 opacity-30" />
                <p className="text-[10px] font-mono">No CLIMAX strikes recorded yet for this filter.</p>
              </div>
            )}
          </div>
        )}

        {/* Show more */}
        {filtered.length > 15 && (
          <button
            onClick={() => setShowAll(v => !v)}
            className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors mx-auto font-mono"
          >
            {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showAll ? 'Show less' : `Show all ${filtered.length} strikes`}
          </button>
        )}
      </Card>
    </div>
  );
}
