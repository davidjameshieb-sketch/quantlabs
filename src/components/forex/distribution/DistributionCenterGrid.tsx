// DistributionCenterGrid — 3-tier view of all 20 forex pairs as warehouse cards
// Tier 1: Elite shippers  (E ≥ 7 AND H ≥ 0.55) → active, invest
// Tier 2: Average centers (E ≥ 2 OR H ≥ 0.45)  → monitor
// Tier 3: Garbage/jammed  (everything else)      → avoid / pull money out

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import distributionTwin from '@/assets/distribution-terminal-twin.jpg';
import distributionJammed from '@/assets/distribution-terminal-jammed.jpg';
import type { PairPhysics } from '@/hooks/useSyntheticOrderBook';

// ─── thresholds ───────────────────────────────────────────────────────────────
const TIER1_E   = 7;
const TIER1_H   = 0.55;
const TIER2_E   = 2;
const TIER2_H   = 0.45;

function computeTier(p: PairPhysics | null): 1 | 2 | 3 {
  if (!p) return 3;
  const E = p.efficiency ?? 0;
  const H = p.hurst?.H ?? 0;
  if (E >= TIER1_E && H >= TIER1_H) return 1;
  if (E >= TIER2_E || H >= TIER2_H) return 2;
  return 3;
}

const TIER_META = {
  1: {
    label: '⚡ TIER 1 — ELITE SHIPPERS',
    sublabel: 'Active & shipping. Invest here.',
    headerCls: 'bg-emerald-900/40 border-emerald-400/50 text-emerald-300',
    cardBorder: 'border-emerald-500/50',
    cardBg: 'bg-emerald-950/30',
    badgeCls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    glowColor: '0 0 12px rgba(52,211,153,0.25)',
    image: distributionTwin,
    imageLabel: 'ACTIVE FLOOR',
    action: '✅ INVEST',
    actionCls: 'text-emerald-400',
  },
  2: {
    label: '🔍 TIER 2 — MODERATE CENTERS',
    sublabel: 'Partial activity. Monitor closely.',
    headerCls: 'bg-amber-900/30 border-amber-400/40 text-amber-300',
    cardBorder: 'border-amber-500/40',
    cardBg: 'bg-amber-950/20',
    badgeCls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    glowColor: '0 0 8px rgba(251,191,36,0.15)',
    image: distributionTwin,
    imageLabel: 'PARTIAL FLOW',
    action: '👀 WATCH',
    actionCls: 'text-amber-400',
  },
  3: {
    label: '🗑 TIER 3 — GARBAGE CENTERS',
    sublabel: 'Jammed. Pull your money out.',
    headerCls: 'bg-red-900/30 border-red-500/40 text-red-300',
    cardBorder: 'border-red-800/40',
    cardBg: 'bg-red-950/20',
    badgeCls: 'bg-red-500/10 text-red-400 border-red-800/30',
    glowColor: 'none',
    image: distributionJammed,
    imageLabel: 'JAMMED',
    action: '❌ AVOID',
    actionCls: 'text-red-400',
  },
};

interface PairCard {
  pair: string;
  data: PairPhysics;
  tier: 1 | 2 | 3;
  hasTrade: boolean;
}

function DcCard({ item, meta }: { item: PairCard; meta: typeof TIER_META[1] }) {
  const E = item.data?.efficiency ?? 0;
  const H = item.data?.hurst?.H ?? 0;
  const Z = item.data?.zOfi ?? 0;
  const state = item.data?.marketState ?? 'NEUTRAL';
  const label = item.pair.replace('_', '/');

  // Efficiency bar: cap at 200× for visual
  const ePct = Math.min(100, (E / 200) * 100);
  const hPct = Math.min(100, (H / 1) * 100);
  const isShipping = item.hasTrade || state === 'ABSORBING';
  const isJammed = item.tier === 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        'rounded-xl border overflow-hidden transition-all duration-300',
        meta.cardBorder,
        meta.cardBg,
        isShipping && 'ring-1 ring-emerald-400/40',
      )}
      style={{ boxShadow: item.tier < 3 ? meta.glowColor : 'none' }}
    >
      {/* Warehouse mini-image */}
      <div className="relative h-16 overflow-hidden">
        <img
          src={meta.image}
          alt={isJammed ? 'Jammed warehouse' : 'Active warehouse'}
          className={cn('w-full h-full object-cover object-center transition-all', isJammed ? 'grayscale-[40%] brightness-50' : 'brightness-60')}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        {/* Action badge */}
        <div className={cn('absolute top-1.5 right-1.5 text-[7px] font-mono font-black px-1.5 py-0.5 rounded border bg-black/60', meta.badgeCls)}>
          {meta.action}
        </div>
        {isShipping && (
          <div className="absolute top-1.5 left-1.5 text-[6px] font-mono font-black px-1.5 py-0.5 rounded bg-emerald-600/80 text-white border border-emerald-400/50 animate-pulse">
            🛡 IN TRANSIT
          </div>
        )}
        {/* Pair label overlay */}
        <div className="absolute bottom-1.5 left-2">
          <span className="text-[11px] font-mono font-black text-white drop-shadow-lg tracking-widest">{label}</span>
          <span className="ml-1.5 text-[7px] font-mono text-white/60">{meta.imageLabel}</span>
        </div>
      </div>

      {/* Metrics */}
      <div className="px-2 py-1.5 space-y-1">
        {/* Efficiency bar */}
        <div>
          <div className="flex justify-between text-[7px] font-mono text-muted-foreground mb-0.5">
            <span>🏭 Floor Friction</span>
            <span className={cn('font-bold', E >= 100 ? 'text-yellow-400' : E >= TIER1_E ? 'text-emerald-400' : 'text-red-400')}>{E.toFixed(0)}×</span>
          </div>
          <div className="h-1 bg-muted/20 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-700', E >= 100 ? 'bg-yellow-400/70' : E >= TIER1_E ? 'bg-emerald-400/60' : 'bg-red-500/40')}
              style={{ width: `${ePct}%` }}
            />
          </div>
        </div>

        {/* Hurst bar */}
        <div>
          <div className="flex justify-between text-[7px] font-mono text-muted-foreground mb-0.5">
            <span>🚶 Workflow Rhythm</span>
            <span className={cn('font-bold', H >= 0.62 ? 'text-emerald-400' : H >= TIER2_H ? 'text-amber-400' : 'text-red-400')}>H={H.toFixed(2)}</span>
          </div>
          <div className="h-1 bg-muted/20 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-700', H >= 0.62 ? 'bg-emerald-400/60' : H >= TIER2_H ? 'bg-amber-400/50' : 'bg-red-500/30')}
              style={{ width: `${hPct}%` }}
            />
          </div>
        </div>

        {/* Z sigma */}
        <div className="flex items-center justify-between">
          <span className="text-[7px] font-mono text-muted-foreground">🚛 Docks</span>
          <span className={cn('text-[8px] font-mono font-bold', Math.abs(Z) > 2.5 ? 'text-yellow-400' : 'text-muted-foreground')}>
            {Z >= 0 ? '+' : ''}{Z.toFixed(1)}σ
          </span>
        </div>
      </div>
    </motion.div>
  );
}

interface Props {
  pairs: Record<string, PairPhysics>;
  activeTrades: { currency_pair: string; status: string }[];
}

const RADAR_PAIRS = [
  'EUR_USD','GBP_USD','USD_JPY','USD_CHF','AUD_USD','USD_CAD',
  'NZD_USD','EUR_GBP','EUR_JPY','GBP_JPY','AUD_JPY','CAD_JPY',
  'CHF_JPY','EUR_CHF','EUR_AUD','GBP_CHF','AUD_NZD','NZD_JPY',
  'GBP_AUD','EUR_NZD',
];

const normPair = (p: string) => p.replace(/\//g, '_').replace(/-/g, '_');

export function DistributionCenterGrid({ pairs, activeTrades }: Props) {
  const items = useMemo<PairCard[]>(() => {
    return RADAR_PAIRS.map(rp => {
      const data = pairs[rp] ?? pairs[rp.replace('_', '/')] ?? null;
      const hasTrade = activeTrades.some(t =>
        normPair(t.currency_pair) === rp && ['filled', 'pending', 'open'].includes(t.status)
      );
      return {
        pair: rp,
        data: data as PairPhysics,
        tier: computeTier(data),
        hasTrade,
      };
    });
  }, [pairs, activeTrades]);

  const tier1 = items.filter(i => i.tier === 1);
  const tier2 = items.filter(i => i.tier === 2);
  const tier3 = items.filter(i => i.tier === 3);

  const tiers: Array<{ key: 1 | 2 | 3; list: PairCard[] }> = [
    { key: 1, list: tier1 },
    { key: 2, list: tier2 },
    { key: 3, list: tier3 },
  ];

  return (
    <div className="space-y-4">
      {tiers.map(({ key, list }) => {
        if (list.length === 0) return null;
        const meta = TIER_META[key];
        return (
          <div key={key} className="space-y-2">
            {/* Section header */}
            <div className={cn('flex items-center justify-between px-3 py-1.5 rounded-lg border', meta.headerCls)}>
              <div>
                <span className="text-[10px] font-mono font-black uppercase tracking-widest">{meta.label}</span>
                <span className="ml-3 text-[8px] font-mono opacity-70 italic">{meta.sublabel}</span>
              </div>
              <span className={cn('text-[10px] font-mono font-black', meta.actionCls)}>
                {list.length} centers
              </span>
            </div>

            {/* Cards grid */}
            <div className={cn(
              'grid gap-2',
              key === 1 ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6' :
              key === 2 ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7' :
              'grid-cols-4 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10',
            )}>
              {list.map((item, idx) => (
                <motion.div
                  key={item.pair}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: idx * 0.03 }}
                >
                  <DcCard item={item} meta={meta} />
                </motion.div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
