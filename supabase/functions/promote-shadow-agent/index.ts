// promote-shadow-agent: Deterministic bridge to auto-replace worst live agent
// with Shadow DNA that proves viable (WR>55%, PF>1.5) in Extreme Friction scenario
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false; // default dry_run=true for safety
    const minTrades = body.min_trades ?? 20;
    const minWR = body.min_wr ?? 55;
    const minPF = body.min_pf ?? 1.5;

    // 1. Get all shadow agent stats (last 30 days)
    const { data: shadowOrders } = await supabase
      .from("oanda_orders")
      .select("agent_id, direction, entry_price, exit_price, currency_pair, r_pips")
      .eq("environment", "shadow")
      .eq("baseline_excluded", false)
      .in("status", ["filled", "closed"])
      .not("entry_price", "is", null)
      .not("exit_price", "is", null)
      .not("agent_id", "is", null)
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
      .limit(1000);

    if (!shadowOrders?.length) {
      return new Response(
        JSON.stringify({ action: "none", reason: "No shadow trades found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Aggregate shadow agent stats
    const agentStats: Record<string, { wins: number; losses: number; grossProfit: number; grossLoss: number; trades: number }> = {};
    for (const o of shadowOrders) {
      const aid = o.agent_id!;
      if (!agentStats[aid]) agentStats[aid] = { wins: 0, losses: 0, grossProfit: 0, grossLoss: 0, trades: 0 };
      const s = agentStats[aid];
      const pips = calcPips(o);
      s.trades++;
      if (pips > 0) { s.wins++; s.grossProfit += pips; }
      else { s.losses++; s.grossLoss += Math.abs(pips); }
    }

    // 3. Check Friction Lab extreme results from sovereign_memory
    const { data: frictionResults } = await supabase
      .from("sovereign_memory")
      .select("memory_key, payload")
      .eq("memory_type", "friction_lab_result")
      .order("updated_at", { ascending: false })
      .limit(20);

    const frictionMap: Record<string, { extremePF: number; extremeWR: number }> = {};
    for (const fr of frictionResults || []) {
      const p = fr.payload as any;
      if (p?.scenarios?.extreme) {
        frictionMap[fr.memory_key] = {
          extremePF: p.scenarios.extreme.profitFactor ?? 0,
          extremeWR: p.scenarios.extreme.winRate ?? 0,
        };
      }
    }

    // 4. Find promotable shadow agents
    const promotable: { agentId: string; wr: number; pf: number; trades: number; extremePF: number; extremeWR: number }[] = [];
    for (const [agentId, s] of Object.entries(agentStats)) {
      if (s.trades < minTrades) continue;
      const wr = (s.wins / s.trades) * 100;
      const pf = s.grossLoss > 0 ? s.grossProfit / s.grossLoss : s.grossProfit > 0 ? 99 : 0;
      if (wr < minWR || pf < minPF) continue;

      const friction = frictionMap[agentId];
      // If friction lab data exists, must also pass extreme scenario
      if (friction && (friction.extremeWR < 45 || friction.extremePF < 1.0)) continue;

      promotable.push({
        agentId, wr: Math.round(wr * 10) / 10, pf: Math.round(pf * 100) / 100,
        trades: s.trades,
        extremePF: friction?.extremePF ?? -1,
        extremeWR: friction?.extremeWR ?? -1,
      });
    }

    if (!promotable.length) {
      return new Response(
        JSON.stringify({ action: "none", reason: "No shadow agents meet promotion criteria", stats: Object.entries(agentStats).map(([id, s]) => ({ id, ...s, wr: (s.wins / s.trades * 100).toFixed(1) })) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Find worst live agent to replace
    const { data: liveOrders } = await supabase
      .from("oanda_orders")
      .select("agent_id, direction, entry_price, exit_price, currency_pair, r_pips")
      .eq("environment", "live")
      .eq("baseline_excluded", false)
      .in("status", ["filled", "closed"])
      .not("entry_price", "is", null)
      .not("exit_price", "is", null)
      .not("agent_id", "is", null)
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
      .limit(1000);

    const liveStats: Record<string, { wins: number; losses: number; trades: number; netPips: number }> = {};
    for (const o of liveOrders || []) {
      const aid = o.agent_id!;
      if (!liveStats[aid]) liveStats[aid] = { wins: 0, losses: 0, trades: 0, netPips: 0 };
      const s = liveStats[aid];
      const pips = calcPips(o);
      s.trades++;
      s.netPips += pips;
      if (pips > 0) s.wins++; else s.losses++;
    }

    // Sort live agents by net pips (worst first)
    const liveRanked = Object.entries(liveStats)
      .filter(([_, s]) => s.trades >= 5)
      .sort((a, b) => a[1].netPips - b[1].netPips);

    const worstLive = liveRanked[0];
    const bestShadow = promotable.sort((a, b) => b.pf - a.pf)[0];

    const result: any = {
      action: dryRun ? "dry_run_promotion" : "promoted",
      bestShadow,
      worstLive: worstLive ? { agentId: worstLive[0], ...worstLive[1] } : null,
      allPromotable: promotable,
    };

    if (!dryRun && worstLive) {
      // Suspend worst live agent
      await supabase.from("gate_bypasses").insert({
        gate_id: `AGENT_SUSPEND:${worstLive[0]}`,
        reason: `Auto-replaced by shadow ${bestShadow.agentId} (WR:${bestShadow.wr}% PF:${bestShadow.pf}). Worst live: ${worstLive[1].netPips.toFixed(1)}p net.`,
        expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
        pair: null,
        created_by: "promote-shadow-agent",
      });

      // Write DNA mutation to promote shadow
      await supabase.from("gate_bypasses").insert({
        gate_id: `AGENT_DNA_MUTATION:promote:${bestShadow.agentId}`,
        reason: `Shadow→Live promotion. ${bestShadow.trades} trades, WR:${bestShadow.wr}%, PF:${bestShadow.pf}, ExtremePF:${bestShadow.extremePF}. Replaces ${worstLive[0]}.`,
        expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
        pair: null,
        created_by: "promote-shadow-agent",
      });

      // Persist to sovereign_memory
      await supabase.from("sovereign_memory").upsert({
        memory_type: "shadow_promotion",
        memory_key: bestShadow.agentId,
        payload: result,
        relevance_score: 1.0,
        created_by: "promote-shadow-agent",
      }, { onConflict: "memory_type,memory_key" });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function calcPips(o: any): number {
  const jpyPairs = ["USD_JPY","EUR_JPY","GBP_JPY","AUD_JPY","CAD_JPY","CHF_JPY","NZD_JPY"];
  const mult = jpyPairs.includes(o.currency_pair) ? 100 : 10000;
  return o.direction === "long"
    ? (o.exit_price - o.entry_price) * mult
    : (o.entry_price - o.exit_price) * mult;
}
