// news-event-grid: News-Event Volatility Compression
// Bridges Forex Factory High-Impact calendar → Ghost Limit grid
// 60s before high-impact events, blankets ±25 pip range with limit orders
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const USD_PAIRS = ["EUR_USD", "GBP_USD", "USD_JPY", "AUD_USD", "USD_CAD", "NZD_USD"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const oandaToken = Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN");
  const accountId = Deno.env.get("OANDA_LIVE_ACCOUNT_ID") || Deno.env.get("OANDA_ACCOUNT_ID");
  const oandaEnv = Deno.env.get("OANDA_ENV") || "live";
  const baseUrl = oandaEnv === "live"
    ? "https://api-fxtrade.oanda.com"
    : "https://api-fxpractice.oanda.com";
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode ?? "scan"; // "scan" = check upcoming events, "arm" = place grid
    const gridRangePips = body.grid_range_pips ?? 25;
    const gridStepPips = body.grid_step_pips ?? 5;
    const unitsPerLevel = body.units ?? 100;
    const windowMinutes = body.window_minutes ?? 30; // look ahead window

    // Phase 1: Get upcoming high-impact events
    // Try economic calendar from sovereign_memory first
    let upcomingEvents: { title: string; currency: string; impact: string; time: string }[] = [];

    const { data: calendarMemory } = await supabase
      .from("sovereign_memory")
      .select("payload")
      .eq("memory_type", "economic_calendar")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (calendarMemory?.[0]?.payload) {
      const cal = calendarMemory[0].payload as any;
      const events = cal.events || cal.calendar || [];
      const now = Date.now();
      const windowMs = windowMinutes * 60000;

      for (const ev of events) {
        const evTime = new Date(ev.time || ev.datetime || ev.date).getTime();
        if (evTime > now && evTime < now + windowMs) {
          if ((ev.impact === "high" || ev.impact === "High" || ev.importance === 3) &&
              (ev.currency === "USD" || ev.country === "US")) {
            upcomingEvents.push({
              title: ev.title || ev.event || ev.name,
              currency: ev.currency || "USD",
              impact: "high",
              time: new Date(evTime).toISOString(),
            });
          }
        }
      }
    }

    // Fallback: scrape Forex Factory if no calendar memory
    if (upcomingEvents.length === 0 && firecrawlKey) {
      try {
        const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${firecrawlKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: "https://www.forexfactory.com/calendar?day=today",
            formats: ["markdown"],
            onlyMainContent: true,
            waitFor: 5000,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const md = data.data?.markdown || data.markdown || "";

          // Use Gemini flash-lite for simple event extraction
          const geminiRes = await fetch(
            "https://ai.gateway.lovable.dev/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash-lite",
                messages: [
                  { role: "system", content: "Extract economic events. Return valid JSON array only." },
                  { role: "user", content: `Extract high-impact USD economic events from this calendar. Current time: ${new Date().toISOString()}. Return JSON array of events happening in the next ${windowMinutes} minutes:\n[{"title":"...", "time":"ISO8601", "currency":"USD", "impact":"high"}]\nIf none upcoming, return [].\n\nCalendar:\n${md.slice(0, 5000)}` }
                ],
                temperature: 0.1,
                max_tokens: 500,
              }),
            }
          );

          if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            const raw = geminiData.choices?.[0]?.message?.content || "[]";
            const jsonMatch = raw.match(/\[[\s\S]*\]/);
            try {
              upcomingEvents = JSON.parse(jsonMatch?.[0] || "[]");
            } catch { /* skip */ }
          }
        }
      } catch { /* skip */ }
    }

    if (mode === "scan") {
      return new Response(
        JSON.stringify({
          mode: "scan",
          upcomingHighImpact: upcomingEvents,
          windowMinutes,
          armed: false,
          timestamp: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Phase 2: ARM mode — place ghost limit grid
    if (!oandaToken || !accountId) {
      return new Response(
        JSON.stringify({ error: "OANDA credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const gridResults: any[] = [];

    // Get current prices for USD pairs
    const pricingRes = await fetch(
      `${baseUrl}/v3/accounts/${accountId}/pricing?instruments=${USD_PAIRS.join(",")}`,
      { headers: { Authorization: `Bearer ${oandaToken}` } }
    );

    if (!pricingRes.ok) {
      return new Response(
        JSON.stringify({ error: `Pricing fetch failed: ${pricingRes.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const pricingData = await pricingRes.json();
    const prices: Record<string, number> = {};
    for (const p of pricingData.prices || []) {
      const mid = (parseFloat(p.asks?.[0]?.price || "0") + parseFloat(p.bids?.[0]?.price || "0")) / 2;
      prices[p.instrument] = mid;
    }

    // Place grid for each USD pair
    for (const pair of USD_PAIRS) {
      const currentPrice = prices[pair];
      if (!currentPrice) continue;

      const isJpy = pair.includes("JPY");
      const pipSize = isJpy ? 0.01 : 0.0001;
      const decimals = isJpy ? 3 : 5;
      const orders: any[] = [];

      // Place limits above and below current price
      for (let offset = gridStepPips; offset <= gridRangePips; offset += gridStepPips) {
        const abovePrice = (currentPrice + offset * pipSize).toFixed(decimals);
        const belowPrice = (currentPrice - offset * pipSize).toFixed(decimals);

        // SELL limit above (catch spike up)
        orders.push({
          type: "LIMIT",
          instrument: pair,
          units: String(-unitsPerLevel),
          price: abovePrice,
          timeInForce: "GTD",
          gtdTime: new Date(Date.now() + 2 * 3600000).toISOString(), // 2h expiry
          positionFill: "DEFAULT",
        });

        // BUY limit below (catch spike down)
        orders.push({
          type: "LIMIT",
          instrument: pair,
          units: String(unitsPerLevel),
          price: belowPrice,
          timeInForce: "GTD",
          gtdTime: new Date(Date.now() + 2 * 3600000).toISOString(),
          positionFill: "DEFAULT",
        });
      }

      // Place all orders
      const pairOrders: any[] = [];
      for (const order of orders) {
        try {
          const res = await fetch(
            `${baseUrl}/v3/accounts/${accountId}/orders`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${oandaToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ order }),
            }
          );
          const data = await res.json();
          pairOrders.push({
            price: order.price,
            units: order.units,
            orderId: data.orderCreateTransaction?.id ?? null,
            status: res.ok ? "placed" : "failed",
            error: res.ok ? null : data.errorMessage,
          });
        } catch (e) {
          pairOrders.push({ price: order.price, error: String(e) });
        }
      }

      gridResults.push({
        pair,
        currentPrice: currentPrice.toFixed(decimals),
        ordersPlaced: pairOrders.filter(o => o.status === "placed").length,
        ordersFailed: pairOrders.filter(o => o.status === "failed").length,
        orders: pairOrders,
      });
    }

    // Persist grid event to sovereign_memory
    await supabase.from("sovereign_memory").upsert(
      {
        memory_type: "news_event_grid",
        memory_key: `grid_${Date.now()}`,
        payload: {
          events: upcomingEvents,
          gridResults,
          gridRangePips,
          gridStepPips,
          armedAt: new Date().toISOString(),
        },
        relevance_score: 1.0,
        created_by: "news-event-grid",
      },
      { onConflict: "memory_type,memory_key" }
    );

    return new Response(
      JSON.stringify({
        mode: "arm",
        events: upcomingEvents,
        gridResults,
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
