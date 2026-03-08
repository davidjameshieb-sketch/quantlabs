import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simulated live tournament data (replace with Sportradar/Golf Channel API)
function generateTournamentData() {
  const players = [
    { name: "Scottie Scheffler", rank: 1, score: -18, thru: 14, today: -5, strokes: 54, round: 4 },
    { name: "Rory McIlroy", rank: 2, score: -15, thru: 15, today: -3, strokes: 57, round: 4 },
    { name: "Jon Rahm", rank: 3, score: -14, thru: 13, today: -2, strokes: 58, round: 4 },
    { name: "Collin Morikawa", rank: 4, score: -13, thru: 16, today: -4, strokes: 59, round: 4 },
    { name: "Viktor Hovland", rank: 5, score: -12, thru: 14, today: -1, strokes: 60, round: 4 },
    { name: "Xander Schauffele", rank: 6, score: -11, thru: 15, today: -2, strokes: 61, round: 4 },
    { name: "Patrick Cantlay", rank: 7, score: -10, thru: 13, today: -1, strokes: 62, round: 4 },
    { name: "Ludvig Aberg", rank: 8, score: -9, thru: 14, today: 0, strokes: 63, round: 4 },
    { name: "Wyndham Clark", rank: 9, score: -8, thru: 12, today: +1, strokes: 64, round: 4 },
    { name: "Tommy Fleetwood", rank: 10, score: -7, thru: 15, today: -1, strokes: 65, round: 4 },
    { name: "Max Homa", rank: 11, score: -6, thru: 14, today: 0, strokes: 66, round: 4 },
    { name: "Sahith Theegala", rank: 12, score: -5, thru: 13, today: +1, strokes: 67, round: 4 },
  ];

  // Add slight randomization
  return players.map((p) => ({
    ...p,
    thru: Math.min(18, p.thru + Math.floor(Math.random() * 2)),
  }));
}

// Simulated Kalshi contract pricing
function generateKalshiContracts(players: any[]) {
  const leader = players[0];
  const leaderLead = Math.abs(leader.score - players[1].score);

  return players.map((p, i) => {
    // Winner Yes price inversely related to rank
    const winnerYesBase = i === 0 ? 0.65 : i === 1 ? 0.18 : i === 2 ? 0.08 : Math.max(0.01, 0.05 - i * 0.005);
    const winnerYes = +(winnerYesBase + (Math.random() * 0.06 - 0.03)).toFixed(2);

    // Top 10 price based on rank
    const top10Base = i < 5 ? 0.92 - i * 0.03 : i < 10 ? 0.75 - (i - 5) * 0.08 : 0.3 - (i - 10) * 0.1;
    const top10Yes = +Math.min(0.99, Math.max(0.05, top10Base + (Math.random() * 0.08 - 0.04))).toFixed(2);

    // Round leader No price (for hedging)
    const roundLeaderNo = i === 0 ? +(1 - winnerYes + 0.02).toFixed(2) : +(0.85 + Math.random() * 0.1).toFixed(2);

    return {
      player: p.name,
      rank: p.rank,
      winnerYes: Math.min(0.99, Math.max(0.01, winnerYes)),
      winnerNo: +(1 - Math.min(0.99, Math.max(0.01, winnerYes)) + 0.01).toFixed(2),
      top10Yes: top10Yes,
      top10No: +(1 - top10Yes + 0.01).toFixed(2),
      roundLeaderNo,
      leaderLead: i === 0 ? leaderLead : null,
    };
  });
}

// Portfolio simulation
function generatePortfolio(players: any[], contracts: any[]) {
  const positions = [
    { player: players[0].name, market: "Winner Yes", contracts: 50, avgCost: 0.45, currentPrice: contracts[0].winnerYes, type: "anchor" },
    { player: players[1].name, market: "Winner Yes", contracts: 20, avgCost: 0.12, currentPrice: contracts[1].winnerYes, type: "satellite" },
    { player: players[3].name, market: "Winner Yes", contracts: 15, avgCost: 0.08, currentPrice: contracts[3].winnerYes, type: "satellite" },
    { player: players[0].name, market: "Round Leader No", contracts: 30, avgCost: 0.32, currentPrice: contracts[0].roundLeaderNo, type: "hedge" },
    { player: players[4].name, market: "Top 10 Yes", contracts: 40, avgCost: 0.72, currentPrice: contracts[4].top10Yes, type: "floor" },
    { player: players[2].name, market: "Top 10 Yes", contracts: 25, avgCost: 0.68, currentPrice: contracts[2].top10Yes, type: "floor" },
  ];

  return positions.map((pos) => ({
    ...pos,
    value: +(pos.contracts * pos.currentPrice).toFixed(2),
    cost: +(pos.contracts * pos.avgCost).toFixed(2),
    pnl: +(pos.contracts * (pos.currentPrice - pos.avgCost)).toFixed(2),
    pnlPct: +(((pos.currentPrice - pos.avgCost) / pos.avgCost) * 100).toFixed(1),
  }));
}

// Concentration engine
function calculateConcentration(portfolio: any[], contracts: any[], leader: any) {
  const anchorPos = portfolio.find((p) => p.type === "anchor");
  const satellites = portfolio.filter((p) => p.type === "satellite");
  const leaderLead = contracts[0].leaderLead || 0;

  const suggestions: any[] = [];

  if (leaderLead >= 3) {
    for (const sat of satellites) {
      const liquidationValue = sat.value;
      const additionalContracts = Math.floor(liquidationValue / contracts[0].winnerYes);
      const newAnchorValue = (anchorPos?.contracts || 0) + additionalContracts;
      const roi = +(((1.0 - contracts[0].winnerYes) / contracts[0].winnerYes) * 100).toFixed(1);

      suggestions.push({
        action: "LIQUIDATE",
        from: `${sat.player} - ${sat.market}`,
        value: liquidationValue,
        toContracts: additionalContracts,
        roi,
        reasoning: `Leader +${leaderLead} strokes. Satellite ROI declining. Redirect to Anchor at ${contracts[0].winnerYes}¢ for ${roi}% upside.`,
      });
    }
  }

  return {
    anchorSize: anchorPos?.value || 0,
    anchorPct: +((anchorPos?.value || 0) / portfolio.reduce((s, p) => s + p.value, 0) * 100).toFixed(1),
    suggestions,
    recommendation: leaderLead >= 3 ? "CONCENTRATE" : leaderLead >= 1 ? "HOLD" : "DIVERSIFY",
  };
}

// Hedge calculator
function calculateHedge(portfolio: any[], contracts: any[], leader: any, players: any[]) {
  const anchorPos = portfolio.find((p) => p.type === "anchor");
  if (!anchorPos) return null;

  const anchorRisk = anchorPos.cost;
  const roundLeaderNoPrice = contracts[0].roundLeaderNo;
  const contractsNeeded = Math.ceil(anchorRisk / (1.0 - roundLeaderNoPrice));
  const hedgeCost = +(contractsNeeded * roundLeaderNoPrice).toFixed(2);
  const maxLoss = +(anchorRisk - (contractsNeeded * (1.0 - roundLeaderNoPrice))).toFixed(2);
  const leaderLead = contracts[0].leaderLead || 0;

  return {
    anchorCost: anchorRisk,
    roundLeaderNoPrice,
    contractsNeeded,
    hedgeCost,
    maxLossIfSwing: Math.max(0, maxLoss),
    protectionLevel: "3-stroke swing",
    urgency: leaderLead < 1 ? "EMERGENCY" : leaderLead < 2 ? "HIGH" : leaderLead < 3 ? "MODERATE" : "LOW",
    corridorStatus: portfolio.some((p) => p.type === "hedge") && portfolio.some((p) => p.type === "floor") ? "PROTECTED" : portfolio.some((p) => p.type === "hedge") ? "PARTIAL" : "EXPOSED",
  };
}

// Floor stabilizers
function findFloorStabilizers(players: any[], contracts: any[]) {
  return contracts
    .filter((c, i) => i < 5 && c.top10Yes < 0.80)
    .map((c, i) => ({
      player: c.player,
      rank: c.rank,
      top10Price: c.top10Yes,
      discount: +((0.80 - c.top10Yes) * 100).toFixed(0),
      signal: "FLOOR_STABILIZER",
      reasoning: `Rank ${c.rank} player trading at ${(c.top10Yes * 100).toFixed(0)}¢ — ${((0.80 - c.top10Yes) * 100).toFixed(0)}¢ below fair value. High-probability floor position.`,
    }));
}

// Portfolio value history (simulated)
function generatePortfolioHistory() {
  const now = Date.now();
  const points = [];
  let value = 85;
  for (let i = 48; i >= 0; i--) {
    value += (Math.random() - 0.4) * 3;
    value = Math.max(60, Math.min(150, value));
    points.push({
      time: new Date(now - i * 30 * 60 * 1000).toISOString(),
      value: +value.toFixed(2),
    });
  }
  return points;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const players = generateTournamentData();
    const contracts = generateKalshiContracts(players);
    const portfolio = generatePortfolio(players, contracts);
    const concentration = calculateConcentration(portfolio, contracts, players[0]);
    const hedge = calculateHedge(portfolio, contracts, players[0], players);
    const floorStabilizers = findFloorStabilizers(players, contracts);
    const portfolioHistory = generatePortfolioHistory();

    const leaderLead = contracts[0].leaderLead || 0;
    const totalValue = portfolio.reduce((s, p) => s + p.value, 0);
    const totalCost = portfolio.reduce((s, p) => s + p.cost, 0);
    const totalPnl = +(totalValue - totalCost).toFixed(2);

    const alerts: any[] = [];
    if (leaderLead > 3) {
      alerts.push({ type: "LOCKED", severity: "success", message: `Winner Yes LOCKED — Leader by ${leaderLead} strokes` });
    }
    if (leaderLead < 1) {
      alerts.push({ type: "EMERGENCY_HEDGE", severity: "critical", message: `EMERGENCY: Leader lead < 1 stroke. Hedge Round Leader NOW.` });
    }
    if (floorStabilizers.length > 0) {
      alerts.push({ type: "FLOOR_OPPORTUNITY", severity: "info", message: `${floorStabilizers.length} Floor Stabilizer(s) detected below 80¢` });
    }

    return new Response(
      JSON.stringify({
        tournament: {
          name: "The Masters 2026",
          course: "Augusta National Golf Club",
          round: 4,
          status: "In Progress",
        },
        leaderboard: players,
        contracts,
        portfolio: {
          positions: portfolio,
          totalValue: +totalValue.toFixed(2),
          totalCost: +totalCost.toFixed(2),
          totalPnl,
          totalPnlPct: +((totalPnl / totalCost) * 100).toFixed(1),
        },
        concentration,
        hedge,
        floorStabilizers,
        portfolioHistory,
        alerts,
        corridor: {
          status: hedge?.corridorStatus || "EXPOSED",
          anchorProtected: portfolio.some((p) => p.type === "hedge"),
          floorActive: portfolio.some((p) => p.type === "floor"),
          leaderLead,
        },
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Golf portfolio error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
