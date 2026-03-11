import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  RefreshCw, Loader2, AlertTriangle, Timer, TrendingUp, ArrowUpDown,
  ChevronDown, ChevronRight, BarChart3
} from "lucide-react";
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries } from "lightweight-charts";

// ─── Types ──────────────────────────────────────────────────────

interface BoardMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  category: string;
  icon: string;
  url: string;
  yes_bid: number;
  yes_ask: number;
  midpoint: number;
  spread: number;
  last_price: number;
  vol24h: number;
  oi: number;
  hours_left: number | null;
  close_time: string | null;
  vol_oi_ratio: number;
  has_orderbook: boolean;
}

interface CategorySummary {
  category: string; icon: string; count: number; volume: number; oi: number;
}

interface FeedData {
  hot_markets: BoardMarket[];
  wide_spreads: BoardMarket[];
  vol_spikes: BoardMarket[];
  categories: CategorySummary[];
  stats: {
    totalFetched: number; totalBoard: number; hotCount: number;
    wideSpreadCount: number; volSpikeCount: number; categoryCount: number;
  };
  next_catalyst: { close_time: string; category: string; hours_left: number } | null;
  timestamp: string;
}

interface Candle {
  time: string;
  open: number; high: number; low: number; close: number;
  volume: number; oi: number;
}

// ─── 10-Minute Tape ─────────────────────────────────────────────

interface TapeSnapshot { midpoint: number; vol24h: number; ts: number; }
interface TapeMetrics { priceDelta: number | null; volSpike: number | null; isWhale: boolean; }

const TAPE_WINDOW_MS = 10 * 60 * 1000;

function computeTape(
  ticker: string, currentMid: number, currentVol: number,
  history: Map<string, TapeSnapshot[]>
): TapeMetrics {
  const h = history.get(ticker);
  if (!h || h.length < 2) return { priceDelta: null, volSpike: null, isWhale: false };
  const cutoff = Date.now() - TAPE_WINDOW_MS;
  const old = h.filter(s => s.ts <= cutoff + 15000);
  const oldest = old.length > 0 ? old[old.length - 1] : h[0];
  const priceDelta = currentMid - oldest.midpoint;
  const volSpike = currentVol - oldest.vol24h;
  const vs = volSpike > 0 ? volSpike : 0;
  return { priceDelta, volSpike: vs, isWhale: Math.abs(priceDelta) >= 3 && vs >= 500 };
}

// ─── Value Score Engine ─────────────────────────────────────────

type ValueRating = "BARGAIN" | "FAIR" | "OVERHEATED";

interface ValueScore {
  rating: ValueRating;
  label: string;
  emoji: string;
  reasons: string[];
  riskReward: string; // e.g. "3.3:1"
  spreadEfficiency: number; // spread as % of price
  smartMoney: boolean;
}

function computeValueScore(m: BoardMarket, tape: TapeMetrics | null): ValueScore {
  const reasons: string[] = [];
  let score = 0; // negative = bargain, positive = overheated

  // 1. Price zone (risk/reward)
  const price = m.midpoint;
  const payout = 100 - price;
  const rrRatio = price > 0 ? +(payout / price).toFixed(1) : 0;
  const riskReward = `${rrRatio}:1`;

  if (price <= 15) { score -= 3; reasons.push(`Penny zone (${rrRatio}:1 R:R)`); }
  else if (price <= 30) { score -= 2; reasons.push(`Value zone (${rrRatio}:1 R:R)`); }
  else if (price >= 80) { score += 3; reasons.push(`Ceiling — paying ${price}¢ to win ${payout}¢`); }
  else if (price >= 65) { score += 2; reasons.push(`Expensive — ${rrRatio}:1 risk/reward`); }

  // 2. Spread efficiency (spread as % of midpoint)
  const spreadEff = price > 0 ? +((m.spread / price) * 100).toFixed(1) : 0;
  if (spreadEff > 20) { score -= 1; reasons.push(`Wide spread (${spreadEff}%) — inefficient pricing`); }
  else if (spreadEff < 5 && m.vol24h > 100) { score += 1; reasons.push("Tight spread — fully discovered"); }

  // 3. Smart Money detection: OI rising but price flat/falling
  const oiAccumulation = m.oi >= 50 && m.vol_oi_ratio < 0.5;
  const priceFalling = tape?.priceDelta !== null && tape?.priceDelta !== undefined && tape.priceDelta <= 0;
  const smartMoney = oiAccumulation && (priceFalling || price <= 30);
  if (smartMoney) { score -= 2; reasons.push("🧠 Smart money accumulating"); }

  // 4. Momentum
  if (tape?.priceDelta !== null && tape?.priceDelta !== undefined) {
    if (tape.priceDelta >= 5) { score += 2; reasons.push(`Surging +${tape.priceDelta}¢ in 10m`); }
    else if (tape.priceDelta >= 2) { score += 1; reasons.push(`Rising +${tape.priceDelta}¢`); }
    else if (tape.priceDelta <= -3) { score -= 1; reasons.push(`Dropping ${tape.priceDelta}¢ — dip buy?`); }
  }

  // 5. Volume spike (churn = late)
  if (m.vol_oi_ratio > 3) { score += 2; reasons.push("Extreme churn — likely priced in"); }
  else if (m.vol_oi_ratio > 1.5 && price > 50) { score += 1; reasons.push("High turnover at high price"); }

  // 6. Time decay
  if (m.hours_left !== null && m.hours_left < 6 && price > 40) {
    score += 1; reasons.push("Settling soon at high price — limited upside");
  }

  // Classify
  let rating: ValueRating;
  let label: string;
  let emoji: string;
  if (score <= -2) { rating = "BARGAIN"; label = "Bargain"; emoji = "🟢"; }
  else if (score >= 3) { rating = "OVERHEATED"; label = "Overheated"; emoji = "🔴"; }
  else { rating = "FAIR"; label = "Fair"; emoji = "🟡"; }

  return { rating, label, emoji, reasons, riskReward, spreadEfficiency: spreadEff, smartMoney };
}

function getPriceColor(midpoint: number): string {
  if (midpoint <= 15) return "text-emerald-400 font-bold";
  if (midpoint <= 30) return "text-emerald-300";
  if (midpoint >= 80) return "text-red-400 font-bold";
  if (midpoint >= 65) return "text-orange-400";
  return "text-[hsl(var(--nexus-text-primary))] font-bold";
}

function getMomentumArrow(tape: TapeMetrics | null): { arrow: string; color: string } {
  if (!tape || tape.priceDelta === null) return { arrow: "", color: "" };
  if (tape.priceDelta >= 5) return { arrow: "⬆️", color: "text-emerald-400" };
  if (tape.priceDelta >= 2) return { arrow: "↗", color: "text-emerald-400" };
  if (tape.priceDelta > 0) return { arrow: "↗", color: "text-emerald-400/60" };
  if (tape.priceDelta <= -5) return { arrow: "⬇️", color: "text-red-400" };
  if (tape.priceDelta <= -2) return { arrow: "↘", color: "text-red-400" };
  if (tape.priceDelta < 0) return { arrow: "↘", color: "text-red-400/60" };
  return { arrow: "→", color: "text-[hsl(var(--nexus-text-muted))]" };
}

// ─── Helpers ────────────────────────────────────────────────────

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
  });
}

function fmtHours(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.floor(h / 24)}d ${Math.round(h % 24)}h`;
}

function useCountdown(targetTime: string | null): string {
  const [display, setDisplay] = useState("—");
  useEffect(() => {
    if (!targetTime) { setDisplay("—"); return; }
    const tick = () => {
      const diff = new Date(targetTime).getTime() - Date.now();
      if (diff <= 0) { setDisplay("LIVE NOW"); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setDisplay(d > 0 ? `${d}d ${h}h ${m}m ${s}s` : h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [targetTime]);
  return display;
}

// ─── Chart Component ────────────────────────────────────────────

function MarketChart({ ticker, title }: { ticker: string; title: string }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState(60); // 1=1min, 60=1hr, 1440=1day
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);

  // Fetch candle data
  useEffect(() => {
    let cancelled = false;
    async function fetchCandles() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase.functions.invoke("kalshi-chart", {
          body: { ticker, period },
        });
        if (cancelled) return;
        if (err) throw err;
        if (data?.error && data.candles?.length === 0) {
          setError(data.error);
          setCandles([]);
        } else {
          setCandles(data?.candles || []);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load chart");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchCandles();
    return () => { cancelled = true; };
  }, [ticker, period]);

  // Render chart
  useEffect(() => {
    if (!chartContainerRef.current || candles.length === 0) return;

    // Clean up previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9ca3af",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      width: container.clientWidth,
      height: 280,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "rgba(255,255,255,0.1)",
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.1)",
      },
      crosshair: {
        mode: 0,
      },
    });

    chartRef.current = chart;

    // Format candle data — filter out entries with null OHLC
    const formattedCandles = candles
      .filter(c => c.open != null && c.high != null && c.low != null && c.close != null)
      .map(c => ({
        time: Math.floor(new Date(c.time).getTime() / 1000) as any,
        open: c.open as number,
        high: c.high as number,
        low: c.low as number,
        close: c.close as number,
      }));

    // Dedupe and sort by time
    const seen = new Set<number>();
    const deduped = formattedCandles.filter(c => {
      if (seen.has(c.time)) return false;
      seen.add(c.time);
      return true;
    }).sort((a, b) => a.time - b.time);

    // If no valid OHLC data, try OI-based line chart as fallback
    if (deduped.length === 0) {
      const oiData = candles
        .filter(c => c.oi != null && c.oi > 0)
        .map(c => ({
          time: Math.floor(new Date(c.time).getTime() / 1000) as any,
          value: c.oi as number,
        }));
      const seenOi = new Set<number>();
      const dedupedOi = oiData.filter(v => {
        if (seenOi.has(v.time)) return false;
        seenOi.add(v.time);
        return true;
      }).sort((a, b) => a.time - b.time);

      if (dedupedOi.length > 1) {
        const lineSeries = chart.addSeries(LineSeries, {
          color: "#6366f1",
          lineWidth: 2,
          title: "Open Interest",
        });
        lineSeries.setData(dedupedOi);
      }
    }

    if (deduped.length > 0) {
      const hasOHLC = deduped.some(c => c.high !== c.low);

      if (hasOHLC) {
        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: "#10b981",
          downColor: "#ef4444",
          borderUpColor: "#10b981",
          borderDownColor: "#ef4444",
          wickUpColor: "#10b981",
          wickDownColor: "#ef4444",
        });
        candleSeries.setData(deduped);
      } else {
        const lineSeries = chart.addSeries(LineSeries, {
          color: "#10b981",
          lineWidth: 2,
        });
        lineSeries.setData(deduped.map(c => ({ time: c.time, value: c.close })));
      }
    }

    // Volume histogram — always show if available
    const volumeData = candles
      .filter(c => c.volume != null && c.volume > 0)
      .map(c => ({
        time: Math.floor(new Date(c.time).getTime() / 1000) as any,
        value: c.volume as number,
        color: (c.close ?? 0) >= (c.open ?? 0) ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)",
      }));

    const seenVol = new Set<number>();
    const dedupedVol = volumeData.filter(v => {
      if (seenVol.has(v.time)) return false;
      seenVol.add(v.time);
      return true;
    }).sort((a, b) => a.time - b.time);

    if (dedupedVol.length > 0) {
      const volSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
      });
      volSeries.setData(dedupedVol);
      chart.priceScale("vol").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
    }

    chart.timeScale().fitContent();

    // Resize handler
    const handleResize = () => {
      if (container && chart) chart.applyOptions({ width: container.clientWidth });
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles]);

  return (
    <div className="bg-[hsl(var(--nexus-bg))] border border-[hsl(var(--nexus-border))] rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] font-bold text-[hsl(var(--nexus-text-primary))] truncate max-w-[400px]">{title}</span>
          <span className="text-[9px] text-[hsl(var(--nexus-text-muted))] font-mono">{ticker}</span>
        </div>
        <div className="flex items-center gap-1">
          {([
            { val: 1, label: "1m" },
            { val: 60, label: "1H" },
            { val: 1440, label: "1D" },
          ] as const).map(p => (
            <button
              key={p.val}
              onClick={() => setPeriod(p.val)}
              className={`px-2 py-0.5 rounded text-[9px] font-mono transition-colors ${
                period === p.val
                  ? "bg-emerald-600/30 text-emerald-400"
                  : "text-[hsl(var(--nexus-text-muted))] hover:text-[hsl(var(--nexus-text-primary))]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="h-[280px] flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
          <span className="ml-2 text-[10px] text-[hsl(var(--nexus-text-muted))]">Loading chart data…</span>
        </div>
      )}

      {error && !loading && (
        <div className="h-[280px] flex items-center justify-center">
          <span className="text-[10px] text-[hsl(var(--nexus-text-muted))]">{error}</span>
        </div>
      )}

      {!loading && !error && candles.length === 0 && (
        <div className="h-[280px] flex items-center justify-center">
          <span className="text-[10px] text-[hsl(var(--nexus-text-muted))]">No chart data available for this market yet.</span>
        </div>
      )}

      {!loading && candles.length > 0 && (
        <>
          <div ref={chartContainerRef} className="w-full" />
          <div className="flex items-center justify-between text-[9px] text-[hsl(var(--nexus-text-muted))]">
            <span>{candles.length} candles</span>
            <span>
              O: {(candles[candles.length - 1]?.open * 100).toFixed(0)}¢ 
              H: {(candles[candles.length - 1]?.high * 100).toFixed(0)}¢ 
              L: {(candles[candles.length - 1]?.low * 100).toFixed(0)}¢ 
              C: {(candles[candles.length - 1]?.close * 100).toFixed(0)}¢
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

type TabKey = "hot" | "spreads" | "spikes";
type SortKey = "volume" | "spread" | "oi" | "hours" | "vol_oi";

export default function UniversalAlpha() {
  const [data, setData] = useState<FeedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeTab, setActiveTab] = useState<TabKey>("hot");
  const [sortBy, setSortBy] = useState<SortKey>("oi");
  const [pollCount, setPollCount] = useState(0);
  const [allExpanded, setAllExpanded] = useState(true);
  const [collapsedTickers, setCollapsedTickers] = useState<Set<string>>(new Set());

  const tapeRef = useRef<Map<string, TapeSnapshot[]>>(new Map());
  const [tapeMetrics, setTapeMetrics] = useState<Map<string, TapeMetrics>>(new Map());

  const countdown = useCountdown(data?.next_catalyst?.close_time || null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: err } = await supabase.functions.invoke("universal-alpha-scanner", {
        body: { category: activeCategory, sort: sortBy },
      });
      if (err) throw err;
      if (res?.error) throw new Error(res.error);
      setData(res);
      setLastRefresh(new Date().toLocaleTimeString());

      const now = Date.now();
      const tape = tapeRef.current;
      const newMetrics = new Map<string, TapeMetrics>();
      const allMarkets = [...(res?.hot_markets || []), ...(res?.wide_spreads || []), ...(res?.vol_spikes || [])];
      const seen = new Set<string>();
      for (const m of allMarkets) {
        if (!m.ticker || seen.has(m.ticker)) continue;
        seen.add(m.ticker);
        const snapshot: TapeSnapshot = { midpoint: m.midpoint, vol24h: m.vol24h, ts: now };
        const history = tape.get(m.ticker) || [];
        history.push(snapshot);
        const cutoff = now - 12 * 60 * 1000;
        tape.set(m.ticker, history.filter((s: TapeSnapshot) => s.ts >= cutoff));
        newMetrics.set(m.ticker, computeTape(m.ticker, m.midpoint, m.vol24h, tape));
      }
      setTapeMetrics(newMetrics);
      setPollCount(c => c + 1);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [activeCategory, sortBy]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const iv = setInterval(fetchData, 60000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const stats = data?.stats;
  const nc = data?.next_catalyst;
  const whaleCount = Array.from(tapeMetrics.values()).filter(m => m.isWhale).length;
  const getTape = (ticker?: string): TapeMetrics | null => ticker ? tapeMetrics.get(ticker) || null : null;

  const activeMarkets: BoardMarket[] = activeTab === "hot" ? (data?.hot_markets || [])
    : activeTab === "spreads" ? (data?.wide_spreads || [])
    : (data?.vol_spikes || []);

  const cellClass = "p-1.5 text-left whitespace-nowrap text-[10px]";
  const headerClass = "p-1.5 text-left font-bold text-[hsl(var(--nexus-text-muted))] uppercase tracking-wider text-[9px] select-none";

  const toggleChart = (ticker: string) => {
    setCollapsedTickers(prev => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  const isTickerExpanded = (ticker: string) => allExpanded ? !collapsedTickers.has(ticker) : collapsedTickers.has(ticker);

  return (
    <div className="min-h-screen bg-[hsl(var(--nexus-bg))] text-[hsl(var(--nexus-text-primary))] font-mono text-xs">
      {/* ─── HEADER ─── */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[hsl(var(--nexus-bg))]/90 border-b border-[hsl(var(--nexus-border))] px-4 py-3">
        <div className="max-w-[1920px] mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-base font-bold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Kalshi Full Board
            </h1>
            <p className="text-[10px] text-[hsl(var(--nexus-text-muted))]">
              {stats?.totalBoard || 0} active markets • {stats?.hotCount || 0} with volume
              {whaleCount > 0 && <span className="text-red-400 font-bold ml-2">🐋 {whaleCount} WHALE{whaleCount > 1 ? "S" : ""}</span>}
              <span className="ml-2">• Poll #{pollCount} • {lastRefresh || "—"}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => { setAllExpanded(p => !p); setCollapsedTickers(new Set()); }}
              className="border-[hsl(var(--nexus-border))] text-[hsl(var(--nexus-text-muted))] font-mono h-7 text-[10px]" variant="outline">
              {allExpanded ? "Collapse All" : "Expand All"}
            </Button>
            <Button size="sm" onClick={fetchData} disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono h-7 text-[10px]">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              <span className="ml-1">Scan</span>
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <Alert className="m-4 max-w-[1920px] mx-auto bg-red-500/10 border-red-500/40">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertTitle className="text-red-400 font-mono text-xs">Error</AlertTitle>
          <AlertDescription className="text-red-300 font-mono text-[10px]">{error}</AlertDescription>
        </Alert>
      )}

      <div className="max-w-[1920px] mx-auto p-4 space-y-4">
        {/* ─── COUNTDOWN ─── */}
        {nc && (
          <div className="border border-[hsl(var(--nexus-border))] p-2 rounded flex items-center gap-4">
            <Timer className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
            <span className="text-[10px] text-amber-300/70 uppercase">Next Settlement</span>
            <span className="text-sm font-bold text-amber-400 tabular-nums">{countdown}</span>
            <span className="text-[10px] text-[hsl(var(--nexus-text-muted))]">{nc.category} — {fmtTime(nc.close_time)}</span>
          </div>
        )}

        {/* ─── TAPE STATUS ─── */}
        {pollCount > 0 && (
          <div className="flex items-center gap-4 text-[10px] text-[hsl(var(--nexus-text-muted))] border border-[hsl(var(--nexus-border))]/50 p-2 rounded">
            <span className="text-emerald-400 font-bold">📼 10-MIN TAPE</span>
            <span>{pollCount} snapshots • {tapeRef.current.size} tickers</span>
            {pollCount < 10 && <span className="text-amber-400">Warming ({Math.min(10, pollCount)} of 10 polls)</span>}
          </div>
        )}

        {/* ─── CATEGORY PILLS ─── */}
        {data?.categories && (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={activeCategory === "All" ? "default" : "outline"}
              onClick={() => setActiveCategory("All")}
              className={`text-[10px] h-6 font-mono px-2 ${activeCategory === "All" ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border-[hsl(var(--nexus-border))] text-[hsl(var(--nexus-text-muted))]"}`}>
              All ({stats?.totalBoard || 0})
            </Button>
            {data.categories.map(cat => (
              <Button key={cat.category} size="sm" variant={activeCategory === cat.category ? "default" : "outline"}
                onClick={() => setActiveCategory(cat.category)}
                className={`text-[10px] h-6 font-mono px-2 ${activeCategory === cat.category ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border-[hsl(var(--nexus-border))] text-[hsl(var(--nexus-text-muted))]"}`}>
                {cat.icon} {cat.category} ({cat.count})
              </Button>
            ))}
          </div>
        )}

        {/* ─── VIEW TABS ─── */}
        <div className="flex gap-1 border-b border-[hsl(var(--nexus-border))] pb-2">
          {([
            { key: "hot" as TabKey, label: "🔥 Hot Markets", count: stats?.hotCount },
            { key: "spreads" as TabKey, label: "📏 Wide Spreads", count: stats?.wideSpreadCount },
            { key: "spikes" as TabKey, label: "⚡ Volume Spikes", count: stats?.volSpikeCount },
          ]).map(tab => (
            <Button key={tab.key} size="sm" variant={activeTab === tab.key ? "default" : "ghost"}
              onClick={() => setActiveTab(tab.key)}
              className={`text-[10px] h-7 font-mono ${activeTab === tab.key ? "bg-[hsl(var(--nexus-surface))] text-[hsl(var(--nexus-text-primary))]" : "text-[hsl(var(--nexus-text-muted))]"}`}>
              {tab.label} ({tab.count || 0})
            </Button>
          ))}
        </div>

        {/* ─── SORT ROW ─── */}
        <div className="flex items-center gap-2 text-[10px] text-[hsl(var(--nexus-text-muted))]">
          <ArrowUpDown className="w-3 h-3" />
          <span>Sort:</span>
          {([
            { key: "volume" as SortKey, label: "Volume" },
            { key: "spread" as SortKey, label: "Spread" },
            { key: "oi" as SortKey, label: "OI" },
            { key: "vol_oi" as SortKey, label: "Turnover" },
            { key: "hours" as SortKey, label: "Soonest" },
          ]).map(s => (
            <button key={s.key} onClick={() => setSortBy(s.key)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${sortBy === s.key ? "bg-emerald-600/30 text-emerald-400" : "hover:text-[hsl(var(--nexus-text-primary))]"}`}>
              {s.label}
            </button>
          ))}
        </div>

        {/* ─── MAIN TABLE ─── */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[hsl(var(--nexus-border))]">
                <th className={headerClass} style={{ width: 24 }}></th>
                <th className={headerClass}>#</th>
                <th className={headerClass}>Cat</th>
                <th className={headerClass} style={{ minWidth: 280 }}>Market</th>
                <th className={headerClass}>Bid</th>
                <th className={headerClass}>Ask</th>
                <th className={headerClass}>Mid</th>
                <th className={headerClass}>Spread</th>
                <th className={headerClass}>10m Δ</th>
                <th className={headerClass}>10m Vol</th>
                <th className={headerClass}>Vol 24h</th>
                <th className={headerClass}>OI</th>
                <th className={headerClass}>Vol/OI</th>
                <th className={headerClass}>Settles</th>
              </tr>
            </thead>
            <tbody>
              {activeMarkets.map((m, i) => {
                const tape = getTape(m.ticker);
                const isWhale = tape?.isWhale || false;
                const priceDelta = tape?.priceDelta ?? null;
                const volSpike = tape?.volSpike ?? null;
                const isExpanded = isTickerExpanded(m.ticker);
                return (
                  <>
                    <tr
                      key={m.ticker}
                      onClick={() => toggleChart(m.ticker)}
                      className={`border-b border-[hsl(var(--nexus-border))]/20 hover:bg-[hsl(var(--nexus-surface))] cursor-pointer transition-colors ${isWhale ? "bg-red-500/10 border-l-2 border-l-red-500" : ""} ${isExpanded ? "bg-[hsl(var(--nexus-surface))]" : ""}`}
                    >
                      <td className={cellClass}>
                        {isExpanded
                          ? <ChevronDown className="w-3 h-3 text-emerald-400" />
                          : <ChevronRight className="w-3 h-3 text-[hsl(var(--nexus-text-muted))]" />}
                      </td>
                      <td className={`${cellClass} text-[hsl(var(--nexus-text-muted))]`}>{i + 1}</td>
                      <td className={cellClass} title={m.category}>
                        {m.icon}
                        {isWhale && <Badge className="ml-1 bg-red-600 text-white text-[8px] px-1 py-0 leading-none">🐋</Badge>}
                      </td>
                      <td className={`${cellClass} max-w-[300px]`}>
                        <a href={m.url} target="_blank" rel="noopener noreferrer"
                          className="text-cyan-400 hover:underline truncate block"
                          title={m.title}
                          onClick={(e) => e.stopPropagation()}>
                          {m.title}
                        </a>
                      </td>
                      <td className={cellClass}>{m.yes_bid > 0 ? `${m.yes_bid}¢` : "—"}</td>
                      <td className={cellClass}>{m.yes_ask > 0 ? `${m.yes_ask}¢` : "—"}</td>
                      <td className={`${cellClass} font-bold`}>{m.midpoint}¢</td>
                      <td className={`${cellClass} ${m.spread >= 6 ? "text-amber-400 font-bold" : m.spread >= 4 ? "text-cyan-400" : ""}`}>
                        {m.spread > 0 ? `${m.spread}¢` : "—"}
                      </td>
                      <td className={cellClass}>
                        {priceDelta !== null ? (
                          <span className={`font-bold ${priceDelta > 0 ? "text-emerald-400" : priceDelta < 0 ? "text-red-400" : "text-[hsl(var(--nexus-text-muted))]"}`}>
                            {priceDelta > 0 ? "+" : ""}{priceDelta}¢
                          </span>
                        ) : <span className="text-[hsl(var(--nexus-text-muted))]">…</span>}
                      </td>
                      <td className={cellClass}>
                        {volSpike !== null ? (
                          <span className={`font-bold ${volSpike >= 500 ? "text-red-400" : volSpike > 0 ? "text-[hsl(var(--nexus-text-primary))]" : "text-[hsl(var(--nexus-text-muted))]"}`}>
                            {volSpike.toLocaleString()}
                          </span>
                        ) : <span className="text-[hsl(var(--nexus-text-muted))]">…</span>}
                      </td>
                      <td className={`${cellClass} font-bold ${m.vol24h >= 1000 ? "text-emerald-400" : m.vol24h >= 100 ? "text-[hsl(var(--nexus-text-primary))]" : "text-[hsl(var(--nexus-text-muted))]"}`}>
                        {m.vol24h.toLocaleString()}
                      </td>
                      <td className={`${cellClass} ${m.oi >= 5000 ? "text-amber-400 font-bold" : ""}`}>
                        {m.oi.toLocaleString()}
                      </td>
                      <td className={`${cellClass} ${m.vol_oi_ratio > 2 ? "text-red-400 font-bold" : m.vol_oi_ratio > 1 ? "text-amber-400" : ""}`}>
                        {m.vol_oi_ratio > 0 ? `${m.vol_oi_ratio}x` : "—"}
                      </td>
                      <td className={`${cellClass} ${(m.hours_left ?? 999) < 24 ? "text-amber-400" : ""}`}>
                        {fmtHours(m.hours_left)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${m.ticker}-chart`}>
                        <td colSpan={14} className="p-2">
                          <MarketChart ticker={m.ticker} title={m.title} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {activeMarkets.length === 0 && (
                <tr>
                  <td colSpan={14} className="p-4 text-center text-[hsl(var(--nexus-text-muted))]">
                    No markets in this view. Try a different category or tab.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="text-[10px] text-[hsl(var(--nexus-text-muted))] text-right">
          Showing {activeMarkets.length} markets • Total on board: {stats?.totalBoard || 0}
        </div>
      </div>
    </div>
  );
}
