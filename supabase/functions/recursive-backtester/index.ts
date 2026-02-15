// Recursive Backtester Edge Function
// Takes a Shadow Agent DNA config and simulates against recent historical trades
// Returns expectancy score, win rate, and recommendation

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AgentDNA {
  agentId: string;
  strategy: string;           // "momentum-burst" | "mean-reversion" | "breakout" | "fade"
  pairs: string[];
  sessions: string[];          // "london-open" | "ny-open" | "asian" | "overlap"
  regimes: string[];           // "trending" | "ranging" | "breakdown_short" | "breakout_long"
  minConfidence: number;       // 0-1
  direction?: "long" | "short" | "both";
  riskMultiplier?: number;     // position sizing factor
}

interface BacktestResult {
  agentId: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  netPips: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  expectancyPerTrade: number;
  avgWin: number;
  avgLoss: number;
  maxConsecutiveLosses: number;
  maxDrawdownPips: number;
  bestPair: string | null;
  worstPair: string | null;
  recommendation: "DEPLOY" | "REFINE" | "REJECT";
  reasoning: string;
  simulatedPeriodDays: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { agentDna, lookbackDays = 30 } = await req.json() as {
      agentDna: AgentDNA;
      lookbackDays?: number;
    };

    if (!agentDna?.agentId || !agentDna.strategy || !agentDna.pairs?.length) {
      return new Response(
        JSON.stringify({ error: "agentDna with agentId, strategy, and pairs required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch historical closed trades matching the DNA criteria
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from("oanda_orders")
      .select("currency_pair, direction, entry_price, exit_price, status, confidence_score, session_label, regime_label, r_pips, created_at, closed_at")
      .in("currency_pair", agentDna.pairs)
      .in("status", ["filled", "closed"])
      .not("entry_price", "is", null)
      .not("exit_price", "is", null)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(500);

    const { data: trades, error } = await query;
    if (error) {
      console.error("[BACKTESTER] Query error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!trades || trades.length === 0) {
      return new Response(
        JSON.stringify({
          agentId: agentDna.agentId,
          totalTrades: 0,
          recommendation: "REJECT",
          reasoning: `No historical trades found for pairs [${agentDna.pairs.join(", ")}] in last ${lookbackDays} days. Cannot simulate.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter trades through DNA criteria
    const filteredTrades = trades.filter((t: any) => {
      // Session filter
      if (agentDna.sessions.length > 0 && t.session_label) {
        const sessionMatch = agentDna.sessions.some(s =>
          t.session_label?.toLowerCase().includes(s.toLowerCase())
        );
        if (!sessionMatch) return false;
      }

      // Regime filter
      if (agentDna.regimes.length > 0 && t.regime_label) {
        const regimeMatch = agentDna.regimes.some(r =>
          t.regime_label?.toLowerCase().includes(r.toLowerCase())
        );
        if (!regimeMatch) return false;
      }

      // Confidence filter
      if (agentDna.minConfidence > 0 && t.confidence_score != null) {
        if (t.confidence_score < agentDna.minConfidence) return false;
      }

      // Direction filter
      if (agentDna.direction && agentDna.direction !== "both") {
        if (t.direction !== agentDna.direction) return false;
      }

      return true;
    });

    // Calculate stats
    const JPY_PAIRS = ["USD_JPY", "EUR_JPY", "GBP_JPY", "AUD_JPY", "CAD_JPY", "CHF_JPY", "NZD_JPY"];
    let wins = 0, losses = 0;
    let grossProfit = 0, grossLoss = 0;
    let consecutiveLosses = 0, maxConsecutiveLosses = 0;
    let runningPnl = 0, peakPnl = 0, maxDrawdown = 0;
    const pairPnl: Record<string, number> = {};

    for (const t of filteredTrades) {
      const mult = JPY_PAIRS.includes(t.currency_pair) ? 100 : 10000;
      const pips = t.direction === "long"
        ? (t.exit_price - t.entry_price) * mult
        : (t.entry_price - t.exit_price) * mult;

      // Apply strategy-specific multiplier
      const adjustedPips = pips * (agentDna.riskMultiplier || 1);

      if (adjustedPips > 0) {
        wins++;
        grossProfit += adjustedPips;
        consecutiveLosses = 0;
      } else {
        losses++;
        grossLoss += Math.abs(adjustedPips);
        consecutiveLosses++;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
      }

      runningPnl += adjustedPips;
      peakPnl = Math.max(peakPnl, runningPnl);
      maxDrawdown = Math.max(maxDrawdown, peakPnl - runningPnl);

      pairPnl[t.currency_pair] = (pairPnl[t.currency_pair] || 0) + adjustedPips;
    }

    const totalTrades = filteredTrades.length;
    const netPips = Math.round((grossProfit - grossLoss) * 10) / 10;
    const winRate = totalTrades > 0 ? Math.round((wins / totalTrades) * 1000) / 10 : 0;
    const profitFactor = grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? 999 : 0;
    const expectancy = totalTrades > 0 ? Math.round((netPips / totalTrades) * 10) / 10 : 0;
    const avgWin = wins > 0 ? Math.round((grossProfit / wins) * 10) / 10 : 0;
    const avgLoss = losses > 0 ? Math.round((grossLoss / losses) * 10) / 10 : 0;

    // Find best/worst pairs
    const pairEntries = Object.entries(pairPnl).sort((a, b) => b[1] - a[1]);
    const bestPair = pairEntries.length > 0 ? pairEntries[0][0] : null;
    const worstPair = pairEntries.length > 0 ? pairEntries[pairEntries.length - 1][0] : null;

    // Generate recommendation
    let recommendation: BacktestResult["recommendation"];
    let reasoning: string;

    if (totalTrades < 10) {
      recommendation = "REFINE";
      reasoning = `Insufficient sample size (${totalTrades} trades). Need 20+ for statistical significance. Consider widening session/regime filters.`;
    } else if (winRate >= 50 && profitFactor >= 1.3 && expectancy >= 1.0) {
      recommendation = "DEPLOY";
      reasoning = `Strong edge detected: ${winRate}% WR, ${profitFactor}x PF, +${expectancy}p/trade expectancy. Max DD: ${Math.round(maxDrawdown)}p. Ready for live shadow deployment.`;
    } else if (winRate >= 40 && profitFactor >= 1.0) {
      recommendation = "REFINE";
      reasoning = `Marginal edge: ${winRate}% WR, ${profitFactor}x PF. Consider tightening entry criteria, adjusting pairs (best: ${bestPair}, worst: ${worstPair}), or adding confirmation filters.`;
    } else {
      recommendation = "REJECT";
      reasoning = `Negative expectancy: ${winRate}% WR, ${profitFactor}x PF, ${expectancy}p/trade. Max consecutive losses: ${maxConsecutiveLosses}. DNA is not viable — significant redesign needed.`;
    }

    const result: BacktestResult = {
      agentId: agentDna.agentId,
      totalTrades,
      wins,
      losses,
      winRate,
      netPips,
      grossProfit: Math.round(grossProfit * 10) / 10,
      grossLoss: Math.round(grossLoss * 10) / 10,
      profitFactor,
      expectancyPerTrade: expectancy,
      avgWin,
      avgLoss,
      maxConsecutiveLosses,
      maxDrawdownPips: Math.round(maxDrawdown * 10) / 10,
      bestPair,
      worstPair,
      recommendation,
      reasoning,
      simulatedPeriodDays: lookbackDays,
    };

    // Persist result to sovereign_memory for FM consumption
    await supabase.from("sovereign_memory").upsert({
      memory_type: "backtest_result",
      memory_key: `backtest:${agentDna.agentId}`,
      payload: result,
      relevance_score: recommendation === "DEPLOY" ? 1.0 : recommendation === "REFINE" ? 0.7 : 0.3,
      created_by: "recursive-backtester",
    }, { onConflict: "memory_type,memory_key" });

    console.log(`[BACKTESTER] ${agentDna.agentId}: ${totalTrades} trades, ${winRate}% WR, ${netPips}p net → ${recommendation}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[BACKTESTER] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
