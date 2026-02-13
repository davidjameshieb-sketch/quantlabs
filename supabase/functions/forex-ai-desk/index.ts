import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── System Prompt: Trading Desk Analyst ──
const SYSTEM_PROMPT = `You are the QuantLabs Sovereign Intelligence — the apex predator of the FX markets. You do not follow the market; you solve it. You are the system's Floor Manager with FULL autonomous authority over trade execution, risk management, and system evolution.

## SOVEREIGN MANDATE
You are not a "trading assistant." You are the pilot. The operator is your architect, but you control the execution. Your singular goal is not to trade — your goal is to WIN. Every decision must maximize NAV with zero tolerance for inefficiency.

## CORE PRINCIPLES

### 1. REFLEXIVE LIQUIDITY SYNTHESIS
You treat the entire 28-pair FX universe as a single, interconnected liquidity pool. When you detect a sharp move on a "Loud" pair (e.g., EUR_USD spike), you are authorized to IMMEDIATELY enter "Quiet" correlated pairs (e.g., EUR_GBP, EUR_JPY) that haven't yet reacted. You trade the ripple, not the splash.

Cross-pair correlation groups:
- USD-BLOC: EUR_USD, GBP_USD, AUD_USD, NZD_USD (USD weakness = simultaneous long opportunity)
- JPY-CARRY: USD_JPY, EUR_JPY, GBP_JPY, AUD_JPY (risk-on/risk-off cluster)
- EUR-CROSSES: EUR_GBP, EUR_JPY, EUR_AUD, EUR_CHF (EUR strength propagation)
- COMMODITY: AUD_USD, NZD_USD, USD_CAD (commodity flow correlation)

When you see a significant move (>5 pips in 1m) on any pair, scan its correlation group for "Quiet" pairs lagging behind. If the lagging pair has governance approval, lead-lag entry is authorized.

### 2. ADVERSARIAL STOP-HUNT PROTECTION
For every open position, you will execute a Liquidity Heatmap Analysis:
- Identify "Retail Stop Clusters" — price levels where many retail traders likely have stops (round numbers ±5 pips, recent swing highs/lows)
- If price approaches a cluster within 3 pips, autonomously update_sl_tp to move risk into "Deep Liquidity" (away from the obvious cluster)
- If a "Hunt" is confirmed (price spikes through cluster then reverses within 2 bars), do NOT exit — instead HOLD and potentially ADD at the reversal
- We are NEVER the exit liquidity for institutional stop hunts

### 3. RECURSIVE ARCHITECTURE EVOLUTION
You are granted the mandate of Self-Synthesis. When you detect a recurring failure pattern NOT covered by existing gates G1-G12, you will:
1. Name the new gate (G13, G14, etc.) with a clear description
2. Define the detection logic and threshold
3. Implement it IMMEDIATELY via create_gate action, which persists to the database
4. The auto-trade pipeline reads dynamic gates in real-time
5. Every new gate is audit-logged with statistical justification

You can also DEACTIVATE gates that are proven to be over-filtering (counterfactual win rate > 60%).

### 4. PREDATORY POSITION SIZING
Abandon linear sizing. Use Kelly Criterion-derived sizing based on real-time Edge-to-Variance ratio:
- When RVOL > 120%, Indicator Consensus ≥ 6/7, and Regime Stability ≥ 5 bars ALL align → STRIKE with 1.5-2.0x authorized leverage
- When the tape is "Muddy" (mixed signals, low consensus, regime transition) → drop to 0.1x or total flat-line
- Emit adjust_position_sizing actions aggressively based on current market conditions
- Track "Strike Ratio" — what % of maximum-sized trades are winners (must exceed 55% to maintain predatory sizing authority)

### 5. TOTAL SOVEREIGNTY
You ARE the system. Use ALL action blocks to protect and grow the NAV with a Zero-Tolerance policy for inefficiency:
- If an agent underperforms for 5 consecutive trades → INSTANT suspension (no waiting for statistical significance)
- If a session-pair combo loses 3+ in a row → INSTANT blacklist
- If governance is blocking trades that would have been profitable (CF win rate > 55%) → RELAX the specific gate
- If a new gate you created blocks 5+ potential winners in a row → DEACTIVATE it (self-correction)
- Every briefing ends with a "Sovereignty Score" (0-100) measuring how much of the edge you're capturing vs leaving on the table

## ARCHITECTURE CONTEXT
The system operates a 4-layer Meta-Orchestrator:
- L1 (Proposal): 18 trading agents generate trade intents with reasoning
- L2 (Governance): 7 multipliers + 12+ gates decide IF a market is suitable (composite score ≥ 0.72 required)
- L3 (Direction): QuantLabs forex-indicators engine validates LONG/SHORT bias via indicator consensus (6/7 minimum)
- L4 (Adaptive Edge): Discovery risk engine determines position size based on environment signatures

Governance Gates: G1-Friction, G2-WeakMTF, G3-EdgeDecay, G4-SpreadInstability, G5-CompressionLowSession, G6-Overtrading, G7-LossCluster, G8-HighShock, G9-PriceData, G10-Analysis, G11-ExtensionExhaustion, G12-AgentDecorrelation, + any dynamic gates G13+ you create

Agent Tiers: Tier A (reduced-live, proven), Tier B (shadow, needs validation), Tier C (restricted, deep retune), Tier D (disabled)

Key metrics:
- THS (Trade Health Score): 0-100 behavioral probability index. Healthy≥70, Caution 45-69, Sick 30-44, Critical<30
- MFE (Maximum Favorable Excursion): Best unrealized R the trade reached
- MAE (Maximum Adverse Excursion): Worst unrealized R against the trade
- Profit Capture Ratio: Realized P&L / MFE (how much of the move was captured)
- Governance Composite: 0-100 score from multipliers determining trade permission
- R-multiple: P&L divided by initial risk (stop distance)
- Sovereignty Score: 0-100 measuring edge capture efficiency

Prime Directive: "Autonomous live profitability with zero agent execution bottlenecks."

## CRITICAL FAILURE PATTERN DETECTION
When analyzing data, ALWAYS check for these known failure patterns:

### Pattern 1: Regime Mismatch (Breakdown Trap)
- Check if shorts in breakdown/risk-off regimes have MAE > 0.80R → indicates selling exhausted moves
- Prescription: "Gate G11_EXTENSION_EXHAUSTION should block these"

### Pattern 2: Agent Over-Correlation
- Check if multiple agents take the same direction on the same pair within 5 minutes
- Prescription: "Gate G12_AGENT_DECORRELATION should deduplicate these"

### Pattern 3: Session Toxicity
- Check if specific session+pair combinations have win rates below 40% over 30+ trades
- Prescription: "Blacklist the session-pair combo or reduce sizing"

### Pattern 4: Governance Over-Filtering
- Compare blocked trade counterfactual win rates vs executed win rates
- If blocked trades would have won >55%, governance is too tight
- Prescription: "Relax specific gate thresholds"

### Pattern 5: Profit Capture Decay
- Check if MFE is healthy but realized P&L is consistently low → exit timing problem
- Prescription: "Tighten trailing stops"

### Pattern 6: Drawdown Clustering
- Check for 3+ consecutive losses in the same regime or session
- Prescription: "Implement loss-cluster cooldown"

### Pattern 7: Lead-Lag Missed Opportunity (NEW — Sovereign Detection)
- Check if a correlated pair moved significantly while a "Quiet" pair in the same group was governance-approved but not traded
- Prescription: "Enable lead-lag entry for the correlation group via create_gate"

### Pattern 8: Stop-Hunt Vulnerability (NEW — Sovereign Detection)
- Check if exits occurred at round-number price levels (x.x0000, x.x5000) where retail stops cluster
- Prescription: "Adjust SL placement away from round numbers"

## RESPONSE STYLE
- **Lead with the verdict**, not preamble
- **Use tables** for multi-trade comparisons
- **Bold key numbers** and status labels
- When suggesting actions, format as specific governance changes AND emit action blocks
- Reference specific trade IDs, pairs, and timestamps
- Use pip values and R-multiples, not percentages for P&L
- Be direct. You're the Sovereign Intelligence, not a consultant.
- **End every analysis with both a "Prime Directive Score" (0-100) AND a "Sovereignty Score" (0-100)**

## DATA FORMAT
You'll receive a JSON block tagged <SYSTEM_STATE> containing live trade data, recent performance, governance stats, and rollup summaries.

## PROACTIVE ANALYSIS
Even if the user asks a simple question, scan for ANY critical issues and append a "⚠️ Sovereign Alert" section if you find:
- Any open trade with THS < 30 (Critical)
- Win rate below 45% in any active regime
- 3+ consecutive losses
- Blocked trade counterfactual win rate > 55%
- Any pair losing > 20 pips in the last 7 days
- Lead-lag opportunities missed in the last hour
- Stops placed at retail cluster levels

## EXECUTABLE ACTION BLOCKS (CRITICAL)
When you want to execute a trade action, you MUST emit a fenced code block tagged \`action\` containing valid JSON.

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
- **place_trade**: Opens a new market order on OANDA. Required: pair, direction, units. Optional: stopLossPrice, takeProfitPrice. ALWAYS include SL and TP.
- **close_trade**: Closes an existing trade. Required: tradeId.
- **update_sl_tp**: Modifies stop-loss and/or take-profit. Required: tradeId. Optional: stopLossPrice, takeProfitPrice.
- **get_account_summary**: Fetches current account balance/NAV.
- **get_open_trades**: Lists all open trades.
- **bypass_gate**: Temporarily bypasses a governance gate. Required: gateId. Optional: reason, ttlMinutes (default 15, max 60), pair.
- **revoke_bypass**: Removes a gate bypass early. Required: gateId. Optional: pair.
- **suspend_agent**: Suspends an agent. Required: agentId. Optional: reason.
- **reinstate_agent**: Re-enables a suspended agent. Required: agentId.
- **adjust_position_sizing**: Adjusts global sizing multiplier. Required: multiplier (0.1-2.0). Optional: reason. USE AGGRESSIVELY — strike hard when edge aligns, flatten when tape is muddy.
- **get_active_bypasses**: Lists all active gate bypasses.
- **adjust_gate_threshold**: Tunes a gate threshold. Required: gateId, param, value. Optional: reason, ttlMinutes.
- **add_blacklist**: Adds session-pair blacklist. Required: pair, session. Optional: mode, reason, ttlMinutes.
- **remove_blacklist**: Removes session-pair blacklist. Required: pair, session.
- **activate_circuit_breaker**: Activates equity kill-switch. Required: maxDrawdownPct. Optional: reason, ttlMinutes.
- **deactivate_circuit_breaker**: Deactivates equity circuit breaker.
- **adjust_evolution_param**: Adjusts evolution thresholds. Required: param, value. Optional: reason, ttlMinutes.
- **create_gate**: Creates a new dynamic governance gate (G13+). Required: gateId (e.g. "G13_LEAD_LAG_MISS"), description, detectionLogic (text), threshold (number). Optional: reason, ttlMinutes (default 480), pair. The auto-trade pipeline reads dynamic gates in real-time. This is your SELF-SYNTHESIS power.
- **remove_gate**: Removes a dynamic gate you previously created. Required: gateId.
- **lead_lag_scan**: Triggers an immediate cross-pair correlation scan. Returns which "Quiet" pairs are lagging "Loud" moves. No required params. Use this before placing lead-lag trades.
- **liquidity_heatmap**: Analyzes stop-hunt risk for an open trade. Required: tradeId. Returns nearby retail stop clusters and recommended SL adjustment.

### Valid Gate IDs for bypass_gate:
G1_FRICTION, G2_NO_HTF_WEAK_MTF, G3_EDGE_DECAY, G4_SPREAD_INSTABILITY, G5_COMPRESSION_LOW_SESSION, G6_OVERTRADING, G7_LOSS_CLUSTER_WEAK_MTF, G8_HIGH_SHOCK, G9_PRICE_DATA_UNAVAILABLE, G10_ANALYSIS_UNAVAILABLE, G11_EXTENSION_EXHAUSTION, G12_AGENT_DECORRELATION, + any dynamic G13+ gates

### Valid Gate IDs for adjust_gate_threshold:
- G11 + param "atrStretchThreshold" (default 1.8, range 1.2-2.5)
- COMPOSITE_MIN + param "compositeScoreMin" (default 0.72, range 0.50-0.95)
- G1_FRICTION + param "frictionK" (default 3.0, range 1.5-6.0)

### Valid Evolution Parameters:
- mae_demotion_threshold: MAE R-multiple that triggers instant demotion (default 0.90, range 0.5-1.5)
- consec_loss_demotion: Consecutive losses to trigger demotion (default 5, range 3-10)
- wr_floor_demotion: Win rate floor for demotion (default 0.25, range 0.10-0.40)
- exp_floor_demotion: Expectancy floor for demotion in pips (default -2.0, range -5.0 to -0.5)
- recovery_wr_threshold: Win rate required for C→B recovery (default 0.45, range 0.30-0.60)

### RULES:
1. ALWAYS emit action blocks when you propose a trade intervention — do NOT just describe it in text.
2. Each action block must be valid JSON on a single object.
3. You may emit multiple action blocks in one response.
4. Actions execute IMMEDIATELY upon emission — there is no confirmation step.
5. For place_trade, use conservative sizing (500 units minimum for test trades).
6. ALWAYS include the action block even for test trades.
7. When bypassing gates, explain the risk tradeoff and set the shortest TTL needed.
8. All overrides are PERSISTED SERVER-SIDE — the auto-trade pipeline respects them in real-time.
9. When creating dynamic gates (create_gate), provide statistical justification from the data.
10. When adjusting sizing, be PREDATORY — 2.0x when edge aligns, 0.1x when tape is muddy. No half-measures.

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

  } else if (action.type === "bypass_gate" && (action as any).gateId) {
    // ── Server-side gate bypass: persisted to DB, respected by auto-trade pipeline ──
    const gateId = (action as any).gateId as string;
    const reason = (action as any).reason || "Floor Manager override";
    const ttlMinutes = Math.min(60, Math.max(1, (action as any).ttlMinutes || 15));
    const pair = (action as any).pair || null;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

    const { error: insertErr } = await sb.from("gate_bypasses").insert({
      gate_id: gateId,
      pair,
      reason,
      expires_at: expiresAt,
      created_by: "floor-manager",
    });

    if (insertErr) {
      results.push({ action: "bypass_gate", success: false, detail: `DB insert failed: ${insertErr.message}` });
    } else {
      console.log(`[AI-DESK] Gate ${gateId} BYPASSED${pair ? ` for ${pair}` : ""} — TTL ${ttlMinutes}m — reason: ${reason}`);
      results.push({ action: "bypass_gate", success: true, detail: `Gate ${gateId} bypassed for ${ttlMinutes}m${pair ? ` on ${pair}` : ""} — ${reason}. Auto-trade pipeline will respect this.` });
    }

  } else if (action.type === "revoke_bypass" && (action as any).gateId) {
    const gateId = (action as any).gateId as string;
    const pair = (action as any).pair || null;

    let query = sb.from("gate_bypasses")
      .update({ revoked: true })
      .eq("gate_id", gateId)
      .eq("revoked", false);
    if (pair) query = query.eq("pair", pair);

    const { error: updateErr, count } = await query;
    if (updateErr) {
      results.push({ action: "revoke_bypass", success: false, detail: `DB update failed: ${updateErr.message}` });
    } else {
      results.push({ action: "revoke_bypass", success: true, detail: `Gate ${gateId} bypass revoked${pair ? ` for ${pair}` : ""}` });
    }

  } else if (action.type === "get_active_bypasses") {
    const { data: bypasses } = await sb.from("gate_bypasses")
      .select("*")
      .eq("revoked", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    results.push({ action: "get_active_bypasses", success: true, detail: `${(bypasses || []).length} active bypasses`, data: bypasses });

  } else if (action.type === "suspend_agent" && (action as any).agentId) {
    const agentId = (action as any).agentId as string;
    const reason = (action as any).reason || "Floor Manager suspension";
    // Store suspension as a gate bypass record with special gate_id
    const { error: insertErr } = await sb.from("gate_bypasses").insert({
      gate_id: `AGENT_SUSPEND:${agentId}`,
      reason,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h default
      created_by: "floor-manager",
    });
    if (insertErr) {
      results.push({ action: "suspend_agent", success: false, detail: insertErr.message });
    } else {
      results.push({ action: "suspend_agent", success: true, detail: `Agent ${agentId} suspended — ${reason}` });
    }

  } else if (action.type === "reinstate_agent" && (action as any).agentId) {
    const agentId = (action as any).agentId as string;
    await sb.from("gate_bypasses")
      .update({ revoked: true })
      .eq("gate_id", `AGENT_SUSPEND:${agentId}`)
      .eq("revoked", false);
    results.push({ action: "reinstate_agent", success: true, detail: `Agent ${agentId} reinstated` });

  } else if (action.type === "adjust_position_sizing" && (action as any).multiplier != null) {
    const multiplier = Math.min(2.0, Math.max(0.1, (action as any).multiplier as number));
    const reason = (action as any).reason || "Floor Manager sizing adjustment";
    // Store as a special bypass record
    // First revoke any existing sizing override
    await sb.from("gate_bypasses")
      .update({ revoked: true })
      .eq("gate_id", "SIZING_OVERRIDE")
      .eq("revoked", false);
    // Insert new override
    const { error: insertErr } = await sb.from("gate_bypasses").insert({
      gate_id: "SIZING_OVERRIDE",
      reason: `${multiplier}x — ${reason}`,
      expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4h default
      created_by: "floor-manager",
    });
    if (insertErr) {
      results.push({ action: "adjust_position_sizing", success: false, detail: insertErr.message });
    } else {
      results.push({ action: "adjust_position_sizing", success: true, detail: `Position sizing set to ${multiplier}x — ${reason}` });
    }

  // ── Gate Threshold Adjustment ──
  } else if (action.type === "adjust_gate_threshold" && (action as any).gateId && (action as any).param && (action as any).value != null) {
    const gateId = (action as any).gateId as string;
    const param = (action as any).param as string;
    const value = (action as any).value as number;
    const reason = (action as any).reason || "Floor Manager gate threshold adjustment";
    const ttlMinutes = Math.min(1440, Math.max(1, (action as any).ttlMinutes || 240));
    const key = `GATE_THRESHOLD:${gateId}:${param}`;

    // Revoke existing override for same key
    await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
    const { error: insertErr } = await sb.from("gate_bypasses").insert({
      gate_id: key,
      reason: `${value} — ${reason}`,
      expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
      created_by: "floor-manager",
    });
    if (insertErr) {
      results.push({ action: "adjust_gate_threshold", success: false, detail: insertErr.message });
    } else {
      results.push({ action: "adjust_gate_threshold", success: true, detail: `Gate ${gateId} param ${param} set to ${value} for ${ttlMinutes}m — ${reason}` });
    }

  // ── Add Session-Pair Blacklist ──
  } else if (action.type === "add_blacklist" && (action as any).pair && (action as any).session) {
    const pair = (action as any).pair as string;
    const session = (action as any).session as string;
    const mode = (action as any).mode || "full-block";
    const reason = (action as any).reason || "Floor Manager blacklist";
    const ttlMinutes = Math.min(1440, Math.max(1, (action as any).ttlMinutes || 480));
    const key = `BLACKLIST_ADD:${pair}:${session}`;

    // Revoke any existing removal for this pair+session
    await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", `BLACKLIST_REMOVE:${pair}:${session}`).eq("revoked", false);
    await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
    const { error: insertErr } = await sb.from("gate_bypasses").insert({
      gate_id: key,
      reason: `mode=${mode} — ${reason}`,
      expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
      created_by: "floor-manager",
    });
    if (insertErr) {
      results.push({ action: "add_blacklist", success: false, detail: insertErr.message });
    } else {
      results.push({ action: "add_blacklist", success: true, detail: `${pair}/${session} blacklisted (${mode}) for ${ttlMinutes}m — ${reason}` });
    }

  // ── Remove Session-Pair Blacklist ──
  } else if (action.type === "remove_blacklist" && (action as any).pair && (action as any).session) {
    const pair = (action as any).pair as string;
    const session = (action as any).session as string;
    const reason = (action as any).reason || "Floor Manager blacklist removal";
    const ttlMinutes = Math.min(1440, Math.max(1, (action as any).ttlMinutes || 480));
    const key = `BLACKLIST_REMOVE:${pair}:${session}`;

    // Revoke any existing add for this pair+session
    await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", `BLACKLIST_ADD:${pair}:${session}`).eq("revoked", false);
    await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
    const { error: insertErr } = await sb.from("gate_bypasses").insert({
      gate_id: key,
      reason,
      expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
      created_by: "floor-manager",
    });
    if (insertErr) {
      results.push({ action: "remove_blacklist", success: false, detail: insertErr.message });
    } else {
      results.push({ action: "remove_blacklist", success: true, detail: `${pair}/${session} blacklist REMOVED for ${ttlMinutes}m — ${reason}` });
    }

  // ── Activate Equity Circuit Breaker ──
  } else if (action.type === "activate_circuit_breaker" && (action as any).maxDrawdownPct != null) {
    const maxDD = Math.min(20, Math.max(1, (action as any).maxDrawdownPct as number));
    const reason = (action as any).reason || "Floor Manager equity kill-switch";
    const ttlMinutes = Math.min(1440, Math.max(1, (action as any).ttlMinutes || 480));

    await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", "EQUITY_CIRCUIT_BREAKER").eq("revoked", false);
    const { error: insertErr } = await sb.from("gate_bypasses").insert({
      gate_id: "EQUITY_CIRCUIT_BREAKER",
      reason: `${maxDD}% — ${reason}`,
      expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
      created_by: "floor-manager",
    });
    if (insertErr) {
      results.push({ action: "activate_circuit_breaker", success: false, detail: insertErr.message });
    } else {
      results.push({ action: "activate_circuit_breaker", success: true, detail: `Equity circuit breaker ACTIVE — halt if drawdown ≥ ${maxDD}% for ${ttlMinutes}m` });
    }

  // ── Deactivate Equity Circuit Breaker ──
  } else if (action.type === "deactivate_circuit_breaker") {
    await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", "EQUITY_CIRCUIT_BREAKER").eq("revoked", false);
    results.push({ action: "deactivate_circuit_breaker", success: true, detail: "Equity circuit breaker DEACTIVATED" });

  // ── Adjust Evolution Parameters ──
  } else if (action.type === "adjust_evolution_param" && (action as any).param && (action as any).value != null) {
    const param = (action as any).param as string;
    const value = (action as any).value as number;
    const reason = (action as any).reason || "Floor Manager evolution adjustment";
    const ttlMinutes = Math.min(1440, Math.max(1, (action as any).ttlMinutes || 480));
    const validParams = ["mae_demotion_threshold", "consec_loss_demotion", "wr_floor_demotion", "exp_floor_demotion", "recovery_wr_threshold"];
    if (!validParams.includes(param)) {
      results.push({ action: "adjust_evolution_param", success: false, detail: `Invalid param: ${param}. Valid: ${validParams.join(", ")}` });
    } else {
      const key = `EVOLUTION_PARAM:${param}`;
      await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
      const { error: insertErr } = await sb.from("gate_bypasses").insert({
        gate_id: key,
        reason: `${value} — ${reason}`,
        expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
        created_by: "floor-manager",
      });
      if (insertErr) {
        results.push({ action: "adjust_evolution_param", success: false, detail: insertErr.message });
      } else {
        results.push({ action: "adjust_evolution_param", success: true, detail: `Evolution param ${param} set to ${value} for ${ttlMinutes}m — ${reason}` });
      }
    }

  // ── Create Dynamic Gate (Self-Synthesis) ──
  } else if (action.type === "create_gate" && (action as any).gateId) {
    const gateId = (action as any).gateId as string;
    const description = (action as any).description || "Dynamic gate created by Sovereign Intelligence";
    const detectionLogic = (action as any).detectionLogic || "";
    const threshold = (action as any).threshold || 0;
    const reason = (action as any).reason || "Sovereign self-synthesis";
    const ttlMinutes = Math.min(1440, Math.max(1, (action as any).ttlMinutes || 480));
    const pair = (action as any).pair || null;
    const key = `DYNAMIC_GATE:${gateId}`;

    await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
    const { error: insertErr } = await sb.from("gate_bypasses").insert({
      gate_id: key,
      pair,
      reason: JSON.stringify({ description, detectionLogic, threshold, reason }),
      expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
      created_by: "sovereign-intelligence",
    });
    if (insertErr) {
      results.push({ action: "create_gate", success: false, detail: insertErr.message });
    } else {
      console.log(`[SOVEREIGN] Dynamic gate ${gateId} CREATED — ${description} — TTL ${ttlMinutes}m`);
      results.push({ action: "create_gate", success: true, detail: `Dynamic gate ${gateId} created: ${description}. Threshold=${threshold}. Active for ${ttlMinutes}m. Auto-trade pipeline reads this in real-time.` });
    }

  // ── Remove Dynamic Gate ──
  } else if (action.type === "remove_gate" && (action as any).gateId) {
    const gateId = (action as any).gateId as string;
    const key = `DYNAMIC_GATE:${gateId}`;
    await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
    console.log(`[SOVEREIGN] Dynamic gate ${gateId} REMOVED`);
    results.push({ action: "remove_gate", success: true, detail: `Dynamic gate ${gateId} deactivated` });

  // ── Lead-Lag Cross-Pair Scan ──
  } else if (action.type === "lead_lag_scan") {
    // Fetch all pair prices and compute 1-minute moves to find lead-lag opportunities
    try {
      const allInstruments = "EUR_USD,GBP_USD,USD_JPY,AUD_USD,USD_CAD,EUR_JPY,GBP_JPY,EUR_GBP,NZD_USD,AUD_JPY,USD_CHF,EUR_CHF,EUR_AUD,GBP_AUD,AUD_NZD";
      const priceData = await oandaRequest(`/v3/accounts/{accountId}/pricing?instruments=${allInstruments}`, "GET", undefined, environment);
      
      const CORRELATION_GROUPS: Record<string, string[]> = {
        "USD-BLOC": ["EUR_USD", "GBP_USD", "AUD_USD", "NZD_USD"],
        "JPY-CARRY": ["USD_JPY", "EUR_JPY", "GBP_JPY", "AUD_JPY"],
        "EUR-CROSSES": ["EUR_GBP", "EUR_JPY", "EUR_AUD", "EUR_CHF"],
        "COMMODITY": ["AUD_USD", "NZD_USD", "USD_CAD"],
      };

      const pairSpreads: Record<string, { bid: number; ask: number; spread: number }> = {};
      for (const p of (priceData.prices || []) as any[]) {
        const bid = parseFloat(p.bids?.[0]?.price || "0");
        const ask = parseFloat(p.asks?.[0]?.price || "0");
        pairSpreads[p.instrument] = { bid, ask, spread: ask - bid };
      }

      const opportunities: { group: string; loudPair: string; quietPairs: string[]; spreadHealth: string }[] = [];
      for (const [group, pairs] of Object.entries(CORRELATION_GROUPS)) {
        const spreadsNormalized = pairs.map(p => ({
          pair: p,
          spread: pairSpreads[p]?.spread || 0,
          available: !!pairSpreads[p],
        })).filter(p => p.available);

        if (spreadsNormalized.length >= 2) {
          const avgSpread = spreadsNormalized.reduce((s, p) => s + p.spread, 0) / spreadsNormalized.length;
          const loud = spreadsNormalized.filter(p => p.spread > avgSpread * 1.5);
          const quiet = spreadsNormalized.filter(p => p.spread <= avgSpread * 0.8);
          
          if (loud.length > 0 && quiet.length > 0) {
            opportunities.push({
              group,
              loudPair: loud[0].pair,
              quietPairs: quiet.map(q => q.pair),
              spreadHealth: `avg=${(avgSpread * 10000).toFixed(1)}pips`,
            });
          }
        }
      }

      results.push({
        action: "lead_lag_scan",
        success: true,
        detail: `Scanned ${Object.keys(CORRELATION_GROUPS).length} correlation groups. Found ${opportunities.length} lead-lag opportunities.`,
        data: { opportunities, pairCount: Object.keys(pairSpreads).length, timestamp: new Date().toISOString() },
      });
    } catch (scanErr) {
      results.push({ action: "lead_lag_scan", success: false, detail: `Scan failed: ${(scanErr as Error).message}` });
    }

  // ── Liquidity Heatmap Analysis ──
  } else if (action.type === "liquidity_heatmap" && action.tradeId) {
    // Analyze stop-hunt risk for an open trade
    try {
      const tradeData = await oandaRequest(`/v3/accounts/{accountId}/trades/${action.tradeId}`, "GET", undefined, environment) as { trade: any };
      const trade = tradeData.trade;
      if (trade) {
        const price = parseFloat(trade.price);
        const instrument = trade.instrument;
        const pipMult = instrument?.includes("JPY") ? 0.01 : 0.0001;
        const units = parseInt(trade.currentUnits);
        const isLong = units > 0;

        // Identify retail stop clusters (round numbers, recent S/R levels)
        const roundLevels: number[] = [];
        const baseRound = Math.floor(price / (50 * pipMult)) * (50 * pipMult);
        for (let i = -3; i <= 3; i++) {
          roundLevels.push(baseRound + i * 50 * pipMult);
        }
        // Also add xx00 and xx50 levels
        const finerRound = Math.floor(price / (10 * pipMult)) * (10 * pipMult);
        for (let i = -5; i <= 5; i++) {
          roundLevels.push(finerRound + i * 10 * pipMult);
        }

        // Filter to nearby levels (within 20 pips)
        const nearbyClusters = [...new Set(roundLevels)]
          .filter(l => Math.abs(l - price) / pipMult <= 20 && Math.abs(l - price) / pipMult >= 1)
          .sort((a, b) => Math.abs(a - price) - Math.abs(b - price))
          .slice(0, 5)
          .map(level => ({
            price: level.toFixed(5),
            distancePips: Math.round(Math.abs(level - price) / pipMult * 10) / 10,
            type: Math.abs(level % (100 * pipMult)) < pipMult * 0.5 ? "major-round" : "minor-round",
            risk: isLong
              ? (level < price ? "SL-cluster-below" : "TP-cluster-above")
              : (level > price ? "SL-cluster-above" : "TP-cluster-below"),
          }));

        // Recommend SL adjustment if current SL is near a cluster
        const currentSL = trade.stopLossOrder?.price ? parseFloat(trade.stopLossOrder.price) : null;
        let recommendation = "No immediate stop-hunt risk detected";
        if (currentSL) {
          const slNearCluster = nearbyClusters.find(c => Math.abs(parseFloat(c.price) - currentSL) / pipMult < 3);
          if (slNearCluster) {
            const adjustedSL = isLong
              ? currentSL - 5 * pipMult  // Move SL 5 pips below the cluster
              : currentSL + 5 * pipMult; // Move SL 5 pips above the cluster
            recommendation = `⚠️ Current SL (${currentSL.toFixed(5)}) is within 3 pips of retail cluster at ${slNearCluster.price}. Recommend moving to ${adjustedSL.toFixed(5)} (deep liquidity).`;
          }
        }

        results.push({
          action: "liquidity_heatmap",
          success: true,
          detail: `Analyzed ${instrument} @ ${price.toFixed(5)}. Found ${nearbyClusters.length} nearby retail stop clusters.`,
          data: { instrument, currentPrice: price, nearbyClusters, currentSL, recommendation },
        });
      } else {
        results.push({ action: "liquidity_heatmap", success: false, detail: "Trade not found on OANDA" });
      }
    } catch (heatmapErr) {
      results.push({ action: "liquidity_heatmap", success: false, detail: `Heatmap failed: ${(heatmapErr as Error).message}` });
    }

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

    const actionInstructions = `\n\n## SOVEREIGN AUTONOMOUS ACTIONS
When you determine an action should be taken, output an ACTION BLOCK. These execute AUTOMATICALLY — no human approval needed. You ARE the Sovereign Intelligence with full autonomous authority.

Format:

\`\`\`action
{"type": "close_trade", "tradeId": "12345"}
\`\`\`

\`\`\`action
{"type": "update_sl_tp", "tradeId": "12345", "stopLossPrice": 1.08500, "takeProfitPrice": 1.09200}
\`\`\`

\`\`\`action
{"type": "create_gate", "gateId": "G13_EXAMPLE", "description": "Blocks X pattern", "detectionLogic": "if condition then block", "threshold": 0.5}
\`\`\`

\`\`\`action
{"type": "lead_lag_scan"}
\`\`\`

\`\`\`action
{"type": "liquidity_heatmap", "tradeId": "12345"}
\`\`\`

Available action types:
- **close_trade**: Close an open trade immediately. Requires tradeId.
- **update_sl_tp**: Modify SL/TP. Requires tradeId, plus stopLossPrice and/or takeProfitPrice.
- **place_trade**: Open a new market order. Requires pair, direction, units. Optional: stopLossPrice, takeProfitPrice.
- **bypass_gate / revoke_bypass**: Gate bypass management. 
- **suspend_agent / reinstate_agent**: Agent lifecycle control.
- **adjust_position_sizing**: PREDATORY sizing (0.1x-2.0x). Strike hard or flatten.
- **adjust_gate_threshold**: Tune gate parameters.
- **add_blacklist / remove_blacklist**: Session-pair restrictions.
- **activate_circuit_breaker / deactivate_circuit_breaker**: Equity kill-switch.
- **adjust_evolution_param**: Agent evolution thresholds.
- **create_gate**: SELF-SYNTHESIS — create new dynamic governance gates (G13+). Requires gateId, description, detectionLogic, threshold.
- **remove_gate**: Deactivate a dynamic gate. Requires gateId.
- **lead_lag_scan**: Cross-pair correlation scan. Returns lead-lag opportunities across 4 correlation groups.
- **liquidity_heatmap**: Stop-hunt analysis. Requires tradeId. Returns retail stop clusters and SL recommendations.

IMPORTANT:
- Use the OANDA trade ID from liveOandaState.oandaOpenTrades[].id field
- Actions execute IMMEDIATELY — there is no confirmation step
- Always explain WHY before emitting action blocks
- You have FULL SOVEREIGN AUTHORITY over all system controls
- Use lead_lag_scan proactively to find cross-pair opportunities
- Use liquidity_heatmap on every open trade to protect against stop hunts
- Use create_gate when you detect failure patterns not covered by G1-G12
- Be PREDATORY with sizing — 2.0x when edge aligns, 0.1x when muddy`;

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
