import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  RefreshCw, Loader2, ExternalLink, AlertTriangle,
  ArrowUpRight, Clock, Zap, Shield, Timer, DollarSign, TrendingUp
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface MarketRow {
  ticker: string;
  event_ticker: string;
  series_ticker: string;
  title: string;
  event_title: string;
  asset_class: string;
  icon: string;
  yes_price: number;
  no_price: number;
  yes_bid: number;
  yes_ask: number;
  volume_24h: number;
  open_interest: number;
  alpha_type: string | null;
  alpha_signal: string | null;
  alpha_score: number;
  alpha_reasoning: string | null;
  alpha_strategy: string | null;
  alpha_tier: string | null;
  suggested_bet: number;
  close_time: string;
  time_to_event_hours: number | null;
  recovery_tag: string | null;
  fair_value: number;
  arb_edge_pct: number;
}

interface RecoveryStats {
  goal: number;
  accelerator_count: number;
  best_arb_pct: number;
  price_arb_count: number;
  wholesale_count: number;
  trap_count: number;
  penny_count: number;
  guaranteed_arb_count: number;
}

interface ScannerData {
  heatmap: any[];
  alerts: any[];
  liquidations: any[];
  markets: MarketRow[];
  recovery: RecoveryStats;
  stats: {
    totalMarkets: number;
    filteredMarkets: number;
    totalEvents: number;
    assetClasses: number;
    activeAlerts: number;
    confidence: number;
  };
  timestamp: string;
}

// ─── Helpers ────────────────────────────────────────────────────

function getEdgeLabel(type: string | null): { label: string; color: string; emoji: string } {
  switch (type) {
    case "GUARANTEED_ARB": return { label: "Guaranteed Arb", color: "text-emerald-400", emoji: "💰" };
    case "PRICE_ARB": return { label: "Price Arb", color: "text-emerald-400", emoji: "📊" };
    case "WHOLESALE_SPREAD": return { label: "Wholesale", color: "text-cyan-400", emoji: "🏪" };
    case "LIQUIDITY_TRAP": return { label: "Liquidity Trap", color: "text-purple-400", emoji: "🕳️" };
    case "VELOCITY_PENNY": return { label: "Penny Snipe", color: "text-yellow-400", emoji: "⚡" };
    case "VELOCITY_VALUE": return { label: "Value Play", color: "text-cyan-400", emoji: "📈" };
    case "VELOCITY_SAFE": return { label: "Safe Turnover", color: "text-slate-400", emoji: "🛡️" };
    case "BINARY_CLIFF": return { label: "SELL NOW", color: "text-red-400", emoji: "🚨" };
    case "MATHEMATICAL_DEATH": return { label: "Dead", color: "text-red-400", emoji: "💀" };
    default: return { label: "—", color: "text-[hsl(var(--nexus-text-muted))]", emoji: "⚪" };
  }
}

function formatTimeToCash(hours: number | null): string {
  if (hours === null || hours === undefined) return "—";
  if (hours <= 0) return "NOW";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(0)}h`;
  const days = Math.floor(hours / 24);
  const rem = Math.round(hours % 24);
  return `${days}d ${rem}h`;
}

function kalshiUrl(market: { event_ticker: string; series_ticker: string }): string {
  const et = market.event_ticker || "";
  const st = market.series_ticker || "";
  if (st && et) return `https://kalshi.com/markets/${st}/${et}`;
  if (st) return `https://kalshi.com/markets/${st}`;
  const match = et.match(/^([A-Z0-9]+)-/i);
  if (match) return `https://kalshi.com/markets/${match[1].toUpperCase()}/${et.toUpperCase()}`;
  return `https://kalshi.com/markets`;
}

function arbBadgeColor(pct: number): string {
  if (pct >= 30) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
  if (pct >= 15) return "bg-cyan-500/20 text-cyan-400 border-cyan-500/40";
  if (pct >= 5) return "bg-amber-500/20 text-amber-400 border-amber-500/40";
  return "bg-slate-500/20 text-slate-400 border-slate-500/40";
}

function cardBg(type: string | null): string {
  switch (type) {
    case "GUARANTEED_ARB": return "bg-emerald-500/10 border-emerald-500/50 ring-1 ring-emerald-500/30";
    case "PRICE_ARB": return "bg-emerald-500/8 border-emerald-500/40";
    case "WHOLESALE_SPREAD": return "bg-cyan-500/8 border-cyan-500/40";
    case "LIQUIDITY_TRAP": return "bg-purple-500/8 border-purple-500/40";
    case "VELOCITY_PENNY": return "bg-yellow-500/8 border-yellow-500/40";
    default: return "bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]";
  }
}

// ─── Component ──────────────────────────────────────────────────

export default function UniversalAlpha() {
  const [data, setData] = useState<ScannerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState("");
  const [activeClass, setActiveClass] = useState("All");
  const [hideJunk, setHideJunk] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: err } = await supabase.functions.invoke("universal-alpha-scanner", {
        body: { asset_class: activeClass, confidence: 7, recovery_goal: 130 },
      });
      if (err) throw err;
      if (res?.error) throw new Error(res.error);
      setData(res);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to load markets");
    } finally {
      setLoading(false);
    }
  }, [activeClass]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const iv = setInterval(fetchData, 60000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const markets = (data?.markets || []).filter(m => {
    if (!hideJunk) return true;
    const dominated = ["SETTLED", "DEAD", "NO_ORDERBOOK", "MATHEMATICAL_DEATH"];
    if (dominated.includes(m.alpha_type || "")) return false;
    return m.yes_price > 0.005 && m.yes_price < 0.99;
  });

  const topPicks = markets.filter(m =>
    m.alpha_type === "GUARANTEED_ARB" ||
    m.alpha_type === "PRICE_ARB" ||
    m.alpha_type === "WHOLESALE_SPREAD" ||
    m.alpha_type === "LIQUIDITY_TRAP" ||
    m.alpha_type === "VELOCITY_PENNY" ||
    (m.alpha_type === "VELOCITY_VALUE" && m.arb_edge_pct >= 10)
  ).slice(0, 12);

  const killSwitchAlerts = (data?.markets || []).filter(m => m.alpha_type === "BINARY_CLIFF");
  const recovery = data?.recovery;

  return (
    <div className="min-h-screen bg-[hsl(var(--nexus-bg))] text-[hsl(var(--nexus-text-primary))]">
      {/* ─── HEADER ─── */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[hsl(var(--nexus-bg))]/90 border-b border-[hsl(var(--nexus-border))] px-4 py-3">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold font-[family-name:var(--font-mono)] tracking-tight flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              Arbitrage Scanner
            </h1>
            <p className="text-xs text-[hsl(var(--nexus-text-muted))] font-mono">
              {recovery?.price_arb_count || 0} arbs • {recovery?.wholesale_count || 0} wholesale • {recovery?.trap_count || 0} traps • {recovery?.penny_count || 0} pennies • Updated {lastRefresh || "—"}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs font-mono text-[hsl(var(--nexus-text-muted))]">Hide noise</span>
              <Switch checked={hideJunk} onCheckedChange={setHideJunk} />
            </label>
            <Button size="sm" onClick={fetchData} disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="ml-1.5 text-xs">Scan</span>
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <Alert className="m-4 max-w-[1400px] mx-auto bg-red-500/10 border-red-500/40">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertTitle className="text-red-400 font-mono">Error</AlertTitle>
          <AlertDescription className="text-red-300 font-mono text-sm">{error}</AlertDescription>
        </Alert>
      )}

      <div className="max-w-[1400px] mx-auto p-4 space-y-6">

        {/* ─── DASHBOARD STATS ─── */}
        {recovery && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card className="bg-emerald-500/10 border-emerald-500/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] font-mono text-emerald-300 uppercase">📊 Price Arbs</p>
                <p className="text-2xl font-bold font-mono text-emerald-400">{recovery.price_arb_count}</p>
                <p className="text-[9px] font-mono text-emerald-300/60">FV &gt; Kalshi price</p>
              </CardContent>
            </Card>
            <Card className="bg-cyan-500/10 border-cyan-500/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] font-mono text-cyan-300 uppercase">🏪 Wholesale</p>
                <p className="text-2xl font-bold font-mono text-cyan-400">{recovery.wholesale_count}</p>
                <p className="text-[9px] font-mono text-cyan-300/60">Wide spread snipes</p>
              </CardContent>
            </Card>
            <Card className="bg-purple-500/10 border-purple-500/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] font-mono text-purple-300 uppercase">🕳️ Traps</p>
                <p className="text-2xl font-bold font-mono text-purple-400">{recovery.trap_count}</p>
                <p className="text-[9px] font-mono text-purple-300/60">OI trapped, name price</p>
              </CardContent>
            </Card>
            <Card className="bg-yellow-500/10 border-yellow-500/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] font-mono text-yellow-300 uppercase">⚡ Pennies</p>
                <p className="text-2xl font-bold font-mono text-yellow-400">{recovery.penny_count}</p>
                <p className="text-[9px] font-mono text-yellow-300/60">≤15¢ velocity</p>
              </CardContent>
            </Card>
            <Card className="bg-red-500/10 border-red-500/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] font-mono text-red-300 uppercase">🎯 Best Edge</p>
                <p className="text-2xl font-bold font-mono text-red-400">+{recovery.best_arb_pct}%</p>
                <p className="text-[9px] font-mono text-red-300/60">Top arb discount</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── KILL-SWITCH ─── */}
        {killSwitchAlerts.length > 0 && (
          <Alert className="bg-red-500/15 border-red-500/50 animate-pulse">
            <Shield className="h-4 w-4 text-red-400" />
            <AlertTitle className="text-red-400 font-mono text-sm font-bold">🚨 BINARY CLIFF — SELL 75% NOW</AlertTitle>
            <AlertDescription className="text-red-300/80 font-mono text-xs mt-1 space-y-1">
              {killSwitchAlerts.map(d => (
                <p key={d.ticker}>{d.title} — {(d.yes_price * 100).toFixed(0)}¢ with {formatTimeToCash(d.time_to_event_hours)} left</p>
              ))}
            </AlertDescription>
          </Alert>
        )}

        {/* ─── THE MANIFEST — Top Arb Picks ─── */}
        {topPicks.length > 0 && (
          <section>
            <h2 className="text-lg font-bold font-[family-name:var(--font-mono)] mb-1 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              The Manifest — Top Arbitrage Plays
            </h2>
            <p className="text-xs text-[hsl(var(--nexus-text-muted))] font-mono mb-4">
              Sorted by arb edge. Kalshi price vs fair value — buy the discount.
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {topPicks.map((m) => {
                const edge = getEdgeLabel(m.alpha_type);
                const timeToCash = formatTimeToCash(m.time_to_event_hours);
                const fvCents = Math.round((m.fair_value || 0) * 100);
                const priceCents = Math.round(m.yes_price * 100);
                const maxROI = m.yes_price > 0 ? Math.round((1 / m.yes_price - 1) * 100) : 0;
                return (
                  <a key={m.ticker} href={kalshiUrl(m)} target="_blank" rel="noopener noreferrer" className="block group">
                    <Card className={`${cardBg(m.alpha_type)} hover:ring-1 hover:ring-emerald-500/30 transition-all h-full`}>
                      <CardContent className="p-4 space-y-3">
                        {/* Header row */}
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="font-mono text-[10px] border-[hsl(var(--nexus-border))] text-[hsl(var(--nexus-text-muted))]">
                            {m.icon} {m.asset_class}
                          </Badge>
                          <div className="flex items-center gap-2">
                            {m.arb_edge_pct > 0 && (
                              <Badge variant="outline" className={`font-mono text-[10px] font-bold ${arbBadgeColor(m.arb_edge_pct)}`}>
                                +{m.arb_edge_pct}% ARB
                              </Badge>
                            )}
                            <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-0.5 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              <Timer className="w-3 h-3" /> {timeToCash}
                            </span>
                          </div>
                        </div>

                        {/* Title */}
                        <p className="font-mono text-sm font-semibold leading-tight line-clamp-2">{m.title}</p>
                        <p className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] truncate">{m.event_title}</p>

                        {/* Price / FV / Edge */}
                        <div className="flex items-end justify-between">
                          <div>
                            <p className="text-[10px] text-[hsl(var(--nexus-text-muted))] font-mono">Kalshi Price</p>
                            <p className={`text-2xl font-bold font-mono ${edge.color}`}>{priceCents}¢</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-[hsl(var(--nexus-text-muted))] font-mono">Fair Value</p>
                            <p className="text-lg font-bold font-mono text-emerald-400">{fvCents}¢</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-[hsl(var(--nexus-text-muted))] font-mono">ROI</p>
                            <p className={`text-lg font-bold font-mono ${maxROI >= 500 ? "text-emerald-400" : maxROI >= 100 ? "text-cyan-400" : "text-amber-400"}`}>{maxROI}%</p>
                          </div>
                        </div>

                        {/* Edge type + OI */}
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold font-mono ${edge.color}`}>{edge.emoji} {edge.label}</span>
                          {m.open_interest > 0 && (
                            <span className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">{m.open_interest} OI</span>
                          )}
                          {m.volume_24h > 0 && (
                            <span className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">{m.volume_24h} vol</span>
                          )}
                        </div>

                        {/* Reasoning */}
                        <p className="text-[11px] font-mono leading-relaxed text-[hsl(var(--nexus-text-muted))] line-clamp-3">
                          {m.alpha_reasoning}
                        </p>

                        {/* Strategy + Trade */}
                        <div className="flex items-center justify-between pt-2 border-t border-[hsl(var(--nexus-border))]">
                          <span className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">
                            {m.suggested_bet > 0 ? `Bet: $${m.suggested_bet.toFixed(2)}` : ""}
                          </span>
                          <span className="text-xs font-mono text-emerald-400 group-hover:text-emerald-300 flex items-center gap-1 font-bold">
                            Trade <ArrowUpRight className="w-3 h-3" />
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </a>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── CATEGORIES ─── */}
        <section>
          <h2 className="text-lg font-bold font-[family-name:var(--font-mono)] mb-3">Browse by Category</h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={activeClass === "All" ? "default" : "outline"}
              onClick={() => setActiveClass("All")}
              className={`text-xs font-mono ${activeClass === "All" ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border-[hsl(var(--nexus-border))] text-[hsl(var(--nexus-text-muted))]"}`}>
              All ({data?.stats.totalMarkets || 0})
            </Button>
            {data?.heatmap.map(h => (
              <Button key={h.asset_class} size="sm" variant={activeClass === h.asset_class ? "default" : "outline"}
                onClick={() => setActiveClass(h.asset_class)}
                className={`text-xs font-mono ${activeClass === h.asset_class ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border-[hsl(var(--nexus-border))] text-[hsl(var(--nexus-text-muted))]"}`}>
                {h.icon} {h.asset_class} ({h.count})
              </Button>
            ))}
          </div>
        </section>

        {/* ─── ALL MARKETS TABLE ─── */}
        <section>
          <h2 className="text-lg font-bold font-[family-name:var(--font-mono)] mb-1">All Markets</h2>
          <p className="text-xs text-[hsl(var(--nexus-text-muted))] font-mono mb-4">
            {markets.length} actionable markets • Sorted by arb edge
          </p>

          <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[hsl(var(--nexus-border))] hover:bg-transparent">
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold">MARKET</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold text-right">PRICE</TableHead>
                    <TableHead className="font-mono text-[11px] text-emerald-400 font-semibold text-right">FAIR VALUE</TableHead>
                    <TableHead className="font-mono text-[11px] text-emerald-400 font-semibold text-right">ARB EDGE</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold">TYPE</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold">STRATEGY</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold text-right">⏱ CASH</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold text-right">OI</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold text-right">ROI</TableHead>
                    <TableHead className="font-mono text-[11px] w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {markets.slice(0, 50).map((m) => {
                    const edge = getEdgeLabel(m.alpha_type);
                    const maxROI = m.yes_price > 0 ? ((1 / m.yes_price - 1) * 100).toFixed(0) : "∞";
                    const fvCents = Math.round((m.fair_value || 0) * 100);
                    return (
                      <TableRow key={m.ticker}
                        className={`border-[hsl(var(--nexus-border))] hover:bg-[hsl(var(--nexus-surface-raised))] cursor-pointer group ${
                          m.alpha_type === "PRICE_ARB" || m.alpha_type === "GUARANTEED_ARB" ? "bg-emerald-500/5" :
                          m.alpha_type === "WHOLESALE_SPREAD" ? "bg-cyan-500/5" :
                          m.alpha_type === "LIQUIDITY_TRAP" ? "bg-purple-500/5" :
                          m.alpha_type === "VELOCITY_PENNY" ? "bg-yellow-500/5" : ""
                        }`}
                        onClick={() => window.open(kalshiUrl(m), "_blank")}>
                        <TableCell className="max-w-[250px]">
                          <div className="flex items-center gap-2">
                            <span className="text-base shrink-0">{m.icon}</span>
                            <div className="min-w-0">
                              <p className="font-mono text-sm font-semibold truncate">{m.title}</p>
                              <p className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] truncate">{m.event_title}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono text-base font-bold ${edge.color}`}>
                            {(m.yes_price * 100).toFixed(0)}¢
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-mono text-sm font-bold text-emerald-400">{fvCents}¢</span>
                        </TableCell>
                        <TableCell className="text-right">
                          {m.arb_edge_pct > 0 ? (
                            <Badge variant="outline" className={`font-mono text-[10px] font-bold ${arbBadgeColor(m.arb_edge_pct)}`}>
                              +{m.arb_edge_pct}%
                            </Badge>
                          ) : (
                            <span className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={`font-mono text-xs font-semibold ${edge.color}`}>{edge.emoji} {edge.label}</span>
                        </TableCell>
                        <TableCell className="max-w-[180px]">
                          <p className="font-mono text-[10px] leading-snug text-[hsl(var(--nexus-text-muted))] line-clamp-2">
                            {m.alpha_strategy}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono text-xs font-bold ${
                            (m.time_to_event_hours || 999) <= 24 ? "text-emerald-400" :
                            (m.time_to_event_hours || 999) <= 72 ? "text-amber-400" :
                            "text-[hsl(var(--nexus-text-muted))]"
                          }`}>
                            {formatTimeToCash(m.time_to_event_hours)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono text-xs ${m.open_interest > 200 ? "text-purple-400 font-bold" : "text-[hsl(var(--nexus-text-muted))]"}`}>
                            {m.open_interest > 0 ? m.open_interest.toLocaleString() : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono text-sm font-bold ${
                            Number(maxROI) >= 500 ? "text-emerald-400" :
                            Number(maxROI) >= 100 ? "text-cyan-400" :
                            "text-[hsl(var(--nexus-text-muted))]"
                          }`}>
                            {maxROI}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-emerald-400 group-hover:text-emerald-300 transition-colors">
                            <ExternalLink className="w-4 h-4" />
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

          {markets.length === 0 && data && (
            <p className="text-center text-[hsl(var(--nexus-text-muted))] font-mono py-8 text-sm">
              No actionable markets found. Turn off "Hide noise" to see everything.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
