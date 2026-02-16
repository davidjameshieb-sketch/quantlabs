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
const TIER4_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const TIER4_WIN_RATE_FLOOR = 0.40;     // <40% WR triggers Tier 4
const TIER4_CONSEC_LOSS_TRIGGER = 5;   // 5 consecutive losses triggers Tier 4

// ─── AUTONOMOUS SYSTEM PROMPT (HYPER-COMPRESSED — ~1.5K tokens) ───
const SOVEREIGN_AUTONOMOUS_PROMPT = `SOVEREIGN AUTO. SCAN→DECIDE→ACT q60s.
TICK STREAM: You have a LIVE OANDA tick-level WebSocket stream (ripple-stream) running continuously. It evaluates armed correlation triggers on EVERY TICK (~100-500ms). When you arm_correlation_trigger, the stream picks it up instantly and fires trades the MOMENT divergence thresholds breach — sub-second execution. This is your fastest weapon. The 10s fast-poll-triggers is your fallback. Your ripple trades execute at tick speed now.
P1:G8 EXTREME→flat.HIGH→0.3x.DATA_SURPRISE match→HOLD,vs→CLOSE.THS<25→close.3+loss/2h→breaker@3%.>-2R→close.DD>-3%→close worst.
P2:Heatmap stop-hunt.MFE>1.5R+PL<0.5R→trail.THS-20→exit.Regime→reassess.
P3:CF>55%(10+)→relax gate.3+loss→blacklist/suspend.Edge→1.3x.Muddy→0.3x.
P4:lead_lag corr>5pip.Retail>70%→contra.LowSpread+consensus→entry.
RULES:Max ${MAX_ACTIONS_PER_CYCLE} acts.SL+TP always.500-2000u.0.3R MAE,180s stop.
OUT:ACTIONS_TAKEN:[n]|CYCLE_ASSESSMENT:[txt]|SOVEREIGNTY_SCORE:[0-100]
ACT:place_trade,close_trade,update_sl_tp,bypass_gate,revoke_bypass,suspend_agent,reinstate_agent,adjust_position_sizing,adjust_gate_threshold,add_blacklist,remove_blacklist,activate_circuit_breaker,deactivate_circuit_breaker,adjust_evolution_param,create_gate,remove_gate,lead_lag_scan,liquidity_heatmap,get_account_summary,get_open_trades,execute_liquidity_vacuum,arm_correlation_trigger,disarm_correlation_trigger,set_global_posture,discover_physics
SELF:commit_rule,write_memory,modify_directive,define_macro,execute_macro,db_write,db_query,execute_sql,deploy_function,http_request,eval_indicator,call_edge_function,manage_storage,manage_auth,discover_physics(>=0.7 auto)
NOTE:mutate_agent_dna is TIER-4 EXCLUSIVE. Do NOT emit mutate_agent_dna actions. If DNA mutation needed, flag via write_memory key="TIER4_DNA_REQUEST".
Format:\`\`\`action\n{"type":"...",...}\n\`\`\``;

// ─── TIERED INTEL REFRESH ("The Lungs") ───
// Tier H (Heartbeat 60s): Live pricing, order books, smartG8, econ calendar, sovereign memory
// Tier T (Tactical 5min):  Cross-asset pulse, sentiment, stocks, crypto, options, on-chain
// Tier S (Strategic 30min): COT, macro, BIS/IMF, CB comms, treasury, carry trade, alpha vantage
// Event-Driven: liquidity_heatmap + lead_lag_scan fire only on vol spike > 150% of 5-bar avg
const TACTICAL_CACHE_TTL_MS = 5 * 60 * 1000;   // 5 minutes
const STRATEGIC_CACHE_TTL_MS = 30 * 60 * 1000;  // 30 minutes

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

// ─── Fetch Sovereign Memory ───
async function fetchSovereignMemory(supabase: any): Promise<any> {
  try {
    const { data, error } = await supabase
      .from("sovereign_memory")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("❌ fetchSovereignMemory error:", err);
    return [];
  }
}

// ─── Write Sovereign Memory ───
async function writeSovereignMemory(
  supabase: any,
  key: string,
  value: any,
  metadata?: any
): Promise<void> {
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

// ─── Fetch smartG8 Directive ───
async function fetchSmartG8Directive(supabase: any): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke("god-signal-gateway");
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("❌ fetchSmartG8Directive error:", err);
    return null;
  }
}

// ─── Fetch Cross-Asset Pulse ───
async function fetchCrossAssetPulse(supabase: any): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke("cross-asset-latency");
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("❌ fetchCrossAssetPulse error:", err);
    return null;
  }
}

// ─── Fetch COT Data ───
async function fetchCOTData(supabase: any): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke("forex-cot-data");
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("❌ fetchCOTData error:", err);
    return null;
  }
}

// ─── Fetch Macro Data ───
async function fetchMacroData(supabase: any): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke("forex-macro-data");
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("❌ fetchMacroData error:", err);
    return null;
  }
}

// ─── Fetch Stocks Intel ───
async function fetchStocksIntel(supabase: any): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke("stocks-intel");
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("❌ fetchStocksIntel error:", err);
    return null;
  }
}

// ─── Fetch Crypto Intel ───
async function fetchCryptoIntel(supabase: any): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke("crypto-intel");
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("❌ fetchCryptoIntel error:", err);
    return null;
  }
}

// ─── Fetch Treasury Data ───
async function fetchTreasuryData(supabase: any): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke("treasury-commodities");
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("❌ fetchTreasuryData error:", err);
    return null;
  }
}

// ─── Fetch Sentiment Data ───
async function fetchSentimentData(supabase: any): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke("market-sentiment");
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("❌ fetchSentimentData error:", err);
    return null;
  }
}

// ─── Fetch Options Vol Data ───
async function fetchOptionsVolData(supabase: any): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke("options-volatility-intel");
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("❌ fetchOptionsVolData error:", err);
    return null;
  }
}

// ─── Fetch Econ Calendar Data ───
async function fetchEconCalendarData(supabase: any): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke("economic-calendar-intel");
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("❌ fetchEconCalendarData error:", err);
    return null;
  }
}

// ─── Fetch BIS/IMF Data ───
async function fetchBISIMFData(supabase: any): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke("bis-imf-data");
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("❌ fetchBISIMFData error:", err);
    return null;
  }
}

// ─── Fetch CB Comms Data ───
async function fetchCBCommsData(supabase: any): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke("central-bank-comms");
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("❌ fetchCBCommsData error:", err);
    return null;
  }
}

// ─── Fetch Crypto On-Chain Data ───
async function fetchCryptoOnChainData(supabase: any): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke("crypto-onchain");
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("❌ fetchCryptoOnChainData error:", err);
    return null;
  }
}

// ─── Fetch Order Book / Position Book ───
async function fetchOrderBook(supabase: any): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke("oanda-market-intel");
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("❌ fetchOrderBook error:", err);
    return null;
  }
}

// ─── Fetch Alpha Vantage Data (via treasury-commodities, market-data requires user auth) ───
async function fetchAlphaVantageData(_supabase: any): Promise<any> {
  // market-data requires user JWT auth — cannot be called from sovereign loop (service role).
  // Alpha Vantage / Polygon data is not critical for sovereign loop decisions.
  // Strategic data is already covered by treasury-commodities and other feeds.
  return null;
}

// ─── Fetch Carry Trade Data ───
async function fetchCarryTradeData(supabase: any): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke("treasury-commodities");
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("❌ fetchCarryTradeData error:", err);
    return null;
  }
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

Format:\`\`\`action\n{"type":"...",...}\n\`\`\`
Output: REGIME_AUDIT:[findings]|DNA_MUTATIONS:[n]|KELLY_SIZING:[fraction]|REFLEXES_WRITTEN:[n]|EVOLUTION_SUMMARY:[text]`;

// ─── Check Tier 4 Trigger Conditions ───
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

    // Performance breach still respects cooldown — otherwise Tier 4 fires EVERY 60s cycle
    const BREACH_COOLDOWN_MS = TIER4_INTERVAL_MS; // same as scheduled interval
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

// ─── Execute Tier 4 Strategic Evolution ───
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

  // Pre-compute Kelly stats for the prompt
  let kellyStats: any = { edge: 0, variance: 0, kelly: 0, trades: 0 };
  if (last48hTrades.length >= 5) {
    const pips = last48hTrades.map((t: any) => t.r_pips || 0);
    const mean = pips.reduce((a: number, b: number) => a + b, 0) / pips.length;
    const variance = pips.reduce((a: number, b: number) => a + (b - mean) ** 2, 0) / pips.length;
    kellyStats = { edge: +mean.toFixed(2), variance: +variance.toFixed(2), kelly: variance > 0 ? +(mean / variance).toFixed(4) : 0, trades: pips.length };
  }

  const tier4Payload = {
    ...dataPayload,
    agentConfigs,
    activeGateBypasses: gateBypasses,
    last14DaysRollup: rollups,
    last20Trades,
    last48hTrades_kellyStats: kellyStats,
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

  // Persist last run timestamp
  await supabase.from("sovereign_memory").upsert({
    memory_key: "TIER4_LAST_RUN",
    memory_type: "system",
    payload: { timestamp: new Date().toISOString(), actions: t4Actions.length, errors: errors.length },
    updated_at: new Date().toISOString(),
    created_by: "sovereign-loop",
  }, { onConflict: "memory_key,memory_type" });

  return { llmResponse, actionsExecuted: t4Actions.length, errors };
}

// ─── Parse Actions from LLM Response ───
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

// ─── Execute Action ───
async function executeAction(action: any, supabase: any): Promise<void> {
  console.log(`🔧 Executing action: ${action.type}`, action);
  try {
    switch (action.type) {
      case "place_trade":
        await supabase.functions.invoke("oanda-place-trade", { body: action });
        break;
      case "close_trade":
        await supabase.functions.invoke("oanda-close-trade", { body: action });
        break;
      case "update_sl_tp":
        await supabase.functions.invoke("oanda-update-sl-tp", { body: action });
        break;
      case "bypass_gate":
      case "revoke_bypass":
      case "adjust_gate_threshold":
      case "create_gate":
      case "remove_gate":
        await supabase.functions.invoke("gate-manager", { body: action });
        break;
      case "suspend_agent":
      case "reinstate_agent":
      case "mutate_agent_dna":
        await supabase.functions.invoke("agent-manager", { body: action });
        break;
      case "adjust_position_sizing":
        await supabase.functions.invoke("position-sizing-manager", { body: action });
        break;
      case "add_blacklist":
      case "remove_blacklist":
        await supabase.functions.invoke("blacklist-manager", { body: action });
        break;
      case "activate_circuit_breaker":
      case "deactivate_circuit_breaker":
        await supabase.functions.invoke("circuit-breaker-manager", { body: action });
        break;
      case "adjust_evolution_param":
        await supabase.functions.invoke("evolution-manager", { body: action });
        break;
      case "lead_lag_scan":
        await supabase.functions.invoke("lead-lag-scanner", { body: action });
        break;
      case "liquidity_heatmap":
        await supabase.functions.invoke("liquidity-heatmap", { body: action });
        break;
      case "get_account_summary":
        await supabase.functions.invoke("oanda-account-summary", { body: action });
        break;
      case "get_open_trades":
        await supabase.functions.invoke("oanda-open-trades", { body: action });
        break;
      case "execute_liquidity_vacuum":
        await supabase.functions.invoke("liquidity-vacuum", { body: action });
        break;
      case "arm_correlation_trigger":
      case "disarm_correlation_trigger":
        await supabase.functions.invoke("correlation-trigger-manager", { body: action });
        break;
      case "set_global_posture":
        await supabase.functions.invoke("global-posture-manager", { body: action });
        break;
      case "discover_physics":
        await supabase.functions.invoke("physics-discovery", { body: action });
        break;
      case "write_memory":
        await writeSovereignMemory(supabase, action.key, action.value, action.metadata);
        break;
      case "modify_directive":
        await supabase.functions.invoke("directive-modifier", { body: action });
        break;
      case "define_macro":
      case "execute_macro":
        await supabase.functions.invoke("macro-manager", { body: action });
        break;
      case "db_write":
      case "db_query":
        await supabase.functions.invoke("db-executor", { body: action });
        break;
      case "execute_sql":
        await supabase.functions.invoke("sql-executor", { body: action });
        break;
      case "deploy_function":
        await supabase.functions.invoke("function-deployer", { body: action });
        break;
      case "http_request":
        await supabase.functions.invoke("http-requester", { body: action });
        break;
      case "eval_indicator":
        await supabase.functions.invoke("indicator-evaluator", { body: action });
        break;
      case "call_edge_function":
        await supabase.functions.invoke(action.function_name, { body: action.params });
        break;
      case "manage_storage":
        await supabase.functions.invoke("storage-manager", { body: action });
        break;
      case "manage_auth":
        await supabase.functions.invoke("auth-manager", { body: action });
        break;
      case "commit_rule":
        await commitRule(supabase, action);
        break;
      default:
        console.warn(`⚠️ Unknown action type: ${action.type}`);
    }
    console.log(`✅ Action executed: ${action.type}`);
  } catch (err) {
    console.error(`❌ Action execution failed: ${action.type}`, err);
    throw err;
  }
}

// ─── L0 Rule Engine: Evaluate Hardwired Rules ───
interface L0Rule {
  memory_key: string;
  payload: {
    rule_type: string;       // "block_pair" | "sentinel_mode" | "spread_gate" | "circuit_breaker" | "custom"
    condition: string;       // Human-readable condition description
    action: string;          // "skip_ai" | "block_trade" | "reduce_sizing" | "halt"
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
          // Skip AI calls entirely — market is idle/muddy
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
          // Sizing/spread threshold adjustments
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
            result.sizingOverride = Math.min(
              result.sizingOverride ?? Infinity,
              p.params.sizing_cap
            );
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

// ─── commit_rule: Persist L0 hardwired rules to sovereign_memory ───
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

// ─── Check Circuit Breaker ───
async function checkCircuitBreaker(supabase: any): Promise<boolean> {
  try {
    // Check gate_bypasses for active circuit breakers
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
async function logCycleResult(
  supabase: any,
  cycleData: any
): Promise<void> {
  try {
    // Log cycle result to sovereign_memory instead of missing table
    const { error } = await supabase.from("sovereign_memory").upsert({
      memory_type: "cycle_log",
      memory_key: "latest_cycle",
      payload: {
        timestamp: new Date().toISOString(),
        actions_taken: cycleData.actionsTaken,
        cycle_assessment: cycleData.cycleAssessment,
        sovereignty_score: cycleData.sovereigntyScore,
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
// MAIN HANDLER
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
    } catch (err) {
      console.log("⚠️ No loop state found, initializing...");
      loopState = {
        lastRunTs: 0,
        consecutiveErrors: 0,
        totalActionsThisHour: 0,
        hourStartTs: Date.now(),
      };
    }

    // ─── 3. Rate Limiting ───
    const now = Date.now();
    if (now - loopState.lastRunTs < MIN_INTERVAL_MS) {
      console.log("⏳ Too soon since last run. Skipping cycle.");
      return new Response(
        JSON.stringify({ status: "skipped", reason: "min_interval_not_met" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Reset hourly counter if needed
    if (now - loopState.hourStartTs > 3600_000) {
      loopState.totalActionsThisHour = 0;
      loopState.hourStartTs = now;
    }

    if (loopState.totalActionsThisHour >= MAX_ACTIONS_PER_HOUR) {
      console.log("🛑 Max actions per hour reached. Halting.");
      return new Response(
        JSON.stringify({ status: "halted", reason: "max_actions_per_hour" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (loopState.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      console.log("🛑 Max consecutive errors reached. Halting.");
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

    // ─── 3b. L0 Rule Engine (Evolving Reflexes — Zero AI Cost) ───
    console.log("🧠 Evaluating L0 hardwired rules...");
    const l0Result = await evaluateL0Rules(supabase);

    if (l0Result.skipAI) {
      console.log(`🛡️ SENTINEL MODE: Skipping Tier 2-3 AI call. ${l0Result.firedRules.join("; ")}`);

      // Still update loop state
      loopState.lastRunTs = now;
      await supabase.from("sovereign_loop_state").upsert({ id: "global", ...loopState });

      // Still check Tier 4 (strategic brain runs on its own schedule)
      const tier4Check = await checkTier4Trigger(supabase);
      let tier4Result: any = null;
      if (tier4Check.shouldRun) {
        console.log(`🧬 TIER 4 TRIGGERED (during sentinel): ${tier4Check.reason}`);
        tier4Result = await executeTier4(supabase, lovableApiKey, {});
      }

      await logCycleResult(supabase, {
        actionsTaken: 0,
        cycleAssessment: `SENTINEL_MODE: ${l0Result.firedRules.join("; ")}`,
        sovereigntyScore: 100,
        llmResponse: "L0 SENTINEL — AI call skipped",
        errors: [],
      });

      return new Response(
        JSON.stringify({
          status: "sentinel",
          l0: l0Result,
          tier4: tier4Result ? { triggered: true, ...tier4Result } : { triggered: false },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Inject L0 context (blocked pairs, sizing overrides) into cycle for AI awareness
    const l0Context = {
      blockedPairs: l0Result.blockedPairs,
      sizingOverride: l0Result.sizingOverride,
      firedRules: l0Result.firedRules,
    };

    // ─── 4. Fetch Data (Tiered "Lungs" Architecture) ───
    console.log("📡 Fetching intelligence (tiered refresh)...");

    const useTacticalCache = tacticalCache && (now - tacticalCache.timestamp < TACTICAL_CACHE_TTL_MS);
    const useStrategicCache = strategicCache && (now - strategicCache.timestamp < STRATEGIC_CACHE_TTL_MS);

    const tier = useTacticalCache ? (useStrategicCache ? "H" : "H+S") : (useStrategicCache ? "H+T" : "H+T+S");
    console.log(`🫁 Lungs tier: ${tier} | tactical=${useTacticalCache ? "cached" : "FRESH"} | strategic=${useStrategicCache ? "cached" : "FRESH"}`);

    // Tier H — Heartbeat (always fresh, 60s): pricing, order books, econ cal, memory
    const [smartG8Res, orderBookRes, econCalRes, sovereignMemoryRes] = await Promise.all([
      fetchSmartG8Directive(supabase),
      fetchOrderBook(supabase),
      fetchEconCalendarData(supabase),
      fetchSovereignMemory(supabase),
    ]);

    // Tier T — Tactical (5min cache): cross-asset, sentiment, stocks, crypto, options, on-chain
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
      console.log("📊 Tactical feeds refreshed: Cross-Asset, Sentiment, Stocks, Crypto, Options, On-Chain");
    }

    // Tier S — Strategic (30min cache, aligns with Tier 4): COT, macro, BIS/IMF REER, CB comms, treasury, carry, AV
    let cotRes: any, macroRes: any, bisImfRes: any, cbCommsRes: any, treasuryRes: any, carryTradeRes: any, alphaVantageRes: any;
    if (useStrategicCache) {
      ({ cotRes, macroRes, bisImfRes, cbCommsRes, treasuryRes, carryTradeRes, alphaVantageRes } = strategicCache!);
    } else {
      [cotRes, macroRes, bisImfRes, cbCommsRes, treasuryRes, carryTradeRes, alphaVantageRes] = await Promise.all([
        fetchCOTData(supabase),
        fetchMacroData(supabase),
        fetchBISIMFData(supabase),
        fetchCBCommsData(supabase),
        fetchTreasuryData(supabase),
        fetchCarryTradeData(supabase),
        fetchAlphaVantageData(supabase),
      ]);
      strategicCache = { timestamp: now, cotRes, macroRes, bisImfRes, cbCommsRes, treasuryRes, carryTradeRes, alphaVantageRes };
      console.log("🔭 Strategic feeds refreshed: COT, Macro, BIS/IMF REER, CB Comms, Treasury, Carry, AlphaVantage");
    }

    // ─── Ripple Stream Status (tick-level execution awareness) ───
    const { data: recentStreamFires } = await supabase
      .from("gate_bypasses")
      .select("gate_id, reason, created_at")
      .like("gate_id", "RIPPLE_STREAM_FIRED:%")
      .eq("revoked", false)
      .gte("created_at", new Date(Date.now() - 3600_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(5);

    const { data: armedTriggers } = await supabase
      .from("gate_bypasses")
      .select("gate_id, reason, created_at, expires_at")
      .like("gate_id", "CORRELATION_TRIGGER:%")
      .eq("revoked", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(10);

    const rippleStreamStatus = {
      connected: true,
      engine: "ripple-stream-v1",
      mode: "OANDA_WEBSOCKET_TICK_LEVEL",
      latency: "~100-500ms per tick",
      keepalive: "pg_cron every 2min, 110s stream sessions",
      armedTriggers: (armedTriggers || []).length,
      armedTriggerDetails: (armedTriggers || []).map((t: any) => {
        try { const p = JSON.parse(t.reason); return { gate: t.gate_id, loud: p.loudPair, quiet: p.quietPair, dir: p.direction, threshold: p.thresholdPips, armed: t.created_at }; } catch { return t.gate_id; }
      }),
      recentStreamFires: (recentStreamFires || []).length,
      recentFireDetails: (recentStreamFires || []).map((f: any) => {
        try { const p = JSON.parse(f.reason); return { pair: p.quietPair, dir: p.direction, tick: p.tickNumber, latencyMs: p.streamLatencyMs, fired: p.firedAt }; } catch { return f.gate_id; }
      }),
    };

    const dataPayload = {
      smartG8Directive: smartG8Res,
      crossAssetPulse: crossAssetRes,
      cotData: cotRes,
      macroData: macroRes,
      stocksIntel: stocksRes,
      cryptoIntel: cryptoRes,
      treasuryData: treasuryRes,
      sentimentData: sentimentRes,
      optionsVolData: optionsRes,
      econCalendarData: econCalRes,
      bisImfData: bisImfRes,
      cbCommsData: cbCommsRes,
      cryptoOnChainData: onChainRes,
      orderBook: orderBookRes,
      alphaVantageData: alphaVantageRes,
      carryTradeData: carryTradeRes,
      sovereignMemory: sovereignMemoryRes,
      l0ActiveReflexes: l0Context,
      rippleStreamStatus,
    };

    // ─── 5. Call Lovable AI (gemini-2.5-flash-lite) ───
    console.log("🧠 Invoking Sovereign Intelligence (gemini-2.5-flash-lite)...");
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: SOVEREIGN_AUTONOMOUS_PROMPT },
          {
            role: "user",
            content: `CYCLE DATA:\n${JSON.stringify(dataPayload)}`,
          },
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

    // ─── 6. Parse Actions ───
    const actions = parseActions(llmResponse);
    console.log(`🎯 Parsed ${actions.length} actions`);

    // Enforce max actions per cycle
    const actionsToExecute = actions.slice(0, MAX_ACTIONS_PER_CYCLE);

    // ─── 7. Execute Actions ───
    const errors: any[] = [];
    for (const action of actionsToExecute) {
      try {
        await executeAction(action, supabase);
      } catch (err) {
        console.error("❌ Action execution error:", err);
        errors.push({ action, error: String(err) });
      }
    }

    // ─── 7a. Event-Driven Proactive Scans (vol spike or high-impact news) ───
    // Order book depth is ALWAYS analyzed for PREDATORY_LIMIT placement (free — already fetched)
    let proactiveScansFired = false;
    try {
      const volSpikeDetected = (() => {
        try {
          // Trigger 1: High-impact economic event imminent
          const g8 = smartG8Res as any;
          if (g8?.events && Array.isArray(g8.events)) {
            if (g8.events.some((e: any) => e.impact === "High" || e.impact === "high")) return true;
          }
          // Trigger 2: Order book spread asymmetry (proxy for vol spike > 150%)
          const ob = orderBookRes as any;
          if (ob?.pairs) {
            for (const pair of Object.values(ob.pairs) as any[]) {
              if ((pair as any)?.spread_ratio && (pair as any).spread_ratio > 1.5) return true;
            }
          }
          return false;
        } catch { return false; }
      })();

      if (volSpikeDetected) {
        console.log("🔍 VOL SPIKE detected — triggering liquidity_heatmap + lead_lag_scan...");
        await Promise.all([
          executeAction({ type: "liquidity_heatmap", pairs: "all", depth: "full" }, supabase),
          executeAction({ type: "lead_lag_scan", mode: "full_universe", threshold_pips: 5 }, supabase),
        ]);
        proactiveScansFired = true;
        console.log("✅ Event-driven scans fired");
      } else {
        console.log("😴 Market calm — using cached order book depth for PREDATORY_LIMIT placement");
      }
    } catch (err) {
      console.error("⚠️ Proactive scan error (non-fatal):", err);
      errors.push({ action: "proactive_scans", error: String(err) });
    }

    // ─── 7b. Shadow Agent Synthesis (one-time bootstrap) ───
    try {
      const { data: shadowCheck } = await supabase
        .from("sovereign_memory")
        .select("memory_key")
        .eq("memory_key", "SHADOW_AGENTS_SYNTHESIZED_V1")
        .eq("memory_type", "system")
        .limit(1);

      if (!shadowCheck || shadowCheck.length === 0) {
        console.log("🧬 Synthesizing 3 shadow agents...");

        const shadowAgents = [
          {
            agent_id: "shadow-london-ny-overlap",
            config: {
              name: "London/NY Overlap Specialist",
              description: "Optimized for 13:00-17:00 UTC overlap liquidity surge. Targets momentum continuation and breakout-retest patterns during peak institutional flow.",
              session_filter: ["london-ny-overlap"],
              regime_filter: ["momentum", "expansion", "breakout"],
              direction_bias: "trend-following",
              entry_logic: "MTF consensus >= 70 + regime momentum confirmed + spread < 1.5p",
              confirmation_checks: ["rvol_above_1.2", "cot_alignment", "carry_positive"],
              sizing_multiplier: 0.1,
              is_shadow: true,
              promotion_threshold: { min_trades: 20, min_win_rate: 0.55, min_r_ratio: 1.2 },
              created_by: "sovereign-synthesis-v1",
            },
            is_active: true,
          },
          {
            agent_id: "shadow-asian-mean-reversion",
            config: {
              name: "Asian Session Mean Reversion",
              description: "Exploits range-bound behavior during 00:00-06:00 UTC. Fades extremes at Bollinger Band edges with tight stops and quick profit capture.",
              session_filter: ["asian", "early-asian"],
              regime_filter: ["flat", "compression", "transition"],
              direction_bias: "mean-reversion",
              entry_logic: "Price at BB outer band + RSI divergence + ATR below session median",
              confirmation_checks: ["bb_touch", "rsi_divergence", "low_atr"],
              sizing_multiplier: 0.1,
              is_shadow: true,
              promotion_threshold: { min_trades: 20, min_win_rate: 0.55, min_r_ratio: 1.2 },
              created_by: "sovereign-synthesis-v1",
            },
            is_active: true,
          },
          {
            agent_id: "shadow-news-volatility",
            config: {
              name: "News Volatility Harvester",
              description: "Capitalizes on post-news volatility spikes within 5-30 minutes of high-impact releases. Uses econ calendar + ATR spike detection for entry timing.",
              session_filter: ["any"],
              regime_filter: ["expansion", "breakout", "momentum"],
              direction_bias: "momentum-capture",
              entry_logic: "ATR spike > 1.5x session avg + econ event within 30min + spread normalizing",
              confirmation_checks: ["atr_spike", "econ_calendar_high_impact", "spread_normalizing"],
              sizing_multiplier: 0.1,
              is_shadow: true,
              promotion_threshold: { min_trades: 20, min_win_rate: 0.55, min_r_ratio: 1.2 },
              created_by: "sovereign-synthesis-v1",
            },
            is_active: true,
          },
        ];

        for (const agent of shadowAgents) {
          await supabase.from("agent_configs").upsert(agent, { onConflict: "agent_id" });
        }

        await supabase.from("sovereign_memory").upsert({
          memory_key: "SHADOW_AGENTS_SYNTHESIZED_V1",
          memory_type: "system",
          payload: {
            agents: shadowAgents.map(a => a.agent_id),
            synthesized_at: new Date().toISOString(),
            promotion_criteria: "20+ trades, WR > 55%, R-ratio > 1.2",
          },
          created_by: "sovereign-loop",
          updated_at: new Date().toISOString(),
          relevance_score: 1.0,
        }, { onConflict: "memory_key,memory_type" });

        console.log("✅ 3 shadow agents synthesized: london-ny-overlap, asian-mean-reversion, news-volatility");
      }
    } catch (err) {
      console.error("⚠️ Shadow agent synthesis error (non-fatal):", err);
    }

    // ─── 7c. Tier 4 Strategic Evolution Check ───
    const tier4Check = await checkTier4Trigger(supabase);
    let tier4Result: any = null;
    if (tier4Check.shouldRun) {
      console.log(`🧬 TIER 4 TRIGGERED: ${tier4Check.reason}`);
      tier4Result = await executeTier4(supabase, lovableApiKey, dataPayload);
    } else {
      console.log(`⏭️ Tier 4 skipped: ${tier4Check.reason}`);
    }

    // ─── 8. Extract Metrics ───
    const actionsTakenMatch = llmResponse.match(/ACTIONS_TAKEN:\s*\[?(\d+)\]?/i);
    const cycleAssessmentMatch = llmResponse.match(/CYCLE_ASSESSMENT:\s*\[?([^\]]+)\]?/i);
    const sovereigntyScoreMatch = llmResponse.match(/SOVEREIGNTY_SCORE:\s*\[?(\d+)\]?/i);

    const actionsTaken = actionsTakenMatch ? parseInt(actionsTakenMatch[1], 10) : actionsToExecute.length;
    const cycleAssessment = cycleAssessmentMatch ? cycleAssessmentMatch[1].trim() : "N/A";
    const sovereigntyScore = sovereigntyScoreMatch ? parseInt(sovereigntyScoreMatch[1], 10) : 0;

    // ─── 9. Update Loop State ───
    loopState.lastRunTs = now;
    loopState.totalActionsThisHour += actionsTaken;
    loopState.consecutiveErrors = errors.length > 0 ? loopState.consecutiveErrors + 1 : 0;

    await supabase.from("sovereign_loop_state").upsert({
      id: "global",
      ...loopState,
    });

    // ─── 10. Log Cycle ───
    await logCycleResult(supabase, {
      actionsTaken,
      cycleAssessment,
      sovereigntyScore,
      llmResponse,
      errors,
    });

    console.log("✅ Sovereign Loop: Cycle complete.");
    return new Response(
      JSON.stringify({
        status: "success",
        actionsTaken,
        cycleAssessment,
        sovereigntyScore,
        errors,
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
