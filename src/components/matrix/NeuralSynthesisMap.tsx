// Recursive Self-Synthesis Neural Map — AI brain visualization
import { useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Brain, Activity, TrendingUp } from 'lucide-react';
import type { MatrixResult } from '@/hooks/useSovereignMatrix';

interface Props {
  result: MatrixResult;
}

interface NeuralNode {
  id: string;
  label: string;
  x: number;
  y: number;
  layer: number; // 0=input, 1=hidden, 2=output
  activation: number; // 0-1
  color: string;
}

interface NeuralEdge {
  from: string;
  to: string;
  weight: number; // -1 to 1
}

export const NeuralSynthesisMap = ({ result }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const frameRef = useRef(0);

  const { currencyScores, currencyRanks, signals, strikes, predator, prey } = result;

  // Derive AI "regime" from data
  const regime = useMemo(() => {
    const scores = Object.values(currencyScores);
    const spread = Math.max(...scores) - Math.min(...scores);
    const avgAbs = scores.reduce((a, b) => a + Math.abs(b), 0) / scores.length;
    // Simple Hurst-like proxy: high spread = trending, low = mean-reversion
    const hurstProxy = Math.min(1, spread / (avgAbs + 0.0001));
    const isTrending = hurstProxy > 0.5;
    const gateActivity = signals.reduce((acc, s) => acc + [s.gate1, s.gate2, s.gate3].filter(Boolean).length, 0);
    const maxGates = signals.length * 3;
    const confidence = maxGates > 0 ? gateActivity / maxGates : 0;
    return { hurstProxy, isTrending, confidence, spread, gateActivity };
  }, [currencyScores, signals]);

  // Build neural network nodes
  const { nodes, edges } = useMemo(() => {
    const n: NeuralNode[] = [];
    const e: NeuralEdge[] = [];

    // Input layer: 8 currency inputs
    const inputCurrencies = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY'];
    inputCurrencies.forEach((cur, i) => {
      const rank = currencyRanks[cur] ?? 4;
      const score = currencyScores[cur] ?? 0;
      const activation = Math.min(1, Math.abs(score) / 0.01 + 0.1);
      const color = rank <= 2 ? '#00ffea' : rank >= 7 ? '#ff0055' : '#8888cc';
      n.push({ id: `in_${cur}`, label: cur, x: 0, y: 0, layer: 0, activation, color });
    });

    // Hidden layer: processing nodes
    const hiddenNodes = [
      { id: 'h_regime', label: 'REGIME', activation: regime.hurstProxy },
      { id: 'h_momentum', label: 'MOMENTUM', activation: Math.min(1, regime.spread * 10) },
      { id: 'h_g1', label: 'G1·TERRAIN', activation: signals.filter(s => s.gate1).length / Math.max(1, signals.length) },
      { id: 'h_g2', label: 'G2·SNAP', activation: signals.filter(s => s.gate2).length / Math.max(1, signals.length) },
      { id: 'h_g3', label: 'G3·VECTOR', activation: signals.filter(s => s.gate3).length / Math.max(1, signals.length) },
      { id: 'h_flow', label: 'FLOW·ΔV', activation: regime.confidence },
    ];
    hiddenNodes.forEach(hn => {
      const color = hn.activation > 0.6 ? '#00ffea' : hn.activation > 0.3 ? '#ffaa00' : '#ff0055';
      n.push({ ...hn, x: 0, y: 0, layer: 1, color });
    });

    // Output layer
    const outputNodes = [
      { id: 'o_strike', label: 'STRIKE', activation: strikes.length > 0 ? 1 : 0, color: strikes.length > 0 ? '#00ffea' : '#333333' },
      { id: 'o_conf', label: 'CONFIDENCE', activation: regime.confidence, color: regime.confidence > 0.5 ? '#39ff14' : '#ff8800' },
      { id: 'o_mode', label: regime.isTrending ? 'BREAKOUT' : 'CONSOLIDATION', activation: regime.hurstProxy, color: regime.isTrending ? '#00ffea' : '#ff8800' },
    ];
    outputNodes.forEach(on => n.push({ ...on, x: 0, y: 0, layer: 2 }));

    // Edges: input → hidden
    inputCurrencies.forEach(cur => {
      hiddenNodes.forEach(hn => {
        const score = currencyScores[cur] ?? 0;
        e.push({ from: `in_${cur}`, to: hn.id, weight: Math.max(-1, Math.min(1, score * 50)) });
      });
    });
    // Hidden → output
    hiddenNodes.forEach(hn => {
      outputNodes.forEach(on => {
        e.push({ from: hn.id, to: on.id, weight: hn.activation * (Math.random() > 0.5 ? 1 : 0.5) });
      });
    });

    return { nodes: n, edges: e };
  }, [currencyScores, currencyRanks, signals, strikes, regime]);

  useEffect(() => {
    const canvas = canvasRef.current;
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

    // Layout nodes
    const layers = [
      nodes.filter(n => n.layer === 0),
      nodes.filter(n => n.layer === 1),
      nodes.filter(n => n.layer === 2),
    ];
    const layerX = [W * 0.12, W * 0.5, W * 0.88];

    layers.forEach((layer, li) => {
      const spacing = H / (layer.length + 1);
      layer.forEach((node, ni) => {
        node.x = layerX[li];
        node.y = spacing * (ni + 1);
      });
    });

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    const draw = () => {
      frameRef.current++;
      const t = frameRef.current;
      ctx.clearRect(0, 0, W, H);

      // Background
      ctx.fillStyle = 'rgba(5,8,18,0.95)';
      ctx.fillRect(0, 0, W, H);

      // Subtle grid
      ctx.strokeStyle = 'rgba(100,120,150,0.04)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x < W; x += 30) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 30) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Draw edges
      edges.forEach(edge => {
        const from = nodeMap.get(edge.from);
        const to = nodeMap.get(edge.to);
        if (!from || !to) return;

        const absWeight = Math.abs(edge.weight);
        const alpha = 0.03 + absWeight * 0.15;

        // Data pulse animation along the edge
        const pulsePos = ((t * 0.01 + edge.weight * 5) % 1 + 1) % 1;
        const px = from.x + (to.x - from.x) * pulsePos;
        const py = from.y + (to.y - from.y) * pulsePos;

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = edge.weight > 0 ? `rgba(0,255,234,${alpha})` : `rgba(255,0,85,${alpha})`;
        ctx.lineWidth = 0.5 + absWeight * 1.5;
        ctx.stroke();

        // Pulse dot
        if (absWeight > 0.2) {
          ctx.beginPath();
          ctx.arc(px, py, 1.5 + absWeight * 2, 0, Math.PI * 2);
          ctx.fillStyle = edge.weight > 0 ? `rgba(0,255,234,${0.3 + absWeight * 0.5})` : `rgba(255,0,85,${0.3 + absWeight * 0.5})`;
          ctx.fill();
        }
      });

      // Draw nodes
      nodes.forEach(node => {
        const pulse = 1 + Math.sin(t * 0.04 + node.activation * 10) * 0.15 * node.activation;
        const r = (node.layer === 1 ? 14 : node.layer === 2 ? 16 : 10) * pulse;

        // Glow
        ctx.save();
        if (node.activation > 0.5) {
          ctx.shadowColor = node.color;
          ctx.shadowBlur = 15 + node.activation * 15;
        }

        // Circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, r);
        grad.addColorStop(0, node.color + '60');
        grad.addColorStop(0.6, node.color + '20');
        grad.addColorStop(1, node.color + '08');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = node.color + (node.activation > 0.5 ? 'cc' : '44');
        ctx.lineWidth = node.activation > 0.5 ? 1.5 : 0.5;
        ctx.stroke();
        ctx.restore();

        // Label
        ctx.font = `bold ${node.layer === 0 ? 8 : 7}px 'Orbitron', monospace`;
        ctx.fillStyle = node.color + 'cc';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + r + 12);

        // Activation %
        ctx.font = '6px monospace';
        ctx.fillStyle = '#ffffff50';
        ctx.fillText(`${(node.activation * 100).toFixed(0)}%`, node.x, node.y + 3);
      });

      // Layer labels
      ctx.font = 'bold 8px monospace';
      ctx.fillStyle = '#ffffff20';
      ctx.textAlign = 'center';
      ctx.fillText('INPUT', layerX[0], 16);
      ctx.fillText('SYNTHESIS', layerX[1], 16);
      ctx.fillText('OUTPUT', layerX[2], 16);

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [nodes, edges]);

  return (
    <div className="bg-slate-950/90 backdrop-blur-md border border-slate-700/50 rounded-2xl p-4 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700/40 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-400" />
          <h2 className="text-[11px] font-bold tracking-widest text-slate-200 uppercase font-display">
            Recursive Self-Synthesis
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[8px] font-mono px-2 py-0.5 rounded border ${regime.isTrending ? 'border-[#00ffea]/40 text-[#00ffea] bg-[#00ffea]/10' : 'border-[#ff8800]/40 text-[#ff8800] bg-[#ff8800]/10'}`}>
            {regime.isTrending ? '⚡ BREAKOUT MODE' : '◎ CONSOLIDATION'}
          </span>
          <span className="text-[8px] font-mono text-slate-600 border border-slate-800 px-1.5 py-0.5 rounded">NEURAL MAP</span>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative w-full" style={{ height: 380 }}>
        <canvas ref={canvasRef} className="w-full h-full rounded-xl" />
      </div>

      {/* Confidence gauge bar */}
      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between text-[8px] font-mono text-slate-500">
          <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> AI CONFIDENCE</span>
          <span className="text-white font-bold">{(regime.confidence * 100).toFixed(1)}%</span>
        </div>
        <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${regime.confidence * 100}%` }}
            transition={{ duration: 1 }}
            className="h-full rounded-full"
            style={{
              background: `linear-gradient(90deg, ${regime.confidence > 0.6 ? '#00ffea' : regime.confidence > 0.3 ? '#ffaa00' : '#ff0055'}, ${regime.confidence > 0.6 ? '#39ff14' : '#ff880080'})`,
              boxShadow: regime.confidence > 0.6 ? '0 0 10px rgba(0,255,234,0.5)' : undefined,
            }}
          />
        </div>
        <div className="flex items-center justify-between text-[7px] font-mono text-slate-600">
          <span>Hurst Proxy: {regime.hurstProxy.toFixed(3)}</span>
          <span>Δ Spread: {regime.spread.toFixed(5)}</span>
          <span>Gate Activity: {regime.gateActivity}/{signals.length * 3}</span>
        </div>
      </div>
    </div>
  );
};
