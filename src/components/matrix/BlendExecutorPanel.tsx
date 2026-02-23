// Decorrelated Portfolio Blend — Auto-Executor Control Panel
import { motion } from 'framer-motion';
import { Layers, Play, Square, RefreshCw, Zap, Shield, AlertTriangle, Target, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBlendExecutor, type BlendExecution } from '@/hooks/useBlendExecutor';

const COMPONENT_SPECS = [
  { id: '3v8', weight: '44%', gates: 'G1+G2+G3', sl: 'Swing low (5-bar)', entry: 'Z-OFI > 2.0' },
  { id: '1v6', weight: '22%', gates: 'G1+G2+G3', sl: 'Atlas Wall -10', entry: 'Order block' },
  { id: '1v7', weight: '15%', gates: 'G1+G2+G3', sl: '2.0x ATR', entry: 'Order block' },
  { id: '3v7', weight: '11%', gates: 'G1+G2', sl: '30 pip fixed', entry: 'Order block' },
  { id: '3v6', weight: '9%', gates: 'G1+G2', sl: '2.0x ATR', entry: 'Order block' },
];

function StatusDot({ status }: { status: string }) {
  const color = status === 'filled' ? 'bg-[#39ff14]' : status === 'skipped' ? 'bg-slate-500' : 'bg-[#ff0055]';
  return <span className={cn('w-1.5 h-1.5 rounded-full inline-block', color)} />;
}

export const BlendExecutorPanel = () => {
  const { running, autoMode, lastResult, cycleCount, runCycle, startAuto, stopAuto } = useBlendExecutor();

  const filled = lastResult?.cycle?.executed ?? 0;
  const existing = lastResult?.cycle?.existingPositions ?? 0;
  const maxPos = lastResult?.cycle?.maxPositions ?? 5;
  const skipped = lastResult?.cycle?.skipped ?? 0;
  const errors = lastResult?.cycle?.errors ?? 0;

  return (
    <div className="lg:col-span-12 bg-slate-900/80 backdrop-blur-md border border-[#00ffea]/20 rounded-2xl p-5 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700/40 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#00ffea]" />
          <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">
            Decorrelated Portfolio Blend — Precision Executor v2
          </h2>
          <span className="text-[8px] font-mono text-slate-500 border border-slate-700 px-1.5 py-0.5 rounded">
            PRACTICE ONLY
          </span>
        </div>
        <div className="flex items-center gap-2">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {/* Component Table */}
        <div className="col-span-1 md:col-span-2">
          <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-2">5-Component Blend</div>
          <div className="space-y-1">
            {COMPONENT_SPECS.map(spec => {
              const exec = lastResult?.executions?.find(e => e.component === spec.id);
              return (
                <div key={spec.id} className="flex items-center gap-2 text-[9px] font-mono">
                  {exec ? <StatusDot status={exec.status} /> : <span className="w-1.5 h-1.5 rounded-full bg-slate-700 inline-block" />}
                  <span className="text-[#00ffea] font-bold w-8">#{spec.id}</span>
                  <span className="text-yellow-400 w-8">{spec.weight}</span>
                  <span className="text-slate-400 w-20">{spec.gates}</span>
                  <span className="text-slate-500 w-28 truncate">{spec.sl}</span>
                  <span className="text-slate-500 w-24 truncate">{spec.entry}</span>
                  {exec && (
                    <span className={cn(
                      'text-[8px]',
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
              <Target className="inline w-2.5 h-2.5 mr-1" />2:1 R:R
            </span>
            <span className="text-[8px] font-mono px-2 py-0.5 rounded border border-slate-700 text-slate-400">
              5,000u total · weighted
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-2 justify-center">
          <button
            onClick={() => autoMode ? stopAuto() : startAuto()}
            className={cn(
              'flex items-center justify-center gap-2 text-[10px] font-mono px-4 py-2.5 rounded-lg font-bold uppercase tracking-wider transition-all',
              autoMode
                ? 'bg-[#ff0055] text-white hover:bg-[#ff0055]/80'
                : 'bg-[#00ffea] text-slate-950 hover:bg-[#00ffea]/80'
            )}
            style={!autoMode ? { boxShadow: '0 0 15px rgba(0,255,234,0.3)' } : {}}
          >
            {autoMode ? (
              <><Square className="w-3.5 h-3.5" /> STOP AUTO</>
            ) : (
              <><Play className="w-3.5 h-3.5" /> START AUTO</>
            )}
          </button>
          <button
            onClick={runCycle}
            disabled={running}
            className={cn(
              'flex items-center justify-center gap-2 text-[10px] font-mono px-4 py-2 rounded-lg font-bold uppercase tracking-wider transition-all',
              'border border-slate-600 text-slate-300 hover:bg-slate-800',
              running && 'opacity-50 cursor-not-allowed'
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
                <span className="font-mono text-white">{lastResult.cycle?.componentsEvaluated ?? 5}</span>
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

      {/* Detailed Execution Log (filled trades only) */}
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
    </div>
  );
};
