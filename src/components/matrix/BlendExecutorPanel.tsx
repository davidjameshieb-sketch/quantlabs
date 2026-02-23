// Dynamic Portfolio Blend — Auto-Executor + Live Backtest
// Uses strategies from agent_configs (your activated live portfolio)
import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Layers, Play, Square, RefreshCw, Zap, Shield, AlertTriangle, Target, TrendingUp, TrendingDown, Cpu, Loader2, ShieldCheck, Flame, BarChart3, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBlendExecutor, type BlendExecution, type BlendComponent } from '@/hooks/useBlendExecutor';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

interface ActiveStrategy {
  agent_id: string;
  config: {
    strategyName?: string;
    engineSource?: string;
    predator?: number;
    prey?: number;
    gates?: string;
    slPips?: number;
    tpRatio?: number | string;
    session?: string;
    pair?: string;
    dna?: {
      slMultiplier?: number;
      tpMultiplier?: number;
      direction?: number;
      sessionFilter?: number;
      [key: string]: unknown;
    };
    backtestMetrics?: {
      trades?: number;
      winRate?: number;
      profitFactor?: number;
      totalPips?: number;
      maxDrawdown?: number;
    };
  };
}

interface BlendComponentSummary {
  id: string; label: string; weight: number; trades: number; wins: number; losses: number;
  winRate: number; totalPips: number; profitFactor: number; avgWin: number; avgLoss: number;
}
interface BlendBacktestResult {
  success: boolean;
  error?: string;
  version?: string;
  environment?: string;
  candlesPerPair?: number;
  pairsLoaded?: number;
  totalSnapshots?: number;
  componentsUsed?: number;
  dateRange?: { start: string; end: string };
  portfolio?: {
    totalTrades: number; wins: number; losses: number; winRate: number; profitFactor: number;
    totalPips: number; maxDrawdown: number; aggressiveMaxDD: number;
    institutionalProfit: number; aggressiveProfit: number;
    finalEquity: number; aggressiveFinalEquity: number;
    expectancy: number; avgWin: number; avgLoss: number;
  };
  components?: BlendComponentSummary[];
  periodStats?: Array<{ period: string; returnPct: number; winRate: number; profitFactor: number; maxDD: number; netPips: number; trades: number }>;
  equityCurve?: Array<{ time: string; equity: number }>;
  aggressiveEquityCurve?: Array<{ time: string; equity: number }>;
}

function parseConfig(raw: Json): ActiveStrategy['config'] {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) return raw as any;
  return {};
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'filled' ? 'bg-[#39ff14]' : status === 'skipped' ? 'bg-slate-500' : 'bg-[#ff0055]';
  return <span className={cn('w-1.5 h-1.5 rounded-full inline-block', color)} />;
}

/** Convert an activated strategy to a BlendComponent for the edge function */
function strategyToBlendComponent(config: ActiveStrategy['config'], weight: number): BlendComponent & { fixedPair?: string; atrSlMultiplier?: number; atrTpMultiplier?: number; session?: string; gates?: string; dna?: Record<string, unknown> } {
  const isRankBased = !!(config.predator && config.prey);
  const gates = config.gates || 'G1+G2';

  if (isRankBased) {
    return {
      id: `${config.predator}v${config.prey}`,
      predatorRank: config.predator!,
      preyRank: config.prey!,
      requireG3: gates.includes('G3'),
      slType: 'fixed_custom',
      entryType: 'order_block',
      weight,
      label: config.strategyName || `R${config.predator}vR${config.prey}`,
      fixedPips: config.slPips || 30,
      tpRatio: typeof config.tpRatio === 'number' ? config.tpRatio : 2.0,
      gates,
      session: config.session,
    };
  }

  // Alpha-discovery / pair-specific strategy — pass FULL DNA for true parity
  const slPips = config.dna?.slMultiplier ? Math.round(config.dna.slMultiplier * 14) : (config.slPips || 30);
  const tpRatio = config.dna?.tpMultiplier && config.dna?.slMultiplier
    ? Math.round((config.dna.tpMultiplier / config.dna.slMultiplier) * 100) / 100
    : (typeof config.tpRatio === 'number' ? config.tpRatio : 2.0);

  return {
    id: config.pair?.replace('_', '') || 'UNK',
    predatorRank: 0,
    preyRank: 0,
    requireG3: false,
    slType: 'fixed_custom',
    entryType: 'order_block',
    weight,
    label: config.strategyName || config.pair || 'Unknown',
    fixedPair: config.pair,
    fixedPips: slPips,
    tpRatio,
    atrSlMultiplier: config.dna?.slMultiplier,
    atrTpMultiplier: config.dna?.tpMultiplier,
    gates: 'G1+G2+G3',
    session: config.session,
    dna: config.dna, // Pass full DNA genome for alpha-discovery parity
  };
}

export const BlendExecutorPanel = () => {
  const { running, autoMode, lastResult, cycleCount, runCycle, startAuto, stopAuto, setComponents } = useBlendExecutor();
  const [strategies, setStrategies] = useState<ActiveStrategy[]>([]);
  const [loadingStrategies, setLoadingStrategies] = useState(true);

  const [btLoading, setBtLoading] = useState(false);
  const [btResult, setBtResult] = useState<BlendBacktestResult | null>(null);
  const [btError, setBtError] = useState<string | null>(null);
  const [btEnv, setBtEnv] = useState<'practice' | 'live'>('live');
  const [btCandles, setBtCandles] = useState(15000);

  // Fetch activated strategies from agent_configs
  const fetchStrategies = useCallback(async () => {
    setLoadingStrategies(true);
    const { data } = await supabase
      .from('agent_configs')
      .select('agent_id, config, is_active')
      .eq('is_active', true)
      .order('agent_id');

    if (data) {
      const parsed = data
        .map(d => ({ agent_id: d.agent_id, config: parseConfig(d.config) }))
        .filter(s => (s.config.predator && s.config.prey) || s.config.pair); // Rank-based OR pair-specific
      setStrategies(parsed);
    }
    setLoadingStrategies(false);
  }, []);

  useEffect(() => { fetchStrategies(); }, [fetchStrategies]);

  // Build BlendComponents from active strategies with equal weighting
  const blendComponents = useMemo<BlendComponent[]>(() => {
    if (strategies.length === 0) return [];
    const weight = 1 / strategies.length;
    return strategies.map(s => strategyToBlendComponent(s.config, weight));
  }, [strategies]);

  // Keep the hook's components ref in sync
  useEffect(() => {
    setComponents(blendComponents.length > 0 ? blendComponents : null);
  }, [blendComponents, setComponents]);

  // Build display specs from strategies
  const componentSpecs = useMemo(() => {
    return strategies.map(s => {
      const isRank = !!(s.config.predator && s.config.prey);
      return {
        id: isRank ? `${s.config.predator}v${s.config.prey}` : s.config.pair?.replace('_', '/') || '?',
        weight: `${Math.round(100 / strategies.length)}%`,
        gates: isRank ? (s.config.gates || 'G1+G2') : 'DNA',
        sl: isRank ? `${s.config.slPips || 30} pip fixed` : `${s.config.dna?.slMultiplier?.toFixed(1) || '?'}× ATR`,
        entry: isRank ? 'Order block' : (s.config.engineSource || 'alpha'),
        tp: isRank
          ? (typeof s.config.tpRatio === 'number' ? `${s.config.tpRatio}:1 R:R` : '2:1 R:R')
          : `${s.config.dna?.tpMultiplier?.toFixed(1) || '?'}× ATR`,
        session: s.config.session || 'all',
        name: s.config.strategyName || (isRank ? `R${s.config.predator}vR${s.config.prey}` : s.config.pair || '?'),
        source: s.config.engineSource || 'unknown',
      };
    });
  }, [strategies]);

  const filled = lastResult?.cycle?.executed ?? 0;
  const existing = lastResult?.cycle?.existingPositions ?? 0;
  const maxPos = lastResult?.cycle?.maxPositions ?? strategies.length;
  const skipped = lastResult?.cycle?.skipped ?? 0;
  const errors = lastResult?.cycle?.errors ?? 0;

  const hasStrategies = strategies.length > 0;

  return (
    <div className="lg:col-span-12 bg-slate-900/80 backdrop-blur-md border border-[#00ffea]/20 rounded-2xl p-5 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700/40 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#00ffea]" />
          <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">
            Dynamic Portfolio Blend — Precision Executor v3
          </h2>
          <span className="text-[8px] font-mono text-slate-500 border border-slate-700 px-1.5 py-0.5 rounded">
            PRACTICE ONLY
          </span>
          <span className="text-[8px] font-mono px-1.5 py-0.5 rounded border"
            style={{
              borderColor: hasStrategies ? '#39ff1444' : '#ff005544',
              color: hasStrategies ? '#39ff14' : '#ff0055',
              background: hasStrategies ? '#39ff1410' : '#ff005510',
            }}>
            {strategies.length} STRATEGIES
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchStrategies} className="text-[8px] font-mono text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1">
            <RefreshCw className="w-2.5 h-2.5" /> Sync
          </button>
          {autoMode && (
            <motion.span
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="flex items-center gap-1 text-[9px] font-mono text-[#00ffea]"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#00ffea]" />
              AUTO · 10MIN CYCLES
            </motion.span>
          )}
          <span className="text-[9px] font-mono text-slate-500">
            Cycles: {cycleCount}
          </span>
        </div>
      </div>

      {!hasStrategies && !loadingStrategies ? (
        <div className="py-8 text-center">
          <Rocket className="w-8 h-8 mx-auto text-slate-700 mb-2" />
          <p className="text-[10px] text-slate-500 font-mono">No strategies activated for live trading.</p>
          <p className="text-[8px] text-slate-600 font-mono mt-1">Use "Bring to Live Trading" on any backtested strategy to populate this portfolio.</p>
        </div>
      ) : loadingStrategies ? (
        <div className="py-6 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-[#00ffea]" />
          <span className="text-[9px] font-mono text-slate-400">Loading active portfolio…</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {/* Component Table */}
            <div className="col-span-1 md:col-span-2">
              <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-2">{strategies.length}-Component Portfolio</div>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {componentSpecs.map(spec => {
                  const exec = lastResult?.executions?.find(e => e.component === spec.id);
                  return (
                    <div key={spec.id} className="flex items-center gap-2 text-[9px] font-mono">
                      {exec ? <StatusDot status={exec.status} /> : <span className="w-1.5 h-1.5 rounded-full bg-slate-700 inline-block" />}
                      <span className="text-[#00ffea] font-bold w-8">#{spec.id}</span>
                      <span className="text-yellow-400 w-8">{spec.weight}</span>
                      <span className="text-slate-400 w-20">{spec.gates}</span>
                      <span className="text-slate-500 w-20 truncate">{spec.sl}</span>
                      <span className="text-slate-500 w-16 truncate">{spec.tp}</span>
                      <span className="text-slate-600 w-14 truncate">{spec.session}</span>
                      {exec && (
                        <span className={cn(
                          'text-[8px] truncate flex-1',
                          exec.status === 'filled' ? 'text-[#39ff14]' : exec.status === 'skipped' ? 'text-slate-500' : 'text-[#ff0055]'
                        )}>
                          {exec.status === 'filled'
                            ? `${exec.pair?.replace('_', '/')} ${exec.direction?.toUpperCase()} ${exec.units}u @ ${exec.entryPrice}`
                            : exec.status === 'skipped'
                              ? exec.skipReason
                              : exec.error || exec.status
                          }
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-3">
                <span className="text-[8px] font-mono px-2 py-0.5 rounded border border-slate-700 text-slate-400">
                  <Shield className="inline w-2.5 h-2.5 mr-1" />Circuit Breaker
                </span>
                <span className="text-[8px] font-mono px-2 py-0.5 rounded border border-slate-700 text-slate-400">
                  <Zap className="inline w-2.5 h-2.5 mr-1" />G16 Spread Guard
                </span>
                <span className="text-[8px] font-mono px-2 py-0.5 rounded border border-slate-700 text-slate-400">
                  <Target className="inline w-2.5 h-2.5 mr-1" />R:R per strategy
                </span>
                <span className="text-[8px] font-mono px-2 py-0.5 rounded border border-slate-700 text-slate-400">
                  5,000u total · equal weighted
                </span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col gap-2 justify-center">
              <button
                onClick={() => autoMode ? stopAuto() : startAuto()}
                disabled={!hasStrategies}
                className={cn(
                  'flex items-center justify-center gap-2 text-[10px] font-mono px-4 py-2.5 rounded-lg font-bold uppercase tracking-wider transition-all disabled:opacity-30',
                  autoMode
                    ? 'bg-[#ff0055] text-white hover:bg-[#ff0055]/80'
                    : 'bg-[#00ffea] text-slate-950 hover:bg-[#00ffea]/80'
                )}
                style={!autoMode && hasStrategies ? { boxShadow: '0 0 15px rgba(0,255,234,0.3)' } : {}}
              >
                {autoMode ? (
                  <><Square className="w-3.5 h-3.5" /> STOP AUTO</>
                ) : (
                  <><Play className="w-3.5 h-3.5" /> START AUTO</>
                )}
              </button>
              <button
                onClick={runCycle}
                disabled={running || !hasStrategies}
                className={cn(
                  'flex items-center justify-center gap-2 text-[10px] font-mono px-4 py-2 rounded-lg font-bold uppercase tracking-wider transition-all',
                  'border border-slate-600 text-slate-300 hover:bg-slate-800',
                  (running || !hasStrategies) && 'opacity-50 cursor-not-allowed'
                )}
              >
                <RefreshCw className={cn('w-3 h-3', running && 'animate-spin')} />
                {running ? 'RUNNING…' : 'RUN SINGLE CYCLE'}
              </button>
            </div>

            {/* Last Result */}
            <div className="space-y-1.5">
              <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-1">Last Cycle</div>
              {lastResult ? (
                <>
                  <div className="flex items-center justify-between text-[9px]">
                    <span className="text-slate-500">Components</span>
                    <span className="font-mono text-white">{lastResult.cycle?.componentsEvaluated ?? strategies.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-[9px]">
                    <span className="text-slate-500">Filled</span>
                    <span className={cn('font-mono font-bold', filled > 0 ? 'text-[#39ff14]' : 'text-slate-400')}>
                      {filled}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[9px]">
                    <span className="text-slate-500">Skipped</span>
                    <span className="font-mono text-yellow-400">{skipped}</span>
                  </div>
                  {errors > 0 && (
                    <div className="flex items-center justify-between text-[9px]">
                      <span className="text-slate-500">Errors</span>
                      <span className="font-mono text-[#ff0055]">{errors}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[9px]">
                    <span className="text-slate-500">Open</span>
                    <span className="font-mono text-[#00ffea]">{existing}/{maxPos}</span>
                  </div>
                  {lastResult.reason === 'circuit_breaker_active' && (
                    <div className="flex items-center gap-1 text-[8px] text-[#ff0055] mt-1">
                      <AlertTriangle className="w-3 h-3" /> Circuit breaker active
                    </div>
                  )}
                  {lastResult.error && (
                    <div className="text-[8px] text-[#ff0055] mt-1 truncate" title={lastResult.error}>
                      ⚠️ {lastResult.error}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[9px] text-slate-600 italic">No cycles run yet</p>
              )}
            </div>
          </div>

          {/* Currency Ranks */}
          {lastResult?.sortedCurrencies && (
            <div className="border-t border-slate-800/50 pt-3 mb-3">
              <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-1.5">Live Currency Ranks</div>
              <div className="flex items-center gap-2 flex-wrap">
                {lastResult.sortedCurrencies.map((cur, i) => (
                  <span key={cur} className={cn(
                    'text-[9px] font-mono px-2 py-0.5 rounded border',
                    i < 3 ? 'border-[#39ff14]/30 text-[#39ff14]' :
                    i >= 5 ? 'border-[#ff0055]/30 text-[#ff0055]' :
                    'border-slate-700 text-slate-400'
                  )}>
                    #{i + 1} {cur}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Filled Trades */}
          {lastResult?.executions?.some(e => e.status === 'filled') && (
            <div className="border-t border-slate-800/50 pt-3">
              <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-2">Filled Trades</div>
              <div className="space-y-1">
                {lastResult.executions.filter(e => e.status === 'filled').map((exec, i) => (
                  <div key={i} className="flex items-center gap-3 text-[9px] font-mono">
                    <StatusDot status="filled" />
                    <span className="text-[#00ffea] font-bold w-8">#{exec.component}</span>
                    <span className="text-white font-bold w-16">{exec.pair?.replace('_', '/')}</span>
                    <span className={exec.direction === 'long' ? 'text-[#00ffea]' : 'text-[#ff0055]'}>
                      {exec.direction === 'long' ? <TrendingUp className="inline w-3 h-3" /> : <TrendingDown className="inline w-3 h-3" />}
                      {' '}{exec.direction?.toUpperCase()}
                    </span>
                    <span className="text-yellow-400">{exec.units}u ({((exec.weight ?? 0) * 100).toFixed(0)}%)</span>
                    <span className="text-slate-400">@ {exec.entryPrice}</span>
                    <span className="text-slate-500">SL={exec.slPrice} TP={exec.tpPrice}</span>
                    <span className="text-slate-600">{exec.slType}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ PORTFOLIO LIVE BACKTEST ═══ */}
      <div className="border-t border-slate-700/40 pt-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#ff6600]" />
            <h3 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">
              Live Strategy Backtest — 100% Forward Test
            </h3>
            <span className="text-[8px] font-mono text-[#ff6600] border border-[#ff6600]/30 px-1.5 py-0.5 rounded bg-[#ff6600]/10">
              {hasStrategies ? `${strategies.length} STRATEGIES` : 'NO PORTFOLIO'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap mb-4">
          <select value={btCandles} onChange={e => setBtCandles(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-[10px] font-mono text-slate-300"
            disabled={btLoading}>
            <option value={5000}>5,000 candles (~4 months)</option>
            <option value={10000}>10,000 candles (~8 months)</option>
            <option value={15000}>15,000 candles (~14 months)</option>
            <option value={20000}>20,000 candles (~16 months)</option>
          </select>
          <select value={btEnv} onChange={e => setBtEnv(e.target.value as 'practice' | 'live')}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-[10px] font-mono text-slate-300"
            disabled={btLoading}>
            <option value="practice">Practice</option>
            <option value="live">Live</option>
          </select>
          <button onClick={runBlendBacktest} disabled={btLoading || !hasStrategies}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all disabled:opacity-50"
            style={{ background: '#ff6600', color: '#0f172a', boxShadow: '0 0 20px rgba(255,102,0,0.3)' }}>
            {btLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            {btLoading ? 'Running…' : 'Run Portfolio Backtest'}
          </button>
        </div>

        {btError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-mono mb-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {btError}
          </div>
        )}

        {btLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-4 flex items-center gap-3">
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}>
              <Cpu className="w-5 h-5 text-[#ff6600]" />
            </motion.div>
            <span className="text-[10px] text-slate-400 font-mono">Fetching candles & simulating {strategies.length}-component portfolio blend…</span>
          </motion.div>
        )}

        {btResult?.portfolio && (
          <div className="space-y-4">
            {/* Portfolio KPIs */}
            <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
              {[
                { label: 'TOTAL RETURN', value: `$${btResult.portfolio.institutionalProfit.toLocaleString()}`, positive: btResult.portfolio.institutionalProfit > 0 },
                { label: 'WIN RATE', value: `${btResult.portfolio.winRate}%`, positive: btResult.portfolio.winRate >= 50 },
                { label: 'PROFIT FACTOR', value: `${btResult.portfolio.profitFactor}`, positive: btResult.portfolio.profitFactor >= 1.3 },
                { label: 'MAX DD', value: `${btResult.portfolio.maxDrawdown}%`, positive: btResult.portfolio.maxDrawdown > -20 },
                { label: 'NET PIPS', value: `${btResult.portfolio.totalPips > 0 ? '+' : ''}${btResult.portfolio.totalPips}`, positive: btResult.portfolio.totalPips > 0 },
                { label: 'FINAL EQUITY', value: `$${btResult.portfolio.finalEquity.toLocaleString()}`, positive: btResult.portfolio.finalEquity > 1000 },
                { label: 'TRADES', value: `${btResult.portfolio.totalTrades}`, positive: true },
              ].map(kpi => (
                <div key={kpi.label} className="bg-slate-800/60 border border-slate-700/30 rounded-lg p-2 text-center">
                  <div className="text-[7px] text-slate-500 uppercase tracking-wider">{kpi.label}</div>
                  <div className={cn('text-[12px] font-bold font-mono', kpi.positive ? 'text-[#39ff14]' : 'text-[#ff0055]')}>
                    {kpi.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Dual Models */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-800/40 border border-emerald-500/20 rounded-lg p-3">
                <div className="text-[8px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1 mb-2">
                  <ShieldCheck className="w-3 h-3" /> Institutional (1% Risk)
                </div>
                <div className="text-[14px] font-bold font-mono text-emerald-400">
                  ${btResult.portfolio.institutionalProfit.toLocaleString()}
                </div>
                <div className="text-[9px] text-slate-500 font-mono">Final: ${btResult.portfolio.finalEquity.toLocaleString()} · DD: {btResult.portfolio.maxDrawdown}%</div>
              </div>
              <div className="bg-slate-800/40 border border-[#ff6600]/20 rounded-lg p-3">
                <div className="text-[8px] font-bold text-[#ff6600] uppercase tracking-widest flex items-center gap-1 mb-2">
                  <Flame className="w-3 h-3" /> Aggressive (5% Risk)
                </div>
                <div className="text-[14px] font-bold font-mono text-[#ff6600]">
                  ${btResult.portfolio.aggressiveProfit.toLocaleString()}
                </div>
                <div className="text-[9px] text-slate-500 font-mono">Final: ${btResult.portfolio.aggressiveFinalEquity?.toLocaleString()} · DD: {btResult.portfolio.aggressiveMaxDD}%</div>
              </div>
            </div>

            {/* Equity Curve */}
            {btResult.equityCurve && btResult.equityCurve.length > 2 && (
              <div>
                <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-1">PORTFOLIO EQUITY CURVE</div>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-[8px] font-mono text-emerald-400">━ 1% Risk</span>
                  <span className="text-[8px] font-mono text-[#ff6600]">╌ 5% Risk</span>
                </div>
                <BlendEquityCurve instCurve={btResult.equityCurve} aggCurve={btResult.aggressiveEquityCurve || []} />
                <div className="flex justify-between text-[8px] text-slate-600 font-mono mt-1">
                  <span>{btResult.dateRange?.start?.slice(0, 10)}</span>
                  <span>{btResult.dateRange?.end?.slice(0, 10)}</span>
                </div>
              </div>
            )}

            {/* Period Stats */}
            {btResult.periodStats && btResult.periodStats.length > 0 && (
              <div>
                <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-2">REALISTIC PERIOD EXPECTATIONS ($1K BASE)</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[9px] font-mono">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-700/30">
                        <th className="text-left py-1 px-2">PERIOD</th>
                        <th className="text-right py-1 px-2">RETURN</th>
                        <th className="text-right py-1 px-2">WR</th>
                        <th className="text-right py-1 px-2">PF</th>
                        <th className="text-right py-1 px-2">MAX DD</th>
                        <th className="text-right py-1 px-2">NET PIPS</th>
                        <th className="text-right py-1 px-2">TRADES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {btResult.periodStats.map(ps => (
                        <tr key={ps.period} className="border-b border-slate-800/30">
                          <td className="py-1.5 px-2 text-white font-bold">{ps.period}</td>
                          <td className={cn('text-right py-1.5 px-2', ps.returnPct > 0 ? 'text-[#39ff14]' : 'text-[#ff0055]')}>
                            {ps.returnPct > 0 ? '+' : ''}{ps.returnPct}%
                          </td>
                          <td className="text-right py-1.5 px-2 text-slate-300">{ps.winRate}%</td>
                          <td className="text-right py-1.5 px-2 text-slate-300">{ps.profitFactor}</td>
                          <td className={cn('text-right py-1.5 px-2', ps.maxDD > -15 ? 'text-[#39ff14]' : 'text-[#ff0055]')}>{ps.maxDD}%</td>
                          <td className={cn('text-right py-1.5 px-2', ps.netPips > 0 ? 'text-[#39ff14]' : 'text-[#ff0055]')}>
                            {ps.netPips > 0 ? '+' : ''}{ps.netPips}
                          </td>
                          <td className="text-right py-1.5 px-2 text-slate-400">{ps.trades}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Per-Component Breakdown */}
            {btResult.components && (
              <div>
                <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-2">PER-COMPONENT BREAKDOWN</div>
                <div className="space-y-1">
                  {btResult.components.map(comp => (
                    <div key={comp.id} className="flex items-center gap-3 text-[9px] font-mono bg-slate-800/30 rounded-lg px-3 py-2">
                      <span className="text-[#00ffea] font-bold w-8">#{comp.id}</span>
                      <span className="text-yellow-400 w-8">{(comp.weight * 100).toFixed(0)}%</span>
                      <span className="text-slate-300 w-14">{comp.trades} trades</span>
                      <span className={cn('w-12', comp.winRate >= 50 ? 'text-[#39ff14]' : 'text-[#ff0055]')}>
                        {comp.winRate}% WR
                      </span>
                      <span className={cn('w-10', comp.profitFactor >= 1.3 ? 'text-[#39ff14]' : comp.profitFactor >= 1.0 ? 'text-yellow-400' : 'text-[#ff0055]')}>
                        PF {comp.profitFactor}
                      </span>
                      <span className={cn('w-16', comp.totalPips > 0 ? 'text-[#39ff14]' : 'text-[#ff0055]')}>
                        {comp.totalPips > 0 ? '+' : ''}{comp.totalPips}p
                      </span>
                      <span className="text-slate-500 truncate flex-1">{comp.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[8px] font-mono px-2 py-0.5 rounded border border-slate-700 text-slate-500">
                {btResult.candlesPerPair?.toLocaleString()} candles · {btResult.pairsLoaded} pairs
              </span>
              <span className="text-[8px] font-mono px-2 py-0.5 rounded border border-slate-700 text-slate-500">
                {btResult.dateRange?.start?.slice(0, 10)} → {btResult.dateRange?.end?.slice(0, 10)}
              </span>
              <span className="text-[8px] font-mono px-2 py-0.5 rounded border border-[#ff6600]/30 text-[#ff6600]">
                100% FORWARD TEST · {btResult.componentsUsed || strategies.length} COMPONENTS
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  async function runBlendBacktest() {
    setBtLoading(true);
    setBtError(null);
    setBtResult(null);
    try {
      const body: Record<string, unknown> = { environment: btEnv, candles: btCandles };
      if (blendComponents.length > 0) {
        body.components = blendComponents;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/blend-live-backtest`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Backtest failed');
      setBtResult(data);
    } catch (err) {
      setBtError((err as Error).message);
    } finally {
      setBtLoading(false);
    }
  }
};

function BlendEquityCurve({ instCurve, aggCurve }: { instCurve: Array<{ time: string; equity: number }>; aggCurve: Array<{ time: string; equity: number }> }) {
  const w = 600, h = 120, pad = 4;
  const allVals = [...instCurve.map(c => c.equity), ...aggCurve.map(c => c.equity)];
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const range = max - min || 1;

  const mapPoints = (curve: Array<{ equity: number }>) =>
    curve.map((pt, i) => {
      const x = pad + (i / (curve.length - 1)) * (w - 2 * pad);
      const y = h - pad - ((pt.equity - min) / range) * (h - 2 * pad);
      return `${x},${y}`;
    });

  const instPoints = mapPoints(instCurve);
  const aggPoints = aggCurve.length > 0 ? mapPoints(aggCurve) : [];
  const instPositive = instCurve[instCurve.length - 1]?.equity >= 1000;
  const aggPositive = aggCurve.length > 0 ? aggCurve[aggCurve.length - 1]?.equity >= 1000 : true;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }} preserveAspectRatio="none">
      {aggPoints.length > 0 && (
        <polyline points={aggPoints.join(' ')} fill="none" stroke={aggPositive ? '#ff6600' : '#ff0055'} strokeWidth="1" strokeOpacity="0.5" strokeDasharray="3,2" />
      )}
      <defs>
        <linearGradient id="blend-inst-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={instPositive ? '#39ff14' : '#ff0055'} stopOpacity="0.15" />
          <stop offset="100%" stopColor={instPositive ? '#39ff14' : '#ff0055'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`${pad},${h - pad} ${instPoints.join(' ')} ${w - pad},${h - pad}`}
        fill="url(#blend-inst-grad)"
      />
      <polyline points={instPoints.join(' ')} fill="none" stroke={instPositive ? '#39ff14' : '#ff0055'} strokeWidth="1.5" />
    </svg>
  );
}
