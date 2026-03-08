const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2";

// ─── Kalshi Data Fetchers ───────────────────────────────────────

async function fetchKalshiGolfMarkets() {
  // Fetch events first to find golf-related ones
  const eventsRes = await fetch(`${KALSHI_API}/events?limit=200&status=open`, {
    headers: { Accept: "application/json" },
  });
  if (!eventsRes.ok) throw new Error(`Kalshi events API ${eventsRes.status}`);
  const eventsData = await eventsRes.json();
  const events = eventsData.events || [];

  // Filter for golf events
  const golfEvents = events.filter((e: any) => {
    const t = ((e.title || "") + " " + (e.series_ticker || "") + " " + (e.event_ticker || "")).toUpperCase();
    return t.includes("GOLF") || t.includes("PGA") || t.includes("MASTERS") || t.includes("OPEN") ||
      t.includes("LPGA") || t.includes("TOUR") || t.includes("BIRDIE") || t.includes("WINNER") && t.includes("TOURNAMENT");
  });

  console.log(`Found ${golfEvents.length} golf events out of ${events.length} total`);

  // Fetch all open markets
  const marketsRes = await fetch(`${KALSHI_API}/markets?limit=200&status=open`, {
    headers: { Accept: "application/json" },
  });
  if (!marketsRes.ok) throw new Error(`Kalshi markets API ${marketsRes.status}`);
  const marketsData = await marketsRes.json();
  const allMarkets = marketsData.markets || [];

  // Build event ticker set for golf
  const golfEventTickers = new Set(golfEvents.map((e: any) => e.event_ticker));

  // Filter markets belonging to golf events, or with golf keywords in title
  const golfMarkets = allMarkets.filter((m: any) => {
    if (golfEventTickers.has(m.event_ticker)) return true;
    const title = ((m.title || "") + " " + (m.subtitle || "") + " " + (m.ticker || "")).toUpperCase();
    return title.includes("GOLF") || title.includes("PGA") || title.includes("MASTERS") ||
      title.includes("TOP 10") && (title.includes("TOUR") || title.includes("OPEN"));
  });

  console.log(`Found ${golfMarkets.length} golf markets`);

  return { events: golfEvents, markets: golfMarkets, allMarkets, allEvents: events };
}

// ─── Market Classification ──────────────────────────────────────

type MarketType = "winner" | "top10" | "top5" | "top20" | "round_leader" | "matchup" | "other";

function classifyMarket(market: any): MarketType {
  const title = ((market.title || "") + " " + (market.subtitle || "")).toUpperCase();
  if (title.includes("WINNER") || title.includes("WIN THE")) return "winner";
  if (title.includes("TOP 10") || title.includes("TOP TEN")) return "top10";
  if (title.includes("TOP 5") || title.includes("TOP FIVE")) return "top5";
  if (title.includes("TOP 20") || title.includes("TOP TWENTY")) return "top20";
  if (title.includes("ROUND LEADER") || title.includes("LEAD AFTER")) return "round_leader";
  if (title.includes("VS") || title.includes("MATCHUP") || title.includes("HEAD TO HEAD")) return "matchup";
  return "other";
}

function extractPlayerName(market: any): string {
  const title = market.title || market.subtitle || "";
  // Try to extract player name — usually before "to win", "top 10", etc.
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

// ─── Alpha Models ───────────────────────────────────────────────

interface PlayerMarketData {
  name: string;
  winnerYes: number;
  winnerNo: number;
  top10Yes: number;
  top10No: number;
  roundLeaderNo: number;
  winnerTicker: string;
  top10Ticker: string;
  roundLeaderTicker: string;
  winnerVolume: number;
  top10Volume: number;
  winnerOpenInterest: number;
  top10OpenInterest: number;
}

// Leader Lag: Fair Value = 1 - (1 / (1 + Lead_Strokes / (Holes_Remaining / 2)))
function computeLeaderLag(
  currentPrice: number,
  leadStrokes: number,
  holesRemaining: number
): { fairValue: number; edge: number; signal: string } {
  if (holesRemaining <= 0) return { fairValue: currentPrice, edge: 0, signal: "FINISHED" };
  const fairValue = 1 - (1 / (1 + leadStrokes / (holesRemaining / 2)));
  const edge = (fairValue - currentPrice) / fairValue;
  let signal = "HOLD";
  if (edge >= 0.15) signal = "CONCENTRATION_BUY";
  else if (edge >= 0.08) signal = "WATCH";
  else if (edge <= -0.10) signal = "OVERPRICED";
  return { fairValue: +fairValue.toFixed(4), edge: +edge.toFixed(4), signal };
}

// Probability Wall: Top 5 player with Top 10 < 90¢ and ≥3 stroke lead over T11
function computeProbabilityWall(
  rank: number,
  top10Price: number,
  strokeLeadOverBubble: number
): { signal: string; discount: number; reasoning: string } | null {
  if (rank > 5) return null;
  if (top10Price >= 0.90) return null;
  if (strokeLeadOverBubble < 3) return null;
  const discount = +(0.90 - top10Price).toFixed(2);
  return {
    signal: "CAPITAL_LOCK",
    discount,
    reasoning: `Rank ${rank} player at ${(top10Price * 100).toFixed(0)}¢ Top 10 — ${discount * 100}¢ below 90¢ fair value with ${strokeLeadOverBubble}-stroke cushion over bubble. Max $5.00 limit.`,
  };
}

// Chaos Hedge: Winner position up >50%, Round Leader No < 12¢
function computeChaosHedge(
  winnerYes: number,
  winnerCost: number,
  roundLeaderNo: number
): { signal: string; reasoning: string } | null {
  if (winnerCost <= 0) return null;
  const gain = (winnerYes - winnerCost) / winnerCost;
  if (gain <= 0.50) return null;
  if (roundLeaderNo >= 0.12) return null;
  return {
    signal: "RISK_FREE_HEDGE",
    reasoning: `Winner position up ${(gain * 100).toFixed(0)}%. Round Leader No at ${(roundLeaderNo * 100).toFixed(0)}¢ — below 12¢ threshold. Hedge locks in profit with minimal downside.`,
  };
}

// ─── Bet Calculator ─────────────────────────────────────────────

function computeBetSize(alphaScore: number): { suggested: number; reasoning: string } {
  // alphaScore = gap between market price and model probability (0 to 1)
  const abs = Math.abs(alphaScore);
  let suggested: number;
  if (abs >= 0.25) suggested = 5.00;
  else if (abs >= 0.15) suggested = 3.00;
  else if (abs >= 0.10) suggested = 2.00;
  else if (abs >= 0.05) suggested = 1.00;
  else suggested = 0;

  return {
    suggested,
    reasoning: suggested === 0
      ? "Edge too small — no bet"
      : `Alpha ${(abs * 100).toFixed(1)}% → $${suggested.toFixed(2)} entry`,
  };
}

// ─── Main Handler ───────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { events, markets, allMarkets, allEvents } = await fetchKalshiGolfMarkets();

    // Classify all golf markets
    const classified = markets.map((m: any) => ({
      ...m,
      marketType: classifyMarket(m),
      playerName: extractPlayerName(m),
      yesPrice: (m.yes_ask || m.last_price || 0) / 100,
      noPrice: (m.no_ask || (100 - (m.last_price || 50))) / 100,
      yesBid: (m.yes_bid || 0) / 100,
      yesAsk: (m.yes_ask || 0) / 100,
      noBid: (m.no_bid || 0) / 100,
      noAsk: (m.no_ask || 0) / 100,
      lastPrice: (m.last_price || 0) / 100,
      vol24h: m.volume_24h || 0,
      volume: m.volume || 0,
      openInterest: m.open_interest || 0,
    }));

    // Build player map — aggregate winner + top10 + round leader for each player
    const winnerMarkets = classified.filter((m: any) => m.marketType === "winner");
    const top10Markets = classified.filter((m: any) => m.marketType === "top10");
    const top5Markets = classified.filter((m: any) => m.marketType === "top5");
    const roundLeaderMarkets = classified.filter((m: any) => m.marketType === "round_leader");

    // Sort winner markets by price (implied rank)
    winnerMarkets.sort((a: any, b: any) => b.yesPrice - a.yesPrice);

    // Build player grid (Top 15 by winner price)
    const playerGrid = winnerMarkets.slice(0, 15).map((wm: any, idx: number) => {
      const name = wm.playerName;
      const top10 = top10Markets.find((t: any) =>
        t.playerName.toLowerCase().includes(name.split(" ").pop()?.toLowerCase() || "xxx")
      );
      const roundLeader = roundLeaderMarkets.find((r: any) =>
        r.playerName.toLowerCase().includes(name.split(" ").pop()?.toLowerCase() || "xxx")
      );

      const impliedRank = idx + 1;
      const winnerYes = wm.yesPrice;
      const top10Yes = top10?.yesPrice || 0;
      const roundLeaderNo = roundLeader ? (1 - roundLeader.yesPrice) : 0;

      // Estimate holes remaining and lead from market prices
      // Leader's implied lead ≈ proportional to price gap
      const leaderPrice = winnerMarkets[0]?.yesPrice || 0;
      const estimatedLead = idx === 0 ? Math.max(1, Math.round((leaderPrice - (winnerMarkets[1]?.yesPrice || 0)) * 20)) : 0;
      const holesRemaining = 18; // Default assumption for live round

      // Alpha: Leader Lag
      const leaderLag = idx === 0
        ? computeLeaderLag(winnerYes, estimatedLead, holesRemaining)
        : { fairValue: 0, edge: 0, signal: "N/A" };

      // Alpha: Probability Wall — estimate stroke lead over T11
      const t11Price = winnerMarkets[10]?.yesPrice || 0;
      const strokeLeadOverBubble = Math.round((winnerYes - t11Price) * 30);
      const probWall = computeProbabilityWall(impliedRank, top10Yes, strokeLeadOverBubble);

      // Bet calculator
      const alphaScore = idx === 0 ? leaderLag.edge : (probWall ? probWall.discount : 0);
      const bet = computeBetSize(alphaScore);

      return {
        rank: impliedRank,
        name,
        winnerYes,
        winnerNo: +(1 - winnerYes).toFixed(4),
        top10Yes,
        top10No: top10Yes > 0 ? +(1 - top10Yes).toFixed(4) : 0,
        roundLeaderNo,
        winnerTicker: wm.ticker,
        top10Ticker: top10?.ticker || "",
        roundLeaderTicker: roundLeader?.ticker || "",
        winnerVolume: wm.vol24h || wm.volume || 0,
        top10Volume: top10?.vol24h || top10?.volume || 0,
        winnerOpenInterest: wm.openInterest || 0,
        top10OpenInterest: top10?.openInterest || 0,
        leaderLag: idx === 0 ? leaderLag : null,
        probWall,
        bet,
        estimatedLead: idx === 0 ? estimatedLead : null,
      };
    });

    // ─── Edge Alerts ──────────────────────────────────────
    const alerts: any[] = [];

    // Leader Lag alert
    const leader = playerGrid[0];
    if (leader?.leaderLag?.signal === "CONCENTRATION_BUY") {
      alerts.push({
        type: "LEADER_LAG",
        severity: "critical",
        signal: "CONCENTRATION_BUY",
        message: `${leader.name} Winner Yes at ${(leader.winnerYes * 100).toFixed(0)}¢ — Fair Value ${(leader.leaderLag.fairValue * 100).toFixed(0)}¢. Edge: ${(leader.leaderLag.edge * 100).toFixed(1)}%. BUY.`,
        bet: leader.bet,
      });
    }

    // Probability Wall alerts
    for (const p of playerGrid) {
      if (p.probWall) {
        alerts.push({
          type: "PROBABILITY_WALL",
          severity: "success",
          signal: "CAPITAL_LOCK",
          message: p.probWall.reasoning,
          bet: p.bet,
          player: p.name,
        });
      }
    }

    // Chaos Hedge — check if leader's winner is up significantly and round leader no is cheap
    if (leader && leader.roundLeaderNo > 0) {
      const chaosHedge = computeChaosHedge(
        leader.winnerYes,
        leader.winnerYes * 0.5, // Assume 50% cost basis as estimate
        leader.roundLeaderNo
      );
      if (chaosHedge) {
        alerts.push({
          type: "CHAOS_HEDGE",
          severity: "warning",
          signal: "RISK_FREE_HEDGE",
          message: chaosHedge.reasoning,
          player: leader.name,
        });
      }
    }

    // Delta alerts — markets with high volume but low price (potential panic)
    for (const p of playerGrid.slice(0, 10)) {
      if (p.winnerVolume > 100 && p.winnerYes < 0.10 && p.rank <= 5) {
        alerts.push({
          type: "MARKET_PANIC",
          severity: "info",
          signal: "DELTA_ALERT",
          message: `${p.name} (Rank ${p.rank}) Winner at ${(p.winnerYes * 100).toFixed(0)}¢ with ${p.winnerVolume} volume — possible market panic. Check score.`,
          player: p.name,
        });
      }
    }

    // ─── No-Loss Corridor ─────────────────────────────────
    // Green if leader has winner + top10 floor + round hedge available
    const corridorStatus = {
      winnerActive: leader?.winnerYes > 0,
      top10Floor: leader?.top10Yes >= 0.80,
      roundHedge: leader?.roundLeaderNo > 0 && leader?.roundLeaderNo < 0.20,
      status: "EXPOSED" as string,
    };
    if (corridorStatus.winnerActive && corridorStatus.top10Floor && corridorStatus.roundHedge) {
      corridorStatus.status = "PROTECTED";
    } else if (corridorStatus.winnerActive && (corridorStatus.top10Floor || corridorStatus.roundHedge)) {
      corridorStatus.status = "PARTIAL";
    }

    // ─── Market Summary ───────────────────────────────────
    const summary = {
      totalGolfMarkets: markets.length,
      winnerMarkets: winnerMarkets.length,
      top10Markets: top10Markets.length,
      top5Markets: top5Markets.length,
      roundLeaderMarkets: roundLeaderMarkets.length,
      otherMarkets: classified.filter((m: any) => m.marketType === "other").length,
      totalGolfEvents: events.length,
    };

    // All classified markets for the raw feed
    const allClassified = classified.map((m: any) => ({
      ticker: m.ticker,
      title: m.title || m.subtitle,
      marketType: m.marketType,
      playerName: m.playerName,
      yesPrice: m.yesPrice,
      noPrice: m.noPrice,
      yesBid: m.yesBid,
      yesAsk: m.yesAsk,
      volume: m.volume,
      vol24h: m.vol24h,
      openInterest: m.openInterest,
      closeTime: m.close_time || m.expiration_time,
    }));

    return new Response(
      JSON.stringify({
        playerGrid,
        alerts,
        corridor: corridorStatus,
        summary,
        markets: allClassified,
        events: events.map((e: any) => ({
          ticker: e.event_ticker,
          title: e.title,
          category: e.category,
          status: e.status,
        })),
        source: "kalshi_live",
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Golf portfolio error:", error);
    return new Response(
      JSON.stringify({ error: error.message, source: "kalshi_live" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
