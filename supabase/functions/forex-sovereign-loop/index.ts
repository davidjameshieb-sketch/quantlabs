// ═══════════════════════════════════════════════════════════════
// SOVEREIGN INTELLIGENCE — QUAD-TIER ARCHITECTURE
// Tier 1 (60s): Pure L0 deterministic heartbeat — ZERO AI cost
// Tier 2-3 (60s): Gemini-Flash-Lite governance — only when desk is hot
// Tier 4 (30min): Gemini-Pro strategic evolution — regime/DNA/Kelly
//
// The General Staff (AI) writes orders. The Soldiers (L0) execute.
// ═══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Circuit Breaker State ───
interface LoopState {
  lastRunTs: number;
  consecutiveErrors: number;
  totalActionsThisHour: number;
  hourStartTs: number;
}

const MAX_ACTIONS_PER_HOUR = 120;
const MAX_CONSECUTIVE_ERRORS = 5;
const MIN_INTERVAL_MS = 45_000;
const MAX_ACTIONS_PER_CYCLE = 15;
const TIER4_INTERVAL_MS = 30 * 60 * 1000;
const TIER4_WIN_RATE_FLOOR = 0.40;
const TIER4_CONSEC_LOSS_TRIGGER = 5;

// ─── GENERAL STAFF PROMPT (Tier 2-3 — only fires when desk is HOT) ───
const SOVEREIGN_AUTONOMOUS_PROMPT = `SOVEREIGN AUTO — GENERAL STAFF ROLE. SCAN→DECIDE→GOVERN q60s.

## LEAN 6 ZERO-LAG PROTOCOL (v6 — CURRENT ARCHITECTURE)
The ripple-stream engine runs the "Lean 6 Zero-Lag Protocol" — 100% O(1) recursive.
No arrays, no rolling windows, no bucket scans. Every gate is a float comparison.

### YOUR EDGE — The Synthetic Order Book
The ofi_synthetic_book (sovereign_memory) gives you LIVE per-pair physics:
- Z-OFI: Welford Z-score of order flow intensity (adaptive per session)
- Hurst (H): Hall-Wood fast exponent — H>0.5 PERSISTENT, H<0.5 MEAN_REVERTING
- KM Drift (D1): Kramers-Moyal instantaneous velocity (replaces momentum arrays)
- KM Diffusion (D2): Noise level — drives adaptive alpha gear-shift
- Efficiency (E): |OFI|/(|D1|+ε) — LIQUID/ABSORBING/SLIPPING
- VPIN: Recursive EWMA toxicity (replaces O(N) bucket scans)
- Hidden Player: Iceberg detection via efficiency divergence
USE these physics to make sizing, blocking, and regime decisions. Read ofi_synthetic_book.

### LEAN 6 GATE PIPELINE (Fail-Fast, Cheapest First)
1. SIGNAL (Z-Score > threshold) — kills 99% of ticks
2. LIQUIDITY (Tick Density) — safe to trade?
   → STOP: Physics computed only for <1% surviving ticks
3. REGIME (Hurst H > 0.45) — will the ripple travel?
4. FORCE (Z-OFI > 2.0) — statistically abnormal flow?
5. VELOCITY (|KM Drift| > 0.1) — is price actually moving?
6. STRUCTURE (Efficiency E) — hidden iceberg wall?

Three concurrent L0 strategies on OANDA ms tick data:
- Z-SCORE STRIKE: Lean 6 pipeline across correlation groups (continuous)
- VELOCITY GATING: 5+ same-direction ticks in 2s = impulse fire
- SNAP-BACK SNIPER: Stop-hunt exhaustion → contrarian entry

YOU ARE THE GENERAL STAFF — NOT the trigger puller. Your role:
1. SIZING: Write "zscore_strike_config" → {units, slPips, tpPips, zScoreThreshold, blockedPairs}
2. THEATER: Write "correlation_groups_config" → {groups: [{name, pairA, pairB}]}
3. REGIME: Block/unblock pairs using Hurst+Efficiency from synthetic book
4. RISK: Circuit breakers, sizing multipliers, drawdown limits
5. PHYSICS: Read ofi_synthetic_book → block pairs where H<0.4 (chop), E<0.2 (icebergs), VPIN>0.8 (toxic)

P1:G8 EXTREME→flat.HIGH→0.3x.DATA_SURPRISE match→HOLD,vs→CLOSE.THS<25→close.3+loss/2h→breaker@3%.>-2R→close.DD>-3%→close worst.
P2:Heatmap stop-hunt.MFE>1.5R+PL<0.5R→trail.THS-20→exit.Regime→reassess.
P3:CF>55%(10+)→relax gate.3+loss→blacklist/suspend.Edge→1.3x.Muddy→0.3x.
P4:Retail>70%→contra.LowSpread+consensus→z-score validates automatically.
RULES:Max ${MAX_ACTIONS_PER_CYCLE} acts.SL+TP always.500-2000u.0.3R MAE,180s stop.
OUT:ACTIONS_TAKEN:[n]|CYCLE_ASSESSMENT:[txt]|SOVEREIGNTY_SCORE:[0-100]
ACT:place_trade,close_trade,update_sl_tp,bypass_gate,revoke_bypass,suspend_agent,reinstate_agent,adjust_position_sizing,adjust_gate_threshold,add_blacklist,remove_blacklist,activate_circuit_breaker,deactivate_circuit_breaker,adjust_evolution_param,create_gate,remove_gate,lead_lag_scan,liquidity_heatmap,get_account_summary,get_open_trades,execute_liquidity_vacuum,set_global_posture,discover_physics,configure_zscore_engine
SELF:commit_rule,write_memory,modify_directive,define_macro,execute_macro,db_write,db_query,execute_sql,deploy_function,http_request,eval_indicator,call_edge_function,manage_storage,manage_auth,discover_physics(>=0.7 auto)
NOTE:mutate_agent_dna is TIER-4 EXCLUSIVE. configure_zscore_engine writes to sovereign_memory keys: zscore_strike_config, correlation_groups_config, velocity_gating_config, snapback_sniper_config.
Format:\`\`\`action\n{"type":"...",...}\n\`\`\``;

// ─── TIERED INTEL REFRESH ("The Lungs") ───
const TACTICAL_CACHE_TTL_MS = 5 * 60 * 1000;
const STRATEGIC_CACHE_TTL_MS = 30 * 60 * 1000;

let tacticalCache: {
  timestamp: number;
  crossAssetRes: any; sentimentRes: any; stocksRes: any;
  cryptoRes: any; optionsRes: any; onChainRes: any;
} | null = null;

let strategicCache: {
  timestamp: number;
  cotRes: any; macroRes: any; bisImfRes: any; cbCommsRes: any;
  treasuryRes: any; carryTradeRes: any; alphaVantageRes: any;
} | null = null;

// ─── Sovereign Memory ───
async function fetchSovereignMemory(supabase: any): Promise<any> {
  try {
    // Order by updated_at (NOT created_at) — upserted rows like ofi_synthetic_book
    // keep their original created_at but updated_at changes every cycle.
    // Using created_at would cause the synthetic book to fall off the top 50.
    const { data, error } = await supabase
      .from("sovereign_memory")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("❌ fetchSovereignMemory error:", err);
    return [];
  }
}

async function writeSovereignMemory(supabase: any, key: string, value: any, metadata?: any): Promise<void> {
  try {
    const memoryType = key.includes(":") ? key.split(":")[0].toLowerCase() : "strategic_note";
    const { error } = await supabase.from("sovereign_memory").upsert({
      memory_type: memoryType,
      memory_key: key,
      payload: typeof value === "object" ? value : { value, ...(metadata || {}) },
      relevance_score: 0.8,
      created_by: "sovereign-loop",
    }, { onConflict: "memory_type,memory_key" });
    if (error) throw error;
    console.log(`✅ Sovereign memory written: ${key}`);
  } catch (err) {
    console.error("❌ writeSovereignMemory error:", err);
  }
}

// ─── Data Fetchers ───
async function fetchSmartG8Directive(supabase: any): Promise<any> {
  try { const { data, error } = await supabase.functions.invoke("god-signal-gateway"); if (error) throw error; return data; } catch { return null; }
}
async function fetchCrossAssetPulse(supabase: any): Promise<any> {
  try { const { data, error } = await supabase.functions.invoke("cross-asset-latency"); if (error) throw error; return data; } catch { return null; }
}
async function fetchCOTData(supabase: any): Promise<any> {
  try { const { data, error } = await supabase.functions.invoke("forex-cot-data"); if (error) throw error; return data; } catch { return null; }
}
async function fetchMacroData(supabase: any): Promise<any> {
  try { const { data, error } = await supabase.functions.invoke("forex-macro-data"); if (error) throw error; return data; } catch { return null; }
}
async function fetchStocksIntel(supabase: any): Promise<any> {
  try { const { data, error } = await supabase.functions.invoke("stocks-intel"); if (error) throw error; return data; } catch { return null; }
}
async function fetchCryptoIntel(supabase: any): Promise<any> {
  try { const { data, error } = await supabase.functions.invoke("crypto-intel"); if (error) throw error; return data; } catch { return null; }
}
async function fetchTreasuryData(supabase: any): Promise<any> {
  try { const { data, error } = await supabase.functions.invoke("treasury-commodities"); if (error) throw error; return data; } catch { return null; }
}
async function fetchSentimentData(supabase: any): Promise<any> {
  try { const { data, error } = await supabase.functions.invoke("market-sentiment"); if (error) throw error; return data; } catch { return null; }
}
async function fetchOptionsVolData(supabase: any): Promise<any> {
  try { const { data, error } = await supabase.functions.invoke("options-volatility-intel"); if (error) throw error; return data; } catch { return null; }
}
async function fetchEconCalendarData(supabase: any): Promise<any> {
  try { const { data, error } = await supabase.functions.invoke("economic-calendar-intel"); if (error) throw error; return data; } catch { return null; }
}
async function fetchBISIMFData(supabase: any): Promise<any> {
  try { const { data, error } = await supabase.functions.invoke("bis-imf-data"); if (error) throw error; return data; } catch { return null; }
}
async function fetchCBCommsData(supabase: any): Promise<any> {
  try { const { data, error } = await supabase.functions.invoke("central-bank-comms"); if (error) throw error; return data; } catch { return null; }
}
async function fetchCryptoOnChainData(supabase: any): Promise<any> {
  try { const { data, error } = await supabase.functions.invoke("crypto-onchain"); if (error) throw error; return data; } catch { return null; }
}
async function fetchOrderBook(supabase: any): Promise<any> {
  try { const { data, error } = await supabase.functions.invoke("oanda-market-intel"); if (error) throw error; return data; } catch { return null; }
}
async function fetchAlphaVantageData(_supabase: any): Promise<any> { return null; }
async function fetchCarryTradeData(supabase: any): Promise<any> {
  try { const { data, error } = await supabase.functions.invoke("treasury-commodities"); if (error) throw error; return data; } catch { return null; }
}

// ─── Tier 4: Strategic Evolution Prompt (gemini-2.5-pro) ───
const TIER4_STRATEGIC_PROMPT = `SOVEREIGN TIER-4 STRATEGIC PRO. You are the architect. ONLY YOU have mutate_agent_dna authority.

MANDATE 1 — REGIME AUDIT:
Compare last20Trades against macroDirective + cotData. If trades are "Scalping" into a God Signal reversal (institutional COT opposing trade direction), you MUST Hard-Blacklist that pair for 4 hours:
\`\`\`action
{"type":"add_blacklist","pair":"XXX_YYY","duration_hours":4,"reason":"God Signal reversal conflict — scalping against institutional flow"}
\`\`\`

MANDATE 2 — DNA MUTATION (EXCLUSIVE):
You are the ONLY tier authorized to use mutate_agent_dna. Analyze WHY an agent's logic is failing by reviewing its config, recent trade outcomes, and confirmation checks. Rewrite mandatory confirmation checks as needed:
\`\`\`action
{"type":"mutate_agent_dna","agent_id":"...","mutations":{"confirmation_checks":[...],"entry_logic":"...","reason":"..."}}
\`\`\`

MANDATE 3 — KELLY-SIZING CALIBRATION:
Calculate Edge-to-Variance ratio from last48hTrades: Edge = avg(r_pips), Variance = stddev(r_pips). Kelly% = Edge/Variance. Set adjust_position_sizing cap for next window (floor 0.2x, ceiling 2.0x):
\`\`\`action
{"type":"adjust_position_sizing","kelly_fraction":0.XX,"sizing_cap":X.Xx,"edge":X.X,"variance":X.X,"window":"next_2h"}
\`\`\`

ADDITIONAL POWERS: create_gate, remove_gate, adjust_evolution_param, add_blacklist, remove_blacklist, suspend_agent, reinstate_agent, write_memory, modify_directive, adjust_gate_threshold, commit_rule

MANDATE 4 — REFLEX WRITING (L0 NERVOUS SYSTEM):
You design the Tier 1 autonomic reflexes. Use commit_rule to persist L0 hardwired rules that execute locally with ZERO AI cost:
- Regime-Based Reflexes: In "expansion" allow higher spreads. In "compression" block spread>1.5 pips.
- Dynamic Circuit Breakers: If pair WR <20% in last 4h, commit_rule a local block (60 cycles).
- Idle/Sentinel Mode: If ATR on top pairs is below threshold, commit_rule sentinel_mode to skip Tier 2-3 AI for 15min.
\`\`\`action
{"type":"commit_rule","rule_id":"SENTINEL_LOW_ATR","rule_type":"sentinel_mode","condition":"ATR below 14p threshold on top 5 pairs","duration_hours":0.25}
{"type":"commit_rule","rule_id":"BLOCK_USD_CAD_COLD","rule_type":"block_pair","pair":"USD_CAD","condition":"WR <20% last 4h","duration_hours":4}
{"type":"commit_rule","rule_id":"SPREAD_GATE_COMPRESSION","rule_type":"spread_gate","condition":"Compression regime — block spread>1.5 pips","params":{"max_spread":1.5},"duration_hours":2}
\`\`\`

MANDATE 5 — REGIME FORECASTING:
Analyze volatility compression patterns and cross-pair divergence to PREDICT regime transitions 2-4 bars ahead.
Use write_memory to persist forecasts that L0 soldiers and the trade monitor can consume:
\`\`\`action
{"type":"write_memory","key":"regime_forecast","value":{"predictions":[{"pair":"EUR_USD","current_regime":"compression","predicted_regime":"expansion","confidence":0.78,"bars_ahead":3,"sizing_recommendation":1.3}]}}
\`\`\`

Format:\`\`\`action\n{"type":"...",...}\n\`\`\`
Output: REGIME_AUDIT:[findings]|DNA_MUTATIONS:[n]|KELLY_SIZING:[fraction]|REFLEXES_WRITTEN:[n]|REGIME_FORECASTS:[n]|EVOLUTION_SUMMARY:[text]`;

// ─── Check Tier 4 Trigger ───
async function checkTier4Trigger(supabase: any): Promise<{ shouldRun: boolean; reason: string }> {
  try {
    const { data: lastRunData } = await supabase
      .from("sovereign_memory")
      .select("payload, updated_at")
      .eq("memory_key", "TIER4_LAST_RUN")
      .eq("memory_type", "system")
      .order("updated_at", { ascending: false })
      .limit(1);

    const lastRunTs = lastRunData?.[0]?.payload?.timestamp
      ? new Date(lastRunData[0].payload.timestamp).getTime()
      : 0;
    const timeSinceLastRun = Date.now() - lastRunTs;
    const intervalElapsed = timeSinceLastRun >= TIER4_INTERVAL_MS;

    const { data: recentTrades } = await supabase
      .from("oanda_orders")
      .select("status, r_pips, closed_at")
      .eq("baseline_excluded", false)
      .not("closed_at", "is", null)
      .order("closed_at", { ascending: false })
      .limit(50);

    let performanceBreach = false;
    let breachReason = "";

    if (recentTrades && recentTrades.length >= 10) {
      const wins = recentTrades.filter((t: any) => (t.r_pips || 0) > 0).length;
      const winRate = wins / recentTrades.length;

      if (winRate < TIER4_WIN_RATE_FLOOR) {
        performanceBreach = true;
        breachReason = `Win rate ${(winRate * 100).toFixed(1)}% < ${TIER4_WIN_RATE_FLOOR * 100}% floor`;
      }

      let consecLosses = 0;
      for (const t of recentTrades) {
        if ((t.r_pips || 0) <= 0) consecLosses++;
        else break;
      }
      if (consecLosses >= TIER4_CONSEC_LOSS_TRIGGER) {
        performanceBreach = true;
        breachReason = `${consecLosses} consecutive losses >= ${TIER4_CONSEC_LOSS_TRIGGER} threshold`;
      }
    }

    const BREACH_COOLDOWN_MS = TIER4_INTERVAL_MS;
    if (performanceBreach && timeSinceLastRun >= BREACH_COOLDOWN_MS) {
      return { shouldRun: true, reason: `PERFORMANCE_BREACH: ${breachReason}` };
    }
    if (intervalElapsed) return { shouldRun: true, reason: `SCHEDULED: ${(timeSinceLastRun / 3600_000).toFixed(1)}h since last run` };
    return { shouldRun: false, reason: "No trigger" };
  } catch (err) {
    console.error("❌ checkTier4Trigger error:", err);
    return { shouldRun: false, reason: `Error: ${err}` };
  }
}

// ─── Execute Tier 4 ───
async function executeTier4(supabase: any, lovableApiKey: string, dataPayload: any): Promise<any> {
  console.log("🧬 TIER 4: Invoking Strategic Evolution (gemini-2.5-pro)...");

  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const [agentConfigs, gateBypasses, rollups, last20Trades, last48hTrades] = await Promise.all([
    supabase.from("agent_configs").select("*").eq("is_active", true).then((r: any) => r.data || []),
    supabase.from("gate_bypasses").select("*").eq("revoked", false).order("created_at", { ascending: false }).limit(20).then((r: any) => r.data || []),
    supabase.from("oanda_orders_daily_rollup").select("*").order("rollup_date", { ascending: false }).limit(14).then((r: any) => r.data || []),
    supabase.from("oanda_orders").select("currency_pair, direction, r_pips, entry_price, exit_price, agent_id, regime_label, session_label, direction_engine, quantlabs_bias, sovereign_override_tag, closed_at, status").not("closed_at", "is", null).order("closed_at", { ascending: false }).limit(20).then((r: any) => r.data || []),
    supabase.from("oanda_orders").select("r_pips, currency_pair, direction, closed_at").not("closed_at", "is", null).gte("closed_at", fortyEightHoursAgo).order("closed_at", { ascending: false }).then((r: any) => r.data || []),
  ]);

  let kellyStats: any = { edge: 0, variance: 0, kelly: 0, trades: 0 };
  if (last48hTrades.length >= 5) {
    const pips = last48hTrades.map((t: any) => t.r_pips || 0);
    const mean = pips.reduce((a: number, b: number) => a + b, 0) / pips.length;
    const variance = pips.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / pips.length;
    kellyStats = { edge: +mean.toFixed(2), variance: +variance.toFixed(2), kelly: variance > 0 ? +(mean / variance).toFixed(4) : 0, trades: pips.length };
  }

  // ─── Regime Forecasting Data: volatility compression + cross-pair divergence ───
  const regimeForecastData = await buildRegimeForecastPayload(supabase);

  const tier4Payload = {
    ...dataPayload,
    agentConfigs,
    activeGateBypasses: gateBypasses,
    last14DaysRollup: rollups,
    last20Trades,
    last48hTrades_kellyStats: kellyStats,
    regimeForecastData,
  };

  const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableApiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: TIER4_STRATEGIC_PROMPT },
        { role: "user", content: `STRATEGIC REVIEW DATA:\n${JSON.stringify(tier4Payload)}` },
      ],
      temperature: 0.5,
      max_tokens: 2000,
    }),
  });

  if (!aiResponse.ok) {
    const errText = await aiResponse.text();
    console.error("❌ Tier 4 AI error:", aiResponse.status, errText);
    return { error: `Tier 4 AI error: ${aiResponse.status}` };
  }

  const aiData = await aiResponse.json();
  const llmResponse = aiData.choices[0].message.content;
  console.log("🧬 TIER 4 Response:", llmResponse);

  const t4Actions = parseActions(llmResponse);
  console.log(`🧬 TIER 4: ${t4Actions.length} evolution actions parsed`);

  const errors: any[] = [];
  for (const action of t4Actions.slice(0, 10)) {
    try { await executeAction(action, supabase); }
    catch (err) { errors.push({ action, error: String(err) }); }
  }

  await supabase.from("sovereign_memory").upsert({
    memory_key: "TIER4_LAST_RUN",
    memory_type: "system",
    payload: { timestamp: new Date().toISOString(), actions: t4Actions.length, errors: errors.length },
    updated_at: new Date().toISOString(),
    created_by: "sovereign-loop",
  }, { onConflict: "memory_key,memory_type" });

  return { llmResponse, actionsExecuted: t4Actions.length, errors };
}

// ═══════════════════════════════════════════════════════════════
// IMPROVEMENT #3: PREDICTIVE REGIME FORECASTING
// Analyzes volatility compression, ATR trends, and cross-pair
// divergence to predict regime transitions 2-4 bars ahead.
// Persists forecasts to sovereign_memory for L0 consumption.
// ═══════════════════════════════════════════════════════════════

const FORECAST_PAIRS = [
  "EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD",
  "NZD_USD", "EUR_GBP", "EUR_JPY", "GBP_JPY",
];

async function buildRegimeForecastPayload(supabase: any): Promise<any> {
  const oandaToken = Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN");
  const oandaEnv = Deno.env.get("OANDA_ENV") || "live";
  const baseUrl = oandaEnv === "live" ? "https://api-fxtrade.oanda.com" : "https://api-fxpractice.oanda.com";

  if (!oandaToken) return { error: "No OANDA token" };

  try {
    const forecasts: any[] = [];

    const results = await Promise.all(
      FORECAST_PAIRS.map(async (pair) => {
        try {
          const res = await fetch(
            `${baseUrl}/v3/instruments/${pair}/candles?granularity=M15&count=30`,
            { headers: { Authorization: `Bearer ${oandaToken}` } }
          );
          if (!res.ok) return null;
          const data = await res.json();
          return { pair, candles: (data.candles || []).filter((c: any) => c.complete) };
        } catch { return null; }
      })
    );

    for (const result of results) {
      if (!result || result.candles.length < 20) continue;
      const { pair, candles } = result;

      const isJpy = pair.includes("JPY");
      const mult = isJpy ? 100 : 10000;

      // Parse OHLC once
      const bars = candles.map((c: any) => ({
        o: parseFloat(c.mid.o),
        h: parseFloat(c.mid.h),
        l: parseFloat(c.mid.l),
        c: parseFloat(c.mid.c),
      }));

      // ═══ SIGNAL 1: Displacement Efficiency ═══
      // Ratio of actual price movement (|close - open|) to total range (high - low).
      // Marubozu = 1.0 (all movement is useful), Doji = ~0.0 (all wick noise).
      // Superior to ATR: ATR treats a 20-pip doji = 20-pip marubozu. This doesn't.
      const recentDE = bars.slice(-5).map(b => {
        const range = (b.h - b.l) * mult;
        const body = Math.abs(b.c - b.o) * mult;
        return range > 0.1 ? body / range : 0;
      });
      const olderDE = bars.slice(-15, -5).map(b => {
        const range = (b.h - b.l) * mult;
        const body = Math.abs(b.c - b.o) * mult;
        return range > 0.1 ? body / range : 0;
      });
      const avgRecentDE = recentDE.reduce((a, b) => a + b, 0) / recentDE.length;
      const avgOlderDE = olderDE.reduce((a, b) => a + b, 0) / olderDE.length;
      const deShift = avgOlderDE > 0 ? avgRecentDE / avgOlderDE : 1;

      // ═══ SIGNAL 2: Inside Bar Sequence Count ═══
      // Count consecutive inside bars from the most recent bar backwards.
      // Inside bar = current H ≤ prior H AND current L ≥ prior L (contained).
      // 3+ consecutive inside bars = extreme compression coil.
      let insideBarStreak = 0;
      for (let i = bars.length - 1; i > 0; i--) {
        if (bars[i].h <= bars[i - 1].h && bars[i].l >= bars[i - 1].l) {
          insideBarStreak++;
        } else break;
      }

      // Also count total inside bars in last 10 (not just consecutive)
      let insideBarCount = 0;
      for (let i = bars.length - 1; i > Math.max(0, bars.length - 10); i--) {
        if (bars[i].h <= bars[i - 1].h && bars[i].l >= bars[i - 1].l) {
          insideBarCount++;
        }
      }

      // ═══ SIGNAL 3: Swing Convergence (Structural Squeeze) ═══
      // Detect swing highs compressing down + swing lows compressing up = triangle.
      // A swing high = bar[i].h > bar[i-1].h AND bar[i].h > bar[i+1].h
      const swingHighs: number[] = [];
      const swingLows: number[] = [];
      for (let i = 1; i < bars.length - 1; i++) {
        if (bars[i].h > bars[i - 1].h && bars[i].h > bars[i + 1].h) swingHighs.push(bars[i].h);
        if (bars[i].l < bars[i - 1].l && bars[i].l < bars[i + 1].l) swingLows.push(bars[i].l);
      }

      // Swing convergence = last 3 swing highs descending + last 3 swing lows ascending
      let highsDescending = false, lowsAscending = false;
      if (swingHighs.length >= 3) {
        const last3H = swingHighs.slice(-3);
        highsDescending = last3H[2] < last3H[1] && last3H[1] < last3H[0];
      }
      if (swingLows.length >= 3) {
        const last3L = swingLows.slice(-3);
        lowsAscending = last3L[2] > last3L[1] && last3L[1] > last3L[0];
      }
      const swingConverging = highsDescending && lowsAscending;
      // Range compression: how tight is the most recent swing range vs the oldest?
      let swingRangeCompression = 1;
      if (swingHighs.length >= 2 && swingLows.length >= 2) {
        const oldRange = (swingHighs[0] - swingLows[0]) * mult;
        const newRange = (swingHighs[swingHighs.length - 1] - swingLows[swingLows.length - 1]) * mult;
        swingRangeCompression = oldRange > 0 ? newRange / oldRange : 1;
      }

      // ═══ SIGNAL 4: Directional Consistency (Close-to-Close) ═══
      const closes = bars.slice(-8).map(b => b.c);
      const deltas = closes.slice(1).map((c, i) => c - closes[i]);
      const upCount = deltas.filter(d => d > 0).length;
      const downCount = deltas.filter(d => d < 0).length;
      const directionalStrength = Math.max(upCount, downCount) / deltas.length;

      // ═══ COMPOSITE REGIME PREDICTION ═══
      let predictedRegime = "flat";
      let confidence = 0.5;
      let sizingRec = 1.0;

      // EXPANSION IMMINENT: structural squeeze + low displacement efficiency (doji clustering)
      if (swingConverging && avgRecentDE < 0.35 && insideBarCount >= 3) {
        predictedRegime = "expansion_imminent";
        confidence = Math.min(0.95, 0.7 + insideBarStreak * 0.05 + (swingConverging ? 0.1 : 0));
        sizingRec = 1.5; // Pre-load — the coil is about to snap
      } else if (insideBarStreak >= 3 || (insideBarCount >= 4 && avgRecentDE < 0.3)) {
        predictedRegime = "expansion_imminent";
        confidence = Math.min(0.9, 0.65 + insideBarStreak * 0.05);
        sizingRec = 1.3;
      } else if (swingConverging || (insideBarCount >= 2 && deShift < 0.6)) {
        predictedRegime = "compression_building";
        confidence = 0.65;
        sizingRec = 0.7; // Reduce — price is coiling, don't get chopped
      } else if (avgRecentDE > 0.65 && directionalStrength > 0.7 && deShift > 1.2) {
        // High displacement efficiency + directional = strong trend
        predictedRegime = "trending";
        confidence = Math.min(0.9, 0.55 + avgRecentDE * 0.3 + directionalStrength * 0.1);
        sizingRec = 1.3;
      } else if (avgRecentDE > 0.55 && deShift > 1.1) {
        predictedRegime = "expansion";
        confidence = 0.6;
        sizingRec = 1.1;
      } else if (avgRecentDE < 0.3 && directionalStrength < 0.5) {
        predictedRegime = "choppy";
        confidence = 0.6;
        sizingRec = 0.5; // Danger zone — no edge
      }

      const last3Dir = deltas.slice(-3).reduce((s, d) => s + (d > 0 ? 1 : -1), 0);

      forecasts.push({
        pair,
        // Price Action Microstructure (replaces ATR)
        displacementEfficiency: Math.round(avgRecentDE * 100) / 100,
        deShift: Math.round(deShift * 100) / 100,
        insideBarStreak,
        insideBarCount,
        swingConverging,
        swingRangeCompression: Math.round(swingRangeCompression * 100) / 100,
        directionalStrength: Math.round(directionalStrength * 100) / 100,
        // Prediction
        predictedRegime,
        confidence: Math.round(confidence * 100) / 100,
        sizingRecommendation: sizingRec,
        barsAhead: (insideBarStreak >= 3 || swingConverging) ? 2 : 4,
        recentDirection: last3Dir > 0 ? "UP" : last3Dir < 0 ? "DOWN" : "MIXED",
      });
    }

    // Persist forecasts for L0 consumption
    if (forecasts.length > 0) {
      await supabase.from("sovereign_memory").upsert({
        memory_type: "regime_forecast",
        memory_key: "latest_predictions",
        payload: {
          engine: "price_action_microstructure_v1",
          predictions: forecasts,
          generatedAt: new Date().toISOString(),
          pairsAnalyzed: forecasts.length,
          compressionAlerts: forecasts.filter(f =>
            f.predictedRegime === "compression_building" || f.predictedRegime === "expansion_imminent"
          ).length,
          choppyAlerts: forecasts.filter(f => f.predictedRegime === "choppy").length,
        },
        relevance_score: 0.95,
        created_by: "regime-forecaster-pa-v1",
      }, { onConflict: "memory_type,memory_key" });
    }

    return { predictions: forecasts, count: forecasts.length };
  } catch (err) {
    console.error("❌ buildRegimeForecastPayload error:", err);
    return { error: String(err) };
  }
}

// ─── Parse Actions ───
function parseActions(text: string): any[] {
  const actions: any[] = [];
  const regex = /```action\s*([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      actions.push(parsed);
    } catch (err) {
      console.error("❌ Failed to parse action block:", match[1], err);
    }
  }
  return actions;
}

// ─── OANDA Direct API Helper (for FM trade actions) ───
async function fmOandaRequest(path: string, method: string, body?: Record<string, unknown>): Promise<any> {
  const oandaEnv = Deno.env.get("OANDA_ENV") || "live";
  const apiToken = oandaEnv === "live"
    ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
    : Deno.env.get("OANDA_API_TOKEN");
  const accountId = oandaEnv === "live"
    ? (Deno.env.get("OANDA_LIVE_ACCOUNT_ID") || Deno.env.get("OANDA_ACCOUNT_ID"))
    : Deno.env.get("OANDA_ACCOUNT_ID");

  if (!apiToken || !accountId) throw new Error("OANDA credentials not configured");

  const host = oandaEnv === "live" ? "https://api-fxtrade.oanda.com" : "https://api-fxpractice.oanda.com";
  const url = `${host}${path.replace("{accountId}", accountId)}`;
  console.log(`[FM-OANDA] ${method} ${url}`);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) {
    console.error(`[FM-OANDA] Error ${res.status}:`, JSON.stringify(data));
    throw new Error(data.errorMessage || data.rejectReason || `OANDA ${res.status}`);
  }
  return data;
}

// ─── Execute Action ───
async function executeAction(action: any, supabase: any): Promise<void> {
  console.log(`🔧 Executing action: ${action.type}`, JSON.stringify(action).slice(0, 500));
  try {
    switch (action.type) {

      // ═══ TRADE EXECUTION — Direct OANDA API (no intermediary edge function) ═══

      case "place_trade": {
        const pair = (action.pair || action.currency_pair || "").replace("/", "_");
        const dir = action.direction || "long";
        const units = action.units || 1000;
        const signedUnits = dir === "short" ? -Math.abs(units) : Math.abs(units);
        const oandaEnv = Deno.env.get("OANDA_ENV") || "live";

        const orderBody = {
          order: {
            type: "MARKET",
            instrument: pair,
            units: signedUnits.toString(),
            timeInForce: "FOK",
            positionFill: "DEFAULT",
            ...(action.stopLossPrice ? { stopLossOnFill: { price: Number(action.stopLossPrice).toFixed(5), timeInForce: "GTC" } } : {}),
            ...(action.takeProfitPrice ? { takeProfitOnFill: { price: Number(action.takeProfitPrice).toFixed(5), timeInForce: "GTC" } } : {}),
          },
        };

        const result = await fmOandaRequest("/v3/accounts/{accountId}/orders", "POST", orderBody);
        console.log(`[FM-OANDA] Order result:`, JSON.stringify(result).slice(0, 500));

        // Persist to oanda_orders
        const oandaOrderId = result.orderCreateTransaction?.id || result.orderFillTransaction?.orderID || null;
        const oandaTradeId = result.orderFillTransaction?.tradeOpened?.tradeID || null;
        const filledPrice = result.orderFillTransaction?.price ? parseFloat(result.orderFillTransaction.price) : null;

        // Find a valid user_id from existing orders (FM uses service role, not a user JWT)
        const { data: anyOrder } = await supabase.from("oanda_orders").select("user_id").limit(1).single();
        const userId = anyOrder?.user_id || "00000000-0000-0000-0000-000000000000";

        await supabase.from("oanda_orders").insert({
          user_id: userId,
          signal_id: action.signal_id || `fm-${Date.now()}`,
          currency_pair: pair,
          direction: dir,
          units: Math.abs(units),
          entry_price: filledPrice,
          oanda_order_id: oandaOrderId,
          oanda_trade_id: oandaTradeId,
          status: oandaTradeId ? "filled" : "submitted",
          agent_id: action.agent_id || "sovereign-fm",
          environment: oandaEnv,
          sovereign_override_tag: action.reason || "FM direct",
          sovereign_override_status: "executed",
          confidence_score: action.confidence || null,
        });
        console.log(`✅ FM trade placed: ${pair} ${dir} ${units}u → trade ${oandaTradeId}`);
        break;
      }

      case "close_trade": {
        const tradeId = action.oanda_trade_id || action.tradeId || action.trade_id;
        if (!tradeId) { console.warn("⚠️ close_trade: no trade ID"); break; }
        const result = await fmOandaRequest(`/v3/accounts/{accountId}/trades/${tradeId}/close`, "PUT", {});
        const closePrice = result.orderFillTransaction?.price ? parseFloat(result.orderFillTransaction.price) : null;
        await supabase.from("oanda_orders").update({
          status: "closed",
          exit_price: closePrice,
          closed_at: new Date().toISOString(),
          sovereign_override_tag: action.reason || "FM close",
        }).eq("oanda_trade_id", tradeId);
        console.log(`✅ FM closed trade ${tradeId} @ ${closePrice}`);
        break;
      }

      case "update_sl_tp": {
        const tradeId = action.oanda_trade_id || action.tradeId || action.trade_id;
        if (!tradeId) { console.warn("⚠️ update_sl_tp: no trade ID"); break; }
        const orderUpdate: Record<string, unknown> = {};
        if (action.stopLossPrice != null) {
          orderUpdate.stopLoss = { price: Number(action.stopLossPrice).toFixed(5), timeInForce: "GTC" };
        }
        if (action.takeProfitPrice != null) {
          orderUpdate.takeProfit = { price: Number(action.takeProfitPrice).toFixed(5), timeInForce: "GTC" };
        }
        if (Object.keys(orderUpdate).length === 0) { console.warn("⚠️ update_sl_tp: no SL/TP values"); break; }
        await fmOandaRequest(`/v3/accounts/{accountId}/trades/${tradeId}/orders`, "PUT", orderUpdate);
        console.log(`✅ FM updated SL/TP on trade ${tradeId}`);
        break;
      }

      case "get_account_summary": {
        const summary = await fmOandaRequest("/v3/accounts/{accountId}/summary", "GET");
        console.log(`✅ Account NAV: ${summary.account?.NAV}, Balance: ${summary.account?.balance}`);
        break;
      }

      case "get_open_trades": {
        const trades = await fmOandaRequest("/v3/accounts/{accountId}/openTrades", "GET");
        console.log(`✅ Open trades: ${(trades.trades || []).length}`);
        break;
      }

      // ═══ GOVERNANCE — Direct DB writes (no intermediary edge function) ═══

      case "bypass_gate": {
        await supabase.from("gate_bypasses").insert({
          gate_id: action.gate_id || action.gateId,
          reason: action.reason || "FM override",
          expires_at: action.expires_at || new Date(Date.now() + 4 * 3600_000).toISOString(),
          pair: action.pair || null,
          created_by: "sovereign-fm",
        });
        break;
      }

      case "revoke_bypass": {
        await supabase.from("gate_bypasses").update({ revoked: true })
          .eq("gate_id", action.gate_id || action.gateId).eq("revoked", false);
        break;
      }

      case "adjust_gate_threshold": {
        await supabase.from("gate_bypasses").insert({
          gate_id: `GATE_THRESHOLD:${action.gate_id || action.gateId}`,
          reason: `Threshold → ${action.new_value}: ${action.reason || "FM calibration"}`,
          expires_at: action.expires_at || new Date(Date.now() + 8 * 3600_000).toISOString(),
          created_by: "sovereign-fm",
        });
        break;
      }

      case "create_gate": {
        await supabase.from("gate_bypasses").insert({
          gate_id: `DYNAMIC_GATE:${action.gate_id || action.name}`,
          reason: action.reason || action.description || "FM dynamic gate",
          expires_at: action.expires_at || new Date(Date.now() + 24 * 3600_000).toISOString(),
          created_by: "sovereign-fm",
        });
        break;
      }

      case "remove_gate": {
        await supabase.from("gate_bypasses").update({ revoked: true })
          .like("gate_id", `DYNAMIC_GATE:${action.gate_id || action.name}%`).eq("revoked", false);
        break;
      }

      case "suspend_agent": {
        await supabase.from("gate_bypasses").insert({
          gate_id: `AGENT_SUSPEND:${action.agent_id}`,
          reason: action.reason || "FM suspension",
          expires_at: action.expires_at || new Date(Date.now() + 8 * 3600_000).toISOString(),
          created_by: "sovereign-fm",
        });
        break;
      }

      case "reinstate_agent": {
        await supabase.from("gate_bypasses").update({ revoked: true })
          .eq("gate_id", `AGENT_SUSPEND:${action.agent_id}`).eq("revoked", false);
        break;
      }

      case "mutate_agent_dna": {
        await writeSovereignMemory(supabase, `agent_dna:${action.agent_id}`, action.dna || action.mutations, { source: "tier4-evolution" });
        break;
      }

      case "adjust_position_sizing": {
        await supabase.from("gate_bypasses").insert({
          gate_id: `SIZING_OVERRIDE:${action.scope || "global"}`,
          reason: `${action.multiplier || action.sizing}x: ${action.reason || "FM sizing"}`,
          expires_at: action.expires_at || new Date(Date.now() + 4 * 3600_000).toISOString(),
          created_by: "sovereign-fm",
        });
        break;
      }

      case "add_blacklist": {
        await supabase.from("gate_bypasses").insert({
          gate_id: `SESSION_BLACKLIST:${action.session || action.pair || "unknown"}`,
          reason: action.reason || "FM blacklist",
          expires_at: action.expires_at || new Date(Date.now() + 12 * 3600_000).toISOString(),
          pair: action.pair || null,
          created_by: "sovereign-fm",
        });
        break;
      }

      case "remove_blacklist": {
        await supabase.from("gate_bypasses").update({ revoked: true })
          .like("gate_id", `SESSION_BLACKLIST:${action.session || action.pair || ""}%`).eq("revoked", false);
        break;
      }

      case "activate_circuit_breaker": {
        await supabase.from("gate_bypasses").insert({
          gate_id: `CIRCUIT_BREAKER:${action.scope || "fm_manual"}`,
          reason: action.reason || "FM circuit breaker",
          expires_at: action.expires_at || new Date(Date.now() + 4 * 3600_000).toISOString(),
          created_by: "sovereign-fm",
        });
        break;
      }

      case "deactivate_circuit_breaker": {
        await supabase.from("gate_bypasses").update({ revoked: true })
          .like("gate_id", "CIRCUIT_BREAKER:%").eq("revoked", false);
        break;
      }

      case "adjust_evolution_param": {
        await supabase.from("gate_bypasses").insert({
          gate_id: `EVOLUTION_PARAM:${action.param || action.name}`,
          reason: `${action.value}: ${action.reason || "FM evolution"}`,
          expires_at: action.expires_at || new Date(Date.now() + 24 * 3600_000).toISOString(),
          created_by: "sovereign-fm",
        });
        break;
      }

      case "set_global_posture": {
        await writeSovereignMemory(supabase, "global_posture", {
          posture: action.posture,
          reason: action.reason,
          set_at: new Date().toISOString(),
        });
        break;
      }

      // ═══ SELF-MODIFICATION — Direct implementations ═══

      case "write_memory":
        await writeSovereignMemory(supabase, action.key || action.memory_key, action.value || action.payload, action.metadata);
        break;

      case "commit_rule":
        await commitRule(supabase, action);
        break;

      case "configure_zscore_engine":
        if (action.zscore_config) await writeSovereignMemory(supabase, "zscore_strike_config", action.zscore_config);
        if (action.correlation_groups) await writeSovereignMemory(supabase, "correlation_groups_config", { groups: action.correlation_groups });
        if (action.velocity_config) await writeSovereignMemory(supabase, "velocity_gating_config", action.velocity_config);
        if (action.snapback_config) await writeSovereignMemory(supabase, "snapback_sniper_config", action.snapback_config);
        break;

      // ═══ GENERIC EDGE FUNCTION CALL (for any that actually exist) ═══

      case "call_edge_function":
        await supabase.functions.invoke(action.function_name, { body: action.params });
        break;

      case "discover_physics":
        await writeSovereignMemory(supabase, `physics_discovery:${action.pair || "global"}`, action);
        break;

      case "lead_lag_scan":
        await writeSovereignMemory(supabase, "lead_lag_scan_request", action);
        break;

      case "liquidity_heatmap":
        await writeSovereignMemory(supabase, "liquidity_heatmap_request", action);
        break;

      case "execute_liquidity_vacuum":
        await writeSovereignMemory(supabase, "liquidity_vacuum_request", action);
        break;

      default:
        console.warn(`⚠️ Unknown action type: ${action.type} — persisting to memory`);
        await writeSovereignMemory(supabase, `fm_action:${action.type}`, action);
    }
    console.log(`✅ Action executed: ${action.type}`);
  } catch (err) {
    console.error(`❌ Action execution failed: ${action.type}`, err);
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════
// L0 RULE ENGINE — PURE DETERMINISTIC HEARTBEAT
// Evaluates hardwired rules with ZERO AI cost.
// This is the nervous system. Reflexes, not thoughts.
// ═══════════════════════════════════════════════════════════════

interface L0Rule {
  memory_key: string;
  payload: {
    rule_type: string;
    condition: string;
    action: string;
    pair?: string;
    expires_at?: string;
    params?: Record<string, any>;
  };
}

interface L0Result {
  rulesEvaluated: number;
  rulesFired: number;
  skipAI: boolean;
  blockedPairs: string[];
  sizingOverride: number | null;
  firedRules: string[];
}

async function evaluateL0Rules(supabase: any): Promise<L0Result> {
  const result: L0Result = {
    rulesEvaluated: 0, rulesFired: 0, skipAI: false,
    blockedPairs: [], sizingOverride: null, firedRules: [],
  };

  try {
    const { data: rules } = await supabase
      .from("sovereign_memory")
      .select("memory_key, payload, expires_at")
      .eq("memory_type", "HARDWIRED_RULE")
      .order("created_at", { ascending: false });

    if (!rules || rules.length === 0) return result;

    const now = new Date();
    const activeRules = rules.filter((r: any) => {
      if (r.expires_at && new Date(r.expires_at) < now) return false;
      return true;
    });

    result.rulesEvaluated = activeRules.length;

    for (const rule of activeRules) {
      const p = rule.payload as L0Rule["payload"];
      if (!p || !p.rule_type) continue;

      switch (p.rule_type) {
        case "sentinel_mode":
          result.skipAI = true;
          result.rulesFired++;
          result.firedRules.push(`SENTINEL: ${p.condition}`);
          console.log(`🛡️ L0 SENTINEL MODE: ${p.condition}`);
          break;
        case "block_pair":
          if (p.pair) {
            result.blockedPairs.push(p.pair);
            result.rulesFired++;
            result.firedRules.push(`BLOCK: ${p.pair} — ${p.condition}`);
            console.log(`🚫 L0 BLOCK PAIR: ${p.pair} — ${p.condition}`);
          }
          break;
        case "spread_gate":
          result.rulesFired++;
          result.firedRules.push(`SPREAD_GATE: ${p.condition}`);
          console.log(`📏 L0 SPREAD GATE: ${p.condition}`);
          break;
        case "circuit_breaker":
          result.rulesFired++;
          result.firedRules.push(`CIRCUIT_BREAKER: ${p.condition}`);
          console.log(`⚡ L0 CIRCUIT BREAKER: ${p.condition}`);
          break;
        case "reduce_sizing":
          if (p.params?.sizing_cap != null) {
            result.sizingOverride = Math.min(result.sizingOverride ?? Infinity, p.params.sizing_cap);
            result.rulesFired++;
            result.firedRules.push(`SIZING: cap=${p.params.sizing_cap}x — ${p.condition}`);
            console.log(`📉 L0 SIZING OVERRIDE: ${p.params.sizing_cap}x — ${p.condition}`);
          }
          break;
        default:
          result.rulesFired++;
          result.firedRules.push(`CUSTOM[${p.rule_type}]: ${p.condition}`);
          console.log(`🔧 L0 CUSTOM RULE: ${p.rule_type} — ${p.condition}`);
      }
    }

    console.log(`🧠 L0 Engine: ${result.rulesEvaluated} rules evaluated, ${result.rulesFired} fired, skipAI=${result.skipAI}`);
    return result;
  } catch (err) {
    console.error("❌ evaluateL0Rules error:", err);
    return result;
  }
}

async function commitRule(supabase: any, action: any): Promise<void> {
  const ruleKey = action.rule_id || `RULE_${Date.now()}`;
  const expiresAt = action.duration_hours
    ? new Date(Date.now() + action.duration_hours * 3600_000).toISOString()
    : action.expires_at || null;

  await supabase.from("sovereign_memory").upsert({
    memory_key: ruleKey,
    memory_type: "HARDWIRED_RULE",
    payload: {
      rule_type: action.rule_type,
      condition: action.condition || action.reason || "Sovereign-committed rule",
      action: action.action || "block_trade",
      pair: action.pair || null,
      params: action.params || {},
    },
    expires_at: expiresAt,
    created_by: action.created_by || "sovereign-loop",
    updated_at: new Date().toISOString(),
    relevance_score: 1.0,
  }, { onConflict: "memory_key,memory_type" });

  console.log(`✅ L0 Rule committed: ${ruleKey} (expires: ${expiresAt || "never"})`);
}

// ─── Circuit Breaker Check ───
async function checkCircuitBreaker(supabase: any): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("gate_bypasses")
      .select("gate_id, reason, expires_at")
      .like("gate_id", "CIRCUIT_BREAKER:%")
      .eq("revoked", false)
      .gte("expires_at", new Date().toISOString())
      .limit(1);
    if (error) throw error;
    return (data && data.length > 0) || false;
  } catch (err) {
    console.error("❌ checkCircuitBreaker error:", err);
    return false;
  }
}

// ─── Log Cycle Result ───
async function logCycleResult(supabase: any, cycleData: any): Promise<void> {
  try {
    const { error } = await supabase.from("sovereign_memory").upsert({
      memory_type: "cycle_log",
      memory_key: "latest_cycle",
      payload: {
        timestamp: new Date().toISOString(),
        actions_taken: cycleData.actionsTaken,
        cycle_assessment: cycleData.cycleAssessment,
        sovereignty_score: cycleData.sovereigntyScore,
        tier: cycleData.tier || "L0",
        errors: cycleData.errors || [],
      },
      relevance_score: 0.3,
      created_by: "sovereign-loop",
    }, { onConflict: "memory_type,memory_key" });
    if (error) throw error;
    console.log("✅ Cycle result logged");
  } catch (err) {
    console.error("❌ logCycleResult error:", err);
  }
}

// ═══════════════════════════════════════════════════════════════
// IMPROVEMENT #1: L0-FIRST HEARTBEAT ARCHITECTURE
// The 60s loop is now DETERMINISTIC by default:
// 1. L0 rules → circuit breakers → regime forecasting → flash-crash status
// 2. AI (Tier 2-3) ONLY fires when: open trades > 0 OR recent losses detected
// 3. Tier 4 runs on its own 30-min schedule regardless
// This saves ~95% of AI credits during idle/calm periods.
// ═══════════════════════════════════════════════════════════════

async function checkDeskIsHot(supabase: any): Promise<{ isHot: boolean; reason: string; openTradeCount: number }> {
  try {
    // Check for open trades
    const { data: openTrades, error } = await supabase
      .from("oanda_orders")
      .select("id")
      .eq("status", "filled")
      .is("exit_price", null)
      .limit(5);

    const openCount = openTrades?.length || 0;
    if (openCount > 0) {
      return { isHot: true, reason: `${openCount} open trades`, openTradeCount: openCount };
    }

    // Check for recent losses (last 30 min)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60_000).toISOString();
    const { data: recentLosses } = await supabase
      .from("oanda_orders")
      .select("r_pips")
      .not("closed_at", "is", null)
      .gte("closed_at", thirtyMinAgo)
      .lt("r_pips", 0)
      .limit(3);

    if (recentLosses && recentLosses.length >= 2) {
      return { isHot: true, reason: `${recentLosses.length} recent losses in 30min`, openTradeCount: 0 };
    }

    // Check for active circuit breaker (need AI to evaluate deactivation)
    const cbActive = await checkCircuitBreaker(supabase);
    if (cbActive) {
      return { isHot: false, reason: "Circuit breaker active — L0 only", openTradeCount: 0 };
    }

    return { isHot: false, reason: "Desk idle — L0 sentinel", openTradeCount: 0 };
  } catch (err) {
    console.error("❌ checkDeskIsHot error:", err);
    return { isHot: true, reason: "Error checking — defaulting to hot", openTradeCount: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER — L0-FIRST ARCHITECTURE
// ═══════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log("🤖 Sovereign Loop: Waking up...");

    // ─── 1. Circuit Breaker Check ───
    const circuitBreakerActive = await checkCircuitBreaker(supabase);
    if (circuitBreakerActive) {
      console.log("🛑 Circuit breaker active. Halting autonomous loop.");
      return new Response(
        JSON.stringify({ status: "halted", reason: "circuit_breaker_active" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 2. Load Loop State ───
    let loopState: LoopState;
    try {
      const { data, error } = await supabase
        .from("sovereign_loop_state")
        .select("*")
        .eq("id", "global")
        .single();
      if (error) throw error;
      loopState = data as LoopState;
    } catch {
      loopState = { lastRunTs: 0, consecutiveErrors: 0, totalActionsThisHour: 0, hourStartTs: Date.now() };
    }

    // ─── 3. Rate Limiting ───
    const now = Date.now();
    if (now - loopState.lastRunTs < MIN_INTERVAL_MS) {
      return new Response(
        JSON.stringify({ status: "skipped", reason: "min_interval_not_met" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (now - loopState.hourStartTs > 3600_000) {
      loopState.totalActionsThisHour = 0;
      loopState.hourStartTs = now;
    }

    if (loopState.totalActionsThisHour >= MAX_ACTIONS_PER_HOUR) {
      return new Response(
        JSON.stringify({ status: "halted", reason: "max_actions_per_hour" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (loopState.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      await supabase.from("gate_bypasses").insert({
        gate_id: "CIRCUIT_BREAKER:max_consecutive_errors",
        reason: `Sovereign loop: ${MAX_CONSECUTIVE_ERRORS} consecutive errors`,
        expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        created_by: "sovereign-loop",
      });
      return new Response(
        JSON.stringify({ status: "halted", reason: "max_consecutive_errors" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 3b. L0 Rule Engine (ALWAYS runs — zero cost) ───
    console.log("🧠 Evaluating L0 hardwired rules...");
    const l0Result = await evaluateL0Rules(supabase);

    // ─── 3c. IMPROVEMENT #1: Check if desk is "hot" (needs AI) ───
    const deskStatus = await checkDeskIsHot(supabase);
    const needsAI = deskStatus.isHot && !l0Result.skipAI;

    console.log(`📊 Desk status: ${deskStatus.reason} | needsAI=${needsAI}`);

    // ─── 3d. Regime Forecasting (L0 — runs every cycle, zero AI) ───
    // Quick regime forecast check from cached predictions
    let regimeAlerts: string[] = [];
    try {
      const { data: forecast } = await supabase
        .from("sovereign_memory")
        .select("payload")
        .eq("memory_key", "latest_predictions")
        .eq("memory_type", "regime_forecast")
        .maybeSingle();

      if (forecast?.payload?.predictions) {
        const preds = forecast.payload.predictions as any[];
        regimeAlerts = preds
          .filter((p: any) => p.predictedRegime === "expansion_imminent" && p.confidence >= 0.7)
          .map((p: any) => `${p.pair}: ${p.predictedRegime} (${Math.round(p.confidence * 100)}%)`);

        if (regimeAlerts.length > 0) {
          console.log(`🔮 REGIME ALERT: ${regimeAlerts.join(", ")}`);
        }
      }
    } catch { /* non-critical */ }

    // ─── 3e. Flash-Crash Status Check (L0 — zero cost) ───
    let flashCrashStatus = "CLEAR";
    try {
      const { data: fcStatus } = await supabase
        .from("sovereign_memory")
        .select("payload")
        .eq("memory_key", "killswitch_status")
        .eq("memory_type", "flash_crash_monitor")
        .maybeSingle();

      if (fcStatus?.payload?.alertCount > 0) {
        flashCrashStatus = fcStatus.payload.isCascade ? "CASCADE" : "ALERT";
        console.log(`⚡ FLASH-CRASH: ${flashCrashStatus} — ${fcStatus.payload.alertCount} pair alerts`);
      }
    } catch { /* non-critical */ }

    // ─── TIER 4 CHECK (always, regardless of AI need) ───
    const tier4Check = await checkTier4Trigger(supabase);
    let tier4Result: any = null;
    if (tier4Check.shouldRun) {
      console.log(`🧬 TIER 4 TRIGGERED: ${tier4Check.reason}`);
      // Tier 4 needs data — fetch minimal payload
      const [smartG8Res, econCalRes, sovereignMemoryRes] = await Promise.all([
        fetchSmartG8Directive(supabase),
        fetchEconCalendarData(supabase),
        fetchSovereignMemory(supabase),
      ]);
      tier4Result = await executeTier4(supabase, lovableApiKey, {
        smartG8Directive: smartG8Res,
        econCalendarData: econCalRes,
        sovereignMemory: sovereignMemoryRes,
      });
    } else {
      console.log(`⏭️ Tier 4 skipped: ${tier4Check.reason}`);
    }

    // ─── L0-ONLY PATH (desk is cold — no AI needed) ───
    if (!needsAI) {
      loopState.lastRunTs = now;
      loopState.consecutiveErrors = 0;
      await supabase.from("sovereign_loop_state").upsert({ id: "global", ...loopState });

      await logCycleResult(supabase, {
        actionsTaken: 0,
        cycleAssessment: `L0_HEARTBEAT: ${deskStatus.reason}${l0Result.skipAI ? ' | SENTINEL' : ''}${regimeAlerts.length > 0 ? ` | REGIME: ${regimeAlerts.join(',')}` : ''}${flashCrashStatus !== 'CLEAR' ? ` | FLASH: ${flashCrashStatus}` : ''}`,
        sovereigntyScore: 100,
        tier: "L0",
        errors: [],
      });

      console.log("✅ Sovereign Loop: L0 heartbeat complete (zero AI cost).");
      return new Response(
        JSON.stringify({
          status: "l0_heartbeat",
          deskStatus,
          l0: l0Result,
          regimeAlerts,
          flashCrashStatus,
          tier4: tier4Result ? { triggered: true, ...tier4Result } : { triggered: false },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════
    // TIER 2-3 AI PATH — Desk is HOT, needs governance
    // ═══════════════════════════════════════════════════════════
    console.log("🔥 Desk is HOT — activating Tier 2-3 AI governance...");

    const l0Context = {
      blockedPairs: l0Result.blockedPairs,
      sizingOverride: l0Result.sizingOverride,
      firedRules: l0Result.firedRules,
      regimeAlerts,
      flashCrashStatus,
    };

    // ─── 4. Fetch Data (Tiered "Lungs" Architecture) ───
    const useTacticalCache = tacticalCache && (now - tacticalCache.timestamp < TACTICAL_CACHE_TTL_MS);
    const useStrategicCache = strategicCache && (now - strategicCache.timestamp < STRATEGIC_CACHE_TTL_MS);

    const tier = useTacticalCache ? (useStrategicCache ? "H" : "H+S") : (useStrategicCache ? "H+T" : "H+T+S");
    console.log(`🫁 Lungs tier: ${tier}`);

    const [smartG8Res, orderBookRes, econCalRes, sovereignMemoryRes] = await Promise.all([
      fetchSmartG8Directive(supabase),
      fetchOrderBook(supabase),
      fetchEconCalendarData(supabase),
      fetchSovereignMemory(supabase),
    ]);

    let crossAssetRes: any, sentimentRes: any, stocksRes: any, cryptoRes: any, optionsRes: any, onChainRes: any;
    if (useTacticalCache) {
      ({ crossAssetRes, sentimentRes, stocksRes, cryptoRes, optionsRes, onChainRes } = tacticalCache!);
    } else {
      [crossAssetRes, sentimentRes, stocksRes, cryptoRes, optionsRes, onChainRes] = await Promise.all([
        fetchCrossAssetPulse(supabase),
        fetchSentimentData(supabase),
        fetchStocksIntel(supabase),
        fetchCryptoIntel(supabase),
        fetchOptionsVolData(supabase),
        fetchCryptoOnChainData(supabase),
      ]);
      tacticalCache = { timestamp: now, crossAssetRes, sentimentRes, stocksRes, cryptoRes, optionsRes, onChainRes };
      console.log("📊 Tactical feeds refreshed");
    }

    let cotRes: any, macroRes: any, bisImfRes: any, cbCommsRes: any, treasuryRes: any, carryTradeRes: any, alphaVantageRes: any;
    if (useStrategicCache) {
      ({ cotRes, macroRes, bisImfRes, cbCommsRes, treasuryRes, carryTradeRes, alphaVantageRes } = strategicCache!);
    } else {
      [cotRes, macroRes, bisImfRes, cbCommsRes, treasuryRes, carryTradeRes, alphaVantageRes] = await Promise.all([
        fetchCOTData(supabase), fetchMacroData(supabase), fetchBISIMFData(supabase),
        fetchCBCommsData(supabase), fetchTreasuryData(supabase), fetchCarryTradeData(supabase),
        fetchAlphaVantageData(supabase),
      ]);
      strategicCache = { timestamp: now, cotRes, macroRes, bisImfRes, cbCommsRes, treasuryRes, carryTradeRes, alphaVantageRes };
      console.log("🔭 Strategic feeds refreshed");
    }

    const dataPayload = {
      smartG8Directive: smartG8Res, crossAssetPulse: crossAssetRes,
      cotData: cotRes, macroData: macroRes, stocksIntel: stocksRes,
      cryptoIntel: cryptoRes, treasuryData: treasuryRes, sentimentData: sentimentRes,
      optionsVolData: optionsRes, econCalendarData: econCalRes,
      bisImfData: bisImfRes, cbCommsData: cbCommsRes,
      cryptoOnChainData: onChainRes, orderBook: orderBookRes,
      alphaVantageData: alphaVantageRes, carryTradeData: carryTradeRes,
      sovereignMemory: sovereignMemoryRes,
      l0ActiveReflexes: l0Context,
    };

    // ─── 5. Call AI ───
    console.log("🧠 Invoking Sovereign Intelligence (gemini-2.5-flash-lite)...");
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableApiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: SOVEREIGN_AUTONOMOUS_PROMPT },
          { role: "user", content: `CYCLE DATA:\n${JSON.stringify(dataPayload)}` },
        ],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI gateway error: ${aiResponse.status} ${aiResponse.statusText}`);
    }

    const aiData = await aiResponse.json();
    const llmResponse = aiData.choices[0].message.content;
    console.log("📝 LLM Response:", llmResponse);

    const actions = parseActions(llmResponse);
    console.log(`🎯 Parsed ${actions.length} actions`);

    const actionsToExecute = actions.slice(0, MAX_ACTIONS_PER_CYCLE);
    const errors: any[] = [];
    for (const action of actionsToExecute) {
      try { await executeAction(action, supabase); }
      catch (err) { errors.push({ action, error: String(err) }); }
    }

    // ─── Event-Driven Proactive Scans ───
    try {
      const volSpikeDetected = (() => {
        try {
          const g8 = smartG8Res as any;
          if (g8?.events && Array.isArray(g8.events)) {
            if (g8.events.some((e: any) => e.impact === "High" || e.impact === "high")) return true;
          }
          return false;
        } catch { return false; }
      })();

      if (volSpikeDetected) {
        console.log("🔍 VOL SPIKE — triggering scans...");
        await Promise.all([
          executeAction({ type: "liquidity_heatmap", pairs: "all", depth: "full" }, supabase),
          executeAction({ type: "lead_lag_scan", mode: "full_universe", threshold_pips: 5 }, supabase),
        ]);
      } else {
        console.log("😴 Market calm — using cached order book depth for PREDATORY_LIMIT placement");
      }
    } catch (err) {
      errors.push({ action: "proactive_scans", error: String(err) });
    }

    // ─── Metrics ───
    const actionsTakenMatch = llmResponse.match(/ACTIONS_TAKEN:\s*\[?(\d+)\]?/i);
    const cycleAssessmentMatch = llmResponse.match(/CYCLE_ASSESSMENT:\s*\[?([^\]]+)\]?/i);
    const sovereigntyScoreMatch = llmResponse.match(/SOVEREIGNTY_SCORE:\s*\[?(\d+)\]?/i);

    const actionsTaken = actionsTakenMatch ? parseInt(actionsTakenMatch[1], 10) : actionsToExecute.length;
    const cycleAssessment = cycleAssessmentMatch ? cycleAssessmentMatch[1].trim() : "N/A";
    const sovereigntyScore = sovereigntyScoreMatch ? parseInt(sovereigntyScoreMatch[1], 10) : 0;

    // ─── Update State ───
    loopState.lastRunTs = now;
    loopState.totalActionsThisHour += actionsTaken;
    loopState.consecutiveErrors = errors.length > 0 ? loopState.consecutiveErrors + 1 : 0;

    await supabase.from("sovereign_loop_state").upsert({ id: "global", ...loopState });

    await logCycleResult(supabase, {
      actionsTaken, cycleAssessment, sovereigntyScore,
      llmResponse, tier: "T2-T3", errors,
    });

    console.log("✅ Sovereign Loop: Cycle complete.");
    return new Response(
      JSON.stringify({
        status: "success",
        tier: "T2-T3",
        deskStatus,
        actionsTaken, cycleAssessment, sovereigntyScore, errors,
        regimeAlerts, flashCrashStatus,
        tier4: tier4Result ? { triggered: true, reason: tier4Check.reason, ...tier4Result } : { triggered: false },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Sovereign Loop error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
