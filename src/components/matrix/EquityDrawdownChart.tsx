// Dashboard 2: The Equity & Drawdown Tracker — The $1k Account
// Compounding equity curve + underwater drawdown chart

import { useMemo, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

interface EquityPoint { time: string; equity: number }
interface DrawdownPoint { time: string; drawdown: number }

interface Props {
  equityCurves: Record<string, EquityPoint[]>;
  drawdownCurve: DrawdownPoint[];
  dateRange: { start: string; end: string };
}

const CURVE_COLORS: Record<string, string> = {
  '1v8': '#00ffea',
  '2v7': '#39ff14',
  '3v6': '#ff8800',
  '4v5': '#ff0055',
};

const CURVE_LABELS: Record<string, string> = {
  '1v8': 'Rank #1 vs #8 (PREDATOR)',
  '2v7': 'Rank #2 vs #7',
  '3v6': 'Rank #3 vs #6',
  '4v5': 'Rank #4 vs #5 (CHOP)',
};

export const EquityDrawdownChart = ({ equityCurves, drawdownCurve, dateRange }: Props) => {
  const equityCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawdownCanvasRef = useRef<HTMLCanvasElement>(null);

  // Compute stats
  const stats = useMemo(() => {
    const curve = equityCurves['1v8'] || [];
    if (curve.length === 0) return null;
    const finalEquity = curve[curve.length - 1]?.equity ?? 1000;
    const maxEquity = Math.max(...curve.map(p => p.equity));
    const minEquity = Math.min(...curve.map(p => p.equity));
    const maxDD = Math.min(...drawdownCurve.map(p => p.drawdown));
    return { finalEquity, maxEquity, minEquity, maxDD, returnPct: ((finalEquity - 1000) / 1000) * 100 };
  }, [equityCurves, drawdownCurve]);

  // Draw equity curves
  useEffect(() => {
    const canvas = equityCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, W, H);

    // Find global min/max across all curves
    let globalMin = 1000, globalMax = 1000;
    for (const curve of Object.values(equityCurves)) {
      for (const p of curve) {
        if (p.equity < globalMin) globalMin = p.equity;
        if (p.equity > globalMax) globalMax = p.equity;
      }
    }
    const yPad = (globalMax - globalMin) * 0.1 || 50;
    const yMin = globalMin - yPad;
    const yMax = globalMax + yPad;

    // Grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * H;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();

      const val = yMax - (i / 4) * (yMax - yMin);
      ctx.fillStyle = '#475569';
      ctx.font = '9px monospace';
      ctx.fillText(`$${val.toFixed(0)}`, 4, y - 3);
    }

    // $1000 baseline
    const baselineY = H - ((1000 - yMin) / (yMax - yMin)) * H;
    ctx.strokeStyle = '#ffffff22';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, baselineY);
    ctx.lineTo(W, baselineY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw each curve
    for (const [key, curve] of Object.entries(equityCurves)) {
      if (curve.length < 2) continue;
      const color = CURVE_COLORS[key] || '#ffffff';

      ctx.strokeStyle = color;
      ctx.lineWidth = key === '1v8' ? 2.5 : 1.2;
      ctx.globalAlpha = key === '1v8' ? 1 : 0.5;
      ctx.beginPath();

      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * W;
        const y = H - ((curve[i].equity - yMin) / (yMax - yMin)) * H;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Fill area for 1v8
      if (key === '1v8') {
        ctx.globalAlpha = 0.08;
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    }

    // Date labels
    ctx.fillStyle = '#475569';
    ctx.font = '8px monospace';
    if (dateRange.start) {
      ctx.fillText(new Date(dateRange.start).toLocaleDateString(), 4, H - 4);
    }
    if (dateRange.end) {
      const endText = new Date(dateRange.end).toLocaleDateString();
      ctx.fillText(endText, W - ctx.measureText(endText).width - 4, H - 4);
    }
  }, [equityCurves, dateRange]);

  // Draw drawdown chart
  useEffect(() => {
    const canvas = drawdownCanvasRef.current;
    if (!canvas || drawdownCurve.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, W, H);

    const maxDD = Math.min(...drawdownCurve.map(p => p.drawdown));
    const yMin = maxDD - 2;

    // Zero line
    ctx.strokeStyle = '#ffffff22';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, 0);
    ctx.stroke();

    // Drawdown area
    ctx.beginPath();
    for (let i = 0; i < drawdownCurve.length; i++) {
      const x = (i / (drawdownCurve.length - 1)) * W;
      const y = (drawdownCurve[i].drawdown / yMin) * H;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(W, 0);
    ctx.lineTo(0, 0);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(255, 0, 85, 0.05)');
    grad.addColorStop(1, 'rgba(255, 0, 85, 0.4)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Drawdown line
    ctx.beginPath();
    for (let i = 0; i < drawdownCurve.length; i++) {
      const x = (i / (drawdownCurve.length - 1)) * W;
      const y = (drawdownCurve[i].drawdown / yMin) * H;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Max DD label
    ctx.fillStyle = '#ff0055';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(`Max DD: ${maxDD.toFixed(1)}%`, 4, H - 6);
  }, [drawdownCurve]);

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl p-5 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700/40 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-[#39ff14]" />
          <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase">
            $1,000 Equity Tracker — Rank Combination Comparison
          </h2>
        </div>
        {stats && (
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-mono" style={{ color: stats.returnPct >= 0 ? '#39ff14' : '#ff0055' }}>
              {stats.returnPct >= 0 ? <TrendingUp className="inline w-3 h-3 mr-1" /> : <TrendingDown className="inline w-3 h-3 mr-1" />}
              {stats.returnPct >= 0 ? '+' : ''}{stats.returnPct.toFixed(1)}%
            </span>
            <span className="text-[9px] font-mono text-slate-400">
              Final: ${stats.finalEquity.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 flex-wrap">
        {Object.entries(CURVE_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded" style={{ background: CURVE_COLORS[key] }} />
            <span className="text-[8px] font-mono" style={{ color: CURVE_COLORS[key] }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Equity Chart */}
      <div className="mb-3">
        <canvas
          ref={equityCanvasRef}
          className="w-full rounded-lg border border-slate-800/50"
          style={{ height: 280 }}
        />
      </div>

      {/* Drawdown Chart */}
      <div>
        <div className="text-[8px] text-slate-500 uppercase tracking-widest mb-1 font-mono">
          Underwater Equity — Drawdown %
        </div>
        <canvas
          ref={drawdownCanvasRef}
          className="w-full rounded-lg border border-slate-800/50"
          style={{ height: 100 }}
        />
      </div>

      {/* Key Stats Row */}
      {stats && (
        <div className="grid grid-cols-5 gap-3 mt-4">
          {[
            { label: 'Final Equity', value: `$${stats.finalEquity.toFixed(2)}`, color: stats.finalEquity >= 1000 ? '#39ff14' : '#ff0055' },
            { label: 'Peak Equity', value: `$${stats.maxEquity.toFixed(2)}`, color: '#00ffea' },
            { label: 'Return %', value: `${stats.returnPct >= 0 ? '+' : ''}${stats.returnPct.toFixed(1)}%`, color: stats.returnPct >= 0 ? '#39ff14' : '#ff0055' },
            { label: 'Max Drawdown', value: `${stats.maxDD.toFixed(1)}%`, color: '#ff0055' },
            { label: 'Trough Equity', value: `$${stats.minEquity.toFixed(2)}`, color: '#ff8800' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-slate-950/50 border border-slate-800/50 rounded-lg p-2 text-center">
              <div className="text-[7px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
              <div className="text-xs font-bold font-mono" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
