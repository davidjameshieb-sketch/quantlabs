// Sovereign Matrix v20.0 — Mechanical Chomp
// Blueprint: SOB Score (V_eff = Volume / Range) → Synthetic Strength → Triple-Lock Gate
// G1: Global Matrix Alignment | G2: Atlas Snap (close > Highest) | G3: David Vector (linreg slope)

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Crosshair, TrendingUp, TrendingDown, Minus,
  Activity, Target, Shield, Zap, ArrowUp, ArrowDown
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSyntheticOrderBook, type PairPhysics } from '@/hooks/useSyntheticOrderBook';

// ─────────────────────────────────────────────────────────────────────────────
// SOB SCORE MATH (mirrors PineScript v20.0)
//
// Pine:   v_eff = volume / (high - low)
//         is_cluster = v_eff > avg_v_eff * 1.5
//         close > block_hi → +1  |  close < block_lo → -1  |  else → 0
//
// Proxy:  We receive PairPhysics from the backend physics engine.
//         • "efficiency" field = OFI / KM_D1 (Force/Velocity). High E = active cluster.
//         • "zOfi" = Z-score of net order flow. Statistically significant positive zOfi
//           means price is ABOVE the structural block (buyers overwhelmed the wall → +1).
//         • zOfi < -1.5 means price is below the block (→ -1).
//         • Cluster gate: efficiency > 3.0 (active liquidity absorption present).
// ─────────────────────────────────────────────────────────────────────────────
function getSobScore(p: PairPhysics | null): number {
  if (!p) return 0;

  const E   = p.efficiency ?? 0;
  const z   = p.zOfi ?? 0;

  // Volume cluster active (equivalent to v_eff > 1.5σ above mean)
  const isCluster = E > 3.0;
  if (!isCluster) return 0;

  // Price position relative to cluster block walls
  if (z > 1.5)  return  1;   // close > Block High  (buyers above the wall)
  if (z < -1.5) return -1;   // close < Block Low   (sellers below the wall)
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNTHETIC CURRENCY STRENGTH (mirrors Pine §4)
//
// EUR_strength = S_sob(EURUSD) + S_sob(EURGBP) + ...
// Inversion rule: if currency is the Quote, score is negated.
//
// We have 7 pillars from the snapshot. Derived per Pine's exact formula:
//   f_eur = s_eurusd
//   f_cad = -s_usdcad   ← USD is base, so CAD score = negative of pair score
//   f_usd = -(eur+gbp+aud+nzd) + (cad+chf+jpy) pairs
// ─────────────────────────────────────────────────────────────────────────────
export interface CurrencyStrength {
  currency: string;
  score: number;
  emoji: string;
}

interface PillarScores {
  EUR_USD: number; GBP_USD: number; AUD_USD: number; NZD_USD: number;
  USD_CAD: number; USD_CHF: number; USD_JPY: number;
}

function computeStrengths(s: PillarScores): CurrencyStrength[] {
  const f_eur = s.EUR_USD;
  const f_gbp = s.GBP_USD;
  const f_aud = s.AUD_USD;
  const f_nzd = s.NZD_USD;
  const f_cad = -s.USD_CAD;
  const f_chf = -s.USD_CHF;
  const f_jpy = -s.USD_JPY;
  const f_usd = -(s.EUR_USD + s.GBP_USD + s.AUD_USD + s.NZD_USD) + (s.USD_CAD + s.USD_CHF + s.USD_JPY);

  return ([
    { currency: 'USD', score: f_usd, emoji: '🇺🇸' },
    { currency: 'EUR', score: f_eur, emoji: '🇪🇺' },
    { currency: 'GBP', score: f_gbp, emoji: '🇬🇧' },
    { currency: 'JPY', score: f_jpy, emoji: '🇯🇵' },
    { currency: 'AUD', score: f_aud, emoji: '🇦🇺' },
    { currency: 'CAD', score: f_cad, emoji: '🇨🇦' },
    { currency: 'CHF', score: f_chf, emoji: '🇨🇭' },
    { currency: 'NZD', score: f_nzd, emoji: '🇳🇿' },
  ] as CurrencyStrength[]).sort((a, b) => b.score - a.score);
}

// Best Chomp = maximum score delta (Predator vs Prey)
function getBestPair(strengths: CurrencyStrength[]) {
  if (strengths.length < 2) return null;
  const predator = strengths[0];
  const prey = strengths[strengths.length - 1];
  const delta = predator.score - prey.score;
  if (delta <= 0) return null;
  return { predator, prey, pair: `${predator.currency}/${prey.currency}`, delta };
}

// ─────────────────────────────────────────────────────────────────────────────
// TRIPLE-LOCK GATE (v20.0 exact spec)
//
// Gate 1 — Global Matrix (G1):
//   Long:  Base_Currency ≥ +1  AND  Quote_Currency ≤ -1
//   Short: Base_Currency ≤ -1  AND  Quote_Currency ≥ +1
//
// Gate 2 — Atlas Snap (G2) — "close > Highest(High, 20)":
//   We proxy this as a STATISTICALLY SIGNIFICANT net Z-OFI breakout
//   above (long) or below (short) the cluster boundary, with an active
//   volume cluster (E > 3). This is equivalent to price crossing above
//   the structural block high in the Pine implementation.
//   Long:  zOfi > 1.5  AND  isCluster
//   Short: zOfi < -1.5 AND  isCluster
//
// Gate 3 — David Vector (G3) — Linear Regression Slope:
//   Pine: vector = ta.linreg(close, 20, 0); slope = vector - vector[1]
//   Proxy: Kramers-Moyal D1 coefficient = tick-level drift = the expected
//   rate of price change per unit time → mathematically equivalent to
//   the slope (m) of a linear regression line fitted to recent prices.
//   Long:  D1 > 0  (positive slope, cyan vector)
//   Short: D1 < 0  (negative slope, red vector)
// ─────────────────────────────────────────────────────────────────────────────
export interface StrikeCheck {
  pair: string;
  direction: 'long' | 'short' | null;
  locked: boolean;
  gate1_matrix: boolean;
  gate2_atlas: boolean;
  gate3_vector: boolean;
  baseScore: number;
  quoteScore: number;
  // David Vector (KM D1 = linreg slope proxy)
  vectorSlope: number;
  vectorColor: 'cyan' | 'red' | 'gray';
  // Atlas Snap (Z-OFI = structural breakout proxy)
  zOfi: number;
}

function checkTripleLock(
  pair: string,
  strengths: CurrencyStrength[],
  physics: PairPhysics | null
): StrikeCheck {
  const [baseCur, quoteCur] = pair.split('_');
  const scoreMap = Object.fromEntries(strengths.map(s => [s.currency, s.score]));
  const baseScore  = scoreMap[baseCur]  ?? 0;
  const quoteScore = scoreMap[quoteCur] ?? 0;

  // ── G1: Global Matrix Alignment ──────────────────────────────────────────
  const isLongAligned  = baseScore >= 1  && quoteScore <= -1;
  const isShortAligned = baseScore <= -1 && quoteScore >= 1;
  const gate1_matrix   = isLongAligned || isShortAligned;
  const direction      = isLongAligned ? 'long' : isShortAligned ? 'short' : null;

  // ── G2: Atlas Snap (close > Highest High / close < Lowest Low) ───────────
  const E          = physics?.efficiency ?? 0;
  const z          = physics?.zOfi ?? 0;
  const isCluster  = E > 3.0;
  const gate2_atlas =
    direction === 'long'  ? isCluster && z > 1.5  :
    direction === 'short' ? isCluster && z < -1.5 :
    false;

  // ── G3: David Vector — Linear Regression Slope (KM D1) ───────────────────
  const D1          = physics?.kramersMoyal?.D1 ?? 0;
  const vectorSlope = D1;
  const vectorColor: 'cyan' | 'red' | 'gray' =
    D1 > 0 ? 'cyan' : D1 < 0 ? 'red' : 'gray';
  const gate3_vector =
    direction === 'long'  ? D1 > 0 :
    direction === 'short' ? D1 < 0 :
    false;

  return {
    pair, direction,
    locked: gate1_matrix && gate2_atlas && gate3_vector,
    gate1_matrix, gate2_atlas, gate3_vector,
    baseScore, quoteScore,
    vectorSlope, vectorColor, zOfi: z,
  };
}

// ─── Pairs scanned ───────────────────────────────────────────────────────────
const SCAN_PAIRS = [
  'EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD',
  'USD_CAD', 'USD_CHF', 'NZD_USD', 'EUR_GBP', 'EUR_JPY', 'GBP_JPY',
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export function SovereignMatrixDashboard() {
  const { snapshot } = useSyntheticOrderBook();
  const physics = snapshot?.pairs ?? {};

  const pillarScores = useMemo<PillarScores>(() => ({
    EUR_USD: getSobScore(physics['EUR_USD'] ?? null),
    GBP_USD: getSobScore(physics['GBP_USD'] ?? null),
    AUD_USD: getSobScore(physics['AUD_USD'] ?? null),
    NZD_USD: getSobScore(physics['NZD_USD'] ?? null),
    USD_CAD: getSobScore(physics['USD_CAD'] ?? null),
    USD_CHF: getSobScore(physics['USD_CHF'] ?? null),
    USD_JPY: getSobScore(physics['USD_JPY'] ?? null),
  }), [physics]);

  const strengths    = useMemo(() => computeStrengths(pillarScores), [pillarScores]);
  const bestPair     = useMemo(() => getBestPair(strengths), [strengths]);

  const strikeChecks = useMemo(() =>
    SCAN_PAIRS
      .map(p => checkTripleLock(p, strengths, physics[p] ?? null))
      .sort((a, b) => {
        const ag = [a.gate1_matrix, a.gate2_atlas, a.gate3_vector].filter(Boolean).length;
        const bg = [b.gate1_matrix, b.gate2_atlas, b.gate3_vector].filter(Boolean).length;
        return bg - ag;
      }),
  [strengths, physics]);

  const lockedStrikes = strikeChecks.filter(s => s.locked);

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Crosshair className="w-5 h-5 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">
          Sovereign Matrix
        </h2>
        <Badge className="text-[9px] h-4 px-1.5 font-mono border-0 bg-primary/20 text-primary">
          MECHANICAL CHOMP v20.0
        </Badge>
        <Badge className="text-[9px] h-4 px-1.5 font-mono border-0 bg-muted/30 text-muted-foreground">
          V_eff · LinReg · Z-OFI
        </Badge>
        {lockedStrikes.length > 0 && (
          <Badge className="text-[9px] h-4 px-1.5 font-mono border-0 bg-emerald-500/20 text-emerald-300 animate-pulse ml-auto">
            ⚡ {lockedStrikes.length} SOVEREIGN STRIKE{lockedStrikes.length > 1 ? 'S' : ''} LOCKED
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Power Radar ── */}
        <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30 bg-muted/30">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Power Radar</span>
            <span className="ml-auto text-[9px] text-muted-foreground font-mono">
              S<sub>curr</sub> = Σ S<sub>sob</sub>
            </span>
          </div>

          {/* Currency rows */}
          <div className="p-3 space-y-1">
            {strengths.map((s, i) => {
              const isPredator = i === 0;
              const isPrey     = i === strengths.length - 1;
              return (
                <div
                  key={s.currency}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-colors ${
                    isPredator ? 'bg-emerald-500/15 border-emerald-500/30' :
                    isPrey     ? 'bg-red-500/15 border-red-500/30' :
                                 'bg-muted/10 border-transparent'
                  }`}
                >
                  <span className="text-[11px]">{s.emoji}</span>
                  <span className={`text-[11px] font-mono font-black w-7 ${
                    isPredator ? 'text-emerald-300' : isPrey ? 'text-red-300' : 'text-muted-foreground'
                  }`}>{s.currency}</span>

                  {/* Strength bar — centred on 0, fills left or right */}
                  <div className="flex-1 flex items-center gap-0.5">
                    {/* Negative side */}
                    <div className="flex-1 h-1.5 bg-muted/20 rounded-full overflow-hidden flex justify-end">
                      <div
                        className="h-full bg-red-400 rounded-full transition-all duration-700"
                        style={{ width: s.score < 0 ? '100%' : '0%' }}
                      />
                    </div>
                    {/* Divider */}
                    <div className="w-px h-2.5 bg-border/40 mx-0.5 flex-shrink-0" />
                    {/* Positive side */}
                    <div className="flex-1 h-1.5 bg-muted/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 rounded-full transition-all duration-700"
                        style={{ width: s.score > 0 ? '100%' : '0%' }}
                      />
                    </div>
                  </div>

                  <span className={`text-[11px] font-mono font-bold w-6 text-right ${
                    s.score > 0 ? 'text-emerald-400' : s.score < 0 ? 'text-red-400' : 'text-muted-foreground'
                  }`}>{s.score > 0 ? '+1' : s.score < 0 ? '-1' : '0'}</span>

                  {isPredator && <span className="text-[9px]">🦁</span>}
                  {isPrey     && <span className="text-[9px]">🎯</span>}
                </div>
              );
            })}
          </div>

          {/* ── Best Chomp (Power Pair) ── */}
          <div className="px-3 pb-3">
            <div className={`rounded-lg border px-2.5 py-2 ${
              bestPair
                ? 'border-yellow-500/50 bg-yellow-500/10'
                : 'border-border/30 bg-muted/10'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-mono uppercase text-yellow-400 font-bold">
                  ⚡ BEST CHOMP — MAX Δ
                </span>
                <span className="text-[12px] font-mono font-black text-yellow-200">
                  {bestPair?.pair ?? 'SCANNING…'}
                </span>
              </div>
              {bestPair && (
                <div className="flex items-center justify-between text-[9px] font-mono">
                  <span className="text-emerald-400">🦁 {bestPair.predator.currency} +{bestPair.predator.score}</span>
                  <span className="text-muted-foreground">Δ {bestPair.delta}</span>
                  <span className="text-red-400">🎯 {bestPair.prey.currency} {bestPair.prey.score}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Triple-Lock Gate Scanner ── */}
        <div className="lg:col-span-2 rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30 bg-muted/30">
            <Shield className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              Triple-Lock Gate — Mechanical Chomp
            </span>
            <span className="ml-auto text-[9px] text-muted-foreground font-mono">
              {lockedStrikes.length} LOCKED
            </span>
          </div>

          {/* Column headers */}
          <div className="px-3 pt-2 pb-1 grid grid-cols-[4.5rem_4rem_1fr_auto_auto] gap-2 text-[8px] font-mono text-muted-foreground/60 uppercase tracking-wider border-b border-border/20">
            <span>Pair</span>
            <span>Dir</span>
            <span>David Vector (LinReg m)</span>
            <span className="text-center">Gates</span>
            <span />
          </div>

          <ScrollArea className="h-[310px]">
            <div className="p-3 space-y-1.5">
              {strikeChecks.map((s) => {
                const gatesOpen = [s.gate1_matrix, s.gate2_atlas, s.gate3_vector].filter(Boolean).length;
                const slopeAbs  = Math.min(Math.abs(s.vectorSlope) * 200, 100); // visual %
                return (
                  <motion.div
                    key={s.pair}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                      s.locked
                        ? s.direction === 'long'
                          ? 'bg-emerald-500/15 border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                          : 'bg-red-500/15 border-red-500/40 shadow-lg shadow-red-500/10'
                        : gatesOpen === 2
                          ? 'bg-muted/15 border-border/30'
                          : 'bg-muted/5 border-border/20 opacity-50'
                    }`}
                  >
                    {/* Pair */}
                    <span className="text-[11px] font-mono font-black text-foreground w-[4.5rem] flex-shrink-0">
                      {s.pair.replace('_', '/')}
                    </span>

                    {/* Direction */}
                    {s.direction ? (
                      <div className={`flex items-center gap-0.5 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border w-[3.8rem] justify-center flex-shrink-0 ${
                        s.direction === 'long'
                          ? 'bg-emerald-500/80 text-white border-emerald-400/60'
                          : 'bg-red-500/80 text-white border-red-400/60'
                      }`}>
                        {s.direction === 'long'
                          ? <><TrendingUp className="w-2.5 h-2.5" /> LONG</>
                          : <><TrendingDown className="w-2.5 h-2.5" /> SHORT</>}
                      </div>
                    ) : (
                      <div className="flex items-center gap-0.5 text-[9px] font-mono text-muted-foreground/50 px-1.5 py-0.5 w-[3.8rem] flex-shrink-0">
                        <Minus className="w-2.5 h-2.5" /> NEUTRAL
                      </div>
                    )}

                    {/* David Vector minibar (linreg slope) */}
                    <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-1">
                        {/* Slope indicator */}
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {s.vectorColor === 'cyan' && <ArrowUp className="w-2.5 h-2.5 text-cyan-400" />}
                          {s.vectorColor === 'red'  && <ArrowDown className="w-2.5 h-2.5 text-red-400" />}
                          {s.vectorColor === 'gray' && <Minus className="w-2.5 h-2.5 text-muted-foreground/40" />}
                          <span className={`text-[8px] font-mono font-bold ${
                            s.vectorColor === 'cyan' ? 'text-cyan-400' :
                            s.vectorColor === 'red'  ? 'text-red-400' :
                                                       'text-muted-foreground/40'
                          }`}>
                            {s.vectorColor === 'cyan' ? '▲' : s.vectorColor === 'red' ? '▼' : '—'} m={s.vectorSlope.toFixed(4)}
                          </span>
                        </div>
                        {/* Vector bar */}
                        <div className="flex-1 h-1 bg-muted/20 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${
                              s.vectorColor === 'cyan' ? 'bg-cyan-400' :
                              s.vectorColor === 'red'  ? 'bg-red-400' :
                                                         'bg-muted-foreground/20'
                            }`}
                            style={{ width: `${Math.max(4, slopeAbs)}%` }}
                          />
                        </div>
                      </div>
                      {/* Z-OFI (Atlas Snap indicator) */}
                      <div className="text-[7px] font-mono text-muted-foreground/50">
                        Z-OFI: <span className={
                          s.zOfi > 1.5 ? 'text-emerald-400' : s.zOfi < -1.5 ? 'text-red-400' : 'text-muted-foreground/40'
                        }>{s.zOfi.toFixed(2)}</span>
                        <span className="mx-1">·</span>
                        <span className={s.gate1_matrix ? 'text-emerald-400/70' : 'text-muted-foreground/30'}>
                          {s.pair.split('_')[0]}: {s.baseScore > 0 ? '+' : ''}{s.baseScore}
                        </span>
                        {' / '}
                        <span className={s.gate1_matrix ? 'text-red-400/70' : 'text-muted-foreground/30'}>
                          {s.pair.split('_')[1]}: {s.quoteScore > 0 ? '+' : ''}{s.quoteScore}
                        </span>
                      </div>
                    </div>

                    {/* Gates */}
                    <div className="flex gap-1 flex-shrink-0">
                      <GatePip label="G1" title="Matrix Alignment"   active={s.gate1_matrix} />
                      <GatePip label="G2" title="Atlas Snap (Z-OFI)" active={s.gate2_atlas} />
                      <GatePip label="G3" title="David Vector (D1)"  active={s.gate3_vector} />
                    </div>

                    {/* Strike badge */}
                    {s.locked && (
                      <Badge className="text-[8px] h-4 px-1 font-mono border-0 bg-yellow-500/25 text-yellow-300 animate-pulse flex-shrink-0">
                        ⚡ STRIKE
                      </Badge>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* ── Kinetic Pyramid + Exit Rules ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Scaling Protocol */}
        <div className={`rounded-xl border p-4 transition-all ${
          lockedStrikes.length > 0
            ? 'border-yellow-500/40 bg-yellow-500/5'
            : 'border-border/30 bg-card/40'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-yellow-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-yellow-300">
              Kinetic Pyramid — 1,250 Unit Load
            </span>
            <span className="ml-auto text-[8px] font-mono text-muted-foreground">
              P<sub>anchor</sub> = weighted avg
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { tier: 'T1', units: 500,  trigger: 'STRIKE Signal', sub: 'Market @ Strike',    cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
              { tier: 'T2', units: 500,  trigger: 'P_T1 + 15 pips', sub: '+500u added',        cls: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300' },
              { tier: 'T3', units: 250,  trigger: 'P_T2 + 15 pips', sub: 'Final payload',      cls: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
            ].map(t => (
              <div key={t.tier} className={`rounded-lg border px-3 py-2 ${t.cls}`}>
                <div className="text-[8px] font-mono opacity-70 mb-0.5">{t.tier}</div>
                <div className="text-[15px] font-mono font-black text-foreground">{t.units}u</div>
                <div className="text-[7px] font-mono opacity-60 mt-0.5">{t.trigger}</div>
                <div className="text-[7px] font-mono opacity-40">{t.sub}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 px-1 text-[8px] font-mono text-muted-foreground">
            <span className="text-yellow-400/80">Yellow Anchor</span> = (500 × P<sub>T1</sub> + 500 × P<sub>T2</sub> + 250 × P<sub>T3</sub>) / 1250
          </div>
        </div>

        {/* Exit Rules */}
        <div className="rounded-xl border border-border/30 bg-card/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">
              Exit &amp; Protection Rules
            </span>
          </div>
          <div className="space-y-2">
            {[
              {
                icon: '🔄',
                label: 'Vector Flip (Primary)',
                desc: 'David Vector slope (m) changes sign → EXIT all 1,250u immediately',
                color: 'text-cyan-400',
              },
              {
                icon: '🧩',
                label: 'Matrix Decouple',
                desc: 'Both currency scores return to 0 → flush position',
                color: 'text-purple-400',
              },
              {
                icon: '🎯',
                label: 'Hard TP',
                desc: '+50 pips from P_anchor',
                color: 'text-emerald-400',
              },
              {
                icon: '⛔',
                label: 'Hard SL',
                desc: '−15 pips from P_anchor',
                color: 'text-red-400',
              },
              {
                icon: '🔒',
                label: 'Kinetic Ratchet',
                desc: 'At +20 pips → move SL to P_anchor + 2 pips',
                color: 'text-yellow-400',
              },
            ].map(r => (
              <div key={r.label} className="flex items-start gap-2">
                <span className="text-[11px] flex-shrink-0 mt-0.5">{r.icon}</span>
                <div>
                  <div className={`text-[9px] font-mono font-bold ${r.color}`}>{r.label}</div>
                  <div className="text-[8px] font-mono text-muted-foreground leading-relaxed">{r.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gate Pip
// ─────────────────────────────────────────────────────────────────────────────
function GatePip({ label, title, active }: { label: string; title: string; active: boolean }) {
  return (
    <div
      title={title}
      className={`text-[8px] font-mono px-1.5 py-0.5 rounded border font-bold cursor-default ${
        active
          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
          : 'bg-muted/10 text-muted-foreground/30 border-border/20'
      }`}
    >
      {label}
    </div>
  );
}
