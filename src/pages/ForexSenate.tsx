import React, { useState, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import {
  Upload, Settings, Brain, ShieldAlert, Crown, Loader2, ImageIcon,
  TrendingUp, TrendingDown, MinusCircle, Target, AlertTriangle, BarChart3,
  X, Plus, Send, MessageSquare, Images
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
  persona: "quant" | "risk" | "chairman" | "system" | "user";
  content: string;
  timestamp: Date;
  images?: string[];
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
  preliminary_bias?: string;
  questions?: string;
  what_each_answer_changes?: string;
}

const personaConfig = {
  quant: { label: "The Quant", icon: Brain, color: "text-cyan-400", bg: "bg-cyan-950/40 border-cyan-800/50" },
  risk: { label: "Risk Manager", icon: ShieldAlert, color: "text-amber-400", bg: "bg-amber-950/40 border-amber-800/50" },
  chairman: { label: "The Chairman", icon: Crown, color: "text-emerald-400", bg: "bg-emerald-950/40 border-emerald-800/50" },
  system: { label: "Senate", icon: BarChart3, color: "text-muted-foreground", bg: "bg-muted/30 border-border" },
  user: { label: "You", icon: MessageSquare, color: "text-violet-400", bg: "bg-violet-950/40 border-violet-800/50" },
};

export default function ForexSenate() {
  const [images, setImages] = useState<string[]>([]);
  const [messages, setMessages] = useState<SenateMessage[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [phase, setPhase] = useState("");
  const [quantModel, setQuantModel] = useState("google/gemini-2.5-pro");
  const [riskModel, setRiskModel] = useState("google/gemini-2.5-flash");
  const [chairmanModel, setChairmanModel] = useState("google/gemini-2.5-pro");

  // Follow-up state
  const [needsMoreInfo, setNeedsMoreInfo] = useState(false);
  const [followUpText, setFollowUpText] = useState("");
  const [followUpImages, setFollowUpImages] = useState<string[]>([]);
  const [followUpRound, setFollowUpRound] = useState(1);
  const [previousQuant, setPreviousQuant] = useState("");
  const [previousRisk, setPreviousRisk] = useState("");
  const [previousChairman, setPreviousChairman] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const followUpFileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }), 100);
  }, []);

  const addMessage = useCallback((persona: SenateMessage["persona"], content: string, msgImages?: string[]) => {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), persona, content, timestamp: new Date(), images: msgImages }]);
    scrollToBottom();
  }, [scrollToBottom]);

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) { reject(new Error("Not an image")); return; }
      if (file.size > 10 * 1024 * 1024) { reject(new Error("File too large (max 10MB)")); return; }
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  };

  const handleFiles = useCallback(async (files: FileList) => {
    const newImages: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const b64 = await readFileAsBase64(file);
        newImages.push(b64);
      } catch (err: any) {
        toast({ title: "Upload error", description: err.message, variant: "destructive" });
      }
    }
    setImages(prev => {
      const combined = [...prev, ...newImages];
      if (combined.length > 5) {
        toast({ title: "Max 5 charts", description: "Remove some before adding more.", variant: "destructive" });
        return combined.slice(0, 5);
      }
      return combined;
    });
  }, [toast]);

  const handleFollowUpFiles = useCallback(async (files: FileList) => {
    const newImages: string[] = [];
    for (const file of Array.from(files)) {
      try {
        newImages.push(await readFileAsBase64(file));
      } catch (err: any) {
        toast({ title: "Upload error", description: err.message, variant: "destructive" });
      }
    }
    setFollowUpImages(prev => [...prev, ...newImages].slice(0, 5));
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const removeImage = (idx: number) => setImages(prev => prev.filter((_, i) => i !== idx));
  const removeFollowUpImage = (idx: number) => setFollowUpImages(prev => prev.filter((_, i) => i !== idx));

  const getSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast({ title: "Auth required", description: "Please sign in to use the AI Senate.", variant: "destructive" });
      return null;
    }
    return session;
  };

  const handleAnalyze = useCallback(async () => {
    if (images.length === 0) return;
    const session = await getSession();
    if (!session) return;

    setIsAnalyzing(true);
    setMessages([]);
    setVerdict(null);
    setNeedsMoreInfo(false);
    setFollowUpRound(1);

    addMessage("system", `🏛️ **Senate session opened.** ${images.length} chart${images.length > 1 ? "s" : ""} submitted for multi-agent analysis.`);
    addMessage("system", "⏳ Phase 1 — Dispatching charts to **The Quant** and **The Risk Manager** in parallel...");
    setPhase("Phase 1: Analysts reviewing charts...");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/forex-senate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ images, quantModel, riskModel, chairmanModel }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const result = await response.json();

      addMessage("quant", result.quant);
      await new Promise(r => setTimeout(r, 400));
      addMessage("risk", result.riskManager);

      setPhase("Phase 2: The Chairman is deliberating...");
      addMessage("system", "⚖️ Phase 2 — **The Chairman** is reviewing all evidence...");
      await new Promise(r => setTimeout(r, 600));

      addMessage("chairman", result.chairman);
      setVerdict(result.verdict);
      setPreviousQuant(result.quant);
      setPreviousRisk(result.riskManager);
      setPreviousChairman(result.chairman);

      if (result.needsMoreInfo) {
        setNeedsMoreInfo(true);
        setFollowUpRound(2);
        addMessage("system", "📋 **The Chairman needs more information.** Please respond below with answers and/or additional charts.");
      } else {
        addMessage("system", "✅ **Senate session closed.** Verdict delivered.");
      }
      setPhase("");
    } catch (err: any) {
      console.error("[SENATE UI]", err);
      toast({ title: "Analysis failed", description: err.message, variant: "destructive" });
      addMessage("system", `❌ **Error:** ${err.message}`);
      setPhase("");
    } finally {
      setIsAnalyzing(false);
    }
  }, [images, quantModel, riskModel, chairmanModel, addMessage, toast]);

  const handleFollowUp = useCallback(async () => {
    if (!followUpText.trim() && followUpImages.length === 0) return;
    const session = await getSession();
    if (!session) return;

    setIsAnalyzing(true);
    setNeedsMoreInfo(false);

    const userMsg = followUpText.trim() || "(Additional charts provided)";
    addMessage("user", userMsg, followUpImages.length > 0 ? followUpImages : undefined);
    addMessage("system", `⚖️ **The Chairman** is reviewing your response${followUpImages.length > 0 ? ` and ${followUpImages.length} new chart(s)` : ""}...`);
    setPhase("Chairman reviewing your response...");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/forex-senate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            images: [],
            isFollowUp: true,
            followUpText: followUpText.trim(),
            followUpImages,
            previousQuant,
            previousRisk,
            previousChairman,
            followUpRound,
            chairmanModel,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      addMessage("chairman", result.chairman);
      setVerdict(result.verdict);
      setPreviousChairman(result.chairman);

      if (result.needsMoreInfo) {
        setNeedsMoreInfo(true);
        setFollowUpRound(prev => prev + 1);
        addMessage("system", "📋 **The Chairman still needs clarification.** Please respond below.");
      } else {
        addMessage("system", "✅ **Senate session closed.** Final verdict delivered.");
      }
      setPhase("");
      setFollowUpText("");
      setFollowUpImages([]);
    } catch (err: any) {
      toast({ title: "Follow-up failed", description: err.message, variant: "destructive" });
      addMessage("system", `❌ **Error:** ${err.message}`);
      setNeedsMoreInfo(true);
      setPhase("");
    } finally {
      setIsAnalyzing(false);
    }
  }, [followUpText, followUpImages, previousQuant, previousRisk, previousChairman, followUpRound, chairmanModel, addMessage, toast]);

  const verdictDirection = verdict?.verdict?.toUpperCase();
  const isBuy = verdictDirection?.includes("BUY");
  const isSell = verdictDirection?.includes("SELL");
  const isNeedMore = verdictDirection?.includes("NEED_MORE_INFO");

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
            <p className="text-[10px] text-white/40 font-mono">Multi-Agent · Multi-Timeframe · Forex Intelligence</p>
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
              <Button variant="ghost" size="icon" className="text-white/50 hover:text-white"><Settings className="h-4 w-4" /></Button>
            </SheetTrigger>
            <SheetContent className="bg-[#0d0e14] border-white/10 text-white">
              <SheetHeader><SheetTitle className="text-white font-mono">Senate Configuration</SheetTitle></SheetHeader>
              <div className="mt-6 space-y-6">
                <p className="text-xs text-white/40 font-mono">Select which AI model represents each Senate member.</p>
                <Separator className="bg-white/10" />
                {[
                  { label: "The Quant", icon: Brain, color: "text-cyan-400", val: quantModel, set: setQuantModel },
                  { label: "Risk Manager", icon: ShieldAlert, color: "text-amber-400", val: riskModel, set: setRiskModel },
                  { label: "The Chairman", icon: Crown, color: "text-emerald-400", val: chairmanModel, set: setChairmanModel },
                ].map(({ label, icon: I, color, val, set }) => (
                  <div key={label}>
                    <label className={`text-xs font-mono ${color} flex items-center gap-2 mb-2`}><I className="h-3 w-3" /> {label}</label>
                    <Select value={val} onValueChange={set}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white text-xs font-mono"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-[#1a1b23] border-white/10">
                        {MODELS.map(m => <SelectItem key={m.value} value={m.value} className="text-white text-xs font-mono">{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr_320px] gap-0 h-[calc(100vh-57px)]">

        {/* Left: Multi-Image Upload Zone */}
        <div className="border-r border-white/10 p-4 flex flex-col gap-3 bg-[#0d0e14] overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono font-bold text-white/60 uppercase tracking-wider">Chart Input</h2>
            <Badge variant="outline" className="text-[10px] font-mono border-white/10 text-white/30">
              <Images className="h-3 w-3 mr-1" /> {images.length}/5
            </Badge>
          </div>

          {/* Image thumbnails */}
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {images.map((img, i) => (
                <div key={i} className="relative group rounded-lg overflow-hidden border border-white/10 bg-white/5">
                  <img src={img} alt={`Chart ${i + 1}`} className="w-full h-24 object-cover" />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                  <div className="absolute bottom-1 left-1 bg-black/70 rounded px-1.5 py-0.5">
                    <span className="text-[9px] font-mono text-white/60">TF {i + 1}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => images.length < 5 && fileInputRef.current?.click()}
            className={`
              flex-1 min-h-[120px] rounded-lg border-2 border-dashed cursor-pointer transition-all duration-200
              flex items-center justify-center
              ${images.length >= 5
                ? "border-white/5 bg-white/[0.01] cursor-not-allowed opacity-50"
                : "border-white/10 bg-white/[0.02] hover:border-cyan-500/50 hover:bg-cyan-950/20"
              }
            `}
          >
            <div className="text-center p-4">
              {images.length === 0 ? (
                <>
                  <Upload className="h-8 w-8 text-white/20 mx-auto mb-2" />
                  <p className="text-xs text-white/40 font-mono">Drop chart screenshots here</p>
                  <p className="text-[10px] text-white/20 font-mono mt-1">Upload multiple timeframes for best results</p>
                </>
              ) : images.length < 5 ? (
                <>
                  <Plus className="h-6 w-6 text-white/20 mx-auto mb-1" />
                  <p className="text-[10px] text-white/30 font-mono">Add another timeframe</p>
                </>
              ) : (
                <p className="text-[10px] text-white/20 font-mono">Max charts reached</p>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }}
            />
          </div>

          <Button
            onClick={handleAnalyze}
            disabled={images.length === 0 || isAnalyzing}
            className="w-full bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-mono text-xs tracking-wider"
          >
            {isAnalyzing ? <><Loader2 className="h-3 w-3 mr-2 animate-spin" /> Analyzing...</> : <><BarChart3 className="h-3 w-3 mr-2" /> Convene Senate</>}
          </Button>

          {images.length > 0 && !isAnalyzing && (
            <Button variant="ghost" size="sm" className="text-white/30 text-[10px] font-mono hover:text-white/60"
              onClick={() => { setImages([]); setMessages([]); setVerdict(null); setNeedsMoreInfo(false); setFollowUpText(""); setFollowUpImages([]); }}>
              Clear all
            </Button>
          )}
        </div>

        {/* Center: Senate Floor */}
        <div className="flex flex-col bg-[#0a0b0f] border-r border-white/10">
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
            <h2 className="text-xs font-mono font-bold text-white/60 uppercase tracking-wider">The Senate Floor</h2>
            {messages.length > 0 && (
              <Badge variant="outline" className="text-[10px] font-mono border-white/10 text-white/30">{messages.length} entries</Badge>
            )}
          </div>

          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-white/10">
                <div className="text-center">
                  <Crown className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-xs font-mono">Upload chart(s) and convene the Senate</p>
                  <p className="text-[10px] font-mono mt-1 opacity-50">Multiple timeframes = better analysis</p>
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
                        <span className="text-[10px] text-white/20 font-mono ml-auto">{msg.timestamp.toLocaleTimeString()}</span>
                      </div>
                      {msg.images && msg.images.length > 0 && (
                        <div className="flex gap-2 mb-2 flex-wrap">
                          {msg.images.map((img, i) => (
                            <img key={i} src={img} alt={`Attachment ${i + 1}`} className="h-16 rounded border border-white/10 object-cover" />
                          ))}
                        </div>
                      )}
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

          {/* Follow-up input zone */}
          {needsMoreInfo && !isAnalyzing && (
            <div className="border-t border-white/10 p-4 bg-[#0d0e14] space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3 w-3 text-violet-400" />
                <span className="text-[10px] font-mono text-violet-400 uppercase font-bold">Chairman requests your input</span>
              </div>
              {/* Follow-up image attachments */}
              {followUpImages.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {followUpImages.map((img, i) => (
                    <div key={i} className="relative group">
                      <img src={img} alt={`Follow-up ${i + 1}`} className="h-12 rounded border border-white/10 object-cover" />
                      <button onClick={() => removeFollowUpImage(i)}
                        className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="h-2.5 w-2.5 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" className="text-white/30 hover:text-white shrink-0 h-9 w-9"
                  onClick={() => followUpFileRef.current?.click()}>
                  <Plus className="h-4 w-4" />
                </Button>
                <input ref={followUpFileRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => { if (e.target.files?.length) handleFollowUpFiles(e.target.files); e.target.value = ""; }} />
                <Input
                  value={followUpText}
                  onChange={(e) => setFollowUpText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleFollowUp(); } }}
                  placeholder="Answer the Chairman's questions..."
                  className="bg-white/5 border-white/10 text-white text-xs font-mono placeholder:text-white/20"
                />
                <Button onClick={handleFollowUp} disabled={!followUpText.trim() && followUpImages.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-500 shrink-0 h-9 w-9 p-0">
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Action Panel */}
        <div className="p-4 flex flex-col gap-4 bg-[#0d0e14] overflow-y-auto">
          <h2 className="text-xs font-mono font-bold text-white/60 uppercase tracking-wider">Verdict</h2>

          {verdict ? (
            <div className="space-y-4">
              {/* Direction badge */}
              <div className={`rounded-lg p-4 text-center border ${
                isNeedMore ? "bg-violet-950/50 border-violet-700/50" :
                isBuy ? "bg-emerald-950/50 border-emerald-700/50" :
                isSell ? "bg-red-950/50 border-red-700/50" :
                "bg-zinc-900/50 border-zinc-700/50"
              }`}>
                <div className="flex items-center justify-center gap-2 mb-1">
                  {isNeedMore ? <MessageSquare className="h-5 w-5 text-violet-400" /> :
                   isBuy ? <TrendingUp className="h-5 w-5 text-emerald-400" /> :
                   isSell ? <TrendingDown className="h-5 w-5 text-red-400" /> :
                   <MinusCircle className="h-5 w-5 text-zinc-400" />}
                  <span className={`text-xl font-mono font-black tracking-wider ${
                    isNeedMore ? "text-violet-400" : isBuy ? "text-emerald-400" : isSell ? "text-red-400" : "text-zinc-400"
                  }`}>
                    {isNeedMore ? "MORE INFO" : verdict.verdict || "—"}
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
                  <div className={`h-full rounded-full transition-all duration-1000 ${
                    parseInt(verdict.confidence || "0") > 70 ? "bg-emerald-500" :
                    parseInt(verdict.confidence || "0") > 40 ? "bg-amber-500" : "bg-red-500"
                  }`} style={{ width: `${parseInt(verdict.confidence || "0")}%` }} />
                </div>
              </div>

              {/* Preliminary bias (when NEED_MORE_INFO) */}
              {isNeedMore && verdict.preliminary_bias && verdict.preliminary_bias !== "—" && (
                <div className="rounded-lg bg-violet-950/30 border border-violet-800/30 p-3">
                  <span className="text-[10px] text-violet-400/60 font-mono uppercase block mb-1">Preliminary Bias</span>
                  <p className="text-xs font-mono text-violet-300/70 leading-relaxed">{verdict.preliminary_bias}</p>
                </div>
              )}

              {/* Trade Parameters (only when not NEED_MORE_INFO) */}
              {!isNeedMore && (
                <Card className="bg-white/5 border-white/10">
                  <CardContent className="p-3 space-y-2">
                    {[
                      { label: "Entry", value: verdict.entry, icon: Target },
                      { label: "Stop Loss", value: verdict.stop_loss, icon: AlertTriangle },
                      { label: "Take Profit", value: verdict.take_profit, icon: TrendingUp },
                      { label: "Risk:Reward", value: verdict.risk_reward, icon: BarChart3 },
                    ].map(({ label, value, icon: I }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-[10px] text-white/40 font-mono flex items-center gap-1.5"><I className="h-3 w-3" /> {label}</span>
                        <span className="text-xs font-mono font-bold text-white">{value || "—"}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Rationale */}
              {!isNeedMore && verdict.rationale && verdict.rationale !== "—" && (
                <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                  <span className="text-[10px] text-white/40 font-mono uppercase block mb-1">Rationale</span>
                  <p className="text-xs font-mono text-white/60 leading-relaxed">{verdict.rationale}</p>
                </div>
              )}

              {/* Dissent */}
              {!isNeedMore && verdict.dissent && verdict.dissent !== "—" && (
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
