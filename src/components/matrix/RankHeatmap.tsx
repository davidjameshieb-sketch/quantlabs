// Dashboard 1: The Matrix Heatmap — "Why It Works"
// Grid showing Win Rate and Profit Factor of every rank combination

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Grid3x3, Trophy, Skull } from 'lucide-react';
import type { RankComboResult } from '@/hooks/useRankExpectancy';

interface Props {
  comboResults: RankComboResult[];
  bestCombo: RankComboResult;
}

function getHeatColor(winRate: number): string {
  // Green for high win rates, red for low
  if (winRate >= 65) return 'rgba(0, 255, 100, 0.6)';
  if (winRate >= 60) return 'rgba(0, 255, 100, 0.4)';
  if (winRate >= 55) return 'rgba(0, 255, 100, 0.2)';
  if (winRate >= 50) return 'rgba(255, 200, 0, 0.2)';
  if (winRate >= 45) return 'rgba(255, 136, 0, 0.2)';
  if (winRate >= 40) return 'rgba(255, 68, 0, 0.3)';
  return 'rgba(255, 0, 85, 0.4)';
}

function getPipsColor(pips: number): string {
  if (pips > 50) return '#39ff14';
  if (pips > 0) return '#00ffea';
  if (pips > -20) return '#ff8800';
  return '#ff0055';
}

export const RankHeatmap = ({ comboResults, bestCombo }: Props) => {
  // Build 8x8 lookup grid
  const grid = useMemo(() => {
    const map: Record<string, RankComboResult> = {};
    for (const r of comboResults) {
      map[`${r.strongRank}v${r.weakRank}`] = r;
    }
    return map;
  }, [comboResults]);

  const ranks = [1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-5 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700/40 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <Grid3x3 className="w-4 h-4 text-[#00ffea]" />
          <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">
            Rank Expectancy Matrix — Cross-Sectional Proof
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Trophy className="w-3 h-3 text-yellow-400" />
          <span className="text-[9px] font-mono text-yellow-400">
            BEST: {bestCombo.strongRank}v{bestCombo.weakRank} · {bestCombo.totalPips} pips · WR {bestCombo.winRate}%
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-[8px] font-mono text-slate-500">
        <span>← STRONG RANK (Long)</span>
        <span className="ml-auto">↓ WEAK RANK (Short) →</span>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ background: 'rgba(0, 255, 100, 0.5)' }} />
          <span>65%+ WR</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ background: 'rgba(255, 0, 85, 0.4)' }} />
          <span>&lt;40% WR</span>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="p-1 text-[8px] text-slate-600 font-mono w-12">S↓ \ W→</th>
              {ranks.map(w => (
                <th key={w} className="p-1 text-[9px] font-mono text-center" style={{
                  color: w <= 2 ? '#00ffea' : w >= 7 ? '#ff0055' : '#6b7280'
                }}>
                  R{w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ranks.map(s => (
              <tr key={s}>
                <td className="p-1 text-[9px] font-mono font-bold" style={{
                  color: s <= 2 ? '#00ffea' : s >= 7 ? '#ff0055' : '#6b7280'
                }}>
                  R{s}
                </td>
                {ranks.map(w => {
                  if (w <= s) {
                    // Diagonal or below — not applicable (S must be < W)
                    return (
                      <td key={w} className="p-1">
                        <div className="w-full h-14 bg-slate-950/50 rounded border border-slate-800/30 flex items-center justify-center">
                          <span className="text-[7px] text-slate-700">—</span>
                        </div>
                      </td>
                    );
                  }

                  const combo = grid[`${s}v${w}`];
                  if (!combo) {
                    return (
                      <td key={w} className="p-1">
                        <div className="w-full h-14 bg-slate-950/50 rounded border border-slate-800/30" />
                      </td>
                    );
                  }

                  const isBest = combo.strongRank === bestCombo.strongRank && combo.weakRank === bestCombo.weakRank;
                  const isExtreme = (s <= 2 && w >= 7);
                  const isChop = (Math.abs(s - w) <= 2);

                  return (
                    <td key={w} className="p-1">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: (s + w) * 0.02 }}
                        className="relative w-full h-14 rounded border flex flex-col items-center justify-center gap-0.5 transition-all"
                        style={{
                          background: getHeatColor(combo.winRate),
                          borderColor: isBest ? '#ffaa00' : isExtreme ? '#00ffea33' : '#1e293b',
                          boxShadow: isBest ? '0 0 12px rgba(255,170,0,0.3)' : 'none',
                        }}
                      >
                        {isBest && (
                          <Trophy className="absolute -top-1 -right-1 w-3 h-3 text-yellow-400" />
                        )}
                        <span className="text-[9px] font-bold font-mono" style={{ color: getPipsColor(combo.totalPips) }}>
                          {combo.totalPips > 0 ? '+' : ''}{combo.totalPips}p
                        </span>
                        <span className="text-[7px] font-mono text-slate-300">
                          WR {combo.winRate}%
                        </span>
                        <span className="text-[7px] font-mono text-slate-500">
                          PF {combo.profitFactor}
                        </span>
                        {isChop && combo.totalPips < 0 && (
                          <Skull className="absolute bottom-0 right-0 w-2 h-2 text-red-500/40" />
                        )}
                      </motion.div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3 mt-4">
        {[
          { label: '#1 vs #8', key: '1v8' },
          { label: '#2 vs #7', key: '2v7' },
          { label: '#3 vs #6', key: '3v6' },
          { label: '#4 vs #5 (CHOP)', key: '4v5' },
        ].map(({ label, key }) => {
          const combo = grid[key];
          if (!combo) return null;
          return (
            <div key={key} className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-3 text-center">
              <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-1">{label}</div>
              <div className="text-sm font-bold font-mono" style={{ color: getPipsColor(combo.totalPips) }}>
                {combo.totalPips > 0 ? '+' : ''}{combo.totalPips}
              </div>
              <div className="text-[8px] text-slate-400 font-mono">
                {combo.trades} trades · WR {combo.winRate}% · PF {combo.profitFactor}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
