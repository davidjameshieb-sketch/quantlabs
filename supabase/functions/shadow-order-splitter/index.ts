// Synthetic Dark Pool Shadowing — "Ghost Splitter"
// Splits predatory entries into micro-bursts across correlated pairs to hide footprint.
// If shorting EUR_USD, simultaneously legs into EUR_GBP and EUR_JPY to avoid triggering
// the very stop-hunts being exploited.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Correlation-aware split maps: primary pair → shadow legs
// Each shadow leg has a weight (fraction of primary exposure) and hedge direction
const SHADOW_MAPS: Record<string, Array<{ pair: string; weight: number; sameDirection: boolean }>> = {
  EUR_USD: [
    { pair: "EUR_GBP", weight: 0.3, sameDirection: true },   // EUR exposure
    { pair: "EUR_JPY", weight: 0.25, sameDirection: true },   // EUR exposure
    { pair: "GBP_USD", weight: 0.15, sameDirection: false },  // USD hedge
  ],
  GBP_USD: [
    { pair: "EUR_GBP", weight: 0.3, sameDirection: false },  // GBP exposure (inverse)
    { pair: "GBP_JPY", weight: 0.25, sameDirection: true },   // GBP exposure
    { pair: "EUR_USD", weight: 0.15, sameDirection: false },  // USD hedge
  ],
  USD_JPY: [
    { pair: "EUR_JPY", weight: 0.3, sameDirection: true },    // JPY exposure
    { pair: "GBP_JPY", weight: 0.25, sameDirection: true },   // JPY exposure
    { pair: "AUD_JPY", weight: 0.15, sameDirection: true },   // JPY exposure
  ],
  AUD_USD: [
    { pair: "NZD_USD", weight: 0.35, sameDirection: true },   // commodity bloc
    { pair: "AUD_JPY", weight: 0.25, sameDirection: true },   // AUD exposure
    { pair: "EUR_AUD", weight: 0.15, sameDirection: false },  // AUD exposure (inverse)
  ],
  NZD_USD: [
    { pair: "AUD_USD", weight: 0.35, sameDirection: true },   // commodity bloc
    { pair: "AUD_NZD", weight: 0.25, sameDirection: false },  // NZD exposure (inverse)
  ],
  EUR_GBP: [
    { pair: "EUR_USD", weight: 0.3, sameDirection: true },
    { pair: "GBP_USD", weight: 0.3, sameDirection: false },
  ],
};

// Micro-burst timing: stagger entries across N milliseconds
const BURST_STAGGER_MS = 200;
const MAX_SHADOW_LEGS = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const oandaToken = Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN");
  const oandaAccount = Deno.env.get("OANDA_LIVE_ACCOUNT_ID") || Deno.env.get("OANDA_ACCOUNT_ID");
  const oandaEnv = Deno.env.get("OANDA_ENV") || "live";
  const baseUrl = oandaEnv === "live" ? "https://api-fxtrade.oanda.com" : "https://api-fxpractice.oanda.com";
  const liveEnabled = Deno.env.get("LIVE_TRADING_ENABLED") === "true";

  try {
    const body = await req.json();
    const {
      primaryPair,     // e.g. "EUR_USD"
      direction,       // "long" or "short"
      totalUnits,      // total exposure in units (e.g. 100)
      primaryWeight,   // fraction allocated to primary (default 0.4)
      signalId,        // unique signal identifier
      agentId,         // originating agent
      stopLossPips,    // SL in pips
      takeProfitPips,  // TP in pips
    } = body;

    if (!primaryPair || !direction || !totalUnits) {
      return new Response(JSON.stringify({ error: "Missing primaryPair, direction, or totalUnits" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const shadowLegs = SHADOW_MAPS[primaryPair] || [];
    const effectivePrimaryWeight = primaryWeight || (shadowLegs.length > 0 ? 0.4 : 1.0);

    // Calculate unit allocation
    const primaryUnits = Math.round(totalUnits * effectivePrimaryWeight);
    const remainingUnits = totalUnits - primaryUnits;

    const activeShadows = shadowLegs.slice(0, MAX_SHADOW_LEGS);
    const totalShadowWeight = activeShadows.reduce((s, l) => s + l.weight, 0);

    const orderPlan: Array<{
      pair: string;
      direction: string;
      units: number;
      role: "PRIMARY" | "SHADOW";
      weight: number;
      burstIndex: number;
    }> = [];

    // Primary leg (enters first)
    orderPlan.push({
      pair: primaryPair,
      direction,
      units: primaryUnits,
      role: "PRIMARY",
      weight: effectivePrimaryWeight,
      burstIndex: 0,
    });

    // Shadow legs (staggered)
    for (let i = 0; i < activeShadows.length; i++) {
      const shadow = activeShadows[i];
      const shadowUnits = Math.max(1, Math.round(remainingUnits * (shadow.weight / totalShadowWeight)));
      const shadowDirection = shadow.sameDirection ? direction : (direction === "long" ? "short" : "long");

      orderPlan.push({
        pair: shadow.pair,
        direction: shadowDirection,
        units: shadowUnits,
        role: "SHADOW",
        weight: shadow.weight,
        burstIndex: i + 1,
      });
    }

    // Execute micro-bursts (or simulate if not live)
    const executionResults: Array<{
      pair: string;
      direction: string;
      units: number;
      role: string;
      status: string;
      orderId?: string;
      error?: string;
    }> = [];

    for (const leg of orderPlan) {
      const signedUnits = leg.direction === "long" ? leg.units : -leg.units;

      if (!liveEnabled) {
        // Simulation mode — log intent
        executionResults.push({
          pair: leg.pair, direction: leg.direction, units: leg.units,
          role: leg.role, status: "SIMULATED",
        });
        continue;
      }

      // Stagger: wait before each shadow leg
      if (leg.burstIndex > 0) {
        await new Promise(r => setTimeout(r, BURST_STAGGER_MS * leg.burstIndex));
      }

      try {
        // Build OANDA order
        const isJpy = leg.pair.includes("JPY");
        const mult = isJpy ? 0.01 : 0.0001;
        const orderBody: Record<string, any> = {
          order: {
            type: "MARKET",
            instrument: leg.pair,
            units: String(signedUnits),
            timeInForce: "FOK",
            positionFill: "DEFAULT",
          },
        };

        // Add SL/TP to primary only
        if (leg.role === "PRIMARY" && stopLossPips) {
          orderBody.order.stopLossOnFill = { distance: String(stopLossPips * mult) };
        }
        if (leg.role === "PRIMARY" && takeProfitPips) {
          orderBody.order.takeProfitOnFill = { distance: String(takeProfitPips * mult) };
        }

        const oRes = await fetch(`${baseUrl}/v3/accounts/${oandaAccount}/orders`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${oandaToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(orderBody),
        });

        const oData = await oRes.json();
        const orderId = oData.orderFillTransaction?.id || oData.orderCreateTransaction?.id || null;

        executionResults.push({
          pair: leg.pair, direction: leg.direction, units: leg.units,
          role: leg.role, status: oRes.ok ? "FILLED" : "REJECTED",
          orderId: orderId || undefined,
          error: oRes.ok ? undefined : JSON.stringify(oData).slice(0, 200),
        });
      } catch (err) {
        executionResults.push({
          pair: leg.pair, direction: leg.direction, units: leg.units,
          role: leg.role, status: "ERROR", error: String(err).slice(0, 200),
        });
      }
    }

    // Persist the shadow execution to sovereign_memory for audit trail
    const payload = {
      signalId: signalId || `shadow-${Date.now()}`,
      agentId: agentId || "shadow-splitter",
      primaryPair,
      direction,
      totalUnits,
      primaryUnits,
      shadowLegs: activeShadows.length,
      executionResults,
      allFilled: executionResults.every(r => r.status === "FILLED" || r.status === "SIMULATED"),
      executedAt: new Date().toISOString(),
    };

    await supabase.from("sovereign_memory").upsert({
      memory_type: "shadow_execution",
      memory_key: `split_${primaryPair}_${Date.now()}`,
      payload,
      relevance_score: 0.8,
      created_by: "shadow-order-splitter",
    }, { onConflict: "memory_type,memory_key" });

    // Also persist to gate_bypasses for the sovereign loop to see
    await supabase.from("gate_bypasses").insert({
      gate_id: `SHADOW_SPLIT:${primaryPair}:${signalId || Date.now()}`,
      reason: JSON.stringify({
        type: "SHADOW_SPLIT_ACTIVE",
        primary: { pair: primaryPair, direction, units: primaryUnits },
        shadows: executionResults.filter(r => r.role === "SHADOW"),
        totalExposure: totalUnits,
      }),
      expires_at: new Date(Date.now() + 4 * 60 * 60_000).toISOString(), // 4h TTL
      pair: primaryPair,
      created_by: "shadow-order-splitter",
    });

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
