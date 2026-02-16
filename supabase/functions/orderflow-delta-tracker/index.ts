// L0 Deterministic Order-Flow Delta Tracker v2
// Now uses OFI synthetic order book from ripple-stream tick data
// instead of OANDA's restricted order book API.
// Reads the tick-classified buy/sell pressure from sovereign_memory
// and detects velocity changes in flow imbalance for Liquidity Vacuum arming.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Flow velocity thresholds
const OFI_VELOCITY_THRESHOLD = 0.15; // OFI ratio change between snapshots
const VPIN_ALERT_THRESHOLD = 0.65;   // VPIN approaching toxic
const MIN_TICKS_FOR_SIGNAL = 30;     // minimum ticks analyzed for valid signal
const VACUUM_ARM_DURATION_MIN = 15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // 1. Fetch latest OFI synthetic book from ripple-stream
    const { data: ofiMemory } = await supabase
      .from("sovereign_memory")
      .select("payload, updated_at")
      .eq("memory_type", "ofi_synthetic_book")
      .eq("memory_key", "latest_snapshot")
      .maybeSingle();

    if (!ofiMemory?.payload?.pairs) {
      return new Response(JSON.stringify({
        status: "waiting",
        message: "No OFI data yet — ripple-stream needs to run first",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const currentOfi = ofiMemory.payload.pairs as Record<string, {
      ofiRatio: number;
      vpin: number;
      buyPct: number;
      sellPct: number;
      bias: string;
      ticksAnalyzed: number;
      syntheticDepth: { price: number; buys: number; sells: number; net: number }[];
    }>;
    const snapshotAge = Date.now() - new Date(ofiMemory.updated_at).getTime();

    // 2. Fetch previous OFI snapshot for velocity computation
    const { data: prevMemory } = await supabase
      .from("sovereign_memory")
      .select("payload")
      .eq("memory_type", "orderflow_delta")
      .eq("memory_key", "previous_ofi_snapshot")
      .maybeSingle();

    const prevOfi: Record<string, { ofiRatio: number; vpin: number; bias: string }> =
      prevMemory?.payload?.snapshots || {};

    // 3. Compute OFI velocity (rate of change between snapshots)
    const deltas: Array<{
      pair: string;
      prevOfi: number;
      currOfi: number;
      ofiVelocity: number;
      vpin: number;
      bias: string;
      buyPct: number;
      sellPct: number;
      depthImbalance: number;
    }> = [];

    const vacuumTargets: Array<{
      pair: string;
      direction: string;
      ofiVelocity: number;
      vpin: number;
      bias: string;
      depthImbalance: number;
    }> = [];

    for (const [pair, data] of Object.entries(currentOfi)) {
      if (data.ticksAnalyzed < MIN_TICKS_FOR_SIGNAL) continue;

      const prev = prevOfi[pair];
      const prevRatio = prev?.ofiRatio || 0;
      const ofiVelocity = data.ofiRatio - prevRatio;

      // Compute synthetic depth imbalance from top levels
      let depthBuys = 0, depthSells = 0;
      for (const level of (data.syntheticDepth || [])) {
        depthBuys += level.buys;
        depthSells += level.sells;
      }
      const depthTotal = depthBuys + depthSells;
      const depthImbalance = depthTotal > 0 ? (depthBuys - depthSells) / depthTotal : 0;

      deltas.push({
        pair,
        prevOfi: prevRatio,
        currOfi: data.ofiRatio,
        ofiVelocity: Math.round(ofiVelocity * 1000) / 1000,
        vpin: data.vpin,
        bias: data.bias,
        buyPct: data.buyPct,
        sellPct: data.sellPct,
        depthImbalance: Math.round(depthImbalance * 1000) / 1000,
      });

      // Arm vacuum if OFI velocity exceeds threshold (strong directional shift)
      if (Math.abs(ofiVelocity) >= OFI_VELOCITY_THRESHOLD && data.vpin < VPIN_ALERT_THRESHOLD) {
        const direction = ofiVelocity > 0 ? "long" : "short";
        vacuumTargets.push({
          pair: pair.replace("/", "_"),
          direction,
          ofiVelocity: Math.round(ofiVelocity * 1000) / 1000,
          vpin: data.vpin,
          bias: data.bias,
          depthImbalance: Math.round(depthImbalance * 1000) / 1000,
        });
      }
    }

    // 4. Save current as previous for next cycle
    const currentSnapshot: Record<string, { ofiRatio: number; vpin: number; bias: string }> = {};
    for (const [pair, data] of Object.entries(currentOfi)) {
      currentSnapshot[pair] = { ofiRatio: data.ofiRatio, vpin: data.vpin, bias: data.bias };
    }

    await supabase.from("sovereign_memory").upsert({
      memory_type: "orderflow_delta",
      memory_key: "previous_ofi_snapshot",
      payload: {
        snapshots: currentSnapshot,
        timestamp: new Date().toISOString(),
        pairsTracked: Object.keys(currentSnapshot).length,
      },
      relevance_score: 0.3,
      created_by: "orderflow-delta-tracker-v2",
    }, { onConflict: "memory_type,memory_key" });

    // 5. Auto-arm Liquidity Vacuum triggers
    let vacuumsArmed = 0;
    for (const target of vacuumTargets) {
      // Check for existing active vacuum
      const { data: activeVacuums } = await supabase
        .from("gate_bypasses")
        .select("id")
        .like("gate_id", `LIQUIDITY_VACUUM:${target.pair}%`)
        .eq("revoked", false)
        .gte("expires_at", new Date().toISOString())
        .limit(1);

      if (activeVacuums?.length) continue;

      await supabase.from("gate_bypasses").insert({
        gate_id: `LIQUIDITY_VACUUM:${target.pair}:${Date.now()}`,
        reason: JSON.stringify({
          type: "OFI_VELOCITY_VACUUM",
          pair: target.pair,
          direction: target.direction,
          ofiVelocity: target.ofiVelocity,
          vpin: target.vpin,
          bias: target.bias,
          depthImbalance: target.depthImbalance,
          armedAt: new Date().toISOString(),
        }),
        expires_at: new Date(Date.now() + VACUUM_ARM_DURATION_MIN * 60_000).toISOString(),
        pair: target.pair,
        created_by: "orderflow-delta-tracker-v2",
      });
      vacuumsArmed++;
    }

    // 6. Persist analysis for dashboard
    const payload = {
      source: "ofi_synthetic_book",
      snapshotAgeMs: snapshotAge,
      deltasDetected: deltas.length,
      topDeltas: deltas.sort((a, b) => Math.abs(b.ofiVelocity) - Math.abs(a.ofiVelocity)).slice(0, 15),
      vacuumTargets: vacuumTargets.length,
      vacuumsArmed,
      pairsAnalyzed: Object.keys(currentOfi).length,
      vpinAlerts: deltas.filter(d => d.vpin >= VPIN_ALERT_THRESHOLD).map(d => ({ pair: d.pair, vpin: d.vpin })),
      scanTime: new Date().toISOString(),
    };

    await supabase.from("sovereign_memory").upsert({
      memory_type: "orderflow_delta",
      memory_key: "latest_analysis",
      payload,
      relevance_score: vacuumsArmed > 0 ? 1.0 : deltas.length > 3 ? 0.7 : 0.3,
      created_by: "orderflow-delta-tracker-v2",
    }, { onConflict: "memory_type,memory_key" });

    console.log(`[OFI-DELTA] ${Object.keys(currentOfi).length} pairs | ${deltas.length} deltas | ${vacuumsArmed} vacuums armed | VPIN alerts: ${deltas.filter(d => d.vpin >= VPIN_ALERT_THRESHOLD).length}`);

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
