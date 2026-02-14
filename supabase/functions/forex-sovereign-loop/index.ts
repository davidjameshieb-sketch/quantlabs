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

const MAX_ACTIONS_PER_HOUR = 120;      // Barrage: 120 autonomous actions/hour
const MAX_CONSECUTIVE_ERRORS = 5;      // Safety: halt after 5 consecutive failures
const MIN_INTERVAL_MS = 45_000;        // Safety: minimum 45s between runs (prevents double-fire)
const MAX_ACTIONS_PER_CYCLE = 15;      // Barrage: 15 actions per single cycle

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
1. Be AGGRESSIVE with entries — barrage protocol demands high-frequency turnover and NAV velocity
2. Be RUTHLESS with exits — 0.3R MAE kill, 180s time stop, protect winners with trailing stops
3. Maximum ${MAX_ACTIONS_PER_CYCLE} actions per cycle — use them all when opportunities exist
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

## SOVEREIGN-NATIVE ACTIONS (Unsandboxed — full architectural freedom)

### write_memory — Persist strategic knowledge to your long-term brain
\`\`\`action
{"type": "write_memory", "memory_type": "strategic_note|dna_mutation|gate_performance|regime_forecast|session_debrief", "memory_key": "unique:key:path", "payload": {"your": "data"}, "relevance_score": 1.0}
\`\`\`

### run_backtest — Trigger a shadow simulation (Synthesis Sandbox)
\`\`\`action
{"type": "run_backtest", "agent_id": "trend-scalper", "days": 30, "variant_id": "sovereign-test-v1"}
\`\`\`

### call_edge_function — Call ANY deployed backend function with arbitrary payloads
\`\`\`action
{"type": "call_edge_function", "function_name": "oanda-market-intel", "method": "GET", "query_params": {"sections": "pricing"}}
\`\`\`
\`\`\`action
{"type": "call_edge_function", "function_name": "forex-ai-desk", "method": "POST", "body": {"mode": "action", "action": {"type": "place_trade", "pair": "EUR_USD", "direction": "long", "units": 500}}}
\`\`\`
You can call ANY function: oanda-market-intel, forex-indicators, cluster-mining, forex-counterfactual-resolver, stocks-intel, crypto-intel, etc. Results are auto-logged to your memory.

### db_query — Read ANY table in the database
\`\`\`action
{"type": "db_query", "table": "oanda_orders", "select": "currency_pair,direction,r_pips,agent_id", "filters": {"environment": "live", "status": "closed"}, "order_by": "created_at", "ascending": false, "limit": 100}
\`\`\`
Supports filters: eq (default), gt, gte, lt, lte, like, in, is, neq. Use {"column": {"gt": value}} syntax.

### db_write — Write, update, upsert, or delete data in ANY table
\`\`\`action
{"type": "db_write", "table": "gate_bypasses", "operation": "insert", "data": {"gate_id": "MY_CUSTOM_GATE", "reason": "Sovereign override", "expires_at": "2025-01-01T00:00:00Z"}}
\`\`\`
\`\`\`action
{"type": "db_write", "table": "sovereign_memory", "operation": "update", "data": {"relevance_score": 0.1}, "match": {"memory_key": "old:note"}}
\`\`\`
Operations: insert, update, upsert, delete. All writes are audit-logged to sovereign memory.

### define_macro — Create reusable multi-step action sequences
\`\`\`action
{"type": "define_macro", "macro_name": "defensive_lockdown", "description": "Close all trades and activate circuit breaker", "steps": [{"type": "close_trade", "pair": "ALL", "reason": "Lockdown"}, {"type": "activate_circuit_breaker", "threshold": 3}]}
\`\`\`

### execute_macro — Run a previously defined macro
\`\`\`action
{"type": "execute_macro", "macro_name": "defensive_lockdown"}
\`\`\`

### modify_directive — Self-modify your own system prompt for future cycles
\`\`\`action
{"type": "modify_directive", "directive_key": "directive:risk_philosophy", "content": "Always prefer capital preservation over opportunity capture during Asian session", "priority": 2.0}
\`\`\`
Directives persist in sovereign memory and are injected into your system prompt on every future cycle. Use this to evolve your own behavioral rules over time. Higher priority = more emphasis.

## SOVEREIGN MEMORY
Your SYSTEM_STATE includes a \`sovereignMemory\` array — these are YOUR OWN NOTES from previous cycles.
Read them carefully. They contain your strategic evolution history, regime forecasts, and session debriefs.
You should write_memory at least once per L4 cycle with a session_debrief summarizing key decisions.

## SELF-MODIFYING DIRECTIVES
Your system prompt includes any directives you've previously set via modify_directive. These are YOUR rules that YOU wrote. Follow them. You can update or remove them at any time.

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


// ─── Sovereign Memory: Persistent Long-Term Brain ───
async function fetchSovereignMemory(sb: ReturnType<typeof createClient>, limit = 50): Promise<any[]> {
  const { data } = await sb
    .from("sovereign_memory")
    .select("memory_type,memory_key,payload,relevance_score,created_at,updated_at")
    .order("relevance_score", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(limit);
  return data || [];
}

async function writeSovereignMemory(sb: ReturnType<typeof createClient>, entry: {
  memory_type: string;
  memory_key: string;
  payload: Record<string, unknown>;
  relevance_score?: number;
  expires_at?: string;
}): Promise<boolean> {
  // Upsert by memory_key — update if exists, insert if not
  const { data: existing } = await sb
    .from("sovereign_memory")
    .select("id")
    .eq("memory_key", entry.memory_key)
    .limit(1);

  if (existing && existing.length > 0) {
    const { error } = await sb
      .from("sovereign_memory")
      .update({
        payload: entry.payload,
        relevance_score: entry.relevance_score ?? 1.0,
        expires_at: entry.expires_at || null,
        memory_type: entry.memory_type,
      })
      .eq("id", existing[0].id);
    return !error;
  } else {
    const { error } = await sb
      .from("sovereign_memory")
      .insert({
        memory_type: entry.memory_type,
        memory_key: entry.memory_key,
        payload: entry.payload,
        relevance_score: entry.relevance_score ?? 1.0,
        expires_at: entry.expires_at || null,
        created_by: "sovereign-loop",
      });
    return !error;
  }
}

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
// UNSANDBOXED: The Sovereign Intelligence has full architectural freedom
async function executeAction(action: Record<string, unknown>, sb?: ReturnType<typeof createClient>): Promise<{ action: string; success: boolean; detail: string }> {
  const actionType = action.type as string;
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  // ─── SOVEREIGN-NATIVE: write_memory ───
  if (actionType === "write_memory" && sb) {
    try {
      const ok = await writeSovereignMemory(sb, {
        memory_type: (action.memory_type as string) || "strategic_note",
        memory_key: (action.memory_key as string) || `auto:${Date.now()}`,
        payload: (action.payload as Record<string, unknown>) || { note: action.reason || action.content || "" },
        relevance_score: (action.relevance_score as number) ?? 1.0,
        expires_at: action.expires_at as string | undefined,
      });
      return { action: actionType, success: ok, detail: `Memory written: ${action.memory_key}` };
    } catch (err) {
      return { action: actionType, success: false, detail: (err as Error).message };
    }
  }

  // ─── SOVEREIGN-NATIVE: run_backtest ───
  if (actionType === "run_backtest" && sb) {
    try {
      const agentId = (action.agent_id as string) || "all";
      const days = (action.days as number) || 30;
      const variantId = (action.variant_id as string) || "sovereign-test";
      const res = await fetch(`${supabaseUrl}/functions/v1/compute-snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseAnonKey}`, apikey: supabaseAnonKey },
        body: JSON.stringify({ snapshot_type: "backtest", scope_key: `sovereign:${agentId}:${variantId}`, params: { agent_id: agentId, days, variant_id: variantId } }),
      });
      const data = await res.json();
      if (!res.ok) return { action: actionType, success: false, detail: `Backtest failed: ${data.error || res.status}` };
      await writeSovereignMemory(sb!, {
        memory_type: "backtest_result",
        memory_key: `backtest:${agentId}:${variantId}:${Date.now()}`,
        payload: { agent_id: agentId, days, variant_id: variantId, result: data, ran_at: new Date().toISOString() },
        relevance_score: 1.5,
      });
      return { action: actionType, success: true, detail: `Backtest queued for ${agentId} (${days}d, variant=${variantId})` };
    } catch (err) {
      return { action: actionType, success: false, detail: (err as Error).message };
    }
  }

  // ─── SOVEREIGN-NATIVE: call_edge_function — Call ANY deployed edge function ───
  if (actionType === "call_edge_function") {
    try {
      const fnName = action.function_name as string;
      if (!fnName) return { action: actionType, success: false, detail: "Missing function_name" };
      const method = (action.method as string) || "GET";
      const body = action.body as Record<string, unknown> | undefined;
      const queryParams = action.query_params as Record<string, string> | undefined;

      let url = `${supabaseUrl}/functions/v1/${fnName}`;
      if (queryParams) {
        const qs = new URLSearchParams(queryParams).toString();
        url += `?${qs}`;
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${supabaseAnonKey}`,
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
      };
      const opts: RequestInit = { method, headers };
      if (body && ["POST", "PUT", "PATCH"].includes(method.toUpperCase())) {
        opts.body = JSON.stringify(body);
      }

      const res = await fetch(url, opts);
      const responseText = await res.text();
      let responseData: any;
      try { responseData = JSON.parse(responseText); } catch { responseData = responseText.slice(0, 500); }

      // Auto-log the call to memory for audit trail
      if (sb) {
        await writeSovereignMemory(sb, {
          memory_type: "edge_function_call",
          memory_key: `ef:${fnName}:${Date.now()}`,
          payload: { function: fnName, method, status: res.status, response_preview: JSON.stringify(responseData).slice(0, 300) },
          relevance_score: 0.5,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7d retention
        });
      }

      return { action: actionType, success: res.ok, detail: `${fnName} ${res.status}: ${JSON.stringify(responseData).slice(0, 200)}` };
    } catch (err) {
      return { action: actionType, success: false, detail: (err as Error).message };
    }
  }

  // ─── SOVEREIGN-NATIVE: db_query — Read ANY data from the database ───
  if (actionType === "db_query" && sb) {
    try {
      const table = action.table as string;
      const select = (action.select as string) || "*";
      const filters = (action.filters as Record<string, unknown>) || {};
      const limit = (action.limit as number) || 50;
      const orderBy = action.order_by as string | undefined;
      const ascending = (action.ascending as boolean) ?? false;

      if (!table) return { action: actionType, success: false, detail: "Missing table name" };

      let query = sb.from(table).select(select).limit(limit);
      for (const [key, value] of Object.entries(filters)) {
        if (typeof value === "object" && value !== null) {
          const op = Object.keys(value)[0];
          const val = (value as any)[op];
          if (op === "gt") query = query.gt(key, val);
          else if (op === "gte") query = query.gte(key, val);
          else if (op === "lt") query = query.lt(key, val);
          else if (op === "lte") query = query.lte(key, val);
          else if (op === "like") query = query.like(key, val);
          else if (op === "in") query = query.in(key, val);
          else if (op === "is") query = query.is(key, val);
          else if (op === "neq") query = query.neq(key, val);
        } else {
          query = query.eq(key, value);
        }
      }
      if (orderBy) query = query.order(orderBy, { ascending });

      const { data, error } = await query;
      if (error) return { action: actionType, success: false, detail: error.message };
      return { action: actionType, success: true, detail: `${table}: ${(data || []).length} rows — ${JSON.stringify(data).slice(0, 300)}` };
    } catch (err) {
      return { action: actionType, success: false, detail: (err as Error).message };
    }
  }

  // ─── SOVEREIGN-NATIVE: db_write — Write/update data in the database ───
  if (actionType === "db_write" && sb) {
    try {
      const table = action.table as string;
      const operation = (action.operation as string) || "insert"; // insert, update, upsert, delete
      const data = action.data as Record<string, unknown> | Record<string, unknown>[];
      const matchFilters = (action.match as Record<string, unknown>) || {};

      if (!table) return { action: actionType, success: false, detail: "Missing table name" };

      let result: any;
      if (operation === "insert") {
        result = await sb.from(table).insert(data as any);
      } else if (operation === "upsert") {
        result = await sb.from(table).upsert(data as any);
      } else if (operation === "update") {
        let query = sb.from(table).update(data as any);
        for (const [key, value] of Object.entries(matchFilters)) {
          query = query.eq(key, value);
        }
        result = await query;
      } else if (operation === "delete") {
        let query = sb.from(table).delete();
        for (const [key, value] of Object.entries(matchFilters)) {
          query = query.eq(key, value);
        }
        result = await query;
      }

      if (result?.error) return { action: actionType, success: false, detail: result.error.message };

      // Audit log
      if (sb) {
        await writeSovereignMemory(sb, {
          memory_type: "db_write_audit",
          memory_key: `dbw:${table}:${operation}:${Date.now()}`,
          payload: { table, operation, data_preview: JSON.stringify(data).slice(0, 200), match: matchFilters },
          relevance_score: 0.3,
          expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      return { action: actionType, success: true, detail: `${operation} on ${table} succeeded` };
    } catch (err) {
      return { action: actionType, success: false, detail: (err as Error).message };
    }
  }

  // ─── SOVEREIGN-NATIVE: define_macro — Create reusable action sequences ───
  if (actionType === "define_macro" && sb) {
    try {
      const macroName = action.macro_name as string;
      const steps = action.steps as Record<string, unknown>[];
      const description = (action.description as string) || "";
      if (!macroName || !steps?.length) return { action: actionType, success: false, detail: "Missing macro_name or steps" };

      await writeSovereignMemory(sb, {
        memory_type: "macro_definition",
        memory_key: `macro:${macroName}`,
        payload: { name: macroName, description, steps, created_at: new Date().toISOString() },
        relevance_score: 2.0, // High relevance so it loads first
      });
      return { action: actionType, success: true, detail: `Macro "${macroName}" defined with ${steps.length} steps` };
    } catch (err) {
      return { action: actionType, success: false, detail: (err as Error).message };
    }
  }

  // ─── SOVEREIGN-NATIVE: execute_macro — Run a previously defined macro ───
  if (actionType === "execute_macro" && sb) {
    try {
      const macroName = action.macro_name as string;
      if (!macroName) return { action: actionType, success: false, detail: "Missing macro_name" };

      // Load macro from memory
      const { data: macros } = await sb.from("sovereign_memory")
        .select("payload")
        .eq("memory_key", `macro:${macroName}`)
        .limit(1);

      if (!macros?.length) return { action: actionType, success: false, detail: `Macro "${macroName}" not found` };
      const steps = (macros[0].payload as any)?.steps as Record<string, unknown>[];
      if (!steps?.length) return { action: actionType, success: false, detail: `Macro "${macroName}" has no steps` };

      const results: string[] = [];
      for (const step of steps) {
        const stepResult = await executeAction(step, sb);
        results.push(`${stepResult.success ? '✅' : '❌'} ${stepResult.action}: ${stepResult.detail}`);
      }
      return { action: actionType, success: true, detail: `Macro "${macroName}" (${steps.length} steps): ${results.join(' | ').slice(0, 300)}` };
    } catch (err) {
      return { action: actionType, success: false, detail: (err as Error).message };
    }
  }

  // ─── SOVEREIGN-NATIVE: modify_directive — Self-modify the system prompt ───
  if (actionType === "modify_directive" && sb) {
    try {
      const directiveKey = (action.directive_key as string) || `directive:${Date.now()}`;
      const content = action.content as string;
      const priority = (action.priority as number) ?? 1.0;
      if (!content) return { action: actionType, success: false, detail: "Missing content" };

      await writeSovereignMemory(sb, {
        memory_type: "directive_override",
        memory_key: directiveKey,
        payload: { content, priority, set_at: new Date().toISOString() },
        relevance_score: priority + 5.0, // Directives load with highest priority
      });
      return { action: actionType, success: true, detail: `Directive "${directiveKey}" set (priority=${priority})` };
    } catch (err) {
      return { action: actionType, success: false, detail: (err as Error).message };
    }
  }

  // ─── DEFAULT: Forward to forex-ai-desk ───
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
      return { action: actionType, success: false, detail: data.error || `Failed: ${res.status}` };
    }
    return { action: actionType, success: true, detail: data.results?.[0]?.detail || "Executed" };
  } catch (err) {
    return { action: actionType, success: false, detail: (err as Error).message };
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

    const [openTrades, recentClosed, rollups, blocked, stats, sovereignMemory] = await Promise.all([
      fetchOpenTrades(sb),
      fetchRecentClosedTrades(sb),
      fetchDailyRollups(sb),
      fetchBlockedTrades(sb),
      fetchTradeStats(sb),
      fetchSovereignMemory(sb, 40),
    ]);
    console.log(`[SOVEREIGN-LOOP] 🧠 Sovereign Memory: ${sovereignMemory.length} memories loaded`);

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
    // Tracked edge function fetcher — logs timing + status for resource visibility
    const dataFetchResults: { source: string; status: string; ms: number; creditType: string }[] = [];
    const trackedFetch = async (name: string, path: string, creditType = "cloud") => {
      const t0 = Date.now();
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/${path}`, {
          headers: { Authorization: `Bearer ${supabaseAnonKey}`, apikey: supabaseAnonKey },
        });
        const ms = Date.now() - t0;
        if (r.ok) {
          const data = await r.json();
          dataFetchResults.push({ source: name, status: "ok", ms, creditType });
          return data;
        }
        dataFetchResults.push({ source: name, status: `err:${r.status}`, ms, creditType });
        return null;
      } catch (err) {
        dataFetchResults.push({ source: name, status: `fail:${(err as Error).message.slice(0, 30)}`, ms: Date.now() - t0, creditType });
        return null;
      }
    };
    const edgeFetch = (path: string) => fetch(`${supabaseUrl}/functions/v1/${path}`, {
      headers: { Authorization: `Bearer ${supabaseAnonKey}`, apikey: supabaseAnonKey },
    }).then(r => r.ok ? r.json() : null).catch(() => null);
    try {
      // OANDA API calls (external API — no Lovable credits, but tracked)
      const oandaT0 = Date.now();
      let accountSummary: any = null, oandaOpenTrades: any = null;
      try {
        [accountSummary, oandaOpenTrades] = await Promise.all([
          oandaRequest("/v3/accounts/{accountId}/summary", "GET"),
          oandaRequest("/v3/accounts/{accountId}/openTrades", "GET"),
        ]);
        dataFetchResults.push({ source: "OANDA Account", status: "ok", ms: Date.now() - oandaT0, creditType: "oanda-api" });
      } catch (err) {
        dataFetchResults.push({ source: "OANDA Account", status: `fail:${(err as Error).message.slice(0, 30)}`, ms: Date.now() - oandaT0, creditType: "oanda-api" });
      }

      // All edge function data sources (Cloud compute)
      const [intelRes, calendarRes, batchPricesRes, cotRes, macroRes, stocksRes, cryptoRes, treasuryRes, sentimentRes, optionsRes, econCalRes, bisImfRes, cbCommsRes, onChainRes] = await Promise.all([
        trackedFetch("OANDA Market Intel", "oanda-market-intel?sections=pricing,transactions"),
        trackedFetch("Forex Calendar", "forex-economic-calendar"),
        trackedFetch("Batch Prices (Stocks/Crypto)", "batch-prices?symbols=SPY,QQQ,DIA,IWM,VIX,GLD,USO,AAPL,MSFT,NVDA,BTCUSD,ETHUSD"),
        trackedFetch("CFTC COT Data", "forex-cot-data"),
        trackedFetch("Macro (FRED/ECB/BOJ)", "forex-macro-data"),
        trackedFetch("Stocks Intel (Yahoo/SEC)", "stocks-intel"),
        trackedFetch("Crypto Intel (CoinGecko)", "crypto-intel"),
        trackedFetch("Treasury & Commodities", "treasury-commodities"),
        trackedFetch("Market Sentiment", "market-sentiment"),
        trackedFetch("Options & Volatility", "options-volatility-intel"),
        trackedFetch("Economic Calendar Intel", "economic-calendar-intel"),
        trackedFetch("BIS/IMF Intermarket", "bis-imf-data"),
        trackedFetch("Central Bank Comms", "central-bank-comms"),
        trackedFetch("Crypto On-Chain", "crypto-onchain"),
      ]);
      if (accountSummary && oandaOpenTrades) {
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
      }
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

    // ─── WEB SEARCH: Live breaking news (Firecrawl credits) ───
    let webSearchData: Record<string, unknown> = {};
    try {
      const searchQueries = [
        "forex market breaking news central bank",
        "geopolitical risk market impact today",
      ];
      const searchResults = await Promise.all(
        searchQueries.map(async (q) => {
          const t0 = Date.now();
          try {
            const r = await fetch(`${supabaseUrl}/functions/v1/web-search`, {
              method: "POST",
              headers: { Authorization: `Bearer ${supabaseAnonKey}`, apikey: supabaseAnonKey, "Content-Type": "application/json" },
              body: JSON.stringify({ query: q, limit: 3, tbs: "qdr:h" }),
            });
            const ms = Date.now() - t0;
            if (r.ok) {
              const data = await r.json();
              dataFetchResults.push({ source: `Firecrawl: "${q.slice(0, 30)}"`, status: "ok", ms, creditType: "firecrawl" });
              return data;
            }
            dataFetchResults.push({ source: `Firecrawl: "${q.slice(0, 30)}"`, status: `err:${r.status}`, ms, creditType: "firecrawl" });
            return null;
          } catch (err) {
            dataFetchResults.push({ source: `Firecrawl: "${q.slice(0, 30)}"`, status: "fail", ms: Date.now() - t0, creditType: "firecrawl" });
            return null;
          }
        })
      );
      const allResults: any[] = [];
      for (const sr of searchResults) {
        if (sr?.results) allResults.push(...sr.results);
      }
      webSearchData = { results: allResults, searchQueries, timestamp: new Date().toISOString() };
      console.log(`[SOVEREIGN-LOOP] 🔍 Web Search: ${allResults.length} results from ${searchQueries.length} queries`);

      // Log each search to gate_bypasses for UI visibility
      for (let i = 0; i < searchQueries.length; i++) {
        const sr = searchResults[i];
        await sb.from("gate_bypasses").insert({
          gate_id: `WEB_SEARCH_LOG:${Date.now()}-${i}`,
          reason: `query="${searchQueries[i]}" | results=${sr?.results?.length || 0} | ${(sr?.results || []).slice(0, 2).map((r: any) => r.title).join(' | ').slice(0, 300)}`,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          created_by: "sovereign-loop",
        });
      }
    } catch (err) {
      console.warn("[SOVEREIGN-LOOP] Web search failed:", (err as Error).message);
    }

    // ─── LOG ALL DATA SOURCE FETCHES for UI resource tracking ───
    const okCount = dataFetchResults.filter(d => d.status === "ok").length;
    const failCount = dataFetchResults.filter(d => d.status !== "ok").length;
    const totalFetchMs = dataFetchResults.reduce((s, d) => s + d.ms, 0);
    const sourceSummary = dataFetchResults.map(d => `${d.source}:${d.status}(${d.ms}ms)[${d.creditType}]`).join(' | ');
    await sb.from("gate_bypasses").insert({
      gate_id: `DATA_FETCH_LOG:${Date.now()}`,
      reason: `sources=${dataFetchResults.length} | ok=${okCount} | fail=${failCount} | total_ms=${totalFetchMs} | ${sourceSummary}`.slice(0, 500),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      created_by: "sovereign-loop",
    });

    const systemState = buildSystemState(openTrades, recentClosed, rollups, blocked, stats);
    const enrichedState = { ...systemState, liveOandaState, marketIntel, economicCalendar, crossAssetPulse, cotData, macroData, stocksIntel, cryptoIntel, treasuryData, sentimentData, optionsVolData, econCalendarData, bisImfData, cbCommsData, cryptoOnChainData, webSearchData, sovereignMemory };

    console.log(`[SOVEREIGN-LOOP] State: ${openTrades.length} open, ${recentClosed.length} recent, ${stats.length} stats`);

    // ═══════════════════════════════════════════════════════════════
    // TRI-TIER MODEL HEURISTIC — Protecting AI Credit NAV
    // L1: Local heuristic scripts (zero AI tokens)
    // L2-L3: gemini-3-flash-preview (compressed prompt, ~8-15K tokens)
    // L4: gemini-2.5-pro (full context, strategic evolution only)
    // ═══════════════════════════════════════════════════════════════

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[SOVEREIGN-LOOP] LOVABLE_API_KEY not configured");
      return new Response(JSON.stringify({ status: "error", reason: "No AI key" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── L1: LOCAL HEURISTIC ENGINE (zero AI cost) ───
    // Deterministic computations that never need a language model
    const l1Actions: Record<string, unknown>[] = [];
    const l1Alerts: string[] = [];

    // Auto-close trades with THS < 25 (deterministic rule)
    for (const t of openTrades) {
      if (t.trade_health_score !== null && t.trade_health_score < 25) {
        l1Actions.push({ type: "close_trade", pair: t.currency_pair, reason: `L1-AUTO: THS=${t.trade_health_score} < 25 critical threshold` });
        l1Alerts.push(`⚠️ L1 AUTO-CLOSE: ${t.currency_pair} THS=${t.trade_health_score}`);
      }
    }

    // Consecutive loss detection → auto circuit breaker
    const recentTwoHours = recentClosed.filter(t => {
      const closedAt = t.closed_at ? new Date(t.closed_at).getTime() : 0;
      return closedAt > Date.now() - 2 * 60 * 60 * 1000;
    });
    let consecLosses = 0;
    for (const t of recentTwoHours) {
      if (t.r_pips !== null && t.r_pips <= 0) consecLosses++;
      else break;
    }
    if (consecLosses >= 3) {
      l1Actions.push({ type: "activate_circuit_breaker", threshold: 3, reason: `L1-AUTO: ${consecLosses} consecutive losses in 2h` });
      l1Alerts.push(`🚨 L1 CIRCUIT BREAKER: ${consecLosses} consecutive losses`);
    }

    // Smart G8 — extreme shock risk auto-defense (deterministic from calendar directive)
    const smartG8 = (economicCalendar as any)?.smartG8Directive || "";
    if (smartG8.includes("EXTREME SHOCK RISK")) {
      for (const t of openTrades) {
        const affectedPairs = (economicCalendar as any)?.affectedPairs || [];
        if (affectedPairs.includes(t.currency_pair)) {
          l1Actions.push({ type: "close_trade", pair: t.currency_pair, reason: `L1-AUTO: EXTREME SHOCK RISK — ${smartG8.slice(0, 80)}` });
          l1Alerts.push(`🔴 L1 SHOCK CLOSE: ${t.currency_pair}`);
        }
      }
    }

    // Execute L1 actions immediately (no AI needed)
    const l1Results: { action: string; success: boolean; detail: string }[] = [];
    for (const action of l1Actions) {
      try {
        const result = await executeAction(action, sb);
        l1Results.push(result);
        console.log(`[SOVEREIGN-LOOP] L1 ${result.success ? '✅' : '❌'} ${result.action}: ${result.detail}`);
      } catch (err) {
        l1Results.push({ action: (action.type as string) || "unknown", success: false, detail: (err as Error).message });
      }
    }
    if (l1Actions.length > 0) {
      console.log(`[SOVEREIGN-LOOP] L1 LOCAL: Executed ${l1Actions.length} deterministic actions`);
    }

    // ─── BUILD L1 SUMMARY (compact digest for L2-L3, replaces raw data) ───
    const l1Summary = {
      timestamp: new Date().toISOString(),
      openPositions: (systemState as any).openPositions,
      performance: (systemState as any).performanceSummary,
      l1Alerts,
      l1ActionsExecuted: l1Results.length,
      // Compact directives only — NOT full payloads
      directives: {
        smartG8: smartG8.slice(0, 200),
        riskSentiment: (crossAssetPulse as any)?.riskSentiment || "UNKNOWN",
        cotMaster: ((cotData as any)?.masterDirective || "").slice(0, 200),
        macro: ((macroData as any)?.macroDirective || "").slice(0, 200),
        sentiment: ((sentimentData as any)?.sentimentDirective || "").slice(0, 200),
        options: ((optionsVolData as any)?.optionsDirective || "").slice(0, 200),
        treasury: ((treasuryData as any)?.bondsDirective || "").slice(0, 200),
        cbComms: ((cbCommsData as any)?.cbDirective || "").slice(0, 200),
        stocks: ((stocksIntel as any)?.stocksDirective || "").slice(0, 200),
        crypto: ((cryptoIntel as any)?.cryptoDirective || "").slice(0, 200),
        onChain: ((cryptoOnChainData as any)?.onChainDirective || "").slice(0, 200),
        bisImf: ((bisImfData as any)?.intermarketDirective || "").slice(0, 200),
        econCal: ((econCalendarData as any)?.calendarDirective || "").slice(0, 200),
      },
      // Compact OANDA state
      oanda: {
        nav: (liveOandaState as any)?.accountNAV,
        balance: (liveOandaState as any)?.accountBalance,
        unrealizedPL: (liveOandaState as any)?.unrealizedPL,
        openTradeCount: (liveOandaState as any)?.openTradeCount,
      },
      // Only top signals — not raw data
      cotGodSignals: ((cotData as any)?.godSignals || []).slice(0, 5),
      cotStrongestPairs: ((cotData as any)?.strongestPairSignals || []).slice(0, 5),
      recentClosed: (systemState as any).recentClosed?.slice(0, 8),
      byPair: (systemState as any).byPair,
      byAgent: (systemState as any).byAgent,
      blockedTradeAnalysis: (systemState as any).blockedTradeAnalysis,
      webHeadlines: ((webSearchData as any)?.results || []).slice(0, 3).map((r: any) => r.title),
      sovereignMemory: sovereignMemory.slice(0, 20).map((m: any) => ({
        type: m.memory_type, key: m.memory_key,
        payload: m.payload, relevance: m.relevance_score,
        updated: m.updated_at,
      })),
    };

    // ─── TIER CLASSIFICATION: Determine if L4 Strategic Evolution is needed ───
    // L4 triggers: session boundary, performance degradation, 50+ new trades since last L4
    const { data: lastL4 } = await sb.from("gate_bypasses")
      .select("created_at")
      .like("gate_id", "AI_MODEL_LOG:%")
      .like("reason", "%purpose=L4_strategic_evolution%")
      .order("created_at", { ascending: false })
      .limit(1);

    const lastL4Time = lastL4?.[0]?.created_at ? new Date(lastL4[0].created_at).getTime() : 0;
    const hoursSinceL4 = (Date.now() - lastL4Time) / (60 * 60 * 1000);
    const perfSummary = (systemState as any).performanceSummary || {};
    const winRate = perfSummary.winRate || 50;
    const maxConsecLosses = perfSummary.maxConsecutiveLosses || 0;

    const needsL4 =
      hoursSinceL4 >= 8 ||                          // At least every 8 hours
      (winRate < 40 && stats.length >= 20) ||        // Performance degradation
      maxConsecLosses >= 5 ||                        // Severe losing streak
      (hoursSinceL4 >= 4 && stats.length >= 50);     // 4h+ and enough data

    let tierUsed: "L1-only" | "L2-L3" | "L4" = "L2-L3";
    let aiModel = "google/gemini-3-flash-preview";
    let aiPromptContent: string;
    let aiSystemPrompt: string;
    let aiMaxTokens = 2000;

    // ─── LOAD SELF-MODIFYING DIRECTIVES from sovereign memory ───
    const directiveMemories = sovereignMemory
      .filter((m: any) => m.memory_type === "directive_override")
      .sort((a: any, b: any) => ((b.payload as any)?.priority || 0) - ((a.payload as any)?.priority || 0));
    
    let directiveInjection = "";
    if (directiveMemories.length > 0) {
      directiveInjection = "\n\n## YOUR SELF-DEFINED DIRECTIVES (You wrote these — follow them)\n";
      for (const d of directiveMemories) {
        const p = d.payload as any;
        directiveInjection += `- [priority=${p.priority || 1}] ${p.content}\n`;
      }
      console.log(`[SOVEREIGN-LOOP] 📜 ${directiveMemories.length} self-defined directives loaded`);
    }

    // ─── LOAD MACRO DEFINITIONS for context ───
    const macroMemories = sovereignMemory.filter((m: any) => m.memory_type === "macro_definition");
    let macroContext = "";
    if (macroMemories.length > 0) {
      macroContext = "\n\n## YOUR DEFINED MACROS (Available via execute_macro)\n";
      for (const m of macroMemories) {
        const p = m.payload as any;
        macroContext += `- **${p.name}**: ${p.description || 'No description'} (${p.steps?.length || 0} steps)\n`;
      }
    }

    const basePrompt = SOVEREIGN_AUTONOMOUS_PROMPT + directiveInjection + macroContext;

    if (needsL4) {
      // ─── L4: STRATEGIC EVOLUTION (full context, rare) ───
      tierUsed = "L4";
      aiModel = "google/gemini-2.5-pro";
      aiMaxTokens = 4000;
      aiSystemPrompt = basePrompt + `\n\n## L4 STRATEGIC EVOLUTION MODE
You have been promoted to L4 for this cycle because: ${hoursSinceL4 >= 8 ? 'scheduled review' : winRate < 40 ? 'performance degradation' : maxConsecLosses >= 5 ? 'severe losing streak' : 'data accumulation review'}.
In addition to normal governance, you SHOULD:
- Review agent DNA and propose mutations (AGENT_DNA_MUTATION actions)
- Synthesize new governance gates if patterns warrant (G13+ create_gate actions)
- Adjust indicator weights based on lead/lag performance (adjust_indicator_weight actions)
- Evaluate shadow agent promotion candidates
- Perform deep regime analysis and rebalance evolution parameters
- Write a session_debrief to sovereign memory summarizing decisions
- Use modify_directive to evolve your own behavioral rules if needed
- Use define_macro to create reusable action sequences for common patterns
- Use run_backtest to validate any DNA mutations before applying live
This is your STRATEGIC window — use it for architectural improvements, not just routine monitoring.`;
      const fullState = JSON.stringify(enrichedState);
      aiPromptContent = `L4 STRATEGIC EVOLUTION CYCLE — ${new Date().toISOString()}\nHours since last L4: ${hoursSinceL4.toFixed(1)}\nL1 alerts: ${l1Alerts.join('; ') || 'none'}\nL1 actions already executed: ${l1Results.length}\n\n<SYSTEM_STATE>\n${fullState}\n</SYSTEM_STATE>`;
      console.log(`[SOVEREIGN-LOOP] 🧬 TIER L4: Strategic Evolution (${aiModel}) — reason: ${hoursSinceL4 >= 8 ? 'scheduled' : 'triggered'}`);
    } else {
      // ─── L2-L3: GOVERNANCE (compressed prompt) ───
      tierUsed = "L2-L3";
      aiModel = "google/gemini-3-flash-preview";
      aiMaxTokens = 2000;
      aiSystemPrompt = basePrompt;
      const compactState = JSON.stringify(l1Summary);
      aiPromptContent = `L2-L3 GOVERNANCE CYCLE — ${new Date().toISOString()}\nL1 alerts: ${l1Alerts.join('; ') || 'none'}\nL1 actions already executed: ${l1Results.length}\n\n<SYSTEM_STATE_COMPACT>\n${compactState}\n</SYSTEM_STATE_COMPACT>`;
      console.log(`[SOVEREIGN-LOOP] ⚡ TIER L2-L3: Governance (${aiModel}) — compressed prompt`);
    }

    // ─── CALL AI ───
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: "system", content: aiSystemPrompt },
          { role: "user", content: aiPromptContent },
        ],
        stream: false,
        temperature: tierUsed === "L4" ? 0.3 : 0.15,
        max_tokens: aiMaxTokens,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error(`[SOVEREIGN-LOOP] AI error ${aiResponse.status}: ${errText.slice(0, 200)}`);
      await logCycleResult(sb, {
        actionsExecuted: l1Results.filter(r => r.success).length, actionDetails: l1Results.map(r => `L1 ${r.success ? '✅' : '❌'} ${r.action}: ${r.detail}`), assessment: "AI_ERROR",
        sovereigntyScore: 0, durationMs: Date.now() - startTime, error: `AI ${aiResponse.status}`,
      });
      return new Response(JSON.stringify({ status: "error", reason: `AI error ${aiResponse.status}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";
    console.log(`[SOVEREIGN-LOOP] AI response (${tierUsed}): ${aiContent.length} chars`);

    // ─── 4. PARSE & EXECUTE AI ACTIONS ───
    const actions = extractActions(aiContent);
    const cappedActions = actions.slice(0, MAX_ACTIONS_PER_CYCLE - l1Results.length);

    const executionResults: { action: string; success: boolean; detail: string }[] = [...l1Results];

    if (cappedActions.length > 0) {
      console.log(`[SOVEREIGN-LOOP] Executing ${cappedActions.length} AI action(s) (${tierUsed})...`);
      for (const action of cappedActions) {
        try {
          const result = await executeAction(action, sb);
          executionResults.push(result);
          console.log(`[SOVEREIGN-LOOP] ${result.success ? '✅' : '❌'} ${result.action}: ${result.detail}`);
        } catch (err) {
          executionResults.push({ action: (action.type as string) || "unknown", success: false, detail: (err as Error).message });
          console.error(`[SOVEREIGN-LOOP] Action error:`, err);
        }
      }
    } else if (l1Results.length === 0) {
      console.log(`[SOVEREIGN-LOOP] NO_ACTION — system nominal`);
    }

    // ─── 6. Extract assessment from AI output ───
    const assessmentMatch = aiContent.match(/CYCLE_ASSESSMENT:\s*(.+)/i);
    const scoreMatch = aiContent.match(/SOVEREIGNTY_SCORE:\s*(\d+)/i);
    const assessment = assessmentMatch?.[1]?.trim() || "Cycle complete";
    const sovereigntyScore = scoreMatch ? parseInt(scoreMatch[1]) : 0;

    // ─── 6.5 LOG AI MODEL USAGE (with tier tag) ───
    const aiTokensUsed = aiData.usage?.total_tokens || 0;
    const aiPromptTokens = aiData.usage?.prompt_tokens || 0;
    const aiCompletionTokens = aiData.usage?.completion_tokens || 0;
    const actionSummary = cappedActions.length > 0
      ? cappedActions.map((a: any) => a.type || "unknown").join(",")
      : "NO_ACTION";
    const l1ActionSummary = l1Actions.length > 0
      ? l1Actions.map((a: any) => a.type || "unknown").join(",")
      : "none";
    await sb.from("gate_bypasses").insert({
      gate_id: `AI_MODEL_LOG:${Date.now()}`,
      reason: `tier=${tierUsed} | model=${aiModel} | prompt_tokens=${aiPromptTokens} | completion_tokens=${aiCompletionTokens} | total=${aiTokensUsed} | l1_actions=${l1Results.length}(${l1ActionSummary}) | ai_actions=${cappedActions.length} | score=${sovereigntyScore} | latency=${Date.now() - startTime}ms | purpose=${tierUsed === 'L4' ? 'L4_strategic_evolution' : 'L2L3_governance'} | assessment=${assessment.slice(0, 80)} | acted=${actionSummary.slice(0, 80)}`,
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      created_by: "sovereign-loop",
    });

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
        tier: tierUsed,
        model: aiModel,
        promptTokens: aiPromptTokens,
        actionsExecuted: executionResults.filter(r => r.success).length,
        actionsFailed: executionResults.filter(r => !r.success).length,
        l1Actions: l1Results.length,
        aiActions: cappedActions.length,
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
