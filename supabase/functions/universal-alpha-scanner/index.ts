const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2";

// ─── Asset Class Categorization ─────────────────────────────────

const CATEGORY_MAP: Record<string, { class: string; icon: string }> = {
  NBA: { class: "Sports", icon: "🏀" }, WNBA: { class: "Sports", icon: "🏀" },
  NFL: { class: "Sports", icon: "🏈" }, CFB: { class: "Sports", icon: "🏈" },
  MLB: { class: "Sports", icon: "⚾" }, NHL: { class: "Sports", icon: "🏒" },
  NRL: { class: "Sports", icon: "🏉" }, RUGBY: { class: "Sports", icon: "🏉" },
  PGA: { class: "Sports", icon: "⛳" }, GOLF: { class: "Sports", icon: "⛳" },
  ATP: { class: "Sports", icon: "🎾" }, WTA: { class: "Sports", icon: "🎾" },
  F1: { class: "Sports", icon: "🏎️" }, NASCAR: { class: "Sports", icon: "🏎️" },
  MLS: { class: "Sports", icon: "⚽" }, EPL: { class: "Sports", icon: "⚽" },
  CONGRESS: { class: "Politics", icon: "🏛️" }, POTUS: { class: "Politics", icon: "🏛️" },
  SENATE: { class: "Politics", icon: "🏛️" }, HOUSE: { class: "Politics", icon: "🏛️" },
  ELECTION: { class: "Politics", icon: "🏛️" }, GOVERN: { class: "Politics", icon: "🏛️" },
  PARTY: { class: "Politics", icon: "🏛️" }, VOTE: { class: "Politics", icon: "🏛️" },
  TRUMP: { class: "Politics", icon: "🏛️" }, BIDEN: { class: "Politics", icon: "🏛️" },
  MENTION: { class: "Politics", icon: "🏛️" },
  FED: { class: "Economics", icon: "📈" }, RATE: { class: "Economics", icon: "📈" },
  CPI: { class: "Economics", icon: "📈" }, GDP: { class: "Economics", icon: "📈" },
  JOBS: { class: "Economics", icon: "📈" }, INFLATION: { class: "Economics", icon: "📈" },
  RECESSION: { class: "Economics", icon: "📈" }, TREASURY: { class: "Economics", icon: "📈" },
  SP500: { class: "Economics", icon: "📈" }, NASDAQ: { class: "Economics", icon: "📈" },
  BTC: { class: "Crypto", icon: "₿" }, BITCOIN: { class: "Crypto", icon: "₿" },
  ETH: { class: "Crypto", icon: "₿" }, ETHEREUM: { class: "Crypto", icon: "₿" },
  CRYPTO: { class: "Crypto", icon: "₿" },
  OSCAR: { class: "Culture", icon: "🎬" }, GRAMMY: { class: "Culture", icon: "🎬" },
  EMMY: { class: "Culture", icon: "🎬" }, GOLDEN: { class: "Culture", icon: "🎬" },
  MOVIE: { class: "Culture", icon: "🎬" }, AWARD: { class: "Culture", icon: "🎬" },
  TEMP: { class: "Climate", icon: "🌍" }, HURRICANE: { class: "Climate", icon: "🌍" },
  CLIMATE: { class: "Climate", icon: "🌍" }, WEATHER: { class: "Climate", icon: "🌍" },
};

// ─── Pre-Momentum Target Keywords ──────────────────────────────
const PRE_MOMENTUM_TARGETS = [
  "try scorer", "tryscorer", "try_scorer",
  "round 1 leader", "round leader", "r1 leader",
  "weekly mentions", "mention",
  "first goal", "anytime scorer", "anytime goal",
  "top 5", "top 10", "top 20",
  "winner",
];

// ─── High-Profile Event Keywords (the "Amazon" events) ─────────
// These are the events everyone watches but where underdogs get mispriced
const HIGH_PROFILE_KEYWORDS = [
  // Major sports finals / playoffs
  "championship", "playoff", "finals", "super bowl", "world series",
  "stanley cup", "march madness", "grand slam", "masters", "open",
  // Major politics
  "president", "election", "primary", "debate", "impeach", "senate race",
  "governor", "swing state",
  // Economics
  "fed rate", "cpi", "gdp", "recession", "jobs report", "unemployment",
  "inflation", "s&p 500", "nasdaq", "dow",
  // Crypto
  "bitcoin", "ethereum", "btc", "eth", "crypto",
  // Culture
  "oscar", "grammy", "emmy", "super bowl", "world cup",
  // Individual fame (big-name underdogs)
  "mvp", "rookie of the year", "scoring leader", "batting",
  "home run", "touchdown", "triple double",
];

interface ClassifiedMarket {
  ticker: string;
  event_ticker: string;
  series_ticker: string;
  title: string;
  event_title: string;
  asset_class: string;
  icon: string;
  yes_price: number;
  no_price: number;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  volume: number;
  volume_24h: number;
  open_interest: number;
  close_time: string;
  subtitle: string;
  alpha_type: string | null;
  alpha_signal: string | null;
  alpha_score: number;
  alpha_reasoning: string | null;
  alpha_strategy: string | null;
  alpha_tier: string | null;
  suggested_bet: number;
  time_to_event_hours: number | null;
  recovery_tag: string | null;
}

function classifyAssetClass(ticker: string, title: string, category: string): { class: string; icon: string } {
  const combined = `${ticker} ${title} ${category}`.toUpperCase();
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (combined.includes(key)) return val;
  }
  if (category.toUpperCase().includes("SPORT")) return { class: "Sports", icon: "🏆" };
  if (category.toUpperCase().includes("POLITIC")) return { class: "Politics", icon: "🏛️" };
  if (category.toUpperCase().includes("ECON") || category.toUpperCase().includes("FINANC")) return { class: "Economics", icon: "📈" };
  return { class: "Other", icon: "📊" };
}

// ─── Time to Event ──────────────────────────────────────────────

function hoursUntilClose(closeTime: string | null): number | null {
  if (!closeTime) return null;
  const diff = new Date(closeTime).getTime() - Date.now();
  if (diff <= 0) return 0;
  return +(diff / 3600000).toFixed(1);
}

// ─── Early-Entry Sniper Engine ──────────────────────────────────

interface EdgeResult {
  type: string;
  signal: string;
  score: number;
  reasoning: string;
  strategy: string;
  tier: string | null;
  recovery_tag: string | null;
}

function isPreMomentumTarget(title: string): boolean {
  const lower = title.toLowerCase();
  return PRE_MOMENTUM_TARGETS.some(t => lower.includes(t));
}

function detectEdge(m: any, yesPrice: number, noPrice: number, vol24h: number, oi: number, assetClass: string, hoursLeft: number | null): EdgeResult {
  const yesBid = (m.yes_bid || 0) / 100;
  const yesAsk = (m.yes_ask || 0) / 100;
  const noBid = (m.no_bid || 0) / 100;
  const noAsk = (m.no_ask || 0) / 100;
  const spread = yesAsk > 0 && yesBid > 0 ? yesAsk - yesBid : 0;
  const maxROI = yesPrice > 0 ? (1 / yesPrice - 1) : 0;
  const priceCents = Math.round(yesPrice * 100);
  const title = (m.title || m.subtitle || "").toLowerCase();

  // ═══ VELOCITY-1st: GLOBAL 36-HOUR GATE ═══
  // Only same-day / next-day cash turnover. Everything else demoted to zero.
  const VELOCITY_MAX_HOURS = 36;
  const within36h = hoursLeft !== null && hoursLeft > 0 && hoursLeft <= VELOCITY_MAX_HOURS;
  const within24h = hoursLeft !== null && hoursLeft > 0 && hoursLeft <= 24;
  const within6h = hoursLeft !== null && hoursLeft > 0 && hoursLeft <= 6;

  // Binary Cliff still applies regardless of time gate (capital protection)
  if (yesPrice >= 0.85 && hoursLeft !== null && hoursLeft <= 4) {
    const profitPct = Math.round((yesPrice - 0.10) / 0.10 * 100);
    return {
      type: "BINARY_CLIFF",
      signal: "IMMEDIATE_LIQUIDATION",
      score: 0.01,
      reasoning: `🚨 BINARY CLIFF: ${priceCents}¢ with only ${hoursLeft.toFixed(1)}h left. Take 75% off NOW.`,
      strategy: `SELL 75% NOW: Lock gains. Leave 25% as free-roll.`,
      tier: "FLOOR_DEFENSE",
      recovery_tag: "FLOOR_DEFENSE",
    };
  }

  // Settled / Dead bypass time gate
  if (yesPrice > 0.95) {
    return { type: "SETTLED", signal: "NO_EDGE", score: 0, reasoning: `${priceCents}¢ — done.`, strategy: "NO TRADE.", tier: "FLOOR_DEFENSE", recovery_tag: "FLOOR_DEFENSE" };
  }
  if (yesPrice <= 0) {
    return { type: "DEAD", signal: "NO_EDGE", score: 0, reasoning: "0¢ — dead.", strategy: "NO TRADE.", tier: null, recovery_tag: null };
  }
  if (yesPrice > 0 && yesPrice <= 0.02 && oi > 0) {
    return {
      type: "MATHEMATICAL_DEATH",
      signal: "INSTANT_LIQUIDATION",
      score: 0,
      reasoning: `${priceCents}¢ with ${oi} OI — 0% probability. Sell to recover capital.`,
      strategy: "LIQUIDATE: Dead position. Sell at any price.",
      tier: null,
      recovery_tag: null,
    };
  }

  // ═══ VELOCITY GATE: Demote anything > 36 hours ═══
  if (!within36h) {
    return {
      type: "TOO_FAR_OUT",
      signal: "NO_EDGE",
      score: 0,
      reasoning: `${hoursLeft !== null ? Math.round(hoursLeft) + 'h' : '?'} out — outside 36h velocity window. We only trade same-day cash turnover.`,
      strategy: "SKIP: Wait until < 36h for velocity plays.",
      tier: null,
      recovery_tag: null,
    };
  }

  // ═══ LIQUIDITY GATE ═══
  const hasRealOI = oi >= 5;
  const hasRealVolume = vol24h >= 5;
  const hasTwoSidedBook = yesBid > 0 && yesAsk > 0 && (yesAsk - yesBid) < 0.15;
  const hasRealLiquidity = hasRealOI || hasRealVolume || (hasTwoSidedBook && oi > 0);
  if (!hasRealLiquidity) {
    return {
      type: "NO_ORDERBOOK",
      signal: "SKIP",
      score: 0,
      reasoning: `${priceCents}¢ — OI:${oi}, Vol24h:${vol24h}. Not enough liquidity.`,
      strategy: "SKIP: No real orderbook.",
      tier: null,
      recovery_tag: null,
    };
  }

  const isHighProfile = HIGH_PROFILE_KEYWORDS.some(k => title.includes(k) || (m.event_title || "").toLowerCase().includes(k));
  const cashHours = hoursLeft !== null ? hoursLeft.toFixed(0) : "?";

  // ══════════════════════════════════════════════════════════════
  // VELOCITY RULE 1: "WHOLESALE SPREAD" — Cash Arbitrage
  // Bid/Ask spread > 15¢ = buy wholesale, sell at settle price
  // ══════════════════════════════════════════════════════════════
  if (spread >= 0.15 && yesBid > 0 && yesAsk > 0 && yesPrice >= 0.05 && yesPrice <= 0.90) {
    const midpoint = (yesBid + yesAsk) / 2;
    const limitPrice = yesBid + 0.01; // 1¢ above best bid
    const limitCents = Math.round(limitPrice * 100);
    const midCents = Math.round(midpoint * 100);
    const spreadCents = Math.round(spread * 100);
    const edgeCents = Math.round((midpoint - limitPrice) * 100);
    const turnoverROI = yesPrice > 0 ? Math.round((1 / limitPrice - 1) * 100) : 0;

    let score = 0.5;
    if (spread >= 0.25) score += 0.15;
    if (within6h) score += 0.2;
    else if (within24h) score += 0.1;
    if (oi > 100) score += 0.1;
    if (vol24h < 50 && oi > 50) score += 0.1; // liquidity trap bonus
    score = Math.min(0.99, score);

    return {
      type: "CASH_ARBITRAGE",
      signal: "WHOLESALE_SPREAD",
      score: +score.toFixed(3),
      reasoning: `💰 CASH ARB: ${spreadCents}¢ spread (Bid ${Math.round(yesBid*100)}¢ / Ask ${Math.round(yesAsk*100)}¢). Buy wholesale at ${limitCents}¢ (1¢ above bid). Settles in ${cashHours}h — capital back by ${within24h ? 'tonight' : 'tomorrow'}. ${oi > 100 ? `${oi} OI trapped.` : ''}`,
      strategy: `LIMIT ORDER: ${limitCents}¢ (wholesale). Mid=${midCents}¢. ${edgeCents}¢ instant edge. ${turnoverROI}% ROI in ${cashHours}h.`,
      tier: "ACCELERATOR",
      recovery_tag: "ACCELERATOR",
    };
  }

  // ══════════════════════════════════════════════════════════════
  // VELOCITY RULE 2: "LIQUIDITY TRAP" — Ghost Volume Catalyst
  // OI > 500 but 24h Vol < 50 = money is trapped, name your price
  // ══════════════════════════════════════════════════════════════
  if (oi > 500 && vol24h < 50 && yesPrice >= 0.03 && yesPrice <= 0.90) {
    const limitPrice = yesBid > 0 ? yesBid + 0.01 : yesPrice;
    const limitCents = Math.round(limitPrice * 100);
    const turnoverROI = Math.round((1 / limitPrice - 1) * 100);

    let score = 0.55;
    if (oi > 1000) score += 0.15;
    if (vol24h === 0) score += 0.1; // completely dead volume = max trap
    if (within6h) score += 0.15;
    else if (within24h) score += 0.1;
    if (spread >= 0.10) score += 0.1; // wide spread + trapped = goldmine
    score = Math.min(0.99, score);

    return {
      type: "LIQUIDITY_TRAP",
      signal: "GHOST_CATALYST",
      score: +score.toFixed(3),
      reasoning: `🕳️ LIQUIDITY TRAP: ${oi} OI trapped but only ${vol24h} traded in 24h. Money locked in — nobody trading. YOU name the price with a limit order. Settles in ${cashHours}h.`,
      strategy: `LIMIT SNIPE: ${limitCents}¢. ${oi} contracts trapped. ${turnoverROI}% ROI. Cash back in ${cashHours}h.`,
      tier: "ACCELERATOR",
      recovery_tag: "ACCELERATOR",
    };
  }

  // ══════════════════════════════════════════════════════════════
  // VELOCITY RULE 3: Combined — cheap + fast settle = velocity penny
  // ══════════════════════════════════════════════════════════════
  if (yesPrice > 0.005 && yesPrice <= 0.15) {
    const roi = Math.round(maxROI * 100);
    const hasSmartMoney = oi > 100 && vol24h < 500;
    const isTarget = isPreMomentumTarget(title);

    let score = 0.25;
    if (yesPrice <= 0.05) score += 0.15;
    if (yesPrice <= 0.03) score += 0.1;
    if (within6h) score += 0.2;
    else if (within24h) score += 0.1;
    if (isHighProfile) score += 0.15;
    if (hasSmartMoney) score += 0.15;
    if (oi > 20) score += 0.05;
    if (isTarget) score += 0.1;
    if (spread >= 0.10) score += 0.05; // wholesale opportunity
    score = Math.min(0.99, score);

    const tag = score >= 0.6 ? "🏆 HIDDEN GEM" : score >= 0.4 ? "💎 PENNY ALPHA" : "🌱 SEEDLING";

    return {
      type: "VELOCITY_PENNY",
      signal: "FAST_TURNOVER",
      score: +score.toFixed(3),
      reasoning: `${tag}: ${priceCents}¢ settling in ${cashHours}h. Risk $1 to make $${(maxROI + 1).toFixed(0)}. ${hasSmartMoney ? `${oi} OI / ${vol24h} vol — ghost volume.` : oi > 0 ? `${oi} OI.` : ''} Cash back ${within24h ? 'TONIGHT' : 'tomorrow'}.`,
      strategy: `$1-3 LIMIT at ${priceCents}¢. ${roi}% ROI. Capital returns in ${cashHours}h.`,
      tier: "ACCELERATOR",
      recovery_tag: "ACCELERATOR",
    };
  }

  // ══════════════════════════════════════════════════════════════
  // Spread Arb (guaranteed profit — always show if within velocity window)
  // ══════════════════════════════════════════════════════════════
  if (yesAsk > 0 && noAsk > 0 && (yesAsk + noAsk) < 0.95) {
    const arb = 1 - (yesAsk + noAsk);
    const score = Math.min(1, arb * 5 + (within24h ? 0.2 : 0));
    return {
      type: "SPREAD_ARB",
      signal: "BUY_BOTH",
      score: +score.toFixed(3),
      reasoning: `💰 GUARANTEED PROFIT: Yes ${Math.round(yesAsk * 100)}¢ + No ${Math.round(noAsk * 100)}¢ = ${Math.round((yesAsk + noAsk) * 100)}¢. ${Math.round(arb * 100)}¢ risk-free. Settles in ${cashHours}h.`,
      strategy: "ARBITRAGE: Buy both sides. Guaranteed profit. Cash back in " + cashHours + "h.",
      tier: "ACCELERATOR",
      recovery_tag: "ACCELERATOR",
    };
  }

  // ══════════════════════════════════════════════════════════════
  // Velocity Value plays (15-85¢ within 36h with liquidity)
  // ══════════════════════════════════════════════════════════════
  if (yesPrice >= 0.15 && yesPrice < 0.85) {
    const roi = Math.round(maxROI * 100);
    let score = 0.1;
    if (vol24h > 50) score += 0.1;
    if (oi > 100) score += 0.1;
    if (within6h) score += 0.15;
    if (spread >= 0.08) score += 0.1; // wide spread = limit snipe opportunity
    score = Math.min(0.8, score);

    const limitEntry = yesBid > 0 ? Math.round((yesBid + 0.01) * 100) : priceCents;

    return {
      type: "VELOCITY_VALUE",
      signal: "FAST_VALUE",
      score: +score.toFixed(3),
      reasoning: `⚡ VELOCITY: ${priceCents}¢, settles in ${cashHours}h. ${roi}% ROI. ${vol24h > 0 ? `${vol24h} vol.` : ''} ${oi > 0 ? `${oi} OI.` : ''} ${spread >= 0.08 ? `${Math.round(spread * 100)}¢ spread — limit snipe.` : ''}`,
      strategy: `LIMIT at ${limitEntry}¢. ${roi}% return. Cash back in ${cashHours}h.`,
      tier: roi > 200 ? "ACCELERATOR" : "VALUE",
      recovery_tag: roi > 200 ? "ACCELERATOR" : null,
    };
  }

  // Favorites within velocity window
  if (yesPrice >= 0.85 && yesPrice <= 0.95) {
    const roi = Math.round(maxROI * 100);
    return {
      type: "VELOCITY_SAFE",
      signal: "SAFE_TURNOVER",
      score: 0.05,
      reasoning: `${priceCents}¢ — near certain. ${roi}% in ${cashHours}h.`,
      strategy: `Safe ${roi}% return. Cash back in ${cashHours}h.`,
      tier: "FLOOR_DEFENSE",
      recovery_tag: "FLOOR_DEFENSE",
    };
  }

  return {
    type: "LOW_LIQUIDITY",
    signal: "SPECULATIVE",
    score: 0.02,
    reasoning: `${priceCents}¢ — low liquidity. ${cashHours}h to settle.`,
    strategy: `SPECULATIVE: Hard to trade.`,
    tier: null,
    recovery_tag: null,
  };
}

// ─── Bet Sizing ─────────────────────────────────────────────────

function computeBetSize(alphaScore: number, confidence: number, tier: string | null): number {
  if (tier === "ACCELERATOR") {
    // Recovery mode: slightly larger bets on high-conviction lottos
    const base = alphaScore >= 0.5 ? 5.00 : alphaScore >= 0.3 ? 3.50 : 2.50;
    return Math.min(5.00, +(base * Math.min(confidence / 10, 1)).toFixed(2));
  }
  const base = alphaScore >= 0.5 ? 5.00 : alphaScore >= 0.3 ? 3.00 : alphaScore >= 0.15 ? 2.00 : alphaScore >= 0.05 ? 1.00 : 0;
  return Math.min(5.00, +(base * Math.min(confidence / 10, 1)).toFixed(2));
}

function extractSeriesTicker(eventTicker: string): string {
  if (!eventTicker) return "";
  const match = eventTicker.match(/^([A-Z0-9]+)-\d{2}[A-Z]{3}\d{2}/);
  if (match) return match[1];
  const parts = eventTicker.split("-");
  return parts[0] || eventTicker;
}

// ─── Paginated Fetchers (rate-limit safe) ───────────────────────

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchAllEvents(): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | null = null;
  const maxPages = 3; // keep small to avoid 429
  for (let page = 0; page < maxPages; page++) {
    if (page > 0) await delay(350); // throttle between pages
    const params = new URLSearchParams({ limit: "200", status: "open" });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`${KALSHI_API}/events?${params}`, { headers: { Accept: "application/json" } });
    if (res.status === 429) { console.warn(`Events 429 on page ${page}, stopping`); break; }
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
  const maxPages = 5; // cap at ~1000 markets
  for (let page = 0; page < maxPages; page++) {
    if (page > 0) await delay(350);
    const params = new URLSearchParams({ limit: "200", status: "open" });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`${KALSHI_API}/markets?${params}`, { headers: { Accept: "application/json" } });
    if (res.status === 429) { console.warn(`Markets 429 on page ${page}, stopping`); break; }
    if (!res.ok) throw new Error(`Kalshi markets: ${res.status}`);
    const data = await res.json();
    const markets = data.markets || [];
    all.push(...markets);
    cursor = data.cursor || null;
    if (!cursor || markets.length < 200) break;
  }
  return all;
}

// ─── Main ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const filterClass = body.asset_class || null;
    const confidence = Math.max(1, Math.min(10, body.confidence || 5));
    const dailyBudget = body.daily_budget || 25.00;
    const recoveryGoal = body.recovery_goal || 130.00;

    // Fetch events first, then markets (sequential to avoid 429)
    const events = await fetchAllEvents();
    await delay(500); // breathing room between endpoints
    const markets = await fetchAllMarkets();

    console.log(`Fetched ${events.length} events, ${markets.length} markets`);

    const eventMap = new Map<string, any>();
    for (const e of events) eventMap.set(e.event_ticker, e);

    const classified: ClassifiedMarket[] = markets.map((m: any) => {
      const event = eventMap.get(m.event_ticker) || {};
      const { class: assetClass, icon } = classifyAssetClass(
        m.ticker || "",
        (m.title || "") + " " + (event.title || ""),
        event.category || ""
      );

      const yesPrice = (m.yes_ask || m.last_price || 0) / 100;
      const noPrice = (m.no_ask || (100 - (m.last_price || 50))) / 100;
      const vol24h = m.volume_24h || 0;
      const oi = m.open_interest || 0;
      const closeTime = m.close_time || m.expiration_time || null;
      const hoursLeft = hoursUntilClose(closeTime);

      const edge = detectEdge(m, yesPrice, noPrice, vol24h, oi, assetClass, hoursLeft);

      return {
        ticker: m.ticker,
        event_ticker: m.event_ticker,
        series_ticker: event.series_ticker || m.series_ticker || extractSeriesTicker(m.event_ticker || m.ticker),
        title: m.title || m.subtitle || m.ticker,
        event_title: event.title || "",
        asset_class: assetClass,
        icon,
        yes_price: yesPrice,
        no_price: noPrice,
        yes_bid: (m.yes_bid || 0) / 100,
        yes_ask: (m.yes_ask || 0) / 100,
        no_bid: (m.no_bid || 0) / 100,
        no_ask: (m.no_ask || 0) / 100,
        last_price: (m.last_price || 0) / 100,
        volume: m.volume || 0,
        volume_24h: vol24h,
        open_interest: oi,
        close_time: closeTime,
        subtitle: m.subtitle || "",
        alpha_type: edge.type,
        alpha_signal: edge.signal,
        alpha_score: edge.score,
        alpha_reasoning: edge.reasoning,
        alpha_strategy: edge.strategy,
        alpha_tier: edge.tier,
        suggested_bet: computeBetSize(edge.score, confidence, edge.tier),
        time_to_event_hours: hoursLeft,
        recovery_tag: edge.recovery_tag,
      };
    });

    let filtered = classified;
    if (filterClass && filterClass !== "All") {
      filtered = classified.filter(m => m.asset_class === filterClass);
    }

    // Sort: VELOCITY-1st — Cash Arbitrage > Liquidity Trap > Velocity Penny > Spread Arb
    const typePriority = (m: ClassifiedMarket) => {
      if (m.alpha_type === "CASH_ARBITRAGE") return 400;
      if (m.alpha_type === "LIQUIDITY_TRAP") return 350;
      if (m.alpha_type === "SPREAD_ARB") return 300;
      if (m.alpha_type === "VELOCITY_PENNY") return 250;
      if (m.alpha_type === "VELOCITY_VALUE") return 100;
      if (m.alpha_type === "BINARY_CLIFF") return 90;
      if (m.recovery_tag === "ACCELERATOR") return 50;
      return 0;
    };
    filtered.sort((a, b) => {
      const pDiff = typePriority(b) - typePriority(a);
      if (pDiff !== 0) return pDiff;
      return (b.alpha_score - a.alpha_score) || (b.volume_24h - a.volume_24h);
    });

    // Build heatmap
    const heatmap = new Map<string, { count: number; volume: number; totalAlpha: number; topSignal: string | null; icon: string }>();
    for (const m of classified) {
      const h = heatmap.get(m.asset_class) || { count: 0, volume: 0, totalAlpha: 0, topSignal: null, icon: m.icon };
      h.count++;
      h.volume += m.volume_24h;
      h.totalAlpha += m.alpha_score;
      if (!h.topSignal && m.alpha_signal) h.topSignal = m.alpha_signal;
      heatmap.set(m.asset_class, h);
    }
    const heatmapArr = Array.from(heatmap.entries()).map(([cls, d]) => ({
      asset_class: cls,
      icon: d.icon,
      count: d.count,
      volume: d.volume,
      avg_alpha: d.count > 0 ? +(d.totalAlpha / d.count).toFixed(4) : 0,
      top_signal: d.topSignal,
    })).sort((a, b) => b.avg_alpha - a.avg_alpha);

    // Edge alerts — top opportunities prioritizing pre-momentum
    const alerts = classified
      .filter(m => m.alpha_score > 0.05 || m.alpha_type === "GHOST_VOLUME" || m.alpha_type === "BINARY_CLIFF")
      .sort((a, b) => {
        const aPrio = a.alpha_type === "GHOST_VOLUME" ? 100 : a.alpha_type === "BINARY_CLIFF" ? 90 : a.recovery_tag === "ACCELERATOR" ? 50 : 0;
        const bPrio = b.alpha_type === "GHOST_VOLUME" ? 100 : b.alpha_type === "BINARY_CLIFF" ? 90 : b.recovery_tag === "ACCELERATOR" ? 50 : 0;
        if (aPrio !== bPrio) return bPrio - aPrio;
        return b.alpha_score - a.alpha_score;
      })
      .slice(0, 12)
      .map(m => ({
        ticker: m.ticker,
        title: m.title,
        event_title: m.event_title,
        asset_class: m.asset_class,
        icon: m.icon,
        type: m.alpha_type,
        signal: m.alpha_signal,
        score: m.alpha_score,
        reasoning: m.alpha_reasoning,
        strategy: m.alpha_strategy,
        price: m.yes_price,
        bet: m.suggested_bet,
        event_ticker: m.event_ticker,
        series_ticker: m.series_ticker,
        tier: m.alpha_tier,
        recovery_tag: m.recovery_tag,
        time_to_event_hours: m.time_to_event_hours,
        open_interest: m.open_interest,
        volume_24h: m.volume_24h,
      }));

    const liquidations = classified
      .filter(m => m.alpha_type === "MATHEMATICAL_DEATH" || m.alpha_type === "BINARY_CLIFF")
      .map(m => ({
        ticker: m.ticker,
        title: m.title,
        price: m.yes_price,
        open_interest: m.open_interest,
        reasoning: m.alpha_reasoning,
        type: m.alpha_type,
      }));

    // Recovery stats
    const accelerators = classified.filter(m => m.recovery_tag === "ACCELERATOR");
    const recoveryStats = {
      goal: recoveryGoal,
      accelerator_count: accelerators.length,
      best_roi_pct: accelerators.length > 0 ? Math.max(...accelerators.map(m => m.yes_price > 0 ? (1 / m.yes_price - 1) * 100 : 0)) : 0,
      ghost_volume_count: classified.filter(m => m.alpha_type === "GHOST_VOLUME" || m.alpha_type === "PRE_MOMENTUM_LOTTO" || m.alpha_type === "PENNY_AMAZON").length,
      lotto_count: classified.filter(m => m.alpha_type === "ASYMMETRIC_LOTTO" || m.alpha_type === "PRE_MOMENTUM_LOTTO" || m.alpha_type === "LOW_ALPHA_LOTTO" || m.alpha_type === "PENNY_AMAZON").length,
      penny_amazon_count: classified.filter(m => m.alpha_type === "PENNY_AMAZON").length,
    };

    return new Response(JSON.stringify({
      heatmap: heatmapArr,
      alerts,
      liquidations,
      markets: filtered.slice(0, 100),
      recovery: recoveryStats,
      stats: {
        totalMarkets: classified.length,
        filteredMarkets: filtered.length,
        totalEvents: events.length,
        assetClasses: heatmapArr.length,
        activeAlerts: alerts.length,
        dailyBudget,
        confidence,
      },
      source: "kalshi_live",
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Universal scanner error:", error);
    return new Response(JSON.stringify({ error: error.message, source: "kalshi_live" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
