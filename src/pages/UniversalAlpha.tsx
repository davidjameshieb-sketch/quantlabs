import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  RefreshCw, Loader2, AlertTriangle, Timer, CheckCircle2, Radar
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface BreakingNewsRow {
  league: string; market: string; start_time: string | null; url: string;
  resolution: string; kalshi_ask_cents: number; real_world_cents: number | null;
  vol_oi_ratio: string; context: string; time_flag: string | null;
}

interface WholesaleRow {
  league: string; market: string; start_time: string | null; url: string;
  resolution: string; kalshi_bid_cents: number; kalshi_ask_cents: number;
  real_world_cents: number | null; spread_width: number; time_flag: string | null;
}

interface NarrativeRow {
  league: string; market: string; start_time: string | null; url: string;
  resolution: string; team_win_cents: number; player_prop_cents: number;
  real_world_cents: number | null; price_gap: number; time_flag: string | null;
}

interface DebugRow {
  ticker?: string; league: string; title: string; url?: string;
  bid: number; ask: number; midpoint?: number; spread: number;
  vol24h: number; oi: number; hours: number | null; flag: string | null;
}

interface FeedData {
  breaking_news: BreakingNewsRow[];
  wholesale_spreads: WholesaleRow[];
  narrative_correlation: NarrativeRow[];
  debug_board: DebugRow[];
  stats: {
    totalScanned: number; whitelistedCount: number;
    breakingNewsCount: number; wholesaleSpreadCount: number;
    narrativeCorrelationCount: number; totalAnomalies: number;
  };
  next_catalyst: { close_time: string; league: string; hours_left: number } | null;
  leagues: string[];
  timestamp: string;
}

// ─── 10-Minute Tape Types ───────────────────────────────────────

interface TapeSnapshot {
  midpoint: number;
  vol24h: number;
  ts: number; // Date.now()
}

interface TapeMetrics {
  priceDelta: number | null;  // cents moved in 10 min
  volSpike: number | null;    // contracts in 10 min window
  isWhale: boolean;           // |Δ| >= 3 AND volSpike >= 500
}

// ─── Helpers ────────────────────────────────────────────────────

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
  });
}

function leagueIcon(l: string): string {
  return l === "NBA" ? "🏀" : l === "PGA" ? "⛳" : l === "NRL" ? "🏉" : "🏆";
}

const TAPE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function computeTapeMetrics(
  ticker: string,
  currentMidpoint: number,
  currentVol: number,
  tapeHistory: Map<string, TapeSnapshot[]>
): TapeMetrics {
  const history = tapeHistory.get(ticker);
  if (!history || history.length < 2) return { priceDelta: null, volSpike: null, isWhale: false };

  const now = Date.now();
  const cutoff = now - TAPE_WINDOW_MS;

  // Find oldest snapshot within window
  const oldSnapshots = history.filter(s => s.ts <= cutoff + 15000); // 15s grace
  const oldest = oldSnapshots.length > 0 ? oldSnapshots[oldSnapshots.length - 1] : history[0];

  const priceDelta = currentMidpoint - oldest.midpoint;
  const volSpike = currentVol - oldest.vol24h;

  const isWhale = Math.abs(priceDelta) >= 3 && volSpike >= 500;

  return { priceDelta, volSpike: volSpike > 0 ? volSpike : 0, isWhale };
}

// ─── Countdown Hook ─────────────────────────────────────────────

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

// ─── Component ──────────────────────────────────────────────────

export default function UniversalAlpha() {
  const [data, setData] = useState<FeedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState("");
  const [activeLeague, setActiveLeague] = useState("All");
  const [pollCount, setPollCount] = useState(0);

  // Rolling 10-minute tape: ticker -> array of snapshots
  const tapeHistoryRef = useRef<Map<string, TapeSnapshot[]>>(new Map());
  // Computed metrics per ticker
  const [tapeMetrics, setTapeMetrics] = useState<Map<string, TapeMetrics>>(new Map());

  const countdown = useCountdown(data?.next_catalyst?.close_time || null);

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

      // ─── Record tape snapshot ─────────────────────────────
      const now = Date.now();
      const tape = tapeHistoryRef.current;
      const newMetrics = new Map<string, TapeMetrics>();

      if (res?.debug_board) {
        for (const row of res.debug_board as DebugRow[]) {
          if (!row.ticker) continue;
          const midpoint = row.midpoint ?? Math.round((row.bid + row.ask) / 2);
          const snapshot: TapeSnapshot = { midpoint, vol24h: row.vol24h, ts: now };

          // Append to history
          const history = tape.get(row.ticker) || [];
          history.push(snapshot);

          // Prune snapshots older than 12 minutes (keep buffer)
          const cutoff = now - 12 * 60 * 1000;
          const pruned = history.filter(s => s.ts >= cutoff);
          tape.set(row.ticker, pruned);

          // Compute metrics
          newMetrics.set(row.ticker, computeTapeMetrics(row.ticker, midpoint, row.vol24h, tape));
        }
      }

      setTapeMetrics(newMetrics);
      setPollCount(c => c + 1);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [activeLeague]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Poll every 60 seconds for the tape
  useEffect(() => {
    const iv = setInterval(fetchData, 60000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const stats = data?.stats;
  const nc = data?.next_catalyst;

  const cellClass = "p-1.5 text-left whitespace-nowrap";
  const headerClass = "p-1.5 text-left font-bold text-[hsl(var(--nexus-text-muted))] uppercase tracking-wider";

  // Count whale alerts
  const whaleCount = Array.from(tapeMetrics.values()).filter(m => m.isWhale).length;

  // Helper to get tape metrics for a ticker
  const getTape = (ticker?: string): TapeMetrics | null => {
    if (!ticker) return null;
    return tapeMetrics.get(ticker) || null;
  };

  // Format delta with color
  const fmtDelta = (delta: number | null) => {
    if (delta === null) return <span className="text-[hsl(var(--nexus-text-muted))]">…</span>;
    const color = delta > 0 ? "text-emerald-400" : delta < 0 ? "text-red-400" : "text-[hsl(var(--nexus-text-muted))]";
    const sign = delta > 0 ? "+" : "";
    return <span className={`font-bold ${color}`}>{sign}{delta}¢</span>;
  };

  const fmtVolSpike = (vol: number | null) => {
    if (vol === null) return <span className="text-[hsl(var(--nexus-text-muted))]">…</span>;
    return <span className={`font-bold ${vol >= 500 ? "text-amber-400" : "text-[hsl(var(--nexus-text-primary))]"}`}>{vol.toLocaleString()}</span>;
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--nexus-bg))] text-[hsl(var(--nexus-text-primary))] font-mono text-xs">
      {/* ─── HEADER ─── */}
      <div className="sticky top-0 z-50 backdrop-blur-xl bg-[hsl(var(--nexus-bg))]/90 border-b border-[hsl(var(--nexus-border))] px-4 py-3">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-base font-bold flex items-center gap-2">
              <Radar className="w-4 h-4 text-amber-400" />
              Machine-Readable Intelligence Feed
            </h1>
            <p className="text-[10px] text-[hsl(var(--nexus-text-muted))]">
              48h window + Smart Money • {stats?.whitelistedCount || 0} tracked • {stats?.totalAnomalies || 0} triggers
              {whaleCount > 0 && <span className="text-red-400 font-bold ml-2">🐋 {whaleCount} WHALE ALERT{whaleCount > 1 ? "S" : ""}</span>}
              <span className="ml-2">• Poll #{pollCount} • {lastRefresh || "—"}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {["All", "NBA", "PGA", "NRL"].map(league => (
              <Button key={league} size="sm" variant={activeLeague === league ? "default" : "outline"}
                onClick={() => setActiveLeague(league)}
                className={`text-[10px] h-7 font-mono ${activeLeague === league ? "bg-amber-600 text-white hover:bg-amber-700" : "border-[hsl(var(--nexus-border))] text-[hsl(var(--nexus-text-muted))]"}`}>
                {league === "All" ? "" : leagueIcon(league) + " "}{league}
              </Button>
            ))}
            <Button size="sm" onClick={fetchData} disabled={loading}
              className="bg-amber-600 hover:bg-amber-700 text-white font-mono h-7 text-[10px] ml-2">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              <span className="ml-1">Scan</span>
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <Alert className="m-4 max-w-[1800px] mx-auto bg-red-500/10 border-red-500/40">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertTitle className="text-red-400 font-mono text-xs">Error</AlertTitle>
          <AlertDescription className="text-red-300 font-mono text-[10px]">{error}</AlertDescription>
        </Alert>
      )}

      <div className="max-w-[1800px] mx-auto p-4 space-y-6">
        {/* ─── COUNTDOWN ─── */}
        {data && (
          <div className="border border-[hsl(var(--nexus-border))] p-3 rounded">
            {nc ? (
              <div className="flex items-center gap-4">
                <Timer className="w-5 h-5 text-amber-400 animate-pulse shrink-0" />
                <div>
                  <span className="text-[10px] text-amber-300/70 uppercase">Next Tip-Off / Tee Time</span>
                  <span className="text-lg font-bold text-amber-400 tabular-nums ml-3">{countdown}</span>
                  <span className="ml-3 text-[10px] text-[hsl(var(--nexus-text-muted))]">
                    {leagueIcon(nc.league)} {nc.league} — {fmtTime(nc.close_time)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="text-emerald-400 font-bold">Radar Clear: Awaiting Volume Catalysts</span>
                <span className="text-[hsl(var(--nexus-text-muted))]">
                  — Scanning {stats?.totalScanned || 0} markets. No qualifying NBA/PGA/NRL events in window.
                </span>
              </div>
            )}
          </div>
        )}

        {/* ─── TAPE STATUS ─── */}
        {pollCount > 0 && (
          <div className="flex items-center gap-4 text-[10px] text-[hsl(var(--nexus-text-muted))] border border-[hsl(var(--nexus-border))]/50 p-2 rounded">
            <span className="text-emerald-400 font-bold">📼 10-MIN TAPE ACTIVE</span>
            <span>Polling every 60s • {pollCount} snapshot{pollCount !== 1 ? "s" : ""} recorded</span>
            <span>• {tapeHistoryRef.current.size} tickers tracked</span>
            {pollCount < 10 && <span className="text-amber-400">• Warming up ({Math.min(10, Math.round(pollCount * 60 / 60))} of 10 min)</span>}
          </div>
        )}

        {/* ─── STATS ─── */}
        {stats && (
          <div className="flex gap-6 text-[10px] text-[hsl(var(--nexus-text-muted))] border-b border-[hsl(var(--nexus-border))] pb-2">
            <span>Scanned: <strong className="text-[hsl(var(--nexus-text-primary))]">{stats.totalScanned}</strong></span>
            <span>Whitelisted: <strong className="text-emerald-400">{stats.whitelistedCount}</strong></span>
            <span>Breaking News: <strong className="text-red-400">{stats.breakingNewsCount}</strong></span>
            <span>Wholesale: <strong className="text-cyan-400">{stats.wholesaleSpreadCount}</strong></span>
            <span>Narrative: <strong className="text-amber-400">{stats.narrativeCorrelationCount}</strong></span>
          </div>
        )}

        {/* ─── TABLE 1: BREAKING NEWS FEED ─── */}
        <div>
          <h2 className="text-sm font-bold text-red-400 mb-2 border-b border-red-500/30 pb-1">
            TABLE 1: Breaking News Feed — 24h Vol &gt; 100% OI, Ask &lt; 50¢
          </h2>
          {data?.breaking_news && data.breaking_news.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[hsl(var(--nexus-border))] text-[10px]">
                    <th className={headerClass}>League</th>
                    <th className={headerClass}>Market Name</th>
                    <th className={headerClass}>Bid/Ask</th>
                    <th className={headerClass}>10m Δ</th>
                    <th className={headerClass}>10m Vol</th>
                    <th className={headerClass}>OI</th>
                    <th className={headerClass}>Start Time</th>
                    <th className={headerClass}>URL</th>
                    <th className={headerClass}>Vol/OI</th>
                    <th className={headerClass}>Context</th>
                  </tr>
                </thead>
                <tbody>
                  {data.breaking_news.map((r, i) => {
                    // Try to find tape metrics via matching debug board ticker
                    const matchingDebug = data.debug_board?.find(d => d.title === r.market);
                    const tape = getTape(matchingDebug?.ticker);
                    const isWhale = tape?.isWhale || false;
                    return (
                      <tr key={i} className={`border-b border-[hsl(var(--nexus-border))]/20 hover:bg-[hsl(var(--nexus-surface))] ${isWhale ? "bg-red-500/10 border-l-2 border-l-red-500" : ""}`}>
                        <td className={cellClass}>
                          {leagueIcon(r.league)} {r.league}
                          {isWhale && <Badge className="ml-1 bg-red-600 text-white text-[8px] px-1 py-0">🐋 WHALE</Badge>}
                        </td>
                        <td className={`${cellClass} max-w-[200px] truncate`}>{r.market}{r.time_flag ? ` [${r.time_flag}]` : ""}</td>
                        <td className={`${cellClass} font-bold`}>{r.kalshi_ask_cents}¢</td>
                        <td className={cellClass}>{fmtDelta(tape?.priceDelta ?? null)}</td>
                        <td className={cellClass}>{fmtVolSpike(tape?.volSpike ?? null)}</td>
                        <td className={cellClass}>{matchingDebug?.oi?.toLocaleString() || "—"}</td>
                        <td className={cellClass}>{fmtTime(r.start_time)}</td>
                        <td className={cellClass}><a href={r.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Link</a></td>
                        <td className={`${cellClass} text-red-400 font-bold`}>{r.vol_oi_ratio}</td>
                        <td className={`${cellClass} max-w-[200px] truncate text-[hsl(var(--nexus-text-muted))]`}>{r.context}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[hsl(var(--nexus-text-muted))] py-2">No triggers.</p>
          )}
        </div>

        {/* ─── TABLE 2: WHOLESALE SPREAD FEED ─── */}
        <div>
          <h2 className="text-sm font-bold text-cyan-400 mb-2 border-b border-cyan-500/30 pb-1">
            TABLE 2: Wholesale Spread Feed — OI &gt; 1,000, Vol &lt; 500, Spread &gt; 4¢
          </h2>
          {data?.wholesale_spreads && data.wholesale_spreads.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[hsl(var(--nexus-border))] text-[10px]">
                    <th className={headerClass}>League</th>
                    <th className={headerClass}>Market Name</th>
                    <th className={headerClass}>Bid/Ask</th>
                    <th className={headerClass}>10m Δ</th>
                    <th className={headerClass}>10m Vol</th>
                    <th className={headerClass}>OI</th>
                    <th className={headerClass}>Start Time</th>
                    <th className={headerClass}>URL</th>
                    <th className={headerClass}>Spread</th>
                  </tr>
                </thead>
                <tbody>
                  {data.wholesale_spreads.map((r, i) => {
                    const matchingDebug = data.debug_board?.find(d => d.title === r.market);
                    const tape = getTape(matchingDebug?.ticker);
                    const isWhale = tape?.isWhale || false;
                    return (
                      <tr key={i} className={`border-b border-[hsl(var(--nexus-border))]/20 hover:bg-[hsl(var(--nexus-surface))] ${isWhale ? "bg-red-500/10 border-l-2 border-l-red-500" : ""}`}>
                        <td className={cellClass}>
                          {leagueIcon(r.league)} {r.league}
                          {isWhale && <Badge className="ml-1 bg-red-600 text-white text-[8px] px-1 py-0">🐋 WHALE</Badge>}
                        </td>
                        <td className={`${cellClass} max-w-[200px] truncate`}>{r.market}{r.time_flag ? ` [${r.time_flag}]` : ""}</td>
                        <td className={`${cellClass} font-bold`}>{r.kalshi_bid_cents}/{r.kalshi_ask_cents}¢</td>
                        <td className={cellClass}>{fmtDelta(tape?.priceDelta ?? null)}</td>
                        <td className={cellClass}>{fmtVolSpike(tape?.volSpike ?? null)}</td>
                        <td className={cellClass}>{matchingDebug?.oi?.toLocaleString() || "—"}</td>
                        <td className={cellClass}>{fmtTime(r.start_time)}</td>
                        <td className={cellClass}><a href={r.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Link</a></td>
                        <td className={`${cellClass} text-cyan-400 font-bold`}>{r.spread_width}¢</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[hsl(var(--nexus-text-muted))] py-2">No triggers.</p>
          )}
        </div>

        {/* ─── TABLE 3: NARRATIVE CORRELATION FEED ─── */}
        <div>
          <h2 className="text-sm font-bold text-amber-400 mb-2 border-b border-amber-500/30 pb-1">
            TABLE 3: Narrative Correlation Feed — Team &gt; 70¢, Player Prop &lt; 40¢
          </h2>
          {data?.narrative_correlation && data.narrative_correlation.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[hsl(var(--nexus-border))] text-[10px]">
                    <th className={headerClass}>League</th>
                    <th className={headerClass}>Market Name</th>
                    <th className={headerClass}>Start Time</th>
                    <th className={headerClass}>URL</th>
                    <th className={headerClass}>Resolution</th>
                    <th className={headerClass}>Team Win ¢</th>
                    <th className={headerClass}>Player Prop ¢</th>
                    <th className={headerClass}>Real-World ¢</th>
                    <th className={headerClass}>Price Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {data.narrative_correlation.map((r, i) => (
                    <tr key={i} className="border-b border-[hsl(var(--nexus-border))]/20 hover:bg-[hsl(var(--nexus-surface))]">
                      <td className={cellClass}>{leagueIcon(r.league)} {r.league}</td>
                      <td className={`${cellClass} max-w-[250px] truncate`}>{r.market}{r.time_flag ? ` [${r.time_flag}]` : ""}</td>
                      <td className={cellClass}>{fmtTime(r.start_time)}</td>
                      <td className={cellClass}><a href={r.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Link</a></td>
                      <td className={`${cellClass} max-w-[150px] truncate`}>{r.resolution || "—"}</td>
                      <td className={`${cellClass} font-bold`}>{r.team_win_cents}¢</td>
                      <td className={`${cellClass} font-bold`}>{r.player_prop_cents}¢</td>
                      <td className={`${cellClass} font-bold text-amber-400`}>{r.real_world_cents !== null ? `${r.real_world_cents}¢` : "—"}</td>
                      <td className={`${cellClass} text-amber-400 font-bold`}>{r.price_gap}¢</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[hsl(var(--nexus-text-muted))] py-2">No triggers.</p>
          )}
        </div>

        {/* ─── DEBUG BOARD (with 10-min tape) ─── */}
        {data?.debug_board && data.debug_board.length > 0 && (
          <div>
            <h2 className="text-[10px] font-bold text-[hsl(var(--nexus-text-muted))] mb-2 border-b border-[hsl(var(--nexus-border))] pb-1 uppercase tracking-wider">
              Board Sample — Top {data.debug_board.length} Whitelisted Markets by Spread
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="border-b border-[hsl(var(--nexus-border))]">
                    <th className={headerClass}>League</th>
                    <th className={headerClass}>Market</th>
                    <th className={headerClass}>Bid/Ask ¢</th>
                    <th className={headerClass}>Mid ¢</th>
                    <th className={headerClass}>10m Δ</th>
                    <th className={headerClass}>10m Vol</th>
                    <th className={headerClass}>Spread ¢</th>
                    <th className={headerClass}>OI</th>
                    <th className={headerClass}>Hours</th>
                    <th className={headerClass}>Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {data.debug_board.map((r, i) => {
                    const tape = getTape(r.ticker);
                    const isWhale = tape?.isWhale || false;
                    return (
                      <tr key={i} className={`border-b border-[hsl(var(--nexus-border))]/20 hover:bg-[hsl(var(--nexus-surface))] ${isWhale ? "bg-red-500/10" : ""}`}>
                        <td className={cellClass}>
                          {leagueIcon(r.league)} {r.league}
                          {isWhale && <Badge className="ml-1 bg-red-600 text-white text-[8px] px-1 py-0">🐋</Badge>}
                        </td>
                        <td className={`${cellClass} max-w-[250px] truncate`}>
                          {r.url ? (
                            <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">{r.title}</a>
                          ) : r.title}
                        </td>
                        <td className={cellClass}>{r.bid}/{r.ask}¢</td>
                        <td className={`${cellClass} font-bold`}>{r.midpoint ?? Math.round((r.bid + r.ask) / 2)}¢</td>
                        <td className={cellClass}>{fmtDelta(tape?.priceDelta ?? null)}</td>
                        <td className={cellClass}>{fmtVolSpike(tape?.volSpike ?? null)}</td>
                        <td className={`${cellClass} text-cyan-400 font-bold`}>{r.spread}¢</td>
                        <td className={cellClass}>{r.oi.toLocaleString()}</td>
                        <td className={cellClass}>{r.hours !== null ? (r.hours < 24 ? `${Math.round(r.hours)}h` : `${Math.floor(r.hours / 24)}d`) : "—"}</td>
                        <td className={cellClass}>{isWhale ? <span className="text-red-400 font-bold">🐋 WHALE ALERT</span> : (r.flag || "—")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
