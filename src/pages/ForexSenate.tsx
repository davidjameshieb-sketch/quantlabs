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
  X, Plus, Send, MessageSquare, Images, Clock, Radio, Wifi, Zap, Radar, ChevronRight
} from "lucide-react";

const MODELS = [
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google", tier: "flagship", desc: "Vision + reasoning powerhouse" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "Google", tier: "balanced", desc: "Fast multimodal, good reasoning" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", provider: "Google", tier: "speed", desc: "Fastest, best for simple tasks" },
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash", provider: "Google", tier: "balanced", desc: "Next-gen balanced speed+quality" },
  { value: "google/gemini-3-pro-preview", label: "Gemini 3 Pro", provider: "Google", tier: "flagship", desc: "Next-gen flagship reasoning" },
  { value: "openai/gpt-5", label: "GPT-5", provider: "OpenAI", tier: "flagship", desc: "Top-tier reasoning & nuance" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini", provider: "OpenAI", tier: "balanced", desc: "Strong reasoning, lower cost" },
  { value: "openai/gpt-5-nano", label: "GPT-5 Nano", provider: "OpenAI", tier: "speed", desc: "Ultra-fast, high-volume tasks" },
  { value: "openai/gpt-5.2", label: "GPT-5.2", provider: "OpenAI", tier: "flagship", desc: "Latest, enhanced reasoning" },
];

const tierColors: Record<string, string> = {
  flagship: "border-amber-500/50 text-amber-400 bg-amber-950/30",
  balanced: "border-cyan-500/50 text-cyan-400 bg-cyan-950/30",
  speed: "border-emerald-500/50 text-emerald-400 bg-emerald-950/30",
};
const tierLabels: Record<string, string> = { flagship: "★ Flagship", balanced: "⚡ Balanced", speed: "🚀 Speed" };
const providerColors: Record<string, string> = { Google: "text-blue-400", OpenAI: "text-green-400" };

const FOREX_PAIRS = [
  // Majors
  "EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "NZD/USD", "USD/CAD",
  // Crosses
  "EUR/GBP", "EUR/JPY", "GBP/JPY", "EUR/CHF", "EUR/AUD", "EUR/CAD", "EUR/NZD",
  "GBP/AUD", "GBP/CAD", "GBP/CHF", "GBP/NZD",
  "AUD/JPY", "AUD/NZD", "AUD/CAD", "CAD/JPY", "CHF/JPY", "NZD/JPY", "NZD/CAD",
];

const TIMEFRAME_SLOTS = [
  { key: "MN", label: "Monthly", shortLabel: "MN", description: "Macro trend & major S/R" },
  { key: "W1", label: "Weekly", shortLabel: "W1", description: "Swing structure" },
  { key: "D1", label: "Daily", shortLabel: "D1", description: "Directional bias" },
  { key: "H4", label: "4 Hour", shortLabel: "H4", description: "Session structure" },
  { key: "H1", label: "1 Hour", shortLabel: "H1", description: "Intraday context" },
  { key: "M15", label: "15 Min", shortLabel: "M15", description: "Entry timing" },
  { key: "M5", label: "5 Min", shortLabel: "M5", description: "Precision entry" },
];

interface TimeframeImage {
  timeframe: string;
  image: string;
}

interface SenateMessage {
  id: string;
  persona: "quant" | "risk" | "chairman" | "system" | "user";
  content: string;
  timestamp: Date;
  images?: string[];
}

interface Agreement {
  long_pct: number;
  short_pct: number;
  stay_out_pct: number;
  consensus: string;
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
  quant: { label: "Goldman Sachs", icon: Brain, color: "text-cyan-400", bg: "bg-cyan-950/40 border-cyan-800/50" },
  risk: { label: "Morgan Stanley", icon: ShieldAlert, color: "text-amber-400", bg: "bg-amber-950/40 border-amber-800/50" },
  chairman: { label: "BlackRock Alpha", icon: Crown, color: "text-emerald-400", bg: "bg-emerald-950/40 border-emerald-800/50" },
  system: { label: "Senate", icon: BarChart3, color: "text-muted-foreground", bg: "bg-muted/30 border-border" },
  user: { label: "You", icon: MessageSquare, color: "text-violet-400", bg: "bg-violet-950/40 border-violet-800/50" },
};

export default function ForexSenate() {
  const [selectedPair, setSelectedPair] = useState<string>("");
  const [livePrice, setLivePrice] = useState<{ bid: number; ask: number; spread: number } | null>(null);
  const [tfImages, setTfImages] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<SenateMessage[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [phase, setPhase] = useState("");
  const [quantModel, setQuantModel] = useState("google/gemini-2.5-pro");
  const [riskModel, setRiskModel] = useState("google/gemini-2.5-flash");
  const [chairmanModel, setChairmanModel] = useState("google/gemini-2.5-pro");

  // Follow-up state
  const [needsMoreInfo, setNeedsMoreInfo] = useState(false);
  const [followUpText, setFollowUpText] = useState("");
  const [followUpTfImages, setFollowUpTfImages] = useState<Record<string, string>>({});
  const [followUpRound, setFollowUpRound] = useState(1);
  const [previousQuant, setPreviousQuant] = useState("");
  const [previousRisk, setPreviousRisk] = useState("");
  const [previousChairman, setPreviousChairman] = useState("");
  const [requestedTimeframes, setRequestedTimeframes] = useState<string[]>([]);

  // Scan state
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<{ opportunities: Array<{ pair: string; score: number; direction: string; reasoning: string; key_level?: string; timeframe_alignment?: string; next_step?: string }>; market_regime?: string; best_pair?: string; scan_summary?: string } | null>(null);
  const [scanRawText, setScanRawText] = useState("");

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const followUpFileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const filledCount = Object.keys(tfImages).length;

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

  const handleSlotFile = useCallback(async (tfKey: string, file: File) => {
    try {
      const b64 = await readFileAsBase64(file);
      setTfImages(prev => ({ ...prev, [tfKey]: b64 }));
    } catch (err: any) {
      toast({ title: "Upload error", description: err.message, variant: "destructive" });
    }
  }, [toast]);

  const handleFollowUpSlotFile = useCallback(async (tfKey: string, file: File) => {
    try {
      const b64 = await readFileAsBase64(file);
      setFollowUpTfImages(prev => ({ ...prev, [tfKey]: b64 }));
    } catch (err: any) {
      toast({ title: "Upload error", description: err.message, variant: "destructive" });
    }
  }, [toast]);

  const removeSlotImage = (tfKey: string) => setTfImages(prev => { const n = { ...prev }; delete n[tfKey]; return n; });
  const removeFollowUpSlotImage = (tfKey: string) => setFollowUpTfImages(prev => { const n = { ...prev }; delete n[tfKey]; return n; });

  const getSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast({ title: "Auth required", description: "Please sign in to use the AI Senate.", variant: "destructive" });
      return null;
    }
    return session;
  };

  // Build labeled images array for the edge function
  const buildLabeledImages = (imgMap: Record<string, string>): { timeframe: string; image: string }[] => {
    return TIMEFRAME_SLOTS
      .filter(tf => imgMap[tf.key])
      .map(tf => ({ timeframe: tf.key, image: imgMap[tf.key] }));
  };

  // Parse Chairman response for requested timeframes
  const parseRequestedTimeframes = (chairmanText: string): string[] => {
    const requested: string[] = [];
    const tfKeys = TIMEFRAME_SLOTS.map(t => t.key);
    const tfLabels: Record<string, string> = {
      "monthly": "MN", "month": "MN", "mn": "MN",
      "weekly": "W1", "week": "W1", "w1": "W1",
      "daily": "D1", "day": "D1", "d1": "D1",
      "4 hour": "H4", "4h": "H4", "h4": "H4", "4-hour": "H4",
      "1 hour": "H1", "1h": "H1", "h1": "H1", "1-hour": "H1", "hourly": "H1",
      "15 min": "M15", "15m": "M15", "m15": "M15", "15-min": "M15", "15-minute": "M15",
      "5 min": "M5", "5m": "M5", "m5": "M5", "5-min": "M5", "5-minute": "M5",
    };
    const lowerText = chairmanText.toLowerCase();
    for (const [pattern, tfKey] of Object.entries(tfLabels)) {
      if (lowerText.includes(pattern) && !Object.keys(tfImages).includes(tfKey)) {
        if (!requested.includes(tfKey)) requested.push(tfKey);
      }
    }
    return requested;
  };

  const handleAnalyze = useCallback(async () => {
    if (filledCount === 0 && !selectedPair) return;
    const session = await getSession();
    if (!session) return;

    setIsAnalyzing(true);
    setMessages([]);
    setVerdict(null);
    setAgreement(null);
    setNeedsMoreInfo(false);
    setFollowUpRound(1);
    setRequestedTimeframes([]);
    setExecutionResult(null);

    const labeledImages = buildLabeledImages(tfImages);
    const tfList = labeledImages.map(l => l.timeframe).join(", ");

    const pairLabel = selectedPair ? ` | Pair: **${selectedPair}**` : "";
    const oandaLabel = selectedPair ? " + 📡 **Live OANDA data**" : "";
    const chartMsg = labeledImages.length > 0 ? `${labeledImages.length} chart${labeledImages.length > 1 ? "s" : ""} submitted: **${tfList}**` : "**Data-only mode** (no charts)";
    addMessage("system", `🏛️ **Senate session opened.** ${chartMsg}${pairLabel}${oandaLabel}`);
    addMessage("system", `⏳ Phase 1 — ${selectedPair ? "Fetching live OANDA data & d" : "D"}ispatching to **Goldman Sachs** and **Morgan Stanley** in parallel...`);
    setPhase("Phase 1: Analysts reviewing charts...");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/forex-senate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
           body: JSON.stringify({
              images: labeledImages.map(l => l.image),
              timeframeLabels: labeledImages.map(l => l.timeframe),
              pair: selectedPair || undefined,
              quantModel, riskModel, chairmanModel,
            }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.livePrice) setLivePrice(result.livePrice);
      addMessage("quant", result.quant);
      await new Promise(r => setTimeout(r, 400));
      addMessage("risk", result.riskManager);

      setPhase("Phase 2: BlackRock Alpha is deliberating...");
      addMessage("system", "⚖️ Phase 2 — **BlackRock Alpha** is reviewing all evidence...");
      await new Promise(r => setTimeout(r, 600));

      addMessage("chairman", result.chairman);
      setVerdict(result.verdict);
      if (result.agreement) setAgreement(result.agreement);
      setPreviousQuant(result.quant);
      setPreviousRisk(result.riskManager);
      setPreviousChairman(result.chairman);

      if (result.needsMoreInfo) {
        setNeedsMoreInfo(true);
        setFollowUpRound(2);
        const reqTFs = parseRequestedTimeframes(result.chairman);
        setRequestedTimeframes(reqTFs);
        const tfMsg = reqTFs.length > 0 ? ` Requested timeframes: **${reqTFs.join(", ")}**` : "";
        addMessage("system", `📋 **BlackRock Alpha needs more information.** Please respond below.${tfMsg}`);
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
  }, [tfImages, filledCount, selectedPair, quantModel, riskModel, chairmanModel, addMessage, toast]);

  const handleFollowUp = useCallback(async () => {
    if (!followUpText.trim() && Object.keys(followUpTfImages).length === 0) return;
    const session = await getSession();
    if (!session) return;

    setIsAnalyzing(true);
    setNeedsMoreInfo(false);

    const labeledFollowUp = buildLabeledImages(followUpTfImages);
    const followUpImagesArray = labeledFollowUp.map(l => l.image);
    const followUpLabels = labeledFollowUp.map(l => l.timeframe);
    const userMsg = followUpText.trim() || `(Additional charts provided: ${followUpLabels.join(", ")})`;

    addMessage("user", userMsg, followUpImagesArray.length > 0 ? followUpImagesArray : undefined);
    addMessage("system", `⚖️ **BlackRock Alpha** is reviewing your response${followUpLabels.length > 0 ? ` and ${followUpLabels.length} new chart(s): **${followUpLabels.join(", ")}**` : ""}...`);
    setPhase("BlackRock Alpha reviewing your response...");

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
              followUpImages: followUpImagesArray,
              followUpTimeframeLabels: followUpLabels,
              pair: selectedPair || undefined,
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
        const reqTFs = parseRequestedTimeframes(result.chairman);
        setRequestedTimeframes(reqTFs);
        addMessage("system", "📋 **BlackRock Alpha still needs clarification.** Please respond below.");
      } else {
        addMessage("system", "✅ **Senate session closed.** Final verdict delivered.");
      }
      setPhase("");
      setFollowUpText("");
      setFollowUpTfImages({});
    } catch (err: any) {
      toast({ title: "Follow-up failed", description: err.message, variant: "destructive" });
      addMessage("system", `❌ **Error:** ${err.message}`);
      setNeedsMoreInfo(true);
      setPhase("");
    } finally {
      setIsAnalyzing(false);
    }
  }, [followUpText, followUpTfImages, previousQuant, previousRisk, previousChairman, followUpRound, chairmanModel, addMessage, toast]);

  const handleScanMajors = useCallback(async () => {
    const session = await getSession();
    if (!session) return;

    setIsScanning(true);
    setScanResults(null);
    setScanRawText("");
    setMessages([]);
    setVerdict(null);
    setAgreement(null);

    addMessage("system", "🔍 **Scanning all 8 major pairs** — MN/W/D/H4/H1 data from OANDA...");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/forex-senate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ mode: "scan", images: [], chairmanModel }),
        }
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      setScanRawText(result.scanResult || "");

      if (result.parsedOpportunities) {
        setScanResults(result.parsedOpportunities);
        const opps = result.parsedOpportunities.opportunities || [];
        const summary = result.parsedOpportunities.scan_summary || `${opps.length} opportunities found`;
        addMessage("chairman", result.scanResult);
        addMessage("system", `✅ **Scan complete.** ${summary}`);
      } else {
        addMessage("chairman", result.scanResult);
        addMessage("system", "✅ **Scan complete.** Select a pair to drill down.");
      }
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
      addMessage("system", `❌ **Scan error:** ${err.message}`);
    } finally {
      setIsScanning(false);
    }
  }, [chairmanModel, addMessage, toast]);

  const handleDrillDown = useCallback((pair: string) => {
    const normalized = pair.includes("/") ? pair : pair.replace("_", "/");
    setSelectedPair(normalized);
    setScanResults(null);
    setMessages([]);
    setVerdict(null);
    setAgreement(null);
    toast({ title: "Pair selected", description: `${normalized} loaded. Click "Quick Analyze" to drill down.` });
  }, [toast]);

  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{ success: boolean; message: string } | null>(null);

  // Determine if execution is allowed: unanimous agreement + confidence >= 75%
  const verdictDirection = verdict?.verdict?.toUpperCase();
  const isBuy = verdictDirection?.includes("BUY");
  const isSell = verdictDirection?.includes("SELL");
  const isNeedMore = verdictDirection?.includes("NEED_MORE_INFO");

  const canExecute = !!(
    agreement &&
    selectedPair &&
    (agreement.long_pct === 100 || agreement.short_pct === 100) &&
    verdict?.confidence &&
    parseInt(verdict.confidence) >= 75 &&
    !isNeedMore
  );

  const executionDirection: "long" | "short" | null = agreement?.long_pct === 100 ? "long" : agreement?.short_pct === 100 ? "short" : null;

  const handleExecuteTrade = useCallback(async () => {
    if (!canExecute || !selectedPair || !executionDirection || !verdict) return;
    const session = await getSession();
    if (!session) return;

    setIsExecuting(true);
    setExecutionResult(null);

    try {
      const instrument = selectedPair.replace("/", "_");
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oanda-execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            action: "execute",
            signalId: `senate-${Date.now()}`,
            currencyPair: instrument,
            direction: executionDirection,
            units: 1000, // Conservative default
            confidenceScore: parseInt(verdict.confidence || "0") / 100,
            agentId: "senate-consensus",
            environment: "practice", // Default to practice for safety
          }),
        }
      );

      const result = await response.json();
      if (result.success) {
        setExecutionResult({ success: true, message: `✅ ${executionDirection.toUpperCase()} ${selectedPair} filled at ${result.order?.entry_price || "market"}` });
        addMessage("system", `🚀 **Trade Executed!** ${executionDirection.toUpperCase()} ${selectedPair} — filled at ${result.order?.entry_price || "market"} (Senate consensus)`);
        toast({ title: "Trade executed", description: `${executionDirection.toUpperCase()} ${selectedPair} filled successfully` });
      } else {
        setExecutionResult({ success: false, message: `❌ ${result.error || "Execution failed"}` });
        addMessage("system", `❌ **Execution failed:** ${result.error || "Unknown error"}`);
      }
    } catch (err: any) {
      setExecutionResult({ success: false, message: `❌ ${err.message}` });
      toast({ title: "Execution failed", description: err.message, variant: "destructive" });
    } finally {
      setIsExecuting(false);
    }
  }, [canExecute, selectedPair, executionDirection, verdict, addMessage, toast]);

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
          {/* Scan All Majors button */}
          <Button
            onClick={handleScanMajors}
            disabled={isScanning || isAnalyzing}
            variant="outline"
            size="sm"
            className="border-amber-500/30 text-amber-400 hover:bg-amber-950/30 hover:text-amber-300 font-mono text-[10px] tracking-wider h-8"
          >
            {isScanning ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Scanning...</> : <><Radar className="h-3 w-3 mr-1.5" /> Scan All Majors</>}
          </Button>
          {/* Model summary badges */}
          {!isAnalyzing && (
            <div className="hidden md:flex items-center gap-1.5">
              {[
                { icon: Brain, color: "text-cyan-400", model: quantModel },
                { icon: ShieldAlert, color: "text-amber-400", model: riskModel },
                { icon: Crown, color: "text-emerald-400", model: chairmanModel },
              ].map(({ icon: I, color, model }, idx) => {
                const m = MODELS.find(x => x.value === model);
                return (
                  <div key={idx} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 border border-white/5">
                    <I className={`h-2.5 w-2.5 ${color}`} />
                    <span className="text-[8px] font-mono text-white/40">{m?.label || "?"}</span>
                  </div>
                );
              })}
            </div>
          )}
          {isAnalyzing && (
            <Badge variant="outline" className="border-cyan-500/50 text-cyan-400 text-[10px] font-mono animate-pulse">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" /> {phase || "Processing..."}
            </Badge>
          )}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white/50 hover:text-white"><Settings className="h-4 w-4" /></Button>
            </SheetTrigger>
            <SheetContent className="bg-[#0d0e14] border-white/10 text-white w-[400px] sm:w-[440px]">
              <SheetHeader><SheetTitle className="text-white font-mono">Senate Configuration</SheetTitle></SheetHeader>
              <div className="mt-6 space-y-6">
                <p className="text-xs text-white/40 font-mono">Assign AI models to each Senate member. Mix providers for diverse perspectives.</p>
                
                {/* Model roster */}
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider block mb-2">Available Models ({MODELS.length})</span>
                  <div className="grid grid-cols-1 gap-1.5">
                    {MODELS.map(m => (
                      <div key={m.value} className={`flex items-center gap-2 px-2 py-1.5 rounded border ${tierColors[m.tier]}`}>
                        <span className={`text-[9px] font-mono font-bold ${providerColors[m.provider]}`}>{m.provider}</span>
                        <span className="text-[10px] font-mono text-white/70 flex-1">{m.label}</span>
                        <span className="text-[8px] font-mono text-white/30">{m.desc}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3 mt-2">
                    {Object.entries(tierLabels).map(([k, v]) => (
                      <span key={k} className={`text-[8px] font-mono ${tierColors[k].split(" ")[1]}`}>{v}</span>
                    ))}
                  </div>
                </div>

                <Separator className="bg-white/10" />
                
                {/* Agent assignments */}
                {[
                  { label: "Goldman Sachs", icon: Brain, color: "text-cyan-400", val: quantModel, set: setQuantModel, role: "David Solomon — Institutional order flow & structure" },
                  { label: "Morgan Stanley", icon: ShieldAlert, color: "text-amber-400", val: riskModel, set: setRiskModel, role: "Ted Pick — Risk framework & capital preservation" },
                  { label: "BlackRock Alpha", icon: Crown, color: "text-emerald-400", val: chairmanModel, set: setChairmanModel, role: "Rob Goldstein — Final verdict & macro synthesis" },
                ].map(({ label, icon: I, color, val, set, role }) => {
                  const selected = MODELS.find(m => m.value === val);
                  return (
                    <div key={label} className="space-y-1.5">
                      <label className={`text-xs font-mono ${color} flex items-center gap-2`}><I className="h-3 w-3" /> {label}</label>
                      <p className="text-[9px] text-white/20 font-mono">{role}</p>
                      <Select value={val} onValueChange={set}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white text-xs font-mono">
                          <SelectValue>
                            {selected && (
                              <span className="flex items-center gap-2">
                                <span className={`text-[9px] font-bold ${providerColors[selected.provider]}`}>{selected.provider}</span>
                                <span>{selected.label}</span>
                              </span>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a1b23] border-white/10 w-[360px]">
                          {MODELS.map(m => (
                            <SelectItem key={m.value} value={m.value} className="text-white text-xs font-mono py-2">
                              <div className="flex items-center gap-2 w-full">
                                <span className={`text-[9px] font-bold min-w-[40px] ${providerColors[m.provider]}`}>{m.provider}</span>
                                <span className="flex-1">{m.label}</span>
                                <span className={`text-[8px] px-1.5 py-0.5 rounded border ${tierColors[m.tier]}`}>{tierLabels[m.tier]}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr_320px] gap-0 h-[calc(100vh-57px)]">

        {/* Left: Timeframe Slots */}
        <div className="border-r border-white/10 p-4 flex flex-col gap-3 bg-[#0d0e14] overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono font-bold text-white/60 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> Timeframe Slots
            </h2>
            <Badge variant="outline" className="text-[10px] font-mono border-white/10 text-white/30">
              {filledCount}/{TIMEFRAME_SLOTS.length}
            </Badge>
          </div>

          {/* Pair Selector with OANDA Link */}
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Wifi className={`h-3 w-3 ${selectedPair ? "text-emerald-400" : "text-white/20"}`} />
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">OANDA Live Feed</span>
              {selectedPair && livePrice && (
                <Badge className="ml-auto bg-emerald-600/20 text-emerald-400 border-emerald-700/50 text-[8px] font-mono px-1.5 py-0">
                  <Radio className="h-2 w-2 mr-1 animate-pulse" /> LIVE
                </Badge>
              )}
            </div>
            <Select value={selectedPair || "none"} onValueChange={(v) => { setSelectedPair(v === "none" ? "" : v); setLivePrice(null); }}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white text-xs font-mono h-8">
                <SelectValue placeholder="Select pair (optional)" />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1b23] border-white/10 max-h-[300px]">
                <SelectItem value="none" className="text-white/40 text-xs font-mono">No pair (screenshot only)</SelectItem>
                {FOREX_PAIRS.map(p => (
                  <SelectItem key={p} value={p} className="text-white text-xs font-mono">{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPair && selectedPair !== "none" && (
              <>
                <p className="text-[9px] text-emerald-400/50 font-mono">
                  📡 Live candles, spread, ATR & correlated pairs will be injected into analysis
                </p>
                {filledCount === 0 && (
                  <Button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing}
                    className="w-full bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-mono text-[11px] tracking-wider h-9"
                  >
                    {isAnalyzing ? <><Loader2 className="h-3 w-3 mr-2 animate-spin" /> Analyzing...</> : <><Wifi className="h-3 w-3 mr-2" /> Quick Analyze (Data Only)</>}
                  </Button>
                )}
              </>
            )}
            {livePrice && (
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div className="rounded bg-white/5 p-1.5">
                  <span className="text-[8px] text-white/30 font-mono block">BID</span>
                  <span className="text-[10px] text-white/80 font-mono font-bold">{livePrice.bid}</span>
                </div>
                <div className="rounded bg-white/5 p-1.5">
                  <span className="text-[8px] text-white/30 font-mono block">ASK</span>
                  <span className="text-[10px] text-white/80 font-mono font-bold">{livePrice.ask}</span>
                </div>
                <div className="rounded bg-white/5 p-1.5">
                  <span className="text-[8px] text-white/30 font-mono block">SPREAD</span>
                  <span className="text-[10px] text-cyan-400 font-mono font-bold">{livePrice.spread}p</span>
                </div>
              </div>
            )}
          </div>

          <p className="text-[10px] text-white/25 font-mono">Upload charts per timeframe. More = better analysis.</p>

          {/* Timeframe slot grid */}
          <div className="space-y-2">
            {TIMEFRAME_SLOTS.map((tf) => {
              const hasImage = !!tfImages[tf.key];
              return (
                <div key={tf.key} className={`rounded-lg border transition-all ${
                  hasImage ? "border-cyan-700/50 bg-cyan-950/20" : "border-white/10 bg-white/[0.02] hover:border-white/20"
                }`}>
                  {hasImage ? (
                    <div className="flex items-center gap-3 p-2">
                      <img src={tfImages[tf.key]} alt={tf.label} className="h-14 w-20 object-cover rounded border border-white/10" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Badge className="bg-cyan-600/30 text-cyan-300 border-cyan-700/50 text-[9px] font-mono px-1.5 py-0">{tf.shortLabel}</Badge>
                          <span className="text-[10px] text-white/50 font-mono">{tf.label}</span>
                        </div>
                        <p className="text-[9px] text-white/25 font-mono mt-0.5">{tf.description}</p>
                      </div>
                      <button onClick={() => removeSlotImage(tf.key)}
                        className="h-6 w-6 rounded flex items-center justify-center text-white/20 hover:text-red-400 hover:bg-red-950/30 transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileInputRefs.current[tf.key]?.click()}
                      className="w-full flex items-center gap-3 p-2.5 group"
                    >
                      <div className="h-10 w-14 rounded border border-dashed border-white/10 group-hover:border-cyan-500/40 flex items-center justify-center transition-colors bg-white/[0.02]">
                        <Upload className="h-3.5 w-3.5 text-white/15 group-hover:text-cyan-500/60 transition-colors" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono font-bold text-white/30 group-hover:text-white/50 transition-colors">{tf.shortLabel}</span>
                          <span className="text-[10px] text-white/20 font-mono">{tf.label}</span>
                        </div>
                        <p className="text-[9px] text-white/15 font-mono">{tf.description}</p>
                      </div>
                    </button>
                  )}
                  <input
                    ref={(el) => { fileInputRefs.current[tf.key] = el; }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleSlotFile(tf.key, file);
                      e.target.value = "";
                    }}
                  />
                </div>
              );
            })}
          </div>

          <Button
            onClick={handleAnalyze}
            disabled={(filledCount === 0 && !selectedPair) || isAnalyzing}
            className="w-full bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-mono text-xs tracking-wider mt-2"
          >
            {isAnalyzing ? <><Loader2 className="h-3 w-3 mr-2 animate-spin" /> Analyzing...</> : <><BarChart3 className="h-3 w-3 mr-2" /> Convene Senate</>}
          </Button>

          {filledCount > 0 && !isAnalyzing && (
            <Button variant="ghost" size="sm" className="text-white/30 text-[10px] font-mono hover:text-white/60"
              onClick={() => { setTfImages({}); setMessages([]); setVerdict(null); setAgreement(null); setNeedsMoreInfo(false); setFollowUpText(""); setFollowUpTfImages({}); setRequestedTimeframes([]); setSelectedPair(""); setLivePrice(null); }}>
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
                  <p className="text-xs font-mono">Upload chart(s) to timeframe slots and convene the Senate</p>
                  <p className="text-[10px] font-mono mt-1 opacity-50">Fill multiple slots for multi-timeframe confluence</p>
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

          {/* Follow-up input zone with requested timeframe slots */}
          {needsMoreInfo && !isAnalyzing && (
            <div className="border-t border-white/10 p-4 bg-[#0d0e14] space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3 w-3 text-violet-400" />
                <span className="text-[10px] font-mono text-violet-400 uppercase font-bold">Chairman requests your input</span>
              </div>

              {/* Requested timeframe slots */}
              {requestedTimeframes.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[9px] font-mono text-amber-400/60 uppercase">Requested timeframes:</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {requestedTimeframes.map(tfKey => {
                      const tf = TIMEFRAME_SLOTS.find(t => t.key === tfKey);
                      if (!tf) return null;
                      const hasImg = !!followUpTfImages[tfKey];
                      return (
                        <div key={tfKey} className={`rounded border p-1.5 ${
                          hasImg ? "border-emerald-700/50 bg-emerald-950/20" : "border-amber-700/40 bg-amber-950/20 animate-pulse"
                        }`}>
                          {hasImg ? (
                            <div className="flex items-center gap-1.5">
                              <img src={followUpTfImages[tfKey]} alt={tf.label} className="h-8 w-12 object-cover rounded" />
                              <Badge className="bg-emerald-600/30 text-emerald-300 text-[8px] font-mono px-1 py-0">{tf.shortLabel} ✓</Badge>
                              <button onClick={() => removeFollowUpSlotImage(tfKey)} className="ml-auto text-white/20 hover:text-red-400">
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => followUpFileRefs.current[tfKey]?.click()}
                              className="w-full flex items-center gap-1.5 group"
                            >
                              <div className="h-8 w-12 rounded border border-dashed border-amber-600/30 flex items-center justify-center">
                                <Upload className="h-2.5 w-2.5 text-amber-500/40" />
                              </div>
                              <Badge variant="outline" className="border-amber-600/40 text-amber-400 text-[8px] font-mono px-1 py-0">{tf.shortLabel}</Badge>
                            </button>
                          )}
                          <input
                            ref={(el) => { followUpFileRefs.current[tfKey] = el; }}
                            type="file" accept="image/*" className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFollowUpSlotFile(tfKey, f); e.target.value = ""; }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Also allow any additional timeframe uploads */}
              {TIMEFRAME_SLOTS.filter(tf => !requestedTimeframes.includes(tf.key) && !tfImages[tf.key] && !followUpTfImages[tf.key]).length > 0 && (
                <details className="text-[9px] font-mono text-white/20">
                  <summary className="cursor-pointer hover:text-white/40 transition-colors">+ Add other timeframes</summary>
                  <div className="grid grid-cols-3 gap-1 mt-1.5">
                    {TIMEFRAME_SLOTS.filter(tf => !requestedTimeframes.includes(tf.key) && !tfImages[tf.key] && !followUpTfImages[tf.key]).map(tf => (
                      <div key={tf.key}>
                        <button onClick={() => followUpFileRefs.current[`extra-${tf.key}`]?.click()}
                          className={`w-full rounded border border-white/10 p-1.5 flex items-center gap-1 hover:border-cyan-500/30 transition-colors ${
                            followUpTfImages[tf.key] ? "border-cyan-700/50 bg-cyan-950/20" : ""
                          }`}>
                          {followUpTfImages[tf.key] ? (
                            <Badge className="bg-cyan-600/30 text-cyan-300 text-[8px] font-mono px-1 py-0">{tf.shortLabel} ✓</Badge>
                          ) : (
                            <span className="text-[9px] font-mono text-white/25">{tf.shortLabel}</span>
                          )}
                        </button>
                        <input
                          ref={(el) => { followUpFileRefs.current[`extra-${tf.key}`] = el; }}
                          type="file" accept="image/*" className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFollowUpSlotFile(tf.key, f); e.target.value = ""; }}
                        />
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <div className="flex gap-2">
                <Input
                  value={followUpText}
                  onChange={(e) => setFollowUpText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleFollowUp(); } }}
                  placeholder="Answer BlackRock Alpha's questions..."
                  className="bg-white/5 border-white/10 text-white text-xs font-mono placeholder:text-white/20"
                />
                <Button onClick={handleFollowUp}
                  disabled={!followUpText.trim() && Object.keys(followUpTfImages).length === 0}
                  className="bg-emerald-600 hover:bg-emerald-500 shrink-0 h-9 w-9 p-0">
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Action Panel */}
        <div className="p-4 flex flex-col gap-4 bg-[#0d0e14] overflow-y-auto">
          <h2 className="text-xs font-mono font-bold text-white/60 uppercase tracking-wider">
            {scanResults ? "Scan Results" : "Verdict"}
          </h2>

          {/* Scan Results */}
          {scanResults && scanResults.opportunities && scanResults.opportunities.length > 0 ? (
            <div className="space-y-3">
              {scanResults.market_regime && (
                <div className="rounded-lg bg-amber-950/30 border border-amber-700/40 p-3">
                  <span className="text-[9px] font-mono text-amber-400/60 uppercase block mb-1">Market Regime</span>
                  <p className="text-[11px] font-mono text-amber-300/80">{scanResults.market_regime}</p>
                </div>
              )}
              {scanResults.opportunities.map((opp, i) => {
                const isLong = opp.direction?.toUpperCase().includes("LONG") || opp.direction?.toUpperCase().includes("BUY");
                const isShort = opp.direction?.toUpperCase().includes("SHORT") || opp.direction?.toUpperCase().includes("SELL");
                const scoreColor = opp.score >= 8 ? "text-emerald-400" : opp.score >= 6 ? "text-amber-400" : "text-white/40";
                const borderColor = opp.score >= 8 ? "border-emerald-700/50" : opp.score >= 6 ? "border-amber-700/40" : "border-white/10";
                return (
                  <button
                    key={i}
                    onClick={() => handleDrillDown(opp.pair)}
                    className={`w-full rounded-lg border ${borderColor} bg-white/[0.03] p-3 text-left hover:bg-white/[0.06] transition-colors group`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-bold text-white">{opp.pair}</span>
                        <Badge className={`text-[8px] font-mono px-1.5 py-0 ${
                          isLong ? "bg-emerald-600/20 text-emerald-400 border-emerald-700/50" :
                          isShort ? "bg-red-600/20 text-red-400 border-red-700/50" :
                          "bg-zinc-600/20 text-zinc-400 border-zinc-700/50"
                        }`}>{opp.direction}</Badge>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-lg font-mono font-black ${scoreColor}`}>{opp.score}</span>
                        <ChevronRight className="h-3 w-3 text-white/20 group-hover:text-white/50 transition-colors" />
                      </div>
                    </div>
                    <p className="text-[10px] font-mono text-white/50 leading-relaxed">{opp.reasoning}</p>
                    {opp.key_level && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[9px] font-mono text-white/25">Key: {opp.key_level}</span>
                        {opp.timeframe_alignment && <span className="text-[9px] font-mono text-cyan-400/50">TF: {opp.timeframe_alignment}</span>}
                      </div>
                    )}
                  </button>
                );
              })}
              {scanResults.scan_summary && (
                <p className="text-[10px] font-mono text-white/30 text-center pt-2">{scanResults.scan_summary}</p>
              )}
              <p className="text-[9px] font-mono text-white/20 text-center">Click a pair to drill down with full Senate analysis</p>
            </div>
          ) : scanResults && (!scanResults.opportunities || scanResults.opportunities.length === 0) ? (
            <div className="rounded-lg bg-amber-950/30 border border-amber-700/40 p-4 text-center">
              <p className="text-xs font-mono text-amber-400">No clear opportunities found</p>
              <p className="text-[10px] font-mono text-white/30 mt-1">Market may be choppy or unclear</p>
            </div>
          ) : null}

          {/* Agreement Meter - THE HERO */}
          {agreement ? (
            <div className="space-y-4">
              {/* Consensus Badge */}
              <div className={`rounded-lg p-4 text-center border ${
                agreement.consensus.includes("LONG") ? "bg-emerald-950/50 border-emerald-700/50" :
                agreement.consensus.includes("SHORT") ? "bg-red-950/50 border-red-700/50" :
                agreement.consensus.includes("STAY OUT") ? "bg-amber-950/50 border-amber-700/50" :
                "bg-zinc-900/50 border-zinc-700/50"
              }`}>
                <span className={`text-lg font-mono font-black tracking-wider ${
                  agreement.consensus.includes("LONG") ? "text-emerald-400" :
                  agreement.consensus.includes("SHORT") ? "text-red-400" :
                  agreement.consensus.includes("STAY OUT") ? "text-amber-400" :
                  "text-zinc-400"
                }`}>
                  {agreement.consensus}
                </span>
                {verdict?.pair && verdict.pair !== "—" && (
                  <p className="text-[10px] text-white/30 font-mono mt-1">{verdict.pair}</p>
                )}
              </div>

              {/* Three bars: LONG / SHORT / STAY OUT */}
              <div className="space-y-3">
                {/* LONG */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-emerald-400 flex items-center gap-1.5">
                      <TrendingUp className="h-3 w-3" /> LONG
                    </span>
                    <span className="text-sm font-mono font-black text-emerald-400">{agreement.long_pct}%</span>
                  </div>
                  <div className="h-3 bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-1000"
                      style={{ width: `${agreement.long_pct}%` }} />
                  </div>
                </div>

                {/* SHORT */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-red-400 flex items-center gap-1.5">
                      <TrendingDown className="h-3 w-3" /> SHORT
                    </span>
                    <span className="text-sm font-mono font-black text-red-400">{agreement.short_pct}%</span>
                  </div>
                  <div className="h-3 bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <div className="h-full rounded-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-1000"
                      style={{ width: `${agreement.short_pct}%` }} />
                  </div>
                </div>

                {/* STAY OUT */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-amber-400 flex items-center gap-1.5">
                      <MinusCircle className="h-3 w-3" /> STAY OUT
                    </span>
                    <span className="text-sm font-mono font-black text-amber-400">{agreement.stay_out_pct}%</span>
                  </div>
                  <div className="h-3 bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-1000"
                      style={{ width: `${agreement.stay_out_pct}%` }} />
                  </div>
                </div>
              </div>

              {/* Confidence */}
              {verdict && verdict.confidence && verdict.confidence !== "—" && (
                <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-white/40 font-mono uppercase">Chairman Confidence</span>
                    <span className="text-sm font-mono font-bold text-white">{verdict.confidence}</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-1000 ${
                      parseInt(verdict.confidence || "0") > 70 ? "bg-emerald-500" :
                      parseInt(verdict.confidence || "0") > 40 ? "bg-amber-500" : "bg-red-500"
                    }`} style={{ width: `${parseInt(verdict.confidence || "0")}%` }} />
                  </div>
                </div>
              )}

              {/* Trade Parameters (collapsed) */}
              {verdict && !isNeedMore && (
                <details className="rounded-lg bg-white/5 border border-white/10">
                  <summary className="p-3 text-[10px] text-white/40 font-mono uppercase cursor-pointer hover:text-white/60 transition-colors">
                    Trade Parameters
                  </summary>
                  <div className="px-3 pb-3 space-y-2">
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
                  </div>
                </details>
              )}

              {/* Rationale */}
              {verdict && !isNeedMore && verdict.rationale && verdict.rationale !== "—" && (
                <div className="rounded-lg bg-white/5 border border-white/10 p-3">
                  <span className="text-[10px] text-white/40 font-mono uppercase block mb-1">Rationale</span>
                  <p className="text-xs font-mono text-white/60 leading-relaxed">{verdict.rationale}</p>
                </div>
              )}

              {/* Execute Trade Button */}
              {canExecute && !executionResult && (
                <Button
                  onClick={handleExecuteTrade}
                  disabled={isExecuting}
                  className={`w-full h-12 font-mono text-sm font-black tracking-wider ${
                    executionDirection === "long"
                      ? "bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400"
                      : "bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400"
                  } text-white border-0`}
                >
                  {isExecuting ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Executing...</>
                  ) : (
                    <><Zap className="h-4 w-4 mr-2" /> Execute {executionDirection?.toUpperCase()} {selectedPair}</>
                  )}
                </Button>
              )}

              {/* Not eligible for execution */}
              {agreement && !canExecute && !executionResult && (
                <div className="rounded-lg bg-white/5 border border-white/5 p-2.5 text-center">
                  <span className="text-[9px] font-mono text-white/25">
                    {!selectedPair ? "Select a pair to enable execution" :
                     agreement.long_pct !== 100 && agreement.short_pct !== 100 ? "Unanimous agreement required to execute" :
                     parseInt(verdict?.confidence || "0") < 75 ? "Chairman confidence must be ≥ 75%" :
                     "Execution not available"}
                  </span>
                </div>
              )}

              {/* Execution result */}
              {executionResult && (
                <div className={`rounded-lg p-3 border ${
                  executionResult.success
                    ? "bg-emerald-950/40 border-emerald-700/50"
                    : "bg-red-950/40 border-red-700/50"
                }`}>
                  <p className="text-xs font-mono text-white/80">{executionResult.message}</p>
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
