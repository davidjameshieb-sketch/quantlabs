// Sovereign Matrix v20.0 — Mechanical Chomp Dashboard (Institutional Grade)
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight,
  Crosshair, Grid3x3, Lock, RefreshCw, Shield, Target, TrendingDown,
  TrendingUp, Wifi, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useSovereignMatrix, TIER_UNITS, pips } from '@/hooks/useSovereignMatrix';
import type { MatrixSignal, MatrixResult } from '@/hooks/useSovereignMatrix';

type Env = 'practice' | 'live';

// ─── Flag map ─────────────────────────────────────────────────────────────────
const FLAGS: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  AUD: '🇦🇺', CAD: '🇨🇦', CHF: '🇨🇭', NZD: '🇳🇿',
};

// ─── Sub-components ────────────────────────────────────────────────────────────
const PanelCard = ({
  title, icon: Icon, children, className = '', accentColor = 'border-slate-700/50',
}: {
  title: string; icon: React.ElementType; children: React.ReactNode;
  className?: string; accentColor?: string;
}) => (
  <div className={cn(
    'bg-slate-900/60 backdrop-blur-md border rounded-xl p-5 shadow-2xl flex flex-col',
    accentColor, className
  )}>
    <div className="flex items-center gap-2 mb-4 border-b border-slate-700/50 pb-3">
      <Icon className="w-4 h-4 text-slate-300" />
      <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">{title}</h2>
    </div>
    <div className="flex-1">{children}</div>
  </div>
);

const GateLight = ({ open, dir }: { open: boolean; dir: string }) => {
  const glow = open
    ? dir === 'SHORT'
      ? 'bg-[#ff0055] border-[#ff0055] shadow-[0_0_8px_#ff0055]'
      : 'bg-[#00ffea] border-[#00ffea] shadow-[0_0_8px_#00ffea]'
    : 'bg-slate-800 border-slate-700';
  return <div className={cn('w-3 h-3 rounded-full border transition-all duration-300', glow)} />;
};

const StrengthBar = ({ score }: { score: number }) => {
  const w = Math.min(100, Math.abs(score) / 3 * 100);
  return (
    <div className="flex-1 flex items-center h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
      <div className="flex-1 flex justify-end pr-px border-r border-slate-700/60 h-full">
        {score < 0 && (
          <div className="h-full bg-[#ff0055] rounded-l-full transition-all duration-500"
            style={{ width: `${w}%` }} />
        )}
      </div>
      <div className="flex-1 flex justify-start pl-px h-full">
        {score > 0 && (
          <div className="h-full bg-[#00ffea] rounded-r-full transition-all duration-500"
            style={{ width: `${w}%` }} />
        )}
      </div>
    </div>
  );
};

// ─── Panel 1: Power Radar ──────────────────────────────────────────────────────
const PowerRadar = ({ scores }: { scores: Record<string, number> }) => {
  const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD'];
  const rows = CURRENCIES.map(cur => ({ cur, score: scores[cur] ?? 0 }))
    .sort((a, b) => b.score - a.score);
  const predator = rows[0];
  const prey = rows[rows.length - 1];
  const delta = predator.score - prey.score;

  return (
    <PanelCard title="Power Radar (30m Matrix)" icon={Target} className="lg:col-span-3">
      <div className="space-y-2.5 mb-5">
        {rows.map(({ cur, score }) => (
          <div key={cur} className="flex items-center gap-2 text-xs">
            <span className="w-5 text-center text-base leading-none">{FLAGS[cur] ?? '🏳️'}</span>
            <span className="w-8 font-bold text-white font-mono">{cur}</span>
            <StrengthBar score={score} />
            <span className={cn(
              'w-9 text-right font-bold font-mono tabular-nums',
              score > 0 ? 'text-[#00ffea]' : score < 0 ? 'text-[#ff0055]' : 'text-slate-500'
            )}>
              {score > 0 ? '+' : ''}{score.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-auto bg-slate-950 border border-yellow-500/30 rounded-lg p-3">
        <p className="text-[9px] text-yellow-500/70 mb-1 tracking-widest uppercase">Best Chomp Detected</p>
        <div className="flex justify-between items-center flex-wrap gap-1">
          <span className="font-bold text-white text-base font-mono">
            {predator.cur}/{prey.cur}
          </span>
          <span className="text-[#00ffea] font-bold text-sm font-mono">Δ {delta.toFixed(1)}</span>
        </div>
        <p className="text-[9px] text-slate-400 mt-1">
          Predator: {predator.cur} ({predator.score > 0 ? '+' : ''}{predator.score}) · Prey: {prey.cur} ({prey.score})
        </p>
      </div>
    </PanelCard>
  );
};

// ─── Panel 2: Triple-Lock Scanner ─────────────────────────────────────────────
const TripleLockScanner = ({ signals }: { signals: MatrixSignal[] }) => (
  <PanelCard title="Triple-Lock Execution Scanner" icon={Crosshair} className="lg:col-span-9">
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-800 text-slate-500">
            <th className="pb-3 font-normal uppercase tracking-widest">Pair</th>
            <th className="pb-3 font-normal uppercase tracking-widest">Vector</th>
            <th className="pb-3 font-normal uppercase tracking-widest text-center">G1 Matrix</th>
            <th className="pb-3 font-normal uppercase tracking-widest text-center">G2 Snap</th>
            <th className="pb-3 font-normal uppercase tracking-widest text-center">G3 LinReg</th>
            <th className="pb-3 font-normal uppercase tracking-widest text-center">Score</th>
            <th className="pb-3 font-normal uppercase tracking-widest text-right">Ops Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/40">
          {signals.map((s) => {
            const isStrike = s.triplelock;
            const dir = s.direction?.toUpperCase() ?? 'NEUTRAL';
            const isLong = s.direction === 'long';
            const isShort = s.direction === 'short';
            const isJPY = s.instrument.includes('JPY');
            const slope = s.gate3Detail?.slope ?? 0;

            return (
              <tr key={s.instrument}
                className={cn(
                  'hover:bg-slate-800/20 transition-colors',
                  isStrike && 'bg-[#00ffea]/3'
                )}>
                <td className="py-3 font-bold text-white font-mono">
                  {s.instrument.replace('_', '/')}
                </td>
                <td className={cn(
                  'py-3 font-bold font-mono',
                  isLong ? 'text-[#00ffea]' : isShort ? 'text-[#ff0055]' : 'text-slate-500'
                )}>
                  <span className="flex items-center gap-1">
                    {isLong && <TrendingUp className="w-3 h-3" />}
                    {isShort && <TrendingDown className="w-3 h-3" />}
                    {dir}
                  </span>
                </td>
                <td className="py-3 text-center">
                  <div className="flex justify-center"><GateLight open={s.gate1} dir={dir} /></div>
                </td>
                <td className="py-3 text-center">
                  <div className="flex justify-center"><GateLight open={s.gate2} dir={dir} /></div>
                </td>
                <td className="py-3 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <GateLight open={s.gate3} dir={dir} />
                    <span className="text-[9px] text-slate-500 font-mono">
                      m={slope > 0 ? '+' : ''}{slope.toExponential(2)}
                    </span>
                  </div>
                </td>
                <td className="py-3 text-center">
                  <span className={cn(
                    'font-mono font-bold',
                    s.sobScore > 0 ? 'text-[#00ffea]' : s.sobScore < 0 ? 'text-[#ff0055]' : 'text-slate-500'
                  )}>
                    {s.sobScore > 0 ? '+' : ''}{s.sobScore}
                  </span>
                </td>
                <td className="py-3 text-right">
                  {isStrike ? (
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-[9px] font-bold uppercase tracking-widest border animate-pulse',
                      isLong
                        ? 'bg-[#00ffea]/10 text-[#00ffea] border-[#00ffea]/50 shadow-[0_0_12px_rgba(0,255,234,0.25)]'
                        : 'bg-[#ff0055]/10 text-[#ff0055] border-[#ff0055]/50 shadow-[0_0_12px_rgba(255,0,85,0.25)]'
                    )}>
                      <Zap className="w-2.5 h-2.5" /> SOVEREIGN STRIKE
                    </span>
                  ) : (
                    <span className="text-slate-600 text-[9px] tracking-widest uppercase font-mono">
                      {[s.gate1, s.gate2, s.gate3].filter(Boolean).length}/3 Gates
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </PanelCard>
);

// ─── Panel 3: Strike Card (Live Execution) ─────────────────────────────────────
const StrikeExecutionCard = ({
  signal, onFireT1, onFireT2, onFireT3, loading, environment,
}: {
  signal: MatrixSignal; onFireT1: () => void; onFireT2: () => void;
  onFireT3: () => void; loading: boolean; environment: Env;
}) => {
  const isLong = signal.direction === 'long';
  const isJPY = signal.instrument.includes('JPY');
  const decimals = isJPY ? 3 : 5;
  const pair = signal.instrument.replace('_', '/');

  const hardSL = (signal.currentPrice - (isLong ? 1 : -1) * pips(15, signal.instrument)).toFixed(decimals);
  const hardTP = (signal.currentPrice + (isLong ? 1 : -1) * pips(50, signal.instrument)).toFixed(decimals);
  const ratchetAt = (signal.currentPrice + (isLong ? 1 : -1) * pips(20, signal.instrument)).toFixed(decimals);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-xl border p-4 space-y-3',
        isLong
          ? 'bg-[#00ffea]/5 border-[#00ffea]/40 shadow-[0_0_20px_rgba(0,255,234,0.08)]'
          : 'bg-[#ff0055]/5 border-[#ff0055]/40 shadow-[0_0_20px_rgba(255,0,85,0.08)]'
      )}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Lock className={cn('w-4 h-4', isLong ? 'text-[#00ffea]' : 'text-[#ff0055]')} />
          <span className={cn('font-bold text-sm tracking-wider font-mono uppercase', isLong ? 'text-[#00ffea]' : 'text-[#ff0055]')}>
            ⚡ SOVEREIGN STRIKE — {pair}
          </span>
        </div>
        <span className={cn(
          'text-[9px] font-mono px-2 py-0.5 rounded-sm border font-bold',
          isLong ? 'border-[#00ffea]/40 text-[#00ffea]' : 'border-[#ff0055]/40 text-[#ff0055]'
        )}>
          {signal.direction?.toUpperCase()} · {signal.currentPrice.toFixed(decimals)}
        </span>
      </div>

      <div className="text-[9px] text-slate-400 font-mono">
        {signal.baseCurrency} ({signal.baseScore > 0 ? '+' : ''}{signal.baseScore}) vs {signal.quoteCurrency} ({signal.quoteScore > 0 ? '+' : ''}{signal.quoteScore})
        · G1 ✓ · G2 ✓ · G3 ✓ · slope {signal.gate3Detail?.slope?.toExponential(2)}
      </div>

      <div className="grid grid-cols-3 gap-2 text-[9px]">
        <div className="bg-slate-950 border border-[#ff0055]/30 p-2 rounded text-center">
          <span className="text-[#ff0055] block font-bold mb-0.5">HARD SL</span>
          <span className="text-white font-mono">{hardSL}</span>
          <span className="text-slate-500 block">−15 pips</span>
        </div>
        <div className="bg-slate-950 border border-yellow-500/30 p-2 rounded text-center relative">
          <Lock className="w-2.5 h-2.5 text-yellow-500 absolute top-1 right-1" />
          <span className="text-yellow-500 block font-bold mb-0.5">RATCHET</span>
          <span className="text-white font-mono">{ratchetAt}</span>
          <span className="text-slate-500 block">+20p → +2p SL</span>
        </div>
        <div className="bg-slate-950 border border-[#00ffea]/30 p-2 rounded text-center">
          <span className="text-[#00ffea] block font-bold mb-0.5">HARD TP</span>
          <span className="text-white font-mono">{hardTP}</span>
          <span className="text-slate-500 block">+50 pips</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={onFireT1}
          disabled={loading}
          className={cn(
            'h-8 rounded text-[10px] font-bold font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-1',
            isLong
              ? 'bg-[#00ffea] text-slate-950 hover:bg-[#00ffea]/80 shadow-[0_0_12px_rgba(0,255,234,0.4)]'
              : 'bg-[#ff0055] text-white hover:bg-[#ff0055]/80 shadow-[0_0_12px_rgba(255,0,85,0.4)]',
            loading && 'opacity-50 cursor-not-allowed'
          )}
        >
          <Zap className="w-3 h-3" /> T1 {TIER_UNITS.T1}u
        </button>
        <button
          onClick={onFireT2}
          disabled={loading}
          className={cn(
            'h-8 rounded text-[10px] font-bold font-mono uppercase tracking-wider border transition-all',
            isLong
              ? 'border-[#00ffea]/40 text-[#00ffea] hover:bg-[#00ffea]/10'
              : 'border-[#ff0055]/40 text-[#ff0055] hover:bg-[#ff0055]/10',
            loading && 'opacity-50 cursor-not-allowed'
          )}
        >
          T2 +15p {TIER_UNITS.T2}u
        </button>
        <button
          onClick={onFireT3}
          disabled={loading}
          className={cn(
            'h-8 rounded text-[10px] font-bold font-mono uppercase tracking-wider border transition-all',
            'border-yellow-500/40 text-yellow-500 hover:bg-yellow-500/10',
            loading && 'opacity-50 cursor-not-allowed'
          )}
        >
          T3 +30p 250u
        </button>
      </div>
    </motion.div>
  );
};

// ─── Panel 4: Kinetic Pyramid ─────────────────────────────────────────────────
const KineticPyramid = () => (
  <PanelCard title="Kinetic Pyramid — 1,250u Scaling" icon={TrendingUp} className="lg:col-span-6">
    <div className="flex justify-around items-end h-28 mb-5 gap-3">
      {[
        { label: 'T1 @ STRIKE', units: '500u', h: 'h-10', bg: 'bg-[#00ffea]/15 border-[#00ffea]/40', text: 'text-[#00ffea]' },
        { label: 'T2 @ +15 Pips', units: '500u', h: 'h-20', bg: 'bg-[#00ffea]/30 border-[#00ffea]/50', text: 'text-[#00ffea]' },
        { label: 'T3 @ +30 Pips', units: '250u', h: 'h-28', bg: 'bg-[#00ffea]/60 border-[#00ffea]', text: 'text-slate-950' },
      ].map(({ label, units, h, bg, text }) => (
        <div key={label} className="flex-1 flex flex-col items-center">
          <div className={cn('w-full border rounded-t flex items-center justify-center font-bold text-xs font-mono', h, bg, text)}>
            {units}
          </div>
          <span className="text-[9px] mt-1.5 text-slate-400 text-center leading-tight">{label}</span>
        </div>
      ))}
    </div>
    <div className="bg-slate-950 p-3.5 rounded-lg border border-yellow-500/20">
      <p className="text-[9px] text-yellow-500/70 mb-2 uppercase tracking-widest text-center">Weighted Anchor Formula</p>
      <code className="block text-center text-yellow-400 text-xs font-mono bg-yellow-500/8 py-2.5 rounded border border-yellow-500/10">
        P_anchor = ((500×P1) + (500×P2) + (250×P3)) / 1250
      </code>
      <p className="text-[9px] text-yellow-500/50 mt-2 text-center">P_anchor = unified risk line · SL is −15p from here</p>
    </div>
  </PanelCard>
);

// ─── Panel 5: Safety Rails ────────────────────────────────────────────────────
const SafetyRails = () => (
  <PanelCard title="Safety Rails & Exit Protocol" icon={Shield}
    className="lg:col-span-6" accentColor="border-[#ff0055]/30">
    <ul className="space-y-2.5">
      {[
        {
          icon: AlertTriangle, color: 'text-[#ff0055]', bg: 'border-[#ff0055]/20',
          title: 'Rule 1 — Vector Flip (Primary)',
          desc: 'LinReg slope (m) changes sign → EXIT ALL POSITIONS immediately.',
        },
        {
          icon: Zap, color: 'text-purple-400', bg: 'border-purple-500/20',
          title: 'Rule 2 — Matrix Decouple',
          desc: 'Base or Quote currency score hits 0 → EXIT ALL POSITIONS.',
        },
      ].map(({ icon: Icon, color, bg, title, desc }) => (
        <li key={title} className={cn('flex gap-3 bg-slate-950/50 p-3 rounded border', bg)}>
          <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', color)} />
          <div>
            <p className={cn('text-[10px] font-bold uppercase tracking-wider', color)}>{title}</p>
            <p className="text-[9px] text-slate-400 mt-0.5">{desc}</p>
          </div>
        </li>
      ))}
      <li className="grid grid-cols-3 gap-2">
        <div className="bg-slate-950 border border-[#ff0055]/25 p-2.5 rounded text-center">
          <span className="block text-[9px] text-slate-500 mb-1 uppercase tracking-wider">Hard SL</span>
          <span className="font-bold text-[#ff0055] font-mono">−15 Pips</span>
          <span className="block text-[8px] text-slate-600 mt-0.5">from P_anchor</span>
        </div>
        <div className="bg-slate-950 border border-yellow-500/30 p-2.5 rounded text-center relative overflow-hidden">
          <Lock className="w-2.5 h-2.5 text-yellow-500 absolute top-1 right-1" />
          <span className="block text-[9px] text-yellow-500 mb-1 uppercase tracking-wider">Ratchet</span>
          <span className="font-bold text-white font-mono text-xs">P_anchor+2p</span>
          <span className="block text-[8px] text-slate-500 mt-0.5">at +20 Pip mark</span>
        </div>
        <div className="bg-slate-950 border border-[#00ffea]/25 p-2.5 rounded text-center">
          <span className="block text-[9px] text-slate-500 mb-1 uppercase tracking-wider">Hard TP</span>
          <span className="font-bold text-[#00ffea] font-mono">+50 Pips</span>
          <span className="block text-[8px] text-slate-600 mt-0.5">from P_anchor</span>
        </div>
      </li>
    </ul>
  </PanelCard>
);

// ─── Main Dashboard ────────────────────────────────────────────────────────────
const SovereignMatrix = () => {
  const [environment, setEnvironment] = useState<Env>('live');
  const { loading, matrixResult, error, scanMatrix, fireT1, fireT2, fireT3 } = useSovereignMatrix();

  const handleScan = () => scanMatrix(environment);

  // Build mock scores for idle state UI (replaced by real data after scan)
  const displayResult: MatrixResult | null = matrixResult;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-mono overflow-x-hidden">
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur-sm border-b border-slate-800/60 px-6 py-3">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-[#00ffea]" />
            <div>
              <h1 className="text-base font-black text-white tracking-tighter leading-none">
                SOVEREIGN MATRIX <span className="text-slate-500 font-light">v20.0</span>
              </h1>
              <p className="text-[9px] text-slate-500 tracking-widest mt-0.5">
                MECHANICAL CHOMP · 30M MACRO · TRIPLE-LOCK ENTRY
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link to="/oanda">
              <button className="flex items-center gap-1.5 text-[10px] font-mono px-3 py-1.5 rounded border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-all">
                <Wifi className="w-3 h-3" /> OANDA
              </button>
            </Link>

            {/* Env toggle */}
            <div className="flex items-center gap-0.5 p-0.5 rounded border border-slate-700/50 bg-slate-900">
              {(['practice', 'live'] as Env[]).map((env) => (
                <button key={env} onClick={() => setEnvironment(env)}
                  className={cn(
                    'text-[9px] font-mono px-2.5 py-1 rounded transition-all',
                    environment === env
                      ? env === 'live'
                        ? 'bg-[#ff0055] text-white'
                        : 'bg-slate-600 text-white'
                      : 'text-slate-500 hover:text-slate-300'
                  )}>
                  {env.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              onClick={handleScan}
              disabled={loading}
              className={cn(
                'flex items-center gap-1.5 text-[10px] font-mono px-4 py-1.5 rounded font-bold uppercase tracking-wider transition-all',
                'bg-[#00ffea] text-slate-950 hover:bg-[#00ffea]/80 shadow-[0_0_16px_rgba(0,255,234,0.3)]',
                loading && 'opacity-60 cursor-not-allowed'
              )}>
              <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
              {loading ? 'Scanning…' : 'Run Matrix Scan'}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto p-6 space-y-5">
        {/* ── Error ── */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-[#ff0055]/10 border border-[#ff0055]/30 text-[#ff0055] text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* ── Idle State ── */}
        {!displayResult && !loading && !error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="py-20 text-center space-y-4">
            <Grid3x3 className="w-14 h-14 mx-auto text-slate-700" />
            <p className="text-sm text-slate-400 tracking-wider">
              Run the 30m Macro Matrix scan to evaluate all major pairs
            </p>
            <p className="text-[10px] text-slate-600 tracking-widest">
              Veff Atlas Wall · G1 Matrix Alignment · G2 Atlas Snap · G3 David Vector
            </p>
            <button
              onClick={handleScan}
              className="mt-2 inline-flex items-center gap-2 px-6 py-2.5 rounded bg-[#00ffea] text-slate-950 font-bold text-xs uppercase tracking-widest hover:bg-[#00ffea]/80 shadow-[0_0_20px_rgba(0,255,234,0.3)] transition-all"
            >
              <Zap className="w-4 h-4" /> Run Matrix Scan
            </button>
          </motion.div>
        )}

        {/* ── Results Grid ── */}
        {displayResult && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Meta badges */}
            <div className="flex items-center gap-2 flex-wrap mb-5">
              <span className="text-[9px] font-mono px-2 py-1 rounded border border-slate-700 text-slate-400">
                {new Date(displayResult.timestamp).toLocaleTimeString()}
              </span>
              <span className={cn(
                'text-[9px] font-mono px-2 py-1 rounded border font-bold',
                displayResult.strikeCount > 0
                  ? 'border-[#00ffea]/40 text-[#00ffea] bg-[#00ffea]/10'
                  : 'border-slate-700 text-slate-500'
              )}>
                <Zap className="inline w-2.5 h-2.5 mr-1" />
                {displayResult.strikeCount} STRIKE{displayResult.strikeCount !== 1 ? 'S' : ''}
              </span>
              <span className="text-[9px] font-mono px-2 py-1 rounded border border-slate-700 text-slate-400">
                {displayResult.environment.toUpperCase()} · {displayResult.signals.length} pairs
              </span>
            </div>

            {/* ── Main grid ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Power Radar */}
              <PowerRadar scores={displayResult.currencyScores} />

              {/* Triple-Lock Scanner */}
              <TripleLockScanner signals={displayResult.signals} />

              {/* Active Strike Execution Cards (full width) */}
              {displayResult.strikes.length > 0 && (
                <div className="lg:col-span-12 space-y-3">
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Zap className="w-3 h-3 text-[#00ffea]" />
                    Triple-Lock Strikes — Payload Ready for Delivery
                  </p>
                  {displayResult.strikes.map((signal) => (
                    <StrikeExecutionCard
                      key={signal.instrument}
                      signal={signal}
                      environment={environment}
                      onFireT1={() => fireT1(signal, environment)}
                      onFireT2={() => fireT2(signal, environment)}
                      onFireT3={() => fireT3(signal, environment)}
                      loading={loading}
                    />
                  ))}
                </div>
              )}

              {/* Kinetic Pyramid + Safety Rails */}
              <KineticPyramid />
              <SafetyRails />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default SovereignMatrix;
