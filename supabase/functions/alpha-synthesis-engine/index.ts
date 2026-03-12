const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2";

// ─── Kalshi Data Fetchers ───────────────────────────────────────

async function fetchAllMarkets() {
  const [eventsRes, marketsRes] = await Promise.all([
    fetch(`${KALSHI_API}/events?limit=200&status=open`, { headers: { Accept: "application/json" } }),
    fetch(`${KALSHI_API}/markets?limit=200&status=open`, { headers: { Accept: "application/json" } }),
  ]);
  if (!eventsRes.ok) throw new Error(`Events API: ${eventsRes.status}`);
  if (!marketsRes.ok) throw new Error(`Markets API: ${marketsRes.status}`);
  const [ed, md] = await Promise.all([eventsRes.json(), marketsRes.json()]);
  return { events: ed.events || [], markets: md.markets || [] };
}

// ─── Golf Market Classifier ────────────────────────────────────

function isGolfRelated(text: string): boolean {
  const t = text.toUpperCase();
  return ["GOLF", "PGA", "MASTERS", "LPGA", "BIRDIE", "BOGEY", "TOUR CHAMPIONSHIP", "OPEN CHAMPIONSHIP",
    "US OPEN", "ARNOLD PALMER", "PLAYERS CHAMPIONSHIP"].some(k => t.includes(k));
}

type MarketType = "winner" | "top10" | "top5" | "top20" | "round_leader" | "matchup" | "hole_score" | "other";

function classifyGolfMarket(title: string): MarketType {
  const t = title.toUpperCase();
  if (t.includes("WINNER") || t.includes("WIN THE")) return "winner";
  if (t.includes("TOP 10") || t.includes("TOP TEN")) return "top10";
  if (t.includes("TOP 5") || t.includes("TOP FIVE")) return "top5";
  if (t.includes("TOP 20") || t.includes("TOP TWENTY")) return "top20";
  if (t.includes("ROUND LEADER") || t.includes("LEAD AFTER")) return "round_leader";
  if (t.includes("VS") || t.includes("MATCHUP") || t.includes("HEAD TO HEAD")) return "matchup";
  if (t.includes("HOLE") || t.includes("BOGEY") || t.includes("BIRDIE") || t.includes("EAGLE")) return "hole_score";
  return "other";
}

function extractPlayerName(title: string): string {
  const patterns = [
    /^(.+?)\s+to\s+(win|finish)/i,
    /^(.+?)\s*[-–]\s*(winner|top)/i,
    /^Will\s+(.+?)\s+(win|finish|make)/i,
    /^(.+?)\s+(winner|top\s*\d+)/i,
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) return m[1].trim();
  }
  return title.split(/[-–]/)[0].trim().substring(0, 30);
}

// ─── Bhalloo-James Alpha Models (Refined) ───────────────────────

// Anchor Scanner: FV = 1 - (1 / (1 + Lead / (Holes / 2.5)))
function computeAnchorFV(leadStrokes: number, holesRemaining: number): number {
  if (holesRemaining <= 0) return 1;
  return 1 - (1 / (1 + leadStrokes / (holesRemaining / 2.5)));
}

function anchorScanner(currentPrice: number, leadStrokes: number, holesRemaining: number): {
  fairValue: number; edge: number; signal: string; reasoning: string;
} {
  const fv = computeAnchorFV(leadStrokes, holesRemaining);
  const discount = fv > 0 ? (fv - currentPrice) / fv : 0;
  let signal = "HOLD";
  if (discount >= 0.15) signal = "ALPHA_BUY";
  else if (discount >= 0.08) signal = "WATCH";
  else if (discount <= -0.10) signal = "OVERPRICED";

  return {
    fairValue: +fv.toFixed(4),
    edge: +discount.toFixed(4),
    signal,
    reasoning: signal === "ALPHA_BUY"
      ? `Leader at ${(currentPrice * 100).toFixed(0)}¢ vs FV ${(fv * 100).toFixed(0)}¢ — ${(discount * 100).toFixed(1)}% discount with ${leadStrokes}-stroke lead, ${holesRemaining} holes left. CONCENTRATION BUY.`
      : `Price ${(currentPrice * 100).toFixed(0)}¢ vs FV ${(fv * 100).toFixed(0)}¢ — ${(discount * 100).toFixed(1)}% gap. ${signal}.`,
  };
}

// Floor Wall: Top 5 player, Top 10 < 90¢, ≥3 stroke cushion over T11
function floorWall(rank: number, top10Price: number, strokeCushionOverT11: number): {
  signal: string; discount: number; reasoning: string; maxBet: number;
} | null {
  if (rank > 5 || top10Price >= 0.90 || strokeCushionOverT11 < 3) return null;
  const discount = +(0.90 - top10Price).toFixed(3);
  return {
    signal: "CAPITAL_LOCK",
    discount,
    reasoning: `Rank ${rank} with Top 10 at ${(top10Price * 100).toFixed(0)}¢ — ${(discount * 100).toFixed(0)}¢ below 90¢ fair value. ${strokeCushionOverT11}-stroke cushion over bubble. $5.00 limit.`,
    maxBet: 5.00,
  };
}

// Hedge Guard: Winner Yes up >50%, Round Leader No < 12¢
function hedgeGuard(winnerYes: number, costBasis: number, roundLeaderNo: number): {
  signal: string; reasoning: string;
} | null {
  if (costBasis <= 0) return null;
  const roi = (winnerYes - costBasis) / costBasis;
  if (roi <= 0.50 || roundLeaderNo >= 0.12) return null;
  return {
    signal: "RISK_FREE_HEDGE",
    reasoning: `Winner position up ${(roi * 100).toFixed(0)}%. Round Leader No at ${(roundLeaderNo * 100).toFixed(0)}¢ — lock profits with hedge. Net exposure = 0.`,
  };
}

// Vegas Protocol: Mathematical Death auto-liquidation
function vegasProtocol(price: number, openInterest: number): {
  signal: string; reasoning: string; urgency: string;
} | null {
  if (price > 0.01 || openInterest <= 0) return null;
  return {
    signal: "INSTANT_LIQUIDATION",
    reasoning: `Position at ${(price * 100).toFixed(1)}¢ with ${openInterest} OI — mathematical death. Sell at 1¢ to recover capital immediately.`,
    urgency: "CRITICAL",
  };
}

// Double Bogey Trim: If leader price drops >20% from peak, suggest trim
function doubleBogeyTrim(currentPrice: number, recentPeakPrice: number): {
  signal: string; reasoning: string; trimPct: number;
} | null {
  if (recentPeakPrice <= 0) return null;
  const drawdown = (recentPeakPrice - currentPrice) / recentPeakPrice;
  if (drawdown < 0.20) return null;
  const trimPct = Math.min(50, Math.round(drawdown * 100));
  return {
    signal: "TRIM_POSITION",
    reasoning: `Price dropped ${(drawdown * 100).toFixed(0)}% from peak ${(recentPeakPrice * 100).toFixed(0)}¢ to ${(currentPrice * 100).toFixed(0)}¢ — possible Double Bogey event. Trim ${trimPct}% to preserve capital.`,
    trimPct,
  };
}

// ─── Bet Calculator with Budget Cap ─────────────────────────────

function computeBetSize(alphaScore: number, price: number, budgetRemaining: number): {
  suggested: number; contracts: number; maxPayout: number; reasoning: string;
} {
  const abs = Math.abs(alphaScore);
  let base: number;
  if (abs >= 0.25) base = 5.00;
  else if (abs >= 0.15) base = 3.00;
  else if (abs >= 0.10) base = 2.00;
  else if (abs >= 0.05) base = 1.00;
  else base = 0;

  // Lotto cap: if price < 5¢, max $5.00
  if (price < 0.05) base = Math.min(base, 5.00);

  // Budget cap
  const suggested = Math.min(base, budgetRemaining);
  const contracts = price > 0 ? Math.floor(suggested / price) : 0;
  const maxPayout = contracts * 1; // each contract pays $1 on settlement

  return {
    suggested: +suggested.toFixed(2),
    contracts,
    maxPayout: +maxPayout.toFixed(2),
    reasoning: suggested === 0
      ? "Edge too small — no bet"
      : `Alpha ${(abs * 100).toFixed(1)}% → $${suggested.toFixed(2)} (${contracts} contracts @ ${(price * 100).toFixed(0)}¢ = $${maxPayout.toFixed(2)} max payout)`,
  };
}

// ─── Order Book Depth ───────────────────────────────────────────

function extractOrderBook(market: any): {
  bids: { price: number; depth: number }[];
  asks: { price: number; depth: number }[];
  spread: number;
  midpoint: number;
} {
  const yesBid = (market.yes_bid_dollars ?? market.yes_bid ?? 0) * 1;
  const yesAsk = (market.yes_ask_dollars ?? market.yes_ask ?? 0) * 1;
  const noBid = (market.no_bid_dollars ?? market.no_bid ?? 0) * 1;
  const noAsk = (market.no_ask_dollars ?? market.no_ask ?? 0) * 1;
  const spread = yesAsk - yesBid;
  const midpoint = (yesAsk + yesBid) / 2;

  // Simulate depth from available data (Kalshi doesn't expose full L2)
  const bids = [
    { price: yesBid, depth: Number(market.open_interest_fp ?? market.open_interest ?? 0) || 0 },
    { price: +(yesBid - 0.01).toFixed(2), depth: Math.round((Number(market.volume_fp ?? market.volume ?? 0) || 0) * 0.3) },
    { price: +(yesBid - 0.02).toFixed(2), depth: Math.round((Number(market.volume_fp ?? market.volume ?? 0) || 0) * 0.2) },
  ].filter(b => b.price > 0);

  const asks = [
    { price: yesAsk, depth: Number(market.open_interest_fp ?? market.open_interest ?? 0) || 0 },
    { price: +(yesAsk + 0.01).toFixed(2), depth: Math.round((Number(market.volume_fp ?? market.volume ?? 0) || 0) * 0.3) },
    { price: +(yesAsk + 0.02).toFixed(2), depth: Math.round((Number(market.volume_fp ?? market.volume ?? 0) || 0) * 0.2) },
  ].filter(a => a.price <= 1);

  return { bids, asks, spread: +spread.toFixed(4), midpoint: +midpoint.toFixed(4) };
}

// ─── Main Handler ───────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const budgetRemaining = body.budget_remaining ?? 25.00;

    const { events, markets } = await fetchAllMarkets();
    console.log(`Fetched ${events.length} events, ${markets.length} markets`);

    // Build event lookup
    const eventMap = new Map<string, any>();
    for (const e of events) eventMap.set(e.event_ticker, e);

    // Filter golf events
    const golfEventTickers = new Set<string>();
    for (const e of events) {
      if (isGolfRelated((e.title || "") + " " + (e.series_ticker || "") + " " + (e.event_ticker || ""))) {
        golfEventTickers.add(e.event_ticker);
      }
    }

    // Classify all markets
    const golfMarkets = markets.filter((m: any) =>
      golfEventTickers.has(m.event_ticker) ||
      isGolfRelated((m.title || "") + " " + (m.subtitle || "") + " " + (m.ticker || ""))
    ).map((m: any) => {
      const title = (m.title || "") + " " + (m.subtitle || "");
      return {
        ...m,
        marketType: classifyGolfMarket(title),
        playerName: extractPlayerName(m.title || m.subtitle || ""),
        yesPrice: (m.yes_ask_dollars ?? m.yes_ask ?? m.last_price_dollars ?? m.last_price ?? 0) * 1,
        noPrice: (m.no_ask_dollars ?? m.no_ask ?? 0) * 1 || (1 - ((m.last_price_dollars ?? m.last_price ?? 0.5) * 1)),
        yesBid: (m.yes_bid_dollars ?? m.yes_bid ?? 0) * 1,
        yesAsk: (m.yes_ask_dollars ?? m.yes_ask ?? 0) * 1,
        noBid: (m.no_bid_dollars ?? m.no_bid ?? 0) * 1,
        noAsk: (m.no_ask_dollars ?? m.no_ask ?? 0) * 1,
        lastPrice: (m.last_price_dollars ?? m.last_price ?? 0) * 1,
        vol24h: Number(m.volume_24h_fp ?? m.volume_24h ?? 0) || 0,
        vol: Number(m.volume_fp ?? m.volume ?? 0) || 0,
        oi: Number(m.open_interest_fp ?? m.open_interest ?? 0) || 0,
        book: extractOrderBook(m),
      };
    });

    // Separate by type
    const winnerMkts = golfMarkets.filter((m: any) => m.marketType === "winner").sort((a: any, b: any) => b.yesPrice - a.yesPrice);
    const top10Mkts = golfMarkets.filter((m: any) => m.marketType === "top10");
    const top5Mkts = golfMarkets.filter((m: any) => m.marketType === "top5");
    const roundLeaderMkts = golfMarkets.filter((m: any) => m.marketType === "round_leader");

    // Build player grid (Top 15)
    let budgetUsed = 0;
    const playerGrid = winnerMkts.slice(0, 15).map((wm: any, idx: number) => {
      const name = wm.playerName;
      const lastName = name.split(" ").pop()?.toLowerCase() || "xxx";
      const top10 = top10Mkts.find((t: any) => t.playerName.toLowerCase().includes(lastName));
      const roundLeader = roundLeaderMkts.find((r: any) => r.playerName.toLowerCase().includes(lastName));

      const rank = idx + 1;
      const winnerYes = wm.yesPrice;
      const top10Yes = top10?.yesPrice || 0;
      const roundLeaderNo = roundLeader ? (1 - roundLeader.yesPrice) : 0;

      // Estimate lead & holes from market structure
      const leaderPrice = winnerMkts[0]?.yesPrice || 0;
      const estimatedLead = idx === 0 ? Math.max(1, Math.round((leaderPrice - (winnerMkts[1]?.yesPrice || 0)) * 25)) : 0;
      const holesRemaining = 18;

      // ── Alpha Models ──
      const anchor = idx === 0
        ? anchorScanner(winnerYes, estimatedLead, holesRemaining)
        : { fairValue: 0, edge: 0, signal: "N/A", reasoning: "" };

      const t11Price = winnerMkts[10]?.yesPrice || 0;
      const strokeCushion = Math.round((winnerYes - t11Price) * 30);
      const floor = floorWall(rank, top10Yes, strokeCushion);

      const hedge = (idx === 0 && roundLeaderNo > 0)
        ? hedgeGuard(winnerYes, winnerYes * 0.5, roundLeaderNo)
        : null;

      const vegas = vegasProtocol(winnerYes, wm.oi);

      // Estimate peak from ask (simple proxy)
      const peakEstimate = Math.max(winnerYes, wm.yesAsk || winnerYes);
      const trim = doubleBogeyTrim(winnerYes, peakEstimate * 1.3); // check if >20% below estimated peak

      // Bet sizing
      const alphaScore = vegas ? 0 : idx === 0 ? anchor.edge : (floor ? floor.discount : 0);
      const bet = computeBetSize(alphaScore, winnerYes, budgetRemaining - budgetUsed);
      if (bet.suggested > 0) budgetUsed += bet.suggested;

      return {
        rank, name, winnerYes,
        winnerNo: +(1 - winnerYes).toFixed(4),
        top10Yes, top10No: top10Yes > 0 ? +(1 - top10Yes).toFixed(4) : 0,
        roundLeaderNo,
        winnerTicker: wm.ticker,
        top10Ticker: top10?.ticker || "",
        roundLeaderTicker: roundLeader?.ticker || "",
        winnerVolume: wm.vol24h || wm.vol || 0,
        top10Volume: top10?.vol24h || top10?.vol || 0,
        winnerOI: wm.oi, top10OI: top10?.oi || 0,
        anchor: idx === 0 ? anchor : null,
        floor, hedge, vegas, trim, bet,
        estimatedLead: idx === 0 ? estimatedLead : null,
        book: wm.book,
      };
    });

    // ── Alerts ──
    const alerts: any[] = [];
    const leader = playerGrid[0];

    if (leader?.anchor?.signal === "ALPHA_BUY") {
      alerts.push({
        type: "ANCHOR_SCANNER", severity: "critical", signal: "ALPHA_BUY",
        message: leader.anchor.reasoning, bet: leader.bet, player: leader.name,
      });
    }

    for (const p of playerGrid) {
      if (p.floor) {
        alerts.push({
          type: "FLOOR_WALL", severity: "success", signal: "CAPITAL_LOCK",
          message: p.floor.reasoning, bet: p.bet, player: p.name,
        });
      }
      if (p.hedge) {
        alerts.push({
          type: "HEDGE_GUARD", severity: "warning", signal: "RISK_FREE_HEDGE",
          message: p.hedge.reasoning, player: p.name,
        });
      }
      if (p.vegas) {
        alerts.push({
          type: "VEGAS_PROTOCOL", severity: "critical", signal: "INSTANT_LIQUIDATION",
          message: p.vegas.reasoning, player: p.name, urgency: p.vegas.urgency,
        });
      }
      if (p.trim) {
        alerts.push({
          type: "DOUBLE_BOGEY", severity: "warning", signal: "TRIM_POSITION",
          message: p.trim.reasoning, player: p.name, trimPct: p.trim.trimPct,
        });
      }
    }

    // Delta alerts: volume spike with low price
    for (const p of playerGrid.slice(0, 10)) {
      if (p.winnerVolume > 100 && p.winnerYes < 0.10 && p.rank <= 5) {
        alerts.push({
          type: "MARKET_PANIC", severity: "info", signal: "DELTA_ALERT",
          message: `${p.name} (Rank ${p.rank}) at ${(p.winnerYes * 100).toFixed(0)}¢ with ${p.winnerVolume} vol — possible panic sell.`,
          player: p.name,
        });
      }
    }

    // ── Corridor Status ──
    const corridor = {
      winnerActive: (leader?.winnerYes || 0) > 0,
      top10Floor: (leader?.top10Yes || 0) >= 0.80,
      roundHedge: (leader?.roundLeaderNo || 0) > 0 && (leader?.roundLeaderNo || 0) < 0.20,
      status: "EXPOSED" as string,
      safetyPct: 0,
    };
    const safetyParts = [corridor.winnerActive, corridor.top10Floor, corridor.roundHedge].filter(Boolean).length;
    corridor.safetyPct = Math.round((safetyParts / 3) * 100);
    corridor.status = safetyParts === 3 ? "PROTECTED" : safetyParts >= 2 ? "PARTIAL" : "EXPOSED";

    // ── Summary ──
    const summary = {
      totalGolfMarkets: golfMarkets.length,
      winnerMarkets: winnerMkts.length,
      top10Markets: top10Mkts.length,
      top5Markets: top5Mkts.length,
      roundLeaderMarkets: roundLeaderMkts.length,
      otherMarkets: golfMarkets.filter((m: any) => m.marketType === "other").length,
      totalGolfEvents: golfEventTickers.size,
      totalKalshiEvents: events.length,
      totalKalshiMarkets: markets.length,
      budgetUsed: +budgetUsed.toFixed(2),
      budgetRemaining: +(budgetRemaining - budgetUsed).toFixed(2),
    };

    // ── All classified golf markets with order books ──
    const allClassified = golfMarkets.map((m: any) => ({
      ticker: m.ticker,
      title: m.title || m.subtitle,
      marketType: m.marketType,
      playerName: m.playerName,
      yesPrice: m.yesPrice,
      noPrice: m.noPrice,
      yesBid: m.yesBid,
      yesAsk: m.yesAsk,
      noBid: m.noBid,
      noAsk: m.noAsk,
      volume: m.vol,
      vol24h: m.vol24h,
      oi: m.oi,
      book: m.book,
      closeTime: m.close_time || m.expiration_time,
    }));

    return new Response(JSON.stringify({
      playerGrid, alerts, corridor, summary,
      markets: allClassified,
      events: [...golfEventTickers].map(t => {
        const e = eventMap.get(t);
        return e ? { ticker: e.event_ticker, title: e.title, category: e.category, status: e.status } : null;
      }).filter(Boolean),
      source: "kalshi_live",
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Synthesis engine error:", error);
    return new Response(JSON.stringify({ error: error.message, source: "kalshi_live" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
