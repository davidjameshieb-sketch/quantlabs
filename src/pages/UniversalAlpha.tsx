import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import {
  RefreshCw, Zap, Activity, AlertTriangle, Loader2,
  TrendingUp, Shield, Skull, DollarSign, Target, Flame
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

interface Allocation {
  ticker: string;
  title: string;
  asset_class: string;
  alpha_type: string;
  alpha_score: number;
  price: number;
  allocation: number;
  contracts: number;
  corridor: { anchor: number; floor: number; hedge_available: boolean };
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
  allocations: Allocation[];
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
    default: return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  }
}

function alphaBar(score: number): string {
  if (score >= 0.5) return "bg-emerald-500";
  if (score >= 0.3) return "bg-cyan-500";
  if (score >= 0.15) return "bg-amber-500";
  return "bg-muted";
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
  const [activeTab, setActiveTab] = useState("alerts");

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

  return (
    <div className="min-h-screen bg-[hsl(var(--nexus-bg))] text-[hsl(var(--nexus-text-primary))]">
      {/* Header */}
      <div className="border-b border-[hsl(var(--nexus-border))] px-4 py-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
              <Target className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="text-lg font-bold font-[family-name:var(--font-mono)] tracking-tight">
                UNIVERSAL ALPHA SCANNER
              </h1>
              <p className="text-xs text-[hsl(var(--nexus-text-muted))]">
                Multi-Asset Arbitrage • Kalshi Live • {lastRefresh || "—"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`font-mono text-xs ${totalPnl >= 0 ? "text-emerald-400 border-emerald-500/30" : "text-red-400 border-red-500/30"}`}>
              P&L: {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs text-cyan-400 border-cyan-500/30">
              {openPositions.length} OPEN
            </Badge>
            <Button size="sm" variant="outline" onClick={fetchData} disabled={loading}
              className="border-[hsl(var(--nexus-border))] bg-[hsl(var(--nexus-surface))] text-[hsl(var(--nexus-text-primary))] hover:bg-[hsl(var(--nexus-surface-raised))]">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <Alert className="m-4 bg-red-500/10 border-red-500/30">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertTitle className="text-red-400">Error</AlertTitle>
          <AlertDescription className="text-red-300">{error}</AlertDescription>
        </Alert>
      )}

      {/* Controls Row: Confidence Slider + Budget */}
      <div className="px-4 pt-3 pb-2 flex flex-wrap gap-4 items-center border-b border-[hsl(var(--nexus-border))]">
        <div className="flex items-center gap-3 min-w-[220px]">
          <span className="text-xs font-mono text-[hsl(var(--nexus-text-muted))]">CONFIDENCE</span>
          <Slider
            value={[confidence]}
            onValueChange={([v]) => setConfidence(v)}
            min={1} max={10} step={1}
            className="w-32"
          />
          <span className="text-sm font-mono font-bold text-cyan-400 w-6">{confidence}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-[hsl(var(--nexus-text-muted))]">DAILY BUDGET</span>
          <div className="flex gap-1">
            {[10, 25, 50, 100].map(b => (
              <Button key={b} size="sm" variant={dailyBudget === b ? "default" : "outline"} onClick={() => setDailyBudget(b)}
                className={`text-xs font-mono h-7 px-2 ${dailyBudget === b
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "border-[hsl(var(--nexus-border))] bg-[hsl(var(--nexus-surface))] text-[hsl(var(--nexus-text-muted))] hover:bg-[hsl(var(--nexus-surface-raised))]"
                }`}>
                ${b}
              </Button>
            ))}
          </div>
        </div>
        {data && (
          <div className="ml-auto flex gap-3 text-xs font-mono text-[hsl(var(--nexus-text-muted))]">
            <span>{data.stats.totalMarkets} mkts</span>
            <span>{data.stats.totalEvents} evts</span>
            <span>{data.stats.assetClasses} classes</span>
            <span className="text-amber-400">{data.stats.activeAlerts} alerts</span>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="p-4 space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-[hsl(var(--nexus-surface))] border border-[hsl(var(--nexus-border))]">
            <TabsTrigger value="alerts" className="font-mono text-xs data-[state=active]:bg-[hsl(var(--nexus-surface-raised))] data-[state=active]:text-amber-400">
              ⚡ EDGE ALERTS
            </TabsTrigger>
            <TabsTrigger value="heatmap" className="font-mono text-xs data-[state=active]:bg-[hsl(var(--nexus-surface-raised))] data-[state=active]:text-emerald-400">
              🔥 HEATMAP
            </TabsTrigger>
            <TabsTrigger value="allocator" className="font-mono text-xs data-[state=active]:bg-[hsl(var(--nexus-surface-raised))] data-[state=active]:text-cyan-400">
              💰 ALLOCATOR
            </TabsTrigger>
            <TabsTrigger value="markets" className="font-mono text-xs data-[state=active]:bg-[hsl(var(--nexus-surface-raised))] data-[state=active]:text-purple-400">
              📊 ALL MARKETS
            </TabsTrigger>
            <TabsTrigger value="portfolio" className="font-mono text-xs data-[state=active]:bg-[hsl(var(--nexus-surface-raised))] data-[state=active]:text-emerald-400">
              📈 ROI TRACKER
            </TabsTrigger>
          </TabsList>

          {/* ─── HEATMAP ─────────────────────────────────────── */}
          <TabsContent value="heatmap" className="mt-4">
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
                    onClick={() => { setActiveClass(h.asset_class); setActiveTab("markets"); }}>
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
            {data?.heatmap.length === 0 && !loading && (
              <p className="text-center text-[hsl(var(--nexus-text-muted))] font-mono py-8">No markets found</p>
            )}
          </TabsContent>

          {/* ─── EDGE ALERTS ─────────────────────────────────── */}
          <TabsContent value="alerts" className="mt-4 space-y-3">
            {/* Liquidation alerts */}
            {data?.liquidations?.map((liq, i) => (
              <Alert key={i} className="bg-red-500/10 border-red-500/40">
                <Skull className="h-4 w-4 text-red-400" />
                <AlertTitle className="text-red-400 font-mono text-sm">☠️ MATHEMATICAL DEATH — {liq.ticker}</AlertTitle>
                <AlertDescription className="text-red-300 text-xs font-mono">{liq.reasoning}</AlertDescription>
              </Alert>
            ))}
            {/* Edge alerts */}
            {data?.alerts.map((a, i) => (
              <Card key={i} className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{a.icon}</span>
                        <Badge className={`font-mono text-[10px] ${signalColor(a.signal)}`}>{a.signal}</Badge>
                        <Badge variant="outline" className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] border-[hsl(var(--nexus-border))]">
                          {a.asset_class}
                        </Badge>
                        <span className="font-mono text-xs text-emerald-400">α {(a.score * 100).toFixed(1)}%</span>
                      </div>
                      <p className="font-mono text-sm font-bold">{a.title}</p>
                      <p className="text-xs text-[hsl(var(--nexus-text-muted))] font-mono mt-1">{a.reasoning}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-lg font-bold text-emerald-400">{(a.price * 100).toFixed(0)}¢</p>
                      <p className="font-mono text-xs text-cyan-400">${a.bet.toFixed(2)} bet</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {(!data?.alerts || data.alerts.length === 0) && !loading && (
              <p className="text-center text-[hsl(var(--nexus-text-muted))] font-mono py-8">No active edge alerts</p>
            )}
          </TabsContent>

          {/* ─── ALLOCATOR ───────────────────────────────────── */}
          <TabsContent value="allocator" className="mt-4">
            <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))] mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="font-mono text-sm text-cyan-400 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> MICRO-BET ALLOCATOR — ${dailyBudget} BUDGET
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-[hsl(var(--nexus-text-muted))] font-mono mb-4">
                  Top {data?.allocations.length || 0} opportunities with No-Loss Corridor (Anchor + Floor + Hedge)
                </p>
                {data?.allocations.length ? (
                  <div className="space-y-3">
                    {data.allocations.map((a, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded bg-[hsl(var(--nexus-bg))] border border-[hsl(var(--nexus-border))]">
                        <div className="w-8 h-8 rounded-full bg-[hsl(var(--nexus-surface-raised))] flex items-center justify-center font-mono text-sm font-bold text-cyan-400">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-sm font-bold truncate">{a.title}</p>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px] font-mono border-[hsl(var(--nexus-border))] text-[hsl(var(--nexus-text-muted))]">{a.asset_class}</Badge>
                            <Badge className={`text-[10px] font-mono ${signalColor(a.alpha_type)}`}>{a.alpha_type}</Badge>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono text-sm font-bold text-emerald-400">${a.allocation.toFixed(2)}</p>
                          <p className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))]">{a.contracts}x @ {(a.price * 100).toFixed(0)}¢</p>
                        </div>
                        <div className="flex gap-1">
                          {/* No-Loss Corridor lights */}
                          <div className={`w-2.5 h-2.5 rounded-full ${a.corridor.anchor > 0 ? "bg-emerald-500" : "bg-red-500"}`} title="Anchor" />
                          <div className={`w-2.5 h-2.5 rounded-full ${a.corridor.floor > 0 ? "bg-emerald-500" : "bg-red-500"}`} title="Floor" />
                          <div className={`w-2.5 h-2.5 rounded-full ${a.corridor.hedge_available ? "bg-emerald-500" : "bg-red-500"}`} title="Hedge" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-[hsl(var(--nexus-text-muted))] font-mono py-4">No allocations — waiting for alpha signals</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── ALL MARKETS ─────────────────────────────────── */}
          <TabsContent value="markets" className="mt-4">
            {/* Asset class filter */}
            <div className="flex flex-wrap gap-1 mb-3">
              <Button size="sm" variant={activeClass === "All" ? "default" : "outline"}
                onClick={() => setActiveClass("All")}
                className={`text-xs font-mono h-7 ${activeClass === "All" ? "bg-emerald-600 text-white" : "border-[hsl(var(--nexus-border))] bg-[hsl(var(--nexus-surface))] text-[hsl(var(--nexus-text-muted))]"}`}>
                All
              </Button>
              {data?.heatmap.map(h => (
                <Button key={h.asset_class} size="sm" variant={activeClass === h.asset_class ? "default" : "outline"}
                  onClick={() => setActiveClass(h.asset_class)}
                  className={`text-xs font-mono h-7 ${activeClass === h.asset_class ? "bg-emerald-600 text-white" : "border-[hsl(var(--nexus-border))] bg-[hsl(var(--nexus-surface))] text-[hsl(var(--nexus-text-muted))]"}`}>
                  {h.icon} {h.asset_class} ({h.count})
                </Button>
              ))}
            </div>

            <div className="rounded border border-[hsl(var(--nexus-border))] overflow-auto bg-[hsl(var(--nexus-surface))]">
              <Table>
                <TableHeader>
                  <TableRow className="border-[hsl(var(--nexus-border))] hover:bg-transparent">
                    <TableHead className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] w-8"></TableHead>
                    <TableHead className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))]">MARKET</TableHead>
                    <TableHead className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] text-right">YES</TableHead>
                    <TableHead className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] text-right">NO</TableHead>
                    <TableHead className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] text-right">VOL</TableHead>
                    <TableHead className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] text-center">SIGNAL</TableHead>
                    <TableHead className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] text-right">ALPHA</TableHead>
                    <TableHead className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] text-right">BET</TableHead>
                    <TableHead className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.markets.slice(0, 50).map((m) => (
                    <TableRow key={m.ticker} className="border-[hsl(var(--nexus-border))] hover:bg-[hsl(var(--nexus-surface-raised))]">
                      <TableCell className="text-base">{m.icon}</TableCell>
                      <TableCell>
                        <p className="font-mono text-xs font-semibold truncate max-w-[280px]">{m.title}</p>
                        <p className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] truncate max-w-[280px]">{m.ticker}</p>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-emerald-400">
                        {(m.yes_price * 100).toFixed(0)}¢
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-red-400">
                        {(m.no_price * 100).toFixed(0)}¢
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-[hsl(var(--nexus-text-muted))]">
                        {m.volume_24h.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center">
                        {m.alpha_signal ? (
                          <Badge className={`text-[10px] font-mono ${signalColor(m.alpha_signal)}`}>{m.alpha_signal}</Badge>
                        ) : (
                          <span className="text-[10px] text-[hsl(var(--nexus-text-muted))]">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {m.alpha_score > 0 ? (
                          <span className="text-emerald-400">{(m.alpha_score * 100).toFixed(1)}%</span>
                        ) : (
                          <span className="text-[hsl(var(--nexus-text-muted))]">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-cyan-400">
                        {m.suggested_bet > 0 ? `$${m.suggested_bet.toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell>
                        {m.alpha_score > 0 && (
                          <Button size="sm" variant="ghost" onClick={() => logPosition(m)}
                            className="h-6 w-6 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10">
                            <TrendingUp className="w-3 h-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ─── ROI TRACKER ─────────────────────────────────── */}
          <TabsContent value="portfolio" className="mt-4 space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
                <CardContent className="p-4 text-center">
                  <p className="text-xs font-mono text-[hsl(var(--nexus-text-muted))]">TOTAL P&L</p>
                  <p className={`text-xl font-mono font-bold ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
                <CardContent className="p-4 text-center">
                  <p className="text-xs font-mono text-[hsl(var(--nexus-text-muted))]">OPEN</p>
                  <p className="text-xl font-mono font-bold text-cyan-400">{openPositions.length}</p>
                </CardContent>
              </Card>
              <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
                <CardContent className="p-4 text-center">
                  <p className="text-xs font-mono text-[hsl(var(--nexus-text-muted))]">CLOSED</p>
                  <p className="text-xl font-mono font-bold text-purple-400">{closedPositions.length}</p>
                </CardContent>
              </Card>
              <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
                <CardContent className="p-4 text-center">
                  <p className="text-xs font-mono text-[hsl(var(--nexus-text-muted))]">DEPLOYED</p>
                  <p className="text-xl font-mono font-bold text-amber-400">
                    ${openPositions.reduce((s, p) => s + p.cost, 0).toFixed(2)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Open positions */}
            {openPositions.length > 0 && (
              <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
                <CardHeader className="pb-2">
                  <CardTitle className="font-mono text-sm text-emerald-400">OPEN POSITIONS</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {openPositions.map(p => (
                      <div key={p.id} className="flex items-center gap-3 p-2 rounded bg-[hsl(var(--nexus-bg))] border border-[hsl(var(--nexus-border))]">
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-xs font-bold truncate">{p.title}</p>
                          <p className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))]">
                            {p.contracts}x @ {(p.entry_price * 100).toFixed(0)}¢ • Now {(p.current_price * 100).toFixed(0)}¢
                          </p>
                        </div>
                        <span className={`font-mono text-sm font-bold ${p.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {p.pnl >= 0 ? "+" : ""}{p.pnl.toFixed(2)}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => closePosition(p.id)}
                          className="h-6 px-2 text-xs font-mono text-red-400 hover:text-red-300 hover:bg-red-500/10">
                          CLOSE
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {positions.length === 0 && (
              <p className="text-center text-[hsl(var(--nexus-text-muted))] font-mono py-8">
                No positions logged yet. Use the ↗ button on any market to start tracking.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
