import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Trophy, Shield, AlertTriangle, TrendingUp, Target, Zap, RefreshCw, Circle,
  Lock, DollarSign, BarChart3, Crosshair, Activity, Calculator, Eye, Flame
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

type PlayerGridItem = {
  rank: number;
  name: string;
  winnerYes: number;
  winnerNo: number;
  top10Yes: number;
  top10No: number;
  roundLeaderNo: number;
  winnerTicker: string;
  top10Ticker: string;
  winnerVolume: number;
  top10Volume: number;
  winnerOpenInterest: number;
  top10OpenInterest: number;
  leaderLag: { fairValue: number; edge: number; signal: string } | null;
  probWall: { signal: string; discount: number; reasoning: string } | null;
  bet: { suggested: number; reasoning: string };
  estimatedLead: number | null;
};

type EdgeAlert = {
  type: string;
  severity: string;
  signal: string;
  message: string;
  bet?: { suggested: number; reasoning: string };
  player?: string;
};

type GolfData = {
  playerGrid: PlayerGridItem[];
  alerts: EdgeAlert[];
  corridor: { winnerActive: boolean; top10Floor: boolean; roundHedge: boolean; status: string };
  summary: {
    totalGolfMarkets: number;
    winnerMarkets: number;
    top10Markets: number;
    top5Markets: number;
    roundLeaderMarkets: number;
    otherMarkets: number;
    totalGolfEvents: number;
  };
  markets: any[];
  events: any[];
  source: string;
  timestamp: string;
};

// ─── ROI Tracker (localStorage) ─────────────────────────────────

type ROIEntry = {
  id: string;
  player: string;
  market: string;
  entryPrice: number;
  betSize: number;
  timestamp: string;
  closed: boolean;
  exitPrice?: number;
  pnl?: number;
};

function loadROI(): ROIEntry[] {
  try { return JSON.parse(localStorage.getItem("golf_roi_tracker") || "[]"); } catch { return []; }
}
function saveROI(entries: ROIEntry[]) {
  localStorage.setItem("golf_roi_tracker", JSON.stringify(entries));
}

// ─── Component ──────────────────────────────────────────────────

export default function KalshiGolf() {
  const [data, setData] = useState<GolfData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState("");
  const [roiEntries, setRoiEntries] = useState<ROIEntry[]>(loadROI);
  const [betCalcPrice, setBetCalcPrice] = useState("0.50");
  const [betCalcFair, setBetCalcFair] = useState("0.65");
  const [prevPrices, setPrevPrices] = useState<Map<string, number>>(new Map());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: err } = await supabase.functions.invoke("golf-portfolio");
      if (err) throw err;

      // Track price deltas
      if (data?.playerGrid) {
        const pm = new Map<string, number>();
        data.playerGrid.forEach(p => pm.set(p.name, p.winnerYes));
        setPrevPrices(pm);
      }

      setData(res);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(e.message || "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => { fetchData(); }, []);
  useEffect(() => {
    const iv = setInterval(fetchData, 30000);
    return () => clearInterval(iv);
  }, [fetchData]);

  // ROI helpers
  const addROI = (player: string, market: string, price: number, betSize: number) => {
    const entry: ROIEntry = {
      id: Date.now().toString(),
      player,
      market,
      entryPrice: price,
      betSize,
      timestamp: new Date().toISOString(),
      closed: false,
    };
    const updated = [...roiEntries, entry];
    setRoiEntries(updated);
    saveROI(updated);
  };

  const closeROI = (id: string, exitPrice: number) => {
    const updated = roiEntries.map(e =>
      e.id === id ? { ...e, closed: true, exitPrice, pnl: +((exitPrice - e.entryPrice) * (e.betSize / e.entryPrice)).toFixed(2) } : e
    );
    setRoiEntries(updated);
    saveROI(updated);
  };

  // Bet calculator
  const calcAlpha = () => {
    const price = parseFloat(betCalcPrice) || 0;
    const fair = parseFloat(betCalcFair) || 0;
    if (price <= 0 || fair <= 0) return { edge: 0, bet: 0, ev: 0 };
    const edge = (fair - price) / fair;
    const abs = Math.abs(edge);
    const bet = abs >= 0.25 ? 5 : abs >= 0.15 ? 3 : abs >= 0.10 ? 2 : abs >= 0.05 ? 1 : 0;
    const ev = +(bet * edge).toFixed(2);
    return { edge: +(edge * 100).toFixed(1), bet, ev };
  };

  if (!data && loading) {
    return (
      <div className="min-h-screen bg-[#060610] flex items-center justify-center">
        <div className="text-center space-y-4">
          <RefreshCw className="w-8 h-8 animate-spin text-[#00ff88] mx-auto" />
          <p className="text-zinc-500 font-mono text-sm">Scanning Kalshi golf markets…</p>
        </div>
      </div>
    );
  }

  const corridorColor = data?.corridor.status === "PROTECTED" ? "text-[#00ff88]" : data?.corridor.status === "PARTIAL" ? "text-amber-400" : "text-[#ff3366]";
  const corridorBg = data?.corridor.status === "PROTECTED" ? "bg-[#00ff88]/10 border-[#00ff88]/30" : data?.corridor.status === "PARTIAL" ? "bg-amber-500/10 border-amber-500/30" : "bg-[#ff3366]/10 border-[#ff3366]/30";
  const calc = calcAlpha();

  return (
    <div className="min-h-screen bg-[#060610] text-zinc-100">
      {/* ─── Header ──────────────────────────────────────── */}
      <header className="border-b border-zinc-800/60 bg-[#0a0a18]/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1700px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#00ff88] to-emerald-600 flex items-center justify-center shadow-lg shadow-[#00ff88]/20">
              <Trophy className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-widest text-[#00ff88] font-mono">KALSHI GOLF α SCANNER</h1>
              <p className="text-[10px] text-zinc-600 font-mono">LIVE MARKETS • +EV DETECTION • NO-LOSS CORRIDOR</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {data && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${corridorBg}`}>
                <Circle className={`w-2.5 h-2.5 fill-current ${corridorColor}`} />
                <span className={`text-xs font-mono font-black ${corridorColor}`}>
                  {data.corridor.status}
                </span>
              </div>
            )}
            <Badge variant="outline" className="border-zinc-700 text-zinc-500 text-[9px] font-mono">
              {data?.source === "kalshi_live" ? "KALSHI LIVE" : "OFFLINE"}
            </Badge>
            <span className="text-[10px] text-zinc-600 font-mono">{lastRefresh && `↻ ${lastRefresh}`}</span>
            <Button size="sm" variant="outline" onClick={fetchData} disabled={loading}
              className="border-zinc-700 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 h-8 text-xs font-mono">
              <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} /> SCAN
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1700px] mx-auto px-4 py-4 space-y-4">
        {/* ─── Summary Strip ────────────────────────────── */}
        {data && (
          <div className="grid grid-cols-6 gap-2">
            <MiniStat label="Golf Markets" value={data.summary.totalGolfMarkets} />
            <MiniStat label="Winner" value={data.summary.winnerMarkets} color="text-[#00ff88]" />
            <MiniStat label="Top 10" value={data.summary.top10Markets} color="text-blue-400" />
            <MiniStat label="Top 5" value={data.summary.top5Markets} color="text-violet-400" />
            <MiniStat label="Round Leader" value={data.summary.roundLeaderMarkets} color="text-amber-400" />
            <MiniStat label="Edge Alerts" value={data.alerts.length} color="text-[#ff3366]" />
          </div>
        )}

        {/* ─── Edge Alerts Panel ─────────────────────────── */}
        {data && data.alerts.length > 0 && (
          <Card className="bg-[#0a0a18]/80 border-[#ff3366]/30 shadow-lg shadow-[#ff3366]/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono text-[#ff3366] flex items-center gap-2">
                <Flame className="w-4 h-4" /> EDGE ALERTS — {data.alerts.length} Active
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.alerts.map((a, i) => (
                <div key={i} className={`rounded-lg border px-4 py-3 flex items-start justify-between gap-4 ${
                  a.severity === "critical" ? "bg-[#ff3366]/10 border-[#ff3366]/40" :
                  a.severity === "success" ? "bg-[#00ff88]/10 border-[#00ff88]/40" :
                  a.severity === "warning" ? "bg-amber-500/10 border-amber-500/40" :
                  "bg-blue-500/10 border-blue-500/40"
                }`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={`text-[9px] font-mono ${
                        a.signal === "CONCENTRATION_BUY" ? "bg-[#ff3366]/30 text-[#ff3366] border-[#ff3366]/50" :
                        a.signal === "CAPITAL_LOCK" ? "bg-[#00ff88]/30 text-[#00ff88] border-[#00ff88]/50" :
                        a.signal === "RISK_FREE_HEDGE" ? "bg-amber-500/30 text-amber-300 border-amber-500/50" :
                        "bg-blue-500/30 text-blue-300 border-blue-500/50"
                      }`}>{a.signal}</Badge>
                      <span className="text-[10px] text-zinc-500 font-mono">{a.type}</span>
                    </div>
                    <p className="text-xs text-zinc-300">{a.message}</p>
                  </div>
                  {a.bet && a.bet.suggested > 0 && (
                    <div className="text-right shrink-0">
                      <div className="text-lg font-black font-mono text-[#00ff88]">${a.bet.suggested.toFixed(2)}</div>
                      <p className="text-[9px] text-zinc-500 font-mono">SUGGESTED</p>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {error && (
          <Alert className="bg-[#ff3366]/10 border-[#ff3366]/40 text-[#ff3366]">
            <AlertTriangle className="w-4 h-4" />
            <AlertTitle className="text-xs font-mono">Error</AlertTitle>
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {data && (
          <Tabs defaultValue="grid" className="space-y-3">
            <TabsList className="bg-[#0a0a18] border border-zinc-800/60">
              <TabsTrigger value="grid" className="data-[state=active]:bg-zinc-800 text-xs font-mono">Live Grid</TabsTrigger>
              <TabsTrigger value="corridor" className="data-[state=active]:bg-zinc-800 text-xs font-mono">Corridor</TabsTrigger>
              <TabsTrigger value="calculator" className="data-[state=active]:bg-zinc-800 text-xs font-mono">Bet Calculator</TabsTrigger>
              <TabsTrigger value="roi" className="data-[state=active]:bg-zinc-800 text-xs font-mono">ROI Tracker</TabsTrigger>
              <TabsTrigger value="raw" className="data-[state=active]:bg-zinc-800 text-xs font-mono">Raw Markets</TabsTrigger>
            </TabsList>

            {/* ─── LIVE GRID ─────────────────────────────── */}
            <TabsContent value="grid" className="space-y-4">
              <Card className="bg-[#0a0a18]/80 border-zinc-800/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-mono text-zinc-300 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#00ff88]" /> Top 15 — Live Kalshi Prices
                  </CardTitle>
                  <CardDescription className="text-[10px] font-mono text-zinc-600">
                    Real-time from api.elections.kalshi.com • Auto-refresh 30s
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-zinc-800/60 hover:bg-transparent">
                        <TableHead className="text-[10px] text-zinc-500 font-mono w-10">#</TableHead>
                        <TableHead className="text-[10px] text-zinc-500 font-mono">PLAYER</TableHead>
                        <TableHead className="text-[10px] text-zinc-500 font-mono text-right">WIN ¢</TableHead>
                        <TableHead className="text-[10px] text-zinc-500 font-mono text-right">Δ</TableHead>
                        <TableHead className="text-[10px] text-zinc-500 font-mono text-right">TOP 10 ¢</TableHead>
                        <TableHead className="text-[10px] text-zinc-500 font-mono text-right">WIN VOL</TableHead>
                        <TableHead className="text-[10px] text-zinc-500 font-mono text-right">OI</TableHead>
                        <TableHead className="text-[10px] text-zinc-500 font-mono text-center">SIGNAL</TableHead>
                        <TableHead className="text-[10px] text-zinc-500 font-mono text-right">BET</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.playerGrid.map((p, i) => {
                        const prev = prevPrices.get(p.name) || 0;
                        const delta = prev > 0 ? +((p.winnerYes - prev) * 100).toFixed(1) : 0;
                        const signal = p.leaderLag?.signal || p.probWall?.signal || "";
                        return (
                          <TableRow key={i} className={`border-zinc-800/40 hover:bg-zinc-800/20 ${
                            signal === "CONCENTRATION_BUY" || signal === "CAPITAL_LOCK" ? "bg-[#00ff88]/5" : ""
                          }`}>
                            <TableCell className="text-xs font-mono text-zinc-500 py-2">{p.rank}</TableCell>
                            <TableCell className="text-xs font-medium py-2">
                              <div className="flex items-center gap-1.5">
                                {p.name}
                                {i === 0 && <Lock className="w-3 h-3 text-[#00ff88]" />}
                              </div>
                              <div className="text-[9px] text-zinc-600 font-mono">{p.winnerTicker}</div>
                            </TableCell>
                            <TableCell className="text-xs font-mono text-right py-2 text-[#00ff88] font-bold">
                              {(p.winnerYes * 100).toFixed(0)}¢
                            </TableCell>
                            <TableCell className={`text-xs font-mono text-right py-2 ${
                              delta > 0 ? "text-[#00ff88]" : delta < 0 ? "text-[#ff3366]" : "text-zinc-600"
                            }`}>
                              {delta !== 0 ? (delta > 0 ? `+${delta}` : delta) : "—"}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-right py-2 text-blue-400">
                              {p.top10Yes > 0 ? `${(p.top10Yes * 100).toFixed(0)}¢` : "—"}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-right py-2 text-zinc-400">
                              {p.winnerVolume > 0 ? p.winnerVolume.toLocaleString() : "—"}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-right py-2 text-zinc-500">
                              {p.winnerOpenInterest > 0 ? p.winnerOpenInterest.toLocaleString() : "—"}
                            </TableCell>
                            <TableCell className="text-center py-2">
                              {signal ? (
                                <Badge className={`text-[8px] font-mono ${
                                  signal === "CONCENTRATION_BUY" ? "bg-[#ff3366]/20 text-[#ff3366] border-[#ff3366]/40" :
                                  signal === "CAPITAL_LOCK" ? "bg-[#00ff88]/20 text-[#00ff88] border-[#00ff88]/40" :
                                  signal === "WATCH" ? "bg-amber-500/20 text-amber-300 border-amber-500/40" :
                                  "bg-zinc-700/40 text-zinc-400 border-zinc-600/40"
                                }`}>{signal}</Badge>
                              ) : <span className="text-zinc-700 text-[10px]">—</span>}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-right py-2">
                              {p.bet.suggested > 0 ? (
                                <span className="text-[#00ff88] font-bold">${p.bet.suggested.toFixed(2)}</span>
                              ) : <span className="text-zinc-700">—</span>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Leader Lag Detail */}
              {data.playerGrid[0]?.leaderLag && (
                <Card className="bg-[#0a0a18]/80 border-zinc-800/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-mono text-zinc-300 flex items-center gap-2">
                      <Crosshair className="w-4 h-4 text-[#ff3366]" /> Leader Lag Analysis — {data.playerGrid[0].name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-3">
                      <StatBox label="Market Price" value={`${(data.playerGrid[0].winnerYes * 100).toFixed(0)}¢`} color="text-zinc-200" />
                      <StatBox label="Fair Value" value={`${(data.playerGrid[0].leaderLag.fairValue * 100).toFixed(0)}¢`} color="text-[#00ff88]" />
                      <StatBox label="Edge" value={`${(data.playerGrid[0].leaderLag.edge * 100).toFixed(1)}%`}
                        color={data.playerGrid[0].leaderLag.edge > 0 ? "text-[#00ff88]" : "text-[#ff3366]"} />
                      <StatBox label="Signal" value={data.playerGrid[0].leaderLag.signal}
                        color={data.playerGrid[0].leaderLag.signal === "CONCENTRATION_BUY" ? "text-[#ff3366]" : "text-zinc-400"} />
                    </div>
                    <p className="text-[10px] text-zinc-600 font-mono mt-2">
                      Formula: FV = 1 − (1 / (1 + Lead_Strokes / (Holes_Remaining / 2))) • 15%+ gap = CONCENTRATION_BUY
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ─── NO-LOSS CORRIDOR ──────────────────────── */}
            <TabsContent value="corridor" className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <CorridorLight
                  label="Winner Position"
                  active={data.corridor.winnerActive}
                  detail={data.playerGrid[0] ? `${data.playerGrid[0].name} at ${(data.playerGrid[0].winnerYes * 100).toFixed(0)}¢` : "No market"}
                />
                <CorridorLight
                  label="Top 10 Floor"
                  active={data.corridor.top10Floor}
                  detail={data.playerGrid[0]?.top10Yes ? `Leader Top 10 at ${(data.playerGrid[0].top10Yes * 100).toFixed(0)}¢` : "No Top 10 market"}
                />
                <CorridorLight
                  label="Round Hedge"
                  active={data.corridor.roundHedge}
                  detail={data.playerGrid[0]?.roundLeaderNo ? `Round Leader No at ${(data.playerGrid[0].roundLeaderNo * 100).toFixed(0)}¢` : "No hedge market"}
                />
              </div>

              <Card className={`border ${corridorBg} bg-[#0a0a18]/80`}>
                <CardContent className="py-8 text-center">
                  <div className={`text-5xl font-black font-mono ${corridorColor} mb-2`}>
                    {data.corridor.status}
                  </div>
                  <p className="text-xs text-zinc-500 font-mono">NO-LOSS CORRIDOR STATUS</p>
                  <p className="text-[10px] text-zinc-600 mt-2 max-w-md mx-auto">
                    {data.corridor.status === "PROTECTED"
                      ? "All three layers active: Winner anchor is insured by Top 10 floor and Round Leader hedge."
                      : data.corridor.status === "PARTIAL"
                      ? "Partial protection — one or more layers missing. Consider adding hedges."
                      : "EXPOSED — no protective layers active. Winner position is unhedged."}
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── BET CALCULATOR ────────────────────────── */}
            <TabsContent value="calculator" className="space-y-4">
              <Card className="bg-[#0a0a18]/80 border-zinc-800/60">
                <CardHeader>
                  <CardTitle className="text-sm font-mono text-zinc-300 flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-[#00ff88]" /> Bet Calculator
                  </CardTitle>
                  <CardDescription className="text-[10px] text-zinc-600 font-mono">
                    Enter market price and your fair value estimate. Suggests $1–$5 entry based on alpha score.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] text-zinc-500 font-mono mb-1 block">MARKET PRICE (0–1)</label>
                      <Input value={betCalcPrice} onChange={e => setBetCalcPrice(e.target.value)}
                        className="bg-zinc-900 border-zinc-700 text-zinc-100 font-mono" />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 font-mono mb-1 block">FAIR VALUE (0–1)</label>
                      <Input value={betCalcFair} onChange={e => setBetCalcFair(e.target.value)}
                        className="bg-zinc-900 border-zinc-700 text-zinc-100 font-mono" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <StatBox label="Edge %" value={`${calc.edge}%`} color={calc.edge > 0 ? "text-[#00ff88]" : "text-[#ff3366]"} />
                    <StatBox label="Suggested Bet" value={`$${calc.bet.toFixed(2)}`} color="text-[#00ff88]" />
                    <StatBox label="Expected Value" value={`$${calc.ev}`} color={calc.ev > 0 ? "text-[#00ff88]" : "text-[#ff3366]"} />
                  </div>
                  <div className="bg-zinc-900/60 rounded-lg p-3 border border-zinc-800/40">
                    <p className="text-[10px] text-zinc-500 font-mono">
                      SCALE: 5%→$1 • 10%→$2 • 15%→$3 • 25%+→$5 (max Kalshi limit)
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── ROI TRACKER ───────────────────────────── */}
            <TabsContent value="roi" className="space-y-4">
              <Card className="bg-[#0a0a18]/80 border-zinc-800/60">
                <CardHeader>
                  <CardTitle className="text-sm font-mono text-zinc-300 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-[#00ff88]" /> Post-Game ROI Tracker
                  </CardTitle>
                  <CardDescription className="text-[10px] text-zinc-600 font-mono">
                    Log entries from the grid. Realized gains vs stagnant history.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {roiEntries.length === 0 ? (
                    <div className="text-center py-12 text-zinc-600 text-sm font-mono">
                      No positions logged yet. Use the Live Grid to track entries.
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <StatBox label="Total Entries" value={roiEntries.length.toString()} color="text-zinc-200" />
                        <StatBox label="Realized P&L"
                          value={`$${roiEntries.filter(e => e.closed).reduce((s, e) => s + (e.pnl || 0), 0).toFixed(2)}`}
                          color="text-[#00ff88]" />
                        <StatBox label="Open Positions" value={roiEntries.filter(e => !e.closed).length.toString()} color="text-amber-400" />
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="border-zinc-800/60">
                            <TableHead className="text-[10px] text-zinc-500 font-mono">Player</TableHead>
                            <TableHead className="text-[10px] text-zinc-500 font-mono">Market</TableHead>
                            <TableHead className="text-[10px] text-zinc-500 font-mono text-right">Entry</TableHead>
                            <TableHead className="text-[10px] text-zinc-500 font-mono text-right">Bet</TableHead>
                            <TableHead className="text-[10px] text-zinc-500 font-mono text-right">P&L</TableHead>
                            <TableHead className="text-[10px] text-zinc-500 font-mono text-center">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {roiEntries.map((e) => (
                            <TableRow key={e.id} className="border-zinc-800/40">
                              <TableCell className="text-xs font-mono py-2">{e.player}</TableCell>
                              <TableCell className="text-xs font-mono py-2 text-zinc-400">{e.market}</TableCell>
                              <TableCell className="text-xs font-mono text-right py-2">{(e.entryPrice * 100).toFixed(0)}¢</TableCell>
                              <TableCell className="text-xs font-mono text-right py-2">${e.betSize.toFixed(2)}</TableCell>
                              <TableCell className={`text-xs font-mono text-right py-2 ${
                                e.closed ? (e.pnl && e.pnl >= 0 ? "text-[#00ff88]" : "text-[#ff3366]") : "text-zinc-600"
                              }`}>
                                {e.closed ? `$${e.pnl?.toFixed(2)}` : "—"}
                              </TableCell>
                              <TableCell className="text-center py-2">
                                <Badge className={`text-[9px] font-mono ${e.closed ? "bg-zinc-700 text-zinc-400" : "bg-[#00ff88]/20 text-[#00ff88] border-[#00ff88]/40"}`}>
                                  {e.closed ? "CLOSED" : "OPEN"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── RAW MARKETS ───────────────────────────── */}
            <TabsContent value="raw" className="space-y-4">
              <Card className="bg-[#0a0a18]/80 border-zinc-800/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-mono text-zinc-300 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-zinc-400" /> All Golf Markets ({data.markets.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[500px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-zinc-800/60 hover:bg-transparent sticky top-0 bg-[#0a0a18]">
                          <TableHead className="text-[10px] text-zinc-500 font-mono">Ticker</TableHead>
                          <TableHead className="text-[10px] text-zinc-500 font-mono">Title</TableHead>
                          <TableHead className="text-[10px] text-zinc-500 font-mono">Type</TableHead>
                          <TableHead className="text-[10px] text-zinc-500 font-mono text-right">Yes ¢</TableHead>
                          <TableHead className="text-[10px] text-zinc-500 font-mono text-right">Vol</TableHead>
                          <TableHead className="text-[10px] text-zinc-500 font-mono text-right">OI</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.markets.map((m, i) => (
                          <TableRow key={i} className="border-zinc-800/40 hover:bg-zinc-800/20">
                            <TableCell className="text-[10px] font-mono text-zinc-500 py-1.5 max-w-[120px] truncate">{m.ticker}</TableCell>
                            <TableCell className="text-xs py-1.5 max-w-[300px] truncate">{m.title}</TableCell>
                            <TableCell className="py-1.5">
                              <Badge variant="outline" className={`text-[8px] font-mono ${
                                m.marketType === "winner" ? "border-[#00ff88]/40 text-[#00ff88]" :
                                m.marketType === "top10" ? "border-blue-500/40 text-blue-400" :
                                m.marketType === "round_leader" ? "border-amber-500/40 text-amber-400" :
                                "border-zinc-600/40 text-zinc-500"
                              }`}>{m.marketType}</Badge>
                            </TableCell>
                            <TableCell className="text-xs font-mono text-right py-1.5 text-[#00ff88]">
                              {(m.yesPrice * 100).toFixed(0)}¢
                            </TableCell>
                            <TableCell className="text-xs font-mono text-right py-1.5 text-zinc-400">
                              {(m.vol24h || m.volume || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-right py-1.5 text-zinc-500">
                              {(m.openInterest || 0).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                        {data.markets.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-12 text-zinc-600 text-sm font-mono">
                              No golf markets currently open on Kalshi.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────

function MiniStat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="bg-[#0a0a18]/80 border border-zinc-800/40 rounded-lg px-3 py-2">
      <p className="text-[9px] text-zinc-600 font-mono">{label}</p>
      <p className={`text-lg font-black font-mono ${color || "text-zinc-200"}`}>{value}</p>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800/40 rounded-lg p-3">
      <p className="text-[9px] text-zinc-600 font-mono mb-1">{label}</p>
      <p className={`text-xl font-black font-mono ${color || "text-zinc-200"}`}>{value}</p>
    </div>
  );
}

function CorridorLight({ label, active, detail }: { label: string; active: boolean; detail: string }) {
  return (
    <Card className={`border ${active ? "bg-[#00ff88]/5 border-[#00ff88]/30" : "bg-[#ff3366]/5 border-[#ff3366]/30"} bg-[#0a0a18]/80`}>
      <CardContent className="py-6 text-center">
        <div className={`w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center ${
          active ? "bg-[#00ff88]/20 shadow-lg shadow-[#00ff88]/30" : "bg-[#ff3366]/20 shadow-lg shadow-[#ff3366]/30"
        }`}>
          <Circle className={`w-8 h-8 fill-current ${active ? "text-[#00ff88]" : "text-[#ff3366]"}`} />
        </div>
        <p className={`text-sm font-black font-mono ${active ? "text-[#00ff88]" : "text-[#ff3366]"}`}>
          {active ? "ACTIVE" : "INACTIVE"}
        </p>
        <p className="text-xs text-zinc-400 font-mono mt-1">{label}</p>
        <p className="text-[10px] text-zinc-600 mt-1">{detail}</p>
      </CardContent>
    </Card>
  );
}
