// Friction Lab — Spread-Adjusted Backtester
// Stress-tests agent DNA against historical order data with variable slippage models.
// Replays closed orders from oanda_orders applying different friction scenarios
// to measure true edge after execution costs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface FrictionScenario {
  name: string;
  spreadMultiplier: number;    // 1.0 = actual, 1.5 = 50% wider, 2.0 = double
  slippageAddPips: number;     // additional slippage pips per trade
  rejectIfSpreadAbove: number; // reject trades where spread > N pips
}

const DEFAULT_SCENARIOS: FrictionScenario[] = [
  { name: "Actual", spreadMultiplier: 1.0, slippageAddPips: 0, rejectIfSpreadAbove: 99 },
  { name: "Moderate Stress", spreadMultiplier: 1.5, slippageAddPips: 0.3, rejectIfSpreadAbove: 5 },
  { name: "High Stress", spreadMultiplier: 2.0, slippageAddPips: 0.7, rejectIfSpreadAbove: 3 },
  { name: "Extreme", spreadMultiplier: 3.0, slippageAddPips: 1.5, rejectIfSpreadAbove: 2 },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const {
      agentId,
      pair,
      daysBack = 30,
      environment = "live",
      scenarios,
    } = body as {
      agentId?: string;
      pair?: string;
      daysBack?: number;
      environment?: string;
      scenarios?: FrictionScenario[];
    };

    // Fetch historical closed orders
    let query = supabase
      .from("oanda_orders")
      .select("*")
      .in("status", ["filled", "closed"])
      .not("entry_price", "is", null)
      .not("exit_price", "is", null)
      .eq("environment", environment)
      .gte("created_at", new Date(Date.now() - daysBack * 86400_000).toISOString())
      .order("created_at", { ascending: true })
      .limit(500);

    if (agentId) query = query.eq("agent_id", agentId);
    if (pair) query = query.eq("currency_pair", pair.replace("/", "_"));

    const { data: orders, error: fetchErr } = await query;
    if (fetchErr) throw new Error(`DB fetch error: ${fetchErr.message}`);
    if (!orders || orders.length === 0) {
      return new Response(
        JSON.stringify({ message: "No historical orders found for given filters", results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const activeScenarios = scenarios || DEFAULT_SCENARIOS;
    const results = [];

    for (const scenario of activeScenarios) {
      let totalPips = 0;
      let wins = 0;
      let losses = 0;
      let rejected = 0;
      let grossProfit = 0;
      let grossLoss = 0;
      let maxDrawdown = 0;
      let equity = 0;
      let peakEquity = 0;
      const tradeResults: { pair: string; pips: number; originalPips: number; frictionCost: number }[] = [];

      for (const order of orders) {
        const isJPY = order.currency_pair.includes("JPY");
        const pipMult = isJPY ? 100 : 10000;
        const actualSpread = order.spread_at_entry || 0;
        const adjustedSpread = actualSpread * scenario.spreadMultiplier;

        // Reject if spread too wide
        if (adjustedSpread > scenario.rejectIfSpreadAbove) {
          rejected++;
          continue;
        }

        // Calculate original pips
        const rawPips = order.direction === "long"
          ? (order.exit_price - order.entry_price) * pipMult
          : (order.entry_price - order.exit_price) * pipMult;

        // Calculate friction cost: extra spread + additional slippage
        const extraSpreadCost = (adjustedSpread - actualSpread); // pips
        const frictionCost = extraSpreadCost + scenario.slippageAddPips;

        // Adjusted pips = raw pips minus friction cost
        const adjustedPips = rawPips - frictionCost;

        totalPips += adjustedPips;
        if (adjustedPips > 0) {
          wins++;
          grossProfit += adjustedPips;
        } else {
          losses++;
          grossLoss += Math.abs(adjustedPips);
        }

        equity += adjustedPips;
        peakEquity = Math.max(peakEquity, equity);
        const dd = peakEquity - equity;
        maxDrawdown = Math.max(maxDrawdown, dd);

        tradeResults.push({
          pair: order.currency_pair,
          pips: +adjustedPips.toFixed(1),
          originalPips: +rawPips.toFixed(1),
          frictionCost: +frictionCost.toFixed(2),
        });
      }

      const totalTrades = wins + losses;
      const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
      const expectancy = totalTrades > 0 ? totalPips / totalTrades : 0;

      results.push({
        scenario: scenario.name,
        spreadMultiplier: scenario.spreadMultiplier,
        slippageAddPips: scenario.slippageAddPips,
        rejectIfSpreadAbove: scenario.rejectIfSpreadAbove,
        totalTrades,
        rejected,
        wins,
        losses,
        winRate: +winRate.toFixed(1),
        netPips: +totalPips.toFixed(1),
        grossProfit: +grossProfit.toFixed(1),
        grossLoss: +grossLoss.toFixed(1),
        profitFactor: +profitFactor.toFixed(2),
        expectancy: +expectancy.toFixed(2),
        maxDrawdown: +maxDrawdown.toFixed(1),
        verdict: profitFactor >= 1.5 && winRate >= 45 ? "VIABLE" :
                 profitFactor >= 1.0 && winRate >= 40 ? "MARGINAL" : "UNVIABLE",
      });
    }

    // Persist summary to sovereign_memory
    const { error: memErr } = await supabase.from("sovereign_memory").upsert({
      memory_key: `friction_lab_${agentId || "all"}_${pair || "all"}`,
      memory_type: "friction_lab_result",
      payload: {
        agentId: agentId || "all",
        pair: pair || "all",
        daysBack,
        environment,
        results,
        runAt: new Date().toISOString(),
      },
      relevance_score: 0.9,
      created_by: "friction-lab",
      updated_at: new Date().toISOString(),
    }, { onConflict: "memory_key" });

    if (memErr) console.warn("[FRICTION-LAB] Memory persist error:", memErr);

    console.log(`[FRICTION-LAB] Processed ${orders.length} orders across ${activeScenarios.length} scenarios`);

    return new Response(
      JSON.stringify({
        ordersAnalyzed: orders.length,
        scenarios: results,
        filters: { agentId, pair, daysBack, environment },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[FRICTION-LAB] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
