// Decorrelated Portfolio Blend — Auto-Executor Control Panel
import { motion } from 'framer-motion';
import { Layers, Play, Square, RefreshCw, Zap, Shield, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBlendExecutor } from '@/hooks/useBlendExecutor';

export const BlendExecutorPanel = () => {
  const { running, autoMode, lastResult, cycleCount, runCycle, startAuto, stopAuto } = useBlendExecutor();

  const filled = lastResult?.cycle?.executed ?? 0;
  const existing = lastResult?.cycle?.existingPositions ?? 0;
  const maxPos = lastResult?.cycle?.maxPositions ?? 5;
  const scanned = lastResult?.cycle?.signalsScanned ?? 0;
  const matched = lastResult?.cycle?.candidatesMatched ?? 0;

  return (
    <div className="lg:col-span-12 bg-slate-900/80 backdrop-blur-md border border-[#00ffea]/20 rounded-2xl p-5 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-700/40 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#00ffea]" />
          <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">
            Decorrelated Portfolio Blend — Auto Executor
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
        {/* Strategy Info */}
        <div className="col-span-1 md:col-span-2 space-y-2">
          <p className="text-[9px] text-slate-400 leading-relaxed">
            Selects diversified rank-divergence signals (Predator ≤ #3 vs Prey ≥ #6) from the live sovereign-matrix scan.
            Max {maxPos} concurrent positions · 1,000 units each · 15-pip SL / 30-pip TP · G1 gate required.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[8px] font-mono px-2 py-0.5 rounded border border-slate-700 text-slate-400">
              <Shield className="inline w-2.5 h-2.5 mr-1" />Circuit Breaker Aware
            </span>
            <span className="text-[8px] font-mono px-2 py-0.5 rounded border border-slate-700 text-slate-400">
              <Zap className="inline w-2.5 h-2.5 mr-1" />G16 Spread Guard
            </span>
            <span className="text-[8px] font-mono px-2 py-0.5 rounded border border-slate-700 text-slate-400">
              SL/TP on Fill
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
                <span className="text-slate-500">Scanned</span>
                <span className="font-mono text-white">{scanned} signals</span>
              </div>
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-slate-500">Matched</span>
                <span className="font-mono text-yellow-400">{matched} candidates</span>
              </div>
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-slate-500">Executed</span>
                <span className={cn('font-mono font-bold', filled > 0 ? 'text-[#39ff14]' : 'text-slate-400')}>
                  {filled} filled
                </span>
              </div>
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

      {/* Execution Log */}
      {lastResult?.executions && lastResult.executions.length > 0 && (
        <div className="border-t border-slate-800/50 pt-3">
          <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-2">Execution Log</div>
          <div className="space-y-1">
            {lastResult.executions.map((exec, i) => (
              <div key={i} className="flex items-center gap-3 text-[9px] font-mono">
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  exec.status === 'filled' ? 'bg-[#39ff14]' : 'bg-[#ff0055]'
                )} />
                <span className="text-white font-bold w-16">{exec.pair.replace('_', '/')}</span>
                <span className={exec.direction === 'long' ? 'text-[#00ffea]' : 'text-[#ff0055]'}>
                  {exec.direction.toUpperCase()}
                </span>
                <span className={exec.status === 'filled' ? 'text-[#39ff14]' : 'text-[#ff0055]'}>
                  {exec.status}
                </span>
                {exec.entryPrice && <span className="text-slate-400">@ {exec.entryPrice}</span>}
                {exec.error && <span className="text-[#ff0055] truncate max-w-[200px]">{exec.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
