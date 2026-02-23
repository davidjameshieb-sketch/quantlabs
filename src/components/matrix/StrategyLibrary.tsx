// Strategy Library — Curated, proven strategies that can be added/removed from the live portfolio
// Adding activates in agent_configs → executor picks it up. Removing deactivates + optionally closes OANDA trades.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Plus, Trash2, Loader2, AlertTriangle, CheckCircle2,
  TrendingUp, Shield, Zap, XCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';

// ── Curated Library Definition ──
// Each entry is a fully-defined strategy with all parameters needed for execution.
// To add new strategies, simply add entries here.
export interface LibraryStrategy {
  id: string; // matches agent_id pattern
  name: string;
  description: string;
  engineSource: string;
  category: 'rank' | 'alpha' | 'experimental';
  config: Record<string, unknown>; // full config to upsert into agent_configs
  metrics: { trades: number; winRate: number; profitFactor: number; totalPips: number; maxDrawdown: number };
}

// Default curated library — these are hard-coded proven strategies
const CURATED_LIBRARY: LibraryStrategy[] = [
  {
    id: 'live-backtest-R3v8-42p-3-LONDON',
    name: 'R3v8 · 42p SL · 3R · London',
    description: 'Rank 3 vs 8 predator-prey with triple-lock gates, 42-pip fixed SL, 3:1 R:R targeting London session momentum.',
    engineSource: 'live-backtest',
    category: 'rank',
    config: {
      predator: 3, prey: 8, gates: 'G1+G2+G3', slPips: 42, tpRatio: 3, session: 'LONDON',
      autoExecute: true, engineSource: 'live-backtest',
      strategyName: 'R3v8 · 42p SL · 3R · LONDON',
      backtestMetrics: { trades: 351, winRate: 31.6, totalPips: 3589.5, expectancy: 10.23, maxDrawdown: -19.1, profitFactor: 1.35, institutionalPF: 1.32 },
    },
    metrics: { trades: 351, winRate: 31.6, profitFactor: 1.35, totalPips: 3589.5, maxDrawdown: -19.1 },
  },
  {
    id: 'live-backtest-R3v8-42p-2-LONDON',
    name: 'R3v8 · 42p SL · 2R · London',
    description: 'Same rank combo as 3R but with 2:1 reward — higher win rate, lower per-trade expectancy.',
    engineSource: 'live-backtest',
    category: 'rank',
    config: {
      predator: 3, prey: 8, gates: 'G1+G2+G3', slPips: 42, tpRatio: 2, session: 'LONDON',
      autoExecute: true, engineSource: 'live-backtest',
      strategyName: 'R3v8 · 42p SL · 2R · LONDON',
      backtestMetrics: { trades: 351, winRate: 39.6, totalPips: 2413.5, expectancy: 6.88, maxDrawdown: -15.8, profitFactor: 1.27, institutionalPF: 1.25 },
    },
    metrics: { trades: 351, winRate: 39.6, profitFactor: 1.27, totalPips: 2413.5, maxDrawdown: -15.8 },
  },
  {
    id: 'live-backtest-R3v8-42p-1.5-LONDON',
    name: 'R3v8 · 42p SL · 1.5R · London',
    description: 'Conservative R:R variant — highest fill rate of the R3v8 family.',
    engineSource: 'live-backtest',
    category: 'rank',
    config: {
      predator: 3, prey: 8, gates: 'G1+G2+G3', slPips: 42, tpRatio: 1.5, session: 'LONDON',
      autoExecute: true, engineSource: 'live-backtest',
      strategyName: 'R3v8 · 42p SL · 1.5R · LONDON',
      backtestMetrics: { trades: 351, winRate: 44.4, totalPips: 1237.5, expectancy: 3.53, maxDrawdown: -10.9, profitFactor: 1.15, institutionalPF: 1.13 },
    },
    metrics: { trades: 351, winRate: 44.4, profitFactor: 1.15, totalPips: 1237.5, maxDrawdown: -10.9 },
  },
  {
    id: 'live-backtest-R1v6-20p-1.5-NEW_YORK',
    name: 'R1v6 · 20p SL · 1.5R · New York',
    description: 'Top-rank predator (#1) hunting mid-tier (#6) in the New York session with tight 20-pip SL.',
    engineSource: 'live-backtest',
    category: 'rank',
    config: {
      predator: 1, prey: 6, gates: 'G1+G2+G3', slPips: 20, tpRatio: 1.5, session: 'NEW_YORK',
      autoExecute: true, engineSource: 'live-backtest',
      strategyName: 'R1v6 · 20p SL · 1.5R · NEW_YORK',
      backtestMetrics: { trades: 357, winRate: 47.1, totalPips: 724.5, expectancy: 2.03, maxDrawdown: -15, profitFactor: 1.18, institutionalPF: 1.19 },
    },
    metrics: { trades: 357, winRate: 47.1, profitFactor: 1.18, totalPips: 724.5, maxDrawdown: -15 },
  },
  {
    id: 'alpha-discovery-alpha-USD_JPY-2',
    name: 'The Anatomy-CLV-RngX Hybrid',
    description: 'USD/JPY alpha strategy using CLV trend + range expansion breakout + hammer/shooting star candlestick patterns.',
    engineSource: 'alpha-discovery',
    category: 'alpha',
    config: {
      pair: 'USD_JPY', autoExecute: true, engineSource: 'alpha-discovery',
      strategyName: 'The Anatomy-CLV-RngX Hybrid',
      dna: { erMode: 0, fdMode: 0, clvMode: 2, gapMode: 0, volMode: 0, erPeriod: 13, fdPeriod: 10, hurstMax: 0.6411278182901491, hurstMin: 0.4470529422595691, clvSmooth: 10, dayFilter: -1, direction: 2, partialTP: 0, candleMode: 3, consecMode: 0, trailingATR: 0, rangeExpMode: 1, slMultiplier: 1, tpMultiplier: 1.2773846878158017, volDeltaMode: 0, sessionFilter: -1, maxBarsInTrade: 0, rangeExpPeriod: 13, volDeltaPeriod: 20, consecThreshold: 2 },
      entryRules: ['CLV(smooth 10) > 0.2 → LONG trend / < -0.2 → SHORT trend', 'Bar range > 1.5× average(13) → momentum breakout trade', 'Hammer/Shooting Star patterns'],
      exitRules: ['SL: 1.00× ATR(14)', 'TP: 1.28× ATR(14)', 'R:R = 1:1.28'],
      backtestMetrics: { trades: 301, winRate: 71.4, totalPips: 2181.5, maxDrawdown: 25.4, profitFactor: 2.6 },
    },
    metrics: { trades: 301, winRate: 71.4, profitFactor: 2.6, totalPips: 2181.5, maxDrawdown: -25.4 },
  },
  {
    id: 'alpha-discovery-alpha-USD_JPY-1',
    name: 'The Anatomy-ER-VolΔ Hybrid (VolExpansion)',
    description: 'USD/JPY using efficiency ratio acceleration + volume delta + hammer/star patterns with volume expansion filter.',
    engineSource: 'alpha-discovery',
    category: 'alpha',
    config: {
      pair: 'USD_JPY', autoExecute: true, engineSource: 'alpha-discovery',
      strategyName: 'The Anatomy-ER-VolΔ Hybrid (VolExpansion)',
      dna: { erMode: 3, fdMode: 0, clvMode: 0, gapMode: 0, volMode: 3, erPeriod: 13, fdPeriod: 10, hurstMax: 0.6411278182901491, hurstMin: 0.3660327714131362, clvSmooth: 10, dayFilter: -1, direction: 2, partialTP: 0, candleMode: 3, consecMode: 0, trailingATR: 0, rangeExpMode: 0, slMultiplier: 1, tpMultiplier: 1.2773846878158017, volDeltaMode: 1, sessionFilter: -1, maxBarsInTrade: 0, rangeExpPeriod: 21, volDeltaPeriod: 20, consecThreshold: 5 },
      entryRules: ['ER acceleration → momentum direction', 'Volume Delta > 0.3 → LONG / < -0.3 → SHORT', 'Hammer/Shooting Star', 'Volume > 1.5× average'],
      exitRules: ['SL: 1.00× ATR(14)', 'TP: 1.28× ATR(14)'],
      backtestMetrics: { trades: 83, winRate: 75.9, totalPips: 777.7, maxDrawdown: 15.8, profitFactor: 3.24 },
    },
    metrics: { trades: 83, winRate: 75.9, profitFactor: 3.24, totalPips: 777.7, maxDrawdown: -15.8 },
  },
  {
    id: 'alpha-discovery-alpha-AUD_USD-3',
    name: 'The Anatomy-ER-VolΔ Hybrid (Asia)',
    description: 'AUD/USD targeting Asia session with efficiency ratio + volume delta + strong body conviction candles.',
    engineSource: 'alpha-discovery',
    category: 'alpha',
    config: {
      pair: 'AUD_USD', autoExecute: true, engineSource: 'alpha-discovery',
      strategyName: 'The Anatomy-ER-VolΔ Hybrid (Asia)',
      dna: { erMode: 3, fdMode: 0, clvMode: 0, gapMode: 0, volMode: 0, erPeriod: 8, fdPeriod: 10, hurstMax: 0.9656529114775501, hurstMin: 0.3559245739568994, clvSmooth: 10, dayFilter: -1, direction: 2, partialTP: 0, candleMode: 1, consecMode: 0, trailingATR: 0, rangeExpMode: 0, slMultiplier: 1.0139420826981866, tpMultiplier: 1.3345862664003265, volDeltaMode: 3, sessionFilter: 0, maxBarsInTrade: 0, rangeExpPeriod: 8, volDeltaPeriod: 20, consecThreshold: 5 },
      entryRules: ['ER acceleration → momentum direction', 'Volume Delta accelerating', 'Body > 70% range → strong conviction', 'Session: Asia'],
      exitRules: ['SL: 1.01× ATR(14)', 'TP: 1.33× ATR(14)', 'R:R = 1:1.32'],
      backtestMetrics: { trades: 279, winRate: 72, totalPips: 637.4, maxDrawdown: 22.7, profitFactor: 2.06 },
    },
    metrics: { trades: 279, winRate: 72, profitFactor: 2.06, totalPips: 637.4, maxDrawdown: -22.7 },
  },
  {
    id: 'alpha-discovery-alpha-EUR_USD-6',
    name: 'The Fractal Reversal Radar',
    description: 'EUR/USD mean-reversion using CLV divergence + fractal dimension > 1.6 (choppy market detection).',
    engineSource: 'alpha-discovery',
    category: 'alpha',
    config: {
      pair: 'EUR_USD', autoExecute: true, engineSource: 'alpha-discovery',
      strategyName: 'The Fractal Reversal Radar',
      dna: { erMode: 0, fdMode: 2, clvMode: 3, gapMode: 0, volMode: 0, erPeriod: 13, fdPeriod: 10, hurstMax: 0.6405248303495724, hurstMin: 0.3030014913120304, clvSmooth: 10, dayFilter: -1, direction: 2, partialTP: 0, candleMode: 0, consecMode: 0, trailingATR: 0, rangeExpMode: 0, slMultiplier: 1.241382475154658, tpMultiplier: 2.4686639804313635, volDeltaMode: 0, sessionFilter: -1, maxBarsInTrade: 0, rangeExpPeriod: 21, volDeltaPeriod: 5, consecThreshold: 5 },
      entryRules: ['CLV diverges from price → counter-trend', 'Fractal Dimension > 1.6 → choppy, mean-revert'],
      exitRules: ['SL: 1.24× ATR(14)', 'TP: 2.47× ATR(14)', 'R:R = 1:1.99'],
      backtestMetrics: { trades: 1447, winRate: 53.2, totalPips: 2915.4, maxDrawdown: 60.6, profitFactor: 1.42 },
    },
    metrics: { trades: 1447, winRate: 53.2, profitFactor: 1.42, totalPips: 2915.4, maxDrawdown: -60.6 },
  },
  {
    id: 'experimental-lab-decorrelated-blend',
    name: 'Decorrelated Portfolio Blend',
    description: 'Multi-strategy blend using decorrelation filter + inverse-volatility weighting across all rank combos.',
    engineSource: 'experimental-lab',
    category: 'experimental',
    config: {
      autoExecute: true, engineSource: 'experimental-lab',
      strategyName: 'Decorrelated Portfolio Blend',
      backtestMetrics: { trades: 1305, winRate: 35.4, totalPips: 5458.5, maxDrawdown: -9.4, profitFactor: 1.14 },
    },
    metrics: { trades: 1305, winRate: 35.4, profitFactor: 1.14, totalPips: 5458.5, maxDrawdown: -9.4 },
  },
  {
    id: 'experimental-lab-session-rotation',
    name: 'Session Rotation Engine',
    description: 'Rotates capital allocation between sessions (Asia/London/NY) based on recent performance momentum.',
    engineSource: 'experimental-lab',
    category: 'experimental',
    config: {
      autoExecute: true, engineSource: 'experimental-lab',
      strategyName: 'Session Rotation Engine',
      backtestMetrics: { trades: 834, winRate: 35.8, totalPips: 4881, maxDrawdown: -8.5, profitFactor: 1.21 },
    },
    metrics: { trades: 834, winRate: 35.8, profitFactor: 1.21, totalPips: 4881, maxDrawdown: -8.5 },
  },
];

interface RemovalDialogProps {
  strategy: LibraryStrategy;
  onClose: () => void;
  onConfirm: (closeOpenTrades: boolean) => void;
  loading: boolean;
}

function RemovalDialog({ strategy, onClose, onConfirm, loading }: RemovalDialogProps) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        className="bg-slate-900 border border-[#ff0055]/30 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-[#ff0055]" />
          <h3 className="text-sm font-bold text-white">Remove Strategy</h3>
        </div>
        <p className="text-[11px] text-slate-300 mb-2">
          You are removing <span className="text-[#00ffea] font-bold">{strategy.name}</span> from your live portfolio.
        </p>
        <p className="text-[10px] text-slate-400 mb-6">
          What should happen to any open trades placed by this strategy?
        </p>
        <div className="space-y-2">
          <button onClick={() => onConfirm(true)} disabled={loading}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider transition-all border border-[#ff0055]/30 text-[#ff0055] hover:bg-[#ff0055]/10 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Close open trades immediately
          </button>
          <button onClick={() => onConfirm(false)} disabled={loading}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider transition-all border border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            Let existing trades hit SL/TP naturally
          </button>
          <button onClick={onClose} disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-[10px] font-mono text-slate-400 hover:text-white transition-all disabled:opacity-50">
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface StrategyLibraryProps {
  activeAgentIds: string[];
  onPortfolioChanged: () => void;
}

export const StrategyLibrary = ({ activeAgentIds, onPortfolioChanged }: StrategyLibraryProps) => {
  const [filter, setFilter] = useState<'all' | 'rank' | 'alpha' | 'experimental'>('all');
  const [adding, setAdding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<LibraryStrategy | null>(null);
  const [removingLoading, setRemovingLoading] = useState(false);

  const activeSet = useMemo(() => new Set(activeAgentIds), [activeAgentIds]);

  const filtered = useMemo(() => {
    if (filter === 'all') return CURATED_LIBRARY;
    return CURATED_LIBRARY.filter(s => s.category === filter);
  }, [filter]);

  const addStrategy = useCallback(async (strategy: LibraryStrategy) => {
    setAdding(strategy.id);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) {
        toast.error('Not authenticated');
        return;
      }

      const config = {
        ...strategy.config,
        activatedAt: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('agent_configs')
        .upsert({
          agent_id: strategy.id,
          config: config as unknown as Json,
          is_active: true,
        }, { onConflict: 'agent_id' });

      if (error) throw error;
      toast.success(`${strategy.name} added to live portfolio`);
      onPortfolioChanged();
    } catch (err) {
      toast.error(`Failed to add: ${(err as Error).message}`);
    } finally {
      setAdding(null);
    }
  }, [onPortfolioChanged]);

  const removeStrategy = useCallback(async (strategy: LibraryStrategy, closeOpenTrades: boolean) => {
    setRemovingLoading(true);
    try {
      // 1. Deactivate in agent_configs
      const { error: deactivateErr } = await supabase
        .from('agent_configs')
        .update({ is_active: false })
        .eq('agent_id', strategy.id);

      if (deactivateErr) throw deactivateErr;

      // 2. If user wants to close open trades, find and close them via OANDA
      if (closeOpenTrades) {
        // Find open/filled orders for this agent
        const { data: openOrders } = await supabase
          .from('oanda_orders')
          .select('id, oanda_trade_id, environment, currency_pair')
          .eq('agent_id', strategy.id)
          .in('status', ['filled', 'open'])
          .not('oanda_trade_id', 'is', null);

        if (openOrders && openOrders.length > 0) {
          // Close each trade via oanda-execute
          for (const order of openOrders) {
            try {
              const res = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oanda-execute`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                    Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
                  },
                  body: JSON.stringify({
                    action: 'close-trade',
                    tradeId: order.oanda_trade_id,
                    environment: order.environment || 'live',
                  }),
                }
              );
              const result = await res.json();
              if (result.success) {
                toast.success(`Closed ${order.currency_pair} trade ${order.oanda_trade_id}`);
              } else {
                toast.error(`Failed to close ${order.currency_pair}: ${result.error || 'Unknown error'}`);
              }
            } catch (closeErr) {
              toast.error(`Error closing trade: ${(closeErr as Error).message}`);
            }
          }
        } else {
          toast.info('No open trades found for this strategy');
        }
      }

      toast.success(`${strategy.name} removed from portfolio`);
      onPortfolioChanged();
    } catch (err) {
      toast.error(`Failed to remove: ${(err as Error).message}`);
    } finally {
      setRemovingLoading(false);
      setRemoving(null);
    }
  }, [onPortfolioChanged]);

  const categoryColor = (cat: string) => {
    if (cat === 'rank') return '#00ffea';
    if (cat === 'alpha') return '#7c3aed';
    return '#ff8800';
  };

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#7c3aed]" />
            <h3 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">
              Strategy Library
            </h3>
            <span className="text-[8px] font-mono text-slate-500 border border-slate-700 px-1.5 py-0.5 rounded">
              {CURATED_LIBRARY.length} PROVEN STRATEGIES
            </span>
          </div>
          <div className="flex items-center gap-1">
            {(['all', 'rank', 'alpha', 'experimental'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className="text-[8px] font-mono px-2 py-1 rounded-lg uppercase tracking-widest transition-all"
                style={{
                  background: filter === f ? (f === 'all' ? '#ffffff15' : `${categoryColor(f)}15`) : 'transparent',
                  border: `1px solid ${filter === f ? (f === 'all' ? '#ffffff33' : `${categoryColor(f)}44`) : 'transparent'}`,
                  color: filter === f ? (f === 'all' ? '#fff' : categoryColor(f)) : '#64748b',
                }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {filtered.map(strategy => {
            const isActive = activeSet.has(strategy.id);
            const isAdding = adding === strategy.id;
            const color = categoryColor(strategy.category);

            return (
              <motion.div key={strategy.id} layout
                className="bg-slate-950/50 border rounded-xl p-3 transition-all"
                style={{ borderColor: isActive ? '#39ff1433' : `${color}22` }}>
                <div className="flex items-start gap-3">
                  {/* Status */}
                  <div className="pt-1 flex-shrink-0">
                    {isActive ? (
                      <div className="w-2 h-2 rounded-full bg-[#39ff14] animate-pulse" title="Active in portfolio" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-slate-700" title="Not active" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold font-mono text-white truncate">{strategy.name}</span>
                      <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border flex-shrink-0"
                        style={{ borderColor: `${color}44`, color, background: `${color}11` }}>
                        {strategy.category}
                      </span>
                    </div>
                    <p className="text-[8px] text-slate-500 mb-2 line-clamp-2">{strategy.description}</p>

                    {/* Metrics row */}
                    <div className="flex items-center gap-3 text-[8px] font-mono">
                      <span style={{ color: strategy.metrics.winRate >= 50 ? '#39ff14' : '#ff8800' }}>
                        {strategy.metrics.winRate}% WR
                      </span>
                      <span style={{ color: strategy.metrics.profitFactor >= 1.5 ? '#39ff14' : '#ff8800' }}>
                        PF {strategy.metrics.profitFactor}
                      </span>
                      <span style={{ color: strategy.metrics.totalPips > 0 ? '#39ff14' : '#ff0055' }}>
                        {strategy.metrics.totalPips > 0 ? '+' : ''}{strategy.metrics.totalPips}p
                      </span>
                      <span className="text-slate-500">{strategy.metrics.trades} trades</span>
                      <span className="text-[#ff0055]">DD {strategy.metrics.maxDrawdown}%</span>
                    </div>
                  </div>

                  {/* Action */}
                  <div className="flex-shrink-0 pt-1">
                    {isActive ? (
                      <button onClick={() => setRemoving(strategy)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[8px] font-mono font-bold uppercase tracking-widest transition-all hover:bg-[#ff0055]/10"
                        style={{ border: '1px solid #ff005544', color: '#ff0055' }}>
                        <Trash2 className="w-3 h-3" /> Remove
                      </button>
                    ) : (
                      <button onClick={() => addStrategy(strategy)} disabled={isAdding}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[8px] font-mono font-bold uppercase tracking-widest transition-all disabled:opacity-50 hover:bg-[#39ff14]/10"
                        style={{ border: '1px solid #39ff1444', color: '#39ff14' }}>
                        {isAdding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        Add to Portfolio
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Removal Confirmation Dialog */}
      <AnimatePresence>
        {removing && (
          <RemovalDialog
            strategy={removing}
            onClose={() => setRemoving(null)}
            onConfirm={(closeTrades) => removeStrategy(removing, closeTrades)}
            loading={removingLoading}
          />
        )}
      </AnimatePresence>
    </>
  );
};
