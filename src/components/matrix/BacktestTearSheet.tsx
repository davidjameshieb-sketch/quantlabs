// Backtest Tear Sheet — Three Pillars Presentation Dashboard
// Highlights: Cross-Sectional Divergence, Atlas Walls, Atlas Snap/David Vector

import { motion } from 'framer-motion';
import { Shield, Zap, Target, Clock, TrendingUp, TrendingDown, BarChart3, Layers } from 'lucide-react';
import type { BacktestResult, SessionStats, PillarSummary, RankComboResult } from '@/hooks/useRankExpectancy';

interface Props {
  result: BacktestResult;
}

const SESSION_COLORS: Record<string, string> = {
  ASIA: '#ff8800',
  LONDON: '#00ffea',
  NEW_YORK: '#39ff14',
  NY_CLOSE: '#ff0055',
};

const SESSION_LABELS: Record<string, string> = {
  ASIA: '🌏 Asia (00-07 UTC)',
  LONDON: '🇬🇧 London (07-12 UTC)',
  NEW_YORK: '🇺🇸 New York (12-17 UTC)',
  NY_CLOSE: '🌙 NY Close (17-21 UTC)',
};

function getPipsColor(pips: number): string {
  if (pips > 50) return '#39ff14';
  if (pips > 0) return '#00ffea';
  if (pips > -20) return '#ff8800';
  return '#ff0055';
}

export const BacktestTearSheet = ({ result }: Props) => {
  const { pillarSummary, sessionStats, comboResults, elevatorPitch } = result;
  const combo1v8 = comboResults.find(c => c.strongRank === 1 && c.weakRank === 8);
  const combo4v5 = comboResults.find(c => c.strongRank === 4 && c.weakRank === 5);

  return (
    <div className="space-y-5">
      {/* ── Elevator Pitch Banner ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-slate-900/90 via-purple-950/30 to-slate-900/90 backdrop-blur-md border border-purple-500/30 rounded-2xl p-6 shadow-2xl"
      >
        <div className="flex items-start gap-3 mb-4">
          <Zap className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-[11px] font-bold tracking-widest text-purple-300 uppercase mb-2">
              CustomQuantLabs — Strategy Tear Sheet
            </h2>
            <p className="text-[10px] text-slate-300 leading-relaxed font-mono italic">
              "{elevatorPitch}"
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[8px] font-mono text-slate-500">
          <span>{result.candlesPerPair} candles</span>
          <span>·</span>
          <span>{result.pairsLoaded} pairs</span>
          <span>·</span>
          <span>{result.totalSnapshots} snapshots</span>
          <span>·</span>
          <span>{new Date(result.dateRange.start).toLocaleDateString()} → {new Date(result.dateRange.end).toLocaleDateString()}</span>
        </div>
      </motion.div>

      {/* ── Three Pillars Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pillar 1: Cross-Sectional Divergence */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-900/80 backdrop-blur-md border border-[#00ffea]/30 rounded-2xl p-5 shadow-2xl"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#00ffea]/10 border border-[#00ffea]/30">
              <Target className="w-4 h-4 text-[#00ffea]" />
            </div>
            <div>
              <h3 className="text-[10px] font-bold text-[#00ffea] uppercase tracking-wider">Pillar 1</h3>
              <p className="text-[8px] text-slate-400">Cross-Sectional Divergence</p>
            </div>
          </div>
          <p className="text-[9px] text-slate-400 leading-relaxed mb-4">
            Rank all 8 currencies across 28 crosses. Isolate the maximum kinetic potential: <span className="text-[#00ffea] font-bold">Rank #1 Predator</span> vs <span className="text-[#ff0055] font-bold">Rank #8 Prey</span>.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <StatBox label="Rank WR Edge" value={`+${pillarSummary.pillar1_divergenceEdge}%`}
              color={pillarSummary.pillar1_divergenceEdge > 0 ? '#39ff14' : '#ff0055'} />
            <StatBox label="Baseline (4v5)" value={`${pillarSummary.baselineWR}%`} color="#ff8800" />
            <StatBox label="#1v8 WR" value={`${combo1v8?.winRate ?? 0}%`} color="#00ffea" />
            <StatBox label="#4v5 WR (Chop)" value={`${combo4v5?.winRate ?? 0}%`} color="#ff0055" />
          </div>
        </motion.div>

        {/* Pillar 2: Atlas Walls */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-900/80 backdrop-blur-md border border-[#39ff14]/30 rounded-2xl p-5 shadow-2xl"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#39ff14]/10 border border-[#39ff14]/30">
              <Shield className="w-4 h-4 text-[#39ff14]" />
            </div>
            <div>
              <h3 className="text-[10px] font-bold text-[#39ff14] uppercase tracking-wider">Pillar 2</h3>
              <p className="text-[8px] text-slate-400">Atlas Walls — Structural Breakout</p>
            </div>
          </div>
          <p className="text-[9px] text-slate-400 leading-relaxed mb-4">
            Maps the 20-period structural high/low boundary. Only enters when price <span className="text-[#39ff14] font-bold">breaks through the Atlas Wall</span> — confirming institutional order flow absorption.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <StatBox label="Gate 2 Rejections" value={`${combo1v8?.rejectedByGate2 ?? 0}`} color="#ff8800" />
            <StatBox label="Filter Rate" value={`${combo1v8 ? Math.round((combo1v8.rejectedByGate2 / Math.max(1, combo1v8.rejectedByGate2 + combo1v8.gatedTrades)) * 100) : 0}%`} color="#ff8800" />
            <StatBox label="Gated WR" value={`${combo1v8?.gatedWinRate ?? 0}%`} color="#39ff14" />
            <StatBox label="WR Boost" value={`+${pillarSummary.pillar2_atlasWallsEdge}%`}
              color={pillarSummary.pillar2_atlasWallsEdge > 0 ? '#39ff14' : '#ff0055'} />
          </div>
        </motion.div>

        {/* Pillar 3: Atlas Snap / David Vector */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-slate-900/80 backdrop-blur-md border border-purple-500/30 rounded-2xl p-5 shadow-2xl"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-purple-500/10 border border-purple-500/30">
              <Zap className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h3 className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">Pillar 3</h3>
              <p className="text-[8px] text-slate-400">David Vector — Kinetic Trigger</p>
            </div>
          </div>
          <p className="text-[9px] text-slate-400 leading-relaxed mb-4">
            Measures real-time kinetic effort via Linear Regression slope. Executes the split-second resting limits are absorbed — <span className="text-purple-300 font-bold">front-running the vacuum</span>.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <StatBox label="Gate 3 Rejections" value={`${combo1v8?.rejectedByGate3 ?? 0}`} color="#ff8800" />
            <StatBox label="3-Gate Trades" value={`${combo1v8?.gatedTrades ?? 0}`} color="#00ffea" />
            <StatBox label="3-Gate Pips" value={`${combo1v8?.gatedPips ?? 0}`}
              color={getPipsColor(combo1v8?.gatedPips ?? 0)} />
            <StatBox label="3-Gate PF" value={`${combo1v8?.gatedPF ?? 0}`}
              color={(combo1v8?.gatedPF ?? 0) > 1.5 ? '#39ff14' : '#ff8800'} />
          </div>
        </motion.div>
      </div>

      {/* ── Combined Edge Summary ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="bg-slate-900/80 backdrop-blur-md border border-yellow-500/30 rounded-2xl p-5 shadow-2xl"
      >
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-yellow-400" />
          <h3 className="text-[11px] font-bold tracking-widest text-yellow-300 uppercase">
            Combined Triple-Lock Edge — Proof of Superiority
          </h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <EdgeCard label="Random Entry (Baseline)" value={`${pillarSummary.baselineWR}%`} color="#6b7280" sub="No filters — pure noise" />
          <EdgeCard label="+ Pillar 1 (Rank #1v8)" value={`${combo1v8?.winRate ?? 0}%`} color="#00ffea"
            sub={`+${pillarSummary.pillar1_divergenceEdge}% over baseline`} />
          <EdgeCard label="+ Pillar 2 (Atlas Walls)" value={`${combo1v8?.gatedWinRate ?? 0}%`} color="#39ff14"
            sub={`+${pillarSummary.pillar2_atlasWallsEdge}% from breakout filter`} />
          <EdgeCard label="Full 3-Gate WR" value={`${pillarSummary.combinedEdge}%`} color="#ffaa00"
            sub="All three pillars combined" highlight />
          <EdgeCard label="#4v5 Chop (Control)" value={`${combo4v5?.winRate ?? 0}%`} color="#ff0055"
            sub={`${(combo4v5?.totalPips ?? 0) > 0 ? '+' : ''}${combo4v5?.totalPips ?? 0} pips — capital destruction`} />
        </div>
      </motion.div>

      {/* ── Session / Time Gate Analysis ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-5 shadow-2xl"
      >
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-[#00ffea]" />
          <h3 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">
            Time Gate Analysis — #1v8 Session Breakdown
          </h3>
          <span className="text-[8px] font-mono text-slate-500 ml-auto">
            Identifies which sessions to shut down trading
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {sessionStats.map((sess) => {
            const color = SESSION_COLORS[sess.session] || '#6b7280';
            const isProfit = sess.totalPips > 0;
            const isDeadZone = sess.winRate < 50 && sess.totalPips < 0;

            return (
              <motion.div
                key={sess.session}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative border rounded-xl p-4 overflow-hidden"
                style={{
                  borderColor: isDeadZone ? '#ff005544' : `${color}33`,
                  background: isDeadZone
                    ? 'linear-gradient(135deg, rgba(255,0,85,0.05), transparent)'
                    : `linear-gradient(135deg, ${color}08, transparent)`,
                }}
              >
                {isDeadZone && (
                  <div className="absolute top-2 right-2 text-[7px] font-bold text-[#ff0055] bg-[#ff0055]/10 border border-[#ff0055]/30 px-1.5 py-0.5 rounded uppercase tracking-wider">
                    DEAD ZONE
                  </div>
                )}
                <div className="text-[9px] font-mono mb-3" style={{ color }}>
                  {SESSION_LABELS[sess.session] || sess.session}
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[9px] font-mono">
                    <span className="text-slate-500">Trades</span>
                    <span className="text-slate-300">{sess.trades}</span>
                  </div>
                  <div className="flex justify-between text-[9px] font-mono">
                    <span className="text-slate-500">Win Rate</span>
                    <span style={{ color: sess.winRate >= 55 ? '#39ff14' : sess.winRate >= 50 ? '#00ffea' : '#ff0055' }}>
                      {sess.winRate}%
                    </span>
                  </div>
                  <div className="flex justify-between text-[9px] font-mono">
                    <span className="text-slate-500">Net Pips</span>
                    <span style={{ color: getPipsColor(sess.totalPips) }}>
                      {sess.totalPips > 0 ? '+' : ''}{sess.totalPips}
                    </span>
                  </div>
                  <div className="flex justify-between text-[9px] font-mono">
                    <span className="text-slate-500">Profit Factor</span>
                    <span style={{ color: sess.profitFactor > 1.5 ? '#39ff14' : sess.profitFactor > 1 ? '#00ffea' : '#ff0055' }}>
                      {sess.profitFactor}
                    </span>
                  </div>
                </div>
                {/* Session bar */}
                <div className="mt-3 h-1.5 bg-slate-950 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, sess.winRate)}%` }}
                    transition={{ duration: 0.8 }}
                    className="h-full rounded-full"
                    style={{ background: color }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};

// ── Reusable stat box ──
const StatBox = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className="bg-slate-950/60 border border-slate-800/50 rounded-lg p-2 text-center">
    <div className="text-[7px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
    <div className="text-xs font-bold font-mono" style={{ color }}>{value}</div>
  </div>
);

// ── Edge card for combined summary ──
const EdgeCard = ({ label, value, color, sub, highlight }: {
  label: string; value: string; color: string; sub: string; highlight?: boolean;
}) => (
  <div className={`border rounded-xl p-3 text-center ${highlight ? 'shadow-lg' : ''}`}
    style={{
      borderColor: highlight ? '#ffaa0066' : '#1e293b',
      background: highlight ? 'linear-gradient(135deg, rgba(255,170,0,0.08), transparent)' : 'rgba(2,6,23,0.5)',
      boxShadow: highlight ? '0 0 20px rgba(255,170,0,0.15)' : 'none',
    }}
  >
    <div className="text-[7px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
    <div className="text-lg font-bold font-mono mb-0.5" style={{ color }}>{value}</div>
    <div className="text-[7px] text-slate-500 font-mono">{sub}</div>
  </div>
);
