const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2";

// ─── Sport Detection ────────────────────────────────────────────

const SPORT_MAP: Record<string, { sport: string; icon: string }> = {
  NBA: { sport: "NBA", icon: "🏀" }, WNBA: { sport: "NBA", icon: "🏀" }, CBB: { sport: "NBA", icon: "🏀" },
  NFL: { sport: "NFL", icon: "🏈" }, CFB: { sport: "NFL", icon: "🏈" },
  MLB: { sport: "MLB", icon: "⚾" },
  NHL: { sport: "NHL", icon: "🏒" },
  NRL: { sport: "NRL", icon: "🏉" }, RUGBY: { sport: "NRL", icon: "🏉" }, AFL: { sport: "NRL", icon: "🏉" },
  PGA: { sport: "PGA", icon: "⛳" }, GOLF: { sport: "PGA", icon: "⛳" }, LPGA: { sport: "PGA", icon: "⛳" }, MASTERS: { sport: "PGA", icon: "⛳" },
  ATP: { sport: "Tennis", icon: "🎾" }, WTA: { sport: "Tennis", icon: "🎾" }, TENNIS: { sport: "Tennis", icon: "🎾" },
  MLS: { sport: "Soccer", icon: "⚽" }, EPL: { sport: "Soccer", icon: "⚽" }, UCL: { sport: "Soccer", icon: "⚽" }, FIFA: { sport: "Soccer", icon: "⚽" },
  F1: { sport: "Racing", icon: "🏎️" }, NASCAR: { sport: "Racing", icon: "🏎️" },
  CRICKET: { sport: "Cricket", icon: "🏏" }, IPL: { sport: "Cricket", icon: "🏏" },
};

function detectSport(ticker: string, title: string, category: string): { sport: string; icon: string } | null {
  const combined = `${ticker} ${title} ${category}`.toUpperCase();

  // Direct keyword match
  for (const [key, val] of Object.entries(SPORT_MAP)) {
    if (combined.includes(key)) return val;
  }

  // Fuzzy title match
  const titleLower = title.toLowerCase();
  if (titleLower.includes("basketball") || titleLower.includes("nba")) return { sport: "NBA", icon: "🏀" };
  if (titleLower.includes("football") || titleLower.includes("nfl")) return { sport: "NFL", icon: "🏈" };
  if (titleLower.includes("baseball") || titleLower.includes("mlb")) return { sport: "MLB", icon: "⚾" };
  if (titleLower.includes("hockey") || titleLower.includes("nhl")) return { sport: "NHL", icon: "🏒" };
  if (titleLower.includes("rugby") || titleLower.includes("nrl") || titleLower.includes("league")) return { sport: "NRL", icon: "🏉" };
  if (titleLower.includes("golf") || titleLower.includes("pga") || titleLower.includes("masters")) return { sport: "PGA", icon: "⛳" };
  if (titleLower.includes("soccer") || titleLower.includes("premier league") || titleLower.includes("mls")) return { sport: "Soccer", icon: "⚽" };
  if (titleLower.includes("tennis") || titleLower.includes("atp") || titleLower.includes("wta")) return { sport: "Tennis", icon: "🎾" };
  if (titleLower.includes("f1") || titleLower.includes("nascar") || titleLower.includes("race")) return { sport: "Racing", icon: "🏎️" };

  // Category-based
  if (category.toUpperCase().includes("SPORT")) return { sport: "Other Sports", icon: "🏆" };

  return null; // Not a sport
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

// ─── Prop Detection ─────────────────────────────────────────────

function isPlayerProp(title: string): boolean {
  const propKeywords = [
    "points", "rebounds", "assists", "touchdowns", "yards", "tries",
    "try scorer", "goals", "aces", "birdies", "bogeys", "leader",
    "top ", "over ", "under ", "30+", "20+", "25+", "40+", "50+",
    "most", "first", "last", "anytime", "mvp", "winner",
  ];
  const lower = title.toLowerCase();
  return propKeywords.some(k => lower.includes(k));
}

function isSpreadMarket(title: string): boolean {
  const lower = title.toLowerCase();
  return lower.includes("+") || lower.includes("spread") || lower.includes("margin") || lower.includes("handicap");
}

// ═══════════════════════════════════════════════════════════════════
// CATALYST DETECTION ENGINE
// Hunts for news-driven mispricing, not stale order book math
// ═══════════════════════════════════════════════════════════════════

interface CatalystResult {
  type: string;
  signal: string;
  score: number;
  reasoning: string;
  strategy: string;
  catalyst_tag: string | null;
  fair_value: number;
}

function detectCatalyst(
  m: any,
  yesPrice: number,
  vol24h: number,
  oi: number,
  hoursLeft: number | null,
  sport: string,
  title: string,
  allMarkets: any[],
): CatalystResult {
  const yesBid = (m.yes_bid || 0) / 100;
  const yesAsk = (m.yes_ask || 0) / 100;
  const priceCents = Math.round(yesPrice * 100);
  const maxROI = yesPrice > 0 ? Math.round((1 / yesPrice - 1) * 100) : 0;
  const cashHours = hoursLeft !== null ? hoursLeft.toFixed(0) : "?";
  const midpoint = (yesBid > 0 && yesAsk > 0) ? (yesBid + yesAsk) / 2 : yesPrice;
  const fv = midpoint; // Clean baseline — no stale inflation

  const noResult = (): CatalystResult => ({
    type: "SKIP", signal: "SKIP", score: 0,
    reasoning: "No catalyst detected.", strategy: "NO TRADE.",
    catalyst_tag: null, fair_value: fv,
  });

  // Gate: must be within 48 hours
  if (hoursLeft === null || hoursLeft > 48 || hoursLeft <= 0) return noResult();

  // Gate: must have SOME market activity
  if (oi < 1 && vol24h < 1 && !(yesBid > 0 && yesAsk > 0)) return noResult();

  // Dead contracts
  if (yesPrice > 0.95 || yesPrice <= 0) return noResult();

  const velocityBonus = hoursLeft <= 6 ? 0.25 : hoursLeft <= 12 ? 0.2 : hoursLeft <= 24 ? 0.15 : 0.05;

  // ══════════════════════════════════════════════════════════════
  // RULE 1: BINARY CLIFF — Protect existing positions
  // ══════════════════════════════════════════════════════════════
  if (yesPrice >= 0.85 && hoursLeft <= 4) {
    return {
      type: "BINARY_CLIFF", signal: "SELL_NOW", score: 0.01,
      reasoning: `🚨 ${priceCents}¢ with ${hoursLeft.toFixed(1)}h to settlement. SELL 75% NOW to lock gains.`,
      strategy: `SELL 75%. Free-roll the rest.`,
      catalyst_tag: "FLOOR_DEFENSE", fair_value: fv,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // RULE 2: BREAKING NEWS ARB — Volume Velocity Spike
  // Volume surges 300%+ on a prop/spread under 50¢ = smart money
  // acting on news before price adjusts
  // ══════════════════════════════════════════════════════════════
  const isProp = isPlayerProp(title);
  const isSpread = isSpreadMarket(title);
  const hasVolumeSpike = vol24h >= 50 && oi > 0 && vol24h > oi * 3;
  const isUnderpriced = yesPrice < 0.50;

  if (hasVolumeSpike && isUnderpriced && (isProp || isSpread)) {
    const volRatio = Math.round(vol24h / Math.max(oi, 1) * 100);
    let score = 0.65 + velocityBonus;
    if (vol24h > 200) score += 0.1;
    if (yesPrice < 0.30) score += 0.1;
    score = Math.min(0.99, score);

    return {
      type: "BREAKING_NEWS_ARB", signal: "NEWS_BUY", score,
      reasoning: `📰 BREAKING NEWS ARB: Volume spiked ${volRatio}% vs OI (${vol24h} vol / ${oi} OI) but price still at ${priceCents}¢. Smart money loading before price gaps. ${isProp ? "Player prop" : "Spread"} settling in ${cashHours}h.`,
      strategy: `BUY at ${priceCents}¢. Volume says news is in, price hasn't moved. ${maxROI}% ROI. Cash back ${cashHours}h.`,
      catalyst_tag: "BREAKING_NEWS", fair_value: Math.min(0.99, fv * 1.15),
    };
  }

  // Also flag volume spikes on team-level markets (non-prop)
  if (hasVolumeSpike && isUnderpriced) {
    const volRatio = Math.round(vol24h / Math.max(oi, 1) * 100);
    let score = 0.5 + velocityBonus;
    if (vol24h > 200) score += 0.1;
    score = Math.min(0.99, score);

    return {
      type: "VOLUME_SURGE", signal: "SURGE_BUY", score,
      reasoning: `📊 VOLUME SURGE: ${vol24h} contracts traded vs ${oi} OI (${volRatio}% velocity). Price still ${priceCents}¢. Settling ${cashHours}h.`,
      strategy: `BUY at ${priceCents}¢. Volume leading price. ${maxROI}% ROI.`,
      catalyst_tag: "VOLUME_CATALYST", fair_value: fv,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // RULE 3: NARRATIVE MISMATCH — Team favorite vs cheap player prop
  // If team is 75¢+ but star player's prop is <40¢ = structural mispricing
  // ══════════════════════════════════════════════════════════════
  if (isProp && yesPrice < 0.40) {
    // Look for team markets in the same event priced >75¢
    const eventTicker = m.event_ticker || "";
    const teamFavorites = allMarkets.filter((other: any) =>
      other.event_ticker === eventTicker &&
      other.ticker !== m.ticker &&
      !isPlayerProp(other.title || other.subtitle || "") &&
      ((other.yes_ask || other.last_price || 0) / 100) >= 0.75
    );

    if (teamFavorites.length > 0) {
      const teamPrice = Math.round(((teamFavorites[0].yes_ask || teamFavorites[0].last_price || 0) / 100) * 100);
      let score = 0.6 + velocityBonus;
      if (yesPrice < 0.25) score += 0.15;
      if (teamPrice >= 85) score += 0.1;
      score = Math.min(0.99, score);

      return {
        type: "NARRATIVE_MISMATCH", signal: "MISMATCH_BUY", score,
        reasoning: `🎯 NARRATIVE MISMATCH: Team is ${teamPrice}¢ favorite but this player prop is only ${priceCents}¢. If the team blows them out, the star player almost certainly hits their baseline. Structural mispricing.`,
        strategy: `BUY at ${priceCents}¢. Team @ ${teamPrice}¢ = blowout incoming, prop should be 55-65¢. ${maxROI}% ROI. Cash ${cashHours}h.`,
        catalyst_tag: "NARRATIVE_MISMATCH", fair_value: Math.min(0.99, fv * 1.3),
      };
    }
  }

  // ══════════════════════════════════════════════════════════════
  // SPREAD VALUE — Spreads with OI conviction
  // ══════════════════════════════════════════════════════════════
  if (isSpread && yesPrice >= 0.10 && yesPrice <= 0.65 && oi >= 20) {
    let score = 0.35 + velocityBonus;
    if (vol24h > 30) score += 0.1;
    if (oi > 100) score += 0.1;
    score = Math.min(0.85, score);

    return {
      type: "SPREAD_VALUE", signal: "SPREAD_BUY", score,
      reasoning: `📐 SPREAD VALUE: ${priceCents}¢ spread play with ${oi} OI and ${vol24h} vol. ${cashHours}h to settlement. Line hasn't moved but conviction is building.`,
      strategy: `BUY at ${priceCents}¢. ${maxROI}% ROI. Cash back ${cashHours}h.`,
      catalyst_tag: "SPREAD_PLAY", fair_value: fv,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // PENNY MOMENTUM — Cheap props with some activity
  // "Akshay Bhatia" type: 2¢ lotto with real upside
  // ══════════════════════════════════════════════════════════════
  if (yesPrice > 0.005 && yesPrice <= 0.12 && (oi > 0 || vol24h > 0)) {
    let score = 0.2 + velocityBonus;
    if (isProp) score += 0.15;
    if (vol24h > 10) score += 0.1;
    if (oi > 20) score += 0.1;
    score = Math.min(0.85, score);

    const tag = score >= 0.5 ? "🔥 HOT LOTTO" : "🎲 LOTTO";

    return {
      type: "PENNY_CATALYST", signal: "LOTTO_BUY", score,
      reasoning: `${tag}: ${priceCents}¢ = $1 risk for $${(maxROI / 100 + 1).toFixed(0)} payout. ${isProp ? "Player prop — one hot quarter changes everything." : ""} ${vol24h > 0 ? `${vol24h} vol.` : ""} ${oi > 0 ? `${oi} OI.` : ""} Settles ${cashHours}h.`,
      strategy: `$1-3 LIMIT at ${priceCents}¢. ${maxROI}% ROI. Cash back ${cashHours}h.`,
      catalyst_tag: "MOMENTUM_LOTTO", fair_value: fv,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // GENERAL SPORTS VALUE — Mid-range with market activity
  // ══════════════════════════════════════════════════════════════
  if (yesPrice >= 0.12 && yesPrice <= 0.85 && (oi >= 5 || vol24h >= 5)) {
    let score = 0.15 + velocityBonus;
    if (isProp) score += 0.1;
    if (vol24h > 50) score += 0.1;
    if (oi > 50) score += 0.05;
    score = Math.min(0.7, score);

    return {
      type: "SPORTS_VALUE", signal: "VALUE_BUY", score,
      reasoning: `⚡ ${priceCents}¢ ${isProp ? "player prop" : isSpread ? "spread" : "market"} with ${vol24h} vol / ${oi} OI. Settles ${cashHours}h.`,
      strategy: `BUY at ${priceCents}¢. ${maxROI}% ROI. Cash back ${cashHours}h.`,
      catalyst_tag: null, fair_value: fv,
    };
  }

  return noResult();
}

// ─── Bet Sizing ─────────────────────────────────────────────────

function computeBetSize(score: number, catalystTag: string | null): number {
  if (catalystTag === "BREAKING_NEWS") return Math.min(15.00, +(5.00 + score * 10).toFixed(2));
  if (catalystTag === "NARRATIVE_MISMATCH") return Math.min(12.00, +(4.00 + score * 8).toFixed(2));
  if (catalystTag === "MOMENTUM_LOTTO") return Math.min(3.00, +(1.00 + score).toFixed(2));
  if (catalystTag === "SPREAD_PLAY") return Math.min(10.00, +(3.00 + score * 5).toFixed(2));
  return Math.min(5.00, +(2.00 + score * 3).toFixed(2));
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
    if (res.status === 429) { console.warn(`Events 429 on page ${page}`); break; }
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
  const maxCloseTs = Math.floor((Date.now() + 48 * 3600 * 1000) / 1000); // 48h window
  for (let page = 0; page < 5; page++) {
    if (page > 0) await delay(350);
    const params = new URLSearchParams({ limit: "200", max_close_ts: String(maxCloseTs) });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`${KALSHI_API}/markets?${params}`, { headers: { Accept: "application/json" } });
    if (res.status === 429) { console.warn(`Markets 429 on page ${page}`); break; }
    if (!res.ok) throw new Error(`Kalshi markets: ${res.status}`);
    const data = await res.json();
    const markets = data.markets || [];
    all.push(...markets);
    cursor = data.cursor || null;
    if (!cursor || markets.length < 200) break;
  }
  console.log(`Fetched ${all.length} markets within 48h window`);
  return all;
}

// ─── Main ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const filterSport = body.sport || null;

    const events = await fetchAllEvents();
    await delay(500);
    const rawMarkets = await fetchAllMarkets();

    console.log(`Fetched ${events.length} events, ${rawMarkets.length} markets`);

    const eventMap = new Map<string, any>();
    for (const e of events) eventMap.set(e.event_ticker, e);

    // Classify and filter SPORTS ONLY
    const sportsMarkets: any[] = [];
    let debugSamples: string[] = [];
    let sportDetectedCount = 0;
    let timeFilteredCount = 0;
    let skipCount = 0;

    for (const m of rawMarkets) {
      const event = eventMap.get(m.event_ticker) || {};
      const title = `${m.title || ""} ${m.subtitle || ""} ${event.title || ""}`;
      const detected = detectSport(
        m.ticker || "",
        title,
        event.category || ""
      );

      if (debugSamples.length < 10) {
        debugSamples.push(`ticker=${m.ticker} title="${title.slice(0,60)}" cat="${event.category || 'none'}" detected=${detected ? detected.sport : 'null'}`);
      }

      if (!detected) continue; // NOT a sport — skip entirely
      sportDetectedCount++;

      const yesPrice = (m.yes_ask || m.last_price || 0) / 100;
      const vol24h = m.volume_24h || 0;
      const oi = m.open_interest || 0;
      const closeTime = m.close_time || m.expiration_time || null;
      const hoursLeft = hoursUntilClose(closeTime);

      // 72h velocity window — covers today + tomorrow + day-after buffer
      if (hoursLeft === null || hoursLeft > 72 || hoursLeft <= 0) { timeFilteredCount++; continue; }

      const catalyst = detectCatalyst(m, yesPrice, vol24h, oi, hoursLeft, detected.sport, title, rawMarkets);

      if (catalyst.type === "SKIP") { skipCount++; continue; }

      sportsMarkets.push({
        ticker: m.ticker,
        event_ticker: m.event_ticker,
        series_ticker: event.series_ticker || m.series_ticker || extractSeriesTicker(m.event_ticker || m.ticker),
        title: m.title || m.subtitle || m.ticker,
        event_title: event.title || "",
        sport: detected.sport,
        icon: detected.icon,
        is_prop: isPlayerProp(title),
        is_spread: isSpreadMarket(title),
        yes_price: yesPrice,
        no_price: (m.no_ask || (100 - (m.last_price || 50))) / 100,
        yes_bid: (m.yes_bid || 0) / 100,
        yes_ask: (m.yes_ask || 0) / 100,
        volume_24h: vol24h,
        open_interest: oi,
        close_time: closeTime,
        time_to_event_hours: hoursLeft,
        catalyst_type: catalyst.type,
        catalyst_signal: catalyst.signal,
        catalyst_score: catalyst.score,
        catalyst_reasoning: catalyst.reasoning,
        catalyst_strategy: catalyst.strategy,
        catalyst_tag: catalyst.catalyst_tag,
        fair_value: catalyst.fair_value,
        suggested_bet: computeBetSize(catalyst.score, catalyst.catalyst_tag),
      });
    }

    // Filter by sport if requested
    let filtered = sportsMarkets;
    if (filterSport && filterSport !== "All") {
      filtered = filtered.filter(m => m.sport === filterSport);
    }

    // Sort: BREAKING_NEWS first, then NARRATIVE_MISMATCH, then by time to event
    filtered.sort((a, b) => {
      const typePrio = (t: string) => {
        if (t === "BREAKING_NEWS_ARB") return 500;
        if (t === "NARRATIVE_MISMATCH") return 400;
        if (t === "VOLUME_SURGE") return 350;
        if (t === "SPREAD_VALUE") return 200;
        if (t === "PENNY_CATALYST") return 180;
        if (t === "SPORTS_VALUE") return 100;
        if (t === "BINARY_CLIFF") return 50;
        return 0;
      };
      const pDiff = typePrio(b.catalyst_type) - typePrio(a.catalyst_type);
      if (pDiff !== 0) return pDiff;
      // Within same type: sort by time to event (soonest first)
      return (a.time_to_event_hours || 999) - (b.time_to_event_hours || 999);
    });

    // Build sport summary
    const sportCounts = new Map<string, { count: number; volume: number; icon: string; topCatalyst: string | null }>();
    for (const m of sportsMarkets) {
      const s = sportCounts.get(m.sport) || { count: 0, volume: 0, icon: m.icon, topCatalyst: null };
      s.count++;
      s.volume += m.volume_24h;
      if (!s.topCatalyst && m.catalyst_tag) s.topCatalyst = m.catalyst_tag;
      sportCounts.set(m.sport, s);
    }
    const sportSummary = Array.from(sportCounts.entries())
      .map(([sport, d]) => ({ sport, icon: d.icon, count: d.count, volume: d.volume, top_catalyst: d.topCatalyst }))
      .sort((a, b) => b.count - a.count);

    // Stats
    const stats = {
      totalMarkets: rawMarkets.length,
      sportsOnly: sportsMarkets.length,
      filteredMarkets: filtered.length,
      totalEvents: events.length,
      sportsCategories: sportSummary.length,
      breakingNewsCount: sportsMarkets.filter(m => m.catalyst_type === "BREAKING_NEWS_ARB").length,
      narrativeMismatchCount: sportsMarkets.filter(m => m.catalyst_type === "NARRATIVE_MISMATCH").length,
      volumeSurgeCount: sportsMarkets.filter(m => m.catalyst_type === "VOLUME_SURGE").length,
      pennyCount: sportsMarkets.filter(m => m.catalyst_type === "PENNY_CATALYST").length,
    };

    // Kill switch alerts
    const killAlerts = sportsMarkets
      .filter(m => m.catalyst_type === "BINARY_CLIFF")
      .map(m => ({ ticker: m.ticker, title: m.title, price: m.yes_price, hours: m.time_to_event_hours }));

    return new Response(JSON.stringify({
      markets: filtered.slice(0, 150),
      sport_summary: sportSummary,
      kill_alerts: killAlerts,
      stats,
      source: "sports_catalyst_engine",
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Sports Catalyst Engine error:", error);
    return new Response(JSON.stringify({ error: error.message, source: "sports_catalyst_engine" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
