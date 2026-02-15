// slippage-fingerprint: Execution fingerprinting middleware
// Compares requested_price vs fill_price to detect OANDA "soft rejections"
// Feeds G16_DYNAMIC_SLIPPAGE gate — auto-switches pairs to PREDATORY_LIMIT when fading >0.5 pips
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const JPY_PAIRS = ["USD_JPY","EUR_JPY","GBP_JPY","AUD_JPY","CAD_JPY","CHF_JPY","NZD_JPY"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const lookbackDays = body.lookback_days ?? 7;
    const fadeThreshold = body.fade_threshold ?? 0.5; // pips
    const minSamples = body.min_samples ?? 5;
    const injectGate = body.inject_gate !== false; // default true

    // Fetch recent filled orders with both requested_price and entry_price
    const since = new Date(Date.now() - lookbackDays * 86400000).toISOString();
    const { data: orders } = await supabase
      .from("oanda_orders")
      .select("id, currency_pair, direction, requested_price, entry_price, slippage_pips, spread_at_entry, created_at, agent_id, environment")
      .not("requested_price", "is", null)
      .not("entry_price", "is", null)
      .in("status", ["filled", "closed", "open"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    if (!orders?.length) {
      return new Response(
        JSON.stringify({ action: "none", reason: "No orders with price comparison data" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Aggregate slippage per pair
    const pairStats: Record<string, {
      samples: number;
      totalSlippage: number;
      adverseCount: number;
      favorableCount: number;
      maxAdverse: number;
      avgSpread: number;
      trades: { id: string; slippage: number; direction: string; time: string }[];
    }> = {};

    for (const o of orders) {
      const pair = o.currency_pair;
      if (!pairStats[pair]) {
        pairStats[pair] = { samples: 0, totalSlippage: 0, adverseCount: 0, favorableCount: 0, maxAdverse: 0, avgSpread: 0, trades: [] };
      }
      const s = pairStats[pair];

      const mult = JPY_PAIRS.includes(pair) ? 100 : 10000;
      // Slippage = how much worse the fill was vs requested
      // For longs: adverse = entry_price > requested_price (paid more)
      // For shorts: adverse = entry_price < requested_price (sold lower)
      const rawSlip = o.direction === "long"
        ? (o.entry_price - o.requested_price) * mult
        : (o.requested_price - o.entry_price) * mult;

      s.samples++;
      s.totalSlippage += rawSlip;
      if (rawSlip > 0.1) s.adverseCount++;
      if (rawSlip < -0.1) s.favorableCount++;
      if (rawSlip > s.maxAdverse) s.maxAdverse = rawSlip;
      s.avgSpread += o.spread_at_entry ?? 0;
      s.trades.push({
        id: o.id,
        slippage: Math.round(rawSlip * 100) / 100,
        direction: o.direction,
        time: o.created_at,
      });
    }

    // Analyze and inject gates
    const analysis: any[] = [];
    const gatesInjected: string[] = [];

    for (const [pair, s] of Object.entries(pairStats)) {
      if (s.samples < minSamples) continue;

      const avgSlippage = Math.round((s.totalSlippage / s.samples) * 100) / 100;
      const adverseRate = Math.round((s.adverseCount / s.samples) * 100);
      const avgSpread = s.samples > 0 ? Math.round((s.avgSpread / s.samples) * 100) / 100 : 0;

      const verdict = avgSlippage > fadeThreshold ? "TOXIC_EXECUTION"
        : avgSlippage > 0.2 ? "DEGRADED"
        : "CLEAN";

      const pairAnalysis = {
        pair,
        samples: s.samples,
        avgSlippagePips: avgSlippage,
        adverseRate,
        maxAdversePips: Math.round(s.maxAdverse * 100) / 100,
        avgSpread,
        verdict,
        recentTrades: s.trades.slice(0, 5),
      };

      analysis.push(pairAnalysis);

      // Inject G16 gate for toxic pairs
      if (injectGate && verdict === "TOXIC_EXECUTION") {
        const gateId = `G16_DYNAMIC_SLIPPAGE:${pair}`;

        // Check existing
        const { data: existing } = await supabase
          .from("gate_bypasses")
          .select("id")
          .eq("gate_id", gateId)
          .eq("revoked", false)
          .gte("expires_at", new Date().toISOString())
          .limit(1);

        if (!existing?.length) {
          await supabase.from("gate_bypasses").insert({
            gate_id: gateId,
            reason: `Execution Fingerprint: ${pair} avg slippage ${avgSlippage}p (${adverseRate}% adverse, ${s.samples} samples). Forcing PREDATORY_LIMIT only.`,
            expires_at: new Date(Date.now() + 12 * 3600000).toISOString(), // 12h
            pair,
            created_by: "slippage-fingerprint",
          });
          gatesInjected.push(pair);
        }
      }

      // Persist fingerprint to sovereign_memory
      await supabase.from("sovereign_memory").upsert(
        {
          memory_type: "execution_fingerprint",
          memory_key: pair,
          payload: pairAnalysis,
          relevance_score: verdict === "TOXIC_EXECUTION" ? 1.0 : 0.5,
          created_by: "slippage-fingerprint",
        },
        { onConflict: "memory_type,memory_key" }
      );
    }

    // Sort by worst slippage first
    analysis.sort((a: any, b: any) => b.avgSlippagePips - a.avgSlippagePips);

    return new Response(
      JSON.stringify({
        analysis,
        gatesInjected,
        totalOrders: orders.length,
        lookbackDays,
        fadeThreshold,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
