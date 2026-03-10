import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  RefreshCw, Loader2, ExternalLink, AlertTriangle,
  ArrowUpRight, Clock, Zap, Shield, Timer, TrendingUp, Flame, Target, BarChart3
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface MarketRow {
  ticker: string;
  event_ticker: string;
  series_ticker: string;
  title: string;
  event_title: string;
  sport: string;
  icon: string;
  is_prop: boolean;
  is_spread: boolean;
  yes_price: number;
  no_price: number;
  yes_bid: number;
  yes_ask: number;
  volume_24h: number;
  open_interest: number;
  close_time: string;
  time_to_event_hours: number | null;
  catalyst_type: string | null;
  catalyst_signal: string | null;
  catalyst_score: number;
  catalyst_reasoning: string | null;
  catalyst_strategy: string | null;
  catalyst_tag: string | null;
  fair_value: number;
  suggested_bet: number;
}

interface SportSummary {
  sport: string;
  icon: string;
  count: number;
  volume: number;
  top_catalyst: string | null;
}

interface ScannerData {
  markets: MarketRow[];
  sport_summary: SportSummary[];
  kill_alerts: { ticker: string; title: string; price: number; hours: number }[];
  stats: {
    totalMarkets: number;
    sportsOnly: number;
    filteredMarkets: number;
    totalEvents: number;
    sportsCategories: number;
    breakingNewsCount: number;
    narrativeMismatchCount: number;
    volumeSurgeCount: number;
    pennyCount: number;
  };
  timestamp: string;
}

// ─── Helpers ────────────────────────────────────────────────────

function getCatalystLabel(type: string | null): { label: string; color: string; emoji: string; bg: string } {
  switch (type) {
    case "BREAKING_NEWS_ARB": return { label: "Breaking News", color: "text-red-400", emoji: "📰", bg: "bg-red-500/10 border-red-500/50 ring-1 ring-red-500/30" };
    case "NARRATIVE_MISMATCH": return { label: "Narrative Mismatch", color: "text-amber-400", emoji: "🎯", bg: "bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/30" };
    case "VOLUME_SURGE": return { label: "Volume Surge", color: "text-cyan-400", emoji: "📊", bg: "bg-cyan-500/10 border-cyan-500/40" };
    case "SPREAD_VALUE": return { label: "Spread Value", color: "text-emerald-400", emoji: "📐", bg: "bg-emerald-500/8 border-emerald-500/40" };
    case "PENNY_CATALYST": return { label: "Lotto Play", color: "text-yellow-400", emoji: "🎲", bg: "bg-yellow-500/8 border-yellow-500/40" };
    case "SPORTS_VALUE": return { label: "Value", color: "text-slate-300", emoji: "⚡", bg: "bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]" };
    case "BINARY_CLIFF": return { label: "SELL NOW", color: "text-red-400", emoji: "🚨", bg: "bg-red-500/15 border-red-500/50" };
    default: return { label: "—", color: "text-[hsl(var(--nexus-text-muted))]", emoji: "⚪", bg: "bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]" };
  }
}

function formatTimeTo(hours: number | null): string {
  if (hours === null || hours === undefined) return "—";
  if (hours <= 0) return "LIVE";
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
  const [activeSport, setActiveSport] = useState("All");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: err } = await supabase.functions.invoke("universal-alpha-scanner", {
        body: { sport: activeSport },
      });
      if (err) throw err;
      if (res?.error) throw new Error(res.error);
      setData(res);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [activeSport]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const iv = setInterval(fetchData, 60000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const markets = data?.markets || [];
  const stats = data?.stats;
  const sportSummary = data?.sport_summary || [];
  const killAlerts = data?.kill_alerts || [];

  // Separate catalysts for the top section
  const breakingNews = markets.filter(m => m.catalyst_type === "BREAKING_NEWS_ARB");
  const narrativeMismatches = markets.filter(m => m.catalyst_type === "NARRATIVE_MISMATCH");
  const topCatalysts = [...breakingNews, ...narrativeMismatches].slice(0, 8);

  return (
    <div className="min-h-screen bg-[hsl(var(--nexus-bg))] text-[hsl(var(--nexus-text-primary))]">
      {/* ─── HEADER ─── */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[hsl(var(--nexus-bg))]/90 border-b border-[hsl(var(--nexus-border))] px-4 py-3">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold font-[family-name:var(--font-mono)] tracking-tight flex items-center gap-2">
              <Flame className="w-5 h-5 text-red-400" />
              Sports Catalyst Engine
            </h1>
            <p className="text-xs text-[hsl(var(--nexus-text-muted))] font-mono">
              {stats?.breakingNewsCount || 0} news arbs • {stats?.narrativeMismatchCount || 0} mismatches • {stats?.volumeSurgeCount || 0} surges • {stats?.pennyCount || 0} lottos • 48h velocity window • Updated {lastRefresh || "—"}
            </p>
          </div>
          <Button size="sm" onClick={fetchData} disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white font-mono">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-1.5 text-xs">Scan</span>
          </Button>
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

        {/* ─── CATALYST STATS ─── */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="bg-red-500/10 border-red-500/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] font-mono text-red-300 uppercase">📰 Breaking News</p>
                <p className="text-2xl font-bold font-mono text-red-400">{stats.breakingNewsCount}</p>
                <p className="text-[9px] font-mono text-red-300/60">Volume spike + cheap price</p>
              </CardContent>
            </Card>
            <Card className="bg-amber-500/10 border-amber-500/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] font-mono text-amber-300 uppercase">🎯 Mismatches</p>
                <p className="text-2xl font-bold font-mono text-amber-400">{stats.narrativeMismatchCount}</p>
                <p className="text-[9px] font-mono text-amber-300/60">Team fav + cheap prop</p>
              </CardContent>
            </Card>
            <Card className="bg-cyan-500/10 border-cyan-500/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] font-mono text-cyan-300 uppercase">📊 Volume Surges</p>
                <p className="text-2xl font-bold font-mono text-cyan-400">{stats.volumeSurgeCount}</p>
                <p className="text-[9px] font-mono text-cyan-300/60">Smart money loading</p>
              </CardContent>
            </Card>
            <Card className="bg-yellow-500/10 border-yellow-500/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] font-mono text-yellow-300 uppercase">🎲 Lottos</p>
                <p className="text-2xl font-bold font-mono text-yellow-400">{stats.pennyCount}</p>
                <p className="text-[9px] font-mono text-yellow-300/60">≤12¢ high-ROI</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── KILL-SWITCH ─── */}
        {killAlerts.length > 0 && (
          <Alert className="bg-red-500/15 border-red-500/50 animate-pulse">
            <Shield className="h-4 w-4 text-red-400" />
            <AlertTitle className="text-red-400 font-mono text-sm font-bold">🚨 BINARY CLIFF — SELL 75% NOW</AlertTitle>
            <AlertDescription className="text-red-300/80 font-mono text-xs mt-1 space-y-1">
              {killAlerts.map(d => (
                <p key={d.ticker}>{d.title} — {(d.price * 100).toFixed(0)}¢ with {formatTimeTo(d.hours)} left</p>
              ))}
            </AlertDescription>
          </Alert>
        )}

        {/* ─── TOP CATALYSTS — Breaking News & Narrative Mismatches ─── */}
        {topCatalysts.length > 0 && (
          <section>
            <h2 className="text-lg font-bold font-[family-name:var(--font-mono)] mb-1 flex items-center gap-2">
              <Target className="w-5 h-5 text-red-400" />
              Active Catalysts — News Arb & Narrative Mismatches
            </h2>
            <p className="text-xs text-[hsl(var(--nexus-text-muted))] font-mono mb-4">
              Real-world events that haven't been priced in yet. Volume leading price.
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {topCatalysts.map((m) => {
                const cat = getCatalystLabel(m.catalyst_type);
                const priceCents = Math.round(m.yes_price * 100);
                const maxROI = m.yes_price > 0 ? Math.round((1 / m.yes_price - 1) * 100) : 0;
                return (
                  <a key={m.ticker} href={kalshiUrl(m)} target="_blank" rel="noopener noreferrer" className="block group">
                    <Card className={`${cat.bg} hover:ring-1 hover:ring-red-500/40 transition-all h-full`}>
                      <CardContent className="p-4 space-y-3">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{m.icon}</span>
                            <Badge variant="outline" className="font-mono text-[10px] border-[hsl(var(--nexus-border))] text-[hsl(var(--nexus-text-muted))]">
                              {m.sport}
                            </Badge>
                            {m.is_prop && <Badge variant="outline" className="font-mono text-[9px] border-purple-500/40 text-purple-400">PROP</Badge>}
                            {m.is_spread && <Badge variant="outline" className="font-mono text-[9px] border-cyan-500/40 text-cyan-400">SPREAD</Badge>}
                          </div>
                          <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-0.5 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            <Timer className="w-3 h-3" /> {formatTimeTo(m.time_to_event_hours)}
                          </span>
                        </div>

                        {/* Title */}
                        <p className="font-mono text-sm font-semibold leading-tight line-clamp-2">{m.title}</p>
                        <p className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] truncate">{m.event_title}</p>

                        {/* Catalyst type badge */}
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold font-mono ${cat.color}`}>{cat.emoji} {cat.label}</span>
                        </div>

                        {/* Price / Volume / ROI */}
                        <div className="flex items-end justify-between">
                          <div>
                            <p className="text-[10px] text-[hsl(var(--nexus-text-muted))] font-mono">Price</p>
                            <p className={`text-2xl font-bold font-mono ${cat.color}`}>{priceCents}¢</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-[hsl(var(--nexus-text-muted))] font-mono">Volume 24h</p>
                            <p className="text-lg font-bold font-mono text-cyan-400">{m.volume_24h.toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-[hsl(var(--nexus-text-muted))] font-mono">ROI</p>
                            <p className={`text-lg font-bold font-mono ${maxROI >= 500 ? "text-emerald-400" : maxROI >= 100 ? "text-cyan-400" : "text-amber-400"}`}>{maxROI}%</p>
                          </div>
                        </div>

                        {/* Reasoning */}
                        <p className="text-[11px] font-mono leading-relaxed text-[hsl(var(--nexus-text-muted))] line-clamp-3">
                          {m.catalyst_reasoning}
                        </p>

                        {/* Strategy */}
                        <div className="flex items-center justify-between pt-2 border-t border-[hsl(var(--nexus-border))]">
                          <span className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">
                            {m.suggested_bet > 0 ? `Bet: $${m.suggested_bet.toFixed(2)}` : ""}
                          </span>
                          <span className="text-xs font-mono text-red-400 group-hover:text-red-300 flex items-center gap-1 font-bold">
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

        {/* ─── SPORT FILTERS ─── */}
        <section>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={activeSport === "All" ? "default" : "outline"}
              onClick={() => setActiveSport("All")}
              className={`text-xs font-mono ${activeSport === "All" ? "bg-red-600 text-white hover:bg-red-700" : "border-[hsl(var(--nexus-border))] text-[hsl(var(--nexus-text-muted))]"}`}>
              All ({stats?.sportsOnly || 0})
            </Button>
            {sportSummary.map(s => (
              <Button key={s.sport} size="sm" variant={activeSport === s.sport ? "default" : "outline"}
                onClick={() => setActiveSport(s.sport)}
                className={`text-xs font-mono ${activeSport === s.sport ? "bg-red-600 text-white hover:bg-red-700" : "border-[hsl(var(--nexus-border))] text-[hsl(var(--nexus-text-muted))]"}`}>
                {s.icon} {s.sport} ({s.count})
              </Button>
            ))}
          </div>
        </section>

        {/* ─── ALL SPORTS MARKETS TABLE ─── */}
        <section>
          <h2 className="text-lg font-bold font-[family-name:var(--font-mono)] mb-1 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-cyan-400" />
            All Sports Markets
          </h2>
          <p className="text-xs text-[hsl(var(--nexus-text-muted))] font-mono mb-4">
            {markets.length} markets • 48h velocity window • Sorted by catalyst → tip-off time
          </p>

          <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[hsl(var(--nexus-border))] hover:bg-transparent">
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold">MARKET</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold">SPORT</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold text-right">PRICE</TableHead>
                    <TableHead className="font-mono text-[11px] text-red-400 font-semibold">CATALYST</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold">STRATEGY</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold text-right">⏱ TIP-OFF</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold text-right">VOL</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold text-right">OI</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold text-right">ROI</TableHead>
                    <TableHead className="font-mono text-[11px] w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {markets.slice(0, 60).map((m) => {
                    const cat = getCatalystLabel(m.catalyst_type);
                    const maxROI = m.yes_price > 0 ? ((1 / m.yes_price - 1) * 100).toFixed(0) : "∞";
                    return (
                      <TableRow key={m.ticker}
                        className={`border-[hsl(var(--nexus-border))] hover:bg-[hsl(var(--nexus-surface-raised))] cursor-pointer group ${
                          m.catalyst_type === "BREAKING_NEWS_ARB" ? "bg-red-500/8" :
                          m.catalyst_type === "NARRATIVE_MISMATCH" ? "bg-amber-500/8" :
                          m.catalyst_type === "VOLUME_SURGE" ? "bg-cyan-500/5" :
                          m.catalyst_type === "PENNY_CATALYST" ? "bg-yellow-500/5" : ""
                        }`}
                        onClick={() => window.open(kalshiUrl(m), "_blank")}>
                        <TableCell className="max-w-[250px]">
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-semibold truncate">{m.title}</p>
                            <p className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] truncate">{m.event_title}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="text-base">{m.icon}</span>
                            <span className="font-mono text-xs text-[hsl(var(--nexus-text-muted))]">{m.sport}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono text-base font-bold ${cat.color}`}>
                            {(m.yes_price * 100).toFixed(0)}¢
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`font-mono text-xs font-semibold ${cat.color}`}>{cat.emoji} {cat.label}</span>
                        </TableCell>
                        <TableCell className="max-w-[180px]">
                          <p className="font-mono text-[10px] leading-snug text-[hsl(var(--nexus-text-muted))] line-clamp-2">
                            {m.catalyst_strategy}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono text-xs font-bold ${
                            (m.time_to_event_hours || 999) <= 12 ? "text-red-400" :
                            (m.time_to_event_hours || 999) <= 24 ? "text-amber-400" :
                            "text-[hsl(var(--nexus-text-muted))]"
                          }`}>
                            {formatTimeTo(m.time_to_event_hours)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono text-xs ${m.volume_24h > 100 ? "text-cyan-400 font-bold" : "text-[hsl(var(--nexus-text-muted))]"}`}>
                            {m.volume_24h > 0 ? m.volume_24h.toLocaleString() : "—"}
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
                          <span className="text-red-400 group-hover:text-red-300 transition-colors">
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
              No sports catalysts found in the 48h window. Check back closer to game time.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
