import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  RefreshCw, Loader2, Target, AlertTriangle, DollarSign, Clock,
  ChevronDown, ChevronRight
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface SharkStock {
  rank: number;
  ticker: string;
  company_name: string;
  estimated_market_cap: string;
  price_range?: string;
  sector?: string;
  setup_type: string;
  setup_emoji?: string;
  political_theme: string;
  the_thesis: string;
  adv_estimate?: string;
  institutional_ownership_pct?: string;
  ttm_revenue?: string;
  short_interest_pct?: string;
  risk_profile: string;
  risk_color?: string;
  catalyst: string;
  catalyst_timeline?: string;
  bull_case: string;
  bear_case: string;
  strategy: string;
  why_not_zero?: string;
  theme_emoji?: string;
}

interface ScanResult {
  stocks: SharkStock[];
  market_context: string;
  scan_timestamp: string;
  total_picks: number;
  setups_covered: string[];
}

interface ScanErrorState {
  title: string;
  message: string;
  retryLabel: string;
}

const SETUP_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  POLITICAL_CATALYST: { label: "Political Catalyst", emoji: "🏛️", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  PROFIT_CROSSOVER: { label: "Profit Crossover", emoji: "📈", color: "bg-green-500/20 text-green-300 border-green-500/30" },
  SHORT_SQUEEZE: { label: "Short Squeeze", emoji: "🩳🔥", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  IP_HOSTAGE: { label: "IP Hostage", emoji: "🔐", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
};

const riskColors: Record<string, string> = {
  MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  HIGH: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  EXTREME: "bg-red-500/20 text-red-400 border-red-500/30",
};

const THEMES = [
  { id: "all", label: "All Setups", emoji: "🦈" },
  { id: "defense", label: "Defense", emoji: "🛡️" },
  { id: "energy", label: "Energy", emoji: "⚡" },
  { id: "border security", label: "Border", emoji: "🔒" },
  { id: "manufacturing", label: "Reshoring", emoji: "🏭" },
  { id: "infrastructure", label: "Infra", emoji: "🏗️" },
  { id: "crypto", label: "Crypto", emoji: "₿" },
  { id: "ai", label: "AI", emoji: "🤖" },
  { id: "space", label: "Space", emoji: "🚀" },
  { id: "tariff", label: "Tariff", emoji: "🇺🇸" },
  { id: "deregulation", label: "Dereg", emoji: "📜" },
];

const parseScanError = async (err: unknown): Promise<ScanErrorState> => {
  let status: number | undefined;
  const messages = new Set<string>();
  if (err instanceof Error && err.message) messages.add(err.message);
  if (err && typeof err === "object") {
    const c = err as any;
    if (typeof c.message === "string") messages.add(c.message);
    if (typeof c.error === "string") messages.add(c.error);
    if (typeof c.status === "number") status = c.status;
    if (c.context instanceof Response) {
      status = c.context.status;
      try { const p = await c.context.clone().json(); if (p?.error) messages.add(p.error); } catch {}
    }
  }
  const combined = Array.from(messages).join(" ").toLowerCase();
  if (status === 402 || combined.includes("ai credits exhausted"))
    return { title: "AI credits exhausted", message: "Add more credits in Settings → Workspace → Usage, then re-scan.", retryLabel: "Re-run after top-up" };
  if (status === 429 || combined.includes("rate limited"))
    return { title: "Rate limited", message: "Wait a moment, then try again.", retryLabel: "Try again shortly" };
  return { title: "Scanner unavailable", message: Array.from(messages)[0] || "Scan failed. Please retry.", retryLabel: "Try again" };
};

export default function PennyStocks() {
  const navigate = useNavigate();
  const [data, setData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState("all");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [filterSetup, setFilterSetup] = useState<string | null>(null);
  const [scanError, setScanError] = useState<ScanErrorState | null>(null);

  const runScan = useCallback(async () => {
    setLoading(true);
    setScanError(null);
    try {
      const { data: result, error } = await supabase.functions.invoke("penny-stock-scanner", {
        body: { theme: selectedTheme },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      setData(result);
      setScanError(null);
      toast.success(`Found ${result.total_picks} shark setups!`);
    } catch (err) {
      console.error("Scan failed:", err);
      const nextError = await parseScanError(err);
      setScanError(nextError);
      toast.error(nextError.title);
    } finally {
      setLoading(false);
    }
  }, [selectedTheme]);

  const toggleExpand = (ticker: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      next.has(ticker) ? next.delete(ticker) : next.add(ticker);
      return next;
    });
  };

  const filteredStocks = data?.stocks?.filter((s) =>
    !filterSetup || s.setup_type === filterSetup
  ) || [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1800px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🦈</span>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Shark Setup Scanner</h1>
              <p className="text-xs text-muted-foreground">Institutional-Grade • $75M-$300M Cap • ADV &gt; 750K • Real Revenue</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/alpha")}>← Kalshi</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>Senate</Button>
          </div>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto px-4 py-4 space-y-4">
        {/* Theme selector */}
        <div className="flex flex-wrap items-center gap-2">
          {THEMES.map((t) => (
            <Button key={t.id} size="sm" variant={selectedTheme === t.id ? "default" : "outline"} onClick={() => setSelectedTheme(t.id)} className="text-xs">
              {t.emoji} {t.label}
            </Button>
          ))}
          <div className="ml-auto">
            <Button onClick={runScan} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {loading ? "Scanning..." : "🦈 Run Shark Scan"}
            </Button>
          </div>
        </div>

        {scanError && (
          <Card className="border-destructive/30 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="space-y-2">
                <p className="text-sm font-semibold">{scanError.title}</p>
                <p className="text-sm text-muted-foreground">{scanError.message}</p>
                <Button size="sm" variant="outline" onClick={runScan} disabled={loading}>{scanError.retryLabel}</Button>
              </div>
            </div>
          </Card>
        )}

        {/* Market Context */}
        {data?.market_context && (
          <Card className="p-4 bg-primary/5 border-primary/20">
            <div className="flex items-start gap-2">
              <Target className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-primary mb-1">Macro Intelligence</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{data.market_context}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Stats + setup filter */}
        {data && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="gap-1"><DollarSign className="w-3 h-3" /> {data.total_picks} Setups</Badge>
            <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" /> {new Date(data.scan_timestamp).toLocaleTimeString()}</Badge>
            {Object.entries(SETUP_LABELS).map(([key, val]) => {
              const count = data.stocks.filter(s => s.setup_type === key).length;
              if (!count) return null;
              return (
                <Badge key={key} variant={filterSetup === key ? "default" : "secondary"} className="cursor-pointer text-xs" onClick={() => setFilterSetup(filterSetup === key ? null : key)}>
                  {val.emoji} {val.label} ({count})
                </Badge>
              );
            })}
          </div>
        )}

        {/* Hard Floors Badge Bar */}
        {data && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">✅ Cap $75M-$300M</Badge>
            <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">✅ ADV &gt; 750K</Badge>
            <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">✅ Inst. 2%-15%</Badge>
            <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">✅ TTM Rev &gt; $10M</Badge>
          </div>
        )}

        {/* Empty state */}
        {!data && !loading && !scanError && (
          <div className="text-center py-20 space-y-4">
            <div className="text-6xl">🦈</div>
            <h2 className="text-xl font-bold">Shark Setup Scanner</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Institutional-grade AI identifies small-caps ($75M-$300M) with real revenue, political catalysts,
              and structural setups primed for explosive repricing.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto text-xs">
              {Object.entries(SETUP_LABELS).map(([key, val]) => (
                <Card key={key} className="p-3 text-center">
                  <div className="text-2xl mb-1">{val.emoji}</div>
                  <p className="font-semibold">{val.label}</p>
                </Card>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Select a theme above, then hit "Run Shark Scan"</p>
          </div>
        )}

        {loading && (
          <div className="text-center py-20 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
            <p className="text-lg font-semibold">AI scanning for shark setups...</p>
            <p className="text-sm text-muted-foreground">Filtering $75M-$300M caps with real revenue and political catalysts</p>
          </div>
        )}

        {/* Stock Cards */}
        {filteredStocks.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredStocks.map((stock) => {
              const expanded = expandedCards.has(stock.ticker);
              const setup = SETUP_LABELS[stock.setup_type] || { label: stock.setup_type, emoji: "💰", color: "bg-muted text-muted-foreground" };
              return (
                <Card key={stock.ticker} className="p-0 overflow-hidden border-border/50 hover:border-primary/30 transition-colors">
                  <div className="p-3 cursor-pointer flex items-start justify-between gap-2" onClick={() => toggleExpand(stock.ticker)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-lg text-primary">{stock.ticker}</span>
                        <Badge className={`${setup.color} text-[10px] px-1.5`}>{setup.emoji} {setup.label}</Badge>
                        <Badge className={`${riskColors[stock.risk_profile] || riskColors.MEDIUM} text-[10px] px-1.5`}>{stock.risk_profile}</Badge>
                      </div>
                      <p className="text-sm font-medium truncate">{stock.company_name}</p>
                      <p className="text-xs text-muted-foreground">{stock.sector}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-green-400">{stock.estimated_market_cap}</p>
                      {stock.price_range && <p className="text-xs text-muted-foreground">{stock.price_range}</p>}
                      {expanded ? <ChevronDown className="w-3 h-3 ml-auto text-muted-foreground mt-1" /> : <ChevronRight className="w-3 h-3 ml-auto text-muted-foreground mt-1" />}
                    </div>
                  </div>

                  <div className="px-3 pb-2 flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">{stock.theme_emoji} {stock.political_theme}</Badge>
                    {stock.catalyst_timeline && <Badge variant="outline" className="text-[10px]"><Clock className="w-2.5 h-2.5 mr-1" />{stock.catalyst_timeline}</Badge>}
                  </div>

                  {/* Thesis always visible */}
                  <div className="px-3 pb-2">
                    <p className="text-xs leading-relaxed text-muted-foreground italic">"{stock.the_thesis}"</p>
                  </div>

                  {expanded && (
                    <div className="border-t border-border/50 p-3 space-y-3 bg-muted/20 text-sm">
                      {/* Quantitative Floors */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {stock.adv_estimate && (
                          <div className="bg-muted/30 rounded p-2 text-center">
                            <p className="text-[10px] text-muted-foreground">ADV</p>
                            <p className="text-xs font-bold">{stock.adv_estimate}</p>
                          </div>
                        )}
                        {stock.institutional_ownership_pct && (
                          <div className="bg-muted/30 rounded p-2 text-center">
                            <p className="text-[10px] text-muted-foreground">Inst. Own</p>
                            <p className="text-xs font-bold">{stock.institutional_ownership_pct}</p>
                          </div>
                        )}
                        {stock.ttm_revenue && (
                          <div className="bg-muted/30 rounded p-2 text-center">
                            <p className="text-[10px] text-muted-foreground">TTM Rev</p>
                            <p className="text-xs font-bold">{stock.ttm_revenue}</p>
                          </div>
                        )}
                        {stock.short_interest_pct && (
                          <div className="bg-muted/30 rounded p-2 text-center">
                            <p className="text-[10px] text-muted-foreground">Short %</p>
                            <p className="text-xs font-bold">{stock.short_interest_pct}</p>
                          </div>
                        )}
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">🎯 CATALYST</p>
                        <p className="text-xs leading-relaxed">{stock.catalyst}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-green-500/10 rounded p-2">
                          <p className="text-[10px] font-semibold text-green-400 mb-0.5">🐂 BULL</p>
                          <p className="text-[10px] leading-relaxed">{stock.bull_case}</p>
                        </div>
                        <div className="bg-red-500/10 rounded p-2">
                          <p className="text-[10px] font-semibold text-red-400 mb-0.5">🐻 BEAR</p>
                          <p className="text-[10px] leading-relaxed">{stock.bear_case}</p>
                        </div>
                      </div>

                      <div className="bg-primary/10 rounded p-2 border border-primary/20">
                        <p className="text-xs font-semibold text-primary mb-0.5">💰 STRATEGY</p>
                        <p className="text-xs leading-relaxed">{stock.strategy}</p>
                      </div>

                      <Badge variant="outline" className="text-[10px]">#{stock.rank} Pick</Badge>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {data && (
          <div className="text-center py-4">
            <p className="text-[10px] text-muted-foreground max-w-2xl mx-auto">
              ⚠️ AI-generated institutional analysis for research only. Not financial advice. Small-cap equities carry significant risk.
              All picks filtered: $75M-$300M cap, ADV &gt; 750K, TTM revenue &gt; $10M, inst. ownership 2-15%.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
