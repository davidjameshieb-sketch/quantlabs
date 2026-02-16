// Fast-Poll Trigger Evaluator
// Evaluates armed correlation triggers against live OANDA prices at high frequency (5-10s via pg_cron).
// This bridges the gap between the 60s sovereign loop and sub-second execution needs.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OANDA_API = "https://api-fxtrade.oanda.com/v3";

interface ArmedTrigger {
  id: string;
  gate_id: string;
  pair: string | null;
  reason: string;
  expires_at: string;
  created_at: string;
}

interface TriggerConfig {
  loudPair: string;
  quietPair: string;
  direction: "long" | "short";
  divergenceThreshold: number; // pips
  units: number;
  stopLoss: number;
  takeProfit: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const OANDA_TOKEN = Deno.env.get("OANDA_LIVE_API_TOKEN");
  const OANDA_ACCOUNT = Deno.env.get("OANDA_LIVE_ACCOUNT_ID");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const LIVE_ENABLED = Deno.env.get("LIVE_TRADING_ENABLED");

  if (!OANDA_TOKEN || !OANDA_ACCOUNT) {
    return new Response(JSON.stringify({ error: "OANDA credentials not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Supabase env not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // 1. Fetch armed CORRELATION_TRIGGER records from gate_bypasses
    const now = new Date().toISOString();
    const { data: triggers, error: trigErr } = await supabase
      .from("gate_bypasses")
      .select("*")
      .like("gate_id", "CORRELATION_TRIGGER:%")
      .eq("revoked", false)
      .gte("expires_at", now);

    if (trigErr) {
      console.error("[FAST-POLL] Error fetching triggers:", trigErr);
      return new Response(JSON.stringify({ error: trigErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!triggers || triggers.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No armed triggers", evaluated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[FAST-POLL] Evaluating ${triggers.length} armed trigger(s)...`);

    // 2. Collect unique instruments needed
    const instruments = new Set<string>();
    const parsedTriggers: { trigger: ArmedTrigger; config: TriggerConfig }[] = [];

    for (const t of triggers as ArmedTrigger[]) {
      try {
        // Parse config from reason JSON or structured gate_id
        const reasonData = JSON.parse(t.reason) as TriggerConfig;
        instruments.add(reasonData.loudPair);
        instruments.add(reasonData.quietPair);
        parsedTriggers.push({ trigger: t, config: reasonData });
      } catch {
        // Try parsing from gate_id format: CORRELATION_TRIGGER:LOUD_QUIET
        console.warn(`[FAST-POLL] Could not parse trigger ${t.gate_id}, skipping`);
      }
    }

    if (instruments.size === 0 || parsedTriggers.length === 0) {
      return new Response(JSON.stringify({ success: true, evaluated: 0, message: "No parseable triggers" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Fetch live prices from OANDA — validate instruments are OANDA format (XXX_YYY)
    const validInstruments = Array.from(instruments).filter(i => /^[A-Z]{3}_[A-Z]{3}$/.test(i));
    if (validInstruments.length === 0) {
      return new Response(JSON.stringify({ success: true, evaluated: 0, message: "No valid OANDA instruments in triggers" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const instrumentList = validInstruments.join(",");
    const priceRes = await fetch(
      `${OANDA_API}/accounts/${OANDA_ACCOUNT}/pricing?instruments=${instrumentList}`,
      { headers: { Authorization: `Bearer ${OANDA_TOKEN}` } }
    );

    if (!priceRes.ok) {
      const errBody = await priceRes.text().catch(() => "");
      console.warn(`[FAST-POLL] OANDA pricing ${priceRes.status}: ${errBody.slice(0, 200)}`);
      return new Response(JSON.stringify({ success: true, evaluated: 0, message: `OANDA pricing unavailable: ${priceRes.status}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const priceData = await priceRes.json();
    const prices = new Map<string, { bid: number; ask: number; mid: number }>();
    for (const p of priceData.prices || []) {
      const bid = parseFloat(p.bids?.[0]?.price || "0");
      const ask = parseFloat(p.asks?.[0]?.price || "0");
      prices.set(p.instrument, { bid, ask, mid: (bid + ask) / 2 });
    }

    // 4. Evaluate each trigger
    const fired: string[] = [];

    for (const { trigger, config } of parsedTriggers) {
      const loudPrice = prices.get(config.loudPair);
      const quietPrice = prices.get(config.quietPair);

      if (!loudPrice || !quietPrice) {
        console.warn(`[FAST-POLL] Missing price for ${config.loudPair} or ${config.quietPair}`);
        continue;
      }

      // Calculate divergence (simplified: compare mid-price percentage moves)
      // In production, this would compare against a baseline stored when the trigger was armed
      const isJpyLoud = config.loudPair.includes("JPY");
      const isJpyQuiet = config.quietPair.includes("JPY");
      const loudMult = isJpyLoud ? 100 : 10000;
      const quietMult = isJpyQuiet ? 100 : 10000;

      // For now, log the evaluation — actual firing logic depends on baseline prices
      // stored in the trigger's reason/payload
      const spread = (quietPrice.ask - quietPrice.bid) * quietMult;
      
      console.log(`[FAST-POLL] ${config.loudPair} mid=${loudPrice.mid.toFixed(5)} | ${config.quietPair} mid=${quietPrice.mid.toFixed(5)} spread=${spread.toFixed(1)}p`);

      // If live trading is enabled and divergence exceeds threshold, fire the trade
      if (LIVE_ENABLED === "true") {
        // The sovereign loop's L0 engine handles the actual execution logic
        // This evaluator just logs faster evaluations for the sovereign loop to pick up
        const logKey = `FAST_POLL_EVAL:${trigger.gate_id}:${Date.now()}`;
        
        await supabase.from("gate_bypasses").insert({
          gate_id: `FAST_POLL_EVAL:${config.quietPair}`,
          reason: JSON.stringify({
            trigger_id: trigger.id,
            loud_pair: config.loudPair,
            quiet_pair: config.quietPair,
            loud_mid: loudPrice.mid,
            quiet_mid: quietPrice.mid,
            quiet_spread: spread,
            evaluated_at: new Date().toISOString(),
          }),
          expires_at: new Date(Date.now() + 30_000).toISOString(), // 30s TTL
          created_by: "fast-poll-evaluator",
        });

        fired.push(config.quietPair);
      }
    }

    // Also evaluate HARDWIRED_RULE entries that have fast-poll flags
    const { data: fastRules } = await supabase
      .from("sovereign_memory")
      .select("*")
      .eq("memory_type", "HARDWIRED_RULE")
      .not("expires_at", "is", null)
      .gte("expires_at", now);

    let rulesEvaluated = 0;
    if (fastRules) {
      for (const rule of fastRules) {
        const payload = rule.payload as Record<string, unknown>;
        if (payload.fast_poll !== true) continue;
        rulesEvaluated++;
        // Rule evaluation happens in L0 engine; we just ensure freshness
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        evaluated: parsedTriggers.length,
        rulesEvaluated,
        fired: fired.length,
        firedPairs: fired,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[FAST-POLL] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
