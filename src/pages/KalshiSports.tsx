import { useState, useEffect, useCallback, useRef, DragEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Trophy, RefreshCw, Circle, TrendingUp, Zap, DollarSign, BarChart3,
  ArrowUpRight, ArrowDownRight, Target, Shield, Activity, Clipboard,
  Sparkles, AlertTriangle, Loader2, X
} from "lucide-react";

const SPORT_ICONS: Record<string, string> = {
  Basketball: "🏀", Baseball: "⚾", Hockey: "🏒", Soccer: "⚽", Tennis: "🎾",
  Golf: "⛳", "Aussie Rules": "🏈", Cricket: "🏏", Racing: "🏇", Esports: "🎮",
};

export default function KalshiSports() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeSport, setActiveSport] = useState("All");
  const [lastRefresh, setLastRefresh] = useState("");

  // Paste-to-edge state
  const [pasteText, setPasteText] = useState("");
  const [scanning, setScanning] = useState(false);
  const [edgeResults, setEdgeResults] = useState<any>(null);
  const [showPasteZone, setShowPasteZone] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scanForEdges = useCallback(async (text: string) => {
    if (!text.trim() || text.length < 10) return;
    setScanning(true);
    setEdgeResults(null);
    try {
      const { data: res, error } = await supabase.functions.invoke("kalshi-edge-scan", {
        body: { pastedText: text },
      });
      if (error) throw error;
      setEdgeResults(res.analysis);
    } catch (e: any) {
      console.error("Edge scan failed:", e);
      setEdgeResults({ error: e.message });
    } finally {
      setScanning(false);
    }
  }, []);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const text = e.dataTransfer.getData("text/plain");
    if (text) {
      setPasteText(text);
      scanForEdges(text);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain");
    if (text && text.length > 10) {
      setPasteText(text);
      scanForEdges(text);
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("kalshi-sports", {
        body: { sport: activeSport },
      });
      if (error) throw error;
      setData(res);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeSport]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { const iv = setInterval(fetchData, 30000); return () => clearInterval(iv); }, [fetchData]);

  if (!data && loading) {
    return (
      <div className="min-h-screen bg-[#08080d] flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08080d] text-zinc-100">
      {/* ─── Header ─── */}
      <header className="border-b border-zinc-800/50 bg-[#0b0b12]/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1680px] mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center">
              <Activity className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h1 className="text-xs font-bold tracking-widest text-zinc-100">KALSHI SPORTS OPTIMIZER</h1>
              <p className="text-[9px] text-zinc-600 font-mono">MULTI-SPORT PORTFOLIO • NO-LOSS CORRIDOR</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-500">
                <span><Circle className="w-1.5 h-1.5 inline fill-emerald-400 text-emerald-400 mr-1" />{data.stats.liveMarkets} LIVE</span>
                <span>{data.stats.totalMarkets} MARKETS</span>
                <span>{data.stats.portfolioPositions} POSITIONS</span>
              </div>
            )}
            <span className="text-[9px] text-zinc-600 font-mono">{lastRefresh && `↻ ${lastRefresh}`}</span>
            <Button size="sm" variant="outline" onClick={fetchData} disabled={loading}
              className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 h-7 text-[10px] px-2">
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1680px] mx-auto px-4 py-3 space-y-3">
        {/* ─── Sport Category Tabs ─── */}
        {data && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <SportTab sport="All" count={data.stats.totalMarkets} active={activeSport === "All"} onClick={() => setActiveSport("All")} />
            {data.categories.map((c: any) => (
              <SportTab key={c.sport} sport={c.sport} count={c.total} live={c.live}
                active={activeSport === c.sport} onClick={() => setActiveSport(c.sport)} />
            ))}
          </div>
        )}

        {data && (
          <>
            {/* ─── Stats Row ─── */}
            <div className="grid grid-cols-5 gap-2">
              <StatCard label="Portfolio Value" value={`$${data.portfolio.totalValue.toFixed(2)}`}
                sub={`Cost: $${data.portfolio.totalCost.toFixed(2)}`}
                badge={`${data.portfolio.totalPnl >= 0 ? "+" : ""}${data.portfolio.totalPnlPct}%`}
                positive={data.portfolio.totalPnl >= 0} />
              <StatCard label="Total P&L" value={`${data.portfolio.totalPnl >= 0 ? "+" : ""}$${data.portfolio.totalPnl.toFixed(2)}`}
                positive={data.portfolio.totalPnl >= 0} />
              <StatCard label="Live Markets" value={data.stats.liveMarkets.toString()} sub={`of ${data.stats.totalMarkets}`} />
              <StatCard label="Edge Signals" value={data.edges.length.toString()} sub="Mispriced markets" />
              <StatCard label="Sports Active" value={data.stats.sports.toString()} sub="Categories tracked" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              {/* ─── Portfolio Chart ─── */}
              <Card className="col-span-2 bg-zinc-900/50 border-zinc-800/50">
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Portfolio Value
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-2">
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={data.portfolioHistory}>
                      <defs>
                        <linearGradient id="sportGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2a" />
                      <XAxis dataKey="time" tick={{ fontSize: 8, fill: "#52525b" }}
                        tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
                      <YAxis tick={{ fontSize: 8, fill: "#52525b" }} domain={["auto", "auto"]} />
                      <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", fontSize: 10 }} />
                      <Area type="monotone" dataKey="value" stroke="#10b981" fill="url(#sportGrad)" strokeWidth={1.5} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* ─── Edge Signals ─── */}
              <Card className="bg-zinc-900/50 border-zinc-800/50 overflow-hidden">
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" /> Edge Signals
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 max-h-[210px] overflow-y-auto">
                  {data.edges.length > 0 ? data.edges.map((e: any, i: number) => (
                    <div key={i} className="px-3 py-2 border-b border-zinc-800/30 hover:bg-zinc-800/20">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[9px] text-zinc-500">{SPORT_ICONS[e.sport] || "📊"} {e.sport}</span>
                        <Badge className={`text-[8px] px-1.5 py-0 ${
                          e.signal === "UNDERPRICED_FAVORITE" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                          "bg-amber-500/20 text-amber-400 border-amber-500/30"
                        }`}>{e.signal.replace(/_/g, " ")}</Badge>
                      </div>
                      <p className="text-[10px] text-zinc-300 leading-tight">{e.reasoning}</p>
                    </div>
                  )) : (
                    <div className="p-4 text-center text-zinc-600 text-xs">No edges detected</div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="markets" className="space-y-2">
              <TabsList className="bg-zinc-900/60 border border-zinc-800/50 h-8">
                <TabsTrigger value="markets" className="text-[10px] data-[state=active]:bg-zinc-800 h-6">Live Markets</TabsTrigger>
                <TabsTrigger value="portfolio" className="text-[10px] data-[state=active]:bg-zinc-800 h-6">Portfolio</TabsTrigger>
              </TabsList>

              {/* ─── Markets Tab ─── */}
              <TabsContent value="markets">
                <Card className="bg-zinc-900/50 border-zinc-800/50">
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-zinc-800/40 hover:bg-transparent">
                          <TableHead className="text-[9px] text-zinc-600 w-16">Sport</TableHead>
                          <TableHead className="text-[9px] text-zinc-600">Market</TableHead>
                          <TableHead className="text-[9px] text-zinc-600">Status</TableHead>
                          <TableHead className="text-[9px] text-zinc-600 text-right">Side A</TableHead>
                          <TableHead className="text-[9px] text-zinc-600 text-right">Side B</TableHead>
                          <TableHead className="text-[9px] text-zinc-600 text-right">Volume</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.markets.filter((m: any) => m.type === "game").slice(0, 20).map((m: any, i: number) => (
                          <TableRow key={i} className="border-zinc-800/30 hover:bg-zinc-800/20">
                            <TableCell className="text-[10px] py-1.5">
                              <span className="mr-1">{SPORT_ICONS[m.sport] || "📊"}</span>
                              <span className="text-zinc-500">{m.league}</span>
                            </TableCell>
                            <TableCell className="text-[10px] py-1.5 font-medium">
                              {m.teamA.name} vs {m.teamB.name}
                            </TableCell>
                            <TableCell className="py-1.5">
                              {m.live ? (
                                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[8px] px-1.5 py-0">
                                  <Circle className="w-1 h-1 fill-current mr-0.5" /> LIVE
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[8px] text-zinc-500 border-zinc-700 px-1.5 py-0">UPCOMING</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-[10px] font-mono text-right py-1.5">
                              <span className={m.teamA.pct > 55 ? "text-emerald-400" : "text-zinc-300"}>
                                {(m.teamA.yesPrice * 100).toFixed(0)}¢
                              </span>
                              <span className="text-zinc-600 ml-1 text-[8px]">{m.teamA.pct}%</span>
                            </TableCell>
                            <TableCell className="text-[10px] font-mono text-right py-1.5">
                              <span className={m.teamB.pct > 55 ? "text-emerald-400" : "text-zinc-300"}>
                                {(m.teamB.yesPrice * 100).toFixed(0)}¢
                              </span>
                              <span className="text-zinc-600 ml-1 text-[8px]">{m.teamB.pct}%</span>
                            </TableCell>
                            <TableCell className="text-[9px] font-mono text-right py-1.5 text-zinc-500">
                              ${(m.volume / 1000).toFixed(0)}k
                            </TableCell>
                          </TableRow>
                        ))}

                        {/* Outright markets */}
                        {data.markets.filter((m: any) => m.type === "outright").map((m: any, i: number) => (
                          <TableRow key={`o-${i}`} className="border-zinc-800/30 hover:bg-zinc-800/20 bg-zinc-900/30">
                            <TableCell className="text-[10px] py-1.5">
                              <span className="mr-1">{SPORT_ICONS[m.sport] || "📊"}</span>
                              <span className="text-zinc-500">{m.sport}</span>
                            </TableCell>
                            <TableCell className="text-[10px] py-1.5 font-medium" colSpan={2}>
                              {m.event}
                              <Badge className="ml-2 bg-violet-500/20 text-violet-400 border-violet-500/30 text-[8px] px-1.5 py-0">OUTRIGHT</Badge>
                            </TableCell>
                            <TableCell className="text-[10px] font-mono text-right py-1.5" colSpan={2}>
                              {m.participants.slice(0, 3).map((p: any, j: number) => (
                                <span key={j} className="inline-block mr-2">
                                  <span className="text-zinc-400">{p.name.split(" ").pop()}</span>
                                  <span className="text-emerald-400 ml-1">{(p.yesPrice * 100).toFixed(0)}¢</span>
                                </span>
                              ))}
                            </TableCell>
                            <TableCell className="text-[9px] font-mono text-right py-1.5 text-zinc-500">
                              ${(m.volume / 1000).toFixed(0)}k
                            </TableCell>
                          </TableRow>
                        ))}

                        {/* Player props */}
                        {data.markets.filter((m: any) => m.type === "player_prop").map((m: any, i: number) => (
                          <TableRow key={`pp-${i}`} className="border-zinc-800/30 hover:bg-zinc-800/20">
                            <TableCell className="text-[10px] py-1.5">
                              <span className="mr-1">{SPORT_ICONS[m.sport] || "📊"}</span>
                              <span className="text-zinc-500">{m.sport}</span>
                            </TableCell>
                            <TableCell className="text-[10px] py-1.5 font-medium" colSpan={2}>
                              {m.player} — {m.prop} O/U {m.line}
                              <Badge className="ml-2 bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[8px] px-1.5 py-0">PROP</Badge>
                            </TableCell>
                            <TableCell className="text-[10px] font-mono text-right py-1.5">
                              <span className="text-emerald-400">O {(m.over.price * 100).toFixed(0)}¢</span>
                            </TableCell>
                            <TableCell className="text-[10px] font-mono text-right py-1.5">
                              <span className="text-red-400">U {(m.under.price * 100).toFixed(0)}¢</span>
                            </TableCell>
                            <TableCell className="text-[9px] font-mono text-right py-1.5 text-zinc-500">
                              ${(m.volume / 1000).toFixed(0)}k
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ─── Portfolio Tab ─── */}
              <TabsContent value="portfolio">
                <Card className="bg-zinc-900/50 border-zinc-800/50">
                  <CardHeader className="py-2 px-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-[11px] font-mono text-zinc-400">Active Positions</CardTitle>
                      <div className="flex items-center gap-3 text-[10px] font-mono">
                        <span className="text-zinc-500">Value: <span className="text-zinc-200">${data.portfolio.totalValue.toFixed(2)}</span></span>
                        <span className={data.portfolio.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {data.portfolio.totalPnl >= 0 ? "+" : ""}${data.portfolio.totalPnl.toFixed(2)} ({data.portfolio.totalPnlPct}%)
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-zinc-800/40 hover:bg-transparent">
                          <TableHead className="text-[9px] text-zinc-600">Sport</TableHead>
                          <TableHead className="text-[9px] text-zinc-600">Market</TableHead>
                          <TableHead className="text-[9px] text-zinc-600">Side</TableHead>
                          <TableHead className="text-[9px] text-zinc-600 text-right">Qty</TableHead>
                          <TableHead className="text-[9px] text-zinc-600 text-right">Avg Cost</TableHead>
                          <TableHead className="text-[9px] text-zinc-600 text-right">Current</TableHead>
                          <TableHead className="text-[9px] text-zinc-600 text-right">Value</TableHead>
                          <TableHead className="text-[9px] text-zinc-600 text-right">P&L</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.portfolio.positions.map((pos: any, i: number) => (
                          <TableRow key={i} className="border-zinc-800/30 hover:bg-zinc-800/20">
                            <TableCell className="text-[10px] py-1.5">
                              {SPORT_ICONS[pos.sport] || "📊"} {pos.league}
                            </TableCell>
                            <TableCell className="text-[10px] py-1.5 font-medium max-w-[200px] truncate">{pos.market}</TableCell>
                            <TableCell className="text-[10px] py-1.5">
                              <span className="text-zinc-300">{pos.side}</span>
                              <Badge variant="outline" className="ml-1 text-[7px] border-zinc-700 text-zinc-500 px-1 py-0">{pos.type}</Badge>
                            </TableCell>
                            <TableCell className="text-[10px] font-mono text-right py-1.5">{pos.contracts}</TableCell>
                            <TableCell className="text-[10px] font-mono text-right py-1.5 text-zinc-400">{(pos.avgCost * 100).toFixed(0)}¢</TableCell>
                            <TableCell className="text-[10px] font-mono text-right py-1.5 text-zinc-200">{(pos.currentPrice * 100).toFixed(0)}¢</TableCell>
                            <TableCell className="text-[10px] font-mono text-right py-1.5">${pos.value.toFixed(2)}</TableCell>
                            <TableCell className={`text-[10px] font-mono text-right py-1.5 ${pos.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {pos.pnl >= 0 ? "+" : ""}{pos.pnl.toFixed(2)}
                              <span className="text-[8px] ml-0.5">({pos.pnlPct}%)</span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ───

function SportTab({ sport, count, live, active, onClick }: {
  sport: string; count: number; live?: number; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-mono whitespace-nowrap transition-colors
        ${active ? "bg-zinc-800 text-zinc-100 border border-zinc-700" : "bg-zinc-900/40 text-zinc-500 border border-zinc-800/30 hover:bg-zinc-800/50 hover:text-zinc-300"}`}>
      {sport !== "All" && <span>{SPORT_ICONS[sport] || "📊"}</span>}
      <span>{sport}</span>
      <span className="text-zinc-600">{count}</span>
      {live && live > 0 && <Circle className="w-1.5 h-1.5 fill-emerald-400 text-emerald-400" />}
    </button>
  );
}

function StatCard({ label, value, sub, badge, positive }: {
  label: string; value: string; sub?: string; badge?: string; positive?: boolean;
}) {
  return (
    <Card className="bg-zinc-900/50 border-zinc-800/50">
      <CardContent className="p-2.5">
        <p className="text-[9px] text-zinc-600 font-mono mb-0.5">{label}</p>
        <div className="flex items-center gap-1.5">
          <span className={`text-base font-black font-mono ${positive === true ? "text-emerald-400" : positive === false ? "text-red-400" : "text-zinc-100"}`}>{value}</span>
          {badge && (
            <Badge className={`text-[8px] px-1.5 py-0 ${positive ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}`}>
              {badge}
            </Badge>
          )}
        </div>
        {sub && <p className="text-[9px] text-zinc-600 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}
