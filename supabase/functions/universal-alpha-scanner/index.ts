const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2";

// ═══════════════════════════════════════════════════════════════
// KALSHI FULL-BOARD SCANNER — All markets, volume-sorted
// Buy low, sell high. Show everything with orderbook activity.
// ═══════════════════════════════════════════════════════════════

const MAX_HOURS_FETCH = 336; // 14 days

// ─── Category Detection ─────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "NBA": ["nba", "basketball", "lakers", "celtics", "knicks", "nets", "warriors", "clippers",
    "bulls", "heat", "bucks", "76ers", "sixers", "suns", "mavericks", "nuggets", "timberwolves",
    "grizzlies", "pelicans", "cavaliers", "thunder", "rockets", "pacers", "hawks", "raptors",
    "kings", "magic", "spurs", "blazers", "pistons", "hornets", "wizards", "jazz",
    "lebron", "jokic", "tatum", "curry", "durant", "giannis", "embiid", "luka", "doncic",
    "points", "rebounds", "assists", "three-pointers", "double-double"],
  "NFL": ["nfl", "football", "super bowl", "touchdown", "quarterback", "chiefs", "eagles",
    "cowboys", "49ers", "ravens", "bills", "dolphins", "lions", "packers", "bengals"],
  "PGA": ["pga", "golf", "lpga", "masters", "the players", "us open golf", "british open",
    "birdies", "bogeys", "cut line", "scheffler", "bhatia", "berger", "rahm", "mcilroy",
    "koepka", "spieth", "schauffele", "hovland", "morikawa", "liv golf"],
  "MLB": ["mlb", "baseball", "world series", "home run", "strikeout", "pitcher",
    "yankees", "dodgers", "astros", "braves", "phillies", "mets", "cubs", "red sox"],
  "NHL": ["nhl", "hockey", "stanley cup", "hat trick", "power play"],
  "Soccer": ["soccer", "premier league", "epl", "mls", "ucl", "champions league",
    "la liga", "bundesliga", "serie a", "fifa", "world cup soccer"],
  "Tennis": ["tennis", "atp", "wta", "grand slam", "wimbledon", "us open tennis",
    "french open", "australian open"],
  "NRL": ["nrl", "rugby league", "rugby", "afl", "try scorer"],
  "Racing": ["f1", "formula 1", "nascar", "grand prix", "race winner"],
  "Esports": ["esports", "cs2", "valorant", "league of legends", "dota"],
  "Crypto": ["bitcoin", "ethereum", "crypto", "btc", "eth", "solana", "dogecoin"],
  "Stocks": ["nasdaq", "s&p", "dow jones", "stock", "ipo", "earnings", "market cap",
    "tesla stock", "apple stock", "nvidia"],
  "Economy": ["cpi", "gdp", "inflation", "jobless", "unemployment", "fed ", "fomc",
    "interest rate", "treasury", "bond", "yield", "tariff", "trade war", "recession"],
  "Politics": ["president", "congress", "senate", "governor", "election", "vote",
    "democrat", "republican", "trump", "biden", "approval rating"],
  "Weather": ["temperature", "weather", "climate", "hurricane", "tornado", "snowfall"],
  "Entertainment": ["oscar", "emmy", "grammy", "spotify", "box office", "streaming",
    "survivor", "bachelor", "reality tv"],
};

const CATEGORY_ICONS: Record<string, string> = {
  "NBA": "🏀", "NFL": "🏈", "PGA": "⛳", "MLB": "⚾", "NHL": "🏒",
  "Soccer": "⚽", "Tennis": "🎾", "NRL": "🏉", "Racing": "🏎️", "Esports": "🎮",
  "Crypto": "₿", "Stocks": "📈", "Economy": "💹", "Politics": "🏛️",
  "Weather": "🌡️", "Entertainment": "🎬", "Other": "📊",
};

function detectCategory(ticker: string, title: string, eventCategory: string): { category: string; icon: string } {
  const combined = `${(ticker || "").toLowerCase()} ${(title || "").toLowerCase()} ${(eventCategory || "").toLowerCase()}`;

  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (combined.includes(kw)) return { category: cat, icon: CATEGORY_ICONS[cat] || "📊" };
    }
  }

  // Fallback to Kalshi's own category
  const catLower = (eventCategory || "").toLowerCase();
  if (catLower.includes("sport")) return { category: "Sports", icon: "🏆" };
  if (catLower.includes("politic")) return { category: "Politics", icon: "🏛️" };
  if (catLower.includes("financ") || catLower.includes("econ")) return { category: "Economy", icon: "💹" };

  return { category: eventCategory || "Other", icon: "📊" };
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

function kalshiUrl(eventTicker: string, seriesTicker: string): string {
  const et = eventTicker || "";
  const st = seriesTicker || "";
  if (st && et) return `https://kalshi.com/markets/${st}/${et}`;
  const match = et.match(/^([A-Z0-9]+)-/i);
  if (match) return `https://kalshi.com/markets/${match[1].toUpperCase()}/${et.toUpperCase()}`;
  return `https://kalshi.com/markets`;
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
  for (let page = 0; page < 8; page++) {
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
  console.log(`Fetched ${all.length} markets within 14-day window`);
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
    const filterCategory = body.category || null;
    const sortBy = body.sort || "volume"; // volume | spread | oi | hours

    const events = await fetchAllEvents();
    await delay(500);
    const rawMarkets = await fetchAllMarkets();

    console.log(`Fetched ${events.length} events, ${rawMarkets.length} markets`);
    // Debug: log first market's raw fields to understand API shape
    if (rawMarkets.length > 0) {
      const sample = rawMarkets[0];
      console.log(`Sample market keys: ${Object.keys(sample).join(", ")}`);
      console.log(`Sample: bid=${sample.yes_bid} ask=${sample.yes_ask} last=${sample.last_price} vol=${sample.volume_24h} oi=${sample.open_interest} status=${sample.status}`);
    }

    const eventMap = new Map<string, any>();
    for (const e of events) eventMap.set(e.event_ticker, e);

    // ─── Process ALL markets ────────────────────────────────────

    interface BoardMarket {
      ticker: string;
      event_ticker: string;
      title: string;
      category: string;
      icon: string;
      url: string;
      yes_bid: number;
      yes_ask: number;
      midpoint: number;
      spread: number;
      last_price: number;
      vol24h: number;
      oi: number;
      hours_left: number | null;
      close_time: string | null;
      vol_oi_ratio: number;
      has_orderbook: boolean;
    }

    const board: BoardMarket[] = [];

    for (const m of rawMarkets) {
      const event = eventMap.get(m.event_ticker) || {};
      const fullTitle = `${m.title || ""} ${m.subtitle || ""} ${event.title || ""}`;
      const detected = detectCategory(m.ticker || "", fullTitle, event.category || "");

      const closeTime = m.close_time || m.expiration_time || null;
      const hoursLeft = hoursUntilClose(closeTime);

      // Kalshi API v2 uses _dollars/_fp suffixed fields
      const yesBid = Math.round((m.yes_bid_dollars ?? m.yes_bid ?? 0) * 100);
      const yesAsk = Math.round((m.yes_ask_dollars ?? m.yes_ask ?? 0) * 100);
      const lastPrice = Math.round((m.last_price_dollars ?? m.last_price ?? 0) * 100);
      const midpoint = (yesBid > 0 && yesAsk > 0) ? Math.round((yesBid + yesAsk) / 2) : lastPrice;
      const spread = (yesBid > 0 && yesAsk > 0) ? yesAsk - yesBid : 0;
      const vol24h = m.volume_24h_fp ?? m.volume_24h ?? 0;
      const oi = m.open_interest_fp ?? m.open_interest ?? 0;

      // Liquidity classification
      const hasOrderbook = (oi >= 5 || vol24h >= 5 || (spread > 0 && spread < 15 && oi > 0));

      // Only skip if midpoint is known AND at extreme penny/ceiling levels
      if (midpoint > 0 && (midpoint <= 1 || midpoint >= 99)) continue;

      const st = event.series_ticker || m.series_ticker || extractSeriesTicker(m.event_ticker || m.ticker);

      board.push({
        ticker: m.ticker,
        event_ticker: m.event_ticker || "",
        title: m.title || m.subtitle || m.ticker,
        category: detected.category,
        icon: detected.icon,
        url: kalshiUrl(m.event_ticker || "", st),
        yes_bid: yesBid,
        yes_ask: yesAsk,
        midpoint,
        spread,
        last_price: lastPrice,
        vol24h,
        oi,
        hours_left: hoursLeft,
        close_time: closeTime,
        vol_oi_ratio: oi > 0 ? +(vol24h / oi).toFixed(2) : 0,
        has_orderbook: hasOrderbook,
      });
    }

    // ─── Filter by category ───────────────────────────────────────
    let filtered = board;
    if (filterCategory && filterCategory !== "All") {
      filtered = board.filter(m => m.category === filterCategory);
    }

    // ─── Sort ─────────────────────────────────────────────────────
    const sortFns: Record<string, (a: BoardMarket, b: BoardMarket) => number> = {
      volume: (a, b) => (b.vol24h + b.oi) - (a.vol24h + a.oi),
      spread: (a, b) => b.spread - a.spread,
      oi: (a, b) => b.oi - a.oi,
      hours: (a, b) => (a.hours_left ?? 9999) - (b.hours_left ?? 9999),
      vol_oi: (a, b) => b.vol_oi_ratio - a.vol_oi_ratio,
    };
    filtered.sort(sortFns[sortBy] || sortFns.volume);

    // ─── Hot Markets: volume > 0 preferred, fallback to all if none ──
    let hotMarkets = filtered
      .filter(m => m.vol24h > 0 && m.has_orderbook)
      .slice(0, 200);
    // If no markets have volume, show the top markets anyway
    if (hotMarkets.length === 0) {
      hotMarkets = filtered.slice(0, 200);
    }

    // ─── Wide Spreads: spread >= 4, has OI ────────────────────────
    const wideSpreads = filtered
      .filter(m => m.spread >= 4 && m.oi > 0)
      .sort((a, b) => b.spread - a.spread)
      .slice(0, 50);

    // ─── Volume Spikes: vol/OI > 1.0, meaning turnover ───────────
    const volSpikes = filtered
      .filter(m => m.vol_oi_ratio > 1.0 && m.vol24h >= 10 && m.oi > 0)
      .sort((a, b) => b.vol_oi_ratio - a.vol_oi_ratio)
      .slice(0, 50);

    // ─── Category Summary ─────────────────────────────────────────
    const catSummary = new Map<string, { count: number; volume: number; oi: number; icon: string }>();
    for (const m of board) {
      const existing = catSummary.get(m.category) || { count: 0, volume: 0, oi: 0, icon: m.icon };
      existing.count++;
      existing.volume += m.vol24h;
      existing.oi += m.oi;
      catSummary.set(m.category, existing);
    }
    const categories = Array.from(catSummary.entries())
      .map(([cat, d]) => ({ category: cat, icon: d.icon, count: d.count, volume: d.volume, oi: d.oi }))
      .sort((a, b) => b.volume - a.volume);

    // ─── Nearest catalyst ─────────────────────────────────────────
    let nearestCloseTime: string | null = null;
    let nearestCategory: string | null = null;
    for (const m of filtered) {
      if (m.close_time && m.vol24h > 0 && (!nearestCloseTime || new Date(m.close_time) < new Date(nearestCloseTime))) {
        nearestCloseTime = m.close_time;
        nearestCategory = m.category;
      }
    }

    const result = {
      hot_markets: hotMarkets,
      wide_spreads: wideSpreads,
      vol_spikes: volSpikes,
      categories,
      stats: {
        totalFetched: rawMarkets.length,
        totalBoard: board.length,
        hotCount: hotMarkets.length,
        wideSpreadCount: wideSpreads.length,
        volSpikeCount: volSpikes.length,
        categoryCount: categories.length,
      },
      next_catalyst: nearestCloseTime ? {
        close_time: nearestCloseTime,
        category: nearestCategory,
        hours_left: hoursUntilClose(nearestCloseTime),
      } : null,
      source: "full_board_v1",
      timestamp: new Date().toISOString(),
    };

    console.log(`Full Board: ${board.length} active markets, ${hotMarkets.length} hot, ${wideSpreads.length} wide spreads, ${volSpikes.length} vol spikes`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Full Board error:", error);
    return new Response(JSON.stringify({ error: error.message, source: "full_board_v1" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
