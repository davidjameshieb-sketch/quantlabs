const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2";

// ═══════════════════════════════════════════════════════════════
// RESTRICTED ACCESS PROTOCOL — NBA · PGA · NRL ONLY
// 7-day tracking window. Keyword-based classification.
// ═══════════════════════════════════════════════════════════════

const MAX_HOURS = 168; // 7 days

// ─── Keyword Dictionary ─────────────────────────────────────────
// Kalshi uses opaque tickers (e.g. KXMVECROSSCATEGORY). We detect
// league membership via title/subtitle keywords instead.

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
  // Star players
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
  // Star players
  "scheffler", "bhatia", "berger", "rahm", "mcilroy", "rory",
  "koepka", "spieth", "thomas", "morikawa", "hovland", "cantlay",
  "clark", "fleetwood", "schauffele", "woodland", "finau", "homa",
  "aberg", "kim", "matsuyama",
];

const NRL_KEYWORDS = [
  "nrl", "rugby league", "rugby", "afl",
  "try scorer", "first try", "anytime try", "last try",
  "total tries", "to win nrl",
  // NRL Teams
  "broncos", "bulldogs", "cowboys", "dolphins nrl", "dragons",
  "eels", "knights", "panthers", "rabbitohs", "raiders",
  "roosters", "sea eagles", "sharks", "storm", "titans",
  "warriors nrl", "wests tigers",
];

// Hard-block keywords — if ANY of these appear, skip the market
const NON_SPORT_KEYWORDS = [
  "temperature", "weather", "climate", "nasdaq", "s&p", "bitcoin",
  "ethereum", "crypto", "treasury", "cpi", "gdp", "inflation",
  "jobless", "unemployment", "fed ", "fomc", "president", "congress",
  "senate", "governor", "election", "spotify", "oscar", "emmy",
  "grammy", "survivor", "bachelor", "reality", "stock", "index",
  "bond", "yield", "rate ", "tariff", "trade war",
  // Blocked sports
  "baseball", "mlb", "world baseball", "soccer", "premier league",
  "mls", "tennis", "atp", "wta", "nfl", "american football",
  "nhl", "hockey", "nascar", "f1", "formula", "cricket", "ipl",
  "fifa", "ucl", "epl", "serie a", "la liga", "bundesliga",
  "ligue 1", "brasileirao", "argentine",
];

function detectLeague(ticker: string, title: string, category: string): { league: string; icon: string } | null {
  const titleLower = (title || "").toLowerCase();
  const tickerLower = (ticker || "").toLowerCase();
  const combined = `${tickerLower} ${titleLower} ${(category || "").toLowerCase()}`;

  // Step 1: Hard-block non-sport / blocked-sport markets
  for (const kw of NON_SPORT_KEYWORDS) {
    if (combined.includes(kw)) return null;
  }

  // Step 2: Keyword dictionary match (title + ticker)
  for (const kw of NBA_KEYWORDS) {
    if (combined.includes(kw)) return { league: "NBA", icon: "🏀" };
  }
  for (const team of NBA_TEAMS) {
    if (combined.includes(team)) return { league: "NBA", icon: "🏀" };
  }
  for (const kw of PGA_KEYWORDS) {
    if (combined.includes(kw)) return { league: "PGA", icon: "⛳" };
  }
  for (const kw of NRL_KEYWORDS) {
    if (combined.includes(kw)) return { league: "NRL", icon: "🏉" };
  }

  // Step 3: Check category field as fallback
  const catLower = (category || "").toLowerCase();
  if (catLower === "basketball") return { league: "NBA", icon: "🏀" };
  if (catLower === "golf") return { league: "PGA", icon: "⛳" };
  if (catLower === "rugby" || catLower === "rugby league") return { league: "NRL", icon: "🏉" };

  return null; // HARD-BLOCKED
}

function hoursUntilClose(closeTime: string | null): number | null {
  if (!closeTime) return null;
  const diff = new Date(closeTime).getTime() - Date.now();
  if (diff <= 0) return 0;
  return +(diff / 3600000).toFixed(1);
}

function extractSeriesTicker(eventTicker: string): string {
  if (!eventTicker) return "";
  const match = eventTicker.match(/^([A-Z0-9]+)-\d{2}[A-Z]{3}\d{2}/);
  if (match) return match[1];
  return eventTicker.split("-")[0] || eventTicker;
}

function isPlayerProp(title: string): boolean {
  const propKeywords = [
    "points", "rebounds", "assists", "touchdowns", "yards", "tries",
    "try scorer", "goals", "aces", "birdies", "bogeys", "leader",
    "top ", "over ", "under ", "30+", "20+", "25+", "40+", "50+",
    "most", "first", "last", "anytime", "mvp", "three-pointers",
    "3-pointers", "steals", "blocks", "double-double",
  ];
  const lower = title.toLowerCase();
  return propKeywords.some(k => lower.includes(k));
}

// ═══════════════════════════════════════════════════════════════
// 3 CORE RADAR MODULES — Anomaly Detection Only
// ═══════════════════════════════════════════════════════════════

interface AnomalyResult {
  module: "WHOLESALE_GAP" | "SMOKE_ALARM" | "NARRATIVE_MISMATCH" | null;
  label: string;
  action: string;
  tooltip: string;
  fair_value: number;
  spread_cents: number;
}

function runRadarModules(
  m: any,
  yesPrice: number,
  vol24h: number,
  oi: number,
  hoursLeft: number,
  league: string,
  title: string,
  allMarkets: any[],
): AnomalyResult | null {
  const yesBid = (m.yes_bid || 0) / 100;
  const yesAsk = (m.yes_ask || 0) / 100;
  const midpoint = (yesBid > 0 && yesAsk > 0) ? (yesBid + yesAsk) / 2 : yesPrice;
  const fv = Math.min(midpoint, 0.99); // FV capped at 99¢
  const spreadCents = Math.round((yesAsk - yesBid) * 100);
  const priceCents = Math.round(yesPrice * 100);

  // HARD GATES
  if (hoursLeft > MAX_HOURS || hoursLeft <= 0) return null;
  if (priceCents <= 2) return null; // Lotto ban
  if (yesPrice > 0.95 || yesPrice <= 0) return null;

  const isProp = isPlayerProp(title);

  // MODULE A: 'The Wholesale Gap' — Spread ≥ 6¢ (any whitelisted league)
  if (yesBid > 0 && yesAsk > 0 && spreadCents >= 6) {
    const midCents = Math.round(midpoint * 100);
    const tier = spreadCents >= 12 ? "WIDE" : "MODERATE";
    return {
      module: "WHOLESALE_GAP",
      label: tier === "WIDE" ? "WHOLESALE GAP" : "SPREAD OPPORTUNITY",
      action: `Place Limit Order at Midpoint (${midCents}¢)`,
      tooltip: `Bid/Ask spread is ${spreadCents}¢ wide (${tier}). Place a limit order at the ${midCents}¢ midpoint to get filled at wholesale.`,
      fair_value: fv,
      spread_cents: spreadCents,
    };
  }

  // MODULE B: 'The Smoke Alarm' — Volume spike on cheap prop (any league)
  const volRatioThreshold = oi > 0 ? vol24h / oi : 0;
  if (isProp && yesPrice < 0.50 && oi > 0 && volRatioThreshold > 1.5 && vol24h >= 10) {
    const volRatio = Math.round(volRatioThreshold * 100);
    const tier = volRatioThreshold >= 3 ? "BREAKING NEWS PROXY" : "VOLUME SURGE";
    return {
      module: "SMOKE_ALARM",
      label: tier,
      action: tier === "BREAKING NEWS PROXY"
        ? "Check injury reports immediately before buying."
        : "Unusual volume detected. Verify news catalysts.",
      tooltip: `${vol24h} contracts traded vs ${oi} OI (${volRatio}% velocity). ${tier === "BREAKING NEWS PROXY" ? "Massive spike — check injury reports." : "Above-average flow on cheap contract."}`,
      fair_value: fv,
      spread_cents: spreadCents,
    };
  }

  // MODULE C: 'Narrative Mismatch' — Team ≥65¢ but star prop <50¢
  if (isProp && yesPrice < 0.50) {
    const eventTicker = m.event_ticker || "";
    const teamFavorites = allMarkets.filter((other: any) =>
      other.event_ticker === eventTicker &&
      other.ticker !== m.ticker &&
      !isPlayerProp(other.title || other.subtitle || "") &&
      ((other.yes_ask || other.last_price || 0) / 100) >= 0.65
    );

    if (teamFavorites.length > 0) {
      const teamPrice = Math.round(((teamFavorites[0].yes_ask || teamFavorites[0].last_price || 0) / 100) * 100);
      const severity = teamPrice >= 75 ? "GAME SCRIPT MISMATCH" : "NARRATIVE DIVERGENCE";
      return {
        module: "NARRATIVE_MISMATCH",
        label: severity,
        action: severity === "GAME SCRIPT MISMATCH"
          ? "High correlation edge. Verify player status."
          : "Moderate mismatch. Cross-reference game script.",
        tooltip: `Team is priced at ${teamPrice}¢ but player prop is only ${priceCents}¢. ${teamPrice >= 75 ? "High correlation edge — blowout pricing doesn't match prop." : "Notable divergence worth monitoring."}`,
        fair_value: fv,
        spread_cents: spreadCents,
      };
    }
  }

  return null;
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
  const maxCloseTs = Math.floor((Date.now() + MAX_HOURS * 3600 * 1000) / 1000); // 7-day window
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
  console.log(`Fetched ${all.length} markets within 7-day window`);
  return all;
}

// ─── Main ───────────────────────────────────────────────────────

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

    const wholesaleGaps: any[] = [];
    const smokeAlarms: any[] = [];
    const narrativeMismatches: any[] = [];

    // Track all whitelisted markets for the "next catalyst" countdown
    let nearestCloseTime: string | null = null;
    let nearestLeague: string | null = null;
    let whitelistedCount = 0;

    // Collect all whitelisted market data for debug + module scanning
    const whitelistedRows: any[] = [];

    for (const m of rawMarkets) {
      const event = eventMap.get(m.event_ticker) || {};
      const title = `${m.title || ""} ${m.subtitle || ""} ${event.title || ""}`;
      const detected = detectLeague(m.ticker || "", title, event.category || "");

      if (!detected) continue;
      whitelistedCount++;

      const closeTime = m.close_time || m.expiration_time || null;
      const hoursLeft = hoursUntilClose(closeTime);

      // Track nearest event for countdown
      if (closeTime && (!nearestCloseTime || new Date(closeTime) < new Date(nearestCloseTime))) {
        nearestCloseTime = closeTime;
        nearestLeague = detected.league;
      }

      const yesPrice = (m.yes_ask || m.last_price || 0) / 100;
      const yesBid = (m.yes_bid || 0) / 100;
      const yesAsk = (m.yes_ask || 0) / 100;
      const vol24h = m.volume_24h || 0;
      const oi = m.open_interest || 0;
      const spreadCents = (yesBid > 0 && yesAsk > 0) ? Math.round((yesAsk - yesBid) * 100) : 0;

      whitelistedRows.push({
        ticker: m.ticker,
        title: m.title || m.subtitle || m.ticker,
        league: detected.league,
        yesPrice, yesBid, yesAsk, spreadCents, vol24h, oi,
        hoursLeft, closeTime,
        isProp: isPlayerProp(title),
        event_ticker: m.event_ticker,
      });

      if (hoursLeft === null || hoursLeft > MAX_HOURS || hoursLeft <= 0) continue;

      const anomaly = runRadarModules(m, yesPrice, vol24h, oi, hoursLeft, detected.league, title, rawMarkets);
      if (!anomaly) continue;

      const row = {
        ticker: m.ticker,
        event_ticker: m.event_ticker,
        series_ticker: event.series_ticker || m.series_ticker || extractSeriesTicker(m.event_ticker || m.ticker),
        title: m.title || m.subtitle || m.ticker,
        event_title: event.title || "",
        league: detected.league,
        icon: detected.icon,
        is_prop: isPlayerProp(title),
        yes_price: yesPrice,
        yes_bid: yesBid,
        yes_ask: yesAsk,
        volume_24h: vol24h,
        open_interest: oi,
        close_time: closeTime,
        hours_left: hoursLeft,
        module: anomaly.module,
        label: anomaly.label,
        action: anomaly.action,
        tooltip: anomaly.tooltip,
        fair_value: anomaly.fair_value,
        spread_cents: anomaly.spread_cents,
      };

      if (anomaly.module === "WHOLESALE_GAP") wholesaleGaps.push(row);
      else if (anomaly.module === "SMOKE_ALARM") smokeAlarms.push(row);
      else if (anomaly.module === "NARRATIVE_MISMATCH") narrativeMismatches.push(row);
    }

    // Build debug sample: top 10 by widest spread so we can see actual values
    const debugSample = whitelistedRows
      .sort((a, b) => b.spreadCents - a.spreadCents)
      .slice(0, 15)
      .map(r => ({
        ticker: r.ticker,
        title: r.title,
        league: r.league,
        spread: r.spreadCents + "¢",
        bid: Math.round(r.yesBid * 100) + "¢",
        ask: Math.round(r.yesAsk * 100) + "¢",
        vol24h: r.vol24h,
        oi: r.oi,
        hours: r.hoursLeft,
        isProp: r.isProp,
      }));

    const sortByTime = (a: any, b: any) => (a.hours_left || 999) - (b.hours_left || 999);
    wholesaleGaps.sort(sortByTime);
    smokeAlarms.sort(sortByTime);
    narrativeMismatches.sort(sortByTime);

    const filterFn = (arr: any[]) =>
      filterLeague && filterLeague !== "All" ? arr.filter((m: any) => m.league === filterLeague) : arr;

    const result = {
      wholesale_gaps: filterFn(wholesaleGaps),
      smoke_alarms: filterFn(smokeAlarms),
      narrative_mismatches: filterFn(narrativeMismatches),
      debug_sample: debugSample,
      stats: {
        totalScanned: rawMarkets.length,
        whitelistedCount,
        wholesaleGapCount: wholesaleGaps.length,
        smokeAlarmCount: smokeAlarms.length,
        narrativeMismatchCount: narrativeMismatches.length,
        totalAnomalies: wholesaleGaps.length + smokeAlarms.length + narrativeMismatches.length,
      },
      next_catalyst: nearestCloseTime ? {
        close_time: nearestCloseTime,
        league: nearestLeague,
        hours_left: hoursUntilClose(nearestCloseTime),
      } : null,
      leagues: ["NBA", "PGA", "NRL"],
      source: "anomaly_radar_v4",
      timestamp: new Date().toISOString(),
    };
      next_catalyst: nearestCloseTime ? {
        close_time: nearestCloseTime,
        league: nearestLeague,
        hours_left: hoursUntilClose(nearestCloseTime),
      } : null,
      leagues: ["NBA", "PGA", "NRL"],
      source: "anomaly_radar_v3",
      timestamp: new Date().toISOString(),
    };

    console.log(`Anomaly Radar v3: ${whitelistedCount} whitelisted, ${result.stats.totalAnomalies} anomalies (${wholesaleGaps.length} gaps, ${smokeAlarms.length} alarms, ${narrativeMismatches.length} mismatches). Next catalyst: ${nearestCloseTime || "none"}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Anomaly Radar error:", error);
    return new Response(JSON.stringify({ error: error.message, source: "anomaly_radar_v3" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
