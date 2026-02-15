// L0 Deterministic Order-Flow Delta Tracker
// Computes RATE OF CHANGE in OANDA order book stop clusters.
// When stop buildup exceeds threshold (e.g. 50M equivalent in <5min at a round number),
// auto-arms a "Liquidity Vacuum" trigger for predatory LIMIT order placement.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAIRS = [
  "EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD",
  "NZD_USD", "EUR_GBP", "EUR_JPY", "GBP_JPY", "AUD_JPY", "USD_CHF",
];

// Stop buildup velocity thresholds (percentage-point change per snapshot)
// If a single price bucket gains this much stop density between snapshots, it's "loading up"
const BUILDUP_VELOCITY_THRESHOLD = 0.8; // 0.8 pct-point increase = massive stop accumulation
const ROUND_NUMBER_PROXIMITY_PIPS = 5;  // within 5 pips of a round number
const MIN_CLUSTERS_FOR_VACUUM = 2;      // need 2+ loading clusters to arm vacuum
const VACUUM_ARM_DURATION_MIN = 15;     // armed trigger lasts 15 minutes

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const oandaToken = Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN");
  const oandaEnv = Deno.env.get("OANDA_ENV") || "live";
  const baseUrl = oandaEnv === "live" ? "https://api-fxtrade.oanda.com" : "https://api-fxpractice.oanda.com";

  try {
    // 1. Fetch previous snapshot from sovereign_memory
    const { data: prevMemory } = await supabase
      .from("sovereign_memory")
      .select("payload")
      .eq("memory_type", "orderflow_delta")
      .eq("memory_key", "previous_snapshot")
      .limit(1)
      .maybeSingle();

    const prevSnapshot: Record<string, Record<string, { longPct: number; shortPct: number }>> =
      prevMemory?.payload?.snapshots || {};
    const prevTimestamp = prevMemory?.payload?.timestamp || null;

    // 2. Fetch current order books for all pairs
    const currentSnapshot: Record<string, Record<string, { longPct: number; shortPct: number }>> = {};
    const deltas: Array<{
      pair: string;
      price: number;
      side: string;
      prevPct: number;
      currPct: number;
      deltaPct: number;
      isRoundNumber: boolean;
      pipsDist: number;
    }> = [];
    const vacuumTargets: Array<{
      pair: string;
      clusterPrice: number;
      side: string;
      buildupVelocity: number;
      isRoundNumber: boolean;
      currentPrice: number;
    }> = [];

    for (const pair of PAIRS) {
      try {
        const res = await fetch(`${baseUrl}/v3/instruments/${pair}/orderBook`, {
          headers: { Authorization: `Bearer ${oandaToken}` },
        });
        if (!res.ok) continue;
        const data = await res.json();
        const ob = data.orderBook;
        if (!ob?.buckets) continue;

        const currentPrice = parseFloat(ob.price);
        const isJpy = pair.includes("JPY");
        const mult = isJpy ? 100 : 10000;
        const roundIncrement = isJpy ? 1.0 : 0.01; // 100 pips for JPY, 100 pips for others

        const pairBuckets: Record<string, { longPct: number; shortPct: number }> = {};

        for (const b of ob.buckets) {
          const price = parseFloat(b.price);
          const longPct = parseFloat(b.longCountPercent);
          const shortPct = parseFloat(b.shortCountPercent);
          const pipsDist = Math.abs(price - currentPrice) * mult;

          // Only track within 80 pips
          if (pipsDist > 80) continue;

          const key = b.price;
          pairBuckets[key] = { longPct, shortPct };

          // Check if this is a round number (e.g., 1.0800, 1.0900, 150.00, 151.00)
          const roundRemainder = isJpy
            ? Math.abs(price % 1.0)
            : Math.abs((price * 100) % 1.0);
          const isRoundNumber = roundRemainder < 0.05 || roundRemainder > 0.95;

          // Compare with previous snapshot
          const prev = prevSnapshot[pair]?.[key];
          if (prev) {
            const longDelta = longPct - prev.longPct;
            const shortDelta = shortPct - prev.shortPct;

            // Track significant deltas (stop buildup)
            if (longDelta > BUILDUP_VELOCITY_THRESHOLD * 0.3) {
              deltas.push({
                pair, price, side: "LONG_STOPS", prevPct: prev.longPct,
                currPct: longPct, deltaPct: Math.round(longDelta * 100) / 100,
                isRoundNumber, pipsDist: Math.round(pipsDist * 10) / 10,
              });
            }
            if (shortDelta > BUILDUP_VELOCITY_THRESHOLD * 0.3) {
              deltas.push({
                pair, price, side: "SHORT_STOPS", prevPct: prev.shortPct,
                currPct: shortPct, deltaPct: Math.round(shortDelta * 100) / 100,
                isRoundNumber, pipsDist: Math.round(pipsDist * 10) / 10,
              });
            }

            // Arm vacuum if velocity exceeds threshold at/near round numbers
            const maxDelta = Math.max(longDelta, shortDelta);
            const dominantSide = longDelta > shortDelta ? "LONG_STOPS" : "SHORT_STOPS";
            if (maxDelta >= BUILDUP_VELOCITY_THRESHOLD && (isRoundNumber || pipsDist < ROUND_NUMBER_PROXIMITY_PIPS)) {
              vacuumTargets.push({
                pair,
                clusterPrice: price,
                side: dominantSide,
                buildupVelocity: Math.round(maxDelta * 100) / 100,
                isRoundNumber,
                currentPrice,
              });
            }
          }
        }

        currentSnapshot[pair] = pairBuckets;
      } catch { /* skip pair */ }
    }

    // 3. Persist current snapshot as next cycle's "previous"
    await supabase.from("sovereign_memory").upsert({
      memory_type: "orderflow_delta",
      memory_key: "previous_snapshot",
      payload: {
        snapshots: currentSnapshot,
        timestamp: new Date().toISOString(),
        pairsScanned: Object.keys(currentSnapshot).length,
      },
      relevance_score: 0.3,
      created_by: "orderflow-delta-tracker",
    }, { onConflict: "memory_type,memory_key" });

    // 4. Auto-arm Liquidity Vacuum triggers if conditions met
    let vacuumsArmed = 0;
    const groupedByPair = new Map<string, typeof vacuumTargets>();
    for (const vt of vacuumTargets) {
      const existing = groupedByPair.get(vt.pair) || [];
      existing.push(vt);
      groupedByPair.set(vt.pair, existing);
    }

    for (const [pair, targets] of groupedByPair) {
      if (targets.length < MIN_CLUSTERS_FOR_VACUUM) continue;

      // Check no duplicate active vacuum for this pair
      const { data: activeVacuums } = await supabase
        .from("gate_bypasses")
        .select("id")
        .like("gate_id", `LIQUIDITY_VACUUM:${pair}%`)
        .eq("revoked", false)
        .gte("expires_at", new Date().toISOString())
        .limit(1);

      if (activeVacuums?.length) continue;

      const topTarget = targets.sort((a, b) => b.buildupVelocity - a.buildupVelocity)[0];
      const vacuumDirection = topTarget.side === "LONG_STOPS" ? "short" : "long";

      await supabase.from("gate_bypasses").insert({
        gate_id: `LIQUIDITY_VACUUM:${pair}:${Date.now()}`,
        reason: JSON.stringify({
          type: "AUTO_ARMED_VACUUM",
          pair,
          direction: vacuumDirection,
          clusterPrice: topTarget.clusterPrice,
          buildupVelocity: topTarget.buildupVelocity,
          clustersDetected: targets.length,
          isRoundNumber: topTarget.isRoundNumber,
          currentPrice: topTarget.currentPrice,
          armedAt: new Date().toISOString(),
        }),
        expires_at: new Date(Date.now() + VACUUM_ARM_DURATION_MIN * 60_000).toISOString(),
        pair,
        created_by: "orderflow-delta-tracker",
      });
      vacuumsArmed++;
    }

    // 5. Persist delta analysis to sovereign_memory for dashboard visibility
    const payload = {
      deltasDetected: deltas.length,
      topDeltas: deltas.sort((a, b) => b.deltaPct - a.deltaPct).slice(0, 15),
      vacuumTargets: vacuumTargets.length,
      vacuumsArmed,
      pairsScanned: Object.keys(currentSnapshot).length,
      hadPreviousSnapshot: !!prevTimestamp,
      previousSnapshotAge: prevTimestamp
        ? Math.round((Date.now() - new Date(prevTimestamp).getTime()) / 1000)
        : null,
      scanTime: new Date().toISOString(),
    };

    await supabase.from("sovereign_memory").upsert({
      memory_type: "orderflow_delta",
      memory_key: "latest_analysis",
      payload,
      relevance_score: vacuumsArmed > 0 ? 1.0 : deltas.length > 5 ? 0.7 : 0.3,
      created_by: "orderflow-delta-tracker",
    }, { onConflict: "memory_type,memory_key" });

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
