// Sovereign Matrix v19.4 — Power Radar & Predator/Prey Dashboard
// Currency strength from SOB score (Volume Efficiency × Structural Position)

import { useMemo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Crosshair, TrendingUp, TrendingDown, Minus, Zap, Activity, Target, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSyntheticOrderBook, type PairPhysics } from '@/hooks/useSyntheticOrderBook';

// ─── SOB Score per pair: structural position (close vs cluster bounds) ───
// We adapt the pine logic: uses efficiency (volume/range) above threshold as "cluster",
// then checks if close is above or below those walls. We approximate using VPIN + OFI.
function getSobScore(p: PairPhysics | null): number {
  if (!p) return 0;
  // Use efficiency + Z-score of OFI as a proxy for the volume-cluster structural position
  const E = p.efficiency ?? 0;
  const vpin = p.vpin ?? 0.5;
  const ofi = p.ofiRatio ?? 0;

  // Cluster active when E is high (liquid, absorbing)
  const isCluster = E > 5;
  if (!isCluster) return 0;

  // Structural position: high VPIN + positive OFI = above cluster wall = +1
  if (vpin > 0.55 && ofi > 0.1) return 1;
  if (vpin < 0.35 || ofi < -0.1) return -1;
  return 0;
}

// ─── Currency Strength Synthetic Math (mirrors Pine) ─────────────────────
export interface CurrencyStrength {
  currency: string;
  score: number;
  emoji: string;
}

interface PairScores {
  EUR_USD: number; GBP_USD: number; AUD_USD: number; NZD_USD: number;
  USD_CAD: number; USD_CHF: number; USD_JPY: number;
}

function computeStrengths(scores: PairScores): CurrencyStrength[] {
  const { EUR_USD, GBP_USD, AUD_USD, NZD_USD, USD_CAD, USD_CHF, USD_JPY } = scores;

  const f_eur = EUR_USD;
  const f_gbp = GBP_USD;
  const f_aud = AUD_USD;
  const f_nzd = NZD_USD;
  const f_cad = -USD_CAD;
  const f_chf = -USD_CHF;
  const f_jpy = -USD_JPY;
  const f_usd = -(EUR_USD + GBP_USD + AUD_USD + NZD_USD) + (USD_CAD + USD_CHF + USD_JPY);

  const currencies: CurrencyStrength[] = [
    { currency: 'USD', score: f_usd, emoji: '🇺🇸' },
    { currency: 'EUR', score: f_eur, emoji: '🇪🇺' },
    { currency: 'GBP', score: f_gbp, emoji: '🇬🇧' },
    { currency: 'JPY', score: f_jpy, emoji: '🇯🇵' },
    { currency: 'AUD', score: f_aud, emoji: '🇦🇺' },
    { currency: 'CAD', score: f_cad, emoji: '🇨🇦' },
    { currency: 'CHF', score: f_chf, emoji: '🇨🇭' },
    { currency: 'NZD', score: f_nzd, emoji: '🇳🇿' },
  ];

  return currencies.sort((a, b) => b.score - a.score);
}

// Best pair = strongest vs weakest
function getBestPair(strengths: CurrencyStrength[]): { predator: CurrencyStrength; prey: CurrencyStrength; pair: string } | null {
  if (strengths.length < 2) return null;
  const predator = strengths[0];
  const prey = strengths[strengths.length - 1];
  if (predator.score <= 0 && prey.score >= 0) return null; // no clear divergence
  return {
    predator,
    prey,
    pair: `${predator.currency}/${prey.currency}`,
  };
}

// Triple-lock gate check for a given pair (base/quote)
export interface StrikeCheck {
  pair: string;
  direction: 'long' | 'short' | null;
  locked: boolean;
  gate1_matrix: boolean;
  gate2_structural: boolean;
  gate3_vector: boolean;
  baseScore: number;
  quoteScore: number;
}

function checkTripleLock(
  pair: string,
  strengths: CurrencyStrength[],
  physics: PairPhysics | null
): StrikeCheck {
  const parts = pair.split('_');
  const baseCur = parts[0];
  const quoteCur = parts[1];
  const scoreMap = Object.fromEntries(strengths.map(s => [s.currency, s.score]));
  const baseScore = scoreMap[baseCur] ?? 0;
  const quoteScore = scoreMap[quoteCur] ?? 0;

  // Gate 1: Matrix alignment (Predator vs Prey)
  const isLongAligned = baseScore >= 1 && quoteScore <= -1;
  const isShortAligned = baseScore <= -1 && quoteScore >= 1;
  const gate1_matrix = isLongAligned || isShortAligned;
  const direction = isLongAligned ? 'long' : isShortAligned ? 'short' : null;

  // Gate 2: Structural breakout (use efficiency as proxy for atlas snap)
  const E = physics?.efficiency ?? 0;
  const H = physics?.hurst?.H ?? 0;
  const gate2_structural = E >= 7 && H >= 0.55; // Tier 1 means it qualifies

  // Gate 3: David Vector (kinetic acceleration — positive Hurst slope proxy)
  const vpin = physics?.vpin ?? 0.5;
  const gate3_vector = direction === 'long' ? vpin > 0.5 : direction === 'short' ? vpin < 0.5 : false;

  return {
    pair,
    direction,
    locked: gate1_matrix && gate2_structural && gate3_vector,
    gate1_matrix,
    gate2_structural,
    gate3_vector,
    baseScore,
    quoteScore,
  };
}

// ─── Pairs to scan ─────────────────────────────────────────────────────────────
const TIER1_PAIRS = ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD', 'USD_CAD', 'USD_CHF', 'NZD_USD', 'EUR_GBP', 'EUR_JPY', 'GBP_JPY'];

export function SovereignMatrixDashboard() {
  const { snapshot } = useSyntheticOrderBook();
  const physics = snapshot?.pairs ?? {};

  // Build SOB scores for the 7 pillars
  const sobScores = useMemo<PairScores>(() => ({
    EUR_USD: getSobScore(physics['EUR_USD'] ?? null),
    GBP_USD: getSobScore(physics['GBP_USD'] ?? null),
    AUD_USD: getSobScore(physics['AUD_USD'] ?? null),
    NZD_USD: getSobScore(physics['NZD_USD'] ?? null),
    USD_CAD: getSobScore(physics['USD_CAD'] ?? null),
    USD_CHF: getSobScore(physics['USD_CHF'] ?? null),
    USD_JPY: getSobScore(physics['USD_JPY'] ?? null),
  }), [physics]);

  const strengths = useMemo(() => computeStrengths(sobScores), [sobScores]);
  const bestPair = useMemo(() => getBestPair(strengths), [strengths]);

  // Triple-lock checks for all Tier 1 pairs
  const strikeChecks = useMemo(() => {
    return TIER1_PAIRS.map(p => checkTripleLock(p, strengths, physics[p] ?? null))
      .sort((a, b) => {
        // Locked first, then by how many gates pass
        const aGates = [a.gate1_matrix, a.gate2_structural, a.gate3_vector].filter(Boolean).length;
        const bGates = [b.gate1_matrix, b.gate2_structural, b.gate3_vector].filter(Boolean).length;
        return bGates - aGates;
      });
  }, [strengths, physics]);

  const lockedStrikes = strikeChecks.filter(s => s.locked);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Crosshair className="w-5 h-5 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">Sovereign Matrix v19.4</h2>
        <Badge className="text-[9px] h-4 px-1.5 font-mono border-0 bg-primary/20 text-primary">POWER RADAR</Badge>
        {lockedStrikes.length > 0 && (
          <Badge className="text-[9px] h-4 px-1.5 font-mono border-0 bg-emerald-500/20 text-emerald-300 animate-pulse ml-auto">
            {lockedStrikes.length} SOVEREIGN STRIKE{lockedStrikes.length > 1 ? 'S' : ''} LOCKED
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ─── Power Radar ─── */}
        <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30 bg-muted/30">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Power Radar</span>
            <span className="ml-auto text-[9px] text-muted-foreground font-mono">SOB Score</span>
          </div>
          <div className="p-3 space-y-1.5">
            {strengths.map((s, i) => {
              const isPredator = i === 0;
              const isPrey = i === strengths.length - 1;
              const barPct = Math.abs(s.score) * 100; // score is -1, 0, or 1 from SOB
              return (
                <div key={s.currency} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-colors ${
                  isPredator ? 'bg-emerald-500/15 border border-emerald-500/30' :
                  isPrey ? 'bg-red-500/15 border border-red-500/30' :
                  'bg-muted/10 border border-transparent'
                }`}>
                  <span className="text-[11px]">{s.emoji}</span>
                  <span className={`text-[11px] font-mono font-black w-7 ${
                    isPredator ? 'text-emerald-300' : isPrey ? 'text-red-300' : 'text-muted-foreground'
                  }`}>{s.currency}</span>
                  {/* Bar */}
                  <div className="flex-1 h-1.5 bg-muted/20 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        s.score > 0 ? 'bg-emerald-400' : s.score < 0 ? 'bg-red-400' : 'bg-muted-foreground/40'
                      }`}
                      style={{ width: `${Math.max(4, barPct)}%`, marginLeft: s.score < 0 ? 'auto' : 0 }}
                    />
                  </div>
                  <span className={`text-[11px] font-mono font-bold w-4 text-right ${
                    s.score > 0 ? 'text-emerald-400' : s.score < 0 ? 'text-red-400' : 'text-muted-foreground'
                  }`}>{s.score > 0 ? '+1' : s.score < 0 ? '-1' : '0'}</span>
                  {isPredator && <span className="text-[8px] font-mono text-emerald-400 font-black">🦁</span>}
                  {isPrey && <span className="text-[8px] font-mono text-red-400 font-black">🎯</span>}
                </div>
              );
            })}

            {/* Best Chomp */}
            <div className="mt-3 px-2.5 py-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono uppercase text-yellow-400 font-bold">⚡ BEST CHOMP</span>
                <span className="text-[11px] font-mono font-black text-yellow-300">
                  {bestPair?.pair ?? 'SCANNING…'}
                </span>
              </div>
              {bestPair && (
                <div className="mt-1 flex gap-3 text-[9px] font-mono text-muted-foreground">
                  <span className="text-emerald-400">🦁 {bestPair.predator.currency} +{bestPair.predator.score}</span>
                  <span className="text-red-400">🎯 {bestPair.prey.currency} {bestPair.prey.score}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ─── Triple-Lock Gate Scanner ─── */}
        <div className="lg:col-span-2 rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30 bg-muted/30">
            <Shield className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Triple-Lock Gate — Sovereign Strikes</span>
            <span className="ml-auto text-[9px] text-muted-foreground font-mono">{lockedStrikes.length} LOCKED</span>
          </div>
          <ScrollArea className="h-[340px]">
            <div className="p-3 space-y-1.5">
              {strikeChecks.map((s) => {
                const gatesOpen = [s.gate1_matrix, s.gate2_structural, s.gate3_vector].filter(Boolean).length;
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
                          : 'bg-muted/5 border-border/20 opacity-60'
                    }`}
                  >
                    {/* Pair */}
                    <span className="text-[11px] font-mono font-black text-foreground w-16 flex-shrink-0">
                      {s.pair.replace('_', '/')}
                    </span>

                    {/* Direction */}
                    {s.direction ? (
                      <div className={`flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                        s.direction === 'long'
                          ? 'bg-emerald-500/80 text-white border-emerald-400'
                          : 'bg-red-500/80 text-white border-red-400'
                      }`}>
                        {s.direction === 'long' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {s.direction === 'long' ? 'LONG' : 'SHORT'}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground px-2 py-0.5">
                        <Minus className="w-3 h-3" /> NEUTRAL
                      </div>
                    )}

                    {/* Gates */}
                    <div className="flex gap-1 ml-auto">
                      <GatePip label="G1 MATRIX" active={s.gate1_matrix} />
                      <GatePip label="G2 STRUCT" active={s.gate2_structural} />
                      <GatePip label="G3 VECTOR" active={s.gate3_vector} />
                    </div>

                    {/* Scores */}
                    <div className="text-[9px] font-mono text-muted-foreground whitespace-nowrap">
                      <span className={s.baseScore > 0 ? 'text-emerald-400' : s.baseScore < 0 ? 'text-red-400' : ''}>
                        {s.pair.split('_')[0]}: {s.baseScore > 0 ? '+' : ''}{s.baseScore}
                      </span>
                      {' / '}
                      <span className={s.quoteScore > 0 ? 'text-emerald-400' : s.quoteScore < 0 ? 'text-red-400' : ''}>
                        {s.pair.split('_')[1]}: {s.quoteScore > 0 ? '+' : ''}{s.quoteScore}
                      </span>
                    </div>

                    {s.locked && (
                      <Badge className="text-[8px] h-4 px-1 font-mono border-0 bg-yellow-500/20 text-yellow-300 animate-pulse ml-1">
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

      {/* ─── Scaling Protocol ─── */}
      {lockedStrikes.length > 0 && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-yellow-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-yellow-300">Scaling Protocol — 1,250 Unit Load</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { tier: 'T1', units: 500, trigger: 'STRIKE Signal', color: 'emerald' },
              { tier: 'T2', units: 500, trigger: '+15 Pips', color: 'yellow' },
              { tier: 'T3', units: 250, trigger: '+30 Pips', color: 'amber' },
            ].map(t => (
              <div key={t.tier} className={`rounded-lg border border-${t.color}-500/30 bg-${t.color}-500/10 px-3 py-2`}>
                <div className="text-[9px] font-mono text-muted-foreground">{t.tier}</div>
                <div className="text-[13px] font-mono font-black text-foreground">{t.units}u</div>
                <div className="text-[8px] font-mono text-muted-foreground mt-0.5">@ {t.trigger}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[9px] font-mono text-muted-foreground">
            <div className="flex items-center gap-1"><span className="text-red-400">⛔ SL:</span> 15p from anchor</div>
            <div className="flex items-center gap-1"><span className="text-emerald-400">🎯 TP:</span> 50p from anchor</div>
            <div className="flex items-center gap-1"><span className="text-yellow-400">🔒 BE:</span> Move SL at +20p</div>
          </div>
        </div>
      )}
    </div>
  );
}

function GatePip({ label, active }: { label: string; active: boolean }) {
  return (
    <div className={`text-[8px] font-mono px-1.5 py-0.5 rounded border font-bold ${
      active
        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
        : 'bg-muted/10 text-muted-foreground/40 border-border/20'
    }`}>
      {label}
    </div>
  );
}
