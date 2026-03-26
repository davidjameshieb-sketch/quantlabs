import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  RefreshCw, Loader2, TrendingUp, Shield, Zap, Factory, Rocket,
  AlertTriangle, DollarSign, Target, Users, Clock, ChevronDown, ChevronRight
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface PennyStock {
  rank: number;
  ticker: string;
  company: string;
  price_range: string;
  market_cap?: string;
  sector: string;
  political_theme: string;
  product_description: string;
  social_score: number;
  social_label: string;
  catalyst: string;
  catalyst_timeline?: string;
  risk_level: string;
  risk_color: string;
  bull_case: string;
  bear_case: string;
  institutional_interest?: string;
  strategy: string;
  theme_emoji: string;
}

interface ScanResult {
  stocks: PennyStock[];
  market_context: string;
  scan_timestamp: string;
  total_picks: number;
  themes_covered: string[];
}

const THEMES = [
  { id: "all", label: "All Themes", emoji: "🎯" },
  { id: "defense", label: "Defense", emoji: "🛡️" },
  { id: "energy", label: "Energy", emoji: "⚡" },
  { id: "border security", label: "Border", emoji: "🔒" },
  { id: "manufacturing", label: "Manufacturing", emoji: "🏭" },
  { id: "infrastructure", label: "Infrastructure", emoji: "🏗️" },
  { id: "crypto", label: "Crypto", emoji: "₿" },
  { id: "ai", label: "AI", emoji: "🤖" },
  { id: "space", label: "Space", emoji: "🚀" },
  { id: "tariff", label: "Tariff Winners", emoji: "🇺🇸" },
  { id: "deregulation", label: "Deregulation", emoji: "📜" },
];

const riskColors: Record<string, string> = {
  LOW: "bg-green-500/20 text-green-400 border-green-500/30",
  MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  HIGH: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  EXTREME: "bg-red-500/20 text-red-400 border-red-500/30",
};

const socialColors = (score: number) => {
  if (score >= 8) return "bg-red-500/20 text-red-300";
  if (score >= 6) return "bg-orange-500/20 text-orange-300";
  if (score >= 4) return "bg-yellow-500/20 text-yellow-300";
  return "bg-muted text-muted-foreground";
};

export default function PennyStocks() {
  const navigate = useNavigate();
  const [data, setData] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState("all");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [filterTheme, setFilterTheme] = useState<string | null>(null);

  const runScan = useCallback(async () => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("penny-stock-scanner", {
        body: { theme: selectedTheme },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      setData(result);
      toast.success(`Found ${result.total_picks} jackpot candidates!`);
    } catch (err: any) {
      console.error("Scan failed:", err);
      toast.error(err.message || "Scanner failed");
    } finally {
      setLoading(false);
    }
  }, [selectedTheme]);

  const toggleExpand = (ticker: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  const filteredStocks = data?.stocks?.filter((s) =>
    !filterTheme || s.political_theme.toLowerCase().includes(filterTheme.toLowerCase())
  ) || [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-[1800px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💎</span>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Penny Stock Jackpot Scanner</h1>
              <p className="text-xs text-muted-foreground">AI-Powered • Political Catalyst • Social Buzz Tracker</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/alpha")}>← Kalshi Board</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>Senate</Button>
          </div>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto px-4 py-4 space-y-4">
        {/* Theme selector + Scan button */}
        <div className="flex flex-wrap items-center gap-2">
          {THEMES.map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant={selectedTheme === t.id ? "default" : "outline"}
              onClick={() => setSelectedTheme(t.id)}
              className="text-xs"
            >
              {t.emoji} {t.label}
            </Button>
          ))}
          <div className="ml-auto">
            <Button onClick={runScan} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {loading ? "Scanning with AI..." : "🔍 Run Jackpot Scan"}
            </Button>
          </div>
        </div>

        {/* Market Context */}
        {data?.market_context && (
          <Card className="p-4 bg-primary/5 border-primary/20">
            <div className="flex items-start gap-2">
              <Target className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-primary mb-1">Market Intelligence Context</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{data.market_context}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Stats bar */}
        {data && (
          <div className="flex flex-wrap gap-3 text-xs">
            <Badge variant="outline" className="gap-1">
              <DollarSign className="w-3 h-3" /> {data.total_picks} Picks
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Clock className="w-3 h-3" /> Scanned: {new Date(data.scan_timestamp).toLocaleTimeString()}
            </Badge>
            {data.themes_covered?.map((t) => (
              <Badge
                key={t}
                variant={filterTheme === t ? "default" : "secondary"}
                className="cursor-pointer text-xs"
                onClick={() => setFilterTheme(filterTheme === t ? null : t)}
              >
                {t}
              </Badge>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!data && !loading && (
          <div className="text-center py-20 space-y-4">
            <div className="text-6xl">💎</div>
            <h2 className="text-xl font-bold">Penny Stock Jackpot Scanner</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              AI-powered scanner finds small-cap stocks with real products, growing social buzz,
              and political tailwinds that institutions can't keep ignoring.
            </p>
            <p className="text-xs text-muted-foreground">Select a political theme above, then hit "Run Jackpot Scan"</p>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="text-center py-20 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
            <p className="text-lg font-semibold">AI is analyzing the market...</p>
            <p className="text-sm text-muted-foreground">Scanning for penny stocks with political catalysts, social buzz, and real fundamentals</p>
          </div>
        )}

        {/* Stock Cards Grid */}
        {filteredStocks.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredStocks.map((stock) => {
              const expanded = expandedCards.has(stock.ticker);
              return (
                <Card
                  key={stock.ticker}
                  className="p-0 overflow-hidden border-border/50 hover:border-primary/30 transition-colors"
                >
                  {/* Card Header */}
                  <div
                    className="p-3 cursor-pointer flex items-start justify-between gap-2"
                    onClick={() => toggleExpand(stock.ticker)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{stock.theme_emoji}</span>
                        <span className="font-mono font-bold text-lg text-primary">{stock.ticker}</span>
                        <Badge className={`${riskColors[stock.risk_level] || riskColors.MEDIUM} text-[10px] px-1.5`}>
                          {stock.risk_level}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium truncate">{stock.company}</p>
                      <p className="text-xs text-muted-foreground">{stock.sector}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-green-400">{stock.price_range}</p>
                      {stock.market_cap && <p className="text-[10px] text-muted-foreground">Cap: {stock.market_cap}</p>}
                      <Badge className={`${socialColors(stock.social_score)} text-[10px] mt-1`}>
                        {stock.social_label}
                      </Badge>
                    </div>
                  </div>

                  {/* Political Theme + Catalyst Strip */}
                  <div className="px-3 pb-2 flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                      {stock.political_theme}
                    </Badge>
                    {stock.catalyst_timeline && (
                      <Badge variant="outline" className="text-[10px]">
                        <Clock className="w-2.5 h-2.5 mr-1" />
                        {stock.catalyst_timeline}
                      </Badge>
                    )}
                    {expanded ? <ChevronDown className="w-3 h-3 ml-auto text-muted-foreground" /> : <ChevronRight className="w-3 h-3 ml-auto text-muted-foreground" />}
                  </div>

                  {/* Expanded Details */}
                  {expanded && (
                    <div className="border-t border-border/50 p-3 space-y-3 bg-muted/20 text-sm">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">WHAT THEY DO</p>
                        <p className="text-xs leading-relaxed">{stock.product_description}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-1">🎯 CATALYST</p>
                        <p className="text-xs leading-relaxed">{stock.catalyst}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-green-500/10 rounded p-2">
                          <p className="text-[10px] font-semibold text-green-400 mb-0.5">🐂 BULL CASE</p>
                          <p className="text-[10px] leading-relaxed">{stock.bull_case}</p>
                        </div>
                        <div className="bg-red-500/10 rounded p-2">
                          <p className="text-[10px] font-semibold text-red-400 mb-0.5">🐻 BEAR CASE</p>
                          <p className="text-[10px] leading-relaxed">{stock.bear_case}</p>
                        </div>
                      </div>
                      {stock.institutional_interest && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">🏦 INSTITUTIONAL SIGNALS</p>
                          <p className="text-xs leading-relaxed">{stock.institutional_interest}</p>
                        </div>
                      )}
                      <div className="bg-primary/10 rounded p-2 border border-primary/20">
                        <p className="text-xs font-semibold text-primary mb-0.5">💰 STRATEGY</p>
                        <p className="text-xs leading-relaxed">{stock.strategy}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          Social: {stock.social_score}/10
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          #{stock.rank} Pick
                        </Badge>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Disclaimer */}
        {data && (
          <div className="text-center py-4">
            <p className="text-[10px] text-muted-foreground max-w-2xl mx-auto">
              ⚠️ AI-generated analysis for research purposes only. Not financial advice. Penny stocks are extremely risky.
              Always do your own due diligence. Past political catalysts don't guarantee future price movements.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
