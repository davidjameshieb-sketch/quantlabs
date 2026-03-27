import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  RefreshCw, Loader2, Target, AlertTriangle, DollarSign, Clock,
  ChevronDown, ChevronRight, TrendingUp, Shield, Flame, BarChart3,
  Brain, Users, Cpu, Star
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface VolatileStock {
  rank: number;
  ticker: string;
  company_name: string;
  sector: string;
  sub_sector?: string;
  estimated_market_cap: string;
  price_range?: string;
  avg_daily_volume?: string;
  financial_health_score: number;
  revenue_growth_score?: number;
  gross_margin_score?: number;
  debt_health_score?: number;
  cash_flow_score?: number;
  balance_sheet_score?: number;
  ttm_revenue?: string;
  gross_margin_pct?: string;
  debt_to_equity?: string;
  cash_position?: string;
  leadership_score: number;
  ceo_score?: number;
  engineering_team_score?: number;
  talent_density_score?: number;
  ceo_name: string;
  ceo_background: string;
  notable_talent?: string;
  ai_score: number;
  ai_product_maturity?: number;
  ai_moat_score?: number;
  ai_revenue_pct?: number;
  ai_innovation_score?: number;
  ai_product_description: string;
  sector_growth_score: number;
  sector_tailwind?: string;
  sector_momentum?: string;
  volatility_tag: string;
  avg_weekly_range_pct?: string;
  why_volatile: string;
  why_solid: string;
  setup_type: string;
  setup_emoji?: string;
  vol_emoji?: string;
  health_grade?: string;
  sector_grade?: string;
  the_thesis: string;
  catalyst: string;
  catalyst_timeline?: string;
  bull_case: string;
  bear_case: string;
  entry_strategy: string;
  why_not_zero: string;
  dilution_risk_score?: number;
  share_stability_score?: number;
  insider_ownership_pct?: number;
  shelf_registration_risk?: number;
  dilution_history?: string;
  shares_outstanding?: string;
  dilution_note?: string;
}

interface SectorRanking {
  sector: string;
  growth_score: number;
  tailwind: string;
  momentum: string;
  stock_count: number;
}

interface ScanResult {
  stocks: VolatileStock[];
  sector_rankings: SectorRanking[];
  market_context: string;
  scan_timestamp: string;
  total_picks: number;
}

const SETUP_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  POLITICAL_CATALYST: { label: "Political Catalyst", emoji: "🏛️", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  PROFIT_CROSSOVER: { label: "Profit Crossover", emoji: "📈", color: "bg-green-500/20 text-green-300 border-green-500/30" },
  SHORT_SQUEEZE: { label: "Short Squeeze", emoji: "🩳🔥", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  IP_HOSTAGE: { label: "IP Hostage", emoji: "🔐", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
};

const VOL_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  EXTREME_SWINGS: { label: "Extreme Swings", emoji: "🌊", color: "bg-red-500/20 text-red-300" },
  HIGH_BETA: { label: "High Beta", emoji: "⚡", color: "bg-yellow-500/20 text-yellow-300" },
  NEWS_DRIVEN: { label: "News Driven", emoji: "📰", color: "bg-cyan-500/20 text-cyan-300" },
  MOMENTUM_SURFER: { label: "Momentum Surfer", emoji: "🏄", color: "bg-indigo-500/20 text-indigo-300" },
};

const AI_SECTORS = [
  { id: "all", label: "All AI", emoji: "🤖" },
  { id: "ai infrastructure", label: "AI Infra", emoji: "🖥️" },
  { id: "cybersecurity", label: "AI Cyber", emoji: "🔒" },
  { id: "defense", label: "AI Defense", emoji: "🛡️" },
  { id: "edge ai", label: "Edge AI", emoji: "📡" },
  { id: "fintech", label: "AI Fintech", emoji: "💳" },
  { id: "computer vision", label: "Vision/Robotics", emoji: "👁️" },
  { id: "nlp", label: "NLP/Chat", emoji: "💬" },
  { id: "data", label: "AI Data", emoji: "📊" },
  { id: "vertical", label: "Vertical AI", emoji: "🏢" },
  { id: "developer tools", label: "Dev Tools", emoji: "🛠️" },
  { id: "generative", label: "GenAI", emoji: "🎨" },
];

const getScoreColor = (score: number) => {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-green-400";
  if (score >= 40) return "text-yellow-400";
  if (score >= 20) return "text-orange-400";
  return "text-red-400";
};

const getScoreBg = (score: number) => {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-green-500";
  if (score >= 40) return "bg-yellow-500";
  if (score >= 20) return "bg-orange-500";
  return "bg-red-500";
};

const getGradeColor = (grade: string) => {
  if (grade?.startsWith("A")) return "text-emerald-400 bg-emerald-500/20 border-emerald-500/30";
  if (grade?.startsWith("B")) return "text-green-400 bg-green-500/20 border-green-500/30";
  if (grade?.startsWith("C")) return "text-yellow-400 bg-yellow-500/20 border-yellow-500/30";
  return "text-red-400 bg-red-500/20 border-red-500/30";
};

const getGrade = (score: number): string => {
  if (score >= 85) return "A+";
  if (score >= 75) return "A";
  if (score >= 65) return "B+";
  if (score >= 55) return "B";
  if (score >= 45) return "C+";
  if (score >= 35) return "C";
  return "D";
};

const getMomentumEmoji = (m: string) => {
  if (m === "accelerating") return "🚀";
  if (m === "steady") return "📊";
  return "🌱";
};

const parseScanError = async (err: unknown) => {
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
  if (status === 402 || combined.includes("credits"))
    return { title: "AI credits exhausted", message: "Add more credits in Settings → Workspace → Usage.", retryLabel: "Re-run after top-up" };
  if (status === 429 || combined.includes("rate"))
    return { title: "Rate limited", message: "Wait a moment, then try again.", retryLabel: "Try again" };
  return { title: "Scanner error", message: Array.from(messages)[0] || "Scan failed.", retryLabel: "Retry" };
};

function ScoreBar({ label, score, icon }: { label: string; score: number; icon?: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground flex items-center gap-1">{icon}{label}</span>
        <span className={`font-bold ${getScoreColor(score)}`}>{score}</span>
      </div>
      <Progress value={score} className={`h-1.5 [&>div]:${getScoreBg(score)}`} />
    </div>
  );
}

const STORAGE_KEY = "volatile-gems-scan-cache";

function loadCachedScan(): ScanResult | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ScanResult;
  } catch { return null; }
}

function saveScanToCache(result: ScanResult) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(result)); } catch {}
}

export default function PennyStocks() {
  const navigate = useNavigate();
  const [data, setData] = useState<ScanResult | null>(() => loadCachedScan());
  const [loading, setLoading] = useState(false);
  const [selectedSector, setSelectedSector] = useState("all");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [scanError, setScanError] = useState<{ title: string; message: string; retryLabel: string } | null>(null);

  const runScan = useCallback(async () => {
    setLoading(true);
    setScanError(null);
    try {
      const { data: result, error } = await supabase.functions.invoke("penny-stock-scanner", {
        body: { sector: selectedSector },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      setData(result);
      saveScanToCache(result);
      toast.success(`Found ${result.total_picks} AI gems!`);
    } catch (err) {
      console.error("Scan failed:", err);
      const e = await parseScanError(err);
      setScanError(e);
      toast.error(e.title);
    } finally {
      setLoading(false);
    }
  }, [selectedSector]);

  const toggleExpand = (ticker: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      next.has(ticker) ? next.delete(ticker) : next.add(ticker);
      return next;
    });
  };

  const sectorGroups = useMemo(() => {
    if (!data?.stocks) return [];
    const groups: Record<string, VolatileStock[]> = {};
    for (const s of data.stocks) {
      const key = s.sector || "Other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    }
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0));
    }
    const entries = Object.entries(groups);
    entries.sort((a, b) => {
      const avgA = a[1].reduce((sum, s) => sum + (s.sector_growth_score || 0), 0) / a[1].length;
      const avgB = b[1].reduce((sum, s) => sum + (s.sector_growth_score || 0), 0) / b[1].length;
      return avgB - avgA;
    });
    return entries;
  }, [data]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1800px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧠</span>
            <div>
              <h1 className="text-lg font-bold tracking-tight">AI Hidden Gems Scanner</h1>
              <p className="text-xs text-muted-foreground">50 AI Stocks • Elite Leadership • Cap &lt; $500M • Scored by AI Strength + Leadership + Financials</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/alpha")}>← Kalshi</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>Senate</Button>
          </div>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto px-4 py-4 space-y-4">
        {/* Sector selector */}
        <div className="flex flex-wrap items-center gap-2">
          {AI_SECTORS.map((s) => (
            <Button key={s.id} size="sm" variant={selectedSector === s.id ? "default" : "outline"} onClick={() => setSelectedSector(s.id)} className="text-xs">
              {s.emoji} {s.label}
            </Button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {data && (
              <Button variant="outline" size="sm" onClick={() => { localStorage.removeItem(STORAGE_KEY); setData(null); toast.info("Cache cleared"); }}>
                Clear Cache
              </Button>
            )}
            <Button onClick={runScan} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
              {loading ? "Scanning..." : "🧠 Find AI Gems"}
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

        {data?.market_context && (
          <Card className="p-4 bg-primary/5 border-primary/20">
            <div className="flex items-start gap-2">
              <Target className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-primary mb-1">AI Market Intelligence</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{data.market_context}</p>
              </div>
            </div>
          </Card>
        )}

        {data?.sector_rankings && data.sector_rankings.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-bold flex items-center gap-2"><BarChart3 className="w-4 h-4" /> AI Sector Growth Rankings</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
              {data.sector_rankings
                .sort((a, b) => b.growth_score - a.growth_score)
                .map((sr) => (
                  <Card key={sr.sector} className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold truncate">{sr.sector}</p>
                      <span className={`text-sm font-black ${getScoreColor(sr.growth_score)}`}>{sr.growth_score}</span>
                    </div>
                    <Progress value={sr.growth_score} className="h-1.5" />
                    <p className="text-[10px] text-muted-foreground leading-tight">{sr.tailwind}</p>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px]">{getMomentumEmoji(sr.momentum)}</span>
                      <span className="text-[10px] capitalize text-muted-foreground">{sr.momentum}</span>
                      <Badge variant="outline" className="text-[8px] ml-auto px-1">{sr.stock_count} picks</Badge>
                    </div>
                  </Card>
                ))}
            </div>
          </div>
        )}

        {data && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">✅ AI Product Required</Badge>
            <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">✅ Cap &lt; $500M</Badge>
            <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">✅ Elite Leadership</Badge>
            <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">✅ Revenue &gt; $3M</Badge>
            <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">✅ NYSE/NASDAQ</Badge>
            <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">✅ Zero Pharma</Badge>
            <Badge variant="outline" className="text-[10px] border-primary/30 text-primary ml-auto">{data.total_picks} AI Gems Found</Badge>
            {data.scan_timestamp && (
              <Badge variant="outline" className="text-[10px] border-muted-foreground/30 text-muted-foreground">
                <Clock className="w-3 h-3 mr-1" />
                {new Date(data.scan_timestamp).toLocaleString()}
              </Badge>
            )}
          </div>
        )}

        {!data && !loading && !scanError && (
          <div className="text-center py-20 space-y-4">
            <div className="text-6xl">🧠</div>
            <h2 className="text-xl font-bold">AI Hidden Gems Scanner</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Find 50 AI stocks with ELITE engineering teams, visionary CEOs, and real AI products.
              Under $500M cap, scored by AI strength, leadership quality, and financial health.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl mx-auto text-xs">
              <Card className="p-3 text-center">
                <div className="text-2xl mb-1">🧠</div>
                <p className="font-semibold text-[11px]">AI Product Score</p>
              </Card>
              <Card className="p-3 text-center">
                <div className="text-2xl mb-1">👑</div>
                <p className="font-semibold text-[11px]">Leadership Score</p>
              </Card>
              <Card className="p-3 text-center">
                <div className="text-2xl mb-1">💰</div>
                <p className="font-semibold text-[11px]">Financial Health</p>
              </Card>
              <Card className="p-3 text-center">
                <div className="text-2xl mb-1">🚀</div>
                <p className="font-semibold text-[11px]">Sector Growth</p>
              </Card>
            </div>
            <p className="text-xs text-muted-foreground">Select an AI sub-sector, then hit "Find AI Gems"</p>
          </div>
        )}

        {loading && (
          <div className="text-center py-20 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
            <p className="text-lg font-semibold">Scanning for AI hidden gems...</p>
            <p className="text-sm text-muted-foreground">Finding 50 AI stocks with elite teams and real products</p>
          </div>
        )}

        {sectorGroups.map(([sectorName, stocks]) => {
          const avgAI = Math.round(stocks.reduce((s, st) => s + (st.ai_score || 0), 0) / stocks.length);
          const avgLeadership = Math.round(stocks.reduce((s, st) => s + (st.leadership_score || 0), 0) / stocks.length);
          const avgHealth = Math.round(stocks.reduce((s, st) => s + (st.financial_health_score || 0), 0) / stocks.length);
          return (
            <div key={sectorName} className="space-y-2">
              <div className="flex items-center gap-3 py-2 border-b border-border flex-wrap">
                <h2 className="text-base font-bold">{sectorName}</h2>
                <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px]">
                  <Brain className="w-3 h-3 mr-1" /> AI: {avgAI}/100
                </Badge>
                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px]">
                  <Users className="w-3 h-3 mr-1" /> Leadership: {avgLeadership}/100
                </Badge>
                <Badge className={`${getGradeColor(getGrade(avgHealth))} text-[10px]`}>
                  <Shield className="w-3 h-3 mr-1" /> Health: {avgHealth}/100
                </Badge>
                <span className="text-xs text-muted-foreground ml-auto">{stocks.length} stocks</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {stocks.map((stock) => {
                  const expanded = expandedCards.has(stock.ticker);
                  const setup = SETUP_LABELS[stock.setup_type] || { label: stock.setup_type, emoji: "💰", color: "bg-muted" };
                  const vol = VOL_LABELS[stock.volatility_tag] || { label: stock.volatility_tag, emoji: "⚡", color: "bg-muted" };
                  return (
                    <Card key={stock.ticker} className="p-0 overflow-hidden border-border/50 hover:border-primary/30 transition-colors">
                      <div className="p-3 cursor-pointer" onClick={() => toggleExpand(stock.ticker)}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="font-mono font-bold text-lg text-primary">{stock.ticker}</span>
                              <Badge className={`${vol.color} text-[9px] px-1`}>{vol.emoji} {vol.label}</Badge>
                            </div>
                            <p className="text-sm font-medium truncate">{stock.company_name}</p>
                            <p className="text-[10px] text-muted-foreground">{stock.sub_sector || stock.sector}</p>
                          </div>
                          <div className="text-right shrink-0 space-y-0.5">
                            <p className="text-sm font-bold text-green-400">{stock.estimated_market_cap}</p>
                            {stock.price_range && <p className="text-[10px] text-muted-foreground">{stock.price_range}</p>}
                            {expanded ? <ChevronDown className="w-3 h-3 ml-auto text-muted-foreground" /> : <ChevronRight className="w-3 h-3 ml-auto text-muted-foreground" />}
                          </div>
                        </div>

                        {/* 4-Score Row */}
                        <div className="grid grid-cols-5 gap-1.5 mb-2">
                          <div className="bg-purple-500/10 rounded px-1.5 py-1.5 text-center">
                            <p className="text-[8px] text-purple-300">🧠 AI</p>
                            <p className={`text-base font-black ${getScoreColor(stock.ai_score)}`}>{stock.ai_score}</p>
                          </div>
                          <div className="bg-amber-500/10 rounded px-1.5 py-1.5 text-center">
                            <p className="text-[8px] text-amber-300">👑 Lead</p>
                            <p className={`text-base font-black ${getScoreColor(stock.leadership_score)}`}>{stock.leadership_score}</p>
                          </div>
                          <div className="bg-muted/30 rounded px-1.5 py-1.5 text-center">
                            <p className="text-[8px] text-muted-foreground">💰 Finance</p>
                            <p className={`text-base font-black ${getScoreColor(stock.financial_health_score)}`}>{stock.financial_health_score}</p>
                          </div>
                          <div className="bg-muted/30 rounded px-1.5 py-1.5 text-center">
                            <p className="text-[8px] text-muted-foreground">🚀 Sector</p>
                            <p className={`text-base font-black ${getScoreColor(stock.sector_growth_score)}`}>{stock.sector_growth_score}</p>
                          </div>
                          <div className={`rounded px-1.5 py-1.5 text-center ${(stock.dilution_risk_score ?? 50) >= 70 ? 'bg-emerald-500/10' : (stock.dilution_risk_score ?? 50) >= 40 ? 'bg-yellow-500/10' : 'bg-red-500/10'}`}>
                            <p className="text-[8px] text-muted-foreground">🛡️ Dilution</p>
                            <p className={`text-base font-black ${getScoreColor(stock.dilution_risk_score ?? 50)}`}>{stock.dilution_risk_score ?? '—'}</p>
                          </div>
                        </div>

                        {/* Dilution Badge */}
                        {stock.dilution_history && (
                          <div className="mb-2">
                            <Badge className={`text-[9px] px-1.5 ${
                              stock.dilution_history === 'CLEAN' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                              stock.dilution_history === 'MINOR' ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                              stock.dilution_history === 'WARNING' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                              'bg-red-500/30 text-red-200 border-red-500/50'
                            }`}>
                              {stock.dilution_history === 'CLEAN' ? '✅ No Dilution' :
                               stock.dilution_history === 'MINOR' ? '🟡 Minor Dilution' :
                               stock.dilution_history === 'WARNING' ? '⚠️ Dilution Warning' :
                               '🚫 Serial Diluter'}
                            </Badge>
                          </div>
                        )}

                        {/* CEO & AI Product */}
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div className="bg-amber-500/10 rounded p-1.5">
                            <p className="text-[9px] font-semibold text-amber-400">👑 CEO: {stock.ceo_name}</p>
                            <p className="text-[10px] leading-tight">{stock.ceo_background}</p>
                          </div>
                          <div className="bg-purple-500/10 rounded p-1.5">
                            <p className="text-[9px] font-semibold text-purple-400">🧠 AI PRODUCT</p>
                            <p className="text-[10px] leading-tight">{stock.ai_product_description}</p>
                          </div>
                        </div>

                        {/* Why volatile / why solid */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-orange-500/10 rounded p-1.5">
                            <p className="text-[9px] font-semibold text-orange-400">🌊 WHY IT SWINGS</p>
                            <p className="text-[10px] leading-tight">{stock.why_volatile}</p>
                          </div>
                          <div className="bg-emerald-500/10 rounded p-1.5">
                            <p className="text-[9px] font-semibold text-emerald-400">🛡️ WHY IT'S SOLID</p>
                            <p className="text-[10px] leading-tight">{stock.why_solid}</p>
                          </div>
                        </div>
                      </div>

                      <div className="px-3 pb-2">
                        <p className="text-[10px] leading-relaxed text-muted-foreground italic">"{stock.the_thesis}"</p>
                      </div>

                      {expanded && (
                        <div className="border-t border-border/50 p-3 space-y-3 bg-muted/20 text-sm">
                          {/* AI Product Breakdown */}
                          <div>
                            <p className="text-xs font-bold mb-2">🧠 AI Product Breakdown</p>
                            <div className="space-y-1.5">
                              {stock.ai_product_maturity != null && <ScoreBar label="Product Maturity" score={stock.ai_product_maturity} icon={<Cpu className="w-2.5 h-2.5" />} />}
                              {stock.ai_moat_score != null && <ScoreBar label="AI Moat" score={stock.ai_moat_score} icon={<Shield className="w-2.5 h-2.5" />} />}
                              {stock.ai_revenue_pct != null && <ScoreBar label="AI Revenue %" score={stock.ai_revenue_pct} />}
                              {stock.ai_innovation_score != null && <ScoreBar label="Innovation" score={stock.ai_innovation_score} icon={<Star className="w-2.5 h-2.5" />} />}
                            </div>
                          </div>

                          {/* Leadership Breakdown */}
                          <div>
                            <p className="text-xs font-bold mb-2">👑 Leadership Breakdown</p>
                            <div className="space-y-1.5">
                              {stock.ceo_score != null && <ScoreBar label="CEO Quality" score={stock.ceo_score} icon={<Users className="w-2.5 h-2.5" />} />}
                              {stock.engineering_team_score != null && <ScoreBar label="Engineering Team" score={stock.engineering_team_score} icon={<Brain className="w-2.5 h-2.5" />} />}
                              {stock.talent_density_score != null && <ScoreBar label="Talent Density" score={stock.talent_density_score} />}
                            </div>
                            {stock.notable_talent && (
                              <p className="text-[10px] text-muted-foreground mt-1.5">🌟 <strong>Notable:</strong> {stock.notable_talent}</p>
                            )}
                          </div>

                          {/* Financial Health Breakdown */}
                          <div>
                            <p className="text-xs font-bold mb-2">📊 Financial Health Breakdown</p>
                            <div className="space-y-1.5">
                              {stock.revenue_growth_score != null && <ScoreBar label="Revenue Growth" score={stock.revenue_growth_score} icon={<TrendingUp className="w-2.5 h-2.5" />} />}
                              {stock.gross_margin_score != null && <ScoreBar label="Gross Margins" score={stock.gross_margin_score} />}
                              {stock.debt_health_score != null && <ScoreBar label="Debt Health" score={stock.debt_health_score} />}
                              {stock.cash_flow_score != null && <ScoreBar label="Cash Flow" score={stock.cash_flow_score} />}
                              {stock.balance_sheet_score != null && <ScoreBar label="Balance Sheet" score={stock.balance_sheet_score} icon={<Shield className="w-2.5 h-2.5" />} />}
                            </div>
                          </div>

                          {/* Dilution Protection Breakdown */}
                          <div>
                            <p className="text-xs font-bold mb-2">🛡️ Dilution Protection</p>
                            <div className="space-y-1.5">
                              {stock.dilution_risk_score != null && <ScoreBar label="Dilution Safety" score={stock.dilution_risk_score} icon={<Shield className="w-2.5 h-2.5" />} />}
                              {stock.share_stability_score != null && <ScoreBar label="Share Count Stability" score={stock.share_stability_score} />}
                              {stock.shelf_registration_risk != null && <ScoreBar label="No Shelf Registration" score={stock.shelf_registration_risk} />}
                            </div>
                            <div className="grid grid-cols-3 gap-2 mt-2">
                              {stock.insider_ownership_pct != null && (
                                <div className="bg-muted/30 rounded p-2 text-center">
                                  <p className="text-[9px] text-muted-foreground">Insider Own %</p>
                                  <p className="text-xs font-bold">{stock.insider_ownership_pct}%</p>
                                </div>
                              )}
                              {stock.shares_outstanding && (
                                <div className="bg-muted/30 rounded p-2 text-center">
                                  <p className="text-[9px] text-muted-foreground">Shares Out</p>
                                  <p className="text-xs font-bold">{stock.shares_outstanding}</p>
                                </div>
                              )}
                              {stock.dilution_history && (
                                <div className={`rounded p-2 text-center ${
                                  stock.dilution_history === 'CLEAN' ? 'bg-emerald-500/10' :
                                  stock.dilution_history === 'MINOR' ? 'bg-green-500/10' :
                                  'bg-red-500/10'
                                }`}>
                                  <p className="text-[9px] text-muted-foreground">History</p>
                                  <p className="text-xs font-bold">{stock.dilution_history}</p>
                                </div>
                              )}
                            </div>
                            {stock.dilution_note && (
                              <p className="text-[10px] text-muted-foreground mt-1.5 italic">💉 {stock.dilution_note}</p>
                            )}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {stock.ttm_revenue && <div className="bg-muted/30 rounded p-2 text-center"><p className="text-[9px] text-muted-foreground">TTM Rev</p><p className="text-xs font-bold">{stock.ttm_revenue}</p></div>}
                            {stock.gross_margin_pct && <div className="bg-muted/30 rounded p-2 text-center"><p className="text-[9px] text-muted-foreground">Gross Margin</p><p className="text-xs font-bold">{stock.gross_margin_pct}</p></div>}
                            {stock.debt_to_equity && <div className="bg-muted/30 rounded p-2 text-center"><p className="text-[9px] text-muted-foreground">D/E Ratio</p><p className="text-xs font-bold">{stock.debt_to_equity}</p></div>}
                            {stock.cash_position && <div className="bg-muted/30 rounded p-2 text-center"><p className="text-[9px] text-muted-foreground">Cash</p><p className="text-xs font-bold">{stock.cash_position}</p></div>}
                          </div>

                          <div>
                            <p className="text-xs font-semibold text-muted-foreground mb-1">🎯 CATALYST</p>
                            <p className="text-xs leading-relaxed">{stock.catalyst}</p>
                            {stock.catalyst_timeline && <p className="text-[10px] text-muted-foreground mt-0.5">Timeline: {stock.catalyst_timeline}</p>}
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

                          <div className="bg-emerald-500/10 rounded p-2 border border-emerald-500/20">
                            <p className="text-[10px] font-semibold text-emerald-400 mb-0.5">🛡️ WHY IT WON'T GO TO ZERO</p>
                            <p className="text-[10px] leading-relaxed">{stock.why_not_zero}</p>
                          </div>

                          <div className="bg-primary/10 rounded p-2 border border-primary/20">
                            <p className="text-xs font-semibold text-primary mb-0.5">💰 ENTRY STRATEGY</p>
                            <p className="text-xs leading-relaxed">{stock.entry_strategy}</p>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}

        {data && (
          <div className="text-center py-4">
            <p className="text-[10px] text-muted-foreground max-w-2xl mx-auto">
              ⚠️ AI-generated analysis for research only. Not financial advice. Small-cap stocks carry significant risk.
              All picks: cap &lt;$500M, real AI products, elite leadership, positive margins, NYSE/NASDAQ only, zero pharma.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
