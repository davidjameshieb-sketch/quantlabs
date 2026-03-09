import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  RefreshCw, Zap, Activity, AlertTriangle, Loader2,
  TrendingUp, Shield, Skull, DollarSign, Target, Flame, ExternalLink
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface HeatmapEntry {
  asset_class: string;
  icon: string;
  count: number;
  volume: number;
  avg_alpha: number;
  top_signal: string | null;
  price_to_data_gap: number;
}

interface EdgeAlert {
  ticker: string;
  title: string;
  asset_class: string;
  icon: string;
  type: string;
  signal: string;
  score: number;
  reasoning: string;
  price: number;
  bet: number;
}

interface MarketRow {
  ticker: string;
  title: string;
  event_title: string;
  asset_class: string;
  icon: string;
  yes_price: number;
  no_price: number;
  volume_24h: number;
  open_interest: number;
  alpha_type: string | null;
  alpha_signal: string | null;
  alpha_score: number;
  alpha_reasoning: string | null;
  suggested_bet: number;
  close_time: string;
}

interface ScannerData {
  heatmap: HeatmapEntry[];
  alerts: EdgeAlert[];
  liquidations: any[];
  allocations: any[];
  markets: MarketRow[];
  stats: {
    totalMarkets: number;
    filteredMarkets: number;
    totalEvents: number;
    assetClasses: number;
    activeAlerts: number;
    dailyBudget: number;
    confidence: number;
  };
  timestamp: string;
}

// ─── ROI Tracker ────────────────────────────────────────────────

interface LoggedPosition {
  id: string;
  ticker: string;
  title: string;
  asset_class: string;
  entry_price: number;
  contracts: number;
  cost: number;
  current_price: number;
  pnl: number;
  status: "open" | "closed";
  logged_at: string;
  closed_at?: string;
}

function loadPositions(): LoggedPosition[] {
  try { return JSON.parse(localStorage.getItem("universal_positions") || "[]"); } catch { return []; }
}
function savePositions(p: LoggedPosition[]) { localStorage.setItem("universal_positions", JSON.stringify(p)); }

// ─── Signal Colors ──────────────────────────────────────────────

function signalColor(signal: string | null): string {
  if (!signal) return "bg-muted text-muted-foreground";
  switch (signal) {
    case "MICRO_LOAD": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "ANCHOR_BUY": return "bg-cyan-500/20 text-cyan-400 border-cyan-500/30";
    case "CONCENTRATION_BUY": return "bg-green-500/20 text-green-400 border-green-500/30";
    case "VOLATILITY_ENTRY": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "INSTANT_LIQUIDATION": return "bg-red-500/20 text-red-400 border-red-500/30";
    case "FADE_NO": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    case "DO_NOT_ENTRY": return "bg-red-500/20 text-red-400 border-red-500/30";
    default: return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  }
}

function alphaBar(score: number): string {
  if (score >= 0.5) return "bg-emerald-500";
  if (score >= 0.3) return "bg-cyan-500";
  if (score >= 0.15) return "bg-amber-500";
  return "bg-muted";
}

// ─── Edge Source Labels ─────────────────────────────────────────

const EDGE_SOURCE: Record<string, { label: string; color: string; desc: string }> = {
  MOMENTUM_LOAD:       { label: "📉 Price Momentum", color: "text-emerald-400", desc: "Price under 15¢ with active volume — momentum loading zone, 500%+ ROI potential" },
  TREND_CONFIRM:       { label: "🔄 Trend Confirmation", color: "text-cyan-400", desc: "Price 15-25¢ with volume — 300%+ ROI zone, sentiment lagging data" },
  VOLUME_SPIKE:        { label: "⚡ Volume Spike", color: "text-amber-400", desc: "Volume exceeds daily avg 2×+ at actionable price — breakout incoming" },
  MATHEMATICAL_DEATH:  { label: "☠️ Dead Position", color: "text-red-400", desc: "Price ≤2¢ with open interest — liquidate to recover capital" },
  SWEEP_SIGNAL:        { label: "🎯 Sweep Signal", color: "text-cyan-400", desc: "Early sweep signal detected in recovery zone" },
  UNDERDOG_VALUE:      { label: "🔥 Underdog Value", color: "text-emerald-400", desc: "Mispriced underdog with 500%+ ROI potential and active market" },
  STALE_PRICING:       { label: "⚠️ Stale Pricing", color: "text-red-400", desc: "No active market — zero volume with open interest, DO NOT ENTRY" },
  VALUE_ZONE:          { label: "💎 Value Zone", color: "text-cyan-400", desc: "15-40¢ range with volume — 150-500% ROI potential" },
  COIN_FLIP:           { label: "🎲 Coin Flip", color: "text-yellow-400", desc: "40-60¢ range — near 50/50, watch for volume catalysts" },
  FAVORITE:            { label: "📊 Favorite", color: "text-blue-400", desc: "60-85¢ — likely winner but limited upside" },
  HEAVY_FAVORITE:      { label: "🔒 Heavy Favorite", color: "text-slate-400", desc: "85-95¢ — near-settled, minimal edge" },
  SETTLED:             { label: "✅ Settled", color: "text-slate-500", desc: "95¢+ — outcome essentially decided, zero ROI" },
  DEAD:                { label: "💀 Dead", color: "text-slate-500", desc: "0¢ — no market, dead contract" },
  LOW_LIQUIDITY:       { label: "🕳️ Low Liquidity", color: "text-orange-400", desc: "Thin market — high ROI potential but hard to execute" },
};

function getEdgeSource(type: string | null): { label: string; color: string; desc: string } {
  if (!type || !EDGE_SOURCE[type]) return { label: "📊 General Edge", color: "text-blue-400", desc: "General alpha opportunity detected" };
  return EDGE_SOURCE[type];
}

// ─── Component ──────────────────────────────────────────────────

export default function UniversalAlpha() {
  const [data, setData] = useState<ScannerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState("");
  const [activeClass, setActiveClass] = useState("All");
  const [confidence, setConfidence] = useState(5);
  const [dailyBudget, setDailyBudget] = useState(25);
  const [positions, setPositions] = useState<LoggedPosition[]>(loadPositions);
  const [hideDeadMoney, setHideDeadMoney] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: err } = await supabase.functions.invoke("universal-alpha-scanner", {
        body: { asset_class: activeClass, confidence, daily_budget: dailyBudget },
      });
      if (err) throw err;
      if (res?.error) throw new Error(res.error);
      setData(res);
      setLastRefresh(new Date().toLocaleTimeString());

      // Update open positions with current prices
      if (res?.markets) {
        setPositions(prev => {
          const updated = prev.map(p => {
            if (p.status === "closed") return p;
            const mkt = res.markets.find((m: MarketRow) => m.ticker === p.ticker);
            if (mkt) {
              const currentPrice = mkt.yes_price;
              const pnl = (currentPrice - p.entry_price) * p.contracts;
              return { ...p, current_price: currentPrice, pnl };
            }
            return p;
          });
          savePositions(updated);
          return updated;
        });
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to fetch scanner data");
    } finally {
      setLoading(false);
    }
  }, [activeClass, confidence, dailyBudget]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 30s
  useEffect(() => {
    const iv = setInterval(fetchData, 30000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const logPosition = (market: MarketRow) => {
    const bet = market.suggested_bet || 1;
    const contracts = Math.floor(bet / Math.max(market.yes_price, 0.01));
    const pos: LoggedPosition = {
      id: `${market.ticker}-${Date.now()}`,
      ticker: market.ticker,
      title: market.title,
      asset_class: market.asset_class,
      entry_price: market.yes_price,
      contracts,
      cost: +(market.yes_price * contracts).toFixed(2),
      current_price: market.yes_price,
      pnl: 0,
      status: "open",
      logged_at: new Date().toISOString(),
    };
    setPositions(prev => { const n = [pos, ...prev]; savePositions(n); return n; });
  };

  const closePosition = (id: string) => {
    setPositions(prev => {
      const n = prev.map(p => p.id === id ? { ...p, status: "closed" as const, closed_at: new Date().toISOString() } : p);
      savePositions(n);
      return n;
    });
  };

  const totalPnl = positions.reduce((s, p) => s + p.pnl, 0);
  const openPositions = positions.filter(p => p.status === "open");
  const closedPositions = positions.filter(p => p.status === "closed");

  // Filter markets based on "Dead Money" toggle
  const filteredMarkets = data?.markets.filter(m => {
    if (!hideDeadMoney) return true;
    const price = m.yes_price;
    // Hide 0-5¢ and 95-100¢ (dead money)
    return price > 0.05 && price < 0.95;
  }) || [];

  return (
    <div className="min-h-screen bg-[hsl(var(--nexus-bg))] text-[hsl(var(--nexus-text-primary))]">
      {/* Sticky Header */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[hsl(var(--nexus-bg))]/90 border-b border-[hsl(var(--nexus-border))]">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center shadow-lg">
                <Target className="w-6 h-6 text-black" />
              </div>
              <div>
                <h1 className="text-xl font-bold font-[family-name:var(--font-mono)] tracking-tight">
                  UNIVERSAL ALPHA
                </h1>
                <p className="text-xs text-[hsl(var(--nexus-text-muted))] font-mono">
                  {data?.stats.activeAlerts || 0} EDGE OPPORTUNITIES • {lastRefresh || "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={`font-mono px-3 py-1 ${totalPnl >= 0 ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10" : "text-red-400 border-red-500/40 bg-red-500/10"}`}>
                P&L: {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)}
              </Badge>
              <Badge variant="outline" className="font-mono px-3 py-1 text-cyan-400 border-cyan-500/40 bg-cyan-500/10">
                {openPositions.length} OPEN
              </Badge>
              <Button size="sm" onClick={fetchData} disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {!loading && <span className="ml-1 text-xs">SCAN</span>}
              </Button>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="px-4 pb-3 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-[hsl(var(--nexus-text-muted))] uppercase">Confidence</span>
            <Slider
              value={[confidence]}
              onValueChange={([v]) => setConfidence(v)}
              min={1} max={10} step={1}
              className="w-32"
            />
            <span className="text-sm font-mono font-bold text-emerald-400 w-6">{confidence}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-[hsl(var(--nexus-text-muted))] uppercase">Budget</span>
            {[10, 25, 50, 100].map(b => (
              <Button key={b} size="sm" variant={dailyBudget === b ? "default" : "outline"} onClick={() => setDailyBudget(b)}
                className={`text-xs font-mono h-7 px-3 ${dailyBudget === b
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "border-[hsl(var(--nexus-border))] text-[hsl(var(--nexus-text-muted))] hover:bg-[hsl(var(--nexus-surface-raised))]"
                }`}>
                ${b}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-[hsl(var(--nexus-text-muted))] uppercase">Dead Money Filter</span>
            <Switch checked={hideDeadMoney} onCheckedChange={setHideDeadMoney} />
            <span className="text-xs font-mono text-amber-400">
              {hideDeadMoney ? "ON" : "OFF"}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <Alert className="m-4 bg-red-500/10 border-red-500/40">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertTitle className="text-red-400 font-mono">Error</AlertTitle>
          <AlertDescription className="text-red-300 font-mono text-sm">{error}</AlertDescription>
        </Alert>
      )}

      {/* Main Content - Single Scroll */}
      <div className="max-w-[1600px] mx-auto p-4 space-y-6">
        
        {/* ═══ TOP EDGE OPPORTUNITIES ═══ */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <Zap className="w-6 h-6 text-amber-400" />
            <h2 className="text-2xl font-bold font-[family-name:var(--font-mono)] tracking-tight">
              TOP EDGE OPPORTUNITIES
            </h2>
            <Badge className="font-mono text-xs bg-amber-500/20 text-amber-400 border-amber-500/30">
              {data?.alerts.length || 0} LIVE
            </Badge>
          </div>

          {/* Liquidation Alerts */}
          {data?.liquidations?.map((liq, i) => (
            <Alert key={i} className="mb-3 bg-red-500/10 border-red-500/40">
              <Skull className="h-5 w-5 text-red-400" />
              <AlertTitle className="text-red-400 font-mono font-bold">
                ☠️ INSTANT LIQUIDATION — {liq.ticker}
              </AlertTitle>
              <AlertDescription className="text-red-300 font-mono text-sm mt-1">
                {liq.reasoning}
              </AlertDescription>
            </Alert>
          ))}

          {/* Top Edge Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data?.alerts.slice(0, 6).map((alert, i) => {
              const market = data?.markets.find(m => m.ticker === alert.ticker);
              const edgeSource = getEdgeSource(alert.type);
              return (
                <Card key={i} className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))] hover:border-emerald-500/40 transition-all">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{alert.icon}</span>
                        <div>
                          <Badge className={`font-mono text-[10px] mb-1 ${signalColor(alert.signal)}`}>
                            {alert.signal}
                          </Badge>
                          <CardTitle className="text-sm font-mono leading-tight">
                            {alert.title.slice(0, 60)}
                          </CardTitle>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Edge Source Label */}
                    <div className="p-2 rounded bg-[hsl(var(--nexus-bg))]/50 border-l-2 border-emerald-500">
                      <p className={`text-xs font-mono font-bold ${edgeSource.color} mb-1`}>
                        {edgeSource.label}
                      </p>
                      <p className="text-xs font-mono text-[hsl(var(--nexus-text-muted))] leading-relaxed">
                        {edgeSource.desc}
                      </p>
                    </div>

                    {/* Price & Probability */}
                    <div className="flex items-center justify-between p-3 rounded bg-[hsl(var(--nexus-bg))]/50">
                      <div>
                        <p className="text-xs font-mono text-[hsl(var(--nexus-text-muted))] uppercase mb-1">Market Price</p>
                        <p className="text-3xl font-bold font-mono text-emerald-400">
                          {(alert.price * 100).toFixed(0)}¢
                        </p>
                        <p className="text-xs font-mono text-[hsl(var(--nexus-text-muted))] mt-1">
                          Implied: {(alert.price * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-mono text-[hsl(var(--nexus-text-muted))] uppercase mb-1">Edge Score</p>
                        <p className="text-2xl font-bold font-mono text-amber-400">
                          {(alert.score * 100).toFixed(1)}%
                        </p>
                        <Progress value={alert.score * 100} className="w-20 h-2 mt-2" />
                      </div>
                    </div>

                    {/* Reasoning */}
                    <div className="p-2 rounded bg-[hsl(var(--nexus-bg))]/30 border-l-2 border-amber-500">
                      <p className="text-xs font-mono text-[hsl(var(--nexus-text-muted))] leading-relaxed">
                        {alert.reasoning}
                      </p>
                    </div>

                    {/* Action */}
                    <div className="flex items-center justify-between pt-2 border-t border-[hsl(var(--nexus-border))]">
                      <div>
                        <p className="text-xs font-mono text-[hsl(var(--nexus-text-muted))]">Suggested Bet</p>
                        <p className="text-lg font-bold font-mono text-cyan-400">${alert.bet.toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {market && alert.signal !== "DO_NOT_ENTRY" && (
                          <Button size="sm" onClick={() => logPosition(market)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono">
                            <DollarSign className="w-4 h-4 mr-1" />
                            BUY
                          </Button>
                        )}
                        <a
                          href={`https://kalshi.com/markets/${alert.ticker.toLowerCase()}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[hsl(var(--nexus-card))]/80 border border-[hsl(var(--nexus-border))] text-cyan-400 hover:text-cyan-300 hover:border-cyan-500/50 transition-colors font-mono text-xs"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Kalshi
                        </a>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {data && data.alerts.length === 0 && (
            <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
              <CardContent className="p-8 text-center">
                <Activity className="w-12 h-12 text-[hsl(var(--nexus-text-muted))] mx-auto mb-3" />
                <p className="font-mono text-[hsl(var(--nexus-text-muted))]">
                  No high-alpha opportunities detected. Adjust confidence or scan again.
                </p>
              </CardContent>
            </Card>
          )}
        </section>

        {/* ═══ YOUR POSITIONS ═══ */}
        {openPositions.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="w-6 h-6 text-emerald-400" />
              <h2 className="text-2xl font-bold font-[family-name:var(--font-mono)] tracking-tight">
                YOUR POSITIONS
              </h2>
              <Badge className="font-mono text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                {openPositions.length} OPEN
              </Badge>
            </div>

            <div className="space-y-3">
              {openPositions.map(pos => (
                <Card key={pos.id} className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="font-mono text-[10px] border-[hsl(var(--nexus-border))]">
                            {pos.asset_class}
                          </Badge>
                          <p className="font-mono text-sm font-bold">{pos.title.slice(0, 60)}</p>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                          <div>
                            <p className="text-[hsl(var(--nexus-text-muted))] uppercase mb-1">Entry</p>
                            <p className="text-cyan-400 font-bold">{(pos.entry_price * 100).toFixed(0)}¢</p>
                          </div>
                          <div>
                            <p className="text-[hsl(var(--nexus-text-muted))] uppercase mb-1">Current</p>
                            <p className="text-emerald-400 font-bold">{(pos.current_price * 100).toFixed(0)}¢</p>
                          </div>
                          <div>
                            <p className="text-[hsl(var(--nexus-text-muted))] uppercase mb-1">Contracts</p>
                            <p>{pos.contracts}x</p>
                          </div>
                          <div>
                            <p className="text-[hsl(var(--nexus-text-muted))] uppercase mb-1">Cost</p>
                            <p>${pos.cost.toFixed(2)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-mono text-[hsl(var(--nexus-text-muted))] uppercase mb-1">P&L</p>
                        <p className={`text-2xl font-bold font-mono ${pos.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {pos.pnl >= 0 ? "+" : ""}{pos.pnl.toFixed(2)}
                        </p>
                        <p className={`text-xs font-mono mt-1 ${pos.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {pos.cost > 0 ? ((pos.pnl / pos.cost) * 100).toFixed(1) : "0"}%
                        </p>
                        <Button size="sm" variant="outline" onClick={() => closePosition(pos.id)}
                          className="mt-2 border-red-500/40 text-red-400 hover:bg-red-500/10 font-mono text-xs">
                          CLOSE
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* ═══ ASSET CLASS HEATMAP ═══ */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <Flame className="w-6 h-6 text-amber-400" />
            <h2 className="text-2xl font-bold font-[family-name:var(--font-mono)] tracking-tight">
              ASSET CLASS HEATMAP
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {data?.heatmap.map((h, i) => {
              const isTop = i === 0;
              const intensity = Math.min(1, h.avg_alpha * 10);
              return (
                <Card key={h.asset_class}
                  className={`cursor-pointer transition-all hover:scale-105 border ${
                    isTop
                      ? "border-emerald-500/60 shadow-[0_0_20px_hsl(150_100%_50%/0.2)]"
                      : "border-[hsl(var(--nexus-border))]"
                  } bg-[hsl(var(--nexus-surface))]`}
                  onClick={() => setActiveClass(h.asset_class)}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl">{h.icon}</span>
                      {isTop && <Flame className="w-4 h-4 text-emerald-400 animate-pulse" />}
                    </div>
                    <p className="font-mono text-sm font-bold">{h.asset_class}</p>
                    <p className="font-mono text-xs text-[hsl(var(--nexus-text-muted))]">{h.count} markets</p>
                    <div className="mt-2">
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <span className="text-[hsl(var(--nexus-text-muted))]">Alpha</span>
                        <span className={intensity > 0.3 ? "text-emerald-400" : "text-[hsl(var(--nexus-text-muted))]"}>
                          {(h.avg_alpha * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-[hsl(var(--nexus-bg))] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${alphaBar(h.avg_alpha)}`}
                          style={{ width: `${Math.min(100, intensity * 100)}%` }} />
                      </div>
                    </div>
                    <p className="text-xs font-mono mt-1 text-[hsl(var(--nexus-text-muted))]">
                      Vol: {h.volume.toLocaleString()}
                    </p>
                    {h.top_signal && (
                      <Badge className={`mt-2 text-[10px] font-mono ${signalColor(h.top_signal)}`}>
                        {h.top_signal}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* ═══ ALL MARKETS ═══ */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <Activity className="w-6 h-6 text-purple-400" />
            <h2 className="text-2xl font-bold font-[family-name:var(--font-mono)] tracking-tight">
              ALL MARKETS
            </h2>
            <Badge className="font-mono text-xs bg-purple-500/20 text-purple-400 border-purple-500/30">
              {data?.markets.length || 0} TOTAL
            </Badge>
          </div>

          {/* Asset class filter */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Button size="sm" variant={activeClass === "All" ? "default" : "outline"}
              onClick={() => setActiveClass("All")}
              className={`text-xs font-mono ${activeClass === "All" ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border-[hsl(var(--nexus-border))] text-[hsl(var(--nexus-text-muted))]"}`}>
              All
            </Button>
            {data?.heatmap.map(h => (
              <Button key={h.asset_class} size="sm" variant={activeClass === h.asset_class ? "default" : "outline"}
                onClick={() => setActiveClass(h.asset_class)}
                className={`text-xs font-mono ${activeClass === h.asset_class ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border-[hsl(var(--nexus-border))] text-[hsl(var(--nexus-text-muted))]"}`}>
                {h.icon} {h.asset_class} ({h.count})
              </Button>
            ))}
          </div>

          <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[hsl(var(--nexus-border))] hover:bg-transparent">
                    <TableHead className="font-mono text-xs text-[hsl(var(--nexus-text-muted))]"></TableHead>
                    <TableHead className="font-mono text-xs text-[hsl(var(--nexus-text-muted))]">MARKET</TableHead>
                    <TableHead className="font-mono text-xs text-[hsl(var(--nexus-text-muted))]">EDGE SOURCE</TableHead>
                    <TableHead className="font-mono text-xs text-[hsl(var(--nexus-text-muted))] text-right">YES</TableHead>
                    <TableHead className="font-mono text-xs text-[hsl(var(--nexus-text-muted))] text-right">VOL 24H</TableHead>
                    <TableHead className="font-mono text-xs text-[hsl(var(--nexus-text-muted))] text-center">SIGNAL</TableHead>
                    <TableHead className="font-mono text-xs text-[hsl(var(--nexus-text-muted))] text-right">ALPHA</TableHead>
                    <TableHead className="font-mono text-xs text-[hsl(var(--nexus-text-muted))] text-right">BET</TableHead>
                    <TableHead className="font-mono text-xs text-[hsl(var(--nexus-text-muted))]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMarkets.slice(0, 50).map((m) => {
                    const edgeSource = getEdgeSource(m.alpha_type);
                    return (
                      <TableRow key={m.ticker} className="border-[hsl(var(--nexus-border))] hover:bg-[hsl(var(--nexus-surface-raised))]">
                        <TableCell className="text-lg">{m.icon}</TableCell>
                        <TableCell>
                          <p className="font-mono text-sm font-semibold truncate max-w-[300px]">{m.title}</p>
                          <p className="font-mono text-xs text-[hsl(var(--nexus-text-muted))] truncate max-w-[300px]">{m.ticker}</p>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 max-w-[280px]">
                            <p className={`font-mono text-xs font-bold ${edgeSource.color}`}>{edgeSource.label}</p>
                            <p className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] line-clamp-2">
                              {m.alpha_reasoning}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-emerald-400">
                          {(m.yes_price * 100).toFixed(0)}¢
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-[hsl(var(--nexus-text-muted))]">
                          {m.volume_24h.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center">
                          {m.alpha_signal ? (
                            <Badge className={`text-xs font-mono ${signalColor(m.alpha_signal)}`}>{m.alpha_signal}</Badge>
                          ) : (
                            <span className="text-xs text-[hsl(var(--nexus-text-muted))]">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-sm">
                          <span className={
                            m.alpha_score >= 0.5 ? "text-emerald-400" :
                            m.alpha_score >= 0.3 ? "text-cyan-400" :
                            m.alpha_score >= 0.15 ? "text-amber-400" :
                            m.alpha_score > 0 ? "text-[hsl(var(--nexus-text-muted))]" :
                            "text-red-400"
                          }>
                            {(m.alpha_score * 100).toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-cyan-400">
                          {m.suggested_bet > 0 ? `$${m.suggested_bet.toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {m.alpha_score > 0 && m.alpha_signal !== "DO_NOT_ENTRY" && (
                              <Button size="sm" onClick={() => logPosition(m)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono text-xs">
                                BUY
                              </Button>
                            )}
                            <a
                              href={`https://kalshi.com/markets/${m.ticker.toLowerCase()}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[hsl(var(--nexus-card))]/80 border border-[hsl(var(--nexus-border))] text-cyan-400 hover:text-cyan-300 hover:border-cyan-500/50 transition-colors text-[10px] font-mono"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          {filteredMarkets.length === 0 && (
            <p className="text-center text-[hsl(var(--nexus-text-muted))] font-mono py-8">
              {hideDeadMoney ? "No markets in actionable range (5¢-95¢)" : "No markets found"}
            </p>
          )}
        </section>

        {/* ═══ CLOSED POSITIONS ═══ */}
        {closedPositions.length > 0 && (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-6 h-6 text-cyan-400" />
              <h2 className="text-2xl font-bold font-[family-name:var(--font-mono)] tracking-tight">
                CLOSED POSITIONS
              </h2>
              <Badge className="font-mono text-xs bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
                {closedPositions.length} TOTAL
              </Badge>
            </div>

            <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[hsl(var(--nexus-border))] hover:bg-transparent">
                      <TableHead className="font-mono text-xs text-[hsl(var(--nexus-text-muted))]">MARKET</TableHead>
                      <TableHead className="font-mono text-xs text-[hsl(var(--nexus-text-muted))] text-right">ENTRY</TableHead>
                      <TableHead className="font-mono text-xs text-[hsl(var(--nexus-text-muted))] text-right">EXIT</TableHead>
                      <TableHead className="font-mono text-xs text-[hsl(var(--nexus-text-muted))] text-right">CONTRACTS</TableHead>
                      <TableHead className="font-mono text-xs text-[hsl(var(--nexus-text-muted))] text-right">P&L</TableHead>
                      <TableHead className="font-mono text-xs text-[hsl(var(--nexus-text-muted))] text-right">ROI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {closedPositions.map(pos => (
                      <TableRow key={pos.id} className="border-[hsl(var(--nexus-border))]">
                        <TableCell>
                          <p className="font-mono text-sm font-semibold truncate max-w-[300px]">{pos.title}</p>
                          <p className="font-mono text-xs text-[hsl(var(--nexus-text-muted))]">{pos.asset_class}</p>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-cyan-400">
                          {(pos.entry_price * 100).toFixed(0)}¢
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-emerald-400">
                          {(pos.current_price * 100).toFixed(0)}¢
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {pos.contracts}x
                        </TableCell>
                        <TableCell className={`text-right font-mono font-bold ${pos.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {pos.pnl >= 0 ? "+" : ""}{pos.pnl.toFixed(2)}
                        </TableCell>
                        <TableCell className={`text-right font-mono ${pos.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {pos.cost > 0 ? ((pos.pnl / pos.cost) * 100).toFixed(1) : "0"}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </section>
        )}
      </div>
    </div>
  );
}
