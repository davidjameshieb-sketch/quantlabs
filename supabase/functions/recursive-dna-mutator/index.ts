// Recursive DNA Mutation Engine
// Rewrites agent core entry logic in real-time based on flash-crash, hawkometer,
// and other intelligence feed triggers. When flash-crash fires, this engine can
// instantly flip all agents into "Predatory Mean Reversion" DNA.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// DNA Personality Templates — complete entry/exit logic overrides
const DNA_TEMPLATES: Record<string, {
  name: string;
  entryLogic: string;
  exitLogic: string;
  sizingMultiplier: number;
  slMultiplier: number;
  tpMultiplier: number;
  regimeFilter: string[];
  sessionFilter: string[];
  maxConcurrentTrades: number;
  timeStopBars: number;
  description: string;
}> = {
  PREDATORY_MEAN_REVERSION: {
    name: "Predatory Mean Reversion",
    entryLogic: "FADE_EXTREME_MOVE",
    exitLogic: "REVERT_TO_VWAP",
    sizingMultiplier: 1.5,
    slMultiplier: 0.8,  // tighter SL
    tpMultiplier: 2.0,  // wider TP (capturing reversion)
    regimeFilter: ["compression", "mean_reversion", "transition"],
    sessionFilter: ["london", "new_york", "overlap"],
    maxConcurrentTrades: 4,
    timeStopBars: 120, // 2 hours
    description: "Fades extreme moves post flash-crash. Expects volatility spike to revert to mean.",
  },
  BREAKOUT_CAPTURE: {
    name: "Breakout Capture",
    entryLogic: "BREAKOUT_IGNITION",
    exitLogic: "TRAILING_ATR",
    sizingMultiplier: 1.2,
    slMultiplier: 1.5,  // wider SL for breakouts
    tpMultiplier: 3.0,
    regimeFilter: ["transition", "trending", "expansion"],
    sessionFilter: ["london", "new_york", "overlap"],
    maxConcurrentTrades: 3,
    timeStopBars: 240,
    description: "Captures ignition breakouts with trailing ATR exits.",
  },
  DEFENSIVE_SNIPER: {
    name: "Defensive Sniper",
    entryLogic: "HIGH_CONVICTION_ONLY",
    exitLogic: "TIGHT_TRAILING",
    sizingMultiplier: 0.5,
    slMultiplier: 0.5,
    tpMultiplier: 1.5,
    regimeFilter: ["compression"],
    sessionFilter: ["london", "overlap"],
    maxConcurrentTrades: 1,
    timeStopBars: 60,
    description: "Ultra-conservative mode. Only fires on maximum conviction signals with tight stops.",
  },
  HAWKISH_MOMENTUM: {
    name: "Hawkish Momentum",
    entryLogic: "FOLLOW_HAWKISH_BIAS",
    exitLogic: "MOMENTUM_DECAY",
    sizingMultiplier: 1.3,
    slMultiplier: 1.2,
    tpMultiplier: 2.5,
    regimeFilter: ["trending", "expansion"],
    sessionFilter: ["london", "new_york", "overlap", "asian"],
    maxConcurrentTrades: 5,
    timeStopBars: 480, // 8 hours for macro moves
    description: "Rides hawkish central bank momentum. Aligns with Hawkometer directional bias.",
  },
  LIQUIDITY_HUNTER: {
    name: "Liquidity Hunter",
    entryLogic: "TARGET_STOP_CLUSTERS",
    exitLogic: "POST_SWEEP_REVERSAL",
    sizingMultiplier: 1.8,
    slMultiplier: 0.6,
    tpMultiplier: 1.2,
    regimeFilter: ["compression", "mean_reversion"],
    sessionFilter: ["london", "overlap"],
    maxConcurrentTrades: 2,
    timeStopBars: 30,
    description: "Predatory mode targeting retail stop clusters identified by orderflow-delta-tracker.",
  },
};

// Trigger → DNA mapping: which feed conditions trigger which DNA
const TRIGGER_RULES: Array<{
  triggerType: string;
  condition: (payload: any) => boolean;
  targetDna: string;
  priority: number;
  cooldownMinutes: number;
  affectedAgents: string[] | "ALL";
  description: string;
}> = [
  {
    triggerType: "flash_crash_monitor",
    condition: (p) => p.isCascade || p.hasExtreme,
    targetDna: "PREDATORY_MEAN_REVERSION",
    priority: 100,
    cooldownMinutes: 30,
    affectedAgents: "ALL",
    description: "Flash crash detected — flip all agents to mean reversion to capture snap-back",
  },
  {
    triggerType: "flash_crash_monitor",
    condition: (p) => p.alertCount >= 1 && !p.isCascade,
    targetDna: "DEFENSIVE_SNIPER",
    priority: 80,
    cooldownMinutes: 15,
    affectedAgents: "ALL",
    description: "Elevated volatility (non-cascade) — tighten to defensive mode",
  },
  {
    triggerType: "hawkometer_analysis",
    condition: (p) => {
      const scores = Object.values(p.scores || p || {}) as any[];
      return scores.some((s: any) => Math.abs(s?.delta || s?.hawkishScore || 0) > 70);
    },
    targetDna: "HAWKISH_MOMENTUM",
    priority: 60,
    cooldownMinutes: 360, // 6 hour cooldown for macro shifts
    affectedAgents: "ALL",
    description: "Strong hawkish/dovish shift detected — align all agents with CB momentum",
  },
  {
    triggerType: "orderflow_delta",
    condition: (p) => (p.vacuumsArmed || 0) >= 2,
    targetDna: "LIQUIDITY_HUNTER",
    priority: 70,
    cooldownMinutes: 15,
    affectedAgents: ["carry-flow", "spread-microstructure"],
    description: "Multiple vacuum targets armed — switch primary agents to liquidity hunting mode",
  },
  {
    triggerType: "fixing_volatility",
    condition: (p) => p.isFixingWindow && (p.compressionRatio || 0) < 0.4,
    targetDna: "DEFENSIVE_SNIPER",
    priority: 90,
    cooldownMinutes: 60,
    affectedAgents: "ALL",
    description: "London 4PM fix compression detected — defensive mode during manipulation window",
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    const { forceDna, forceAgents, triggerOverride } = body;

    // 1. If force mutation requested (from FM/Architect), apply directly
    if (forceDna && DNA_TEMPLATES[forceDna]) {
      const template = DNA_TEMPLATES[forceDna];
      const agents = forceAgents || "ALL";
      const mutation = await applyDnaMutation(supabase, forceDna, template, agents, "architect-force", "Architect forced DNA mutation");
      return new Response(JSON.stringify(mutation), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Scan all intelligence feeds for trigger conditions
    const feedTypes = [...new Set(TRIGGER_RULES.map(r => r.triggerType))];
    const { data: feeds } = await supabase
      .from("sovereign_memory")
      .select("memory_type, payload, updated_at")
      .in("memory_type", feedTypes)
      .order("updated_at", { ascending: false });

    if (!feeds || feeds.length === 0) {
      return new Response(JSON.stringify({ mutations: 0, message: "No feed data available" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const feedMap: Record<string, any> = {};
    for (const f of feeds) {
      if (!feedMap[f.memory_type]) feedMap[f.memory_type] = f.payload;
    }

    // 3. Evaluate trigger rules (sorted by priority)
    const sortedRules = [...TRIGGER_RULES].sort((a, b) => b.priority - a.priority);
    const mutations: Array<{
      rule: string;
      targetDna: string;
      agents: string[] | "ALL";
      applied: boolean;
      reason: string;
    }> = [];

    for (const rule of sortedRules) {
      const feedData = feedMap[rule.triggerType];
      if (!feedData) continue;

      try {
        if (!rule.condition(feedData)) continue;
      } catch { continue; }

      // Check cooldown — has this DNA been applied recently?
      const { data: recentMutation } = await supabase
        .from("gate_bypasses")
        .select("id, created_at")
        .eq("gate_id", `DNA_MUTATION:${rule.targetDna}`)
        .eq("revoked", false)
        .gte("expires_at", new Date().toISOString())
        .limit(1);

      if (recentMutation?.length) {
        mutations.push({
          rule: rule.description,
          targetDna: rule.targetDna,
          agents: rule.affectedAgents,
          applied: false,
          reason: "Cooldown active — mutation already applied",
        });
        continue;
      }

      // Apply the mutation
      const template = DNA_TEMPLATES[rule.targetDna];
      if (!template) continue;

      await applyDnaMutation(
        supabase, rule.targetDna, template, rule.affectedAgents,
        "recursive-dna-mutator", rule.description
      );

      mutations.push({
        rule: rule.description,
        targetDna: rule.targetDna,
        agents: rule.affectedAgents,
        applied: true,
        reason: "Trigger condition met — DNA applied",
      });

      // Only apply highest-priority mutation per cycle to prevent conflicts
      break;
    }

    // 4. Persist mutation log
    const payload = {
      mutationsEvaluated: sortedRules.length,
      mutationsApplied: mutations.filter(m => m.applied).length,
      mutations,
      feedsAvailable: Object.keys(feedMap),
      scanTime: new Date().toISOString(),
    };

    await supabase.from("sovereign_memory").upsert({
      memory_type: "dna_mutation_engine",
      memory_key: "latest_scan",
      payload,
      relevance_score: mutations.some(m => m.applied) ? 1.0 : 0.3,
      created_by: "recursive-dna-mutator",
    }, { onConflict: "memory_type,memory_key" });

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function applyDnaMutation(
  supabase: any,
  dnaName: string,
  template: typeof DNA_TEMPLATES[string],
  agents: string[] | "ALL",
  createdBy: string,
  reason: string,
) {
  const now = new Date();

  // 1. Write DNA mutation record to gate_bypasses (consumed by sovereign loop)
  await supabase.from("gate_bypasses").insert({
    gate_id: `DNA_MUTATION:${dnaName}`,
    reason: JSON.stringify({
      type: "DNA_MUTATION",
      dna: dnaName,
      template,
      affectedAgents: agents,
      appliedAt: now.toISOString(),
      triggerReason: reason,
    }),
    expires_at: new Date(now.getTime() + (template.timeStopBars * 60_000)).toISOString(),
    pair: null,
    created_by: createdBy,
  });

  // 2. Write individual agent DNA overrides
  if (agents === "ALL") {
    // Write a global override
    await supabase.from("sovereign_memory").upsert({
      memory_type: "AGENT_DNA_MUTATION",
      memory_key: "GLOBAL_OVERRIDE",
      payload: {
        activeDna: dnaName,
        template,
        reason,
        appliedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + (template.timeStopBars * 60_000)).toISOString(),
      },
      relevance_score: 1.0,
      created_by: createdBy,
    }, { onConflict: "memory_type,memory_key" });
  } else {
    // Write per-agent overrides
    for (const agentId of agents) {
      await supabase.from("sovereign_memory").upsert({
        memory_type: "AGENT_DNA_MUTATION",
        memory_key: agentId,
        payload: {
          activeDna: dnaName,
          template,
          reason,
          appliedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + (template.timeStopBars * 60_000)).toISOString(),
        },
        relevance_score: 1.0,
        created_by: createdBy,
      }, { onConflict: "memory_type,memory_key" });
    }
  }

  return {
    dna: dnaName,
    template,
    agents,
    reason,
    appliedAt: now.toISOString(),
    status: "APPLIED",
  };
}
