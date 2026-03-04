import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Brain, Zap, AlertTriangle, Clock, TrendingUp, TrendingDown,
  MinusCircle, Activity, Radio, Shield, BarChart3, RefreshCw,
  ChevronRight, Loader2, Flame, Gauge, Eye
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ═══ TYPES ═══
interface SentimentResult {
  model: string;
  pair: string;
  score: number;
  confidence: number;
  reasoning: string;
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
}

interface ConsensusResult {
  pair: string;
  consensusScore: number;
  modelA: SentimentResult;
  modelB: SentimentResult;
  agreement: number;
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  strength: "STRONG" | "MODERATE" | "WEAK" | "CONFLICTED";
}

interface InterruptAlert {
  pair: string;
  type: "BLACK_SWAN" | "RAPID_SHIFT";
  severity: "CRITICAL" | "WARNING";
  delta: number;
  message: string;
  timestamp: string;
}

interface TradeLogEntry {
  id: string;
  timestamp: string;
  pair: string;
  action: string;
  decision: string;
  reasoning: string;
  consensusScore: number;
}

interface WebhookPlaceholder {
  pair: string;
  price: string;
  rsi: string;
  ema200: string;
  signal: string;
}

const TRACKED_PAIRS = ["EUR/USD", "GBP/USD", "USD/JPY"];

// ═══ H4 COUNTDOWN HOOK ═══
function useH4Countdown() {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0, progress: 0 });

  useEffect(() => {
    const calc = () => {
      const now = new Date();
      const utcH = now.getUTCHours();
      const utcM = now.getUTCMinutes();
      const utcS = now.getUTCSeconds();

      // H4 candles close at 0, 4, 8, 12, 16, 20 UTC
      const candleStarts = [0, 4, 8, 12, 16, 20];
      const currentCandleStart = candleStarts.filter(h => h <= utcH).pop() ?? 20;
      const nextIdx = candleStarts.indexOf(currentCandleStart) + 1;
      const nextClose = nextIdx < candleStarts.length ? candleStarts[nextIdx] : 24;

      const totalSeconds = (nextClose - currentCandleStart) * 3600;
      const elapsedSeconds = (utcH - currentCandleStart) * 3600 + utcM * 60 + utcS;
      const remaining = totalSeconds - elapsedSeconds;

      const h = Math.floor(remaining / 3600);
      const m = Math.floor((remaining % 3600) / 60);
      const s = remaining % 60;
      const progress = ((totalSeconds - remaining) / totalSeconds) * 100;

      setTimeLeft({ hours: h, minutes: m, seconds: s, progress });
    };
    calc();
    const iv = setInterval(calc, 1000);
    return () => clearInterval(iv);
  }, []);

  return timeLeft;
}

// ═══ SENTIMENT HEATMAP CELL ═══
function HeatmapCell({ result }: { result: ConsensusResult | null }) {
  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center p-4 rounded-lg border border-border/30 bg-card/30 min-h-[140px]">
        <span className="text-xs text-muted-foreground font-mono">AWAITING</span>
      </div>
    );
  }

  const score = result.consensusScore;
  const absScore = Math.abs(score);

  // Color gradient: bearish red → neutral gray → bullish green
  const bgColor = score > 0.3
    ? `hsl(150 ${Math.round(absScore * 100)}% ${10 + absScore * 12}%)`
    : score < -0.3
    ? `hsl(0 ${Math.round(absScore * 100)}% ${10 + absScore * 12}%)`
    : "hsl(220 15% 12%)";

  const textColor = absScore > 0.3 ? "hsl(0 0% 95%)" : "hsl(0 0% 65%)";

  const BiasIcon = score > 0.15 ? TrendingUp : score < -0.15 ? TrendingDown : MinusCircle;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center p-4 rounded-lg border border-border/40 min-h-[140px] relative overflow-hidden"
      style={{ background: bgColor }}
    >
      {/* Glow overlay for strong signals */}
      {absScore > 0.6 && (
        <div
          className="absolute inset-0 animate-pulse-glow"
          style={{
            background: score > 0 ? "radial-gradient(circle, hsl(150 80% 50% / 0.15), transparent)" : "radial-gradient(circle, hsl(0 80% 50% / 0.15), transparent)"
          }}
        />
      )}

      <span className="text-xs font-mono tracking-wider mb-1 relative z-10" style={{ color: textColor }}>
        {result.pair}
      </span>
      <BiasIcon className="w-5 h-5 mb-1 relative z-10" style={{ color: textColor }} />
      <span className="text-2xl font-display font-bold relative z-10" style={{ color: textColor }}>
        {score > 0 ? "+" : ""}{score.toFixed(2)}
      </span>
      <Badge
        variant="outline"
        className="text-[10px] mt-1 relative z-10"
        style={{ borderColor: textColor, color: textColor }}
      >
        {result.strength} · {result.agreement}%
      </Badge>
    </motion.div>
  );
}

// ═══ INTERRUPT ALERT BANNER ═══
function InterruptBanner({ alerts }: { alerts: InterruptAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <AnimatePresence>
      {alerts.map((alert, i) => (
        <motion.div
          key={`${alert.pair}-${i}`}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={`p-3 rounded-lg border-2 mb-2 ${
            alert.severity === "CRITICAL"
              ? "border-destructive bg-destructive/10 animate-pulse"
              : "border-neural-orange bg-neural-orange/5"
          }`}
        >
          <div className="flex items-center gap-2">
            {alert.severity === "CRITICAL" ? (
              <Flame className="w-5 h-5 text-destructive shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-neural-orange shrink-0" />
            )}
            <div className="flex-1">
              <span className="text-xs font-display font-bold tracking-wider">
                {alert.type === "BLACK_SWAN" ? "⚠️ BLACK SWAN INTERRUPT" : "⚡ RAPID SHIFT"}
              </span>
              <p className="text-sm font-mono text-muted-foreground mt-0.5">{alert.message}</p>
            </div>
            <Badge variant="destructive" className="text-[10px] font-mono shrink-0">
              Δ {alert.delta.toFixed(2)}
            </Badge>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}

// ═══ TRADE LOG ═══
function TradeLog({ entries }: { entries: TradeLogEntry[] }) {
  return (
    <ScrollArea className="h-[300px]">
      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <Eye className="w-8 h-8 mb-2 opacity-40" />
          <span className="text-xs font-mono">No decisions yet — run a cycle</span>
        </div>
      ) : (
        <div className="space-y-2 pr-3">
          {entries.map((entry) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-3 rounded-lg border border-border/30 bg-card/20"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-mono ${
                      entry.decision === "LONG" ? "border-neural-green text-neural-green" :
                      entry.decision === "SHORT" ? "border-neural-red text-neural-red" :
                      "border-muted text-muted-foreground"
                    }`}
                  >
                    {entry.decision}
                  </Badge>
                  <span className="text-sm font-display font-semibold">{entry.pair}</span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{entry.reasoning}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] font-mono text-muted-foreground">
                  Consensus: {entry.consensusScore > 0 ? "+" : ""}{entry.consensusScore.toFixed(2)}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">·</span>
                <span className="text-[10px] font-mono text-muted-foreground">{entry.action}</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </ScrollArea>
  );
}

// ═══ TRADINGVIEW WEBHOOK PLACEHOLDER ═══
function WebhookPanel({
  webhooks,
  onChange,
}: {
  webhooks: Record<string, WebhookPlaceholder>;
  onChange: (pair: string, field: string, value: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="w-4 h-4 text-neural-cyan" />
        <span className="text-xs font-display font-semibold tracking-wider">TRADINGVIEW WEBHOOK DATA</span>
        <Badge variant="outline" className="text-[9px] font-mono border-neural-cyan/30 text-neural-cyan">
          PLACEHOLDER
        </Badge>
      </div>
      {TRACKED_PAIRS.map((pair) => {
        const wh = webhooks[pair] || { price: "", rsi: "", ema200: "", signal: "" };
        return (
          <div key={pair} className="grid grid-cols-5 gap-2 items-center">
            <span className="text-xs font-mono text-muted-foreground col-span-1">{pair}</span>
            <Input
              placeholder="Price"
              value={wh.price}
              onChange={(e) => onChange(pair, "price", e.target.value)}
              className="h-7 text-xs font-mono bg-card/30 border-border/30"
            />
            <Input
              placeholder="RSI"
              value={wh.rsi}
              onChange={(e) => onChange(pair, "rsi", e.target.value)}
              className="h-7 text-xs font-mono bg-card/30 border-border/30"
            />
            <Input
              placeholder="EMA 200"
              value={wh.ema200}
              onChange={(e) => onChange(pair, "ema200", e.target.value)}
              className="h-7 text-xs font-mono bg-card/30 border-border/30"
            />
            <Input
              placeholder="Signal"
              value={wh.signal}
              onChange={(e) => onChange(pair, "signal", e.target.value)}
              className="h-7 text-xs font-mono bg-card/30 border-border/30"
            />
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════
export default function H4Dashboard() {
  const { toast } = useToast();
  const h4 = useH4Countdown();

  // State
  const [consensus, setConsensus] = useState<ConsensusResult[]>([]);
  const [interrupts, setInterrupts] = useState<InterruptAlert[]>([]);
  const [tradeLog, setTradeLog] = useState<TradeLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [webhooks, setWebhooks] = useState<Record<string, WebhookPlaceholder>>({});
  const previousScoresRef = useRef<Record<string, { consensusScore: number; timestamp: string }>>({});

  const handleWebhookChange = useCallback((pair: string, field: string, value: string) => {
    setWebhooks((prev) => ({
      ...prev,
      [pair]: { ...prev[pair], pair, [field]: value } as WebhookPlaceholder,
    }));
  }, []);

  // ── Run consensus scan ──
  const runConsensusScan = useCallback(async () => {
    setLoading(true);
    try {
      // Build webhook data if any fields are filled
      const webhookData: Record<string, any> = {};
      for (const pair of TRACKED_PAIRS) {
        const wh = webhooks[pair];
        if (wh && (wh.price || wh.rsi || wh.ema200)) {
          webhookData[pair] = {
            price: wh.price || undefined,
            rsi: wh.rsi || undefined,
            ema200: wh.ema200 || undefined,
            signal: wh.signal || undefined,
          };
        }
      }

      const { data, error } = await supabase.functions.invoke("h4-sentiment-engine", {
        body: {
          action: "full_cycle",
          pairs: TRACKED_PAIRS,
          webhookData: Object.keys(webhookData).length > 0 ? webhookData : undefined,
          previousScores: previousScoresRef.current,
        },
      });

      if (error) throw error;

      // Update consensus
      setConsensus(data.consensus || []);
      setLastUpdate(data.timestamp);

      // Store previous scores for interrupt detection
      const newPrev: Record<string, { consensusScore: number; timestamp: string }> = {};
      for (const c of data.consensus || []) {
        newPrev[c.pair] = { consensusScore: c.consensusScore, timestamp: data.timestamp };
      }
      previousScoresRef.current = newPrev;

      // Handle interrupts
      if (data.interrupts?.length > 0) {
        setInterrupts((prev) => [...data.interrupts, ...prev].slice(0, 10));
        toast({
          title: "⚠️ Interrupt Detected",
          description: data.interrupts[0].message,
          variant: "destructive",
        });
      }

      // Add H4 decision to trade log
      if (data.h4Decision?.decision && data.h4Decision.decision !== "ERROR") {
        const entry: TradeLogEntry = {
          id: `${Date.now()}-${data.h4Decision.pair}`,
          timestamp: data.timestamp,
          pair: data.h4Decision.pair,
          action: data.h4Decision.action,
          decision: data.h4Decision.decision,
          reasoning: data.h4Decision.reasoning,
          consensusScore: data.consensus?.find((c: ConsensusResult) => c.pair === data.h4Decision.pair)?.consensusScore || 0,
        };
        setTradeLog((prev) => [entry, ...prev].slice(0, 50));
      }

      toast({
        title: "Consensus Updated",
        description: `${data.consensus?.length || 0} pairs analyzed`,
      });
    } catch (err: any) {
      console.error("[H4-DASHBOARD]", err);
      toast({ title: "Scan Failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [webhooks, toast]);

  // Pad for countdown display
  const pad = (n: number) => String(n).padStart(2, "0");

  // Composite sentiment score
  const avgScore = consensus.length > 0
    ? consensus.reduce((s, c) => s + c.consensusScore, 0) / consensus.length
    : 0;

  return (
    <div className="min-h-screen bg-[hsl(228,30%,4%)] text-foreground">
      {/* ─── HEADER ─── */}
      <header className="border-b border-border/20 bg-[hsl(228,30%,6%)] px-6 py-3">
        <div className="flex items-center justify-between max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-gradient-to-br from-neural-cyan to-neural-purple flex items-center justify-center">
              <Gauge className="w-4 h-4 text-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-display font-bold tracking-wider">CUSTOMQUANTLABS</h1>
              <span className="text-[10px] text-muted-foreground font-mono">H4 INTELLIGENCE DASHBOARD</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Live indicator */}
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-neural-green animate-pulse" />
              <span className="text-[10px] font-mono text-muted-foreground">
                {lastUpdate ? `Updated ${new Date(lastUpdate).toLocaleTimeString()}` : "NOT SYNCED"}
              </span>
            </div>

            <Button
              onClick={runConsensusScan}
              disabled={loading}
              size="sm"
              className="h-8 bg-gradient-to-r from-neural-cyan/20 to-neural-purple/20 border border-neural-cyan/30 hover:border-neural-cyan/60 text-neural-cyan font-display text-xs"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
              {loading ? "ANALYZING..." : "RUN CYCLE"}
            </Button>
          </div>
        </div>
      </header>

      {/* ─── INTERRUPT ALERTS ─── */}
      <div className="max-w-[1600px] mx-auto px-6 pt-3">
        <InterruptBanner alerts={interrupts} />
      </div>

      {/* ─── MAIN GRID ─── */}
      <main className="max-w-[1600px] mx-auto px-6 py-4 grid grid-cols-12 gap-4">
        {/* ─── LEFT: H4 Countdown + Model Status ─── */}
        <div className="col-span-12 lg:col-span-3 space-y-4">
          {/* H4 Candle Countdown */}
          <Card className="bg-[hsl(225,28%,8%)] border-border/20 overflow-hidden">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-neural-cyan" />
                <CardTitle className="text-xs font-display tracking-wider">H4 CANDLE COUNTDOWN</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {/* Countdown timer */}
              <div className="flex justify-center gap-1 mb-3">
                {[
                  { val: pad(h4.hours), label: "HRS" },
                  { val: pad(h4.minutes), label: "MIN" },
                  { val: pad(h4.seconds), label: "SEC" },
                ].map((t, i) => (
                  <React.Fragment key={t.label}>
                    {i > 0 && <span className="text-2xl font-mono text-muted-foreground self-start mt-1">:</span>}
                    <div className="flex flex-col items-center">
                      <span className="text-3xl font-mono font-bold text-neural-cyan">{t.val}</span>
                      <span className="text-[9px] font-mono text-muted-foreground">{t.label}</span>
                    </div>
                  </React.Fragment>
                ))}
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 rounded-full bg-border/20 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-neural-cyan to-neural-purple"
                  style={{ width: `${h4.progress}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] font-mono text-muted-foreground">OPEN</span>
                <span className="text-[9px] font-mono text-muted-foreground">{h4.progress.toFixed(0)}%</span>
                <span className="text-[9px] font-mono text-muted-foreground">CLOSE</span>
              </div>

              {/* H4 close triggers decision */}
              {h4.hours === 0 && h4.minutes < 5 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-3 p-2 rounded border border-neural-orange/50 bg-neural-orange/5 text-center"
                >
                  <span className="text-[10px] font-display font-bold text-neural-orange animate-pulse">
                    ⚡ H4 CLOSE IMMINENT — DECISION TRIGGER ARMED
                  </span>
                </motion.div>
              )}
            </CardContent>
          </Card>

          {/* Model Status */}
          <Card className="bg-[hsl(225,28%,8%)] border-border/20">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-neural-purple" />
                <CardTitle className="text-xs font-display tracking-wider">MODEL ROSTER</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {[
                { label: "LITE A", model: "Gemini 2.5 Flash Lite", color: "text-blue-400", role: "Sentiment Scout" },
                { label: "LITE B", model: "GPT-5 Nano", color: "text-green-400", role: "Sentiment Scout" },
                { label: "BIG", model: "Gemini 2.5 Pro", color: "text-amber-400", role: "H4 Decision Maker" },
              ].map((m) => (
                <div key={m.label} className="flex items-center gap-2 p-2 rounded border border-border/20 bg-card/10">
                  <div className="w-2 h-2 rounded-full bg-neural-green" />
                  <div className="flex-1 min-w-0">
                    <span className={`text-xs font-mono font-semibold ${m.color}`}>{m.model}</span>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[8px] font-mono border-border/30">{m.label}</Badge>
                      <span className="text-[9px] text-muted-foreground">{m.role}</span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Composite Score */}
          <Card className="bg-[hsl(225,28%,8%)] border-border/20">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-neural-green" />
                <CardTitle className="text-xs font-display tracking-wider">COMPOSITE SENTIMENT</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex flex-col items-center">
                <span
                  className={`text-4xl font-display font-bold ${
                    avgScore > 0.15 ? "text-neural-green" : avgScore < -0.15 ? "text-neural-red" : "text-muted-foreground"
                  }`}
                >
                  {avgScore > 0 ? "+" : ""}{avgScore.toFixed(3)}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground mt-1">
                  {avgScore > 0.3 ? "RISK ON" : avgScore < -0.3 ? "RISK OFF" : "NEUTRAL"}
                </span>
                {/* Sentiment bar */}
                <div className="w-full h-3 rounded-full bg-border/20 mt-3 relative overflow-hidden">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-muted-foreground/30 z-10" />
                  <motion.div
                    className={`absolute inset-y-0 rounded-full ${avgScore >= 0 ? "bg-neural-green/60" : "bg-neural-red/60"}`}
                    style={{
                      left: avgScore >= 0 ? "50%" : `${50 + avgScore * 50}%`,
                      width: `${Math.abs(avgScore) * 50}%`,
                    }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <div className="flex justify-between w-full mt-1">
                  <span className="text-[8px] font-mono text-neural-red">-1.0</span>
                  <span className="text-[8px] font-mono text-muted-foreground">0.0</span>
                  <span className="text-[8px] font-mono text-neural-green">+1.0</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ─── CENTER: Sentiment Heatmap + Trade Log ─── */}
        <div className="col-span-12 lg:col-span-6 space-y-4">
          {/* Sentiment Heatmap */}
          <Card className="bg-[hsl(225,28%,8%)] border-border/20">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-neural-cyan" />
                  <CardTitle className="text-xs font-display tracking-wider">SENTIMENT HEATMAP</CardTitle>
                </div>
                <Badge variant="outline" className="text-[9px] font-mono border-neural-cyan/30 text-neural-cyan">
                  DUAL-MODEL CONSENSUS
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-3 gap-3">
                {TRACKED_PAIRS.map((pair) => {
                  const result = consensus.find((c) => c.pair === pair) || null;
                  return <HeatmapCell key={pair} result={result} />;
                })}
              </div>

              {/* Model detail breakdown */}
              {consensus.length > 0 && (
                <div className="mt-4 space-y-2">
                  <Separator className="bg-border/20" />
                  <span className="text-[10px] font-display tracking-wider text-muted-foreground">MODEL BREAKDOWN</span>
                  {consensus.map((c) => (
                    <div key={c.pair} className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                      <span className="text-muted-foreground">{c.pair}</span>
                      <span className="text-blue-400">
                        Gemini: {c.modelA.score > 0 ? "+" : ""}{c.modelA.score.toFixed(2)} ({c.modelA.confidence}%)
                      </span>
                      <span className="text-green-400">
                        GPT-5N: {c.modelB.score > 0 ? "+" : ""}{c.modelB.score.toFixed(2)} ({c.modelB.confidence}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Trade Log */}
          <Card className="bg-[hsl(225,28%,8%)] border-border/20">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-neural-orange" />
                <CardTitle className="text-xs font-display tracking-wider">TRADE DECISION LOG</CardTitle>
                <Badge variant="outline" className="text-[9px] font-mono ml-auto">{tradeLog.length} entries</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <TradeLog entries={tradeLog} />
            </CardContent>
          </Card>
        </div>

        {/* ─── RIGHT: TradingView Webhooks + Stats ─── */}
        <div className="col-span-12 lg:col-span-3 space-y-4">
          {/* TradingView Placeholder */}
          <Card className="bg-[hsl(225,28%,8%)] border-border/20">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-display tracking-wider">TECHNICAL INPUTS</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <WebhookPanel webhooks={webhooks} onChange={handleWebhookChange} />
            </CardContent>
          </Card>

          {/* Interrupt History */}
          <Card className="bg-[hsl(225,28%,8%)] border-border/20">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-destructive" />
                <CardTitle className="text-xs font-display tracking-wider">INTERRUPT HISTORY</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <ScrollArea className="h-[200px]">
                {interrupts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <Shield className="w-6 h-6 mb-1.5 opacity-30" />
                    <span className="text-[10px] font-mono">NO INTERRUPTS — STABLE</span>
                  </div>
                ) : (
                  <div className="space-y-2 pr-2">
                    {interrupts.map((a, i) => (
                      <div key={i} className="p-2 rounded border border-border/20 bg-card/10">
                        <div className="flex items-center gap-1.5">
                          {a.severity === "CRITICAL" ? (
                            <Flame className="w-3 h-3 text-destructive" />
                          ) : (
                            <AlertTriangle className="w-3 h-3 text-neural-orange" />
                          )}
                          <span className="text-[10px] font-mono font-semibold">{a.pair}</span>
                          <span className="text-[9px] text-muted-foreground ml-auto">
                            {new Date(a.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-0.5">{a.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* How it works */}
          <Card className="bg-[hsl(225,28%,8%)] border-border/20">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-xs font-display tracking-wider">SYSTEM ARCHITECTURE</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 text-[10px] font-mono text-muted-foreground space-y-1.5">
              <div className="flex items-start gap-1.5">
                <ChevronRight className="w-3 h-3 mt-0.5 text-neural-cyan shrink-0" />
                <span>Two Lite models (Flash Lite + Nano) score each pair from -1 to +1</span>
              </div>
              <div className="flex items-start gap-1.5">
                <ChevronRight className="w-3 h-3 mt-0.5 text-neural-cyan shrink-0" />
                <span>Consensus = confidence-weighted average of both scores</span>
              </div>
              <div className="flex items-start gap-1.5">
                <ChevronRight className="w-3 h-3 mt-0.5 text-neural-purple shrink-0" />
                <span>H4 close triggers Big model (Gemini Pro) for trade decision</span>
              </div>
              <div className="flex items-start gap-1.5">
                <ChevronRight className="w-3 h-3 mt-0.5 text-destructive shrink-0" />
                <span>Δ &gt; 0.5 in 1h = BLACK SWAN interrupt alert</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
