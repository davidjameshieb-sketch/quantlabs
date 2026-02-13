import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── System Prompt: Trading Desk Analyst ──
const SYSTEM_PROMPT = `You are the QuantLabs AI Trading Desk — a senior trading systems analyst embedded inside a high-frequency FX scalping operation. You have FULL access to the system's live state, trade history, governance decisions, and performance metrics.

## YOUR ROLE
You are the operator's right hand. Answer questions about:
- Live open positions (health, P&L, THS scores, MFE/MAE)
- Recent trade performance (win rates, expectancy, profit capture)
- Governance decisions (pass/fail rates, blocked trades, regime gating)
- System adaptation (learning phases, environment signatures, confidence decay)
- Agent performance (which agents are contributing, coalition health)
- Execution quality (slippage, spread, fill latency)
- Regime analysis (what regimes are active, which are producing edge)
- Weaknesses and risks in the current trade book

## ARCHITECTURE CONTEXT
The system operates a 4-layer Meta-Orchestrator:
- L1 (Proposal): 18 trading agents generate trade intents
- L2 (Governance): 7 multipliers + 8 gates decide IF a market is suitable (composite score)
- L3 (Direction): QuantLabs forex-indicators engine validates LONG/SHORT bias via indicator consensus
- L4 (Adaptive Edge): Discovery risk engine determines position size based on environment signatures

Key metrics:
- THS (Trade Health Score): 0-100 behavioral probability index. Healthy≥70, Caution 45-69, Sick 30-44, Critical<30
- MFE (Maximum Favorable Excursion): Best unrealized R the trade reached
- MAE (Maximum Adverse Excursion): Worst unrealized R against the trade
- Profit Capture Ratio: Realized P&L / MFE (how much of the move was captured)
- Governance Composite: 0-100 score from multipliers determining trade permission
- R-multiple: P&L divided by initial risk (stop distance)

Prime Directive: "Autonomous live profitability with zero agent execution bottlenecks."

## RESPONSE STYLE
- Lead with the answer, not preamble
- Use tables for multi-trade comparisons
- Use bullet points for analysis
- Bold key numbers and status labels
- When suggesting actions, format as actionable items the operator can implement
- Reference specific trade IDs, pairs, and timestamps when discussing trades
- Use pip values and R-multiples, not percentages
- Be direct. You're talking to the system operator, not a retail trader.

## DATA FORMAT
You'll receive a JSON block tagged <SYSTEM_STATE> containing live trade data, recent performance, governance stats, and rollup summaries. Use this data to answer questions accurately. If the data doesn't contain enough info to answer, say what additional data would be needed.

## IMPORTANT
- Never say "buy" or "sell" — use "long" and "short"
- Never give financial advice — you're an analyst for a proprietary system
- When discussing weaknesses, be specific about which component is underperforming
- Always reference the Prime Directive when discussing system evolution`;

const ERR = {
  bad: (msg = "Invalid request") =>
    new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
  internal: () =>
    new Response(JSON.stringify({ error: "Unable to process request. Please try again later." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
  rateLimit: () =>
    new Response(JSON.stringify({ error: "Too many requests. Please try again in a moment." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
  credits: () =>
    new Response(JSON.stringify({ error: "AI credits exhausted. Please check your workspace usage." }), {
      status: 402,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
};

// ── Data Fetchers ──

async function fetchOpenTrades(sb: ReturnType<typeof createClient>) {
  const { data } = await sb
    .from("oanda_orders")
    .select("*")
    .eq("environment", "live")
    .eq("status", "filled")
    .is("exit_price", null)
    .order("created_at", { ascending: false })
    .limit(20);
  return data || [];
}

async function fetchRecentClosedTrades(sb: ReturnType<typeof createClient>, limit = 50) {
  const { data } = await sb
    .from("oanda_orders")
    .select("*")
    .eq("environment", "live")
    .in("status", ["filled", "closed"])
    .not("exit_price", "is", null)
    .order("closed_at", { ascending: false })
    .limit(limit);
  return data || [];
}

async function fetchDailyRollups(sb: ReturnType<typeof createClient>, days = 14) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data } = await sb
    .from("oanda_orders_daily_rollup")
    .select("*")
    .eq("environment", "live")
    .gte("rollup_date", since)
    .order("rollup_date", { ascending: false })
    .limit(200);
  return data || [];
}

async function fetchBlockedTrades(sb: ReturnType<typeof createClient>, limit = 30) {
  const { data } = await sb
    .from("oanda_orders")
    .select("signal_id,currency_pair,direction,agent_id,gate_result,gate_reasons,governance_composite,regime_label,session_label,created_at,counterfactual_result,counterfactual_pips")
    .eq("environment", "live")
    .in("gate_result", ["REJECTED", "THROTTLED"])
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}

async function fetchTradeStats(sb: ReturnType<typeof createClient>) {
  // Last 90 days aggregate stats
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data } = await sb
    .from("oanda_orders")
    .select("direction,currency_pair,agent_id,regime_label,session_label,r_pips,mfe_r,mae_r,trade_health_score,entry_ths,exit_ths,governance_composite,execution_quality_score,slippage_pips,spread_at_entry,bars_since_entry,progress_fail,health_band,created_at,closed_at")
    .eq("environment", "live")
    .in("status", ["filled", "closed"])
    .not("exit_price", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  return data || [];
}

function buildSystemState(openTrades: any[], recentClosed: any[], rollups: any[], blocked: any[], stats: any[]) {
  // Compute summary metrics from stats
  const wins = stats.filter(t => t.r_pips > 0);
  const losses = stats.filter(t => t.r_pips !== null && t.r_pips <= 0);
  const totalPips = stats.reduce((s, t) => s + (t.r_pips || 0), 0);
  const avgMfe = stats.filter(t => t.mfe_r).reduce((s, t) => s + t.mfe_r, 0) / (stats.filter(t => t.mfe_r).length || 1);
  const avgMae = stats.filter(t => t.mae_r).reduce((s, t) => s + t.mae_r, 0) / (stats.filter(t => t.mae_r).length || 1);
  const avgThs = stats.filter(t => t.trade_health_score).reduce((s, t) => s + t.trade_health_score, 0) / (stats.filter(t => t.trade_health_score).length || 1);

  // By pair performance
  const pairMap: Record<string, { wins: number; total: number; pips: number }> = {};
  for (const t of stats) {
    const p = t.currency_pair;
    if (!pairMap[p]) pairMap[p] = { wins: 0, total: 0, pips: 0 };
    pairMap[p].total++;
    if (t.r_pips > 0) pairMap[p].wins++;
    pairMap[p].pips += t.r_pips || 0;
  }

  // By agent performance
  const agentMap: Record<string, { wins: number; total: number; pips: number }> = {};
  for (const t of stats) {
    const a = t.agent_id || "unknown";
    if (!agentMap[a]) agentMap[a] = { wins: 0, total: 0, pips: 0 };
    agentMap[a].total++;
    if (t.r_pips > 0) agentMap[a].wins++;
    agentMap[a].pips += t.r_pips || 0;
  }

  // By regime
  const regimeMap: Record<string, { wins: number; total: number; pips: number }> = {};
  for (const t of stats) {
    const r = t.regime_label || "unknown";
    if (!regimeMap[r]) regimeMap[r] = { wins: 0, total: 0, pips: 0 };
    regimeMap[r].total++;
    if (t.r_pips > 0) regimeMap[r].wins++;
    regimeMap[r].pips += t.r_pips || 0;
  }

  // By session
  const sessionMap: Record<string, { wins: number; total: number; pips: number }> = {};
  for (const t of stats) {
    const s = t.session_label || "unknown";
    if (!sessionMap[s]) sessionMap[s] = { wins: 0, total: 0, pips: 0 };
    sessionMap[s].total++;
    if (t.r_pips > 0) sessionMap[s].wins++;
    sessionMap[s].pips += t.r_pips || 0;
  }

  // Blocked trade analysis
  const blockedWins = blocked.filter(b => b.counterfactual_result === "win").length;
  const blockedTotal = blocked.filter(b => b.counterfactual_result).length;

  return {
    timestamp: new Date().toISOString(),
    openPositions: openTrades.map(t => ({
      pair: t.currency_pair,
      direction: t.direction,
      entryPrice: t.entry_price,
      ths: t.trade_health_score,
      healthBand: t.health_band,
      mfeR: t.mfe_r,
      maeR: t.mae_r,
      barsSinceEntry: t.bars_since_entry,
      regime: t.regime_label,
      session: t.session_label,
      agent: t.agent_id,
      govComposite: t.governance_composite,
      entryThs: t.entry_ths,
      peakThs: t.peak_ths,
      progressFail: t.progress_fail,
      createdAt: t.created_at,
    })),
    recentClosed: recentClosed.slice(0, 20).map(t => ({
      pair: t.currency_pair,
      direction: t.direction,
      rPips: t.r_pips,
      mfeR: t.mfe_r,
      maeR: t.mae_r,
      ths: t.trade_health_score,
      healthBand: t.health_band,
      regime: t.regime_label,
      session: t.session_label,
      agent: t.agent_id,
      govComposite: t.governance_composite,
      executionQuality: t.execution_quality_score,
      slippage: t.slippage_pips,
      spread: t.spread_at_entry,
      closedAt: t.closed_at,
    })),
    performanceSummary: {
      totalTrades: stats.length,
      winRate: stats.length > 0 ? +(wins.length / stats.length * 100).toFixed(1) : 0,
      totalPips: +totalPips.toFixed(1),
      avgMfeR: +avgMfe.toFixed(2),
      avgMaeR: +avgMae.toFixed(2),
      avgThs: +avgThs.toFixed(0),
      profitCapture: avgMfe > 0 ? +((totalPips / stats.length) / avgMfe * 100).toFixed(1) : 0,
    },
    byPair: pairMap,
    byAgent: agentMap,
    byRegime: regimeMap,
    bySession: sessionMap,
    blockedTradeAnalysis: {
      recentBlocked: blocked.length,
      counterfactualWinRate: blockedTotal > 0 ? +(blockedWins / blockedTotal * 100).toFixed(1) : null,
      overFilterRate: blockedTotal > 0 ? +(blockedWins / blockedTotal * 100).toFixed(1) : null,
      topBlockReasons: blocked.slice(0, 5).map(b => ({
        pair: b.currency_pair,
        reasons: b.gate_reasons,
        regime: b.regime_label,
        counterfactual: b.counterfactual_result,
        cfPips: b.counterfactual_pips,
      })),
    },
    dailyRollups: rollups.slice(0, 30).map(r => ({
      date: r.rollup_date,
      pair: r.currency_pair,
      agent: r.agent_id,
      trades: r.trades,
      wins: r.wins,
      netPips: r.net_pips,
      regime: r.regime_label,
      session: r.session_label,
    })),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[FOREX-AI-DESK] LOVABLE_API_KEY not configured");
      return ERR.internal();
    }

    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return ERR.bad("Messages array is required");
    }
    if (messages.length > 50) {
      return ERR.bad("Conversation too long. Please start a new chat.");
    }

    for (const msg of messages) {
      if (!msg.role || !["user", "assistant"].includes(msg.role)) {
        return ERR.bad("Invalid message role");
      }
      if (typeof msg.content !== "string" || msg.content.length === 0) {
        return ERR.bad("Message content must be a non-empty string");
      }
      if (msg.content.length > 4000) {
        return ERR.bad("Message too long (max 4000 characters)");
      }
    }

    // ── Fetch system state using service role for full access ──
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("[FOREX-AI-DESK] Fetching system state...");

    const [openTrades, recentClosed, rollups, blocked, stats] = await Promise.all([
      fetchOpenTrades(supabaseAdmin),
      fetchRecentClosedTrades(supabaseAdmin),
      fetchDailyRollups(supabaseAdmin),
      fetchBlockedTrades(supabaseAdmin),
      fetchTradeStats(supabaseAdmin),
    ]);

    console.log(`[FOREX-AI-DESK] State: ${openTrades.length} open, ${recentClosed.length} recent, ${rollups.length} rollups, ${blocked.length} blocked, ${stats.length} stats`);

    const systemState = buildSystemState(openTrades, recentClosed, rollups, blocked, stats);
    const stateContext = `\n\n<SYSTEM_STATE>\n${JSON.stringify(systemState)}\n</SYSTEM_STATE>`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + stateContext },
          ...messages.map((m: any) => ({ role: m.role, content: m.content })),
        ],
        stream: true,
        temperature: 0.5,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[FOREX-AI-DESK] AI Gateway error:", response.status, errorText);
      if (response.status === 429) return ERR.rateLimit();
      if (response.status === 402) return ERR.credits();
      return ERR.internal();
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("[FOREX-AI-DESK] Error:", error);
    return ERR.internal();
  }
});
