import { useState, useEffect, useCallback } from "react";
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
  league: string; title: string; bid: number; ask: number; spread: number;
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
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [activeLeague]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const iv = setInterval(fetchData, 90000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const stats = data?.stats;
  const nc = data?.next_catalyst;

  const cellClass = "p-1.5 text-left whitespace-nowrap";
  const headerClass = "p-1.5 text-left font-bold text-[hsl(var(--nexus-text-muted))] uppercase tracking-wider";

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
              48h window + Smart Money • {stats?.whitelistedCount || 0} tracked • {stats?.totalAnomalies || 0} triggers • {lastRefresh || "—"}
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
            TABLE 1: Breaking News Feed — 24h Vol &gt; 300% OI, Ask &lt; 50¢
          </h2>
          {data?.breaking_news && data.breaking_news.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[hsl(var(--nexus-border))] text-[10px]">
                    <th className={headerClass}>League</th>
                    <th className={headerClass}>Market Name</th>
                    <th className={headerClass}>Start Time</th>
                    <th className={headerClass}>URL</th>
                    <th className={headerClass}>Resolution</th>
                    <th className={headerClass}>Kalshi Ask ¢</th>
                    <th className={headerClass}>Real-World ¢</th>
                    <th className={headerClass}>Vol/OI</th>
                    <th className={headerClass}>Context</th>
                  </tr>
                </thead>
                <tbody>
                  {data.breaking_news.map((r, i) => (
                    <tr key={i} className="border-b border-[hsl(var(--nexus-border))]/20 hover:bg-[hsl(var(--nexus-surface))]">
                      <td className={cellClass}>{leagueIcon(r.league)} {r.league}</td>
                      <td className={`${cellClass} max-w-[250px] truncate`}>{r.market}{r.time_flag ? ` [${r.time_flag}]` : ""}</td>
                      <td className={cellClass}>{fmtTime(r.start_time)}</td>
                      <td className={cellClass}><a href={r.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Link</a></td>
                      <td className={`${cellClass} max-w-[150px] truncate`}>{r.resolution || "—"}</td>
                      <td className={`${cellClass} font-bold`}>{r.kalshi_ask_cents}¢</td>
                      <td className={`${cellClass} font-bold text-amber-400`}>{r.real_world_cents !== null ? `${r.real_world_cents}¢` : "—"}</td>
                      <td className={`${cellClass} text-red-400 font-bold`}>{r.vol_oi_ratio}</td>
                      <td className={`${cellClass} max-w-[200px] truncate text-[hsl(var(--nexus-text-muted))]`}>{r.context}</td>
                    </tr>
                  ))}
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
            TABLE 2: Wholesale Spread Feed — OI &gt; 2,000, Vol &lt; 500, Spread &gt; 6¢
          </h2>
          {data?.wholesale_spreads && data.wholesale_spreads.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[hsl(var(--nexus-border))] text-[10px]">
                    <th className={headerClass}>League</th>
                    <th className={headerClass}>Market Name</th>
                    <th className={headerClass}>Start Time</th>
                    <th className={headerClass}>URL</th>
                    <th className={headerClass}>Resolution</th>
                    <th className={headerClass}>Kalshi Bid ¢</th>
                    <th className={headerClass}>Kalshi Ask ¢</th>
                    <th className={headerClass}>Real-World ¢</th>
                    <th className={headerClass}>Spread</th>
                  </tr>
                </thead>
                <tbody>
                  {data.wholesale_spreads.map((r, i) => (
                    <tr key={i} className="border-b border-[hsl(var(--nexus-border))]/20 hover:bg-[hsl(var(--nexus-surface))]">
                      <td className={cellClass}>{leagueIcon(r.league)} {r.league}</td>
                      <td className={`${cellClass} max-w-[250px] truncate`}>{r.market}{r.time_flag ? ` [${r.time_flag}]` : ""}</td>
                      <td className={cellClass}>{fmtTime(r.start_time)}</td>
                      <td className={cellClass}><a href={r.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Link</a></td>
                      <td className={`${cellClass} max-w-[150px] truncate`}>{r.resolution || "—"}</td>
                      <td className={`${cellClass} font-bold`}>{r.kalshi_bid_cents}¢</td>
                      <td className={`${cellClass} font-bold`}>{r.kalshi_ask_cents}¢</td>
                      <td className={`${cellClass} font-bold text-amber-400`}>{r.real_world_cents !== null ? `${r.real_world_cents}¢` : "—"}</td>
                      <td className={`${cellClass} text-cyan-400 font-bold`}>{r.spread_width}¢</td>
                    </tr>
                  ))}
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

        {/* ─── DEBUG BOARD ─── */}
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
                    <th className={headerClass}>Bid ¢</th>
                    <th className={headerClass}>Ask ¢</th>
                    <th className={headerClass}>Spread ¢</th>
                    <th className={headerClass}>Vol24h</th>
                    <th className={headerClass}>OI</th>
                    <th className={headerClass}>Hours</th>
                    <th className={headerClass}>Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {data.debug_board.map((r, i) => (
                    <tr key={i} className="border-b border-[hsl(var(--nexus-border))]/20 hover:bg-[hsl(var(--nexus-surface))]">
                      <td className={cellClass}>{leagueIcon(r.league)} {r.league}</td>
                      <td className={`${cellClass} max-w-[250px] truncate`}>{r.title}</td>
                      <td className={cellClass}>{r.bid}¢</td>
                      <td className={cellClass}>{r.ask}¢</td>
                      <td className={`${cellClass} text-cyan-400 font-bold`}>{r.spread}¢</td>
                      <td className={cellClass}>{r.vol24h}</td>
                      <td className={cellClass}>{r.oi}</td>
                      <td className={cellClass}>{r.hours !== null ? (r.hours < 24 ? `${Math.round(r.hours)}h` : `${Math.floor(r.hours / 24)}d`) : "—"}</td>
                      <td className={cellClass}>{r.flag || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
