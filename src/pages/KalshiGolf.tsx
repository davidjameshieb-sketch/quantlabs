import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart
} from "recharts";
import {
  Trophy, Shield, AlertTriangle, TrendingUp, Target, Zap, RefreshCw, Circle,
  ArrowUpRight, ArrowDownRight, Lock, DollarSign, BarChart3, Crosshair
} from "lucide-react";

type PortfolioData = {
  tournament: { name: string; course: string; round: number; status: string };
  leaderboard: any[];
  contracts: any[];
  portfolio: { positions: any[]; totalValue: number; totalCost: number; totalPnl: number; totalPnlPct: number };
  concentration: { anchorSize: number; anchorPct: number; suggestions: any[]; recommendation: string };
  hedge: any;
  floorStabilizers: any[];
  portfolioHistory: { time: string; value: number }[];
  alerts: any[];
  corridor: { status: string; anchorProtected: boolean; floorActive: boolean; leaderLead: number };
  timestamp: string;
};

export default function KalshiGolf() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: err } = await supabase.functions.invoke("golf-portfolio");
      if (err) throw err;
      setData(res);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e: any) {
      setError(e.message || "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 30s
  useEffect(() => {
    const iv = setInterval(fetchData, 30000);
    return () => clearInterval(iv);
  }, [fetchData]);

  if (!data && loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center space-y-4">
          <RefreshCw className="w-8 h-8 animate-spin text-emerald-400 mx-auto" />
          <p className="text-zinc-400 font-mono text-sm">Loading portfolio data…</p>
        </div>
      </div>
    );
  }

  const corridorColor = data?.corridor.status === "PROTECTED" ? "text-emerald-400" : data?.corridor.status === "PARTIAL" ? "text-amber-400" : "text-red-400";
  const corridorBg = data?.corridor.status === "PROTECTED" ? "bg-emerald-500/10 border-emerald-500/30" : data?.corridor.status === "PARTIAL" ? "bg-amber-500/10 border-amber-500/30" : "bg-red-500/10 border-red-500/30";

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800/60 bg-[#0d0d14]/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Trophy className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-zinc-100">KALSHI GOLF OPTIMIZER</h1>
              <p className="text-[10px] text-zinc-500 font-mono">NO-LOSS CORRIDOR STRATEGY</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {data && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${corridorBg}`}>
                <Circle className={`w-2 h-2 fill-current ${corridorColor}`} />
                <span className={`text-xs font-mono font-bold ${corridorColor}`}>
                  CORRIDOR: {data.corridor.status}
                </span>
              </div>
            )}
            <span className="text-[10px] text-zinc-600 font-mono">{lastRefresh && `↻ ${lastRefresh}`}</span>
            <Button size="sm" variant="outline" onClick={fetchData} disabled={loading}
              className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 h-8 text-xs">
              <RefreshCw className={`w-3 h-3 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 py-4 space-y-4">
        {/* Alerts */}
        {data?.alerts.map((a, i) => (
          <Alert key={i} className={`border ${
            a.severity === "critical" ? "bg-red-500/10 border-red-500/40 text-red-300" :
            a.severity === "success" ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300" :
            "bg-blue-500/10 border-blue-500/40 text-blue-300"
          }`}>
            {a.severity === "critical" ? <AlertTriangle className="w-4 h-4" /> :
             a.severity === "success" ? <Lock className="w-4 h-4" /> :
             <Target className="w-4 h-4" />}
            <AlertTitle className="text-xs font-mono font-bold">{a.type}</AlertTitle>
            <AlertDescription className="text-xs">{a.message}</AlertDescription>
          </Alert>
        ))}

        {error && (
          <Alert className="bg-red-500/10 border-red-500/40 text-red-300">
            <AlertTriangle className="w-4 h-4" />
            <AlertTitle className="text-xs">Error</AlertTitle>
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        {/* Tournament Info + Portfolio Summary */}
        {data && (
          <div className="grid grid-cols-4 gap-3">
            <MetricCard label="Tournament" value={data.tournament.name} sub={`R${data.tournament.round} • ${data.tournament.course}`} icon={<Trophy className="w-4 h-4 text-emerald-400" />} />
            <MetricCard label="Portfolio Value" value={`$${data.portfolio.totalValue.toFixed(2)}`} sub={`Cost: $${data.portfolio.totalCost.toFixed(2)}`}
              icon={<DollarSign className="w-4 h-4 text-emerald-400" />}
              badge={data.portfolio.totalPnl >= 0 ? `+${data.portfolio.totalPnlPct}%` : `${data.portfolio.totalPnlPct}%`}
              badgeColor={data.portfolio.totalPnl >= 0 ? "emerald" : "red"} />
            <MetricCard label="Leader Lead" value={`${data.corridor.leaderLead} strokes`}
              sub={data.corridor.leaderLead > 3 ? "WINNER LOCKED" : data.corridor.leaderLead < 1 ? "EMERGENCY HEDGE" : "Monitoring"}
              icon={<Crosshair className="w-4 h-4 text-amber-400" />}
              badge={data.corridor.leaderLead > 3 ? "LOCKED" : data.corridor.leaderLead < 1 ? "DANGER" : "ACTIVE"}
              badgeColor={data.corridor.leaderLead > 3 ? "emerald" : data.corridor.leaderLead < 1 ? "red" : "amber"} />
            <MetricCard label="Concentration" value={`${data.concentration.anchorPct}%`}
              sub={`Anchor: $${data.concentration.anchorSize.toFixed(2)}`}
              icon={<BarChart3 className="w-4 h-4 text-violet-400" />}
              badge={data.concentration.recommendation} badgeColor={data.concentration.recommendation === "CONCENTRATE" ? "emerald" : "amber"} />
          </div>
        )}

        {data && (
          <Tabs defaultValue="dashboard" className="space-y-3">
            <TabsList className="bg-zinc-900/80 border border-zinc-800/60">
              <TabsTrigger value="dashboard" className="data-[state=active]:bg-zinc-800 text-xs">Dashboard</TabsTrigger>
              <TabsTrigger value="concentration" className="data-[state=active]:bg-zinc-800 text-xs">Concentration Engine</TabsTrigger>
              <TabsTrigger value="hedge" className="data-[state=active]:bg-zinc-800 text-xs">Hedge Calculator</TabsTrigger>
              <TabsTrigger value="floor" className="data-[state=active]:bg-zinc-800 text-xs">Top 10 Wall</TabsTrigger>
            </TabsList>

            {/* DASHBOARD TAB */}
            <TabsContent value="dashboard" className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                {/* Portfolio Chart */}
                <Card className="col-span-2 bg-zinc-900/60 border-zinc-800/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-mono text-zinc-300 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-400" /> Live Portfolio Value
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart data={data.portfolioHistory}>
                        <defs>
                          <linearGradient id="golfGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#71717a" }}
                          tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
                        <YAxis tick={{ fontSize: 9, fill: "#71717a" }} domain={["auto", "auto"]} />
                        <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 11 }}
                          labelFormatter={(v) => new Date(v).toLocaleTimeString()} />
                        <Area type="monotone" dataKey="value" stroke="#10b981" fill="url(#golfGrad)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Corridor Indicator */}
                <Card className={`border ${corridorBg} bg-zinc-900/60`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-mono text-zinc-300 flex items-center gap-2">
                      <Shield className="w-4 h-4" /> Corridor Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-center py-4">
                      <div className={`text-3xl font-black font-mono ${corridorColor}`}>
                        {data.corridor.status}
                      </div>
                      <p className="text-xs text-zinc-500 mt-1">No-Loss Corridor</p>
                    </div>
                    <CorridorRow label="Anchor (Winner Yes)" active={true} color="emerald" />
                    <CorridorRow label="Hedge (Round No)" active={data.corridor.anchorProtected} color="amber" />
                    <CorridorRow label="Floor (Top 10)" active={data.corridor.floorActive} color="blue" />
                    <div className="pt-2 border-t border-zinc-800">
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">Leader Lead</span>
                        <span className={`font-mono font-bold ${data.corridor.leaderLead > 3 ? "text-emerald-400" : data.corridor.leaderLead < 1 ? "text-red-400" : "text-amber-400"}`}>
                          {data.corridor.leaderLead} strokes
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Leaderboard + Portfolio Positions */}
              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-zinc-900/60 border-zinc-800/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-mono text-zinc-300">Live Leaderboard</CardTitle>
                    <CardDescription className="text-[10px] font-mono text-zinc-600">
                      Sportradar Feed • Auto-refresh 30s
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-zinc-800/60 hover:bg-transparent">
                          <TableHead className="text-[10px] text-zinc-500 w-10">#</TableHead>
                          <TableHead className="text-[10px] text-zinc-500">Player</TableHead>
                          <TableHead className="text-[10px] text-zinc-500 text-right">Score</TableHead>
                          <TableHead className="text-[10px] text-zinc-500 text-right">Today</TableHead>
                          <TableHead className="text-[10px] text-zinc-500 text-right">Thru</TableHead>
                          <TableHead className="text-[10px] text-zinc-500 text-right">Win ¢</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.leaderboard.slice(0, 10).map((p, i) => (
                          <TableRow key={i} className="border-zinc-800/40 hover:bg-zinc-800/30">
                            <TableCell className="text-xs font-mono text-zinc-500 py-1.5">{p.rank}</TableCell>
                            <TableCell className="text-xs font-medium py-1.5">
                              {p.name}
                              {i === 0 && <Lock className="w-3 h-3 inline ml-1 text-emerald-400" />}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-right py-1.5 text-emerald-400">{p.score}</TableCell>
                            <TableCell className={`text-xs font-mono text-right py-1.5 ${p.today < 0 ? "text-emerald-400" : p.today > 0 ? "text-red-400" : "text-zinc-500"}`}>
                              {p.today > 0 ? `+${p.today}` : p.today}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-right py-1.5 text-zinc-400">{p.thru}</TableCell>
                            <TableCell className="text-xs font-mono text-right py-1.5 text-amber-400">
                              {(data.contracts[i]?.winnerYes * 100).toFixed(0)}¢
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card className="bg-zinc-900/60 border-zinc-800/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-mono text-zinc-300">Portfolio Positions</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-zinc-800/60 hover:bg-transparent">
                          <TableHead className="text-[10px] text-zinc-500">Position</TableHead>
                          <TableHead className="text-[10px] text-zinc-500">Type</TableHead>
                          <TableHead className="text-[10px] text-zinc-500 text-right">Qty</TableHead>
                          <TableHead className="text-[10px] text-zinc-500 text-right">Value</TableHead>
                          <TableHead className="text-[10px] text-zinc-500 text-right">P&L</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.portfolio.positions.map((pos, i) => (
                          <TableRow key={i} className="border-zinc-800/40 hover:bg-zinc-800/30">
                            <TableCell className="text-xs py-1.5">
                              <div className="font-medium">{pos.player}</div>
                              <div className="text-[10px] text-zinc-500">{pos.market}</div>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Badge variant="outline" className={`text-[9px] border ${
                                pos.type === "anchor" ? "border-emerald-500/40 text-emerald-400" :
                                pos.type === "hedge" ? "border-amber-500/40 text-amber-400" :
                                pos.type === "floor" ? "border-blue-500/40 text-blue-400" :
                                "border-zinc-600 text-zinc-400"
                              }`}>
                                {pos.type.toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs font-mono text-right py-1.5">{pos.contracts}</TableCell>
                            <TableCell className="text-xs font-mono text-right py-1.5">${pos.value}</TableCell>
                            <TableCell className={`text-xs font-mono text-right py-1.5 ${pos.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {pos.pnl >= 0 ? "+" : ""}{pos.pnl} ({pos.pnlPct}%)
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* CONCENTRATION ENGINE TAB */}
            <TabsContent value="concentration" className="space-y-4">
              <Card className="bg-zinc-900/60 border-zinc-800/60">
                <CardHeader>
                  <CardTitle className="text-sm font-mono text-zinc-300 flex items-center gap-2">
                    <Target className="w-4 h-4 text-violet-400" /> Concentration Engine
                  </CardTitle>
                  <CardDescription className="text-xs text-zinc-500">
                    ROI analysis for capital reallocation into the Anchor position
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-zinc-800/40 rounded-lg p-4 border border-zinc-700/30">
                      <p className="text-[10px] text-zinc-500 font-mono">ANCHOR ALLOCATION</p>
                      <p className="text-2xl font-black font-mono text-violet-400">{data.concentration.anchorPct}%</p>
                      <p className="text-xs text-zinc-500">${data.concentration.anchorSize.toFixed(2)}</p>
                    </div>
                    <div className="bg-zinc-800/40 rounded-lg p-4 border border-zinc-700/30">
                      <p className="text-[10px] text-zinc-500 font-mono">RECOMMENDATION</p>
                      <p className={`text-2xl font-black font-mono ${
                        data.concentration.recommendation === "CONCENTRATE" ? "text-emerald-400" : "text-amber-400"
                      }`}>{data.concentration.recommendation}</p>
                    </div>
                    <div className="bg-zinc-800/40 rounded-lg p-4 border border-zinc-700/30">
                      <p className="text-[10px] text-zinc-500 font-mono">SATELLITES</p>
                      <p className="text-2xl font-black font-mono text-zinc-300">{data.concentration.suggestions.length}</p>
                      <p className="text-xs text-zinc-500">Liquidation candidates</p>
                    </div>
                  </div>

                  {data.concentration.suggestions.length > 0 ? (
                    <div className="space-y-3">
                      {data.concentration.suggestions.map((s, i) => (
                        <div key={i} className="bg-zinc-800/30 border border-zinc-700/30 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[9px]">{s.action}</Badge>
                              <span className="text-xs font-mono text-zinc-300">{s.from}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-zinc-500">→ +{s.toContracts} Anchor contracts</span>
                              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px]">
                                {s.roi}% ROI
                              </Badge>
                            </div>
                          </div>
                          <p className="text-[11px] text-zinc-400">{s.reasoning}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-zinc-500 text-sm">
                      No concentration signals active. Leader lead insufficient for reallocation.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* HEDGE CALCULATOR TAB */}
            <TabsContent value="hedge" className="space-y-4">
              {data.hedge && (
                <Card className="bg-zinc-900/60 border-zinc-800/60">
                  <CardHeader>
                    <CardTitle className="text-sm font-mono text-zinc-300 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-amber-400" /> Hedge Calculator
                    </CardTitle>
                    <CardDescription className="text-xs text-zinc-500">
                      Round Leader 'No' contracts to insure against a 3-stroke swing
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className={`p-4 rounded-lg border ${
                      data.hedge.urgency === "EMERGENCY" ? "bg-red-500/10 border-red-500/40" :
                      data.hedge.urgency === "HIGH" ? "bg-amber-500/10 border-amber-500/40" :
                      "bg-zinc-800/40 border-zinc-700/30"
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono text-zinc-400">HEDGE URGENCY</span>
                        <Badge className={`text-[9px] ${
                          data.hedge.urgency === "EMERGENCY" ? "bg-red-500/30 text-red-300 border-red-500/50" :
                          data.hedge.urgency === "HIGH" ? "bg-amber-500/30 text-amber-300 border-amber-500/50" :
                          data.hedge.urgency === "LOW" ? "bg-emerald-500/30 text-emerald-300 border-emerald-500/50" :
                          "bg-zinc-700 text-zinc-300 border-zinc-600"
                        }`}>{data.hedge.urgency}</Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <HedgeRow label="Anchor Cost (at risk)" value={`$${data.hedge.anchorCost.toFixed(2)}`} />
                        <HedgeRow label="Round Leader 'No' Price" value={`${(data.hedge.roundLeaderNoPrice * 100).toFixed(0)}¢`} />
                        <HedgeRow label="Contracts Needed" value={data.hedge.contractsNeeded.toString()} highlight />
                        <HedgeRow label="Hedge Cost" value={`$${data.hedge.hedgeCost.toFixed(2)}`} />
                      </div>
                      <div className="space-y-3">
                        <HedgeRow label="Protection Level" value={data.hedge.protectionLevel} />
                        <HedgeRow label="Max Loss if Swing" value={`$${data.hedge.maxLossIfSwing.toFixed(2)}`} />
                        <HedgeRow label="Corridor Status" value={data.hedge.corridorStatus} highlight />
                      </div>
                    </div>

                    <div className="bg-zinc-800/30 rounded-lg p-4 border border-zinc-700/20">
                      <p className="text-[10px] text-zinc-500 font-mono mb-2">HEDGE LOGIC</p>
                      <p className="text-xs text-zinc-400">
                        Buy <strong className="text-amber-400">{data.hedge.contractsNeeded}</strong> Round Leader 'No' contracts at{" "}
                        <strong className="text-amber-400">{(data.hedge.roundLeaderNoPrice * 100).toFixed(0)}¢</strong> each.
                        If the leader loses the round, each contract pays out $1.00, covering{" "}
                        <strong className="text-emerald-400">${(data.hedge.contractsNeeded * (1 - data.hedge.roundLeaderNoPrice)).toFixed(2)}</strong>{" "}
                        of the ${data.hedge.anchorCost.toFixed(2)} Anchor risk.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* TOP 10 WALL TRACKER TAB */}
            <TabsContent value="floor" className="space-y-4">
              <Card className="bg-zinc-900/60 border-zinc-800/60">
                <CardHeader>
                  <CardTitle className="text-sm font-mono text-zinc-300 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-blue-400" /> Top 10 Wall Tracker
                  </CardTitle>
                  <CardDescription className="text-xs text-zinc-500">
                    Top 5 players with Top 10 Yes contracts trading below 80¢ — Floor Stabilizers
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.floorStabilizers.length > 0 ? (
                    <div className="space-y-3">
                      {data.floorStabilizers.map((fs, i) => (
                        <div key={i} className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[9px]">
                                FLOOR STABILIZER
                              </Badge>
                              <span className="text-sm font-mono font-bold text-zinc-200">{fs.player}</span>
                              <span className="text-xs text-zinc-500">Rank #{fs.rank}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-black font-mono text-blue-400">
                                {(fs.top10Price * 100).toFixed(0)}¢
                              </span>
                              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[9px]">
                                {fs.discount}¢ DISCOUNT
                              </Badge>
                            </div>
                          </div>
                          <p className="text-[11px] text-zinc-400">{fs.reasoning}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-zinc-500 text-sm">
                      No Floor Stabilizers detected. All Top 5 players trading above 80¢.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}

function MetricCard({ label, value, sub, icon, badge, badgeColor }: {
  label: string; value: string; sub: string; icon: React.ReactNode; badge?: string; badgeColor?: string;
}) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    red: "bg-red-500/20 text-red-400 border-red-500/30",
    amber: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  };
  return (
    <Card className="bg-zinc-900/60 border-zinc-800/60">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-zinc-500 font-mono">{label}</span>
          {icon}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-black font-mono text-zinc-100">{value}</span>
          {badge && <Badge className={`text-[9px] ${colors[badgeColor || "amber"]}`}>{badge}</Badge>}
        </div>
        <p className="text-[10px] text-zinc-500 mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}

function CorridorRow({ label, active, color }: { label: string; active: boolean; color: string }) {
  const colorMap: Record<string, string> = { emerald: "bg-emerald-400", amber: "bg-amber-400", blue: "bg-blue-400" };
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${active ? colorMap[color] : "bg-zinc-600"}`} />
        <span className="text-xs text-zinc-400">{label}</span>
      </div>
      <span className={`text-[10px] font-mono font-bold ${active ? "text-emerald-400" : "text-zinc-600"}`}>
        {active ? "ACTIVE" : "INACTIVE"}
      </span>
    </div>
  );
}

function HedgeRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between bg-zinc-800/30 rounded px-3 py-2">
      <span className="text-[10px] text-zinc-500 font-mono">{label}</span>
      <span className={`text-xs font-mono font-bold ${highlight ? "text-amber-400" : "text-zinc-200"}`}>{value}</span>
    </div>
  );
}
