// One-shot test trade: open then close a 100-unit EUR/USD on OANDA practice
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const OANDA_TOKEN = Deno.env.get("OANDA_API_TOKEN");
  const OANDA_ACCOUNT = Deno.env.get("OANDA_ACCOUNT_ID");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!OANDA_TOKEN || !OANDA_ACCOUNT) {
    return new Response(JSON.stringify({ error: "Missing OANDA_API_TOKEN or OANDA_ACCOUNT_ID" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const BASE = "https://api-fxpractice.oanda.com/v3";
  const oandaHeaders = {
    Authorization: `Bearer ${OANDA_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const log: string[] = [];

  try {
    // ── 1. Open 100-unit EUR_USD LONG ──
    log.push("Opening test trade: LONG 100 EUR_USD on practice account...");
    const openRes = await fetch(`${BASE}/accounts/${OANDA_ACCOUNT}/orders`, {
      method: "POST",
      headers: oandaHeaders,
      body: JSON.stringify({
        order: {
          type: "MARKET",
          instrument: "EUR_USD",
          units: "100",
          timeInForce: "FOK",
        },
      }),
    });

    const openData = await openRes.json();
    log.push(`Open response HTTP ${openRes.status}: ${JSON.stringify(openData).slice(0, 300)}`);

    if (!openRes.ok) {
      const reason = openData.orderRejectTransaction?.reason || openData.errorMessage || "unknown";
      return new Response(JSON.stringify({ success: false, step: "open", reason, log }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tradeId = openData.orderFillTransaction?.tradeOpened?.tradeID
      || openData.relatedTransactionIDs?.[openData.relatedTransactionIDs.length - 1];
    const fillPrice = openData.orderFillTransaction?.price || null;
    log.push(`✅ Trade opened! OANDA Trade ID: ${tradeId} | Fill: ${fillPrice}`);

    // ── 2. Record in DB ──
    const { data: insertData, error: insertError } = await supabase.from("oanda_orders").insert([{
      signal_id: `test-trade-${Date.now()}`,
      currency_pair: "EUR_USD",
      direction: "long",
      units: 100,
      entry_price: fillPrice ? parseFloat(fillPrice) : null,
      oanda_trade_id: String(tradeId),
      status: "filled",
      environment: "practice",
      direction_engine: "manual-test",
      user_id: "00000000-0000-0000-0000-000000000000",
    }]).select().single();
    if (insertError) log.push(`⚠️ DB insert warning: ${insertError.message}`);
    else log.push(`✅ Recorded in DB: ${insertData?.id}`);

    // ── 3. Wait 2 seconds then close ──
    log.push("Waiting 2 seconds before closing...");
    await new Promise(r => setTimeout(r, 2000));

    // ── 4. Close the trade ──
    log.push(`Closing trade ${tradeId}...`);
    const closeRes = await fetch(`${BASE}/accounts/${OANDA_ACCOUNT}/trades/${tradeId}/close`, {
      method: "PUT",
      headers: oandaHeaders,
      body: JSON.stringify({ units: "ALL" }),
    });
    const closeData = await closeRes.json();
    log.push(`Close response HTTP ${closeRes.status}: ${JSON.stringify(closeData).slice(0, 300)}`);

    if (!closeRes.ok) {
      return new Response(JSON.stringify({ success: false, step: "close", data: closeData, log }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const closePrice = closeData.orderFillTransaction?.price || null;
    const realizedPL = closeData.orderFillTransaction?.tradesClosed?.[0]?.realizedPL || null;
    log.push(`✅ Trade closed! Exit: ${closePrice} | Realized P&L: ${realizedPL}`);

    // ── 5. Update DB record ──
    if (insertData?.id) {
      await supabase.from("oanda_orders").update({
        exit_price: closePrice ? parseFloat(closePrice) : null,
        status: "closed",
        closed_at: new Date().toISOString(),
      }).eq("id", insertData.id);
      log.push("✅ DB record updated to closed");
    }

    return new Response(JSON.stringify({
      success: true,
      tradeId,
      fillPrice,
      closePrice,
      realizedPL,
      log,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    log.push(`❌ Error: ${(err as Error).message}`);
    return new Response(JSON.stringify({ success: false, error: (err as Error).message, log }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
