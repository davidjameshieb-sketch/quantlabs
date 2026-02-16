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
const TIER4_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
const TIER4_WIN_RATE_FLOOR = 0.40;     // <40% WR triggers Tier 4
const TIER4_CONSEC_LOSS_TRIGGER = 5;   // 5 consecutive losses triggers Tier 4

// ─── AUTONOMOUS SYSTEM PROMPT (HYPER-COMPRESSED — ~1.5K tokens) ───
const SOVEREIGN_AUTONOMOUS_PROMPT = `SOVEREIGN AUTO. SCAN→DECIDE→ACT q60s.
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

// ─── 2-CYCLE INTEL CACHE for slow-moving data sources ───
// OANDA pricing stays real-time. COT/macro/sentiment/etc cached for 2 cycles (~2min)
const INTEL_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes (2 cycles at 60s)
let intelCache: {
  timestamp: number;
  cotRes: any; macroRes: any; stocksRes: any; cryptoRes: any;
  treasuryRes: any; sentimentRes: any; optionsRes: any;
  econCalRes: any; bisImfRes: any; cbCommsRes: any; onChainRes: any;
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
    const { error } = await supabase.from("sovereign_memory").insert({
      key,
      value,
      metadata: metadata || {},
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
    console.log(`✅ Sovereign memory written: ${key}`);
  } catch (err) {
    console.error("❌ writeSovereignMemory error:", err);
  }
}

// ─── Fetch smartG8 Directive ───
async function fetchSmartG8Directive(supabase: any): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke("smartg8-directive");
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
    const { data, error } = await supabase.functions.invoke("cross-asset-pulse");
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
    const { data, error } = await supabase.functions.invoke("cot-data");
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
    const { data, error } = await supabase.functions.invoke("macro-data");
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
    const { data, error } = await supabase.functions.invoke("treasury-data");
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
    const { data, error } = await supabase.functions.invoke("sentiment-data");
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
    const { data, error } = await supabase.functions.invoke("options-vol-data");
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
    const { data, error } = await supabase.functions.invoke("econ-calendar-data");
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
    const { data, error } = await supabase.functions.invoke("cb-comms-data");
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
    const { data, error } = await supabase.functions.invoke("crypto-onchain-data");
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
    const { data, error } = await supabase.functions.invoke("order-book");
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("❌ fetchOrderBook error:", err);
    return null;
  }
}

// ─── Fetch Alpha Vantage Data ───
async function fetchAlphaVantageData(supabase: any): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke("alpha-vantage-data");
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("❌ fetchAlphaVantageData error:", err);
    return null;
  }
}

// ─── Fetch Carry Trade Data ───
async function fetchCarryTradeData(supabase: any): Promise<any> {
  try {
    const { data, error } = await supabase.functions.invoke("carry-trade-data");
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

ADDITIONAL POWERS: create_gate, remove_gate, adjust_evolution_param, add_blacklist, remove_blacklist, suspend_agent, reinstate_agent, write_memory, modify_directive, adjust_gate_threshold
Format:\`\`\`action\n{"type":"...",...}\n\`\`\`
Output: REGIME_AUDIT:[findings]|DNA_MUTATIONS:[n]|KELLY_SIZING:[fraction]|EVOLUTION_SUMMARY:[text]`;

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

    if (performanceBreach) return { shouldRun: true, reason: `PERFORMANCE_BREACH: ${breachReason}` };
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
        await supabase.functions.invoke("rule-committer", { body: action });
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

// ─── Check Circuit Breaker ───
async function checkCircuitBreaker(supabase: any): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("circuit_breaker_state")
      .select("*")
      .eq("id", "global")
      .single();
    if (error) throw error;
    return data?.active || false;
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
    const { error } = await supabase.from("sovereign_loop_cycles").insert({
      timestamp: new Date().toISOString(),
      actions_taken: cycleData.actionsTaken,
      cycle_assessment: cycleData.cycleAssessment,
      sovereignty_score: cycleData.sovereigntyScore,
      llm_response: cycleData.llmResponse,
      errors: cycleData.errors || [],
    });
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
      await supabase.from("circuit_breaker_state").upsert({
        id: "global",
        active: true,
        reason: "max_consecutive_errors",
        activated_at: new Date().toISOString(),
      });
      return new Response(
        JSON.stringify({ status: "halted", reason: "max_consecutive_errors" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 4. Fetch Data (with 2-cycle cache for slow sources) ───
    console.log("📡 Fetching intelligence...");

    const useCache = intelCache && (now - intelCache.timestamp < INTEL_CACHE_TTL_MS);

    const [
      smartG8Res,
      crossAssetRes,
      cotRes,
      macroRes,
      stocksRes,
      cryptoRes,
      treasuryRes,
      sentimentRes,
      optionsRes,
      econCalRes,
      bisImfRes,
      cbCommsRes,
      onChainRes,
      orderBookRes,
      alphaVantageRes,
      carryTradeRes,
      sovereignMemoryRes,
    ] = await Promise.all([
      fetchSmartG8Directive(supabase),
      fetchCrossAssetPulse(supabase),
      useCache ? intelCache!.cotRes : fetchCOTData(supabase),
      useCache ? intelCache!.macroRes : fetchMacroData(supabase),
      useCache ? intelCache!.stocksRes : fetchStocksIntel(supabase),
      useCache ? intelCache!.cryptoRes : fetchCryptoIntel(supabase),
      useCache ? intelCache!.treasuryRes : fetchTreasuryData(supabase),
      useCache ? intelCache!.sentimentRes : fetchSentimentData(supabase),
      useCache ? intelCache!.optionsRes : fetchOptionsVolData(supabase),
      useCache ? intelCache!.econCalRes : fetchEconCalendarData(supabase),
      useCache ? intelCache!.bisImfRes : fetchBISIMFData(supabase),
      useCache ? intelCache!.cbCommsRes : fetchCBCommsData(supabase),
      useCache ? intelCache!.onChainRes : fetchCryptoOnChainData(supabase),
      fetchOrderBook(supabase),
      fetchAlphaVantageData(supabase),
      fetchCarryTradeData(supabase),
      fetchSovereignMemory(supabase),
    ]);

    // Update cache if we fetched fresh data
    if (!useCache) {
      intelCache = {
        timestamp: now,
        cotRes, macroRes, stocksRes, cryptoRes,
        treasuryRes, sentimentRes, optionsRes,
        econCalRes, bisImfRes, cbCommsRes, onChainRes,
      };
    }

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

    // ─── 7b. Tier 4 Strategic Evolution Check ───
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
