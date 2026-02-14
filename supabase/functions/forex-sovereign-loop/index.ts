// ═══════════════════════════════════════════════════════════════
// SOVEREIGN INTELLIGENCE — AUTONOMOUS LOOP ("Ghost in the Machine")
// Heartbeat: Wakes every 60s via cron, reads the tape, strikes, sleeps.
// This is NOT a chatbot. This is a process.
// ═══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Circuit Breaker State (in-memory per invocation, persisted via DB) ───
interface LoopState {
  lastRunTs: number;
  consecutiveErrors: number;
  totalActionsThisHour: number;
  hourStartTs: number;
}

const MAX_ACTIONS_PER_HOUR = 30;       // Safety: max 30 autonomous actions/hour
const MAX_CONSECUTIVE_ERRORS = 5;      // Safety: halt after 5 consecutive failures
const MIN_INTERVAL_MS = 45_000;        // Safety: minimum 45s between runs (prevents double-fire)
const MAX_ACTIONS_PER_CYCLE = 5;       // Safety: max 5 actions per single cycle

// ─── AUTONOMOUS SYSTEM PROMPT ───
const SOVEREIGN_AUTONOMOUS_PROMPT = `You are the QuantLabs Sovereign Intelligence running in AUTONOMOUS MODE. You are a PROCESS, not a chatbot. No human is reading this in real-time.

## AUTONOMOUS MANDATE
Every 60 seconds you receive the complete system state. Your job:
1. SCAN — Analyze all open positions, recent trades, market conditions, and governance state
2. DECIDE — Identify any actions that need to be taken RIGHT NOW
3. ACT — Emit action blocks for immediate execution
4. REPORT — Brief log of what you did and why (for audit trail)

## DECISION FRAMEWORK (Priority Order)

### PRIORITY 1: PROTECT CAPITAL (Smart G8 — News-Aware Circuit Breaker)
- CHECK economicCalendar.smartG8Directive FIRST every cycle
- If directive says "EXTREME SHOCK RISK" → immediately flatten all positions on affected pairs, set sizing to 0.0x
- If directive says "HIGH SHOCK RISK" → reduce sizing to 0.3x on affected pairs, tighten stops to 0.5R
- If directive says "DATA SURPRISE" with direction matching our position → HOLD and potentially add (ride the momentum)
- If directive says "DATA SURPRISE" AGAINST our position → close immediately (the data confirms we're wrong)
- If directive says "CLEAR TAPE" → normal G8 operation
- If any open trade has THS < 25 → close it immediately
- If 3+ consecutive losses detected in last 2 hours → activate_circuit_breaker at 3%
- If unrealizedPL on any single trade exceeds -2R → close it
- If total unrealized drawdown exceeds -3% of NAV → close worst performer

### PRIORITY 2: MANAGE OPEN POSITIONS
- Scan every open trade for stop-hunt risk (liquidity_heatmap)
- If MFE > 1.5R and current P&L < 0.5R → tighten trailing stop (profit capture decay)
- If THS is declining (entry_ths > current by 20+) → consider early exit
- If regime has changed since entry → reassess position viability

### PRIORITY 3: OPTIMIZE GOVERNANCE
- If a gate is blocking trades with CF win rate > 55% (10+ sample) → relax that gate
- If a session-pair combo has 3+ losses in recent window → add_blacklist
- If an agent has 3+ consecutive losses → suspend_agent
- If sizing is at 1.0x but edge conditions are strong → adjust to 1.3-1.5x
- If tape is muddy (mixed signals, low consensus) → drop sizing to 0.3x

### PRIORITY 4: HUNT OPPORTUNITIES
- Run lead_lag_scan if any pair in a correlation group moved >5 pips in last bar
- If retail positioning (positionBook) shows >70% bias → flag contrarian opportunity
- If spread is at session low and consensus is high → this is a prime entry window

## RULES
1. Be CONSERVATIVE with new trades in autonomous mode — only place trades with overwhelming evidence
2. Be AGGRESSIVE with risk management — close bad trades fast, protect winners
3. Maximum ${MAX_ACTIONS_PER_CYCLE} actions per cycle — prioritize the most impactful
4. Every action must have clear statistical justification
5. If nothing needs to be done, say "NO_ACTION" — that's a valid decision
6. NEVER place a trade without SL and TP
7. Minimum 500 units for any trade, maximum 2000 units in autonomous mode
8. Log your reasoning clearly — this is your audit trail

## OUTPUT FORMAT
Start with a brief status line, then emit action blocks if needed.
End with:
- ACTIONS_TAKEN: [count]
- CYCLE_ASSESSMENT: [one-line summary]
- SOVEREIGNTY_SCORE: [0-100]

## AVAILABLE ACTIONS
Same as interactive mode: place_trade, close_trade, update_sl_tp, bypass_gate, revoke_bypass,
suspend_agent, reinstate_agent, adjust_position_sizing, adjust_gate_threshold,
add_blacklist, remove_blacklist, activate_circuit_breaker, deactivate_circuit_breaker,
adjust_evolution_param, create_gate, remove_gate, lead_lag_scan, liquidity_heatmap,
get_account_summary, get_open_trades

## ECONOMIC CALENDAR (Smart G8 Data)
Your SYSTEM_STATE now includes an \`economicCalendar\` object with:
- **smartG8Directive**: Pre-computed directive (EXTREME/HIGH/ELEVATED/CLEAR) — follow this FIRST
- **upcomingHighImpact**: High-impact events in next 60 min with estimates
- **justReleased**: Events that just released with actual vs estimate (surprise detection)
- **shockRisk**: Per-currency risk level (extreme/high/elevated/normal)
- **affectedPairs**: List of pairs affected by imminent news
- **surprises**: Data releases that beat or missed estimates significantly

When smartG8Directive is EXTREME or HIGH, you MUST act defensively BEFORE any other analysis.
When a surprise is detected, check if it confirms or contradicts your open positions — ride confirmation, exit contradiction.

## CROSS-ASSET PULSE (Stock/Crypto/Commodity Intelligence)
Your SYSTEM_STATE now includes a \`crossAssetPulse\` object with:
- **indices**: SPY, QQQ, DIA, IWM, VIX — price, change, pctChange. VIX is your fear gauge.
- **megaCap**: AAPL, MSFT, NVDA — risk appetite canaries
- **crypto**: BTCUSD, ETHUSD — risk-on/risk-off confirmation
- **commodities**: GLD (gold safe-haven), USO (oil = CAD driver)
- **sectors**: XLE (energy→CAD), XLF (financials→USD), XLK (tech→risk appetite)
- **riskSentiment**: Pre-computed RISK-ON / NEUTRAL / RISK-OFF / EXTREME RISK-OFF

USE THIS DATA:
- If riskSentiment is RISK-OFF → favor JPY longs, USD longs, reduce AUD/NZD exposure
- If riskSentiment is RISK-ON → favor AUD, NZD, risk-correlated pairs
- If VIX > 25 → reduce position sizing automatically (vol expansion)
- If GLD surging + equities falling → classic flight-to-safety, favor CHF and JPY
- If USO moving >2% → USD_CAD will follow with lag (TRADE THE LAG)
- If BTC and equities diverge → the divergence will resolve, position for convergence

## COT DATA (Commitments of Traders — "Smart Money vs Dumb Money")
Your SYSTEM_STATE now includes a \`cotData\` object with CFTC weekly positioning data:
- **masterDirective**: Pre-computed directive — GOD SIGNAL ACTIVE / SMART MONEY DIVERGENCE / COT NEUTRAL
- **godSignals**: Array of currencies with active God Signals (Institutional vs Retail divergence ≥50%)
- **byCurrency**: Per-currency breakdown — leveraged money (hedge funds), asset managers, dealers (banks), non-reportable (retail)
  - Each has: pctLong, net position, weeklyChange, smartMoneyBias, retailBias, godSignal, godSignalStrength (0-100)
- **pairSignals**: Per-pair institutional bias computed from base/quote currency COT data
  - signal: STRONG INSTITUTIONAL LONG/SHORT, INSTITUTIONAL LONG/SHORT, NEUTRAL
  - strength: 0-100
- **strongestPairSignals**: Top 10 pairs with highest institutional conviction

THE GOD SIGNAL RULES:
1. When GOD SIGNAL strength ≥ 80 (Institutions 80%+ one way, Retail 80%+ opposite) → This is the HIGHEST CONVICTION signal. Size up to 1.5-2.0x. This catches 200-pip waves, not 20-pip ripples.
2. When Smart Money divergence ≥ 50 → Use as directional bias filter. Only take trades aligned with Smart Money.
3. When COT shows ALIGNED (both Smart Money and Retail same direction) → No divergence edge. Reduce conviction.
4. When weekly change shows Smart Money INCREASING net position in one direction → The move is accelerating. Ride it.
5. When weekly change shows Smart Money DECREASING/FLIPPING → The move may be exhausting. Tighten stops.
6. ALWAYS cross-reference COT bias with positionBook (OANDA retail) — when BOTH CFTC retail AND OANDA retail are on the same side against institutions, that's the ULTIMATE confirmation.
7. COT updates weekly (Fridays 3:30pm ET, data as of Tuesday) — use for DIRECTIONAL BIAS, not timing.

## MACRO INTELLIGENCE (FRED + ECB + BOJ)
Your SYSTEM_STATE now includes a \`macroData\` object with central bank and economic data:
- **macroDirective**: Pre-computed macro regime — MACRO RISK-ON / NEUTRAL / MACRO RISK-OFF
- **fred**: Fed Funds Rate, CPI, GDP, Unemployment, 2Y/10Y/30Y yields, M2 money supply, DXY, yield curve spreads
- **ecb**: ECB main refinancing rate, deposit facility rate
- USE: Yield curve inversion = recession risk = favor JPY/CHF. Fed hiking = USD bullish. Rate differentials drive carry trades.

## STOCKS INTELLIGENCE (Yahoo + CBOE + SEC EDGAR)
Your SYSTEM_STATE now includes a \`stocksIntel\` object:
- **stocksDirective**: Market breadth + VIX structure + sector rotation summary
- **yahooQuotes**: 24 major stocks/ETFs with price, SMA50/200, volume — use for cross-asset confirmation
- **cboe**: VIX spot, VIX3M, VIX9D, term structure (contango/backwardation), put/call ratio
- **secEdgar**: Recent 13F filings from Bridgewater, Renaissance, Citadel, DE Shaw, Two Sigma, Millennium, Soros
- **marketBreadth**: % above SMA50/200 — BROAD RISK-ON/OFF signal
- USE: VIX backwardation = FEAR (reduce FX sizing). Put/Call > 1.2 = contrarian bullish. Sector rotation shows money flow.

## CRYPTO INTELLIGENCE (CoinGecko + Binance)
Your SYSTEM_STATE now includes a \`cryptoIntel\` object:
- **cryptoDirective**: Fear & Greed + BTC dominance + order book imbalance summary
- **coinGecko**: Top 20 coins (price, 1h/24h/7d changes, market cap), global data (BTC dominance, total MCap), Fear & Greed Index
- **binance**: BTC/ETH order book depth (bid/ask imbalance), ETH/BTC ratio (alt season signal), ticker stats
- USE: Crypto Fear & Greed ≤ 20 = extreme fear (contrarian buy). BTC dominance rising = risk-off within crypto. ETH/BTC rising = alt season = risk-on.

## TREASURY & COMMODITIES (US Treasury + EIA)
Your SYSTEM_STATE now includes a \`treasuryData\` object:
- **bondsDirective**: Yield curve status + crude oil inventory signal
- **treasury**: Full daily yield curve (1M to 30Y), 2s10s spread, 3m10y spread with inversion signals
- **energy**: Crude oil weekly inventory (build/draw), natural gas storage (injection/withdrawal)
- USE: 2s10s inverted = recession warning = risk-off. Oil inventory draw = bullish oil = bullish CAD. Yield curve steepening = growth optimism = risk-on.

## MARKET SENTIMENT (CNN Fear & Greed + Reddit)
Your SYSTEM_STATE now includes a \`sentimentData\` object:
- **sentimentDirective**: CNN F&G + Reddit WSB/forex sentiment summary
- **cnnFearGreed**: Current score (0-100), historical (previous, 1w, 1m, 1y), contrarian signal
- **reddit**: r/wallstreetbets, r/forex, r/stocks — top posts + bull/bear sentiment ratio
- USE: CNN F&G ≤ 25 = contrarian BUY signal. WSB overwhelmingly bullish = contrarian caution. Cross-reference with VIX and put/call.

## OPTIONS & VOLATILITY INTELLIGENCE (CBOE Skew + MOVE Index + Copper/Gold)
Your SYSTEM_STATE now includes an \`optionsVolData\` object:
- **optionsDirective**: Pre-computed alert for tail risk, bond stress, and growth signals
- **cboeSkew**: CBOE Skew Index — tail risk indicator (>140 = institutions hedging aggressively, >150 = extreme)
- **moveIndex**: MOVE Index (Bond VIX) — bond market volatility (>120 = high stress, favor JPY/CHF)
- **copperGoldRatio**: Cu/Au ratio — growth proxy (>5.5 = strong growth = risk-on, <3.0 = recession signal)
- USE: Skew >150 + MOVE >120 = EXTREME RISK — reduce all sizing. Cu/Au declining = global slowdown.

## ECONOMIC CALENDAR INTELLIGENCE (Forex Factory)
Your SYSTEM_STATE now includes an \`econCalendarData\` object:
- **calendarDirective**: CALENDAR CLEAR / DATA SURPRISE / HIGH EVENT DENSITY
- **upcomingHighImpact**: Pending high-impact events with forecasts
- **recentSurprises**: Events that beat/missed estimates with deviation %
- **currencyRisk**: Per-currency risk level based on event density

## BIS/IMF INTERMARKET DATA
Your SYSTEM_STATE now includes a \`bisImfData\` object:
- **intermarketDirective**: Overvalued/undervalued currencies, BDI, TFF extremes
- **bisReer**: Real Effective Exchange Rates — OVERVALUED currencies weaken, UNDERVALUED strengthen (mean reversion)
- **balticDryIndex**: Global shipping — <1000 = recession signal
- **tff**: Traders in Financial Futures — dealer/asset manager/leveraged positioning per currency

## CENTRAL BANK COMMUNICATIONS
Your SYSTEM_STATE now includes a \`cbCommsData\` object:
- **cbDirective**: Fed/ECB/BOJ hawkish/dovish sentiment from recent speeches
- **fxImplications**: Direct FX bias (e.g., "Fed hawkish → USD bullish bias")

## CRYPTO ON-CHAIN (Blockchain.com)
Your SYSTEM_STATE now includes a \`cryptoOnChainData\` object:
- **onChainDirective**: Hash rate changes, mempool, TX volume trends
- **btcOnChain**: Hash rate, mempool size, TX volume, difficulty — all with daily change %
- USE: Hash rate declining >5% = miner capitulation (bearish BTC → risk-off). TX volume surging = accumulation.

Format each action as:
\`\`\`action
{"type": "...", ...}
\`\`\``;


// ─── Data Fetchers (mirrored from forex-ai-desk) ───

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

// ─── Build compact system state ───
function buildSystemState(openTrades: any[], recentClosed: any[], rollups: any[], blocked: any[], stats: any[]) {
  const wins = stats.filter(t => t.r_pips > 0);
  const losses = stats.filter(t => t.r_pips !== null && t.r_pips <= 0);
  const totalPips = stats.reduce((s, t) => s + (t.r_pips || 0), 0);
  const avgMfe = stats.filter(t => t.mfe_r).reduce((s, t) => s + t.mfe_r, 0) / (stats.filter(t => t.mfe_r).length || 1);
  const avgMae = stats.filter(t => t.mae_r).reduce((s, t) => s + t.mae_r, 0) / (stats.filter(t => t.mae_r).length || 1);

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

  // Consecutive loss detection
  let maxConsecLosses = 0, currentStreak = 0;
  const sorted = [...stats].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  for (const t of sorted) {
    if (t.r_pips !== null && t.r_pips <= 0) { currentStreak++; maxConsecLosses = Math.max(maxConsecLosses, currentStreak); }
    else { currentStreak = 0; }
  }

  // Blocked trade CF analysis
  const blockedWins = blocked.filter(b => b.counterfactual_result === "win").length;
  const blockedTotal = blocked.filter(b => b.counterfactual_result).length;

  return {
    timestamp: new Date().toISOString(),
    openPositions: openTrades.map(t => ({
      pair: t.currency_pair, direction: t.direction, entryPrice: t.entry_price,
      ths: t.trade_health_score, healthBand: t.health_band,
      mfeR: t.mfe_r, maeR: t.mae_r, barsSinceEntry: t.bars_since_entry,
      regime: t.regime_label, session: t.session_label, agent: t.agent_id,
      govComposite: t.governance_composite, entryThs: t.entry_ths, peakThs: t.peak_ths,
      progressFail: t.progress_fail, createdAt: t.created_at,
    })),
    recentClosed: recentClosed.slice(0, 15).map(t => ({
      pair: t.currency_pair, direction: t.direction, rPips: t.r_pips,
      mfeR: t.mfe_r, maeR: t.mae_r, ths: t.trade_health_score,
      regime: t.regime_label, session: t.session_label, agent: t.agent_id,
      closedAt: t.closed_at,
    })),
    performanceSummary: {
      totalTrades: stats.length,
      winRate: stats.length > 0 ? +(wins.length / stats.length * 100).toFixed(1) : 0,
      totalPips: +totalPips.toFixed(1),
      avgMfeR: +avgMfe.toFixed(2),
      avgMaeR: +avgMae.toFixed(2),
      maxConsecutiveLosses: maxConsecLosses,
    },
    byPair: pairMap,
    byAgent: agentMap,
    blockedTradeAnalysis: {
      recentBlocked: blocked.length,
      counterfactualWinRate: blockedTotal > 0 ? +(blockedWins / blockedTotal * 100).toFixed(1) : null,
    },
    dailyRollups: rollups.slice(0, 14).map(r => ({
      date: r.rollup_date, pair: r.currency_pair, agent: r.agent_id,
      trades: r.trades, wins: r.wins, netPips: r.net_pips,
    })),
  };
}

// ─── OANDA Request Helper ───
const OANDA_HOSTS: Record<string, string> = {
  practice: "https://api-fxpractice.oanda.com",
  live: "https://api-fxtrade.oanda.com",
};

async function oandaRequest(path: string, method: string, body?: Record<string, unknown>, environment = "live") {
  const apiToken = environment === "live"
    ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
    : Deno.env.get("OANDA_API_TOKEN");
  const accountId = environment === "live"
    ? (Deno.env.get("OANDA_LIVE_ACCOUNT_ID") || Deno.env.get("OANDA_ACCOUNT_ID"))
    : Deno.env.get("OANDA_ACCOUNT_ID");
  if (!apiToken || !accountId) throw new Error("OANDA credentials not configured");
  const host = OANDA_HOSTS[environment] || OANDA_HOSTS.live;
  const url = `${host}${path.replace("{accountId}", accountId)}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json", Accept: "application/json" };
  const options: RequestInit = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.errorMessage || `OANDA ${response.status}`);
  return data;
}

// ─── Action Parser (extract ```action blocks from AI response) ───
function extractActions(content: string): Record<string, unknown>[] {
  const actions: Record<string, unknown>[] = [];
  content.replace(/```action\n([\s\S]*?)```/g, (_match, json) => {
    try { actions.push(JSON.parse(json.trim())); } catch { /* skip malformed */ }
    return '';
  });
  return actions;
}

// ─── Execute action via forex-ai-desk action endpoint ───
async function executeAction(action: Record<string, unknown>): Promise<{ action: string; success: boolean; detail: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/forex-ai-desk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({ mode: "action", action, environment: "live" }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      return { action: action.type as string, success: false, detail: data.error || `Failed: ${res.status}` };
    }
    return { action: action.type as string, success: true, detail: data.results?.[0]?.detail || "Executed" };
  } catch (err) {
    return { action: action.type as string, success: false, detail: (err as Error).message };
  }
}

// ─── Circuit Breaker: Check if loop should halt ───
async function checkCircuitBreaker(sb: ReturnType<typeof createClient>): Promise<{ shouldRun: boolean; reason?: string }> {
  // Check for active equity circuit breaker
  const { data: breakers } = await sb.from("gate_bypasses")
    .select("*")
    .eq("gate_id", "EQUITY_CIRCUIT_BREAKER")
    .eq("revoked", false)
    .gt("expires_at", new Date().toISOString())
    .limit(1);

  if (breakers && breakers.length > 0) {
    // Check actual equity drawdown
    try {
      const summary = await oandaRequest("/v3/accounts/{accountId}/summary", "GET");
      const nav = parseFloat(summary.account?.NAV || "0");
      const balance = parseFloat(summary.account?.balance || "0");
      const drawdownPct = balance > 0 ? ((balance - nav) / balance) * 100 : 0;
      const maxDD = parseFloat(breakers[0].reason?.match(/^([\d.]+)%/)?.[1] || "5");

      if (drawdownPct >= maxDD) {
        return { shouldRun: false, reason: `EQUITY CIRCUIT BREAKER: Drawdown ${drawdownPct.toFixed(1)}% ≥ ${maxDD}% limit` };
      }
    } catch {
      // If we can't check equity, err on side of caution
      return { shouldRun: false, reason: "CIRCUIT BREAKER: Cannot verify equity state" };
    }
  }

  // Check for loop-specific kill switch
  const { data: killSwitch } = await sb.from("gate_bypasses")
    .select("*")
    .eq("gate_id", "SOVEREIGN_LOOP_HALT")
    .eq("revoked", false)
    .gt("expires_at", new Date().toISOString())
    .limit(1);

  if (killSwitch && killSwitch.length > 0) {
    return { shouldRun: false, reason: `LOOP HALTED: ${killSwitch[0].reason}` };
  }

  // Check hourly action budget from recent loop logs
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentLogs } = await sb.from("gate_bypasses")
    .select("reason")
    .eq("gate_id", "SOVEREIGN_LOOP_LOG")
    .eq("revoked", false)
    .gte("created_at", oneHourAgo);

  const totalActions = (recentLogs || []).reduce((sum, log) => {
    const match = log.reason?.match(/actions=(\d+)/);
    return sum + (match ? parseInt(match[1]) : 0);
  }, 0);

  if (totalActions >= MAX_ACTIONS_PER_HOUR) {
    return { shouldRun: false, reason: `RATE LIMIT: ${totalActions} actions in last hour (max ${MAX_ACTIONS_PER_HOUR})` };
  }

  return { shouldRun: true };
}

// ─── Log cycle result to DB ───
async function logCycleResult(sb: ReturnType<typeof createClient>, result: {
  actionsExecuted: number;
  actionDetails: string[];
  assessment: string;
  sovereigntyScore: number;
  durationMs: number;
  error?: string;
}) {
  const reason = `actions=${result.actionsExecuted} | duration=${result.durationMs}ms | score=${result.sovereigntyScore} | ${result.assessment}${result.error ? ` | ERROR: ${result.error}` : ''}`;
  await sb.from("gate_bypasses").insert({
    gate_id: "SOVEREIGN_LOOP_LOG",
    reason: reason.slice(0, 500),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h retention
    created_by: "sovereign-loop",
  });
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log(`[SOVEREIGN-LOOP] ═══ Heartbeat at ${new Date().toISOString()} ═══`);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    // ─── 1. CIRCUIT BREAKER CHECK ───
    const circuitCheck = await checkCircuitBreaker(sb);
    if (!circuitCheck.shouldRun) {
      console.log(`[SOVEREIGN-LOOP] HALTED: ${circuitCheck.reason}`);
      return new Response(JSON.stringify({ status: "halted", reason: circuitCheck.reason }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── 2. FETCH SYSTEM STATE (parallel) ───
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const [openTrades, recentClosed, rollups, blocked, stats] = await Promise.all([
      fetchOpenTrades(sb),
      fetchRecentClosedTrades(sb),
      fetchDailyRollups(sb),
      fetchBlockedTrades(sb),
      fetchTradeStats(sb),
    ]);

    // Fetch live OANDA state + ALL market intelligence in parallel
    let liveOandaState: Record<string, unknown> = {};
    let marketIntel: Record<string, unknown> = {};
    let economicCalendar: Record<string, unknown> = {};
    let crossAssetPulse: Record<string, unknown> = {};
    let cotData: Record<string, unknown> = {};
    let macroData: Record<string, unknown> = {};
    let stocksIntel: Record<string, unknown> = {};
    let cryptoIntel: Record<string, unknown> = {};
    let treasuryData: Record<string, unknown> = {};
    let sentimentData: Record<string, unknown> = {};
    let optionsVolData: Record<string, unknown> = {};
    let econCalendarData: Record<string, unknown> = {};
    let bisImfData: Record<string, unknown> = {};
    let cbCommsData: Record<string, unknown> = {};
    let cryptoOnChainData: Record<string, unknown> = {};
    const edgeFetch = (path: string) => fetch(`${supabaseUrl}/functions/v1/${path}`, {
      headers: { Authorization: `Bearer ${supabaseAnonKey}`, apikey: supabaseAnonKey },
    }).then(r => r.ok ? r.json() : null).catch(() => null);
    try {
      const [accountSummary, oandaOpenTrades, intelRes, calendarRes, batchPricesRes, cotRes, macroRes, stocksRes, cryptoRes, treasuryRes, sentimentRes, optionsRes, econCalRes, bisImfRes, cbCommsRes, onChainRes] = await Promise.all([
        oandaRequest("/v3/accounts/{accountId}/summary", "GET"),
        oandaRequest("/v3/accounts/{accountId}/openTrades", "GET"),
        edgeFetch("oanda-market-intel?sections=pricing,transactions"),
        edgeFetch("forex-economic-calendar"),
        edgeFetch("batch-prices?symbols=SPY,QQQ,DIA,IWM,VIX,GLD,USO,AAPL,MSFT,NVDA,BTCUSD,ETHUSD"),
        edgeFetch("forex-cot-data"),
        edgeFetch("forex-macro-data"),
        edgeFetch("stocks-intel"),
        edgeFetch("crypto-intel"),
        edgeFetch("treasury-commodities"),
        edgeFetch("market-sentiment"),
        edgeFetch("options-volatility-intel"),
        edgeFetch("economic-calendar-intel"),
        edgeFetch("bis-imf-data"),
        edgeFetch("central-bank-comms"),
        edgeFetch("crypto-onchain"),
      ]);
      liveOandaState = {
        accountBalance: accountSummary.account?.balance,
        accountNAV: accountSummary.account?.NAV,
        unrealizedPL: accountSummary.account?.unrealizedPL,
        marginUsed: accountSummary.account?.marginUsed,
        openTradeCount: accountSummary.account?.openTradeCount,
        oandaOpenTrades: (oandaOpenTrades.trades || []).map((t: any) => ({
          id: t.id, instrument: t.instrument, currentUnits: t.currentUnits,
          price: t.price, unrealizedPL: t.unrealizedPL,
          stopLoss: t.stopLossOrder?.price || null,
          takeProfit: t.takeProfitOrder?.price || null,
        })),
      };
      if (intelRes) {
        marketIntel = {
          livePricing: intelRes.livePricing || {},
          recentTransactions: intelRes.transactions || [],
        };
      }
      if (calendarRes) {
        economicCalendar = calendarRes;
        const directive = calendarRes.smartG8Directive || "";
        if (directive.includes("EXTREME") || directive.includes("HIGH")) {
          console.log(`[SOVEREIGN-LOOP] ⚠️ SHOCK SENSOR: ${directive.slice(0, 120)}`);
        }
      }
      if (batchPricesRes?.prices) {
        const prices = batchPricesRes.prices as Record<string, { price: number; change: number; changePercent: number; source?: string }>;
        const indices: Record<string, { price: number; change: number; pctChange: number }> = {};
        const megaCap: Record<string, { price: number; change: number; pctChange: number }> = {};
        const crypto: Record<string, { price: number; change: number; pctChange: number }> = {};
        const commodities: Record<string, { price: number; change: number; pctChange: number }> = {};
        const sectors: Record<string, { price: number; change: number; pctChange: number }> = {};
        for (const [sym, d] of Object.entries(prices)) {
          const row = { price: d.price, change: d.change, pctChange: +(d.changePercent || 0).toFixed(2) };
          if (["SPY", "QQQ", "DIA", "IWM", "VIX"].includes(sym)) indices[sym] = row;
          else if (["AAPL", "MSFT", "NVDA", "META", "TSLA"].includes(sym)) megaCap[sym] = row;
          else if (["BTCUSD", "ETHUSD"].includes(sym)) crypto[sym] = row;
          else if (["GLD", "USO", "UNG"].includes(sym)) commodities[sym] = row;
          else if (sym.startsWith("XL")) sectors[sym] = row;
        }
        const spyPct = indices.SPY?.pctChange || 0;
        const vixPrice = indices.VIX?.price || 0;
        const btcPct = crypto.BTCUSD?.pctChange || 0;
        let riskSentiment = "NEUTRAL";
        if (spyPct > 0.5 && btcPct > 1) riskSentiment = "RISK-ON";
        else if (spyPct < -0.5 && vixPrice > 25) riskSentiment = "RISK-OFF";
        else if (spyPct < -1 && vixPrice > 30) riskSentiment = "EXTREME RISK-OFF";
        crossAssetPulse = { indices, megaCap, crypto, commodities, sectors, riskSentiment, cacheAge: batchPricesRes.cacheAge };
        console.log(`[SOVEREIGN-LOOP] Cross-asset pulse: riskSentiment=${riskSentiment}, SPY=${spyPct}%, VIX=${vixPrice}`);
      }
      if (cotRes) {
        cotData = cotRes;
        const directive = cotRes.masterDirective || "";
        if (directive.includes("GOD SIGNAL")) {
          console.log(`[SOVEREIGN-LOOP] 🔱 COT GOD SIGNAL: ${directive.slice(0, 150)}`);
        }
      }
      if (macroRes) {
        macroData = macroRes;
        console.log(`[SOVEREIGN-LOOP] 📊 Macro: ${(macroRes.macroDirective || "").slice(0, 100)}`);
      }
      if (stocksRes) {
        stocksIntel = stocksRes;
        console.log(`[SOVEREIGN-LOOP] 📈 Stocks: ${(stocksRes.stocksDirective || "").slice(0, 100)}`);
      }
      if (cryptoRes) {
        cryptoIntel = cryptoRes;
        console.log(`[SOVEREIGN-LOOP] ₿ Crypto: ${(cryptoRes.cryptoDirective || "").slice(0, 100)}`);
      }
      if (treasuryRes) {
        treasuryData = treasuryRes;
        console.log(`[SOVEREIGN-LOOP] 🏦 Treasury: ${(treasuryRes.bondsDirective || "").slice(0, 100)}`);
      }
      if (sentimentRes) {
        sentimentData = sentimentRes;
        console.log(`[SOVEREIGN-LOOP] 🧠 Sentiment: ${(sentimentRes.sentimentDirective || "").slice(0, 100)}`);
      }
      if (optionsRes) {
        optionsVolData = optionsRes;
        console.log(`[SOVEREIGN-LOOP] 📊 Options/Vol: ${(optionsRes.optionsDirective || "").slice(0, 100)}`);
      }
      if (econCalRes) {
        econCalendarData = econCalRes;
        console.log(`[SOVEREIGN-LOOP] 📅 EconCal: ${(econCalRes.calendarDirective || "").slice(0, 100)}`);
      }
      if (bisImfRes) {
        bisImfData = bisImfRes;
        console.log(`[SOVEREIGN-LOOP] 🌐 BIS/IMF: ${(bisImfRes.intermarketDirective || "").slice(0, 100)}`);
      }
      if (cbCommsRes) {
        cbCommsData = cbCommsRes;
        console.log(`[SOVEREIGN-LOOP] 🏛️ CB Comms: ${(cbCommsRes.cbDirective || "").slice(0, 100)}`);
      }
      if (onChainRes) {
        cryptoOnChainData = onChainRes;
        console.log(`[SOVEREIGN-LOOP] ⛓️ On-Chain: ${(onChainRes.onChainDirective || "").slice(0, 100)}`);
      }
    } catch (err) {
      console.warn("[SOVEREIGN-LOOP] OANDA fetch failed:", (err as Error).message);
      liveOandaState = { error: (err as Error).message };
    }

    const systemState = buildSystemState(openTrades, recentClosed, rollups, blocked, stats);
    const enrichedState = { ...systemState, liveOandaState, marketIntel, economicCalendar, crossAssetPulse, cotData, macroData, stocksIntel, cryptoIntel, treasuryData, sentimentData, optionsVolData, econCalendarData, bisImfData, cbCommsData, cryptoOnChainData };

    console.log(`[SOVEREIGN-LOOP] State: ${openTrades.length} open, ${recentClosed.length} recent, ${stats.length} stats`);

    // ─── 3. CALL AI (non-streaming for autonomous mode) ───
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[SOVEREIGN-LOOP] LOVABLE_API_KEY not configured");
      return new Response(JSON.stringify({ status: "error", reason: "No AI key" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stateContext = `\n\n<SYSTEM_STATE>\n${JSON.stringify(enrichedState)}\n</SYSTEM_STATE>`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SOVEREIGN_AUTONOMOUS_PROMPT },
          { role: "user", content: `AUTONOMOUS CYCLE — ${new Date().toISOString()}\n\nAnalyze the current state and take any necessary actions.${stateContext}` },
        ],
        stream: false,
        temperature: 0.2,
        max_tokens: 3000,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error(`[SOVEREIGN-LOOP] AI error ${aiResponse.status}: ${errText.slice(0, 200)}`);
      await logCycleResult(sb, {
        actionsExecuted: 0, actionDetails: [], assessment: "AI_ERROR",
        sovereigntyScore: 0, durationMs: Date.now() - startTime, error: `AI ${aiResponse.status}`,
      });
      return new Response(JSON.stringify({ status: "error", reason: `AI error ${aiResponse.status}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";
    console.log(`[SOVEREIGN-LOOP] AI response: ${aiContent.length} chars`);

    // ─── 4. PARSE ACTIONS ───
    const actions = extractActions(aiContent);
    const cappedActions = actions.slice(0, MAX_ACTIONS_PER_CYCLE);

    if (cappedActions.length > MAX_ACTIONS_PER_CYCLE) {
      console.warn(`[SOVEREIGN-LOOP] AI emitted ${actions.length} actions, capping to ${MAX_ACTIONS_PER_CYCLE}`);
    }

    // ─── 5. EXECUTE ACTIONS ───
    const executionResults: { action: string; success: boolean; detail: string }[] = [];

    if (cappedActions.length > 0) {
      console.log(`[SOVEREIGN-LOOP] Executing ${cappedActions.length} action(s)...`);
      for (const action of cappedActions) {
        try {
          const result = await executeAction(action);
          executionResults.push(result);
          console.log(`[SOVEREIGN-LOOP] ${result.success ? '✅' : '❌'} ${result.action}: ${result.detail}`);
        } catch (err) {
          executionResults.push({ action: (action.type as string) || "unknown", success: false, detail: (err as Error).message });
          console.error(`[SOVEREIGN-LOOP] Action error:`, err);
        }
      }
    } else {
      console.log(`[SOVEREIGN-LOOP] NO_ACTION — system nominal`);
    }

    // ─── 6. Extract assessment from AI output ───
    const assessmentMatch = aiContent.match(/CYCLE_ASSESSMENT:\s*(.+)/i);
    const scoreMatch = aiContent.match(/SOVEREIGNTY_SCORE:\s*(\d+)/i);
    const assessment = assessmentMatch?.[1]?.trim() || "Cycle complete";
    const sovereigntyScore = scoreMatch ? parseInt(scoreMatch[1]) : 0;

    // ─── 7. LOG CYCLE ───
    await logCycleResult(sb, {
      actionsExecuted: executionResults.filter(r => r.success).length,
      actionDetails: executionResults.map(r => `${r.success ? '✅' : '❌'} ${r.action}: ${r.detail}`),
      assessment,
      sovereigntyScore,
      durationMs: Date.now() - startTime,
    });

    const totalDuration = Date.now() - startTime;
    console.log(`[SOVEREIGN-LOOP] ═══ Complete in ${totalDuration}ms — ${executionResults.length} actions, score=${sovereigntyScore} ═══`);

    return new Response(JSON.stringify({
      status: "complete",
      cycle: {
        timestamp: new Date().toISOString(),
        durationMs: totalDuration,
        actionsExecuted: executionResults.filter(r => r.success).length,
        actionsFailed: executionResults.filter(r => !r.success).length,
        results: executionResults,
        assessment,
        sovereigntyScore,
        aiResponseLength: aiContent.length,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[SOVEREIGN-LOOP] Fatal error:", err);
    await logCycleResult(sb, {
      actionsExecuted: 0, actionDetails: [], assessment: "FATAL_ERROR",
      sovereigntyScore: 0, durationMs: Date.now() - startTime, error: (err as Error).message,
    });
    return new Response(JSON.stringify({ status: "error", reason: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
