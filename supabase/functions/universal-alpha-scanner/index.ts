const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2";

// ─── Asset Class Categorization ─────────────────────────────────

const CATEGORY_MAP: Record<string, { class: string; icon: string }> = {
  // Sports
  NBA: { class: "Sports", icon: "🏀" }, WNBA: { class: "Sports", icon: "🏀" },
  NFL: { class: "Sports", icon: "🏈" }, CFB: { class: "Sports", icon: "🏈" },
  MLB: { class: "Sports", icon: "⚾" }, NHL: { class: "Sports", icon: "🏒" },
  PGA: { class: "Sports", icon: "⛳" }, GOLF: { class: "Sports", icon: "⛳" },
  ATP: { class: "Sports", icon: "🎾" }, WTA: { class: "Sports", icon: "🎾" },
  F1: { class: "Sports", icon: "🏎️" }, NASCAR: { class: "Sports", icon: "🏎️" },
  MLS: { class: "Sports", icon: "⚽" }, EPL: { class: "Sports", icon: "⚽" },
  // Politics
  CONGRESS: { class: "Politics", icon: "🏛️" }, POTUS: { class: "Politics", icon: "🏛️" },
  SENATE: { class: "Politics", icon: "🏛️" }, HOUSE: { class: "Politics", icon: "🏛️" },
  ELECTION: { class: "Politics", icon: "🏛️" }, GOVERN: { class: "Politics", icon: "🏛️" },
  PARTY: { class: "Politics", icon: "🏛️" }, VOTE: { class: "Politics", icon: "🏛️" },
  TRUMP: { class: "Politics", icon: "🏛️" }, BIDEN: { class: "Politics", icon: "🏛️" },
  // Economics / Finance
  FED: { class: "Economics", icon: "📈" }, RATE: { class: "Economics", icon: "📈" },
  CPI: { class: "Economics", icon: "📈" }, GDP: { class: "Economics", icon: "📈" },
  JOBS: { class: "Economics", icon: "📈" }, INFLATION: { class: "Economics", icon: "📈" },
  RECESSION: { class: "Economics", icon: "📈" }, TREASURY: { class: "Economics", icon: "📈" },
  SP500: { class: "Economics", icon: "📈" }, NASDAQ: { class: "Economics", icon: "📈" },
  // Crypto
  BTC: { class: "Crypto", icon: "₿" }, BITCOIN: { class: "Crypto", icon: "₿" },
  ETH: { class: "Crypto", icon: "₿" }, ETHEREUM: { class: "Crypto", icon: "₿" },
  CRYPTO: { class: "Crypto", icon: "₿" },
  // Culture / Entertainment
  OSCAR: { class: "Culture", icon: "🎬" }, GRAMMY: { class: "Culture", icon: "🎬" },
  EMMY: { class: "Culture", icon: "🎬" }, GOLDEN: { class: "Culture", icon: "🎬" },
  MOVIE: { class: "Culture", icon: "🎬" }, AWARD: { class: "Culture", icon: "🎬" },
  // Climate / Science
  TEMP: { class: "Climate", icon: "🌍" }, HURRICANE: { class: "Climate", icon: "🌍" },
  CLIMATE: { class: "Climate", icon: "🌍" }, WEATHER: { class: "Climate", icon: "🌍" },
};

interface ClassifiedMarket {
  ticker: string;
  event_ticker: string;
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
  // Alpha signals
  alpha_type: string | null;
  alpha_signal: string | null;
  alpha_score: number;
  alpha_reasoning: string | null;
  suggested_bet: number;
}

function classifyAssetClass(ticker: string, title: string, category: string): { class: string; icon: string } {
  const combined = `${ticker} ${title} ${category}`.toUpperCase();
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (combined.includes(key)) return val;
  }
  // Fallback heuristics
  if (category.toUpperCase().includes("SPORT")) return { class: "Sports", icon: "🏆" };
  if (category.toUpperCase().includes("POLITIC")) return { class: "Politics", icon: "🏛️" };
  if (category.toUpperCase().includes("ECON") || category.toUpperCase().includes("FINANC")) return { class: "Economics", icon: "📈" };
  return { class: "Other", icon: "📊" };
}

// ─── Universal Alpha Models ─────────────────────────────────────

function computePoliticsEdge(market: any): { type: string; signal: string; score: number; reasoning: string } | null {
  // Politics markets: low price + high volume = momentum play
  const price = (market.yes_ask || market.last_price || 0) / 100;
  const vol = market.volume_24h || market.volume || 0;
  
  // LIQUIDITY GATE: Filter out > 95¢ (zero ROI potential)
  if (price > 0.95) return null;
  
  // STALE PRICE FILTER: No volume + high OI = stale pricing
  if (vol === 0 && (market.open_interest || 0) > 100) {
    return {
      type: "STALE_PRICING",
      signal: "DO_NOT_ENTRY",
      score: 0,
      reasoning: `STALE PRICING — ${(price * 100).toFixed(0)}¢ with 0 volume but ${market.open_interest} OI. No active market.`,
    };
  }
  
  // VEGAS RECOVERY: Prioritize < 15¢ for 300%+ ROI potential
  if (price > 0 && price < 0.15 && vol > 50) {
    const score = Math.min(1, (0.15 - price) / 0.15 + (vol / 500));
    return {
      type: "MOMENTUM_LOAD",
      signal: "MICRO_LOAD",
      score: +score.toFixed(3),
      reasoning: `Price ${(price * 100).toFixed(0)}¢ with ${vol} volume — under 15¢ threshold with active trading. 500%+ ROI potential if trend confirms.`,
    };
  }
  
  // Moderate recovery zone: 15-25¢ with volume
  if (price >= 0.15 && price < 0.25 && vol > 100) {
    const score = (0.25 - price) * 2.5;
    return {
      type: "TREND_CONFIRM",
      signal: "ANCHOR_BUY",
      score: +score.toFixed(3),
      reasoning: `Price ${(price * 100).toFixed(0)}¢ with ${vol} 24h volume — 300%+ ROI zone, sentiment lagging data flow.`,
    };
  }
  
  return null;
}

function computeCultureEdge(market: any): { type: string; signal: string; score: number; reasoning: string } | null {
  const price = (market.yes_ask || market.last_price || 0) / 100;
  const vol = market.volume_24h || market.volume || 0;
  
  // LIQUIDITY GATE: Filter out > 95¢
  if (price > 0.95) return null;
  
  // STALE PRICE FILTER
  if (vol === 0 && (market.open_interest || 0) > 100) {
    return {
      type: "STALE_PRICING",
      signal: "DO_NOT_ENTRY",
      score: 0,
      reasoning: `STALE PRICING — ${(price * 100).toFixed(0)}¢ with 0 volume but ${market.open_interest} OI.`,
    };
  }
  
  // VEGAS RECOVERY: < 15¢ priority
  if (price > 0 && price < 0.15 && vol > 50) {
    const score = (0.15 - price) * 4;
    return {
      type: "SWEEP_SIGNAL",
      signal: "ANCHOR_BUY",
      score: +score.toFixed(3),
      reasoning: `${(price * 100).toFixed(0)}¢ with ${vol} volume — early sweep signal at 500%+ ROI zone.`,
    };
  }
  
  // Moderate sleeper: 15-40¢ with volume
  if (price >= 0.15 && price < 0.40 && vol > 100) {
    const score = (0.40 - price) * 1.5;
    return {
      type: "SWEEP_SIGNAL",
      signal: "ANCHOR_BUY",
      score: +score.toFixed(3),
      reasoning: `${(price * 100).toFixed(0)}¢ with ${vol} volume — early category wins may signal sweep.`,
    };
  }
  return null;
}

function computeVolatilityEdge(market: any): { type: string; signal: string; score: number; reasoning: string } | null {
  const price = (market.yes_ask || market.last_price || 0) / 100;
  const vol = market.volume_24h || 0;
  const totalVol = market.volume || 0;
  
  // LIQUIDITY GATE: Filter out > 95¢
  if (price > 0.95) return null;
  
  // STALE PRICE FILTER
  if (vol === 0 && (market.open_interest || 0) > 100) {
    return {
      type: "STALE_PRICING",
      signal: "DO_NOT_ENTRY",
      score: 0,
      reasoning: `STALE PRICING — ${(price * 100).toFixed(0)}¢ with 0 volume but ${market.open_interest} OI.`,
    };
  }
  
  // Volume precedes price: high recent volume but price hasn't moved
  if (vol > 100 && totalVol > 0) {
    const volRatio = vol / Math.max(totalVol / 30, 1); // vs daily avg
    // Only flag if price is in actionable range (1-85¢)
    if (volRatio > 2 && price >= 0.01 && price <= 0.85) {
      const score = Math.min(1, (volRatio - 2) * 0.3);
      return {
        type: "VOLUME_SPIKE",
        signal: "VOLATILITY_ENTRY",
        score: +score.toFixed(3),
        reasoning: `Volume ${volRatio.toFixed(1)}x daily average at ${(price * 100).toFixed(0)}¢ — volume precedes price. Directional breakout imminent.`,
      };
    }
  }
  return null;
}

function computeMathematicalDeath(market: any): { type: string; signal: string; score: number; reasoning: string } | null {
  const price = (market.yes_ask || market.last_price || 0) / 100;
  // If price is essentially dead (< 2¢) and has open interest
  if (price > 0 && price <= 0.02 && (market.open_interest || 0) > 0) {
    return {
      type: "MATHEMATICAL_DEATH",
      signal: "INSTANT_LIQUIDATION",
      score: 0,
      reasoning: `Position at ${(price * 100).toFixed(0)}¢ with ${market.open_interest} OI — 0% probability. Liquidate to recover 1¢/share capital.`,
    };
  }
  return null;
}

function computeGeneralEdge(price: number, vol24h: number, openInterest: number): { type: string; signal: string; score: number; reasoning: string } {
  // LIQUIDITY GATE: Settled outcomes
  if (price > 0.95) {
    return {
      type: "SETTLED",
      signal: "NO_EDGE",
      score: 0,
      reasoning: `Price ${(price * 100).toFixed(0)}¢ — settled outcome, zero ROI potential.`,
    };
  }
  
  // STALE PRICE FILTER
  if (vol24h === 0 && openInterest > 100) {
    return {
      type: "STALE_PRICING",
      signal: "DO_NOT_ENTRY",
      score: 0,
      reasoning: `STALE PRICING — ${(price * 100).toFixed(0)}¢ with 0 volume but ${openInterest} OI. No active market.`,
    };
  }
  
  // VEGAS RECOVERY: Mispriced underdog < 15¢ (500%+ ROI potential)
  if (price > 0 && price < 0.15 && vol24h > 20 && openInterest > 10) {
    const score = Math.min(1, (0.15 - price) / 0.15 + vol24h / 200);
    return {
      type: "UNDERDOG_VALUE",
      signal: "MICRO_LOAD",
      score: +score.toFixed(3),
      reasoning: `${(price * 100).toFixed(1)}¢ with ${vol24h} volume and ${openInterest} OI — mispriced underdog with 500%+ ROI potential.`,
    };
  }
  
  // Moderate value: 15-40¢ with volume
  if (price >= 0.15 && price < 0.40 && vol24h > 50) {
    const score = Math.min(0.4, (0.40 - price) * 1.2 + vol24h / 1000);
    return {
      type: "VALUE_ZONE",
      signal: "WATCH",
      score: +score.toFixed(3),
      reasoning: `${(price * 100).toFixed(0)}¢ with ${vol24h} volume — value zone, 150-500% ROI potential.`,
    };
  }

  // Mid-range: 40-60¢ — coin-flip territory
  if (price >= 0.40 && price <= 0.60) {
    const volFactor = Math.min(0.2, vol24h / 2000);
    const score = 0.05 + volFactor;
    return {
      type: "COIN_FLIP",
      signal: "NEUTRAL",
      score: +score.toFixed(3),
      reasoning: `${(price * 100).toFixed(0)}¢ — coin-flip zone. ${vol24h > 100 ? `Active with ${vol24h} volume.` : "Low conviction."}`,
    };
  }

  // Favorites: 60-85¢ — limited upside but may have momentum
  if (price > 0.60 && price <= 0.85) {
    const volFactor = Math.min(0.15, vol24h / 3000);
    const score = 0.02 + volFactor;
    return {
      type: "FAVORITE",
      signal: "LOW_UPSIDE",
      score: +score.toFixed(3),
      reasoning: `${(price * 100).toFixed(0)}¢ favorite — limited upside (${((1 / price - 1) * 100).toFixed(0)}% max ROI). ${vol24h > 100 ? `Volume: ${vol24h}.` : ""}`,
    };
  }

  // Heavy favorites: 85-95¢
  if (price > 0.85 && price <= 0.95) {
    return {
      type: "HEAVY_FAVORITE",
      signal: "MINIMAL_EDGE",
      score: 0.01,
      reasoning: `${(price * 100).toFixed(0)}¢ heavy favorite — only ${((1 / price - 1) * 100).toFixed(0)}% max ROI. Near-settled.`,
    };
  }

  // Dead / zero price
  if (price <= 0) {
    return {
      type: "DEAD",
      signal: "NO_EDGE",
      score: 0,
      reasoning: `0¢ — no market. Dead contract.`,
    };
  }

  // Fallback for anything else (1-15¢ low volume)
  const baseScore = Math.max(0.01, (0.15 - price) / 0.15 * 0.1);
  return {
    type: "LOW_LIQUIDITY",
    signal: "SPECULATIVE",
    score: +baseScore.toFixed(3),
    reasoning: `${(price * 100).toFixed(1)}¢ with ${vol24h} volume — low liquidity speculative. High ROI potential but thin market.`,
  };
}

// ─── Bet Sizing ─────────────────────────────────────────────────

function computeBetSize(alphaScore: number, confidence: number): number {
  // alphaScore 0-1, confidence 1-10
  const base = alphaScore >= 0.5 ? 5.00 : alphaScore >= 0.3 ? 3.00 : alphaScore >= 0.15 ? 2.00 : alphaScore >= 0.05 ? 1.00 : 0;
  const multiplier = Math.min(confidence / 10, 1);
  return Math.min(5.00, +(base * multiplier).toFixed(2));
}

// ─── Micro-Bet Budget Allocator ─────────────────────────────────

function allocateBudget(opportunities: ClassifiedMarket[], dailyBudget: number, maxPerMarket: number): any[] {
  // Sort by alpha score descending
  const sorted = [...opportunities].filter(m => m.alpha_score > 0).sort((a, b) => b.alpha_score - a.alpha_score);
  const maxPositions = Math.floor(dailyBudget / 1); // minimum $1 per position
  const selected = sorted.slice(0, Math.min(maxPositions, 5)); // max 5 positions

  if (selected.length === 0) return [];

  const perPosition = Math.min(maxPerMarket, +(dailyBudget / selected.length).toFixed(2));

  return selected.map(m => ({
    ticker: m.ticker,
    title: m.title,
    asset_class: m.asset_class,
    alpha_type: m.alpha_type,
    alpha_score: m.alpha_score,
    price: m.yes_price,
    allocation: perPosition,
    contracts: Math.floor(perPosition / Math.max(m.yes_price, 0.01)),
    corridor: {
      anchor: m.yes_price,
      floor: m.no_price,
      hedge_available: m.no_bid > 0,
    },
  }));
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

    // Fetch from Kalshi
    const [eventsRes, marketsRes] = await Promise.all([
      fetch(`${KALSHI_API}/events?limit=200&status=open`, { headers: { Accept: "application/json" } }),
      fetch(`${KALSHI_API}/markets?limit=200&status=open`, { headers: { Accept: "application/json" } }),
    ]);

    if (!eventsRes.ok) throw new Error(`Kalshi events: ${eventsRes.status}`);
    if (!marketsRes.ok) throw new Error(`Kalshi markets: ${marketsRes.status}`);

    const [eventsData, marketsData] = await Promise.all([eventsRes.json(), marketsRes.json()]);
    const events = eventsData.events || [];
    const markets = marketsData.markets || [];

    console.log(`Fetched ${events.length} events, ${markets.length} markets`);

    // Build event lookup
    const eventMap = new Map<string, any>();
    for (const e of events) eventMap.set(e.event_ticker, e);

    // Classify and compute alpha for each market
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

      // Compute alpha based on asset class
      let alpha: { type: string; signal: string; score: number; reasoning: string } | null = null;

      // Check for mathematical death first (highest priority)
      alpha = computeMathematicalDeath(m);

      // Then check asset-class specific edges
      if (!alpha) {
        switch (assetClass) {
          case "Politics":
            alpha = computePoliticsEdge(m);
            break;
          case "Culture":
            alpha = computeCultureEdge(m);
            break;
          case "Crypto":
          case "Economics":
            alpha = computeVolatilityEdge(m);
            break;
        }
      }

      // Always compute general edge as final fallback (returns score for all markets)
      if (!alpha) {
        alpha = computeGeneralEdge(yesPrice, vol24h, oi);
      }

      const alphaScore = alpha.score;

      return {
        ticker: m.ticker,
        event_ticker: m.event_ticker,
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
        alpha_type: alpha.type,
        alpha_signal: alpha.signal,
        alpha_score: alphaScore,
        alpha_reasoning: alpha.reasoning,
        suggested_bet: computeBetSize(alphaScore, confidence),
      };
    });

    // Filter
    let filtered = classified;
    if (filterClass && filterClass !== "All") {
      filtered = classified.filter(m => m.asset_class === filterClass);
    }

    // Sort by alpha score then volume
    filtered.sort((a, b) => (b.alpha_score - a.alpha_score) || (b.volume_24h - a.volume_24h));

    // Build heatmap: per-class aggregates
    const heatmap = new Map<string, { count: number; volume: number; avgAlpha: number; totalAlpha: number; topSignal: string | null; icon: string }>();
    for (const m of classified) {
      const h = heatmap.get(m.asset_class) || { count: 0, volume: 0, avgAlpha: 0, totalAlpha: 0, topSignal: null, icon: m.icon };
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
      price_to_data_gap: d.count > 0 ? +(d.totalAlpha / d.count).toFixed(4) : 0,
    })).sort((a, b) => b.avg_alpha - a.avg_alpha);

    // Budget allocation
    const allocations = allocateBudget(classified, dailyBudget, 5.00);

    // Edge alerts (top opportunities)
    const alerts = classified
      .filter(m => m.alpha_score > 0.1)
      .sort((a, b) => b.alpha_score - a.alpha_score)
      .slice(0, 10)
      .map(m => ({
        ticker: m.ticker,
        title: m.title,
        asset_class: m.asset_class,
        icon: m.icon,
        type: m.alpha_type,
        signal: m.alpha_signal,
        score: m.alpha_score,
        reasoning: m.alpha_reasoning,
        price: m.yes_price,
        bet: m.suggested_bet,
      }));

    // Liquidation alerts
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
      allocations,
      markets: filtered.slice(0, 100), // cap for performance
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
