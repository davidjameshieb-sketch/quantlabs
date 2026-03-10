import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  RefreshCw, Loader2, ExternalLink, AlertTriangle,
  Clock, Radar, ArrowRightLeft, Volume2, GitCompareArrows, Info
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface AnomalyRow {
  ticker: string;
  event_ticker: string;
  series_ticker: string;
  title: string;
  event_title: string;
  league: string;
  icon: string;
  is_prop: boolean;
  yes_price: number;
  yes_bid: number;
  yes_ask: number;
  volume_24h: number;
  open_interest: number;
  close_time: string;
  hours_left: number;
  module: string;
  label: string;
  action: string;
  tooltip: string;
  fair_value: number;
  spread_cents: number;
}

interface RadarData {
  wholesale_gaps: AnomalyRow[];
  smoke_alarms: AnomalyRow[];
  narrative_mismatches: AnomalyRow[];
  stats: {
    totalScanned: number;
    wholesaleGapCount: number;
    smokeAlarmCount: number;
    narrativeMismatchCount: number;
    totalAnomalies: number;
  };
  leagues: string[];
  timestamp: string;
}

// ─── Helpers ────────────────────────────────────────────────────

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

// ─── Anomaly Card ───────────────────────────────────────────────

function AnomalyCard({ m }: { m: AnomalyRow }) {
  const priceCents = Math.round(m.yes_price * 100);
  const fvCents = Math.round(m.fair_value * 100);

  return (
    <a href={kalshiUrl(m)} target="_blank" rel="noopener noreferrer" className="block group">
      <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))] hover:border-[hsl(var(--nexus-text-muted))] transition-all h-full">
        <CardContent className="p-4 space-y-3">
          {/* League + Time */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{m.icon}</span>
              <Badge variant="outline" className="font-mono text-[10px] border-[hsl(var(--nexus-border))] text-[hsl(var(--nexus-text-muted))]">
                {m.league}
              </Badge>
              {m.is_prop && <Badge variant="outline" className="font-mono text-[9px] border-purple-500/40 text-purple-400">PROP</Badge>}
            </div>
            <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-0.5 bg-emerald-500/10 px-1.5 py-0.5 rounded">
              <Clock className="w-3 h-3" /> {formatTimeTo(m.hours_left)}
            </span>
          </div>

          {/* Title */}
          <p className="font-mono text-sm font-semibold leading-tight line-clamp-2">{m.title}</p>
          <p className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] truncate">{m.event_title}</p>

          {/* Price row */}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] text-[hsl(var(--nexus-text-muted))] font-mono">Price</p>
              <p className="text-2xl font-bold font-mono">{priceCents}¢</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-[hsl(var(--nexus-text-muted))] font-mono">FV</p>
              <p className="text-lg font-bold font-mono text-cyan-400">{fvCents}¢</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-[hsl(var(--nexus-text-muted))] font-mono">Spread</p>
              <p className="text-lg font-bold font-mono text-amber-400">{m.spread_cents}¢</p>
            </div>
          </div>

          {/* Vol / OI */}
          <div className="flex gap-4 text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">
            <span>Vol: {m.volume_24h > 0 ? m.volume_24h.toLocaleString() : "—"}</span>
            <span>OI: {m.open_interest > 0 ? m.open_interest.toLocaleString() : "—"}</span>
          </div>

          {/* Action */}
          <div className="flex items-center justify-between pt-2 border-t border-[hsl(var(--nexus-border))]">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs font-mono text-amber-300 cursor-help flex items-center gap-1">
                    <Info className="w-3 h-3" /> {m.action.slice(0, 50)}{m.action.length > 50 ? "…" : ""}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs font-mono">
                  {m.tooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span className="text-xs font-mono text-red-400 group-hover:text-red-300 flex items-center gap-1">
              Kalshi <ExternalLink className="w-3 h-3" />
            </span>
          </div>
        </CardContent>
      </Card>
    </a>
  );
}

// ─── Module Column ──────────────────────────────────────────────

function ModuleColumn({
  title,
  icon,
  color,
  description,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  color: string;
  description: string;
  items: AnomalyRow[];
}) {
  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 border-b pb-2 ${color}`}>
        {icon}
        <div>
          <h2 className="text-sm font-bold font-mono">{title}</h2>
          <p className="text-[10px] font-mono opacity-60">{description}</p>
        </div>
        <Badge variant="outline" className={`ml-auto font-mono text-xs ${color} border-current`}>
          {items.length}
        </Badge>
      </div>

      {items.length === 0 ? (
        <p className="text-center text-[hsl(var(--nexus-text-muted))] font-mono py-6 text-xs">
          No anomalies detected.
        </p>
      ) : (
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          {items.map((m) => (
            <AnomalyCard key={m.ticker} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────

export default function UniversalAlpha() {
  const [data, setData] = useState<RadarData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState("");
  const [activeLeague, setActiveLeague] = useState("All");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: err } = await supabase.functions.invoke("universal-alpha-scanner", {
        body: { league: activeLeague },
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
  }, [activeLeague]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const iv = setInterval(fetchData, 60000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const stats = data?.stats;

  return (
    <div className="min-h-screen bg-[hsl(var(--nexus-bg))] text-[hsl(var(--nexus-text-primary))]">
      {/* ─── HEADER ─── */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[hsl(var(--nexus-bg))]/90 border-b border-[hsl(var(--nexus-border))] px-4 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold font-[family-name:var(--font-mono)] tracking-tight flex items-center gap-2">
              <Radar className="w-5 h-5 text-amber-400" />
              Anomaly Radar
            </h1>
            <p className="text-xs text-[hsl(var(--nexus-text-muted))] font-mono">
              NBA · PGA · NRL only • 48h window • {stats?.totalAnomalies || 0} anomalies detected • Updated {lastRefresh || "—"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* League filters */}
            {["All", "NBA", "PGA", "NRL"].map(league => (
              <Button key={league} size="sm" variant={activeLeague === league ? "default" : "outline"}
                onClick={() => setActiveLeague(league)}
                className={`text-xs font-mono ${activeLeague === league ? "bg-amber-600 text-white hover:bg-amber-700" : "border-[hsl(var(--nexus-border))] text-[hsl(var(--nexus-text-muted))]"}`}>
                {league === "NBA" ? "🏀" : league === "PGA" ? "⛳" : league === "NRL" ? "🏉" : ""} {league}
              </Button>
            ))}
            <Button size="sm" onClick={fetchData} disabled={loading}
              className="bg-amber-600 hover:bg-amber-700 text-white font-mono ml-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span className="ml-1.5 text-xs">Scan</span>
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <Alert className="m-4 max-w-[1600px] mx-auto bg-red-500/10 border-red-500/40">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertTitle className="text-red-400 font-mono">Error</AlertTitle>
          <AlertDescription className="text-red-300 font-mono text-sm">{error}</AlertDescription>
        </Alert>
      )}

      <div className="max-w-[1600px] mx-auto p-4">
        {/* ─── STATS BAR ─── */}
        {stats && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))] uppercase">Scanned</p>
                <p className="text-2xl font-bold font-mono">{stats.totalScanned}</p>
              </CardContent>
            </Card>
            <Card className="bg-cyan-500/10 border-cyan-500/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] font-mono text-cyan-300 uppercase">Wide Spreads</p>
                <p className="text-2xl font-bold font-mono text-cyan-400">{stats.wholesaleGapCount}</p>
              </CardContent>
            </Card>
            <Card className="bg-red-500/10 border-red-500/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] font-mono text-red-300 uppercase">Volume Spikes</p>
                <p className="text-2xl font-bold font-mono text-red-400">{stats.smokeAlarmCount}</p>
              </CardContent>
            </Card>
            <Card className="bg-amber-500/10 border-amber-500/30">
              <CardContent className="p-3 text-center">
                <p className="text-[10px] font-mono text-amber-300 uppercase">Prop Mismatches</p>
                <p className="text-2xl font-bold font-mono text-amber-400">{stats.narrativeMismatchCount}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ─── 3-COLUMN RADAR ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ModuleColumn
            title="Wide Spreads (Wholesale)"
            icon={<ArrowRightLeft className="w-5 h-5" />}
            color="text-cyan-400"
            description="Bid/Ask spread > 12¢ — place limit at midpoint"
            items={data?.wholesale_gaps || []}
          />
          <ModuleColumn
            title="Volume Spikes (News Check)"
            icon={<Volume2 className="w-5 h-5" />}
            color="text-red-400"
            description="300%+ volume vs OI on cheap NBA props"
            items={data?.smoke_alarms || []}
          />
          <ModuleColumn
            title="Prop Mismatches"
            icon={<GitCompareArrows className="w-5 h-5" />}
            color="text-amber-400"
            description="Team >75¢ favorite but star prop <45¢"
            items={data?.narrative_mismatches || []}
          />
        </div>

        {data && stats?.totalAnomalies === 0 && (
          <p className="text-center text-[hsl(var(--nexus-text-muted))] font-mono py-12 text-sm">
            No order-book anomalies detected across NBA, PGA, NRL in the 48h window. Check back closer to game time.
          </p>
        )}
      </div>
    </div>
  );
}
