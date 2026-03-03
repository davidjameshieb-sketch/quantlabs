import React, { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import {
  Upload, Settings, Brain, ShieldAlert, Crown, Loader2, ImageIcon,
  TrendingUp, TrendingDown, MinusCircle, Target, AlertTriangle, BarChart3
} from "lucide-react";

const MODELS = [
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash" },
  { value: "google/gemini-3-pro-preview", label: "Gemini 3 Pro" },
  { value: "openai/gpt-5", label: "GPT-5" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
];

interface SenateMessage {
  id: string;
  persona: "quant" | "risk" | "chairman" | "system";
  content: string;
  timestamp: Date;
}

interface Verdict {
  verdict?: string;
  pair?: string;
  timeframe?: string;
  entry?: string;
  stop_loss?: string;
  take_profit?: string;
  risk_reward?: string;
  confidence?: string;
  rationale?: string;
  dissent?: string;
}

const personaConfig = {
  quant: { label: "The Quant", icon: Brain, color: "text-cyan-400", bg: "bg-cyan-950/40 border-cyan-800/50", badge: "bg-cyan-900 text-cyan-300" },
  risk: { label: "Risk Manager", icon: ShieldAlert, color: "text-amber-400", bg: "bg-amber-950/40 border-amber-800/50", badge: "bg-amber-900 text-amber-300" },
  chairman: { label: "The Chairman", icon: Crown, color: "text-emerald-400", bg: "bg-emerald-950/40 border-emerald-800/50", badge: "bg-emerald-900 text-emerald-300" },
  system: { label: "Senate", icon: BarChart3, color: "text-muted-foreground", bg: "bg-muted/30 border-border", badge: "bg-muted text-muted-foreground" },
};

export default function ForexSenate() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [messages, setMessages] = useState<SenateMessage[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [phase, setPhase] = useState<string>("");
  const [quantModel, setQuantModel] = useState("google/gemini-2.5-pro");
  const [riskModel, setRiskModel] = useState("google/gemini-2.5-flash");
  const [chairmanModel, setChairmanModel] = useState("google/gemini-2.5-pro");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const addMessage = useCallback((persona: SenateMessage["persona"], content: string) => {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), persona, content, timestamp: new Date() }]);
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
  }, []);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image file.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 10MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setImagePreview(base64);
      setImageBase64(base64);
      setMessages([]);
      setVerdict(null);
    };
    reader.readAsDataURL(file);
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleAnalyze = useCallback(async () => {
    if (!imageBase64) return;
    setIsAnalyzing(true);
    setMessages([]);
    setVerdict(null);

    addMessage("system", "🏛️ **Senate session opened.** Chart submitted for multi-agent analysis.");
    setPhase("Phase 1: The Quant and Risk Manager are analyzing the chart...");
    addMessage("system", "⏳ Phase 1 — Dispatching chart to **The Quant** and **The Risk Manager** in parallel...");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Auth required", description: "Please sign in to use the AI Senate.", variant: "destructive" });
        setIsAnalyzing(false);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/forex-senate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ imageBase64, quantModel, riskModel, chairmanModel }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const result = await response.json();

      addMessage("quant", result.quant);
      setPhase("Phase 1 complete. Risk Manager delivering findings...");
      
      // Slight delay for visual effect
      await new Promise(r => setTimeout(r, 400));
      addMessage("risk", result.riskManager);

      setPhase("Phase 2: The Chairman is deliberating...");
      addMessage("system", "⚖️ Phase 2 — **The Chairman** is reviewing all evidence and rendering a verdict...");
      await new Promise(r => setTimeout(r, 600));

      addMessage("chairman", result.chairman);
      setVerdict(result.verdict);
      setPhase("");
      addMessage("system", "✅ **Senate session closed.** Verdict delivered.");

    } catch (err: any) {
      console.error("[SENATE UI]", err);
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
      addMessage("system", `❌ **Error:** ${err.message}`);
      setPhase("");
    } finally {
      setIsAnalyzing(false);
    }
  }, [imageBase64, quantModel, riskModel, chairmanModel, addMessage, toast]);

  const verdictDirection = verdict?.verdict?.toUpperCase();
  const isBuy = verdictDirection?.includes("BUY");
  const isSell = verdictDirection?.includes("SELL");
  const isNoTrade = verdictDirection?.includes("NO TRADE") || (!isBuy && !isSell);

  return (
    <div className="min-h-screen bg-[#0a0b0f] text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-3 flex items-center justify-between bg-[#0d0e14]">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center">
            <Crown className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wider uppercase font-mono">AI Trading Senate</h1>
            <p className="text-[10px] text-white/40 font-mono">Multi-Agent Forex Intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAnalyzing && (
            <Badge variant="outline" className="border-cyan-500/50 text-cyan-400 text-[10px] font-mono animate-pulse">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" /> {phase || "Processing..."}
            </Badge>
          )}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white/50 hover:text-white">
                <Settings className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent className="bg-[#0d0e14] border-white/10 text-white">
              <SheetHeader>
                <SheetTitle className="text-white font-mono">Senate Configuration</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <p className="text-xs text-white/40 font-mono">
                  Select which AI model represents each Senate member. All models are powered by Lovable AI — no API key required.
                </p>
                <Separator className="bg-white/10" />
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-mono text-cyan-400 flex items-center gap-2 mb-2">
                      <Brain className="h-3 w-3" /> The Quant
                    </label>
                    <Select value={quantModel} onValueChange={setQuantModel}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white text-xs font-mono">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1b23] border-white/10">
                        {MODELS.map(m => <SelectItem key={m.value} value={m.value} className="text-white text-xs font-mono">{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-mono text-amber-400 flex items-center gap-2 mb-2">
                      <ShieldAlert className="h-3 w-3" /> Risk Manager
                    </label>
                    <Select value={riskModel} onValueChange={setRiskModel}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white text-xs font-mono">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1b23] border-white/10">
                        {MODELS.map(m => <SelectItem key={m.value} value={m.value} className="text-white text-xs font-mono">{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-mono text-emerald-400 flex items-center gap-2 mb-2">
                      <Crown className="h-3 w-3" /> The Chairman
                    </label>
                    <Select value={chairmanModel} onValueChange={setChairmanModel}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white text-xs font-mono">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1b23] border-white/10">
                        {MODELS.map(m => <SelectItem key={m.value} value={m.value} className="text-white text-xs font-mono">{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr_320px] gap-0 h-[calc(100vh-57px)]">

        {/* Left: Upload Zone */}
        <div className="border-r border-white/10 p-4 flex flex-col gap-4 bg-[#0d0e14]">
          <h2 className="text-xs font-mono font-bold text-white/60 uppercase tracking-wider">Chart Input</h2>

          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative flex-1 min-h-[200px] rounded-lg border-2 border-dashed cursor-pointer
              transition-all duration-200 flex items-center justify-center
              ${imagePreview
                ? "border-white/20 bg-white/5"
                : "border-white/10 bg-white/[0.02] hover:border-cyan-500/50 hover:bg-cyan-950/20"
              }
            `}
          >
            {imagePreview ? (
              <img src={imagePreview} alt="Chart" className="max-w-full max-h-full object-contain rounded" />
            ) : (
              <div className="text-center p-6">
                <Upload className="h-8 w-8 text-white/20 mx-auto mb-3" />
                <p className="text-xs text-white/40 font-mono">Drop chart screenshot here</p>
                <p className="text-[10px] text-white/20 font-mono mt-1">or click to browse</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
            />
          </div>

          <Button
            onClick={handleAnalyze}
            disabled={!imageBase64 || isAnalyzing}
            className="w-full bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-mono text-xs tracking-wider"
          >
            {isAnalyzing ? (
              <><Loader2 className="h-3 w-3 mr-2 animate-spin" /> Analyzing...</>
            ) : (
              <><BarChart3 className="h-3 w-3 mr-2" /> Convene Senate</>
            )}
          </Button>

          {imagePreview && !isAnalyzing && (
            <Button
              variant="ghost"
              size="sm"
              className="text-white/30 text-[10px] font-mono hover:text-white/60"
              onClick={() => { setImagePreview(null); setImageBase64(null); setMessages([]); setVerdict(null); }}
            >
              Clear chart
            </Button>
          )}
        </div>

        {/* Center: Senate Floor */}
        <div className="flex flex-col bg-[#0a0b0f] border-r border-white/10">
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
            <h2 className="text-xs font-mono font-bold text-white/60 uppercase tracking-wider">The Senate Floor</h2>
            {messages.length > 0 && (
              <Badge variant="outline" className="text-[10px] font-mono border-white/10 text-white/30">
                {messages.length} entries
              </Badge>
            )}
          </div>
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-white/10">
                <div className="text-center">
                  <Crown className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-xs font-mono">Upload a chart and convene the Senate</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => {
                  const config = personaConfig[msg.persona];
                  const Icon = config.icon;
                  return (
                    <div key={msg.id} className={`rounded-lg border p-4 ${config.bg}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className={`h-4 w-4 ${config.color}`} />
                        <span className={`text-xs font-mono font-bold ${config.color}`}>{config.label}</span>
                        <span className="text-[10px] text-white/20 font-mono ml-auto">
                          {msg.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="prose prose-sm prose-invert max-w-none text-xs font-mono leading-relaxed text-white/70">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                  );
                })}
                {isAnalyzing && (
                  <div className="flex items-center gap-2 px-4 py-3 text-white/30">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="text-xs font-mono animate-pulse">{phase}</span>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right: Action Panel */}
        <div className="p-4 flex flex-col gap-4 bg-[#0d0e14]">
          <h2 className="text-xs font-mono font-bold text-white/60 uppercase tracking-wider">Verdict</h2>

          {verdict ? (
            <div className="space-y-4">
              {/* Direction badge */}
              <div className={`
                rounded-lg p-4 text-center border
                ${isBuy ? "bg-emerald-950/50 border-emerald-700/50" : isSell ? "bg-red-950/50 border-red-700/50" : "bg-zinc-900/50 border-zinc-700/50"}
              `}>
                <div className="flex items-center justify-center gap-2 mb-1">
                  {isBuy ? <TrendingUp className="h-5 w-5 text-emerald-400" /> : isSell ? <TrendingDown className="h-5 w-5 text-red-400" /> : <MinusCircle className="h-5 w-5 text-zinc-400" />}
                  <span className={`text-2xl font-mono font-black tracking-wider ${isBuy ? "text-emerald-400" : isSell ? "text-red-400" : "text-zinc-400"}`}>
                    {verdict.verdict || "—"}
                  </span>
                </div>
                <p className="text-[10px] text-white/30 font-mono">{verdict.pair || "—"} · {verdict.timeframe || "—"}</p>
              </div>

              {/* Confidence */}
              <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-white/40 font-mono uppercase">Confidence</span>
                  <span className="text-sm font-mono font-bold text-white">{verdict.confidence || "—"}</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${
                      parseInt(verdict.confidence || "0") > 70 ? "bg-emerald-500" :
                      parseInt(verdict.confidence || "0") > 40 ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${parseInt(verdict.confidence || "0")}%` }}
                  />
                </div>
              </div>

              {/* Trade Parameters */}
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-3 space-y-2">
                  {[
                    { label: "Entry", value: verdict.entry, icon: Target },
                    { label: "Stop Loss", value: verdict.stop_loss, icon: AlertTriangle },
                    { label: "Take Profit", value: verdict.take_profit, icon: TrendingUp },
                    { label: "Risk:Reward", value: verdict.risk_reward, icon: BarChart3 },
                  ].map(({ label, value, icon: I }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-[10px] text-white/40 font-mono flex items-center gap-1.5">
                        <I className="h-3 w-3" /> {label}
                      </span>
                      <span className="text-xs font-mono font-bold text-white">{value || "—"}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Rationale */}
              {verdict.rationale && verdict.rationale !== "—" && (
                <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                  <span className="text-[10px] text-white/40 font-mono uppercase block mb-1">Rationale</span>
                  <p className="text-xs font-mono text-white/60 leading-relaxed">{verdict.rationale}</p>
                </div>
              )}

              {/* Dissent */}
              {verdict.dissent && verdict.dissent !== "—" && (
                <div className="rounded-lg bg-amber-950/30 border border-amber-800/30 p-3">
                  <span className="text-[10px] text-amber-400/60 font-mono uppercase block mb-1">⚠ Dissent</span>
                  <p className="text-xs font-mono text-amber-300/60 leading-relaxed">{verdict.dissent}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-white/10">
              <div className="text-center">
                <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-[10px] font-mono">Awaiting chart submission</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
