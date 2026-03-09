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
  PGA: { class: "Sports", icon: "⛳" }, GOLF: { class: "Sports", icon: "⛳" },
  ATP: { class: "Sports", icon: "🎾" }, WTA: { class: "Sports", icon: "🎾" },
  F1: { class: "Sports", icon: "🏎️" }, NASCAR: { class: "Sports", icon: "🏎️" },
  MLS: { class: "Sports", icon: "⚽" }, EPL: { class: "Sports", icon: "⚽" },
  CONGRESS: { class: "Politics", icon: "🏛️" }, POTUS: { class: "Politics", icon: "🏛️" },
  SENATE: { class: "Politics", icon: "🏛️" }, HOUSE: { class: "Politics", icon: "🏛️" },
  ELECTION: { class: "Politics", icon: "🏛️" }, GOVERN: { class: "Politics", icon: "🏛️" },
  PARTY: { class: "Politics", icon: "🏛️" }, VOTE: { class: "Politics", icon: "🏛️" },
  TRUMP: { class: "Politics", icon: "🏛️" }, BIDEN: { class: "Politics", icon: "🏛️" },
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
  suggested_bet: number;
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

// ─── Edge Detection Engine ──────────────────────────────────────

interface EdgeResult {
  type: string;
  signal: string;
  score: number;
  reasoning: string;
  strategy: string;
}

function detectEdge(m: any, yesPrice: number, noPrice: number, vol24h: number, oi: number, assetClass: string): EdgeResult {
  const yesBid = (m.yes_bid || 0) / 100;
  const yesAsk = (m.yes_ask || 0) / 100;
  const noBid = (m.no_bid || 0) / 100;
  const noAsk = (m.no_ask || 0) / 100;
  const spread = yesAsk > 0 && yesBid > 0 ? yesAsk - yesBid : 0;
  const maxROI = yesPrice > 0 ? (1 / yesPrice - 1) : 0;
  const priceCents = Math.round(yesPrice * 100);

  // ── 1. MATHEMATICAL DEATH: price ≤ 2¢ with OI ──
  if (yesPrice > 0 && yesPrice <= 0.02 && oi > 0) {
    return {
      type: "MATHEMATICAL_DEATH",
      signal: "INSTANT_LIQUIDATION",
      score: 0,
      reasoning: `${priceCents}¢ with ${oi} OI — 0% probability. Sell to recover capital.`,
      strategy: "LIQUIDATE: This position is dead. Sell at any price to recover pennies.",
    };
  }

  // ── 2. SPREAD ARBITRAGE: Yes + No prices sum to < 95¢ ──
  if (yesAsk > 0 && noAsk > 0 && (yesAsk + noAsk) < 0.95) {
    const arb = 1 - (yesAsk + noAsk);
    const score = Math.min(1, arb * 5);
    return {
      type: "SPREAD_ARB",
      signal: "BUY_BOTH",
      score: +score.toFixed(3),
      reasoning: `Yes ${Math.round(yesAsk * 100)}¢ + No ${Math.round(noAsk * 100)}¢ = ${Math.round((yesAsk + noAsk) * 100)}¢. Guaranteed ${Math.round(arb * 100)}¢ profit buying both sides.`,
      strategy: "ARBITRAGE: Buy Yes AND No — you profit no matter who wins. The combined cost is less than the $1 payout.",
    };
  }

  // ── 3. WIDE SPREAD SNIPE: spread ≥ 8¢ — place limit order at mid ──
  if (spread >= 0.08 && yesPrice >= 0.05 && yesPrice <= 0.90) {
    const mid = (yesBid + yesAsk) / 2;
    const edgeCents = Math.round(spread * 50); // half the spread
    const score = Math.min(0.8, spread * 3);
    return {
      type: "WIDE_SPREAD",
      signal: "LIMIT_SNIPE",
      score: +score.toFixed(3),
      reasoning: `Bid ${Math.round(yesBid * 100)}¢ / Ask ${Math.round(yesAsk * 100)}¢ — ${Math.round(spread * 100)}¢ spread. Place limit at ${Math.round(mid * 100)}¢ for ~${edgeCents}¢ edge.`,
      strategy: `LIMIT ORDER: Don't market buy. Place a limit at ${Math.round(mid * 100)}¢ (midpoint). You get ${edgeCents}¢ of instant edge vs. the ask price.`,
    };
  }

  // ── 4. MICRO VALUE: price 1-15¢ with any activity — high ROI lotto ──
  if (yesPrice > 0 && yesPrice < 0.15 && (vol24h > 0 || oi > 5)) {
    const roi = Math.round(maxROI * 100);
    const score = Math.min(1, (0.15 - yesPrice) / 0.15 * 0.6 + Math.min(vol24h, 200) / 500);
    return {
      type: "MICRO_VALUE",
      signal: "LOTTO_BUY",
      score: +score.toFixed(3),
      reasoning: `${priceCents}¢ — ${roi}% ROI if it wins. ${vol24h > 0 ? `${vol24h} contracts traded today.` : `${oi} open interest.`}`,
      strategy: `LOTTO PLAY: Risk $1-2 for up to $${(maxROI + 1).toFixed(0)} payout. These low-price contracts are where 10x returns come from. Only risk what you'd spend on a scratch ticket.`,
    };
  }

  // ── 5. VALUE ZONE: 15-40¢ with volume — the sweet spot ──
  if (yesPrice >= 0.15 && yesPrice < 0.40 && (vol24h > 10 || oi > 20)) {
    const roi = Math.round(maxROI * 100);
    const score = Math.min(0.7, (0.40 - yesPrice) / 0.25 * 0.4 + Math.min(vol24h, 300) / 800);
    return {
      type: "VALUE_ZONE",
      signal: "ANCHOR_BUY",
      score: +score.toFixed(3),
      reasoning: `${priceCents}¢ with ${vol24h > 0 ? `${vol24h} vol` : `${oi} OI`} — ${roi}% max ROI. Market says ${priceCents}% chance but activity suggests it's undervalued.`,
      strategy: `VALUE BET: The price implies only a ${priceCents}% chance, but trading activity suggests it could be higher. Risk $2-5 for a ${roi}% return if you're right.`,
    };
  }

  // ── 6. VOLUME SPIKE: unusual activity relative to history ──
  if (vol24h > 50 && m.volume > 0) {
    const avgDaily = Math.max(m.volume / 30, 1);
    const ratio = vol24h / avgDaily;
    if (ratio > 2 && yesPrice >= 0.05 && yesPrice <= 0.90) {
      const score = Math.min(0.7, (ratio - 2) * 0.15);
      return {
        type: "VOLUME_SPIKE",
        signal: "MOMENTUM_ENTRY",
        score: +score.toFixed(3),
        reasoning: `${ratio.toFixed(1)}x normal volume at ${priceCents}¢ — someone knows something. Price hasn't caught up yet.`,
        strategy: `FOLLOW THE MONEY: Volume is ${ratio.toFixed(1)}x the daily average. Smart money is loading up before a price move. Get in before the crowd.`,
      };
    }
  }

  // ── 7. COIN FLIP: 40-60¢ — use for hedging or if you have info ──
  if (yesPrice >= 0.40 && yesPrice <= 0.60) {
    const score = vol24h > 50 ? 0.1 : 0.03;
    return {
      type: "COIN_FLIP",
      signal: "NEUTRAL",
      score,
      reasoning: `${priceCents}¢ — market sees this as a coin flip. ${vol24h > 50 ? `Active (${vol24h} vol).` : "Low activity."}`,
      strategy: `50/50 BET: Only play this if you have an opinion the market doesn't. At ${priceCents}¢, you need to be right more than ${priceCents}% of the time to profit.`,
    };
  }

  // ── 8. FAVORITE: 60-85¢ — limited upside ──
  if (yesPrice > 0.60 && yesPrice <= 0.85) {
    const roi = Math.round(maxROI * 100);
    const score = vol24h > 100 ? 0.05 : 0.02;
    return {
      type: "FAVORITE",
      signal: "LOW_UPSIDE",
      score,
      reasoning: `${priceCents}¢ — probably wins but only ${roi}% return. ${vol24h > 0 ? `${vol24h} vol.` : ""}`,
      strategy: `SAFE BET: This will probably win, but you only make ${roi}¢ per dollar. Better as part of a parlay or if you're parking cash.`,
    };
  }

  // ── 9. HEAVY FAVORITE: 85-95¢ — near certain ──
  if (yesPrice > 0.85 && yesPrice <= 0.95) {
    const roi = Math.round(maxROI * 100);
    return {
      type: "HEAVY_FAVORITE",
      signal: "MINIMAL_EDGE",
      score: 0.01,
      reasoning: `${priceCents}¢ — almost certain winner. Only ${roi}% return.`,
      strategy: `CASH EQUIVALENT: This is basically a savings account. ${roi}% return if it wins (which it probably will). Only useful for very large positions.`,
    };
  }

  // ── 10. SETTLED: > 95¢ ──
  if (yesPrice > 0.95) {
    return {
      type: "SETTLED",
      signal: "NO_EDGE",
      score: 0,
      reasoning: `${priceCents}¢ — this is done.`,
      strategy: "NO TRADE: This market is effectively settled. Zero edge.",
    };
  }

  // ── 11. DEAD ──
  if (yesPrice <= 0) {
    return {
      type: "DEAD",
      signal: "NO_EDGE",
      score: 0,
      reasoning: "0¢ — dead contract.",
      strategy: "NO TRADE: Dead market.",
    };
  }

  // ── Fallback ──
  return {
    type: "LOW_LIQUIDITY",
    signal: "SPECULATIVE",
    score: 0.02,
    reasoning: `${priceCents}¢ — low liquidity, hard to trade.`,
    strategy: `SPECULATIVE: Low activity means you might not be able to buy or sell easily. Only enter if you have strong conviction.`,
  };
}

// ─── Bet Sizing ─────────────────────────────────────────────────

function computeBetSize(alphaScore: number, confidence: number): number {
  const base = alphaScore >= 0.5 ? 5.00 : alphaScore >= 0.3 ? 3.00 : alphaScore >= 0.15 ? 2.00 : alphaScore >= 0.05 ? 1.00 : 0;
  const multiplier = Math.min(confidence / 10, 1);
  return Math.min(5.00, +(base * multiplier).toFixed(2));
}

function extractSeriesTicker(eventTicker: string): string {
  if (!eventTicker) return "";
  const match = eventTicker.match(/^([A-Z0-9]+)-\d{2}[A-Z]{3}\d{2}/);
  if (match) return match[1];
  const parts = eventTicker.split("-");
  return parts[0] || eventTicker;
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

    const [eventsRes, marketsRes] = await Promise.all([
      fetch(`${KALSHI_API}/events?limit=200&status=open`, { headers: { Accept: "application/json" } }),
      fetch(`${KALSHI_API}/markets?limit=200&status=open&mve_filter=exclude`, { headers: { Accept: "application/json" } }),
    ]);

    if (!eventsRes.ok) throw new Error(`Kalshi events: ${eventsRes.status}`);
    if (!marketsRes.ok) throw new Error(`Kalshi markets: ${marketsRes.status}`);

    const [eventsData, marketsData] = await Promise.all([eventsRes.json(), marketsRes.json()]);
    const events = eventsData.events || [];
    const markets = marketsData.markets || [];

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

      const edge = detectEdge(m, yesPrice, noPrice, vol24h, oi, assetClass);

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
        close_time: m.close_time || m.expiration_time,
        subtitle: m.subtitle || "",
        alpha_type: edge.type,
        alpha_signal: edge.signal,
        alpha_score: edge.score,
        alpha_reasoning: edge.reasoning,
        alpha_strategy: edge.strategy,
        suggested_bet: computeBetSize(edge.score, confidence),
      };
    });

    let filtered = classified;
    if (filterClass && filterClass !== "All") {
      filtered = classified.filter(m => m.asset_class === filterClass);
    }

    // Sort by alpha score then volume
    filtered.sort((a, b) => (b.alpha_score - a.alpha_score) || (b.volume_24h - a.volume_24h));

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

    // Edge alerts (top opportunities)
    const alerts = classified
      .filter(m => m.alpha_score > 0.05)
      .sort((a, b) => b.alpha_score - a.alpha_score)
      .slice(0, 10)
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
      }));

    const liquidations = classified
      .filter(m => m.alpha_type === "MATHEMATICAL_DEATH")
      .map(m => ({
        ticker: m.ticker,
        title: m.title,
        price: m.yes_price,
        open_interest: m.open_interest,
        reasoning: m.alpha_reasoning,
      }));

    return new Response(JSON.stringify({
      heatmap: heatmapArr,
      alerts,
      liquidations,
      markets: filtered.slice(0, 100),
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
