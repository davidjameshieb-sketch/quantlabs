import { useState, useEffect, useCallback, useRef, DragEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  RefreshCw, Circle, Zap, Activity, Clipboard,
  Sparkles, AlertTriangle, Loader2, X, ExternalLink
} from "lucide-react";

const SPORT_ICONS: Record<string, string> = {
  Basketball: "🏀", Baseball: "⚾", Hockey: "🏒", Soccer: "⚽", Tennis: "🎾",
  Golf: "⛳", Football: "🏈", "Aussie Rules": "🏈", Cricket: "🏏", Racing: "🏇",
  Esports: "🎮", Other: "📊", Politics: "🏛️", Economics: "📈", Entertainment: "🎬",
  Mentions: "💬", Science: "🔬", Companies: "🏢", Crypto: "₿", Climate: "🌍",
};

export default function KalshiSports() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeSport, setActiveSport] = useState("All");
  const [lastRefresh, setLastRefresh] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Paste-to-edge state
  const [pasteText, setPasteText] = useState("");
  const [scanning, setScanning] = useState(false);
  const [edgeResults, setEdgeResults] = useState<any>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: err } = await supabase.functions.invoke("kalshi-sports", {
        body: { sport: activeSport },
      });
      if (err) throw err;
      if (res.error) throw new Error(res.error);
      setData(res);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to fetch Kalshi data");
    } finally {
      setLoading(false);
    }
  }, [activeSport]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { const iv = setInterval(fetchData, 60000); return () => clearInterval(iv); }, [fetchData]);

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
      setEdgeResults({ error: e.message });
    } finally {
      setScanning(false);
    }
  }, []);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const text = e.dataTransfer.getData("text/plain");
    if (text) { setPasteText(text); scanForEdges(text); }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain");
    if (text && text.length > 10) { setPasteText(text); scanForEdges(text); }
  };

  if (!data && loading) {
    return (
      <div className="min-h-screen bg-[#08080d] flex items-center justify-center">
        <div className="text-center space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-emerald-400 mx-auto" />
          <p className="text-xs text-zinc-500 font-mono">Connecting to Kalshi API…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#08080d] text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800/50 bg-[#0b0b12]/90 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1680px] mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center">
              <Activity className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h1 className="text-xs font-bold tracking-widest text-zinc-100">KALSHI LIVE MARKETS</h1>
              <p className="text-[9px] text-zinc-600 font-mono">REAL-TIME DATA • api.elections.kalshi.com</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {data && (
              <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-500">
                <span className="text-emerald-400">● LIVE</span>
                <span>{data.stats.totalMarkets} markets</span>
                <span>{data.stats.totalEvents} events</span>
                <span>{data.stats.categories} categories</span>
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
        {/* Paste-to-Edge Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`rounded-lg border-2 border-dashed transition-all ${
            isDragging ? "border-emerald-500/60 bg-emerald-500/5" :
            edgeResults ? "border-zinc-700/40 bg-zinc-900/40" :
            "border-zinc-700/30 bg-zinc-900/30"
          }`}
        >
          {!edgeResults && !scanning && (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clipboard className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-mono font-bold text-zinc-300">PASTE KALSHI DATA → GET EDGES</span>
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[8px]">AI-POWERED</Badge>
              </div>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                onPaste={handlePaste}
                placeholder="Copy & paste any Kalshi page here — markets, prices, leaderboards — and AI will find every edge instantly…"
                className="w-full bg-zinc-800/40 border border-zinc-700/30 rounded-md p-3 text-xs text-zinc-300 placeholder-zinc-600 font-mono resize-none focus:outline-none focus:border-emerald-500/40 h-20"
              />
              {pasteText.length > 10 && (
                <Button size="sm" onClick={() => scanForEdges(pasteText)}
                  className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-[10px] px-3">
                  <Sparkles className="w-3 h-3 mr-1" /> Scan for Edges
                </Button>
              )}
            </div>
          )}
          {scanning && (
            <div className="p-8 flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              <p className="text-xs font-mono text-zinc-400">Gemini scanning {pasteText.length.toLocaleString()} chars…</p>
            </div>
          )}
          {edgeResults && !edgeResults.error && (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-mono font-bold text-zinc-200">{edgeResults.edges?.length || 0} EDGES FOUND</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setEdgeResults(null); setPasteText(""); }}
                    className="h-6 text-[9px] border-zinc-700 text-zinc-400 px-2"><X className="w-3 h-3 mr-0.5" /> Clear</Button>
                  <Button size="sm" variant="outline" onClick={() => scanForEdges(pasteText)}
                    className="h-6 text-[9px] border-zinc-700 text-zinc-400 px-2"><RefreshCw className="w-3 h-3 mr-0.5" /> Re-scan</Button>
                </div>
              </div>
              {edgeResults.summary && (
                <div className="bg-zinc-800/40 rounded-md p-3 mb-3 border border-zinc-700/20">
                  <p className="text-[11px] text-zinc-300">{edgeResults.summary}</p>
                  {edgeResults.risk_notes && (
                    <p className="text-[10px] text-amber-400/70 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {edgeResults.risk_notes}
                    </p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {(edgeResults.edges || []).map((edge: any, i: number) => (
                  <div key={i} className={`rounded-lg p-3 border ${
                    edge.confidence === "HIGH" ? "bg-emerald-500/5 border-emerald-500/25" :
                    edge.confidence === "MEDIUM" ? "bg-amber-500/5 border-amber-500/25" :
                    "bg-zinc-800/30 border-zinc-700/30"
                  }`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <Badge className={`text-[8px] px-1.5 py-0 ${
                        edge.confidence === "HIGH" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" :
                        edge.confidence === "MEDIUM" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                        "bg-zinc-700 text-zinc-400 border-zinc-600"
                      }`}>{edge.confidence}</Badge>
                      <Badge variant="outline" className="text-[7px] border-zinc-700 text-zinc-500 px-1 py-0">
                        {(edge.category || "EDGE").replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="text-[11px] font-medium text-zinc-200 mb-1">{edge.market}</p>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] text-zinc-400">
                        {edge.player_or_team} <strong className="text-zinc-200">{edge.side}</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-mono">
                      <span className="text-zinc-500">Now: <span className="text-zinc-300">{((edge.current_price || 0) * 100).toFixed(0)}¢</span></span>
                      <span className="text-zinc-500">Fair: <span className="text-emerald-400">{((edge.fair_value || 0) * 100).toFixed(0)}¢</span></span>
                      <span className="font-bold text-emerald-400">+{edge.edge_cents || 0}¢</span>
                    </div>
                    <p className="text-[9px] text-zinc-500 mt-1.5">{edge.reasoning}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {edgeResults?.error && (
            <div className="p-4">
              <Alert className="bg-red-500/10 border-red-500/30">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <AlertTitle className="text-xs text-red-300">Scan Failed</AlertTitle>
                <AlertDescription className="text-[10px] text-red-400">{edgeResults.error}</AlertDescription>
              </Alert>
              <Button size="sm" variant="outline" onClick={() => setEdgeResults(null)}
                className="mt-2 h-6 text-[9px] border-zinc-700 text-zinc-400 px-2">Try Again</Button>
            </div>
          )}
        </div>

        {/* Error state */}
        {error && (
          <Alert className="bg-red-500/10 border-red-500/30">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <AlertTitle className="text-xs text-red-300">Kalshi API Error</AlertTitle>
            <AlertDescription className="text-[10px] text-red-400">{error}</AlertDescription>
          </Alert>
        )}

        {/* Category Tabs */}
        {data && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <SportTab sport="All" count={data.stats.totalMarkets}
              active={activeSport === "All"} onClick={() => setActiveSport("All")} />
            {data.categories.map((c: any) => (
              <SportTab key={c.sport} sport={c.sport} count={c.total}
                active={activeSport === c.sport} onClick={() => setActiveSport(c.sport)} />
            ))}
          </div>
        )}

        {/* Markets Table */}
        {data && data.markets.length > 0 && (
          <Card className="bg-zinc-900/50 border-zinc-800/50">
            <CardHeader className="py-2 px-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[11px] font-mono text-zinc-400">
                  {activeSport === "All" ? "All Markets" : activeSport} — {data.stats.filteredMarkets} markets
                </CardTitle>
                <span className="text-[9px] font-mono text-zinc-600">Source: Kalshi Trade API v2</span>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800/40 hover:bg-transparent">
                    <TableHead className="text-[9px] text-zinc-600 w-12">Cat</TableHead>
                    <TableHead className="text-[9px] text-zinc-600">Event</TableHead>
                    <TableHead className="text-[9px] text-zinc-600">Market</TableHead>
                    <TableHead className="text-[9px] text-zinc-600 text-right">Yes</TableHead>
                    <TableHead className="text-[9px] text-zinc-600 text-right">No</TableHead>
                    <TableHead className="text-[9px] text-zinc-600 text-right">Bid/Ask</TableHead>
                    <TableHead className="text-[9px] text-zinc-600 text-right">Vol 24h</TableHead>
                    <TableHead className="text-[9px] text-zinc-600 text-right">OI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.markets.slice(0, 100).map((m: any, i: number) => {
                    const yesDisplay = m.yes_price > 0 ? (m.yes_price * 100).toFixed(0) : "—";
                    const noDisplay = m.no_price > 0 ? (m.no_price * 100).toFixed(0) : "—";
                    const bidAsk = m.yes_bid > 0 && m.yes_ask > 0
                      ? `${(m.yes_bid * 100).toFixed(0)}/${(m.yes_ask * 100).toFixed(0)}`
                      : "—";

                    return (
                      <TableRow key={m.ticker || i} className="border-zinc-800/30 hover:bg-zinc-800/20">
                        <TableCell className="text-[10px] py-1.5">
                          <span title={m.sport}>{SPORT_ICONS[m.sport] || "📊"}</span>
                        </TableCell>
                        <TableCell className="text-[10px] py-1.5 max-w-[200px]">
                          <div className="truncate text-zinc-400" title={m.event_title}>{m.event_title || m.event_ticker}</div>
                        </TableCell>
                        <TableCell className="text-[10px] py-1.5 max-w-[250px]">
                          <div className="truncate font-medium text-zinc-200" title={m.title}>
                            {m.title || m.subtitle || m.ticker}
                          </div>
                          <div className="text-[8px] text-zinc-600 font-mono">{m.ticker}</div>
                        </TableCell>
                        <TableCell className="text-[10px] font-mono text-right py-1.5">
                          <span className={`${Number(yesDisplay) > 70 ? "text-emerald-400" : Number(yesDisplay) < 30 ? "text-red-400" : "text-zinc-300"}`}>
                            {yesDisplay}¢
                          </span>
                        </TableCell>
                        <TableCell className="text-[10px] font-mono text-right py-1.5 text-zinc-400">
                          {noDisplay}¢
                        </TableCell>
                        <TableCell className="text-[10px] font-mono text-right py-1.5 text-zinc-500">
                          {bidAsk}
                        </TableCell>
                        <TableCell className="text-[9px] font-mono text-right py-1.5 text-zinc-500">
                          {m.volume_24h > 0 ? `${(m.volume_24h / 1000).toFixed(m.volume_24h > 10000 ? 0 : 1)}k` : "—"}
                        </TableCell>
                        <TableCell className="text-[9px] font-mono text-right py-1.5 text-zinc-600">
                          {m.open_interest > 0 ? m.open_interest.toLocaleString() : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {data.markets.length > 100 && (
                <div className="text-center py-2 text-[10px] text-zinc-600 border-t border-zinc-800/30">
                  Showing 100 of {data.markets.length} markets
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {data && data.markets.length === 0 && (
          <div className="text-center py-12 text-zinc-500 text-sm">
            No markets found{activeSport !== "All" ? ` for ${activeSport}` : ""}
          </div>
        )}
      </main>
    </div>
  );
}

function SportTab({ sport, count, active, onClick }: {
  sport: string; count: number; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-mono whitespace-nowrap transition-colors
        ${active ? "bg-zinc-800 text-zinc-100 border border-zinc-700" : "bg-zinc-900/40 text-zinc-500 border border-zinc-800/30 hover:bg-zinc-800/50 hover:text-zinc-300"}`}>
      {sport !== "All" && <span>{SPORT_ICONS[sport] || "📊"}</span>}
      <span>{sport}</span>
      <span className="text-zinc-600">{count}</span>
    </button>
  );
}
