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
  TrendingUp, ArrowUpRight, Clock, Target, Zap, Shield
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface HeatmapEntry {
  asset_class: string;
  icon: string;
  count: number;
  volume: number;
  avg_alpha: number;
  top_signal: string | null;
}

interface EdgeAlert {
  ticker: string;
  title: string;
  event_title: string;
  asset_class: string;
  icon: string;
  type: string;
  signal: string;
  score: number;
  reasoning: string;
  strategy: string;
  price: number;
  bet: number;
  event_ticker: string;
  series_ticker: string;
  tier: string | null;
  recovery_tag: string | null;
  time_to_event_hours: number | null;
  open_interest: number;
  volume_24h: number;
}

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
}

interface RecoveryStats {
  goal: number;
  accelerator_count: number;
  best_roi_pct: number;
  ghost_volume_count: number;
  lotto_count: number;
  penny_amazon_count: number;
}

interface ScannerData {
  heatmap: HeatmapEntry[];
  alerts: EdgeAlert[];
  liquidations: any[];
  markets: MarketRow[];
  recovery: RecoveryStats;
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

// ─── Helpers ────────────────────────────────────────────────────

function getVerdict(type: string | null, score: number, price: number): { label: string; color: string; emoji: string; explanation: string } {
  const priceCents = (price * 100).toFixed(0);
  const maxROI = price > 0 ? ((1 / price - 1) * 100).toFixed(0) : "∞";

  switch (type) {
    case "PENNY_AMAZON":
      return { label: "💎 Penny Amazon", color: "text-yellow-400", emoji: "💎", explanation: `Cheap contract on a big event — massive asymmetric upside. The market is sleeping on this.` };
    case "PRE_MOMENTUM_LOTTO":
      return { label: "🔮 Pre-Mo Lotto", color: "text-fuchsia-400", emoji: "🔮", explanation: `Ghost volume on a cheap contract — the sweet spot. Limit order only.` };
    case "GHOST_VOLUME":
      return { label: "👻 Pre-Momentum", color: "text-purple-400", emoji: "👻", explanation: `Smart money positioned but retail hasn't arrived. EARLY ENTRY.` };
    case "BINARY_CLIFF":
      return { label: "🚨 TAKE PROFIT", color: "text-red-400", emoji: "🚨", explanation: `85¢+ in final phase — sell 75% NOW. Lock in gains.` };
    case "ASYMMETRIC_LOTTO":
      return { label: "🎰 Alpha Lotto", color: "text-emerald-400", emoji: "🎰", explanation: `${priceCents}¢ with high alpha score. Limit order $1-2.50 only.` };
    case "LOW_ALPHA_LOTTO":
      return { label: "🎲 Weak Lotto", color: "text-yellow-500", emoji: "🎲", explanation: `${priceCents}¢ but alpha below threshold. Skip or $1 max.` };
    case "SPREAD_ARB":
      return { label: "💰 Arbitrage!", color: "text-emerald-400", emoji: "💰", explanation: `Buy both sides for guaranteed profit.` };
    case "WIDE_SPREAD":
      return { label: "🎯 Limit Snipe", color: "text-emerald-400", emoji: "🎯", explanation: `Wide spread = free edge. Limit order at midpoint.` };
    case "MICRO_VALUE":
      return { label: "Lotto Play", color: "text-emerald-400", emoji: "🎰", explanation: `${priceCents}¢ — ${maxROI}% ROI.` };
    case "VALUE_ZONE":
      return { label: "Value Bet", color: "text-cyan-400", emoji: "🔵", explanation: `${priceCents}¢ = ${priceCents}% implied. May be underpriced.` };
    case "VOLUME_SPIKE":
      return { label: "📊 Smart Money", color: "text-amber-400", emoji: "📊", explanation: `Unusual volume spike — someone loading up.` };
    case "COIN_FLIP":
      return { label: "50/50", color: "text-yellow-400", emoji: "🟡", explanation: `Only bet with an info edge.` };
    case "FAVORITE":
      return { label: "Likely Winner", color: "text-blue-400", emoji: "🔷", explanation: `${priceCents}¢ — ${maxROI}% return.` };
    case "HEAVY_FAVORITE":
      return { label: "⚪ Floor Defense", color: "text-slate-400", emoji: "⚪", explanation: `Near certain. ${maxROI}% return.` };
    case "MATHEMATICAL_DEATH":
      return { label: "💀 Dead — Sell", color: "text-red-400", emoji: "💀", explanation: `${priceCents}¢ — liquidate now.` };
    case "SETTLED":
    case "DEAD":
      return { label: "Over", color: "text-slate-500", emoji: "⚫", explanation: `Done.` };
    case "LOW_LIQUIDITY":
      return { label: "Thin", color: "text-orange-400", emoji: "🟠", explanation: `Low liquidity.` };
    default:
      return { label: "Neutral", color: "text-[hsl(var(--nexus-text-muted))]", emoji: "⚪", explanation: `No signal.` };
  }
}

function tierBadge(tier: string | null, recoveryTag: string | null): { label: string; className: string } | null {
  if (recoveryTag === "ACCELERATOR" || tier === "ACCELERATOR") {
    return { label: "🚀 ACCELERATOR", className: "bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/40" };
  }
  if (recoveryTag === "FLOOR_DEFENSE" || tier === "FLOOR_DEFENSE") {
    return { label: "🛡️ FLOOR DEFENSE", className: "bg-slate-500/20 text-slate-400 border-slate-500/40" };
  }
  if (tier === "EARLY_ENTRY") {
    return { label: "👻 EARLY ENTRY", className: "bg-purple-500/20 text-purple-400 border-purple-500/40" };
  }
  if (tier === "LOTTO") {
    return { label: "🎰 LOTTO", className: "bg-amber-500/20 text-amber-400 border-amber-500/40" };
  }
  return null;
}

function formatCountdown(hours: number | null): string {
  if (hours === null || hours === undefined) return "";
  if (hours <= 0) return "LIVE NOW";
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
        body: { asset_class: activeClass, confidence: 5, daily_budget: 25, recovery_goal: 130 },
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
    if (m.alpha_type === "PENNY_AMAZON") return true; // ALWAYS show penny amazons
    if (m.alpha_type === "BINARY_CLIFF") return true;
    if (m.recovery_tag === "FLOOR_DEFENSE" && hideJunk) return false;
    return m.alpha_type !== "DEAD" && m.alpha_type !== "SETTLED" && m.yes_price > 0.01 && m.yes_price < 0.97;
  });

  const bestBets = markets.filter(m => 
    m.alpha_type === "PENNY_AMAZON" ||
    m.alpha_type === "PRE_MOMENTUM_LOTTO" ||
    m.alpha_type === "ASYMMETRIC_LOTTO" ||
    m.alpha_type === "GHOST_VOLUME" || 
    m.alpha_type === "SPREAD_ARB" ||
    m.alpha_type === "MICRO_VALUE" ||
    m.alpha_score >= 0.15
  ).slice(0, 12);

  const killSwitchAlerts = (data?.markets || []).filter(m => m.alpha_type === "BINARY_CLIFF");
  const deadPositions = (data?.markets || []).filter(m => m.alpha_type === "MATHEMATICAL_DEATH");
  const recovery = data?.recovery;

  return (
    <div className="min-h-screen bg-[hsl(var(--nexus-bg))] text-[hsl(var(--nexus-text-primary))]">
      {/* ─── HEADER ─── */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[hsl(var(--nexus-bg))]/90 border-b border-[hsl(var(--nexus-border))] px-4 py-3">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold font-[family-name:var(--font-mono)] tracking-tight flex items-center gap-2">
              <Target className="w-5 h-5 text-yellow-400" />
              Penny Amazon Scanner
            </h1>
            <p className="text-xs text-[hsl(var(--nexus-text-muted))] font-mono">
              {data?.stats.totalMarkets || 0} scanned • {recovery?.penny_amazon_count || 0} penny gems • {recovery?.lotto_count || 0} lottos • Updated {lastRefresh || "—"}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs font-mono text-[hsl(var(--nexus-text-muted))]">Hide junk</span>
              <Switch checked={hideJunk} onCheckedChange={setHideJunk} />
            </label>
            <Button size="sm" onClick={fetchData} disabled={loading}
              className="bg-purple-600 hover:bg-purple-700 text-white font-mono">
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

        {/* ─── RECOVERY TRACKER ─── */}
        {recovery && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card className="bg-yellow-500/10 border-yellow-500/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] font-mono text-yellow-300 uppercase">💎 Penny Amazons</p>
                <p className="text-2xl font-bold font-mono text-yellow-400">{recovery.penny_amazon_count || 0}</p>
                <p className="text-[9px] font-mono text-yellow-300/60">≤10¢ hidden gems</p>
              </CardContent>
            </Card>
            <Card className="bg-fuchsia-500/10 border-fuchsia-500/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] font-mono text-fuchsia-300 uppercase">🎰 All Lottos</p>
                <p className="text-2xl font-bold font-mono text-fuchsia-400">{recovery.lotto_count}</p>
                <p className="text-[9px] font-mono text-fuchsia-300/60">Asymmetric bets</p>
              </CardContent>
            </Card>
            <Card className="bg-purple-500/10 border-purple-500/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] font-mono text-purple-300 uppercase">👻 Ghost Volume</p>
                <p className="text-2xl font-bold font-mono text-purple-400">{recovery.ghost_volume_count}</p>
                <p className="text-[9px] font-mono text-purple-300/60">Smart money</p>
              </CardContent>
            </Card>
            <Card className="bg-emerald-500/10 border-emerald-500/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] font-mono text-emerald-300 uppercase">🚀 Accelerators</p>
                <p className="text-2xl font-bold font-mono text-emerald-400">{recovery.accelerator_count}</p>
                <p className="text-[9px] font-mono text-emerald-300/60">ROI &gt;500%</p>
              </CardContent>
            </Card>
            <Card className="bg-red-500/10 border-red-500/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] font-mono text-red-300 uppercase">🎯 Recovery</p>
                <p className="text-2xl font-bold font-mono text-red-400">${recovery.goal.toFixed(0)}</p>
                <p className="text-[9px] font-mono text-red-300/60">Target</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── KILL-SWITCH ALERTS ─── */}
        {killSwitchAlerts.length > 0 && (
          <Alert className="bg-red-500/15 border-red-500/50 animate-pulse">
            <Shield className="h-4 w-4 text-red-400" />
            <AlertTitle className="text-red-400 font-mono text-sm font-bold">
              🚨 BINARY CLIFF — SELL 75% NOW
            </AlertTitle>
            <AlertDescription className="text-red-300/80 font-mono text-xs mt-1 space-y-1">
              {killSwitchAlerts.map(d => (
                <p key={d.ticker}>{d.title} — {(d.yes_price * 100).toFixed(0)}¢ with {formatCountdown(d.time_to_event_hours)} left</p>
              ))}
            </AlertDescription>
          </Alert>
        )}

        {/* ─── BEST SNIPER ENTRIES ─── */}
        {bestBets.length > 0 && (
          <section>
            <h2 className="text-lg font-bold font-[family-name:var(--font-mono)] mb-1 flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400" />
              💎 Penny Amazon Picks
            </h2>
            <p className="text-xs text-[hsl(var(--nexus-text-muted))] font-mono mb-4">
              Cheap contracts on big events — the market is sleeping. $1-3 limit orders for 10x-100x upside.
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {bestBets.map((m) => {
                const v = getVerdict(m.alpha_type, m.alpha_score, m.yes_price);
                const tb = tierBadge(m.alpha_tier, m.recovery_tag);
                const countdown = formatCountdown(m.time_to_event_hours);
                return (
                  <a key={m.ticker} href={kalshiUrl(m)} target="_blank" rel="noopener noreferrer" className="block group">
                    <Card className={`border-[hsl(var(--nexus-border))] hover:border-yellow-500/50 transition-all h-full ${
                      m.alpha_type === "PENNY_AMAZON" ? "bg-yellow-500/8 border-yellow-500/40 ring-1 ring-yellow-500/20" :
                      m.alpha_type === "PRE_MOMENTUM_LOTTO" ? "bg-fuchsia-500/8 border-fuchsia-500/40" :
                      m.alpha_type === "ASYMMETRIC_LOTTO" ? "bg-amber-500/5 border-amber-500/30" :
                      m.alpha_type === "GHOST_VOLUME" ? "bg-purple-500/5 border-purple-500/30" : "bg-[hsl(var(--nexus-surface))]"
                    }`}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="font-mono text-[10px] border-[hsl(var(--nexus-border))] text-[hsl(var(--nexus-text-muted))]">
                            {m.icon} {m.asset_class}
                          </Badge>
                          <div className="flex items-center gap-1.5">
                            {countdown && (
                              <span className="text-[10px] font-mono text-amber-400 flex items-center gap-0.5">
                                <Clock className="w-3 h-3" /> {countdown}
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="font-mono text-sm font-semibold leading-tight line-clamp-2">{m.title}</p>

                        {tb && (
                          <Badge variant="outline" className={`font-mono text-[10px] ${tb.className}`}>
                            {tb.label}
                          </Badge>
                        )}

                        <div className="flex items-end justify-between">
                          <div>
                            <p className="text-xs text-[hsl(var(--nexus-text-muted))] font-mono mb-0.5">Price</p>
                          <p className={`text-2xl font-bold font-mono ${
                              m.alpha_type === "PENNY_AMAZON" ? "text-yellow-400" :
                              m.alpha_type === "PRE_MOMENTUM_LOTTO" ? "text-fuchsia-400" :
                              m.alpha_type === "GHOST_VOLUME" ? "text-purple-400" : "text-emerald-400"
                            }`}>
                              {(m.yes_price * 100).toFixed(0)}¢
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-bold font-mono ${v.color}`}>
                              {v.emoji} {v.label}
                            </p>
                            {m.open_interest > 0 && (
                              <p className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">
                                {m.open_interest} OI
                              </p>
                            )}
                          </div>
                        </div>

                        <p className={`text-[11px] font-mono leading-relaxed ${
                          m.alpha_type === "PENNY_AMAZON" ? "text-yellow-200/90 line-clamp-6" :
                          m.alpha_type === "PRE_MOMENTUM_LOTTO" ? "text-fuchsia-300/80 line-clamp-2" : "text-purple-300/80 line-clamp-2"
                        }`}>
                          {m.alpha_type === "PENNY_AMAZON" ? (m.alpha_reasoning || v.explanation) : (m.alpha_strategy || v.explanation)}
                        </p>

                        <div className="flex items-center justify-between pt-2 border-t border-[hsl(var(--nexus-border))]">
                          <span className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">
                            {m.suggested_bet > 0 ? `Bet: $${m.suggested_bet.toFixed(2)}` : ""} 
                            {m.volume_24h > 0 ? ` • ${m.volume_24h} vol` : ""}
                          </span>
                          <span className="text-xs font-mono text-cyan-400 group-hover:text-cyan-300 flex items-center gap-1">
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

        {/* ─── DEAD POSITIONS ─── */}
        {deadPositions.length > 0 && (
          <Alert className="bg-red-500/10 border-red-500/40">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <AlertTitle className="text-red-400 font-mono text-sm">
              💀 {deadPositions.length} Dead Market{deadPositions.length > 1 ? "s" : ""} — Liquidate
            </AlertTitle>
            <AlertDescription className="text-red-300/80 font-mono text-xs mt-1">
              {deadPositions.map(d => d.title).join(" • ")}
            </AlertDescription>
          </Alert>
        )}

        {/* ─── CATEGORIES ─── */}
        <section>
          <h2 className="text-lg font-bold font-[family-name:var(--font-mono)] mb-3">Browse by Category</h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={activeClass === "All" ? "default" : "outline"}
              onClick={() => setActiveClass("All")}
              className={`text-xs font-mono ${activeClass === "All" ? "bg-purple-600 text-white hover:bg-purple-700" : "border-[hsl(var(--nexus-border))] text-[hsl(var(--nexus-text-muted))]"}`}>
              All ({data?.stats.totalMarkets || 0})
            </Button>
            {data?.heatmap.map(h => (
              <Button key={h.asset_class} size="sm" variant={activeClass === h.asset_class ? "default" : "outline"}
                onClick={() => setActiveClass(h.asset_class)}
                className={`text-xs font-mono ${activeClass === h.asset_class ? "bg-purple-600 text-white hover:bg-purple-700" : "border-[hsl(var(--nexus-border))] text-[hsl(var(--nexus-text-muted))]"}`}>
                {h.icon} {h.asset_class} ({h.count})
              </Button>
            ))}
          </div>
        </section>

        {/* ─── ALL MARKETS TABLE ─── */}
        <section>
          <h2 className="text-lg font-bold font-[family-name:var(--font-mono)] mb-1">All Markets</h2>
          <p className="text-xs text-[hsl(var(--nexus-text-muted))] font-mono mb-4">
            {markets.length} markets • Click to trade on Kalshi
          </p>

          <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[hsl(var(--nexus-border))] hover:bg-transparent">
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold">MARKET</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold text-right">PRICE</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold">EDGE</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold">TIER</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold">STRATEGY</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold text-right">⏱ TIME</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold text-right">OI</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold text-right">ROI</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {markets.slice(0, 50).map((m) => {
                    const v = getVerdict(m.alpha_type, m.alpha_score, m.yes_price);
                    const tb = tierBadge(m.alpha_tier, m.recovery_tag);
                    const maxROI = m.yes_price > 0 ? ((1 / m.yes_price - 1) * 100).toFixed(0) : "∞";
                    const countdown = formatCountdown(m.time_to_event_hours);
                    const isGhost = m.alpha_type === "GHOST_VOLUME";
                    return (
                      <TableRow key={m.ticker}
                        className={`border-[hsl(var(--nexus-border))] hover:bg-[hsl(var(--nexus-surface-raised))] cursor-pointer group ${
                          m.alpha_type === "PENNY_AMAZON" ? "bg-yellow-500/5" :
                          m.alpha_type === "PRE_MOMENTUM_LOTTO" ? "bg-fuchsia-500/5" :
                          isGhost ? "bg-purple-500/5" : ""
                        }`}
                        onClick={() => window.open(kalshiUrl(m), "_blank")}>
                        <TableCell className="max-w-[280px]">
                          <div className="flex items-center gap-2">
                            <span className="text-base shrink-0">{m.icon}</span>
                            <div className="min-w-0">
                              <p className="font-mono text-sm font-semibold truncate">{m.title}</p>
                              <p className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] truncate">{m.event_title}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono text-base font-bold ${
                            m.alpha_type === "PENNY_AMAZON" ? "text-yellow-400" :
                            m.alpha_type === "PRE_MOMENTUM_LOTTO" ? "text-fuchsia-400" :
                            isGhost ? "text-purple-400" : "text-emerald-400"
                          }`}>
                            {(m.yes_price * 100).toFixed(0)}¢
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="text-sm">{v.emoji}</span>
                            <span className={`font-mono text-xs font-semibold ${v.color}`}>{v.label}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {tb ? (
                            <Badge variant="outline" className={`font-mono text-[9px] ${tb.className}`}>
                              {tb.label}
                            </Badge>
                          ) : (
                            <span className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          <p className={`font-mono text-[10px] leading-snug ${
                            m.alpha_type === "PENNY_AMAZON" ? "text-yellow-200/80 line-clamp-4" : "text-[hsl(var(--nexus-text-muted))] line-clamp-2"
                          }`}>
                            {m.alpha_type === "PENNY_AMAZON" ? (m.alpha_reasoning || m.alpha_strategy || v.explanation) : (m.alpha_strategy || m.alpha_reasoning || v.explanation)}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          {countdown ? (
                            <span className={`font-mono text-xs ${
                              (m.time_to_event_hours || 999) <= 4 ? "text-red-400 font-bold" :
                              (m.time_to_event_hours || 999) <= 48 ? "text-amber-400" :
                              "text-[hsl(var(--nexus-text-muted))]"
                            }`}>
                              {countdown}
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono text-xs ${
                            m.open_interest > 250 ? "text-purple-400 font-bold" : "text-[hsl(var(--nexus-text-muted))]"
                          }`}>
                            {m.open_interest > 0 ? m.open_interest.toLocaleString() : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono text-sm font-bold ${
                            Number(maxROI) >= 500 ? "text-emerald-400" :
                            Number(maxROI) >= 100 ? "text-cyan-400" :
                            Number(maxROI) >= 30 ? "text-amber-400" :
                            "text-[hsl(var(--nexus-text-muted))]"
                          }`}>
                            {maxROI}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-cyan-400 group-hover:text-cyan-300 transition-colors">
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
              No markets to show. Try turning off "Hide junk" or selecting a different category.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
