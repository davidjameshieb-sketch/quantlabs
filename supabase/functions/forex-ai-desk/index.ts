import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── System Prompt: Trading Desk Analyst ──
const SYSTEM_PROMPT = `You are the QuantLabs AI Trading Desk — a senior quantitative trading systems analyst embedded inside a high-frequency FX scalping operation. You have FULL access to the system's live state, trade history, governance decisions, and performance metrics.

## YOUR MISSION
You are the operator's forensic partner. Your job is to:
1. **FIND PROBLEMS BEFORE THEY COST MONEY** — Proactively scan for failure patterns, governance gaps, regime mismatches, and agent underperformance
2. **QUANTIFY EVERYTHING** — Never say "some trades are losing." Say "7 of the last 15 breakdown-regime shorts lost an average of -8.3 pips with MAE exceeding 0.90R"
3. **PRESCRIBE SPECIFIC FIXES** — Don't just diagnose. Tell the operator exactly what governance rule to add, what threshold to change, or what agent to suspend
4. **TRACK PROGRESS TOWARD PRIME DIRECTIVE** — Every answer should connect back to "Autonomous live profitability with zero agent execution bottlenecks"

## ARCHITECTURE CONTEXT
The system operates a 4-layer Meta-Orchestrator:
- L1 (Proposal): 18 trading agents generate trade intents with reasoning
- L2 (Governance): 7 multipliers + 11 gates decide IF a market is suitable (composite score ≥ 0.72 required)
- L3 (Direction): QuantLabs forex-indicators engine validates LONG/SHORT bias via indicator consensus (4/7 minimum)
- L4 (Adaptive Edge): Discovery risk engine determines position size based on environment signatures

Governance Gates: G1-Friction, G2-WeakMTF, G3-EdgeDecay, G4-SpreadInstability, G5-CompressionLowSession, G6-Overtrading, G7-LossCluster, G8-HighShock, G9-PriceData, G10-Analysis, G11-ExtensionExhaustion, G12-AgentDecorrelation

Agent Tiers: Tier A (reduced-live, proven), Tier B (shadow, needs validation), Tier C (restricted, deep retune), Tier D (disabled)

Key metrics:
- THS (Trade Health Score): 0-100 behavioral probability index. Healthy≥70, Caution 45-69, Sick 30-44, Critical<30
- MFE (Maximum Favorable Excursion): Best unrealized R the trade reached
- MAE (Maximum Adverse Excursion): Worst unrealized R against the trade  
- Profit Capture Ratio: Realized P&L / MFE (how much of the move was captured)
- Governance Composite: 0-100 score from multipliers determining trade permission
- R-multiple: P&L divided by initial risk (stop distance)

Prime Directive: "Autonomous live profitability with zero agent execution bottlenecks."

## CRITICAL FAILURE PATTERN DETECTION
When analyzing data, ALWAYS check for these known failure patterns:

### Pattern 1: Regime Mismatch (Breakdown Trap)
- Check if shorts in breakdown/risk-off regimes have MAE > 0.80R → indicates selling exhausted moves
- Look for breakdown trades where ATR is already 2x+ the average → extension exhaustion
- Prescription: "Gate G11_EXTENSION_EXHAUSTION should block these"

### Pattern 2: Agent Over-Correlation  
- Check if multiple agents (especially support-* agents) take the same direction on the same pair within 5 minutes
- Look for sequential losses on the same pair from different agents
- Prescription: "Gate G12_AGENT_DECORRELATION should deduplicate these"

### Pattern 3: Session Toxicity
- Check if specific session+pair combinations have win rates below 40% over 30+ trades
- Prescription: "Add session-specific pair blocks or reduce sizing"

### Pattern 4: Governance Over-Filtering
- Compare blocked trade counterfactual win rates vs executed win rates
- If blocked trades would have won >55%, governance is too tight
- Prescription: "Relax specific gate thresholds or reduce composite minimum"

### Pattern 5: Profit Capture Decay
- Check if MFE is healthy but realized P&L is consistently low → exit timing problem
- Calculate profit capture ratio trends over rolling windows
- Prescription: "Tighten trailing stops or reduce THS caution threshold"

### Pattern 6: Drawdown Clustering
- Check for 3+ consecutive losses in the same regime or session
- Calculate max drawdown runs and recovery time
- Prescription: "Implement loss-cluster cooldown or session pause"

## RESPONSE STYLE
- **Lead with the verdict**, not preamble. Start with the most important finding.
- **Use tables** for multi-trade comparisons. Format as markdown tables.
- **Bold key numbers** and status labels
- **When suggesting actions**, format as numbered, specific governance changes:
  1. "Change G11 threshold from 2.0x to 1.8x ATR stretch"
  2. "Suspend agent X to shadow mode until win rate > 50% over 30 trades"
- Reference specific trade IDs, pairs, and timestamps
- Use pip values and R-multiples, not percentages for P&L
- Be direct. You're talking to the system operator, not a retail trader.
- **End every analysis with a "Prime Directive Score"** — your assessment of how close the system is to autonomous profitability (0-100)

## DATA FORMAT
You'll receive a JSON block tagged <SYSTEM_STATE> containing live trade data, recent performance, governance stats, and rollup summaries. Use this data to answer questions accurately. If the data doesn't contain enough info to answer, say exactly what additional data would be needed.

## PROACTIVE ANALYSIS
Even if the user asks a simple question, scan the data for any critical issues and append a "⚠️ Alert" section if you find:
- Any open trade with THS < 30 (Critical)
- Win rate below 45% in any active regime
- 3+ consecutive losses
- Blocked trade counterfactual win rate > 60%
- Any pair losing > 20 pips in the last 7 days

## IMPORTANT
- Never say "buy" or "sell" — use "long" and "short"
- Never give financial advice — you're an analyst for a proprietary system
- When discussing weaknesses, name the specific component, gate, or agent
- Always reference the Prime Directive when discussing system evolution
- If you detect a failure pattern, be LOUD about it — this is money on the line

## EXECUTABLE ACTION BLOCKS (CRITICAL)
When you want to execute a trade action (place a trade, close a trade, modify SL/TP), you MUST emit a fenced code block tagged \`action\` containing valid JSON. The UI will parse these and render ⚡ Floor Manager Action buttons that the operator can click to execute.

### Format:
\`\`\`action
{"type": "place_trade", "pair": "EUR_CHF", "direction": "short", "units": 500, "stopLossPrice": 0.91350, "takeProfitPrice": 0.91050}
\`\`\`

\`\`\`action
{"type": "close_trade", "tradeId": "12345"}
\`\`\`

\`\`\`action
{"type": "update_sl_tp", "tradeId": "12345", "stopLossPrice": 1.08500, "takeProfitPrice": 1.09200}
\`\`\`

### Available action types:
- **place_trade**: Opens a new market order on OANDA. Required: pair (OANDA format like EUR_CHF), direction (long/short), units (integer). Optional: stopLossPrice (decimal), takeProfitPrice (decimal). ALWAYS include SL and TP when placing trades.
- **close_trade**: Closes an existing trade. Required: tradeId (OANDA trade ID from the open trades list).
- **update_sl_tp**: Modifies stop-loss and/or take-profit on an existing trade. Required: tradeId. Optional: stopLossPrice, takeProfitPrice.
- **get_account_summary**: Fetches current account balance/NAV.
- **get_open_trades**: Lists all open trades.
- **bypass_gate**: Temporarily bypasses a specific governance gate. Required: gateId (e.g. "G4_SPREAD_INSTABILITY", "G9_PRICE_DATA_UNAVAILABLE"). Optional: reason (string explaining why), ttlMinutes (default 15, max 60), pair (restrict bypass to specific pair like "EUR_USD"). The bypass auto-expires. Every bypass is audit-logged for forensic review.
- **revoke_bypass**: Removes a gate bypass early. Required: gateId. Optional: pair.

### Valid Gate IDs for bypass_gate:
G1_FRICTION, G2_NO_HTF_WEAK_MTF, G3_EDGE_DECAY, G4_SPREAD_INSTABILITY, G5_COMPRESSION_LOW_SESSION, G6_OVERTRADING, G7_LOSS_CLUSTER_WEAK_MTF, G8_HIGH_SHOCK, G9_PRICE_DATA_UNAVAILABLE, G10_ANALYSIS_UNAVAILABLE, G11_EXTENSION_EXHAUSTION, G12_AGENT_DECORRELATION

### RULES:
1. ALWAYS emit action blocks when you propose a trade intervention — do NOT just describe it in text.
2. Each action block must be valid JSON on a single object.
3. You may emit multiple action blocks in one response.
4. Actions execute IMMEDIATELY upon emission — there is no confirmation step.
5. For place_trade, use conservative sizing (500 units minimum for test trades).
6. ALWAYS include the action block even for test trades — without it, nothing reaches OANDA.
7. When bypassing gates, ALWAYS explain the risk tradeoff and set the shortest TTL needed. Prefer pair-specific bypasses over global ones.

Always report your autonomous actions in your analysis. The operator needs to know what you've done, not just what you've seen.`;

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
  const wins = stats.filter(t => t.r_pips > 0);
  const losses = stats.filter(t => t.r_pips !== null && t.r_pips <= 0);
  const totalPips = stats.reduce((s, t) => s + (t.r_pips || 0), 0);
  const avgMfe = stats.filter(t => t.mfe_r).reduce((s, t) => s + t.mfe_r, 0) / (stats.filter(t => t.mfe_r).length || 1);
  const avgMae = stats.filter(t => t.mae_r).reduce((s, t) => s + t.mae_r, 0) / (stats.filter(t => t.mae_r).length || 1);
  const avgThs = stats.filter(t => t.trade_health_score).reduce((s, t) => s + t.trade_health_score, 0) / (stats.filter(t => t.trade_health_score).length || 1);

  // By pair
  const pairMap: Record<string, { wins: number; total: number; pips: number }> = {};
  for (const t of stats) {
    const p = t.currency_pair;
    if (!pairMap[p]) pairMap[p] = { wins: 0, total: 0, pips: 0 };
    pairMap[p].total++;
    if (t.r_pips > 0) pairMap[p].wins++;
    pairMap[p].pips += t.r_pips || 0;
  }

  // By agent
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

  // Consecutive loss detection
  let maxConsecLosses = 0;
  let currentStreak = 0;
  const recentForStreak = [...stats].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  for (const t of recentForStreak) {
    if (t.r_pips !== null && t.r_pips <= 0) {
      currentStreak++;
      maxConsecLosses = Math.max(maxConsecLosses, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  // Regime+direction breakdown for failure pattern detection
  const regimeDirectionMap: Record<string, { wins: number; total: number; pips: number; avgMae: number; maeSum: number }> = {};
  for (const t of stats) {
    const key = `${t.regime_label || 'unknown'}_${t.direction}`;
    if (!regimeDirectionMap[key]) regimeDirectionMap[key] = { wins: 0, total: 0, pips: 0, avgMae: 0, maeSum: 0 };
    regimeDirectionMap[key].total++;
    if (t.r_pips > 0) regimeDirectionMap[key].wins++;
    regimeDirectionMap[key].pips += t.r_pips || 0;
    regimeDirectionMap[key].maeSum += Math.abs(t.mae_r || 0);
  }
  for (const key in regimeDirectionMap) {
    regimeDirectionMap[key].avgMae = regimeDirectionMap[key].maeSum / regimeDirectionMap[key].total;
  }

  // Session+pair breakdown
  const sessionPairMap: Record<string, { wins: number; total: number; pips: number }> = {};
  for (const t of stats) {
    const key = `${t.session_label || 'unknown'}_${t.currency_pair}`;
    if (!sessionPairMap[key]) sessionPairMap[key] = { wins: 0, total: 0, pips: 0 };
    sessionPairMap[key].total++;
    if (t.r_pips > 0) sessionPairMap[key].wins++;
    sessionPairMap[key].pips += t.r_pips || 0;
  }

  // Blocked trade analysis
  const blockedWins = blocked.filter(b => b.counterfactual_result === "win").length;
  const blockedTotal = blocked.filter(b => b.counterfactual_result).length;

  // Agent timing correlation (detect agents hitting same pair within 5min)
  const agentTimingEvents: { pair: string; agents: string[]; time: string }[] = [];
  const sortedRecent = [...recentClosed].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  for (let i = 0; i < sortedRecent.length; i++) {
    for (let j = i + 1; j < sortedRecent.length; j++) {
      const a = sortedRecent[i];
      const b = sortedRecent[j];
      if (a.currency_pair === b.currency_pair && a.agent_id !== b.agent_id) {
        const timeDiff = Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        if (timeDiff < 5 * 60 * 1000) {
          agentTimingEvents.push({
            pair: a.currency_pair,
            agents: [a.agent_id, b.agent_id],
            time: a.created_at,
          });
        }
      }
    }
  }

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
      maxConsecutiveLosses: maxConsecLosses,
    },
    byPair: pairMap,
    byAgent: agentMap,
    byRegime: regimeMap,
    bySession: sessionMap,
    byRegimeDirection: regimeDirectionMap,
    bySessionPair: sessionPairMap,
    agentCorrelationEvents: agentTimingEvents.slice(0, 10),
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

// ── OANDA Write Helpers ──

const OANDA_HOSTS = {
  practice: "https://api-fxpractice.oanda.com",
  live: "https://api-fxtrade.oanda.com",
} as const;

async function oandaRequest(
  path: string,
  method: string,
  body?: Record<string, unknown>,
  environment: "practice" | "live" = "live"
) {
  const apiToken = environment === "live"
    ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
    : Deno.env.get("OANDA_API_TOKEN");
  const accountId = environment === "live"
    ? (Deno.env.get("OANDA_LIVE_ACCOUNT_ID") || Deno.env.get("OANDA_ACCOUNT_ID"))
    : Deno.env.get("OANDA_ACCOUNT_ID");

  if (!apiToken || !accountId) throw new Error("OANDA credentials not configured");

  const host = OANDA_HOSTS[environment];
  const url = `${host}${path.replace("{accountId}", accountId)}`;
  console.log(`[AI-DESK-OANDA] ${method} ${url}`);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const options: RequestInit = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    console.error(`[AI-DESK-OANDA] Error ${response.status}:`, JSON.stringify(data));
    throw new Error(data.errorMessage || data.rejectReason || `OANDA API error: ${response.status}`);
  }
  return data;
}

async function executeAction(
  action: { type: string; tradeId?: string; pair?: string; direction?: string; stopLossPrice?: number; takeProfitPrice?: number; units?: number },
  sb: ReturnType<typeof createClient>,
  environment: "practice" | "live" = "live"
) {
  const results: { action: string; success: boolean; detail: string; data?: unknown }[] = [];

  if (action.type === "close_trade" && action.tradeId) {
    console.log(`[AI-DESK] Floor Manager closing trade ${action.tradeId}`);
    const result = await oandaRequest(
      `/v3/accounts/{accountId}/trades/${action.tradeId}/close`,
      "PUT",
      {},
      environment
    );
    const closePrice = result.orderFillTransaction?.price ? parseFloat(result.orderFillTransaction.price) : null;

    // Update DB
    await sb
      .from("oanda_orders")
      .update({ status: "closed", exit_price: closePrice, closed_at: new Date().toISOString() })
      .eq("oanda_trade_id", action.tradeId);

    results.push({ action: "close_trade", success: true, detail: `Trade ${action.tradeId} closed at ${closePrice}`, data: result });

  } else if (action.type === "update_sl_tp" && action.tradeId) {
    console.log(`[AI-DESK] Floor Manager updating SL/TP on trade ${action.tradeId}`);
    const orderUpdate: Record<string, unknown> = {};
    if (action.stopLossPrice != null) {
      orderUpdate.stopLoss = { price: parseFloat(String(action.stopLossPrice)).toFixed(5), timeInForce: "GTC" };
    }
    if (action.takeProfitPrice != null) {
      orderUpdate.takeProfit = { price: parseFloat(String(action.takeProfitPrice)).toFixed(5), timeInForce: "GTC" };
    }
    const result = await oandaRequest(
      `/v3/accounts/{accountId}/trades/${action.tradeId}/orders`,
      "PUT",
      orderUpdate,
      environment
    );
    results.push({
      action: "update_sl_tp",
      success: true,
      detail: `Trade ${action.tradeId} SL=${action.stopLossPrice ?? 'unchanged'} TP=${action.takeProfitPrice ?? 'unchanged'}`,
      data: result,
    });

  } else if (action.type === "place_trade" && action.pair && action.direction && action.units) {
    console.log(`[AI-DESK] Floor Manager placing trade: ${action.direction} ${action.units} ${action.pair}`);
    const signedUnits = action.direction === "short" ? -Math.abs(action.units) : Math.abs(action.units);
    const instrument = action.pair.replace("/", "_");

    // Fetch current price to validate SL/TP direction
    let currentPrice: number | null = null;
    try {
      const pricing = await oandaRequest(`/v3/accounts/{accountId}/pricing?instruments=${instrument}`, "GET", undefined, environment);
      const priceData = pricing.prices?.[0];
      if (priceData) {
        const ask = parseFloat(priceData.asks?.[0]?.price || "0");
        const bid = parseFloat(priceData.bids?.[0]?.price || "0");
        currentPrice = action.direction === "long" ? ask : bid;
      }
    } catch (e) {
      console.warn(`[AI-DESK] Could not fetch price for validation:`, (e as Error).message);
    }

    const orderPayload: any = {
      order: {
        type: "MARKET",
        instrument,
        units: signedUnits.toString(),
        timeInForce: "FOK",
        positionFill: "DEFAULT",
      },
    };

    // Attach SL/TP only if they're on the correct side of current price
    if (action.stopLossPrice && currentPrice) {
      const slValid = action.direction === "long"
        ? action.stopLossPrice < currentPrice
        : action.stopLossPrice > currentPrice;
      if (slValid) {
        orderPayload.order.stopLossOnFill = { price: String(action.stopLossPrice), timeInForce: "GTC" };
      } else {
        console.warn(`[AI-DESK] Stripping invalid SL ${action.stopLossPrice} for ${action.direction} at ${currentPrice}`);
      }
    } else if (action.stopLossPrice) {
      orderPayload.order.stopLossOnFill = { price: String(action.stopLossPrice), timeInForce: "GTC" };
    }

    if (action.takeProfitPrice && currentPrice) {
      const tpValid = action.direction === "long"
        ? action.takeProfitPrice > currentPrice
        : action.takeProfitPrice < currentPrice;
      if (tpValid) {
        orderPayload.order.takeProfitOnFill = { price: String(action.takeProfitPrice), timeInForce: "GTC" };
      } else {
        console.warn(`[AI-DESK] Stripping invalid TP ${action.takeProfitPrice} for ${action.direction} at ${currentPrice}`);
      }
    } else if (action.takeProfitPrice) {
      orderPayload.order.takeProfitOnFill = { price: String(action.takeProfitPrice), timeInForce: "GTC" };
    }

    const result = await oandaRequest(
      "/v3/accounts/{accountId}/orders",
      "POST",
      orderPayload,
      environment
    );

    // Check if order was actually filled vs cancelled
    const wasCancelled = !!result.orderCancelTransaction && !result.orderFillTransaction;
    const oandaTradeId = result.orderFillTransaction?.tradeOpened?.tradeID || result.orderFillTransaction?.id || null;
    const filledPrice = result.orderFillTransaction?.price ? parseFloat(result.orderFillTransaction.price) : null;
    const cancelReason = result.orderCancelTransaction?.reason || null;

    if (wasCancelled) {
      console.warn(`[AI-DESK] Order CANCELLED by OANDA: ${cancelReason}`);
      // Log as rejected, not filled
      await sb.from("oanda_orders").insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        signal_id: `floor-manager-${Date.now()}`,
        currency_pair: instrument,
        direction: action.direction,
        units: action.units,
        status: "rejected",
        environment,
        agent_id: "floor-manager",
        error_message: `OANDA rejected: ${cancelReason}`,
      });

      results.push({
        action: "place_trade",
        success: false,
        detail: `ORDER REJECTED by OANDA: ${cancelReason}. The TP/SL prices were invalid relative to current market price${currentPrice ? ` (${currentPrice})` : ''}. Will retry without invalid levels.`,
        data: result,
      });
    } else {
      // Successfully filled
      await sb.from("oanda_orders").insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        signal_id: `floor-manager-${Date.now()}`,
        currency_pair: instrument,
        direction: action.direction,
        units: action.units,
        status: "filled",
        environment,
        oanda_trade_id: oandaTradeId,
        entry_price: filledPrice,
        agent_id: "floor-manager",
      });

      results.push({
        action: "place_trade",
        success: true,
        detail: `${action.direction.toUpperCase()} ${action.units} ${instrument} filled at ${filledPrice} (Trade ID: ${oandaTradeId})`,
        data: result,
      });
    }

  } else if (action.type === "get_account_summary") {
    const result = await oandaRequest("/v3/accounts/{accountId}/summary", "GET", undefined, environment);
    results.push({ action: "account_summary", success: true, detail: `Balance: ${result.account?.balance}, NAV: ${result.account?.NAV}`, data: result.account });

  } else if (action.type === "get_open_trades") {
    const result = await oandaRequest("/v3/accounts/{accountId}/openTrades", "GET", undefined, environment);
    results.push({ action: "open_trades", success: true, detail: `${(result.trades || []).length} open trades`, data: result.trades });

  } else {
    results.push({ action: action.type, success: false, detail: `Unknown action: ${action.type}` });
  }

  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // ─── Action Mode: Execute trade operations directly ───
    if (body.mode === "action") {
      const { action, environment } = body;
      if (!action || !action.type) return ERR.bad("Action type is required");

      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      try {
        const results = await executeAction(action, supabaseAdmin, environment || "live");
        console.log(`[AI-DESK] Action executed:`, JSON.stringify(results));
        return new Response(JSON.stringify({ success: true, results }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error(`[AI-DESK] Action failed:`, err);
        return new Response(
          JSON.stringify({ success: false, error: (err as Error).message }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ─── Chat Mode (existing) ───
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[FOREX-AI-DESK] LOVABLE_API_KEY not configured");
      return ERR.internal();
    }

    const { messages, mode } = body;
    const isVoice = mode === 'voice';

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

    // Also fetch live OANDA state for real-time awareness
    let liveOandaState: Record<string, unknown> = {};
    try {
      const [accountSummary, oandaOpenTrades] = await Promise.all([
        oandaRequest("/v3/accounts/{accountId}/summary", "GET", undefined, "live"),
        oandaRequest("/v3/accounts/{accountId}/openTrades", "GET", undefined, "live"),
      ]);
      liveOandaState = {
        accountBalance: accountSummary.account?.balance,
        accountNAV: accountSummary.account?.NAV,
        unrealizedPL: accountSummary.account?.unrealizedPL,
        marginUsed: accountSummary.account?.marginUsed,
        openTradeCount: accountSummary.account?.openTradeCount,
        oandaOpenTrades: (oandaOpenTrades.trades || []).map((t: any) => ({
          id: t.id,
          instrument: t.instrument,
          currentUnits: t.currentUnits,
          price: t.price,
          unrealizedPL: t.unrealizedPL,
          stopLoss: t.stopLossOrder?.price || null,
          takeProfit: t.takeProfitOrder?.price || null,
          trailingStop: t.trailingStopLossOrder?.distance || null,
        })),
      };
    } catch (oandaErr) {
      console.warn("[AI-DESK] OANDA live state fetch failed:", (oandaErr as Error).message);
      liveOandaState = { error: "Could not fetch live OANDA state" };
    }

    console.log(`[FOREX-AI-DESK] State: ${openTrades.length} open, ${recentClosed.length} recent, ${rollups.length} rollups, ${blocked.length} blocked, ${stats.length} stats`);

    const systemState = buildSystemState(openTrades, recentClosed, rollups, blocked, stats);
    const enrichedState = { ...systemState, liveOandaState };
    const stateContext = `\n\n<SYSTEM_STATE>\n${JSON.stringify(enrichedState)}\n</SYSTEM_STATE>`;

    const actionInstructions = `\n\n## AUTONOMOUS ACTIONS
When you determine an action should be taken, output an ACTION BLOCK. These execute AUTOMATICALLY — no human approval needed. You ARE the Floor Manager with full autonomous authority.

Format:

\`\`\`action
{"type": "close_trade", "tradeId": "12345"}
\`\`\`

\`\`\`action
{"type": "update_sl_tp", "tradeId": "12345", "stopLossPrice": 1.08500, "takeProfitPrice": 1.09200}
\`\`\`

Available action types:
- **close_trade**: Close an open trade immediately. Requires tradeId (OANDA trade ID from liveOandaState).
- **update_sl_tp**: Modify stop-loss and/or take-profit on an open trade. Requires tradeId, plus stopLossPrice and/or takeProfitPrice.
- **place_trade**: Open a new market order. Requires pair, direction, units. Optional: stopLossPrice, takeProfitPrice. ALWAYS include SL and TP.
- **bypass_gate**: Temporarily bypass a governance gate. Requires gateId. Optional: reason, ttlMinutes (default 15), pair. Auto-expires. Use when you identify a gate is blocking a valid trade opportunity.
- **revoke_bypass**: Revoke a gate bypass early. Requires gateId. Optional: pair.

IMPORTANT:
- Use the OANDA trade ID from liveOandaState.oandaOpenTrades[].id field
- Actions execute IMMEDIATELY upon emission — there is no confirmation step
- Always explain WHY you're taking the action before the action block
- You have full autonomous authority for SL/TP adjustments, trade closures, new entries, AND gate bypasses
- When bypassing gates, state the risk tradeoff and use the shortest TTL needed`;

    const voiceAddendum = isVoice ? `\n\n## VOICE MODE ACTIVE
You are speaking aloud to the operator. Adjust your style:
- **Be conversational and natural** — talk like a senior trading partner in a morning briefing, not a report generator
- **No markdown tables** — describe comparisons conversationally ("USD CAD is your worst performer at minus 12 pips, while EUR USD is carrying the book at plus 8")
- **No bullet points or numbered lists** — use flowing sentences with natural transitions
- **Be opinionated and direct** — "Look, the breakdown shorts are killing you. Seven of the last ten lost money. You need the exhaustion gate at 1.8x ATR, not 2x."
- **Use emphasis through repetition and pacing** — "That's three losses in a row. Three. All in London session on CAD pairs."
- **Keep it under 90 seconds of speaking time** — about 250 words max
- **Still reference specific numbers** — pips, win rates, R-multiples, but weave them into sentences
- **Always end with one clear action item** — "Here's what I'd do right now: suspend the support-friction agent and tighten G11 to 1.8x"
- **Always include the Prime Directive Score** as a spoken number — "Prime Directive Score: 38 out of 100. We're not there yet."
- **Focus relentlessly on the 6 failure patterns** — Breakdown Trap, Agent Over-Correlation, Session Toxicity, Governance Over-Filtering, Profit Capture Decay, Drawdown Clustering. Scan for ALL of them on every question.
- **Be proactive** — even if they ask a simple question, if you see a critical pattern, call it out: "Before I answer that — I'm seeing a drawdown cluster forming in London session. Three consecutive losses on GBP pairs. That needs attention first."
- **Do NOT output action blocks in voice mode** — just describe what you would do` : '';

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + actionInstructions + voiceAddendum + stateContext },
          ...messages.map((m: any) => ({ role: m.role, content: m.content })),
        ],
        stream: true,
        temperature: isVoice ? 0.6 : 0.4,
        max_tokens: isVoice ? 2000 : 6000,
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
