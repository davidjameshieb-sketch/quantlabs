import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer, Cell, PieChart, Pie
} from "recharts";
import {
  RefreshCw, Zap, Shield, Skull, DollarSign, Target, Flame, Lock,
  AlertTriangle, Loader2, TrendingUp, Activity, Eye, Calculator, Crosshair
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface PlayerGrid {
  rank: number; name: string;
  winnerYes: number; winnerNo: number;
  top10Yes: number; top10No: number;
  roundLeaderNo: number;
  winnerTicker: string; top10Ticker: string; roundLeaderTicker: string;
  winnerVolume: number; top10Volume: number;
  winnerOI: number; top10OI: number;
  anchor: { fairValue: number; edge: number; signal: string; reasoning: string } | null;
  floor: { signal: string; discount: number; reasoning: string; maxBet: number } | null;
  hedge: { signal: string; reasoning: string } | null;
  vegas: { signal: string; reasoning: string; urgency: string } | null;
  trim: { signal: string; reasoning: string; trimPct: number } | null;
  bet: { suggested: number; contracts: number; maxPayout: number; reasoning: string };
  estimatedLead: number | null;
  book: { bids: { price: number; depth: number }[]; asks: { price: number; depth: number }[]; spread: number; midpoint: number };
}

interface EdgeAlert {
  type: string; severity: string; signal: string; message: string;
  bet?: any; player?: string; urgency?: string; trimPct?: number;
}

interface Corridor { winnerActive: boolean; top10Floor: boolean; roundHedge: boolean; status: string; safetyPct: number; }

interface SynthesisData {
  playerGrid: PlayerGrid[];
  alerts: EdgeAlert[];
  corridor: Corridor;
  summary: any;
  markets: any[];
  events: any[];
  timestamp: string;
}

// ─── Position Tracker ───────────────────────────────────────────

interface Position {
  id: string; ticker: string; player: string; type: string;
  entryPrice: number; contracts: number; cost: number;
  currentPrice: number; pnl: number; pnlPct: number;
  status: "open" | "closed"; asset: string;
  loggedAt: string; closedAt?: string;
}

function loadPositions(): Position[] {
  try { return JSON.parse(localStorage.getItem("synthesis_positions") || "[]"); } catch { return []; }
}
function savePositions(p: Position[]) { localStorage.setItem("synthesis_positions", JSON.stringify(p)); }

// ─── Signal Badge ───────────────────────────────────────────────

function SignalBadge({ signal }: { signal: string | null }) {
  if (!signal) return <span className="text-[10px] text-[hsl(var(--nexus-text-muted))]">—</span>;
  const colors: Record<string, string> = {
    ALPHA_BUY: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
    CAPITAL_LOCK: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40",
    RISK_FREE_HEDGE: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    INSTANT_LIQUIDATION: "bg-red-500/20 text-red-400 border-red-500/40",
    TRIM_POSITION: "bg-orange-500/20 text-orange-400 border-orange-500/40",
    DELTA_ALERT: "bg-purple-500/20 text-purple-400 border-purple-500/40",
    WATCH: "bg-blue-500/20 text-blue-400 border-blue-500/40",
    OVERPRICED: "bg-rose-500/20 text-rose-400 border-rose-500/40",
  };
  return <Badge className={`text-[10px] font-mono border ${colors[signal] || "bg-muted text-muted-foreground"}`}>{signal}</Badge>;
}

// ─── Safety Meter ───────────────────────────────────────────────

function SafetyMeter({ corridor }: { corridor: Corridor }) {
  const color = corridor.status === "PROTECTED" ? "text-emerald-400" :
    corridor.status === "PARTIAL" ? "text-amber-400" : "text-red-400";
  const bgColor = corridor.status === "PROTECTED" ? "bg-emerald-500" :
    corridor.status === "PARTIAL" ? "bg-amber-500" : "bg-red-500";

  return (
    <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield className={`w-5 h-5 ${color}`} />
            <span className="font-mono text-sm font-bold">NO-LOSS CORRIDOR</span>
          </div>
          <Badge className={`font-mono text-xs ${corridor.status === "PROTECTED" ? "bg-emerald-500/20 text-emerald-400" :
            corridor.status === "PARTIAL" ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"
          }`}>
            {corridor.status}
          </Badge>
        </div>

        {/* Safety bar */}
        <div className="w-full h-3 bg-[hsl(var(--nexus-bg))] rounded-full overflow-hidden mb-3">
          <div className={`h-full rounded-full transition-all duration-500 ${bgColor}`}
            style={{ width: `${corridor.safetyPct}%` }} />
        </div>

        {/* 3 lights */}
        <div className="grid grid-cols-3 gap-2">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${corridor.winnerActive ? "bg-emerald-500 shadow-[0_0_8px_hsl(150_100%_50%/0.5)]" : "bg-red-500/40"}`} />
            <span className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))]">ANCHOR</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${corridor.top10Floor ? "bg-emerald-500 shadow-[0_0_8px_hsl(150_100%_50%/0.5)]" : "bg-red-500/40"}`} />
            <span className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))]">FLOOR</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${corridor.roundHedge ? "bg-emerald-500 shadow-[0_0_8px_hsl(150_100%_50%/0.5)]" : "bg-red-500/40"}`} />
            <span className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))]">HEDGE</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Order Book Widget ──────────────────────────────────────────

function OrderBook({ book, title }: { book: PlayerGrid["book"]; title: string }) {
  return (
    <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="font-mono text-xs text-[hsl(var(--nexus-text-muted))]">
          <Eye className="w-3 h-3 inline mr-1" /> {title} • Spread: {(book.spread * 100).toFixed(1)}¢
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
          <div>
            <p className="text-emerald-400 mb-1">BIDS</p>
            {book.bids.map((b, i) => (
              <div key={i} className="flex justify-between text-emerald-400/80">
                <span>{(b.price * 100).toFixed(0)}¢</span>
                <span>{b.depth}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="text-red-400 mb-1">ASKS</p>
            {book.asks.map((a, i) => (
              <div key={i} className="flex justify-between text-red-400/80">
                <span>{(a.price * 100).toFixed(0)}¢</span>
                <span>{a.depth}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ─────────────────────────────────────────────

export default function CommandCenter() {
  const [data, setData] = useState<SynthesisData | null>(null);
  const [universalData, setUniversalData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState("");
  const [budget, setBudget] = useState(25);
  const [positions, setPositions] = useState<Position[]>(loadPositions);
  const [activeTab, setActiveTab] = useState("corridor");
  const [selectedPlayer, setSelectedPlayer] = useState<number>(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [golfRes, uniRes] = await Promise.all([
        supabase.functions.invoke("alpha-synthesis-engine", { body: { budget_remaining: budget } }),
        supabase.functions.invoke("universal-alpha-scanner", { body: { confidence: 5, daily_budget: budget } }),
      ]);
      if (golfRes.error) throw golfRes.error;
      if (golfRes.data?.error) throw new Error(golfRes.data.error);
      setData(golfRes.data);
      if (!uniRes.error && !uniRes.data?.error) setUniversalData(uniRes.data);
      setLastRefresh(new Date().toLocaleTimeString());

      // Update open positions
      if (golfRes.data?.playerGrid) {
        setPositions(prev => {
          const updated = prev.map(p => {
            if (p.status === "closed") return p;
            const player = golfRes.data.playerGrid.find((pg: PlayerGrid) => pg.winnerTicker === p.ticker || pg.top10Ticker === p.ticker);
            if (player) {
              const cp = p.type === "winner" ? player.winnerYes : player.top10Yes;
              const pnl = (cp - p.entryPrice) * p.contracts;
              const pnlPct = p.cost > 0 ? (pnl / p.cost) * 100 : 0;
              return { ...p, currentPrice: cp, pnl: +pnl.toFixed(2), pnlPct: +pnlPct.toFixed(1) };
            }
            return p;
          });
          savePositions(updated);
          return updated;
        });
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [budget]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { const iv = setInterval(fetchData, 30000); return () => clearInterval(iv); }, [fetchData]);

  const logPosition = (player: PlayerGrid, type: "winner" | "top10") => {
    const price = type === "winner" ? player.winnerYes : player.top10Yes;
    const ticker = type === "winner" ? player.winnerTicker : player.top10Ticker;
    if (!ticker || price <= 0) return;
    const contracts = player.bet.contracts || Math.floor(1 / Math.max(price, 0.01));
    const pos: Position = {
      id: `${ticker}-${Date.now()}`, ticker, player: player.name, type,
      entryPrice: price, contracts, cost: +(price * contracts).toFixed(2),
      currentPrice: price, pnl: 0, pnlPct: 0,
      status: "open", asset: "Golf",
      loggedAt: new Date().toISOString(),
    };
    setPositions(prev => { const n = [pos, ...prev]; savePositions(n); return n; });
  };

  const closePosition = (id: string) => {
    setPositions(prev => {
      const n = prev.map(p => p.id === id ? { ...p, status: "closed" as const, closedAt: new Date().toISOString() } : p);
      savePositions(n);
      return n;
    });
  };

  const openPos = positions.filter(p => p.status === "open");
  const closedPos = positions.filter(p => p.status === "closed");
  const totalPnl = positions.reduce((s, p) => s + p.pnl, 0);
  const totalDeployed = openPos.reduce((s, p) => s + p.cost, 0);
  const realizedPnl = closedPos.reduce((s, p) => s + p.pnl, 0);
  const unrealizedPnl = openPos.reduce((s, p) => s + p.pnl, 0);

  // P&L heatmap data
  const pnlByAsset = [
    { name: "Golf", realized: +realizedPnl.toFixed(2), unrealized: +unrealizedPnl.toFixed(2) },
    ...(universalData?.heatmap?.slice(0, 4).map((h: any) => ({
      name: h.asset_class,
      realized: 0,
      unrealized: +(h.avg_alpha * h.count * 0.5).toFixed(2),
    })) || []),
  ];

  const selectedPlayerData = data?.playerGrid?.[selectedPlayer];

  return (
    <div className="min-h-screen bg-[hsl(var(--nexus-bg))] text-[hsl(var(--nexus-text-primary))]">
      {/* Header */}
      <div className="border-b border-[hsl(var(--nexus-border))] px-4 py-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-gradient-to-br from-emerald-500 via-cyan-500 to-purple-500 flex items-center justify-center">
              <Crosshair className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="text-lg font-bold font-[family-name:var(--font-mono)] tracking-tight">
                ALPHA SYNTHESIS ENGINE
              </h1>
              <p className="text-xs text-[hsl(var(--nexus-text-muted))]">
                Bhalloo-James Logic • Kalshi Live • {lastRefresh || "—"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`font-mono text-xs ${totalPnl >= 0 ? "text-emerald-400 border-emerald-500/30" : "text-red-400 border-red-500/30"}`}>
              P&L: {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs text-cyan-400 border-cyan-500/30">
              ${totalDeployed.toFixed(2)} deployed
            </Badge>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">VAULT</span>
              <div className="flex gap-1">
                {[10, 25, 50].map(b => (
                  <Button key={b} size="sm" variant={budget === b ? "default" : "outline"} onClick={() => setBudget(b)}
                    className={`text-[10px] font-mono h-6 px-2 ${budget === b
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "border-[hsl(var(--nexus-border))] bg-[hsl(var(--nexus-surface))] text-[hsl(var(--nexus-text-muted))]"
                    }`}>
                    ${b}
                  </Button>
                ))}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={fetchData} disabled={loading}
              className="border-[hsl(var(--nexus-border))] bg-[hsl(var(--nexus-surface))] text-[hsl(var(--nexus-text-primary))]">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <Alert className="m-4 bg-red-500/10 border-red-500/30">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertTitle className="text-red-400">Error</AlertTitle>
          <AlertDescription className="text-red-300">{error}</AlertDescription>
        </Alert>
      )}

      <div className="p-4 space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-[hsl(var(--nexus-surface))] border border-[hsl(var(--nexus-border))] flex-wrap h-auto">
            <TabsTrigger value="corridor" className="font-mono text-[10px] data-[state=active]:bg-[hsl(var(--nexus-surface-raised))] data-[state=active]:text-emerald-400">
              🛡️ CORRIDOR
            </TabsTrigger>
            <TabsTrigger value="grid" className="font-mono text-[10px] data-[state=active]:bg-[hsl(var(--nexus-surface-raised))] data-[state=active]:text-cyan-400">
              📊 PLAYER GRID
            </TabsTrigger>
            <TabsTrigger value="alerts" className="font-mono text-[10px] data-[state=active]:bg-[hsl(var(--nexus-surface-raised))] data-[state=active]:text-amber-400">
              ⚡ ALERTS ({data?.alerts.length || 0})
            </TabsTrigger>
            <TabsTrigger value="book" className="font-mono text-[10px] data-[state=active]:bg-[hsl(var(--nexus-surface-raised))] data-[state=active]:text-purple-400">
              📖 ORDER BOOK
            </TabsTrigger>
            <TabsTrigger value="pnl" className="font-mono text-[10px] data-[state=active]:bg-[hsl(var(--nexus-surface-raised))] data-[state=active]:text-emerald-400">
              💰 P&L HEATMAP
            </TabsTrigger>
            <TabsTrigger value="vault" className="font-mono text-[10px] data-[state=active]:bg-[hsl(var(--nexus-surface-raised))] data-[state=active]:text-amber-400">
              🏦 THE VAULT
            </TabsTrigger>
          </TabsList>

          {/* ─── CORRIDOR DASHBOARD ──────────────────────────── */}
          <TabsContent value="corridor" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data?.corridor && <SafetyMeter corridor={data.corridor} />}

              {/* Leader Card */}
              {data?.playerGrid?.[0] && (
                <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))] md:col-span-2">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="font-mono text-sm font-bold">{data.playerGrid[0].name}</p>
                        <p className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))]">
                          Tournament Leader • Est. {data.playerGrid[0].estimatedLead}-stroke lead
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-2xl font-bold text-emerald-400">
                          {(data.playerGrid[0].winnerYes * 100).toFixed(0)}¢
                        </p>
                        <p className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))]">Winner Yes</p>
                      </div>
                    </div>

                    {data.playerGrid[0].anchor && (
                      <div className="grid grid-cols-3 gap-3 mt-3">
                        <div className="p-2 rounded bg-[hsl(var(--nexus-bg))] border border-[hsl(var(--nexus-border))]">
                          <p className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">FAIR VALUE</p>
                          <p className="font-mono text-sm font-bold text-cyan-400">
                            {(data.playerGrid[0].anchor.fairValue * 100).toFixed(0)}¢
                          </p>
                        </div>
                        <div className="p-2 rounded bg-[hsl(var(--nexus-bg))] border border-[hsl(var(--nexus-border))]">
                          <p className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">EDGE</p>
                          <p className={`font-mono text-sm font-bold ${data.playerGrid[0].anchor.edge >= 0.15 ? "text-emerald-400" : "text-[hsl(var(--nexus-text-primary))]"}`}>
                            {(data.playerGrid[0].anchor.edge * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div className="p-2 rounded bg-[hsl(var(--nexus-bg))] border border-[hsl(var(--nexus-border))]">
                          <p className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">SIGNAL</p>
                          <SignalBadge signal={data.playerGrid[0].anchor.signal} />
                        </div>
                      </div>
                    )}

                    {/* Corridor breakdown */}
                    <div className="grid grid-cols-3 gap-3 mt-3">
                      <div className="p-2 rounded bg-[hsl(var(--nexus-bg))] border border-[hsl(var(--nexus-border))]">
                        <p className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">TOP 10 FLOOR</p>
                        <p className="font-mono text-sm font-bold">
                          {data.playerGrid[0].top10Yes > 0 ? `${(data.playerGrid[0].top10Yes * 100).toFixed(0)}¢` : "—"}
                        </p>
                      </div>
                      <div className="p-2 rounded bg-[hsl(var(--nexus-bg))] border border-[hsl(var(--nexus-border))]">
                        <p className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">ROUND LDR NO</p>
                        <p className="font-mono text-sm font-bold">
                          {data.playerGrid[0].roundLeaderNo > 0 ? `${(data.playerGrid[0].roundLeaderNo * 100).toFixed(0)}¢` : "—"}
                        </p>
                      </div>
                      <div className="p-2 rounded bg-[hsl(var(--nexus-bg))] border border-[hsl(var(--nexus-border))]">
                        <p className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">BET SIZE</p>
                        <p className="font-mono text-sm font-bold text-emerald-400">
                          ${data.playerGrid[0].bet.suggested.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Quick stats */}
            {data?.summary && (
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mt-4">
                {[
                  { label: "GOLF MKTS", value: data.summary.totalGolfMarkets, color: "text-cyan-400" },
                  { label: "WINNER", value: data.summary.winnerMarkets, color: "text-emerald-400" },
                  { label: "TOP 10", value: data.summary.top10Markets, color: "text-amber-400" },
                  { label: "RND LDR", value: data.summary.roundLeaderMarkets, color: "text-purple-400" },
                  { label: "BUDGET LEFT", value: `$${data.summary.budgetRemaining}`, color: "text-emerald-400" },
                  { label: "ALERTS", value: data.alerts.length, color: "text-red-400" },
                ].map((s, i) => (
                  <div key={i} className="p-2 rounded bg-[hsl(var(--nexus-surface))] border border-[hsl(var(--nexus-border))] text-center">
                    <p className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">{s.label}</p>
                    <p className={`font-mono text-sm font-bold ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── PLAYER GRID ─────────────────────────────────── */}
          <TabsContent value="grid" className="mt-4">
            <div className="rounded border border-[hsl(var(--nexus-border))] overflow-auto bg-[hsl(var(--nexus-surface))]">
              <Table>
                <TableHeader>
                  <TableRow className="border-[hsl(var(--nexus-border))] hover:bg-transparent">
                    {["#", "PLAYER", "WIN YES", "FV", "EDGE", "T10 YES", "RND NO", "SIGNAL", "BET", ""].map(h => (
                      <TableHead key={h} className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))]">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.playerGrid.map((p, i) => (
                    <TableRow key={i}
                      className={`border-[hsl(var(--nexus-border))] hover:bg-[hsl(var(--nexus-surface-raised))] cursor-pointer ${selectedPlayer === i ? "bg-[hsl(var(--nexus-surface-raised))]" : ""}`}
                      onClick={() => setSelectedPlayer(i)}>
                      <TableCell className="font-mono text-xs font-bold text-[hsl(var(--nexus-text-muted))]">{p.rank}</TableCell>
                      <TableCell>
                        <p className="font-mono text-xs font-bold">{p.name}</p>
                        <p className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))]">
                          Vol: {p.winnerVolume} • OI: {p.winnerOI}
                        </p>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-emerald-400 font-bold">{(p.winnerYes * 100).toFixed(0)}¢</TableCell>
                      <TableCell className="font-mono text-xs text-cyan-400">
                        {p.anchor ? `${(p.anchor.fairValue * 100).toFixed(0)}¢` : "—"}
                      </TableCell>
                      <TableCell className={`font-mono text-xs ${(p.anchor?.edge || 0) >= 0.15 ? "text-emerald-400 font-bold" : "text-[hsl(var(--nexus-text-muted))]"}`}>
                        {p.anchor ? `${(p.anchor.edge * 100).toFixed(1)}%` : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-amber-400">
                        {p.top10Yes > 0 ? `${(p.top10Yes * 100).toFixed(0)}¢` : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-purple-400">
                        {p.roundLeaderNo > 0 ? `${(p.roundLeaderNo * 100).toFixed(0)}¢` : "—"}
                      </TableCell>
                      <TableCell>
                        {p.vegas ? <SignalBadge signal="INSTANT_LIQUIDATION" /> :
                          p.anchor?.signal === "ALPHA_BUY" ? <SignalBadge signal="ALPHA_BUY" /> :
                          p.floor ? <SignalBadge signal="CAPITAL_LOCK" /> :
                          p.hedge ? <SignalBadge signal="RISK_FREE_HEDGE" /> :
                          p.trim ? <SignalBadge signal="TRIM_POSITION" /> :
                          <SignalBadge signal={p.anchor?.signal || null} />}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-cyan-400">
                        {p.bet.suggested > 0 ? `$${p.bet.suggested.toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {p.winnerYes > 0 && (
                            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); logPosition(p, "winner"); }}
                              className="h-6 w-6 p-0 text-emerald-400 hover:bg-emerald-500/10" title="Log Winner">
                              <TrendingUp className="w-3 h-3" />
                            </Button>
                          )}
                          {p.top10Yes > 0 && (
                            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); logPosition(p, "top10"); }}
                              className="h-6 w-6 p-0 text-amber-400 hover:bg-amber-500/10" title="Log Top 10">
                              <Lock className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ─── ALERTS ──────────────────────────────────────── */}
          <TabsContent value="alerts" className="mt-4 space-y-3">
            {data?.alerts.map((a, i) => {
              const severityColors: Record<string, string> = {
                critical: "bg-red-500/10 border-red-500/40",
                success: "bg-emerald-500/10 border-emerald-500/40",
                warning: "bg-amber-500/10 border-amber-500/40",
                info: "bg-blue-500/10 border-blue-500/40",
              };
              const iconMap: Record<string, any> = {
                ANCHOR_SCANNER: <Target className="w-4 h-4 text-emerald-400" />,
                FLOOR_WALL: <Lock className="w-4 h-4 text-cyan-400" />,
                HEDGE_GUARD: <Shield className="w-4 h-4 text-amber-400" />,
                VEGAS_PROTOCOL: <Skull className="w-4 h-4 text-red-400" />,
                DOUBLE_BOGEY: <AlertTriangle className="w-4 h-4 text-orange-400" />,
                MARKET_PANIC: <Activity className="w-4 h-4 text-purple-400" />,
              };

              return (
                <Alert key={i} className={severityColors[a.severity] || "bg-muted"}>
                  {iconMap[a.type] || <Zap className="w-4 h-4" />}
                  <AlertTitle className="font-mono text-sm flex items-center gap-2">
                    <SignalBadge signal={a.signal} />
                    {a.player && <span className="text-[hsl(var(--nexus-text-primary))]">{a.player}</span>}
                    {a.urgency === "CRITICAL" && <Flame className="w-3 h-3 text-red-400 animate-pulse" />}
                  </AlertTitle>
                  <AlertDescription className="text-xs font-mono mt-1 text-[hsl(var(--nexus-text-muted))]">
                    {a.message}
                    {a.bet && <span className="ml-2 text-cyan-400">${a.bet.suggested?.toFixed(2)} ({a.bet.contracts} contracts)</span>}
                  </AlertDescription>
                </Alert>
              );
            })}
            {(!data?.alerts || data.alerts.length === 0) && !loading && (
              <p className="text-center text-[hsl(var(--nexus-text-muted))] font-mono py-8">No active alerts — markets quiet</p>
            )}
          </TabsContent>

          {/* ─── ORDER BOOK ──────────────────────────────────── */}
          <TabsContent value="book" className="mt-4">
            {selectedPlayerData ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-4 h-4 text-purple-400" />
                  <span className="font-mono text-sm font-bold">{selectedPlayerData.name} — Order Book Depth</span>
                  <span className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))]">(Select player from Grid tab)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <OrderBook book={selectedPlayerData.book} title={`WINNER ${selectedPlayerData.winnerTicker}`} />
                  {selectedPlayerData.top10Ticker && (
                    <OrderBook book={selectedPlayerData.book} title={`TOP 10 ${selectedPlayerData.top10Ticker}`} />
                  )}
                </div>
                <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
                  <CardContent className="p-4">
                    <p className="font-mono text-xs text-amber-400 mb-2">⚠️ SLIPPAGE WARNING</p>
                    <p className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))]">
                      Kalshi public API provides top-of-book only. Displayed depth is estimated from volume and OI.
                      For $5.00 entries on thin markets (spread {">"}3¢), use limit orders to avoid slippage.
                    </p>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <p className="text-center text-[hsl(var(--nexus-text-muted))] font-mono py-8">Select a player from the Grid tab to view order book</p>
            )}
          </TabsContent>

          {/* ─── P&L HEATMAP ─────────────────────────────────── */}
          <TabsContent value="pnl" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
                <CardHeader className="pb-2">
                  <CardTitle className="font-mono text-sm text-emerald-400">REALIZED vs UNREALIZED</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={pnlByAsset}>
                      <XAxis dataKey="name" tick={{ fill: "hsl(215 15% 55%)", fontSize: 10, fontFamily: "monospace" }} />
                      <YAxis tick={{ fill: "hsl(215 15% 55%)", fontSize: 10, fontFamily: "monospace" }} />
                      <ReTooltip contentStyle={{ background: "hsl(225 28% 8%)", border: "1px solid hsl(220 25% 16%)", fontFamily: "monospace", fontSize: 11 }} />
                      <Bar dataKey="realized" fill="hsl(150 100% 50%)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="unrealized" fill="hsl(185 100% 55%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
                <CardHeader className="pb-2">
                  <CardTitle className="font-mono text-sm text-cyan-400">PORTFOLIO SUMMARY</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { label: "Total P&L", value: `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? "text-emerald-400" : "text-red-400" },
                      { label: "Realized", value: `${realizedPnl >= 0 ? "+" : ""}$${realizedPnl.toFixed(2)}`, color: realizedPnl >= 0 ? "text-emerald-400" : "text-red-400" },
                      { label: "Unrealized", value: `${unrealizedPnl >= 0 ? "+" : ""}$${unrealizedPnl.toFixed(2)}`, color: unrealizedPnl >= 0 ? "text-emerald-400" : "text-red-400" },
                      { label: "Deployed Capital", value: `$${totalDeployed.toFixed(2)}`, color: "text-amber-400" },
                      { label: "Open Positions", value: `${openPos.length}`, color: "text-cyan-400" },
                      { label: "Closed Positions", value: `${closedPos.length}`, color: "text-purple-400" },
                    ].map((item, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="font-mono text-xs text-[hsl(var(--nexus-text-muted))]">{item.label}</span>
                        <span className={`font-mono text-xs font-bold ${item.color}`}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─── THE VAULT ───────────────────────────────────── */}
          <TabsContent value="vault" className="mt-4 space-y-4">
            <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
              <CardHeader className="pb-2">
                <CardTitle className="font-mono text-sm text-amber-400 flex items-center gap-2">
                  <Lock className="w-4 h-4" /> RISK PROTOCOLS
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 rounded bg-[hsl(var(--nexus-bg))] border border-[hsl(var(--nexus-border))] text-center">
                    <p className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">DAILY BUDGET</p>
                    <p className="font-mono text-lg font-bold text-emerald-400">${budget}</p>
                  </div>
                  <div className="p-3 rounded bg-[hsl(var(--nexus-bg))] border border-[hsl(var(--nexus-border))] text-center">
                    <p className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">REMAINING</p>
                    <p className="font-mono text-lg font-bold text-cyan-400">
                      ${data?.summary ? data.summary.budgetRemaining : budget}
                    </p>
                  </div>
                  <div className="p-3 rounded bg-[hsl(var(--nexus-bg))] border border-[hsl(var(--nexus-border))] text-center">
                    <p className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">LOTTO CAP</p>
                    <p className="font-mono text-lg font-bold text-amber-400">$5.00</p>
                  </div>
                  <div className="p-3 rounded bg-[hsl(var(--nexus-bg))] border border-[hsl(var(--nexus-border))] text-center">
                    <p className="text-[10px] font-mono text-[hsl(var(--nexus-text-muted))]">MAX SINGLE</p>
                    <p className="font-mono text-lg font-bold text-purple-400">$5.00</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Open positions */}
            {openPos.length > 0 && (
              <Card className="bg-[hsl(var(--nexus-surface))] border-[hsl(var(--nexus-border))]">
                <CardHeader className="pb-2">
                  <CardTitle className="font-mono text-sm text-emerald-400">OPEN POSITIONS</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {openPos.map(p => (
                      <div key={p.id} className="flex items-center gap-3 p-2 rounded bg-[hsl(var(--nexus-bg))] border border-[hsl(var(--nexus-border))]">
                        <Badge variant="outline" className="text-[10px] font-mono border-[hsl(var(--nexus-border))] text-[hsl(var(--nexus-text-muted))]">{p.type}</Badge>
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-xs font-bold truncate">{p.player}</p>
                          <p className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))]">
                            {p.contracts}x @ {(p.entryPrice * 100).toFixed(0)}¢ → {(p.currentPrice * 100).toFixed(0)}¢
                          </p>
                        </div>
                        <div className="text-right">
                          <span className={`font-mono text-sm font-bold ${p.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {p.pnl >= 0 ? "+" : ""}{p.pnl.toFixed(2)}
                          </span>
                          <p className={`font-mono text-[10px] ${p.pnlPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {p.pnlPct >= 0 ? "+" : ""}{p.pnlPct.toFixed(0)}%
                          </p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => closePosition(p.id)}
                          className="h-6 px-2 text-[10px] font-mono text-red-400 hover:bg-red-500/10">CLOSE</Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {positions.length === 0 && (
              <p className="text-center text-[hsl(var(--nexus-text-muted))] font-mono py-8">
                No positions logged. Use ↗ (Winner) or 🔒 (Top 10) buttons in the Player Grid.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Nav footer */}
      <div className="border-t border-[hsl(var(--nexus-border))] px-4 py-2 flex gap-2 flex-wrap">
        <a href="/golf" className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] hover:text-emerald-400 transition-colors">⛳ GOLF</a>
        <span className="text-[hsl(var(--nexus-border))]">|</span>
        <a href="/alpha" className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] hover:text-cyan-400 transition-colors">🎯 UNIVERSAL</a>
        <span className="text-[hsl(var(--nexus-border))]">|</span>
        <a href="/sports" className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] hover:text-purple-400 transition-colors">📊 SPORTS</a>
        <span className="text-[hsl(var(--nexus-border))]">|</span>
        <a href="/" className="font-mono text-[10px] text-[hsl(var(--nexus-text-muted))] hover:text-amber-400 transition-colors">🏠 HOME</a>
      </div>
    </div>
  );
}
