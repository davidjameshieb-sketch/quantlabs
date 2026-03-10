const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2";

// ═══════════════════════════════════════════════════════════════
// MACHINE-READABLE INTELLIGENCE FEED — NBA · PGA · NRL ONLY
// 48h window + Smart Money exception (OI > 5000, > 4 days)
// ═══════════════════════════════════════════════════════════════

const MAX_HOURS_DEFAULT = 48;
const SMART_MONEY_MIN_OI = 5000;
const SMART_MONEY_MIN_DAYS = 4;
const MAX_HOURS_FETCH = 168; // fetch 7 days to catch Smart Money

// ─── Keyword Dictionary ─────────────────────────────────────────

const NBA_TEAMS = [
  "lakers", "celtics", "knicks", "nets", "warriors", "clippers",
  "bulls", "heat", "bucks", "76ers", "sixers", "suns", "mavericks",
  "mavs", "nuggets", "timberwolves", "wolves", "grizzlies", "pelicans",
  "cavaliers", "cavs", "thunder", "rockets", "pacers", "hawks",
  "raptors", "kings", "magic", "spurs", "trail blazers", "blazers",
  "pistons", "hornets", "wizards", "jazz",
];

const NBA_KEYWORDS = [
  "nba", "basketball", "points", "rebounds", "assists", "three-pointers",
  "3-pointers", "steals", "blocks", "double-double", "triple-double",
  "free throws", "turnovers",
  "lebron", "jokic", "brunson", "tatum", "luka", "doncic", "curry",
  "durant", "giannis", "antetokounmpo", "embiid", "morant", "edwards",
  "mitchell", "booker", "sga", "gilgeous", "haliburton", "fox",
  "lillard", "wembanyama", "cade cunningham", "trae young", "oubre",
  "sarr", "jaylen brown", "mccollum", "okongwu", "jaylen wells",
  "davion mitchell",
];

const PGA_KEYWORDS = [
  "pga", "golf", "lpga", "masters", "round 1 leader", "round 2 leader",
  "round 3 leader", "round 4 leader", "cut line", "tee time",
  "the players", "us open golf", "british open", "the open",
  "ryder cup", "tour championship", "fedex", "birdies", "bogeys",
  "under par", "over par", "hole-in-one",
  "scheffler", "bhatia", "berger", "rahm", "mcilroy", "rory",
  "koepka", "spieth", "thomas", "morikawa", "hovland", "cantlay",
  "clark", "fleetwood", "schauffele", "woodland", "finau", "homa",
  "aberg", "kim", "matsuyama",
];

const NRL_KEYWORDS = [
  "nrl", "rugby league", "rugby", "afl",
  "try scorer", "first try", "anytime try", "last try",
  "total tries", "to win nrl",
  "broncos", "bulldogs", "cowboys", "dolphins nrl", "dragons",
  "eels", "knights", "panthers", "rabbitohs", "raiders",
  "roosters", "sea eagles", "sharks", "storm", "titans",
  "warriors nrl", "wests tigers",
];

const NON_SPORT_KEYWORDS = [
  "temperature", "weather", "climate", "nasdaq", "s&p", "bitcoin",
  "ethereum", "crypto", "treasury", "cpi", "gdp", "inflation",
  "jobless", "unemployment", "fed ", "fomc", "president", "congress",
  "senate", "governor", "election", "spotify", "oscar", "emmy",
  "grammy", "survivor", "bachelor", "reality", "stock", "index",
  "bond", "yield", "rate ", "tariff", "trade war",
  "baseball", "mlb", "world baseball", "soccer", "premier league",
  "mls", "tennis", "atp", "wta", "nfl", "american football",
  "nhl", "hockey", "nascar", "f1", "formula", "cricket", "ipl",
  "fifa", "ucl", "epl", "serie a", "la liga", "bundesliga",
  "ligue 1", "brasileirao", "argentine",
];

function detectLeague(ticker: string, title: string, category: string): { league: string; icon: string } | null {
  const combined = `${(ticker || "").toLowerCase()} ${(title || "").toLowerCase()} ${(category || "").toLowerCase()}`;
  for (const kw of NON_SPORT_KEYWORDS) { if (combined.includes(kw)) return null; }
  for (const kw of NBA_KEYWORDS) { if (combined.includes(kw)) return { league: "NBA", icon: "🏀" }; }
  for (const t of NBA_TEAMS) { if (combined.includes(t)) return { league: "NBA", icon: "🏀" }; }
  for (const kw of PGA_KEYWORDS) { if (combined.includes(kw)) return { league: "PGA", icon: "⛳" }; }
  for (const kw of NRL_KEYWORDS) { if (combined.includes(kw)) return { league: "NRL", icon: "🏉" }; }
  const catLower = (category || "").toLowerCase();
  if (catLower === "basketball") return { league: "NBA", icon: "🏀" };
  if (catLower === "golf") return { league: "PGA", icon: "⛳" };
  if (catLower === "rugby" || catLower === "rugby league") return { league: "NRL", icon: "🏉" };
  return null;
}

function hoursUntilClose(closeTime: string | null): number | null {
  if (!closeTime) return null;
  const diff = new Date(closeTime).getTime() - Date.now();
  return diff <= 0 ? 0 : +(diff / 3600000).toFixed(1);
}

function extractSeriesTicker(eventTicker: string): string {
  if (!eventTicker) return "";
  const match = eventTicker.match(/^([A-Z0-9]+)-\d{2}[A-Z]{3}\d{2}/);
  return match ? match[1] : (eventTicker.split("-")[0] || eventTicker);
}

function isPlayerProp(title: string): boolean {
  const propKws = [
    "points", "rebounds", "assists", "touchdowns", "yards", "tries",
    "try scorer", "goals", "aces", "birdies", "bogeys", "leader",
    "top ", "over ", "under ", "30+", "20+", "25+", "40+", "50+",
    "most", "first", "last", "anytime", "mvp", "three-pointers",
    "3-pointers", "steals", "blocks", "double-double",
  ];
  const lower = title.toLowerCase();
  return propKws.some(k => lower.includes(k));
}

function kalshiUrl(eventTicker: string, seriesTicker: string): string {
  const et = eventTicker || "";
  const st = seriesTicker || "";
  if (st && et) return `https://kalshi.com/markets/${st}/${et}`;
  const match = et.match(/^([A-Z0-9]+)-/i);
  if (match) return `https://kalshi.com/markets/${match[1].toUpperCase()}/${et.toUpperCase()}`;
  return `https://kalshi.com/markets`;
}

// ─── Time Window Logic ──────────────────────────────────────────

function passesTimeFilter(hoursLeft: number | null, oi: number): { pass: boolean; flag?: string } {
  if (hoursLeft === null || hoursLeft <= 0) return { pass: false };
  if (hoursLeft > MAX_HOURS_FETCH) return { pass: false }; // hard cap at 7 days
  if (hoursLeft <= MAX_HOURS_DEFAULT) return { pass: true };
  // Beyond 48h: always allow for board visibility, flag as Early Accumulation
  // Smart Money (OI > 5000) gets special flag
  const flag = oi >= SMART_MONEY_MIN_OI ? "Early Accumulation (Smart Money)" : "Early Accumulation";
  return { pass: true, flag };
}

// ─── Web Scraping (Firecrawl) ───────────────────────────────────

async function scrapeRealWorldOdds(marketTitle: string, league: string): Promise<{ realWorldCents: number | null; context: string | null }> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return { realWorldCents: null, context: null };

  try {
    const searchQuery = `${league} ${marketTitle} odds DraftKings FanDuel`;
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: searchQuery, limit: 3, tbs: "qdr:d", scrapeOptions: { formats: ["markdown"] } }),
    });
    if (!res.ok) return { realWorldCents: null, context: null };
    const data = await res.json();
    const results = data.data || [];

    let realWorldCents: number | null = null;
    let context: string | null = null;

    for (const r of results) {
      const text = (r.markdown || r.description || "").toLowerCase();
      // Try to extract American odds like +150, -200
      const oddsMatch = text.match(/([+-]\d{3,4})/);
      if (oddsMatch && !realWorldCents) {
        const american = parseInt(oddsMatch[1]);
        if (american > 0) realWorldCents = Math.round((100 / (american + 100)) * 100);
        else if (american < 0) realWorldCents = Math.round((Math.abs(american) / (Math.abs(american) + 100)) * 100);
      }
      // Try decimal odds like 2.50
      if (!realWorldCents) {
        const decMatch = text.match(/\b(\d\.\d{2})\b/);
        if (decMatch) {
          const dec = parseFloat(decMatch[1]);
          if (dec >= 1.01 && dec <= 50) realWorldCents = Math.round((1 / dec) * 100);
        }
      }
      // Get context headline
      if (!context && r.title) {
        context = r.title.slice(0, 120);
      }
    }
    return { realWorldCents, context };
  } catch (e) {
    console.error("Firecrawl scrape error:", e);
    return { realWorldCents: null, context: null };
  }
}

async function scrapeNewsContext(marketTitle: string, league: string): Promise<string | null> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return null;

  try {
    const searchQuery = `${league} ${marketTitle} injury news ESPN`;
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: searchQuery, limit: 2, tbs: "qdr:d" }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results = data.data || [];
    return results[0]?.title?.slice(0, 150) || results[0]?.description?.slice(0, 150) || null;
  } catch {
    return null;
  }
}

// ─── Paginated Fetchers ─────────────────────────────────────────

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchAllEvents(): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 3; page++) {
    if (page > 0) await delay(350);
    const params = new URLSearchParams({ limit: "200", status: "open" });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`${KALSHI_API}/events?${params}`, { headers: { Accept: "application/json" } });
    if (res.status === 429) break;
    if (!res.ok) throw new Error(`Kalshi events: ${res.status}`);
    const data = await res.json();
    const events = data.events || [];
    all.push(...events);
    cursor = data.cursor || null;
    if (!cursor || events.length < 200) break;
  }
  return all;
}

async function fetchAllMarkets(): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | null = null;
  const maxCloseTs = Math.floor((Date.now() + MAX_HOURS_FETCH * 3600 * 1000) / 1000);
  for (let page = 0; page < 5; page++) {
    if (page > 0) await delay(350);
    const params = new URLSearchParams({ limit: "200", status: "open", max_close_ts: String(maxCloseTs) });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`${KALSHI_API}/markets?${params}`, { headers: { Accept: "application/json" } });
    if (res.status === 429) break;
    if (!res.ok) throw new Error(`Kalshi markets: ${res.status}`);
    const data = await res.json();
    const markets = data.markets || [];
    all.push(...markets);
    cursor = data.cursor || null;
    if (!cursor || markets.length < 200) break;
  }
  console.log(`Fetched ${all.length} markets within 7-day fetch window`);
  return all;
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const filterLeague = body.league || null;

    const events = await fetchAllEvents();
    await delay(500);
    const rawMarkets = await fetchAllMarkets();

    console.log(`Fetched ${events.length} events, ${rawMarkets.length} markets`);

    const eventMap = new Map<string, any>();
    for (const e of events) eventMap.set(e.event_ticker, e);

    // Collect whitelisted markets with enriched data
    interface EnrichedMarket {
      ticker: string;
      event_ticker: string;
      series_ticker: string;
      title: string;
      subtitle: string;
      event_title: string;
      league: string;
      icon: string;
      is_prop: boolean;
      yes_price_cents: number;
      yes_bid_cents: number;
      yes_ask_cents: number;
      spread_cents: number;
      vol24h: number;
      oi: number;
      hours_left: number | null;
      close_time: string | null;
      time_flag: string | null;
      url: string;
      resolution_rule: string;
    }

    const whitelisted: EnrichedMarket[] = [];

    for (const m of rawMarkets) {
      const event = eventMap.get(m.event_ticker) || {};
      const fullTitle = `${m.title || ""} ${m.subtitle || ""} ${event.title || ""}`;
      const detected = detectLeague(m.ticker || "", fullTitle, event.category || "");
      if (!detected) continue;

      const closeTime = m.close_time || m.expiration_time || null;
      const hoursLeft = hoursUntilClose(closeTime);
      const yesBidCents = Math.round((m.yes_bid || 0));
      const yesAskCents = Math.round((m.yes_ask || 0));
      const yesPriceCents = yesAskCents || Math.round((m.last_price || 0));
      const spreadCents = (yesBidCents > 0 && yesAskCents > 0) ? yesAskCents - yesBidCents : 0;
      const vol24h = m.volume_24h || 0;
      const oi = m.open_interest || 0;

      // Price gates
      if (yesPriceCents <= 2 || yesPriceCents > 95) continue;

      const timeCheck = passesTimeFilter(hoursLeft, oi);
      if (!timeCheck.pass) continue;

      const st = event.series_ticker || m.series_ticker || extractSeriesTicker(m.event_ticker || m.ticker);

      whitelisted.push({
        ticker: m.ticker,
        event_ticker: m.event_ticker || "",
        series_ticker: st,
        title: m.title || m.subtitle || m.ticker,
        subtitle: m.subtitle || "",
        event_title: event.title || "",
        league: detected.league,
        icon: detected.icon,
        is_prop: isPlayerProp(fullTitle),
        yes_price_cents: yesPriceCents,
        yes_bid_cents: yesBidCents,
        yes_ask_cents: yesAskCents,
        spread_cents: spreadCents,
        vol24h,
        oi,
        hours_left: hoursLeft,
        close_time: closeTime,
        time_flag: timeCheck.flag || null,
        url: kalshiUrl(m.event_ticker || "", st),
        resolution_rule: m.rules_primary || event.rules_primary || "Standard resolution",
      });
    }

    console.log(`Whitelisted ${whitelisted.length} markets passing time filter`);

    // ─── TABLE 1: Breaking News (Smoke Alarm) ───────────────────
    // Trigger: 24h Vol > 300% of OI AND Ask < 50¢
    const table1_raw = whitelisted.filter(m => {
      if (m.yes_ask_cents >= 50) return false;
      if (m.oi <= 0) return false;
      const volRatio = m.vol24h / m.oi;
      return volRatio > 3.0 && m.vol24h >= 30;
    });

    // ─── TABLE 2: Wholesale Spread ──────────────────────────────
    // Trigger: OI > 2000, 24h Vol < 500, Spread > 6¢
    const table2_raw = whitelisted.filter(m => {
      return m.oi > 2000 && m.vol24h < 500 && m.spread_cents > 6;
    });

    // ─── TABLE 3: Narrative Correlation ─────────────────────────
    // Trigger: Team > 70¢ to win, correlated player prop < 40¢
    const table3_raw: (EnrichedMarket & { team_win_cents: number; price_gap: number })[] = [];
    for (const m of whitelisted) {
      if (!m.is_prop || m.yes_price_cents >= 40) continue;
      // Find team market in same event
      const teamMarkets = whitelisted.filter(other =>
        other.event_ticker === m.event_ticker &&
        other.ticker !== m.ticker &&
        !other.is_prop &&
        other.yes_price_cents > 70
      );
      if (teamMarkets.length > 0) {
        table3_raw.push({
          ...m,
          team_win_cents: teamMarkets[0].yes_price_cents,
          price_gap: teamMarkets[0].yes_price_cents - m.yes_price_cents,
        });
      }
    }

    // ─── Firecrawl Enrichment (batch, max 5 per table) ──────────
    const enrichTable1: any[] = [];
    const enrichTable2: any[] = [];
    const enrichTable3: any[] = [];

    // Table 1 enrichment
    for (const m of table1_raw.slice(0, 5)) {
      const volRatio = (m.vol24h / m.oi).toFixed(1);
      let realWorldCents: number | null = null;
      let context: string | null = null;
      try {
        const [odds, news] = await Promise.all([
          scrapeRealWorldOdds(m.title, m.league),
          scrapeNewsContext(m.title, m.league),
        ]);
        realWorldCents = odds.realWorldCents;
        context = news || odds.context;
      } catch { /* continue without enrichment */ }
      enrichTable1.push({
        league: m.league,
        market: m.title,
        start_time: m.close_time,
        url: m.url,
        resolution: (m.resolution_rule || "").slice(0, 80),
        kalshi_ask_cents: m.yes_ask_cents,
        real_world_cents: realWorldCents,
        vol_oi_ratio: volRatio + "x",
        context: context || "No recent news found",
        time_flag: m.time_flag,
      });
      await delay(200);
    }

    // Table 2 enrichment
    for (const m of table2_raw.slice(0, 5)) {
      let realWorldCents: number | null = null;
      try {
        const odds = await scrapeRealWorldOdds(m.title, m.league);
        realWorldCents = odds.realWorldCents;
      } catch { /* continue */ }
      enrichTable2.push({
        league: m.league,
        market: m.title,
        start_time: m.close_time,
        url: m.url,
        resolution: (m.resolution_rule || "").slice(0, 80),
        kalshi_bid_cents: m.yes_bid_cents,
        kalshi_ask_cents: m.yes_ask_cents,
        real_world_cents: realWorldCents,
        spread_width: m.spread_cents,
        time_flag: m.time_flag,
      });
      await delay(200);
    }

    // Table 3 enrichment
    for (const m of table3_raw.slice(0, 5)) {
      let realWorldCents: number | null = null;
      try {
        const odds = await scrapeRealWorldOdds(m.title, m.league);
        realWorldCents = odds.realWorldCents;
      } catch { /* continue */ }
      enrichTable3.push({
        league: m.league,
        market: m.title,
        start_time: m.close_time,
        url: m.url,
        resolution: (m.resolution_rule || "").slice(0, 80),
        team_win_cents: m.team_win_cents,
        player_prop_cents: m.yes_price_cents,
        real_world_cents: realWorldCents,
        price_gap: m.price_gap,
        time_flag: m.time_flag,
      });
      await delay(200);
    }

    // ─── Debug: Board sample (always included) ──────────────────
    const debugSample = whitelisted
      .sort((a, b) => b.spread_cents - a.spread_cents)
      .slice(0, 20)
      .map(r => ({
        league: r.league,
        title: r.title,
        bid: r.yes_bid_cents,
        ask: r.yes_ask_cents,
        spread: r.spread_cents,
        vol24h: r.vol24h,
        oi: r.oi,
        hours: r.hours_left,
        flag: r.time_flag,
      }));

    // ─── Next Catalyst Countdown ────────────────────────────────
    let nearestCloseTime: string | null = null;
    let nearestLeague: string | null = null;
    for (const m of whitelisted) {
      if (m.close_time && (!nearestCloseTime || new Date(m.close_time) < new Date(nearestCloseTime))) {
        nearestCloseTime = m.close_time;
        nearestLeague = m.league;
      }
    }

    // Apply league filter
    const filterFn = <T extends { league: string }>(arr: T[]) =>
      filterLeague && filterLeague !== "All" ? arr.filter(m => m.league === filterLeague) : arr;

    const result = {
      breaking_news: filterFn(enrichTable1),
      wholesale_spreads: filterFn(enrichTable2),
      narrative_correlation: filterFn(enrichTable3),
      debug_board: debugSample,
      stats: {
        totalScanned: rawMarkets.length,
        whitelistedCount: whitelisted.length,
        breakingNewsCount: enrichTable1.length,
        wholesaleSpreadCount: enrichTable2.length,
        narrativeCorrelationCount: enrichTable3.length,
        totalAnomalies: enrichTable1.length + enrichTable2.length + enrichTable3.length,
      },
      next_catalyst: nearestCloseTime ? {
        close_time: nearestCloseTime,
        league: nearestLeague,
        hours_left: hoursUntilClose(nearestCloseTime),
      } : null,
      leagues: ["NBA", "PGA", "NRL"],
      source: "intelligence_feed_v5",
      timestamp: new Date().toISOString(),
    };

    console.log(`Intelligence Feed v5: ${whitelisted.length} whitelisted, ${result.stats.totalAnomalies} anomalies. Next: ${nearestCloseTime || "none"}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Intelligence Feed error:", error);
    return new Response(JSON.stringify({ error: error.message, source: "intelligence_feed_v5" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
