// Ghost Pipeline — Paper-Execution Engine
// Mirrors live OANDA pricing + Slippage Sentinel friction data to paper-execute
// shadow agent DNA mutations WITHOUT risking NAV.
// Each "ghost trade" is persisted to oanda_orders with environment='shadow'.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_HOSTS: Record<string, string> = {
  practice: "https://api-fxpractice.oanda.com",
  live: "https://api-fxtrade.oanda.com",
};

function getOandaCreds(env: string) {
  const apiToken = env === "live"
    ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
    : Deno.env.get("OANDA_API_TOKEN");
  const accountId = env === "live"
    ? (Deno.env.get("OANDA_LIVE_ACCOUNT_ID") || Deno.env.get("OANDA_ACCOUNT_ID"))
    : Deno.env.get("OANDA_ACCOUNT_ID");
  const host = OANDA_HOSTS[env] || OANDA_HOSTS.practice;
  return { apiToken, accountId, host };
}

interface GhostTrade {
  pair: string;
  direction: "long" | "short";
  units: number;
  agentId: string;
  variantId?: string;
  signalId: string;
  userId: string;
  slTarget?: number; // pips
  tpTarget?: number; // pips
  dnaPayload?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const env = Deno.env.get("OANDA_ENV") || "live";
    const { apiToken, accountId, host } = getOandaCreds(env);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!apiToken || !accountId) {
      return new Response(JSON.stringify({ error: "OANDA credentials not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { trades, mode } = body as { trades?: GhostTrade[]; mode?: string };

    // Mode: "batch" — run a batch of ghost trades against current prices
    // Mode: "scan" — auto-scan all active shadow agent DNA and generate ghost signals
    if (mode === "scan") {
      return await handleScan(supabase, apiToken, accountId, host, env);
    }

    if (!trades || trades.length === 0) {
      return new Response(JSON.stringify({ error: "Required: trades[] or mode='scan'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const trade of trades) {
      try {
        const result = await executeGhostTrade(trade, apiToken, accountId, host, supabase, env);
        results.push(result);
      } catch (err) {
        results.push({ pair: trade.pair, agentId: trade.agentId, error: (err as Error).message });
      }
    }

    console.log(`[GHOST-PIPELINE] Processed ${results.length} ghost trades`);

    return new Response(JSON.stringify({ ghostTrades: results, count: results.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[GHOST-PIPELINE] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function executeGhostTrade(
  trade: GhostTrade,
  apiToken: string,
  accountId: string,
  host: string,
  supabase: any,
  env: string,
) {
  const instrument = trade.pair.replace("/", "_");

  // 1. Fetch live pricing
  const pricingUrl = `${host}/v3/accounts/${accountId}/pricing?instruments=${instrument}`;
  const pricingRes = await fetch(pricingUrl, {
    headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json" },
  });
  const pricingData = await pricingRes.json();

  if (!pricingData?.prices?.[0]?.tradeable) {
    return { pair: trade.pair, agentId: trade.agentId, status: "skipped", reason: "not tradeable" };
  }

  const price = pricingData.prices[0];
  const bid = parseFloat(price.bids?.[0]?.price || "0");
  const ask = parseFloat(price.asks?.[0]?.price || "0");
  const entryPrice = trade.direction === "long" ? ask : bid;
  const isJPY = instrument.includes("JPY");
  const pipMultiplier = isJPY ? 100 : 10000;
  const spreadPips = +((ask - bid) * pipMultiplier).toFixed(1);

  // 2. Call Slippage Sentinel for friction data
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  let frictionData: any = null;
  try {
    const sentinelRes = await fetch(`${supabaseUrl}/functions/v1/check-execution-viability`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ pair: trade.pair, units: trade.units, direction: trade.direction }),
    });
    frictionData = await sentinelRes.json();
  } catch (e) {
    console.warn("[GHOST-PIPELINE] Sentinel call failed:", e);
  }

  // 3. Simulate slippage based on Sentinel data
  const estimatedSlippage = frictionData?.estimatedSlippagePips || spreadPips * 0.3;
  const pipDirection = trade.direction === "long" ? 1 : -1;
  const simulatedEntry = entryPrice + (estimatedSlippage / pipMultiplier) * pipDirection;

  // 4. Simulate exit (use TP/SL or a simple 5-bar hold)
  // For paper execution, we use current mid as a proxy for exit
  const mid = (bid + ask) / 2;
  const simulatedExit = mid; // In a real ghost pipeline, this would be tracked over time

  const pips = trade.direction === "long"
    ? (simulatedExit - simulatedEntry) * pipMultiplier
    : (simulatedEntry - simulatedExit) * pipMultiplier;

  // 5. Persist to oanda_orders as shadow
  const orderRecord = {
    user_id: trade.userId,
    signal_id: trade.signalId || `ghost-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    currency_pair: instrument,
    direction: trade.direction,
    units: trade.units,
    entry_price: +simulatedEntry.toFixed(isJPY ? 3 : 5),
    exit_price: +simulatedExit.toFixed(isJPY ? 3 : 5),
    requested_price: +entryPrice.toFixed(isJPY ? 3 : 5),
    slippage_pips: +estimatedSlippage.toFixed(2),
    spread_at_entry: spreadPips,
    friction_score: frictionData?.viabilityScore || null,
    status: "closed",
    environment: "shadow",
    agent_id: trade.agentId,
    variant_id: trade.variantId || "ghost-baseline",
    direction_engine: "ghost-pipeline",
    closed_at: new Date().toISOString(),
    r_pips: +pips.toFixed(1),
    governance_payload: trade.dnaPayload || null,
  };

  const { error: insertError } = await supabase.from("oanda_orders").insert(orderRecord);
  if (insertError) {
    console.error("[GHOST-PIPELINE] Insert error:", insertError);
    return { pair: trade.pair, agentId: trade.agentId, error: insertError.message };
  }

  return {
    pair: trade.pair,
    agentId: trade.agentId,
    direction: trade.direction,
    entryPrice: orderRecord.entry_price,
    exitPrice: orderRecord.exit_price,
    pips: +pips.toFixed(1),
    frictionScore: frictionData?.viabilityScore || null,
    spreadPips,
    slippagePips: +estimatedSlippage.toFixed(2),
    status: "ghost-filled",
  };
}

// Auto-scan: find all active shadow agent DNA and generate ghost signals
async function handleScan(supabase: any, apiToken: string, accountId: string, host: string, env: string) {
  // Get all active shadow agents from gate_bypasses
  const { data: shadowAgents } = await supabase
    .from("gate_bypasses")
    .select("*")
    .like("gate_id", "SHADOW_AGENT:%")
    .eq("revoked", false)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(20);

  if (!shadowAgents || shadowAgents.length === 0) {
    return new Response(
      JSON.stringify({ message: "No active shadow agents to scan", ghostTrades: [], count: 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // For each shadow agent, get recent pricing for its pair and simulate
  const results = [];
  for (const agent of shadowAgents) {
    const pair = agent.pair || "EUR_USD";
    const agentLabel = agent.gate_id.replace("SHADOW_AGENT:", "");

    // Simple directional bias from reason text
    const reasonLower = (agent.reason || "").toLowerCase();
    const direction = reasonLower.includes("short") ? "short" : "long";

    try {
      const result = await executeGhostTrade(
        {
          pair,
          direction: direction as "long" | "short",
          units: 100, // Shadow agents run at 0.1x = 100 units base
          agentId: `shadow-${agentLabel}`,
          signalId: `ghost-scan-${Date.now()}-${agentLabel}`,
          userId: agent.created_by === "sovereign-loop" ? "00000000-0000-0000-0000-000000000000" : agent.created_by,
        },
        apiToken,
        accountId,
        host,
        supabase,
        env,
      );
      results.push(result);
    } catch (err) {
      results.push({ agentId: agentLabel, error: (err as Error).message });
    }
  }

  console.log(`[GHOST-PIPELINE] Scan complete: ${results.length} ghost trades from ${shadowAgents.length} agents`);

  return new Response(
    JSON.stringify({ ghostTrades: results, count: results.length, scannedAgents: shadowAgents.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
