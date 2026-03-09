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
  TrendingUp, TrendingDown, Minus, ArrowUpRight, X
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

// ─── Helpers ────────────────────────────────────────────────────

/** Plain-English verdict based on edge type */
function getVerdict(type: string | null, score: number, price: number): { label: string; color: string; emoji: string; explanation: string } {
  const priceCents = (price * 100).toFixed(0);
  const maxROI = price > 0 ? ((1 / price - 1) * 100).toFixed(0) : "∞";

  switch (type) {
    case "MOMENTUM_LOAD":
    case "UNDERDOG_VALUE":
      return { label: "Good Value", color: "text-emerald-400", emoji: "🟢", explanation: `Only ${priceCents}¢ — if this wins you get up to ${maxROI}% return` };
    case "TREND_CONFIRM":
    case "VALUE_ZONE":
      return { label: "Worth Watching", color: "text-cyan-400", emoji: "🔵", explanation: `${priceCents}¢ with trading activity — potential ${maxROI}% return` };
    case "SWEEP_SIGNAL":
      return { label: "Early Mover", color: "text-cyan-400", emoji: "🔵", explanation: `Early buying detected at ${priceCents}¢ — could move up` };
    case "VOLUME_SPIKE":
      return { label: "Unusual Activity", color: "text-amber-400", emoji: "🟡", explanation: `Spike in trading volume at ${priceCents}¢ — something's happening` };
    case "COIN_FLIP":
      return { label: "50/50 Toss-Up", color: "text-yellow-400", emoji: "🟡", explanation: `${priceCents}¢ — basically a coin flip right now` };
    case "FAVORITE":
      return { label: "Likely Winner", color: "text-blue-400", emoji: "🔷", explanation: `${priceCents}¢ — probably wins but only ${maxROI}% return` };
    case "HEAVY_FAVORITE":
      return { label: "Almost Certain", color: "text-slate-400", emoji: "⚪", explanation: `${priceCents}¢ — very likely but tiny ${maxROI}% return` };
    case "MATHEMATICAL_DEATH":
      return { label: "Dead — Sell Now", color: "text-red-400", emoji: "🔴", explanation: `${priceCents}¢ — this isn't going to happen, get out` };
    case "STALE_PRICING":
      return { label: "No Activity", color: "text-red-400", emoji: "🔴", explanation: `Nobody is trading this — stay away` };
    case "SETTLED":
    case "DEAD":
      return { label: "Over", color: "text-slate-500", emoji: "⚫", explanation: `This market is essentially done` };
    case "LOW_LIQUIDITY":
      return { label: "Thin Market", color: "text-orange-400", emoji: "🟠", explanation: `${priceCents}¢ — could be good but hard to buy/sell` };
    default:
      return { label: "Neutral", color: "text-[hsl(var(--nexus-text-muted))]", emoji: "⚪", explanation: `${priceCents}¢ — no strong signal either way` };
  }
}

/** Simple quality rating */
function qualityStars(score: number): string {
  if (score >= 0.5) return "★★★★★";
  if (score >= 0.3) return "★★★★☆";
  if (score >= 0.15) return "★★★☆☆";
  if (score >= 0.05) return "★★☆☆☆";
  if (score > 0) return "★☆☆☆☆";
  return "☆☆☆☆☆";
}

function kalshiUrl(market: MarketRow): string {
  // Kalshi URL format: /markets/{SERIES_TICKER}/{EVENT_TICKER} (uppercase)
  const et = market.event_ticker || "";
  const st = market.series_ticker || "";
  if (st && et) {
    return `https://kalshi.com/markets/${st}/${et}`;
  }
  if (st) {
    return `https://kalshi.com/markets/${st}`;
  }
  // Fallback: extract series from event_ticker
  const match = et.match(/^([A-Z0-9]+)-/i);
  if (match) {
    return `https://kalshi.com/markets/${match[1].toUpperCase()}/${et.toUpperCase()}`;
  }
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
        body: { asset_class: activeClass, confidence: 5, daily_budget: 25 },
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

  // Filter markets
  const markets = (data?.markets || []).filter(m => {
    if (!hideJunk) return true;
    // Hide dead/settled/stale markets
    return m.alpha_type !== "DEAD" && m.alpha_type !== "SETTLED" && m.alpha_type !== "STALE_PRICING" && m.alpha_type !== "MATHEMATICAL_DEATH" && m.yes_price > 0.03 && m.yes_price < 0.95;
  });

  const bestBets = markets.filter(m => m.alpha_score >= 0.15).slice(0, 8);
  const deadPositions = (data?.markets || []).filter(m => m.alpha_type === "MATHEMATICAL_DEATH");

  return (
    <div className="min-h-screen bg-[hsl(var(--nexus-bg))] text-[hsl(var(--nexus-text-primary))]">
      {/* ─── HEADER ─── */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[hsl(var(--nexus-bg))]/90 border-b border-[hsl(var(--nexus-border))] px-4 py-3">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold font-[family-name:var(--font-mono)] tracking-tight">
              Kalshi Market Scanner
            </h1>
            <p className="text-xs text-[hsl(var(--nexus-text-muted))] font-mono">
              {data?.stats.totalMarkets || 0} markets scanned • Updated {lastRefresh || "—"}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs font-mono text-[hsl(var(--nexus-text-muted))]">Hide junk</span>
              <Switch checked={hideJunk} onCheckedChange={setHideJunk} />
            </label>
            <Button size="sm" onClick={fetchData} disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-mono">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="ml-1.5 text-xs">Refresh</span>
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

      <div className="max-w-[1400px] mx-auto p-4 space-y-8">

        {/* ─── BEST BETS ─── */}
        {bestBets.length > 0 && (
          <section>
            <h2 className="text-lg font-bold font-[family-name:var(--font-mono)] mb-1 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              Best Opportunities Right Now
            </h2>
            <p className="text-xs text-[hsl(var(--nexus-text-muted))] font-mono mb-4">
              Markets where price looks too low compared to their chance of winning
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {bestBets.map((m) => {
                const v = getVerdict(m.alpha_type, m.alpha_score, m.yes_price);
                return (
                  <a
                    key={m.ticker}
                    href={kalshiUrl(m)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group"
                  >
                    <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))] hover:border-emerald-500/50 transition-all h-full">
                      <CardContent className="p-4 space-y-3">
                        {/* Category + Rating */}
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="font-mono text-[10px] border-[hsl(var(--nexus-border))] text-[hsl(var(--nexus-text-muted))]">
                            {m.icon} {m.asset_class}
                          </Badge>
                          <span className="text-amber-400 text-xs tracking-wider" title={`Quality: ${(m.alpha_score * 100).toFixed(0)}%`}>
                            {qualityStars(m.alpha_score)}
                          </span>
                        </div>

                        {/* Title */}
                        <p className="font-mono text-sm font-semibold leading-tight line-clamp-2">
                          {m.title}
                        </p>

                        {/* Price + Verdict */}
                        <div className="flex items-end justify-between">
                          <div>
                            <p className="text-xs text-[hsl(var(--nexus-text-muted))] font-mono mb-0.5">Price</p>
                            <p className="text-2xl font-bold font-mono text-emerald-400">
                              {(m.yes_price * 100).toFixed(0)}¢
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-bold font-mono ${v.color}`}>
                              {v.emoji} {v.label}
                            </p>
                          </div>
                        </div>

                        {/* Why */}
                        <p className="text-[11px] font-mono text-[hsl(var(--nexus-text-muted))] leading-relaxed">
                          {v.explanation}
                        </p>

                        {/* CTA */}
                        <div className="flex items-center justify-between pt-2 border-t border-[hsl(var(--nexus-border))]">
                          <span className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">
                            {m.volume_24h > 0 ? `${m.volume_24h} trades today` : "Low activity"}
                          </span>
                          <span className="text-xs font-mono text-cyan-400 group-hover:text-cyan-300 flex items-center gap-1">
                            Trade on Kalshi <ArrowUpRight className="w-3 h-3" />
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

        {/* ─── DEAD POSITIONS WARNING ─── */}
        {deadPositions.length > 0 && (
          <Alert className="bg-red-500/10 border-red-500/40">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <AlertTitle className="text-red-400 font-mono text-sm">
              ⚠️ {deadPositions.length} Dead Market{deadPositions.length > 1 ? "s" : ""} — Sell Immediately
            </AlertTitle>
            <AlertDescription className="text-red-300/80 font-mono text-xs mt-1">
              {deadPositions.map(d => d.title).join(" • ")}
            </AlertDescription>
          </Alert>
        )}

        {/* ─── CATEGORIES ─── */}
        <section>
          <h2 className="text-lg font-bold font-[family-name:var(--font-mono)] mb-3">
            Browse by Category
          </h2>
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
          <h2 className="text-lg font-bold font-[family-name:var(--font-mono)] mb-1">
            All Markets
          </h2>
          <p className="text-xs text-[hsl(var(--nexus-text-muted))] font-mono mb-4">
            {markets.length} markets • Click any row to trade on Kalshi
          </p>

          <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[hsl(var(--nexus-border))] hover:bg-transparent">
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold">MARKET</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold text-right">PRICE</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold">VERDICT</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold text-center">QUALITY</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold text-right">MAX ROI</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold text-right">ACTIVITY</TableHead>
                    <TableHead className="font-mono text-[11px] text-[hsl(var(--nexus-text-muted))] font-semibold w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {markets.slice(0, 50).map((m) => {
                    const v = getVerdict(m.alpha_type, m.alpha_score, m.yes_price);
                    const maxROI = m.yes_price > 0 ? ((1 / m.yes_price - 1) * 100).toFixed(0) : "∞";
                    return (
                      <TableRow key={m.ticker} className="border-[hsl(var(--nexus-border))] hover:bg-[hsl(var(--nexus-surface-raised))] cursor-pointer group"
                        onClick={() => window.open(kalshiUrl(m), "_blank")}>
                        <TableCell className="max-w-[350px]">
                          <div className="flex items-center gap-2">
                            <span className="text-base shrink-0">{m.icon}</span>
                            <div className="min-w-0">
                              <p className="font-mono text-sm font-semibold truncate">{m.title}</p>
                              <p className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] truncate">{m.event_title}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-mono text-base font-bold text-emerald-400">
                            {(m.yes_price * 100).toFixed(0)}¢
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">{v.emoji}</span>
                            <span className={`font-mono text-xs font-semibold ${v.color}`}>{v.label}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-amber-400 text-[11px] tracking-wider font-mono">
                            {qualityStars(m.alpha_score)}
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
                        <TableCell className="text-right">
                          <span className="font-mono text-xs text-[hsl(var(--nexus-text-muted))]">
                            {m.volume_24h > 0 ? m.volume_24h.toLocaleString() : "—"}
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
