import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Sport Categories matching Kalshi's full catalog ───
const SPORT_CATEGORIES = [
  "Basketball", "Baseball", "Hockey", "Soccer", "Tennis",
  "Golf", "Aussie Rules", "Cricket", "Racing", "Esports",
];

// ─── Simulated market generators per sport ───

function randomBetween(a: number, b: number) {
  return +(a + Math.random() * (b - a)).toFixed(2);
}

function makeTeamMarket(sport: string, teamA: string, teamB: string, opts?: { league?: string; live?: boolean; period?: string }) {
  const pA = randomBetween(0.05, 0.95);
  const pB = +(1 - pA).toFixed(2);
  const spread = randomBetween(-12.5, 12.5);
  const total = randomBetween(150, 250);
  return {
    sport, league: opts?.league || sport,
    type: "game", live: opts?.live ?? Math.random() > 0.5,
    period: opts?.period || (opts?.live ? "In Progress" : "Upcoming"),
    teamA: { name: teamA, yesPrice: Math.max(0.01, Math.min(0.99, pA)), pct: Math.round(pA * 100) },
    teamB: { name: teamB, yesPrice: Math.max(0.01, Math.min(0.99, pB)), pct: Math.round(pB * 100) },
    spread, total,
    volume: Math.round(Math.random() * 50000 + 5000),
    startTime: new Date(Date.now() + Math.random() * 86400000).toISOString(),
  };
}

function makePlayerPropMarket(sport: string, player: string, prop: string, line: number) {
  const overPrice = randomBetween(0.35, 0.70);
  return {
    sport, type: "player_prop", live: Math.random() > 0.6,
    player, prop, line,
    over: { price: overPrice, pct: Math.round(overPrice * 100) },
    under: { price: +(1 - overPrice + 0.01).toFixed(2), pct: Math.round((1 - overPrice) * 100) },
    volume: Math.round(Math.random() * 20000 + 2000),
  };
}

function makeOutrightMarket(sport: string, event: string, participants: { name: string; score?: number }[]) {
  let remaining = 1.0;
  const priced = participants.map((p, i) => {
    const isLast = i === participants.length - 1;
    const price = isLast ? remaining : +(remaining * randomBetween(0.1, 0.6)).toFixed(2);
    remaining = +(remaining - price).toFixed(2);
    return { ...p, yesPrice: Math.max(0.01, price), pct: Math.round(price * 100) };
  });
  return { sport, type: "outright", event, participants: priced, live: Math.random() > 0.4, volume: Math.round(Math.random() * 100000 + 10000) };
}

// ─── Generate full market catalog ───

function generateAllMarkets() {
  const markets: any[] = [];

  // Basketball
  const nbaGames = [
    ["New York Knicks", "Los Angeles Lakers"], ["Boston Celtics", "Milwaukee Bucks"],
    ["Golden State Warriors", "Denver Nuggets"], ["Phoenix Suns", "Dallas Mavericks"],
    ["Philadelphia 76ers", "Miami Heat"], ["Minnesota Timberwolves", "Oklahoma City Thunder"],
  ];
  nbaGames.forEach(([a, b]) => markets.push(makeTeamMarket("Basketball", a, b, { league: "NBA" })));
  markets.push(makePlayerPropMarket("Basketball", "LeBron James", "Points", 27.5));
  markets.push(makePlayerPropMarket("Basketball", "Jalen Brunson", "Assists", 7.5));
  markets.push(makePlayerPropMarket("Basketball", "Nikola Jokic", "Rebounds", 12.5));

  // Baseball
  const mlbGames = [
    ["New York Yankees", "Boston Red Sox"], ["Los Angeles Dodgers", "San Francisco Giants"],
    ["Houston Astros", "Texas Rangers"], ["Atlanta Braves", "Philadelphia Phillies"],
  ];
  mlbGames.forEach(([a, b]) => markets.push(makeTeamMarket("Baseball", a, b, { league: "MLB" })));
  markets.push(makePlayerPropMarket("Baseball", "Shohei Ohtani", "Strikeouts", 7.5));

  // Hockey
  const nhlGames = [
    ["New York Rangers", "New Jersey Devils"], ["Toronto Maple Leafs", "Montreal Canadiens"],
    ["Colorado Avalanche", "Vegas Golden Knights"], ["Edmonton Oilers", "Vancouver Canucks"],
    ["Florida Panthers", "Carolina Hurricanes"],
  ];
  nhlGames.forEach(([a, b]) => markets.push(makeTeamMarket("Hockey", a, b, { league: "NHL" })));

  // Soccer
  const soccerGames = [
    ["Manchester City", "Arsenal", "Premier League"], ["Real Madrid", "Barcelona", "La Liga"],
    ["AC Milan", "Inter Milan", "Serie A"], ["Bayern Munich", "Borussia Dortmund", "Bundesliga"],
    ["PSG", "Marseille", "Ligue 1"], ["LA Galaxy", "LAFC", "MLS"],
    ["Flamengo", "Palmeiras", "Brasileirao"], ["Celtic", "Rangers", "Scottish Premiership"],
  ];
  soccerGames.forEach(([a, b, lg]) => markets.push(makeTeamMarket("Soccer", a, b, { league: lg })));

  // Tennis
  const tennisMatches = [
    ["Carlos Alcaraz", "Jannik Sinner"], ["Novak Djokovic", "Alexander Zverev"],
    ["Iga Swiatek", "Aryna Sabalenka"], ["Coco Gauff", "Jessica Pegula"],
  ];
  tennisMatches.forEach(([a, b]) => markets.push(makeTeamMarket("Tennis", a, b, { league: "ATP/WTA" })));

  // Golf - Outright
  markets.push(makeOutrightMarket("Golf", "PGA Arnold Palmer Invitational Winner", [
    { name: "Daniel Berger", score: -15 }, { name: "Akshay Bhatia", score: -13 },
    { name: "Scottie Scheffler", score: -12 }, { name: "Rory McIlroy", score: -11 },
    { name: "Collin Morikawa", score: -10 },
  ]));
  markets.push(makeOutrightMarket("Golf", "Masters 2026 Winner", [
    { name: "Scottie Scheffler" }, { name: "Rory McIlroy" },
    { name: "Jon Rahm" }, { name: "Xander Schauffele" },
  ]));

  // Aussie Rules
  const aflGames = [
    ["Collingwood", "Carlton"], ["Richmond", "Geelong"],
    ["Sydney Swans", "Melbourne"], ["Brisbane Lions", "West Coast"],
  ];
  aflGames.forEach(([a, b]) => markets.push(makeTeamMarket("Aussie Rules", a, b, { league: "AFL" })));

  // Cricket
  markets.push(makeTeamMarket("Cricket", "India", "Australia", { league: "Test" }));
  markets.push(makeTeamMarket("Cricket", "England", "South Africa", { league: "ODI" }));
  markets.push(makeOutrightMarket("Cricket", "IPL 2026 Winner", [
    { name: "Mumbai Indians" }, { name: "Chennai Super Kings" },
    { name: "Royal Challengers" }, { name: "Gujarat Titans" },
  ]));

  // Racing
  markets.push(makeOutrightMarket("Racing", "Kentucky Derby 2026 Winner", [
    { name: "Favorite Horse A" }, { name: "Contender B" },
    { name: "Longshot C" }, { name: "Dark Horse D" },
  ]));

  // Esports
  markets.push(makeTeamMarket("Esports", "HAVU", "los kogutos", { league: "CS2" }));
  markets.push(makeTeamMarket("Esports", "T1", "Gen.G", { league: "LoL LCK" }));
  markets.push(makeTeamMarket("Esports", "Cloud9", "Team Liquid", { league: "Valorant" }));

  return markets;
}

// ─── Portfolio simulation ───

function generatePortfolio(markets: any[]) {
  const gameMarkets = markets.filter(m => m.type === "game" && m.live);
  const positions: any[] = [];

  // Pick some random live positions
  const picks = gameMarkets.sort(() => Math.random() - 0.5).slice(0, 8);
  for (const m of picks) {
    const side = Math.random() > 0.5 ? "teamA" : "teamB";
    const team = m[side];
    const qty = Math.round(Math.random() * 80 + 10);
    const avgCost = randomBetween(0.2, 0.7);
    const currentPrice = team.yesPrice;
    positions.push({
      sport: m.sport, league: m.league,
      market: `${m.teamA.name} vs ${m.teamB.name}`,
      side: team.name, type: "Yes",
      contracts: qty, avgCost, currentPrice,
      value: +(qty * currentPrice).toFixed(2),
      cost: +(qty * avgCost).toFixed(2),
      pnl: +(qty * (currentPrice - avgCost)).toFixed(2),
      pnlPct: +(((currentPrice - avgCost) / avgCost) * 100).toFixed(1),
      live: m.live,
    });
  }

  // Add a golf outright
  positions.push({
    sport: "Golf", league: "PGA",
    market: "Arnold Palmer Invitational Winner",
    side: "Daniel Berger", type: "Yes",
    contracts: 934, avgCost: 0.01, currentPrice: 0.78,
    value: +(934 * 0.78).toFixed(2), cost: +(934 * 0.01).toFixed(2),
    pnl: +(934 * (0.78 - 0.01)).toFixed(2),
    pnlPct: +(((0.78 - 0.01) / 0.01) * 100).toFixed(1),
    live: true,
  });

  const totalValue = positions.reduce((s, p) => s + p.value, 0);
  const totalCost = positions.reduce((s, p) => s + p.cost, 0);

  return {
    positions,
    totalValue: +totalValue.toFixed(2),
    totalCost: +totalCost.toFixed(2),
    totalPnl: +(totalValue - totalCost).toFixed(2),
    totalPnlPct: +(((totalValue - totalCost) / totalCost) * 100).toFixed(1),
  };
}

// ─── Edge detection: find mispriced markets ───

function findEdges(markets: any[]) {
  const edges: any[] = [];

  for (const m of markets) {
    if (m.type !== "game") continue;
    // Flag big favorites trading below expected
    if (m.teamA.pct > 80 && m.teamA.yesPrice < 0.75) {
      edges.push({
        sport: m.sport, market: `${m.teamA.name} vs ${m.teamB.name}`,
        signal: "UNDERPRICED_FAVORITE", team: m.teamA.name,
        price: m.teamA.yesPrice, expectedFloor: 0.80,
        edge: +((0.80 - m.teamA.yesPrice) * 100).toFixed(0),
        reasoning: `${m.teamA.name} at ${(m.teamA.yesPrice * 100).toFixed(0)}¢ — implied ${m.teamA.pct}% but trading ${((0.80 - m.teamA.yesPrice) * 100).toFixed(0)}¢ below floor`,
      });
    }
    if (m.teamB.pct > 80 && m.teamB.yesPrice < 0.75) {
      edges.push({
        sport: m.sport, market: `${m.teamA.name} vs ${m.teamB.name}`,
        signal: "UNDERPRICED_FAVORITE", team: m.teamB.name,
        price: m.teamB.yesPrice, expectedFloor: 0.80,
        edge: +((0.80 - m.teamB.yesPrice) * 100).toFixed(0),
        reasoning: `${m.teamB.name} at ${(m.teamB.yesPrice * 100).toFixed(0)}¢ — implied ${m.teamB.pct}% but trading ${((0.80 - m.teamB.yesPrice) * 100).toFixed(0)}¢ below floor`,
      });
    }
    // Flag near-coin-flip markets with volume
    if (Math.abs(m.teamA.pct - 50) < 8 && m.volume > 20000) {
      edges.push({
        sport: m.sport, market: `${m.teamA.name} vs ${m.teamB.name}`,
        signal: "HIGH_VOLUME_TOSS_UP", team: null,
        reasoning: `Coin-flip game with $${m.volume.toLocaleString()} volume — watch for late line movement`,
      });
    }
  }

  return edges.slice(0, 12);
}

// ─── Portfolio history ───
function generatePortfolioHistory() {
  const now = Date.now();
  const points = [];
  let value = 200;
  for (let i = 72; i >= 0; i--) {
    value += (Math.random() - 0.42) * 8;
    value = Math.max(100, Math.min(500, value));
    points.push({ time: new Date(now - i * 20 * 60 * 1000).toISOString(), value: +value.toFixed(2) });
  }
  return points;
}

// ─── Main handler ───

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const filterSport = body.sport || null; // optional filter

    let markets = generateAllMarkets();
    if (filterSport && filterSport !== "All") {
      markets = markets.filter(m => m.sport === filterSport);
    }

    const portfolio = generatePortfolio(markets);
    const edges = findEdges(markets);
    const history = generatePortfolioHistory();

    // Category summary
    const categorySummary = SPORT_CATEGORIES.map(cat => {
      const catMarkets = markets.filter(m => m.sport === cat);
      const liveCount = catMarkets.filter(m => m.live).length;
      return { sport: cat, total: catMarkets.length, live: liveCount };
    }).filter(c => c.total > 0);

    const liveTotal = markets.filter(m => m.live).length;

    return new Response(JSON.stringify({
      categories: categorySummary,
      markets,
      portfolio,
      edges,
      portfolioHistory: history,
      stats: {
        totalMarkets: markets.length,
        liveMarkets: liveTotal,
        sports: categorySummary.length,
        portfolioPositions: portfolio.positions.length,
      },
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Kalshi sports error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
