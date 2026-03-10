const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2";

// Category mapping for Kalshi series
const SPORT_CATEGORIES: Record<string, string> = {
  "NBA": "Basketball", "WNBA": "Basketball", "CBB": "Basketball", "NCAA": "Basketball",
  "NFL": "Football", "CFB": "Football",
  "MLB": "Baseball",
  "NHL": "Hockey",
  "MLS": "Soccer", "EPL": "Soccer", "UCL": "Soccer", "SOCCER": "Soccer", "FIFA": "Soccer",
  "ATP": "Tennis", "WTA": "Tennis", "TENNIS": "Tennis",
  "PGA": "Golf", "GOLF": "Golf", "LPGA": "Golf",
  "AFL": "Aussie Rules",
  "CRICKET": "Cricket", "IPL": "Cricket",
  "F1": "Racing", "NASCAR": "Racing",
  "CS": "Esports", "LOL": "Esports", "DOTA": "Esports", "VAL": "Esports",
};

function categorizeEvent(event: any): string {
  const ticker = (event.series_ticker || event.event_ticker || "").toUpperCase();
  const title = (event.title || "").toUpperCase();
  const category = (event.category || "").toUpperCase();

  // Check category field first
  if (category === "SPORTS" || category.includes("SPORT")) {
    // Try to identify specific sport from ticker/title
    for (const [key, sport] of Object.entries(SPORT_CATEGORIES)) {
      if (ticker.includes(key) || title.includes(key)) return sport;
    }
  }

  // Check ticker patterns
  for (const [key, sport] of Object.entries(SPORT_CATEGORIES)) {
    if (ticker.includes(key)) return sport;
  }

  // Check title keywords
  const titleLower = title.toLowerCase();
  if (titleLower.includes("basketball") || titleLower.includes("nba")) return "Basketball";
  if (titleLower.includes("football") || titleLower.includes("nfl")) return "Football";
  if (titleLower.includes("baseball") || titleLower.includes("mlb")) return "Baseball";
  if (titleLower.includes("hockey") || titleLower.includes("nhl")) return "Hockey";
  if (titleLower.includes("soccer") || titleLower.includes("premier league") || titleLower.includes("mls")) return "Soccer";
  if (titleLower.includes("tennis") || titleLower.includes("atp") || titleLower.includes("wta")) return "Tennis";
  if (titleLower.includes("golf") || titleLower.includes("pga") || titleLower.includes("masters")) return "Golf";
  if (titleLower.includes("f1") || titleLower.includes("nascar") || titleLower.includes("race")) return "Racing";

  return category || "Other";
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchAllKalshiEvents() {
  const all: any[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 3; page++) {
    const params = new URLSearchParams({ limit: "200", status: "open" });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`${KALSHI_API}/events?${params}`, {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) throw new Error(`Kalshi API returned ${res.status}`);
    const data = await res.json();
    const events = data.events || [];
    all.push(...events);
    cursor = data.cursor || null;
    if (!cursor || events.length < 200) break;
    await delay(350);
  }
  return all;
}

async function fetchAllKalshiMarkets() {
  const all: any[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({ limit: "200", status: "open" });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`${KALSHI_API}/markets?${params}`, {
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) throw new Error(`Kalshi markets API returned ${res.status}`);
    const data = await res.json();
    const markets = data.markets || [];
    all.push(...markets);
    cursor = data.cursor || null;
    if (!cursor || markets.length < 200) break;
    await delay(350);
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const filterSport = body.sport || null;

    // Fetch real events and markets from Kalshi
    const [events, markets] = await Promise.all([
      fetchAllKalshiEvents(),
      fetchAllKalshiMarkets(),
    ]);

    console.log(`Fetched ${events.length} events, ${markets.length} markets from Kalshi`);

    // Categorize and enrich events
    const enrichedEvents = events.map((evt: any) => ({
      ...evt,
      sport_category: categorizeEvent(evt),
    }));

    // Build market-to-event lookup
    const eventMap = new Map<string, any>();
    for (const evt of enrichedEvents) {
      eventMap.set(evt.event_ticker, evt);
    }

    // Enrich markets with event data
    const enrichedMarkets = markets.map((mkt: any) => {
      const event = eventMap.get(mkt.event_ticker) || {};
      const sport = event.sport_category || categorizeEvent({ ...mkt, title: mkt.title || mkt.subtitle });

      // Calculate implied probabilities from yes/no prices
      const yesPrice = (mkt.yes_ask || mkt.last_price || 0) / 100;
      const noPrice = (mkt.no_ask || (100 - (mkt.last_price || 50))) / 100;

      return {
        ticker: mkt.ticker,
        event_ticker: mkt.event_ticker,
        title: mkt.title || mkt.subtitle || mkt.ticker,
        event_title: event.title || "",
        sport,
        status: mkt.status,
        yes_price: yesPrice,
        no_price: noPrice,
        yes_bid: (mkt.yes_bid || 0) / 100,
        yes_ask: (mkt.yes_ask || 0) / 100,
        no_bid: (mkt.no_bid || 0) / 100,
        no_ask: (mkt.no_ask || 0) / 100,
        last_price: (mkt.last_price || 0) / 100,
        volume: mkt.volume || 0,
        volume_24h: mkt.volume_24h || 0,
        open_interest: mkt.open_interest || 0,
        close_time: mkt.close_time || mkt.expiration_time,
        result: mkt.result,
        category: event.category || "",
        subtitle: mkt.subtitle || "",
      };
    });

    // Filter by sport if requested
    let filtered = enrichedMarkets;
    if (filterSport && filterSport !== "All") {
      filtered = enrichedMarkets.filter((m: any) => m.sport === filterSport);
    }

    // Sort: live/active first, then by volume
    filtered.sort((a: any, b: any) => (b.volume_24h || b.volume || 0) - (a.volume_24h || a.volume || 0));

    // Build category summary
    const catCounts = new Map<string, { total: number; volume: number }>();
    for (const m of enrichedMarkets) {
      const existing = catCounts.get(m.sport) || { total: 0, volume: 0 };
      existing.total++;
      existing.volume += m.volume_24h || m.volume || 0;
      catCounts.set(m.sport, existing);
    }

    const categories = Array.from(catCounts.entries())
      .map(([sport, data]) => ({ sport, total: data.total, volume: data.volume }))
      .sort((a, b) => b.total - a.total);

    return new Response(JSON.stringify({
      categories,
      markets: filtered,
      stats: {
        totalMarkets: enrichedMarkets.length,
        filteredMarkets: filtered.length,
        totalEvents: events.length,
        categories: categories.length,
      },
      source: "kalshi_live",
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Kalshi sports error:", error);
    return new Response(JSON.stringify({
      error: error.message,
      source: "kalshi_live",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
