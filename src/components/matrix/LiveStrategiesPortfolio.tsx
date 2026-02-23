// Live Strategies Portfolio — Shows all activated strategies + combined portfolio analytics
import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Rocket, Trash2, RefreshCw, BarChart3, Loader2, Activity,
  TrendingUp, TrendingDown, Shield, Zap, XCircle, CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';

interface ActiveStrategy {
  agent_id: string;
  is_active: boolean;
  config: {
    strategyName?: string;
    engineSource?: string;
    predator?: number;
    prey?: number;
    gates?: string;
    slPips?: number;
    tpRatio?: number | string;
    pair?: string;
    session?: string;
    activatedAt?: string;
    backtestMetrics?: {
      winRate?: number;
      profitFactor?: number;
      institutionalPF?: number;
      maxDrawdown?: number;
      trades?: number;
      totalPips?: number;
      expectancy?: number;
    };
  };
}

interface PortfolioStats {
  totalStrategies: number;
  avgWinRate: number;
  avgProfitFactor: number;
  avgInstitutionalPF: number;
  totalBacktestTrades: number;
  totalBacktestPips: number;
  worstDrawdown: number;
  avgExpectancy: number;
  engineBreakdown: Record<string, number>;
}

function parseConfig(raw: Json): ActiveStrategy['config'] {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) return raw as any;
  return {};
}

export const LiveStrategiesPortfolio = () => {
  const [strategies, setStrategies] = useState<ActiveStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPortfolio, setShowPortfolio] = useState(false);
  const [deactivating, setDeactivating] = useState<string | null>(null);

  const fetchStrategies = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('agent_configs')
      .select('agent_id, config, is_active')
      .eq('is_active', true)
      .order('agent_id');

    if (data) {
      setStrategies(data.map(d => ({ agent_id: d.agent_id, is_active: !!d.is_active, config: parseConfig(d.config) })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchStrategies(); }, [fetchStrategies]);

  const deactivate = useCallback(async (agentId: string) => {
    setDeactivating(agentId);
    const { error } = await supabase
      .from('agent_configs')
      .update({ is_active: false })
      .eq('agent_id', agentId);

    if (error) {
      toast.error(`Failed to deactivate: ${error.message}`);
    } else {
      toast.success('Strategy deactivated');
      setStrategies(prev => prev.filter(s => s.agent_id !== agentId));
    }
    setDeactivating(null);
  }, []);

  const portfolio = useMemo<PortfolioStats>(() => {
    const strats = strategies.filter(s => s.config?.backtestMetrics);
    const metrics = strats.map(s => s.config.backtestMetrics!);
    const n = metrics.length || 1;
    const engineBreakdown: Record<string, number> = {};
    strategies.forEach(s => {
      const src = s.config.engineSource || 'unknown';
      engineBreakdown[src] = (engineBreakdown[src] || 0) + 1;
    });

    return {
      totalStrategies: strategies.length,
      avgWinRate: metrics.reduce((a, m) => a + (m.winRate ?? 0), 0) / n,
      avgProfitFactor: metrics.reduce((a, m) => a + (m.profitFactor ?? 0), 0) / n,
      avgInstitutionalPF: metrics.reduce((a, m) => a + (m.institutionalPF ?? 0), 0) / n,
      totalBacktestTrades: metrics.reduce((a, m) => a + (m.trades ?? 0), 0),
      totalBacktestPips: metrics.reduce((a, m) => a + (m.totalPips ?? 0), 0),
      worstDrawdown: Math.min(...metrics.map(m => m.maxDrawdown ?? 0), 0),
      avgExpectancy: metrics.reduce((a, m) => a + (m.expectancy ?? 0), 0) / n,
      engineBreakdown,
    };
  }, [strategies]);

  if (loading) {
    return (
      <div className="lg:col-span-12 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 flex items-center justify-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-[#00ffea]" />
        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Loading active strategies…</span>
      </div>
    );
  }

  return (
    <div className="lg:col-span-12 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-5 shadow-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700/40 pb-3">
        <div className="flex items-center gap-2">
          <Rocket className="w-4 h-4 text-[#ff6600]" />
          <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">
            Strategies Trading Live Right Now
          </h2>
          <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border"
            style={{ borderColor: strategies.length > 0 ? '#39ff1455' : '#ff005555', color: strategies.length > 0 ? '#39ff14' : '#ff0055', background: strategies.length > 0 ? '#39ff1410' : '#ff005510' }}>
            {strategies.length} ACTIVE
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPortfolio(!showPortfolio)} disabled={strategies.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-widest transition-all disabled:opacity-30"
            style={{ background: showPortfolio ? '#00ffea15' : 'linear-gradient(135deg, #7c3aed20, #0f172a)', border: `1px solid ${showPortfolio ? '#00ffea44' : '#7c3aed44'}`, color: showPortfolio ? '#00ffea' : '#a78bfa' }}>
            <BarChart3 className="w-3 h-3" />
            {showPortfolio ? 'Hide Stats' : 'Analyze Portfolio'}
          </button>
          <button onClick={fetchStrategies}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[9px] font-mono text-slate-400 hover:text-slate-200 transition-all border border-slate-700/50">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>
      </div>

      {/* Portfolio Analytics */}
      <AnimatePresence>
        {showPortfolio && strategies.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="bg-gradient-to-br from-purple-950/30 to-slate-950 border border-purple-500/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-[9px] font-mono font-bold text-purple-300 uppercase tracking-widest">Combined Portfolio Analytics</span>
              </div>

              {/* Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {[
                  { label: 'Strategies', value: `${portfolio.totalStrategies}`, color: '#00ffea' },
                  { label: 'Avg Win Rate', value: `${portfolio.avgWinRate.toFixed(1)}%`, color: portfolio.avgWinRate >= 50 ? '#39ff14' : '#ff0055' },
                  { label: 'Avg PF', value: portfolio.avgProfitFactor.toFixed(2), color: portfolio.avgProfitFactor >= 1.5 ? '#39ff14' : '#ff8800' },
                  { label: 'Avg Inst. PF', value: portfolio.avgInstitutionalPF.toFixed(2), color: portfolio.avgInstitutionalPF >= 1.3 ? '#39ff14' : '#ff8800' },
                  { label: 'Total Trades', value: `${portfolio.totalBacktestTrades}`, color: '#00ffea' },
                  { label: 'Total Pips', value: `${portfolio.totalBacktestPips.toFixed(1)}`, color: portfolio.totalBacktestPips >= 0 ? '#39ff14' : '#ff0055' },
                  { label: 'Worst DD', value: `${portfolio.worstDrawdown.toFixed(1)}%`, color: '#ff0055' },
                  { label: 'Avg Expectancy', value: `${portfolio.avgExpectancy.toFixed(2)}R`, color: portfolio.avgExpectancy > 0 ? '#39ff14' : '#ff0055' },
                ].map(s => (
                  <div key={s.label} className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-2 text-center">
                    <div className="text-[7px] text-slate-500 uppercase tracking-wider mb-0.5">{s.label}</div>
                    <div className="text-xs font-bold font-mono" style={{ color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Engine Breakdown */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[8px] text-slate-500 uppercase tracking-widest">Source Engines:</span>
                {Object.entries(portfolio.engineBreakdown).map(([engine, count]) => (
                  <span key={engine} className="text-[8px] font-mono px-2 py-0.5 rounded border border-slate-700/50 text-slate-300 bg-slate-800/30">
                    {engine}: {count}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Strategy List */}
      {strategies.length === 0 ? (
        <div className="py-8 text-center">
          <Shield className="w-8 h-8 mx-auto text-slate-700 mb-2" />
          <p className="text-[10px] text-slate-500 font-mono">No strategies activated yet.</p>
          <p className="text-[8px] text-slate-600 font-mono mt-1">Use "Bring to Live Trading" on any backtested strategy to add it here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {strategies.map((s) => {
            const m = s.config.backtestMetrics;
            const engineColor = s.config.engineSource?.includes('alpha') ? '#7c3aed'
              : s.config.engineSource?.includes('profile') ? '#00ffea'
              : s.config.engineSource?.includes('experimental') ? '#ff8800'
              : s.config.engineSource?.includes('sandbox') ? '#39ff14' : '#94a3b8';

            return (
              <motion.div key={s.agent_id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }}
                className="bg-slate-950/50 border border-slate-800/60 rounded-xl p-3 flex items-center gap-3">
                {/* Status dot */}
                <div className="w-2 h-2 rounded-full bg-[#39ff14] animate-pulse flex-shrink-0" />

                {/* Strategy info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold font-mono text-white truncate">
                      {s.config.strategyName || s.agent_id}
                    </span>
                    <span className="text-[7px] font-mono px-1.5 py-0.5 rounded border flex-shrink-0"
                      style={{ borderColor: `${engineColor}44`, color: engineColor, background: `${engineColor}11` }}>
                      {s.config.engineSource || 'unknown'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[8px] font-mono text-slate-500">
                    {s.config.predator && s.config.prey && (
                      <span>R{s.config.predator}vR{s.config.prey}</span>
                    )}
                    {s.config.pair && <span>{s.config.pair}</span>}
                    {s.config.gates && <span>G:{s.config.gates}</span>}
                    {s.config.slPips && <span>SL:{s.config.slPips}p</span>}
                    {s.config.session && <span>{s.config.session}</span>}
                    {s.config.activatedAt && (
                      <span className="text-slate-600">
                        since {new Date(s.config.activatedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Backtest metrics */}
                {m && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-center px-2">
                      <div className="text-[6px] text-slate-600 uppercase">WR</div>
                      <div className="text-[9px] font-bold font-mono" style={{ color: (m.winRate ?? 0) >= 50 ? '#39ff14' : '#ff0055' }}>
                        {(m.winRate ?? 0).toFixed(0)}%
                      </div>
                    </div>
                    <div className="text-center px-2">
                      <div className="text-[6px] text-slate-600 uppercase">PF</div>
                      <div className="text-[9px] font-bold font-mono" style={{ color: (m.profitFactor ?? 0) >= 1.5 ? '#39ff14' : '#ff8800' }}>
                        {(m.profitFactor ?? 0).toFixed(2)}
                      </div>
                    </div>
                    <div className="text-center px-2">
                      <div className="text-[6px] text-slate-600 uppercase">Pips</div>
                      <div className="text-[9px] font-bold font-mono" style={{ color: (m.totalPips ?? 0) >= 0 ? '#39ff14' : '#ff0055' }}>
                        {(m.totalPips ?? 0).toFixed(0)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Deactivate button */}
                <button onClick={() => deactivate(s.agent_id)} disabled={deactivating === s.agent_id}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[8px] font-mono font-bold uppercase tracking-widest transition-all hover:bg-[#ff005520] disabled:opacity-50 flex-shrink-0"
                  style={{ border: '1px solid #ff005544', color: '#ff0055' }}>
                  {deactivating === s.agent_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  Remove
                </button>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};
