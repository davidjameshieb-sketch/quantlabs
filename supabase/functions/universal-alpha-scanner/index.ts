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
  UCL: { class: "Sports", icon: "⚽" }, FIFA: { class: "Sports", icon: "⚽" },
  CRICKET: { class: "Sports", icon: "🏏" }, IPL: { class: "Sports", icon: "🏏" },
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
  const parts = eventTicker.split("-");
  return parts[0] || eventTicker;
}

// ═══════════════════════════════════════════════════════════════════
// FAIR VALUE ESTIMATOR
// Uses market-structure signals to estimate what the "real" probability is,
// then compares to Kalshi price to find arbitrage.
// ═══════════════════════════════════════════════════════════════════

function estimateFairValue(m: any, yesPrice: number, vol24h: number, oi: number, hoursLeft: number | null): number {
  const lastPrice = (m.last_price || 0) / 100;
  const yesBid = (m.yes_bid || 0) / 100;
  const yesAsk = (m.yes_ask || 0) / 100;
  const midpoint = (yesBid > 0 && yesAsk > 0) ? (yesBid + yesAsk) / 2 : 0;

  // Use multiple signals to triangulate fair value — key insight: 
  // if last_price differs from ask, the "real" value is closer to last_price
  const prices: number[] = [];
  if (lastPrice > 0) prices.push(lastPrice);
  if (midpoint > 0) prices.push(midpoint);
  if (yesPrice > 0) prices.push(yesPrice);

  if (prices.length === 0) return yesPrice;

  // Start with highest available signal (market usually underprices vs consensus)
  let fv = Math.max(...prices);

  // OI conviction boost: if many contracts are locked in, smart money sees more value
  if (oi > 100) fv = Math.max(fv, fv * 1.08);
  if (oi > 500) fv = Math.max(fv, fv * 1.12);

  // Volume momentum: active trading with recent trades above ask = bullish
  if (vol24h > 50 && lastPrice > yesPrice) {
    fv = Math.max(fv, lastPrice * 1.05);
  }

  // Ghost volume premium: high OI + low volume = trapped money, real value is higher
  if (oi > 50 && vol24h < 20) {
    fv = Math.max(fv, yesPrice * 1.15);
  }

  // Time decay convergence: near-settlement markets trend toward 0 or 1
  if (hoursLeft !== null && hoursLeft < 12 && lastPrice > 0.3 && lastPrice < 0.7) {
    // Markets near settlement with activity — value is higher than shown
    fv = Math.max(fv, lastPrice * 1.10);
  }

  // Wide spread premium: if spread is wide, the "real" price is above midpoint
  if (yesBid > 0 && yesAsk > 0) {
    const spread = yesAsk - yesBid;
    if (spread > 0.03) {
      fv = Math.max(fv, midpoint + spread * 0.2);
    }
  }

  return Math.min(0.99, Math.max(0.01, +fv.toFixed(3)));
}

// ═══════════════════════════════════════════════════════════════════
// EDGE DETECTION ENGINE — Arb-First, Velocity-Prioritized
// ═══════════════════════════════════════════════════════════════════

interface EdgeResult {
  type: string;
  signal: string;
  score: number;
  reasoning: string;
  strategy: string;
  tier: string | null;
  recovery_tag: string | null;
  fair_value: number;
  arb_edge_pct: number;
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

  const MAX_HOURS = 168;
  const within6h = hoursLeft !== null && hoursLeft > 0 && hoursLeft <= 6;
  const within24h = hoursLeft !== null && hoursLeft > 0 && hoursLeft <= 24;
  const within48h = hoursLeft !== null && hoursLeft > 0 && hoursLeft <= 48;
  const within7d = hoursLeft !== null && hoursLeft > 0 && hoursLeft <= MAX_HOURS;
  const cashHours = hoursLeft !== null ? hoursLeft.toFixed(0) : "?";
  const velocityBonus = within6h ? 0.25 : within24h ? 0.2 : within48h ? 0.15 : within7d ? 0.05 : 0;

  // Fair value estimation
  const fairValue = estimateFairValue(m, yesPrice, vol24h, oi, hoursLeft);
  const arbEdge = yesPrice > 0 ? (fairValue - yesPrice) / yesPrice : 0;
  const arbEdgePct = Math.round(arbEdge * 100);
  const noResult = (type: string, reason: string): EdgeResult => ({
    type, signal: "SKIP", score: 0, reasoning: reason, strategy: "NO TRADE.",
    tier: null, recovery_tag: null, fair_value: fairValue, arb_edge_pct: arbEdgePct,
  });

  // ── Capital protection first ──
  if (yesPrice >= 0.85 && hoursLeft !== null && hoursLeft <= 4) {
    return {
      type: "BINARY_CLIFF", signal: "IMMEDIATE_LIQUIDATION", score: 0.01,
      reasoning: `🚨 ${priceCents}¢ with ${hoursLeft.toFixed(1)}h left. SELL 75% NOW.`,
      strategy: `SELL 75%: Lock gains. Free-roll the rest.`,
      tier: "FLOOR_DEFENSE", recovery_tag: "FLOOR_DEFENSE",
      fair_value: fairValue, arb_edge_pct: 0,
    };
  }
  if (yesPrice > 0.95) return noResult("SETTLED", `${priceCents}¢ — settled.`);
  if (yesPrice <= 0) return noResult("DEAD", "0¢ — dead.");
  if (yesPrice > 0 && yesPrice <= 0.02 && oi > 0) {
    return { ...noResult("MATHEMATICAL_DEATH", `${priceCents}¢ / ${oi} OI — dead. Liquidate.`), strategy: "LIQUIDATE at any price." };
  }

  // Time gate: 7 days max
  if (hoursLeft !== null && hoursLeft > MAX_HOURS) {
    return noResult("TOO_FAR_OUT", `${Math.round(hoursLeft / 24)}d out — outside 7d window.`);
  }

  // Liquidity gate — very relaxed to surface opportunities
  const hasRealOI = oi >= 1;
  const hasRealVolume = vol24h >= 1;
  const hasTwoSidedBook = yesBid > 0 && yesAsk > 0;
  const hasRealLiquidity = hasRealOI || hasRealVolume || hasTwoSidedBook;
  if (!hasRealLiquidity) {
    return noResult("NO_ORDERBOOK", `${priceCents}¢ — OI:${oi}, Vol:${vol24h}. No liquidity.`);
  }

  // ══════════════════════════════════════════════════════════════
  // TIER 1: GUARANTEED ARB — Buy Yes + No < $1
  // ══════════════════════════════════════════════════════════════
  if (yesAsk > 0 && noAsk > 0 && (yesAsk + noAsk) < 0.95) {
    const arb = 1 - (yesAsk + noAsk);
    const score = Math.min(0.99, arb * 5 + velocityBonus);
    return {
      type: "GUARANTEED_ARB", signal: "BUY_BOTH", score: +score.toFixed(3),
      reasoning: `💰 GUARANTEED: Yes ${Math.round(yesAsk*100)}¢ + No ${Math.round(noAsk*100)}¢ = ${Math.round((yesAsk+noAsk)*100)}¢. ${Math.round(arb*100)}¢ risk-free. Cash back in ${cashHours}h.`,
      strategy: `BUY BOTH SIDES. ${Math.round(arb*100)}¢ guaranteed profit per contract.`,
      tier: "ACCELERATOR", recovery_tag: "ACCELERATOR",
      fair_value: fairValue, arb_edge_pct: 100,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // TIER 2: PRICE ARB — Fair Value significantly above Kalshi price
  // The "Charlotte spread" and "Penrith Panthers" type plays
  // ══════════════════════════════════════════════════════════════
  if (arbEdge >= 0.03 && yesPrice >= 0.03 && yesPrice <= 0.90) {
    const limitCents = yesBid > 0 ? Math.round((yesBid + 0.01) * 100) : priceCents;
    const roi = Math.round(maxROI * 100);

    let score = 0.3 + velocityBonus;
    if (arbEdge >= 0.50) score += 0.3;      // massive arb like Panthers
    else if (arbEdge >= 0.25) score += 0.2;  // strong arb like Charlotte
    else if (arbEdge >= 0.15) score += 0.1;
    if (oi > 100) score += 0.1;
    if (vol24h > 20) score += 0.05;
    if (hasTwoSidedBook) score += 0.05;
    score = Math.min(0.99, score);

    const arbLabel = arbEdgePct >= 40 ? "🔥 MASSIVE ARB" : arbEdgePct >= 20 ? "💰 STRONG ARB" : "📊 VALUE ARB";
    const settleLabel = within24h ? "TONIGHT" : within48h ? `${cashHours}h` : `${Math.round((hoursLeft || 0) / 24)}d`;

    return {
      type: "PRICE_ARB", signal: "ARB_BUY", score: +score.toFixed(3),
      reasoning: `${arbLabel}: Kalshi has this at ${priceCents}¢ (${priceCents}% implied) but fair value is ${Math.round(fairValue*100)}¢ (${Math.round(fairValue*100)}%). That's a ${arbEdgePct}% discount. ${oi > 0 ? `${oi} OI.` : ''} ${vol24h > 0 ? `${vol24h} vol.` : ''} Settles ${settleLabel}.`,
      strategy: `LIMIT at ${limitCents}¢. FV=${Math.round(fairValue*100)}¢. ${arbEdgePct}% edge. ${roi}% max ROI. Cash back ${settleLabel}.`,
      tier: "ACCELERATOR", recovery_tag: "ACCELERATOR",
      fair_value: fairValue, arb_edge_pct: arbEdgePct,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // TIER 3: WHOLESALE SPREAD — Wide bid/ask = buy at wholesale
  // ══════════════════════════════════════════════════════════════
  if (spread >= 0.04 && yesBid > 0 && yesAsk > 0 && yesPrice >= 0.03 && yesPrice <= 0.95) {
    const limitPrice = yesBid + 0.01;
    const limitCents = Math.round(limitPrice * 100);
    const spreadCents = Math.round(spread * 100);
    const edgeCents = Math.round(((yesAsk + yesBid) / 2 - limitPrice) * 100);

    let score = 0.35 + velocityBonus;
    if (spread >= 0.25) score += 0.15;
    if (oi > 100) score += 0.1;
    if (vol24h < 50 && oi > 50) score += 0.1;
    score = Math.min(0.99, score);

    return {
      type: "WHOLESALE_SPREAD", signal: "LIMIT_SNIPE", score: +score.toFixed(3),
      reasoning: `🏪 WHOLESALE: ${spreadCents}¢ spread (Bid ${Math.round(yesBid*100)}¢ / Ask ${Math.round(yesAsk*100)}¢). Buy at ${limitCents}¢ — ${edgeCents}¢ below mid. ${oi > 50 ? `${oi} OI trapped.` : ''} Settles ${cashHours}h.`,
      strategy: `LIMIT at ${limitCents}¢. ${edgeCents}¢ instant edge vs midpoint. Cash back ${cashHours}h.`,
      tier: "ACCELERATOR", recovery_tag: "ACCELERATOR",
      fair_value: fairValue, arb_edge_pct: arbEdgePct,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // TIER 4: LIQUIDITY TRAP — High OI, dead volume, name your price
  // ══════════════════════════════════════════════════════════════
  if (oi > 30 && vol24h < oi * 0.5 && yesPrice >= 0.02 && yesPrice <= 0.95) {
    const limitCents = yesBid > 0 ? Math.round((yesBid + 0.01) * 100) : priceCents;
    const roi = Math.round((1 / (yesBid > 0 ? yesBid + 0.01 : yesPrice) - 1) * 100);

    let score = 0.3 + velocityBonus;
    if (oi > 500) score += 0.15;
    else if (oi > 200) score += 0.1;
    if (vol24h === 0) score += 0.1;
    if (spread >= 0.10) score += 0.1;
    score = Math.min(0.99, score);

    return {
      type: "LIQUIDITY_TRAP", signal: "GHOST_SNIPE", score: +score.toFixed(3),
      reasoning: `🕳️ TRAP: ${oi} OI locked in but only ${vol24h} traded in 24h. Dead volume = you name the price. Settles ${cashHours}h. ${arbEdgePct > 10 ? `FV ${Math.round(fairValue*100)}¢ vs price ${priceCents}¢ = ${arbEdgePct}% edge.` : ''}`,
      strategy: `LIMIT SNIPE at ${limitCents}¢. ${oi} contracts trapped. ${roi}% ROI. Cash back ${cashHours}h.`,
      tier: "ACCELERATOR", recovery_tag: "ACCELERATOR",
      fair_value: fairValue, arb_edge_pct: arbEdgePct,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // TIER 5: VELOCITY PENNY — Cheap + settles soon
  // The "Akshay Bhatia" type plays — 2¢ with 50:1 leverage
  // ══════════════════════════════════════════════════════════════
  if (yesPrice > 0.005 && yesPrice <= 0.15) {
    const roi = Math.round(maxROI * 100);
    const hasSmartMoney = oi > 50 && vol24h < 200;

    let score = 0.15 + velocityBonus;
    if (yesPrice <= 0.05) score += 0.15;
    if (yesPrice <= 0.03) score += 0.1;
    if (hasSmartMoney) score += 0.15;
    if (oi > 20) score += 0.05;
    if (arbEdge > 0.20) score += 0.1;
    if (spread >= 0.08) score += 0.05;
    score = Math.min(0.99, score);

    if (score >= 0.15) {
      const tag = score >= 0.6 ? "🏆 CONVICTION" : score >= 0.4 ? "💎 STRONG" : "🌱 SPECULATIVE";
      return {
        type: "VELOCITY_PENNY", signal: "PENNY_SNIPE", score: +score.toFixed(3),
        reasoning: `${tag}: ${priceCents}¢ = $1 risk for $${(maxROI+1).toFixed(0)} payout (${roi}% ROI). ${hasSmartMoney ? `${oi} OI / ${vol24h} vol — ghost volume.` : oi > 0 ? `${oi} OI.` : ''} Settles ${cashHours}h. ${arbEdgePct > 10 ? `FV ${Math.round(fairValue*100)}¢ = ${arbEdgePct}% edge.` : ''}`,
        strategy: `$1-3 LIMIT at ${priceCents}¢. ${roi}% ROI. Cash back ${cashHours}h.`,
        tier: "ACCELERATOR", recovery_tag: "ACCELERATOR",
        fair_value: fairValue, arb_edge_pct: arbEdgePct,
      };
    }
  }

  // ══════════════════════════════════════════════════════════════
  // TIER 6: VELOCITY VALUE — 15-85¢ with edge
  // The "Charlotte spread" type plays
  // ══════════════════════════════════════════════════════════════
  if (yesPrice >= 0.15 && yesPrice < 0.85) {
    const roi = Math.round(maxROI * 100);
    let score = 0.05 + velocityBonus;
    if (arbEdge >= 0.10) score += 0.15;
    if (vol24h > 50) score += 0.05;
    if (oi > 100) score += 0.05;
    if (spread >= 0.08) score += 0.05;
    score = Math.min(0.8, score);

    const limitCents = yesBid > 0 ? Math.round((yesBid + 0.01) * 100) : priceCents;

    return {
      type: "VELOCITY_VALUE", signal: "VALUE_BUY", score: +score.toFixed(3),
      reasoning: `⚡ ${priceCents}¢ (FV ${Math.round(fairValue*100)}¢, ${arbEdgePct > 0 ? '+' : ''}${arbEdgePct}% edge). ${vol24h > 0 ? `${vol24h} vol.` : ''} ${oi > 0 ? `${oi} OI.` : ''} Settles ${cashHours}h.`,
      strategy: `LIMIT at ${limitCents}¢. ${roi}% ROI. Cash back ${cashHours}h.`,
      tier: roi > 200 ? "ACCELERATOR" : "VALUE",
      recovery_tag: roi > 200 ? "ACCELERATOR" : null,
      fair_value: fairValue, arb_edge_pct: arbEdgePct,
    };
  }

  // Favorites
  if (yesPrice >= 0.85 && yesPrice <= 0.95) {
    const roi = Math.round(maxROI * 100);
    return {
      type: "VELOCITY_SAFE", signal: "SAFE", score: 0.03,
      reasoning: `${priceCents}¢ — ${roi}% return in ${cashHours}h.`,
      strategy: `Safe ${roi}% return.`,
      tier: "FLOOR_DEFENSE", recovery_tag: "FLOOR_DEFENSE",
      fair_value: fairValue, arb_edge_pct: arbEdgePct,
    };
  }

  return {
    type: "LOW_LIQUIDITY", signal: "SPECULATIVE", score: 0.02,
    reasoning: `${priceCents}¢ — low liquidity. ${cashHours}h.`,
    strategy: `SPECULATIVE.`,
    tier: null, recovery_tag: null,
    fair_value: fairValue, arb_edge_pct: arbEdgePct,
  };
}

// ─── Bet Sizing ─────────────────────────────────────────────────

function computeBetSize(alphaScore: number, confidence: number, tier: string | null, arbEdgePct: number): number {
  // Higher arb edge = more conviction = bigger bet
  if (tier === "ACCELERATOR") {
    if (arbEdgePct >= 30) return Math.min(15.00, +(5.00 + arbEdgePct * 0.1).toFixed(2));
    const base = alphaScore >= 0.5 ? 5.00 : alphaScore >= 0.3 ? 3.50 : 2.50;
    return Math.min(10.00, +(base * Math.min(confidence / 10, 1)).toFixed(2));
  }
  const base = alphaScore >= 0.5 ? 5.00 : alphaScore >= 0.3 ? 3.00 : alphaScore >= 0.15 ? 2.00 : 1.00;
  return Math.min(5.00, +(base * Math.min(confidence / 10, 1)).toFixed(2));
}

// ─── Paginated Fetchers (rate-limit safe) ───────────────────────

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
  for (let page = 0; page < 5; page++) {
    if (page > 0) await delay(350);
    const params = new URLSearchParams({ limit: "200", status: "open" });
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
    const confidence = Math.max(1, Math.min(10, body.confidence || 7));
    const recoveryGoal = body.recovery_goal || 130.00;

    const events = await fetchAllEvents();
    await delay(500);
    const markets = await fetchAllMarkets();

    console.log(`Fetched ${events.length} events, ${markets.length} markets`);

    const eventMap = new Map<string, any>();
    for (const e of events) eventMap.set(e.event_ticker, e);

    const classified = markets.map((m: any) => {
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
        fair_value: edge.fair_value,
        arb_edge_pct: edge.arb_edge_pct,
        suggested_bet: computeBetSize(edge.score, confidence, edge.tier, edge.arb_edge_pct),
        time_to_event_hours: hoursLeft,
        recovery_tag: edge.recovery_tag,
      };
    });

    let filtered = classified;
    if (filterClass && filterClass !== "All") {
      filtered = classified.filter(m => m.asset_class === filterClass);
    }

    // Sort: Arb edge first, then score, then velocity
    filtered.sort((a, b) => {
      // Priority tiers
      const tierPrio = (m: any) => {
        if (m.alpha_type === "GUARANTEED_ARB") return 500;
        if (m.alpha_type === "PRICE_ARB") return 400;
        if (m.alpha_type === "WHOLESALE_SPREAD") return 350;
        if (m.alpha_type === "LIQUIDITY_TRAP") return 300;
        if (m.alpha_type === "VELOCITY_PENNY") return 250;
        if (m.alpha_type === "VELOCITY_VALUE") return 100;
        if (m.alpha_type === "BINARY_CLIFF") return 90;
        return 0;
      };
      const pDiff = tierPrio(b) - tierPrio(a);
      if (pDiff !== 0) return pDiff;
      // Within same tier: sort by arb edge, then score
      if (b.arb_edge_pct !== a.arb_edge_pct) return b.arb_edge_pct - a.arb_edge_pct;
      return b.alpha_score - a.alpha_score;
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
      asset_class: cls, icon: d.icon, count: d.count, volume: d.volume,
      avg_alpha: d.count > 0 ? +(d.totalAlpha / d.count).toFixed(4) : 0,
      top_signal: d.topSignal,
    })).sort((a, b) => b.avg_alpha - a.avg_alpha);

    // Top picks — the "manifest"
    const actionable = classified.filter(m =>
      m.alpha_score > 0.05 && m.alpha_type !== "TOO_FAR_OUT" && m.alpha_type !== "NO_ORDERBOOK" &&
      m.alpha_type !== "SETTLED" && m.alpha_type !== "DEAD"
    );
    const alerts = actionable
      .sort((a, b) => {
        if (b.arb_edge_pct !== a.arb_edge_pct) return b.arb_edge_pct - a.arb_edge_pct;
        return b.alpha_score - a.alpha_score;
      })
      .slice(0, 15)
      .map(m => ({
        ticker: m.ticker, title: m.title, event_title: m.event_title,
        asset_class: m.asset_class, icon: m.icon,
        type: m.alpha_type, signal: m.alpha_signal, score: m.alpha_score,
        reasoning: m.alpha_reasoning, strategy: m.alpha_strategy,
        price: m.yes_price, bet: m.suggested_bet,
        event_ticker: m.event_ticker, series_ticker: m.series_ticker,
        tier: m.alpha_tier, recovery_tag: m.recovery_tag,
        time_to_event_hours: m.time_to_event_hours,
        open_interest: m.open_interest, volume_24h: m.volume_24h,
        fair_value: m.fair_value, arb_edge_pct: m.arb_edge_pct,
      }));

    const liquidations = classified
      .filter(m => m.alpha_type === "MATHEMATICAL_DEATH" || m.alpha_type === "BINARY_CLIFF")
      .map(m => ({ ticker: m.ticker, title: m.title, price: m.yes_price, open_interest: m.open_interest, reasoning: m.alpha_reasoning, type: m.alpha_type }));

    // Recovery stats
    const accelerators = classified.filter(m => m.recovery_tag === "ACCELERATOR");
    const recoveryStats = {
      goal: recoveryGoal,
      accelerator_count: accelerators.length,
      best_arb_pct: accelerators.length > 0 ? Math.max(...accelerators.map(m => m.arb_edge_pct)) : 0,
      price_arb_count: classified.filter(m => m.alpha_type === "PRICE_ARB").length,
      wholesale_count: classified.filter(m => m.alpha_type === "WHOLESALE_SPREAD").length,
      trap_count: classified.filter(m => m.alpha_type === "LIQUIDITY_TRAP").length,
      penny_count: classified.filter(m => m.alpha_type === "VELOCITY_PENNY").length,
      guaranteed_arb_count: classified.filter(m => m.alpha_type === "GUARANTEED_ARB").length,
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
