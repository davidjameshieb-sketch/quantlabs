// compute-snapshot — Server-side analytics snapshot computation
// Runs heavy queries with longer timeouts and caches results to analytics_snapshots
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function supaAdmin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

// ─── Pip helpers ─────────────────────────────────────────────────
function pipMult(pair: string): number {
  return ["USD_JPY", "EUR_JPY", "GBP_JPY", "AUD_JPY", "CAD_JPY", "CHF_JPY", "NZD_JPY"].includes(pair)
    ? 100
    : 10000;
}

function pips(order: any): number {
  if (order.entry_price == null || order.exit_price == null) return 0;
  const m = pipMult(order.currency_pair);
  const raw =
    order.direction === "long"
      ? (order.exit_price - order.entry_price) * m
      : (order.entry_price - order.exit_price) * m;
  return Math.round(raw * 10) / 10;
}

// ─── Paginated fetch with created_at filter ──────────────────────
async function fetchOrders(
  db: ReturnType<typeof supaAdmin>,
  opts: {
    userId?: string;
    environment?: string;
    windowDays: number;
    statuses?: string[];
  }
) {
  const cutoff = new Date(Date.now() - opts.windowDays * 86400000).toISOString();
  const statuses = opts.statuses || ["filled", "closed"];
  let allRows: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    let q = db
      .from("oanda_orders")
      .select("*")
      .in("status", statuses)
      .gte("created_at", cutoff)
      .not("entry_price", "is", null)
      .not("exit_price", "is", null)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (opts.userId) q = q.eq("user_id", opts.userId);
    if (opts.environment && opts.environment !== "all") q = q.eq("environment", opts.environment);

    const { data, error } = await q;
    if (error) throw error;
    allRows = allRows.concat(data || []);
    hasMore = (data?.length ?? 0) === pageSize;
    offset += pageSize;
  }
  return allRows;
}

// ─── Snapshot: forex_performance_overview ─────────────────────────
function computePerformanceOverview(orders: any[]) {
  if (orders.length === 0) return { trades: 0, noData: true };

  const pipsList = orders.map(pips);
  const wins = pipsList.filter((p) => p > 0);
  const losses = pipsList.filter((p) => p <= 0);
  const grossProfit = wins.reduce((s, p) => s + p, 0);
  const grossLoss = Math.abs(losses.reduce((s, p) => s + p, 0));
  const netPips = pipsList.reduce((s, p) => s + p, 0);

  // Per-pair breakdown
  const pairMap = new Map<string, { trades: number; wins: number; net: number; gp: number; gl: number }>();
  for (const o of orders) {
    const p = o.currency_pair;
    const pip = pips(o);
    const cur = pairMap.get(p) || { trades: 0, wins: 0, net: 0, gp: 0, gl: 0 };
    cur.trades++;
    if (pip > 0) { cur.wins++; cur.gp += pip; } else cur.gl += Math.abs(pip);
    cur.net += pip;
    pairMap.set(p, cur);
  }
  const pairBreakdown = Array.from(pairMap.entries())
    .map(([pair, v]) => ({
      pair,
      trades: v.trades,
      winRate: Math.round((v.wins / v.trades) * 1000) / 10,
      netPips: Math.round(v.net * 10) / 10,
      pf: v.gl > 0 ? Math.round((v.gp / v.gl) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.netPips - a.netPips);

  // Per-session breakdown
  const sessionMap = new Map<string, { trades: number; wins: number; net: number }>();
  for (const o of orders) {
    const s = o.session_label || "unknown";
    const pip = pips(o);
    const cur = sessionMap.get(s) || { trades: 0, wins: 0, net: 0 };
    cur.trades++;
    if (pip > 0) cur.wins++;
    cur.net += pip;
    sessionMap.set(s, cur);
  }
  const sessionBreakdown = Array.from(sessionMap.entries())
    .map(([session, v]) => ({
      session,
      trades: v.trades,
      winRate: Math.round((v.wins / v.trades) * 1000) / 10,
      netPips: Math.round(v.net * 10) / 10,
    }))
    .sort((a, b) => b.netPips - a.netPips);

  // Direction split
  const longs = orders.filter((o) => o.direction === "long");
  const shorts = orders.filter((o) => o.direction === "short");
  const longPips = longs.map(pips);
  const shortPips = shorts.map(pips);

  return {
    trades: orders.length,
    winRate: Math.round((wins.length / orders.length) * 1000) / 10,
    netPips: Math.round(netPips * 10) / 10,
    expectancy: Math.round((netPips / orders.length) * 100) / 100,
    profitFactor: grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : 0,
    grossProfit: Math.round(grossProfit * 10) / 10,
    grossLoss: Math.round(grossLoss * 10) / 10,
    longTrades: longs.length,
    shortTrades: shorts.length,
    longWinRate: longs.length > 0 ? Math.round((longPips.filter((p) => p > 0).length / longs.length) * 1000) / 10 : 0,
    shortWinRate: shorts.length > 0 ? Math.round((shortPips.filter((p) => p > 0).length / shorts.length) * 1000) / 10 : 0,
    longNet: Math.round(longPips.reduce((s, p) => s + p, 0) * 10) / 10,
    shortNet: Math.round(shortPips.reduce((s, p) => s + p, 0) * 10) / 10,
    pairBreakdown: pairBreakdown.slice(0, 20),
    sessionBreakdown,
    noData: false,
  };
}

// ─── Snapshot: agent_scorecards ──────────────────────────────────
function computeAgentScorecards(orders: any[]) {
  if (orders.length === 0) return { agents: [], noData: true };

  const agentMap = new Map<string, any[]>();
  for (const o of orders) {
    const a = o.agent_id || "unknown";
    const arr = agentMap.get(a) || [];
    arr.push(o);
    agentMap.set(a, arr);
  }

  const agents = Array.from(agentMap.entries()).map(([agentId, trades]) => {
    const pipsList = trades.map(pips);
    const wins = pipsList.filter((p) => p > 0);
    const grossProfit = wins.reduce((s, p) => s + p, 0);
    const grossLoss = Math.abs(pipsList.filter((p) => p <= 0).reduce((s, p) => s + p, 0));
    const net = pipsList.reduce((s, p) => s + p, 0);

    // Max drawdown (simple sequential)
    let peak = 0, dd = 0, maxDD = 0;
    let cum = 0;
    for (const p of pipsList) {
      cum += p;
      if (cum > peak) peak = cum;
      dd = peak - cum;
      if (dd > maxDD) maxDD = dd;
    }

    // Session breakdown
    const sessionSet = new Set(trades.map((t: any) => t.session_label || "unknown"));

    return {
      agentId,
      trades: trades.length,
      winRate: Math.round((wins.length / trades.length) * 1000) / 10,
      netPips: Math.round(net * 10) / 10,
      expectancy: Math.round((net / trades.length) * 100) / 100,
      profitFactor: grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : 0,
      maxDD: Math.round(maxDD * 10) / 10,
      sessions: Array.from(sessionSet),
      sessionCount: sessionSet.size,
    };
  }).sort((a, b) => b.expectancy - a.expectancy);

  return { agents, noData: false };
}

// ─── Snapshot: edge_health_summary ───────────────────────────────
function computeEdgeHealthSummary(orders: any[]) {
  if (orders.length === 0) return { status: "red", statusLabel: "No Data", noData: true };

  const pipsList = orders.map(pips);
  const wins = pipsList.filter((p) => p > 0);
  const grossProfit = wins.reduce((s, p) => s + p, 0);
  const grossLoss = Math.abs(pipsList.filter((p) => p <= 0).reduce((s, p) => s + p, 0));
  const netPips = pipsList.reduce((s, p) => s + p, 0);
  const pf = grossLoss > 0 ? grossProfit / grossLoss : 0;
  const expectancy = netPips / orders.length;

  const longs = orders.filter((o) => o.direction === "long");
  const shorts = orders.filter((o) => o.direction === "short");
  const shortWins = shorts.filter((o) => pips(o) > 0).length;
  const shortWR = shorts.length > 0 ? shortWins / shorts.length : 0;

  let status = "yellow";
  let statusLabel = "Edge Developing";
  if (pf < 1.0 || expectancy <= 0 || shortWR < 0.35) {
    status = "red"; statusLabel = "Edge Unhealthy";
  } else if (pf >= 1.5 && expectancy > 0.3 && shortWR > 0.45) {
    status = "green"; statusLabel = "Edge Healthy";
  }

  return {
    status,
    statusLabel,
    totalTrades: orders.length,
    overallWinRate: Math.round((wins.length / orders.length) * 1000) / 10,
    overallExpectancy: Math.round(expectancy * 100) / 100,
    overallPF: Math.round(pf * 100) / 100,
    longNet: Math.round(longs.map(pips).reduce((s, p) => s + p, 0) * 10) / 10,
    shortNet: Math.round(shorts.map(pips).reduce((s, p) => s + p, 0) * 10) / 10,
    noData: false,
  };
}

// ─── Snapshot: tier_b_promotion_analysis ─────────────────────────
function computeTierBPromotion(orders: any[]) {
  if (orders.length === 0) return { candidates: [], noData: true };

  // Get agent scorecards first
  const { agents } = computeAgentScorecards(orders);
  if (agents.length === 0) return { candidates: [], noData: true };

  // Baseline metrics (all agents combined)
  const allPips = orders.map(pips);
  const baselineExp = allPips.reduce((s, p) => s + p, 0) / allPips.length;

  const candidates = agents.map((agent: any) => {
    // Direction analysis
    const agentOrders = orders.filter((o: any) => (o.agent_id || "unknown") === agent.agentId);
    const longOrders = agentOrders.filter((o: any) => o.direction === "long");
    const shortOrders = agentOrders.filter((o: any) => o.direction === "short");
    const longPips = longOrders.map(pips);
    const shortPips = shortOrders.map(pips);
    const longNet = longPips.reduce((s: number, p: number) => s + p, 0);
    const shortNet = shortPips.reduce((s: number, p: number) => s + p, 0);

    // Session analysis
    const sessionMap = new Map<string, { trades: number; net: number }>();
    for (const o of agentOrders) {
      const s = o.session_label || "unknown";
      const cur = sessionMap.get(s) || { trades: 0, net: 0 };
      cur.trades++;
      cur.net += pips(o);
      sessionMap.set(s, cur);
    }
    const profitableSessions = Array.from(sessionMap.values()).filter((v) => v.net > 0 && v.trades >= 10).length;

    // Pair analysis — find toxic pairs
    const pairMap = new Map<string, { trades: number; net: number }>();
    for (const o of agentOrders) {
      const cur = pairMap.get(o.currency_pair) || { trades: 0, net: 0 };
      cur.trades++;
      cur.net += pips(o);
      pairMap.set(o.currency_pair, cur);
    }
    const toxicPairs = Array.from(pairMap.entries())
      .filter(([, v]) => v.net < -20 && v.trades >= 5)
      .map(([pair, v]) => ({ pair, trades: v.trades, net: Math.round(v.net * 10) / 10 }))
      .sort((a, b) => a.net - b.net);

    // Toxic sessions
    const toxicSessions = Array.from(sessionMap.entries())
      .filter(([, v]) => v.net < -20 && v.trades >= 5)
      .map(([session, v]) => ({ session, trades: v.trades, net: Math.round(v.net * 10) / 10 }))
      .sort((a, b) => a.net - b.net);

    // Promotion readiness score (0-100)
    const expWeight = 30;
    const pfWeight = 20;
    const ddWeight = 20;
    const sessionWeight = 15;
    const dirWeight = 10;
    const constraintPenalty = 5;

    const expScore = Math.min(1, Math.max(0, agent.expectancy / 1.0)) * expWeight;
    const pfScore = Math.min(1, Math.max(0, (agent.profitFactor - 0.8) / 1.2)) * pfWeight;
    const ddScore = Math.min(1, Math.max(0, 1 - agent.maxDD / 200)) * ddWeight;
    const sessScore = Math.min(1, profitableSessions / 3) * sessionWeight;
    const dirScore = (1 - Math.abs(longNet - shortNet) / (Math.abs(longNet) + Math.abs(shortNet) + 1)) * dirWeight;

    const readinessScore = Math.round(expScore + pfScore + ddScore + sessScore + dirScore);

    // Constraint proposals
    const constraints: any[] = [];
    if (shortNet < -50 && longNet > 0) {
      constraints.push({ type: "block_direction", value: "short", expectedDelta: { expectancy: Math.round(Math.abs(shortNet / shortOrders.length) * 100) / 100, ddReduction: "moderate" } });
    }
    for (const tp of toxicPairs.slice(0, 2)) {
      constraints.push({ type: "block_pair", value: tp.pair, expectedDelta: { expectancy: Math.round(Math.abs(tp.net / tp.trades) * 100) / 100, tradesLost: tp.trades } });
    }
    for (const ts of toxicSessions.slice(0, 1)) {
      constraints.push({ type: "block_session", value: ts.session, expectedDelta: { expectancy: Math.round(Math.abs(ts.net / ts.trades) * 100) / 100, tradesLost: ts.trades } });
    }

    // Determine tier
    let promotionDecision = "remain_rescue";
    if (readinessScore >= 75 && agent.expectancy > 0.3 && agent.profitFactor >= 1.2 && profitableSessions >= 3 && agent.trades >= 150) {
      promotionDecision = "promote_tier_a";
    } else if (readinessScore >= 50 && agent.expectancy > 0) {
      promotionDecision = "advance_reduced_risk";
    }

    return {
      agentId: agent.agentId,
      trades: agent.trades,
      winRate: agent.winRate,
      expectancy: agent.expectancy,
      profitFactor: agent.profitFactor,
      maxDD: agent.maxDD,
      netPips: agent.netPips,
      readinessScore,
      profitableSessions,
      longNet: Math.round(longNet * 10) / 10,
      shortNet: Math.round(shortNet * 10) / 10,
      toxicPairs: toxicPairs.slice(0, 5),
      toxicSessions: toxicSessions.slice(0, 3),
      constraintProposals: constraints.slice(0, 2),
      promotionDecision,
      baselineExpectancy: Math.round(baselineExp * 100) / 100,
      expectancyRatio: baselineExp > 0 ? Math.round((agent.expectancy / baselineExp) * 100) / 100 : 0,
    };
  }).sort((a: any, b: any) => b.readinessScore - a.readinessScore);

  return {
    candidates,
    topCandidate: candidates[0] || null,
    nearPromotionCount: candidates.filter((c: any) => c.promotionDecision !== "remain_rescue").length,
    noData: false,
  };
}

// ─── Snapshot: dashboard_nav_status ──────────────────────────────
async function computeDashboardNavStatus(db: ReturnType<typeof supaAdmin>) {
  const { data: snapshots } = await db
    .from("analytics_snapshots")
    .select("snapshot_type, scope_key, status, as_of_ts, updated_at");

  const statusMap: Record<string, any> = {};
  for (const s of snapshots || []) {
    const age = Date.now() - new Date(s.as_of_ts).getTime();
    const staleThreshold = s.snapshot_type === "tier_b_promotion_analysis" ? 900000 : 300000; // 15m vs 5m
    statusMap[`${s.snapshot_type}:${s.scope_key}`] = {
      type: s.snapshot_type,
      scope: s.scope_key,
      status: age > staleThreshold ? "stale" : s.status,
      asOf: s.as_of_ts,
      ageMs: age,
    };
  }

  return { pages: statusMap, computedAt: new Date().toISOString() };
}

// ─── Main handler ────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      snapshot_type,
      scope_key = "all:30",
      user_id,
      environment = "all",
      window_days = 30,
    } = body;

    if (!snapshot_type) {
      return new Response(JSON.stringify({ error: "snapshot_type required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = supaAdmin();

    // Log run start
    const { data: run } = await db
      .from("analytics_snapshot_runs")
      .insert({ snapshot_type, scope_key, status: "running" })
      .select("run_id")
      .single();

    const runId = run?.run_id;

    try {
      let payload: any;

      if (snapshot_type === "dashboard_nav_status") {
        payload = await computeDashboardNavStatus(db);
      } else {
        // Fetch orders (time-windowed, index-supported)
        const orders = await fetchOrders(db, {
          userId: user_id,
          environment,
          windowDays: window_days,
        });

        switch (snapshot_type) {
          case "forex_performance_overview":
            payload = computePerformanceOverview(orders);
            break;
          case "edge_health_summary":
            payload = computeEdgeHealthSummary(orders);
            break;
          case "agent_scorecards":
            payload = computeAgentScorecards(orders);
            break;
          case "tier_b_promotion_analysis":
            payload = computeTierBPromotion(orders);
            break;
          default:
            payload = { error: `Unknown snapshot_type: ${snapshot_type}` };
        }
      }

      // Upsert snapshot
      await db.from("analytics_snapshots").upsert(
        {
          snapshot_type,
          scope_key,
          status: "ready",
          payload,
          as_of_ts: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "snapshot_type,scope_key" }
      );

      // Update run
      if (runId) {
        await db
          .from("analytics_snapshot_runs")
          .update({ status: "completed", finished_at: new Date().toISOString() })
          .eq("run_id", runId);
      }

      return new Response(JSON.stringify({ ok: true, snapshot_type, scope_key, payload }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (computeError: any) {
      // Update run with error
      if (runId) {
        await db
          .from("analytics_snapshot_runs")
          .update({ status: "error", error: computeError.message, finished_at: new Date().toISOString() })
          .eq("run_id", runId);
      }

      // Mark snapshot as error
      await db.from("analytics_snapshots").upsert(
        {
          snapshot_type,
          scope_key,
          status: "error",
          payload: { error: computeError.message },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "snapshot_type,scope_key" }
      );

      throw computeError;
    }
  } catch (err: any) {
    console.error("[compute-snapshot] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
