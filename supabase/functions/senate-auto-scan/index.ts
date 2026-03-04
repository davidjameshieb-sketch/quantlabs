// senate-auto-scan — Automated Senate scanner triggered by cron or manual call
// Runs Scan All Majors via forex-senate, stores results in senate_scans table
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function supaAdmin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const db = supaAdmin();

  // Determine trigger source
  let triggeredBy = "cron";
  try {
    const body = await req.json().catch(() => ({}));
    triggeredBy = body?.triggered_by || "cron";
  } catch { /* default cron */ }

  // Insert scan record as "running"
  const { data: scan, error: insertErr } = await db
    .from("senate_scans")
    .insert({
      scan_type: "full_majors",
      status: "running",
      triggered_by: triggeredBy,
      model_used: "google/gemini-2.5-pro",
    })
    .select("id")
    .single();

  if (insertErr || !scan) {
    console.error("[AUTO-SCAN] Failed to create scan record:", insertErr);
    return new Response(JSON.stringify({ error: "Failed to create scan record" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const scanId = scan.id;
  console.log(`[AUTO-SCAN] Started scan ${scanId}`);

  try {
    // Call the forex-senate function in scan mode (use service key for auth)
    const senateUrl = `${SUPABASE_URL}/functions/v1/forex-senate`;
    const res = await fetch(senateUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        mode: "scan",
        chairmanModel: "google/gemini-2.5-pro",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`forex-senate returned ${res.status}: ${errText}`);
    }

    const result = await res.json();
    const durationMs = Date.now() - startTime;

    // Extract structured data
    const parsed = result.parsedOpportunities;
    const pairs = parsed?.pairs || parsed?.opportunities || [];
    const executionReady = pairs.filter((p: any) => p.execution_ready).length;

    // Update scan record with results
    await db
      .from("senate_scans")
      .update({
        status: "completed",
        pairs_scanned: result.pairsScanned || 8,
        execution_ready_count: executionReady,
        best_pair: parsed?.best_pair || pairs[0]?.pair || null,
        market_regime: parsed?.market_regime || null,
        scan_summary: parsed?.scan_summary || null,
        scan_payload: parsed || {},
        raw_text: result.scanResult?.substring(0, 50000) || null,
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
      })
      .eq("id", scanId);

    console.log(`[AUTO-SCAN] Scan ${scanId} completed in ${durationMs}ms — ${executionReady} execution-ready pairs`);

    // ═══ AUTO-TRADE: Execute on demo when confidence ≥85% + unanimous consensus ═══
    const autoTrades: any[] = [];
    const CONFIDENCE_THRESHOLD = 85;
    
    for (const p of pairs) {
      if (!p.execution_ready) continue;
      
      // Check confidence score (may be 0-100 or 0-10 scale)
      const rawScore = p.score || p.confidence_score || 0;
      const confidence = rawScore <= 10 ? rawScore * 10 : rawScore;
      if (confidence < CONFIDENCE_THRESHOLD) {
        console.log(`[AUTO-TRADE] ${p.pair}: Skipped — confidence ${confidence} < ${CONFIDENCE_THRESHOLD}`);
        continue;
      }
      
      // Determine unanimous direction from consensus
      const consensus = (p.consensus || "").toUpperCase();
      let direction: "long" | "short" | null = null;
      if (consensus === "UNANIMOUS LONG" || consensus === "100% LONG") direction = "long";
      else if (consensus === "UNANIMOUS SHORT" || consensus === "100% SHORT") direction = "short";
      
      if (!direction) {
        console.log(`[AUTO-TRADE] ${p.pair}: Skipped — no unanimous consensus (${p.consensus})`);
        continue;
      }

      // Check for existing open position on this pair to avoid doubling
      const { data: existingOrders } = await db
        .from("oanda_orders")
        .select("id")
        .eq("currency_pair", p.pair.replace("/", "_"))
        .eq("environment", "practice")
        .in("status", ["open", "submitted", "filled"])
        .limit(1);

      if (existingOrders && existingOrders.length > 0) {
        console.log(`[AUTO-TRADE] ${p.pair}: Skipped — already has open position`);
        continue;
      }

      // Execute trade via oanda-execute
      try {
        const execUrl = `${SUPABASE_URL}/functions/v1/oanda-execute`;
        const signalId = `senate-auto-${scanId.slice(0, 8)}-${p.pair.replace("/", "_")}`;
        const execRes = await fetch(execUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({
            action: "execute",
            signalId,
            currencyPair: p.pair.replace("/", "_"),
            direction,
            units: 1000,
            confidenceScore: confidence,
            agentId: "senate-auto-scan",
            environment: "practice",
            stopLossPrice: p.stop_loss || undefined,
            takeProfitPrice: p.take_profit || undefined,
          }),
        });

        const execResult = await execRes.json();
        const tradeOk = execRes.ok && !execResult.error;
        autoTrades.push({
          pair: p.pair,
          direction,
          confidence,
          success: tradeOk,
          oandaOrderId: execResult.oandaOrderId || null,
          error: execResult.error || null,
        });
        console.log(`[AUTO-TRADE] ${p.pair} ${direction} 1000u → ${tradeOk ? "✅ PLACED" : "❌ FAILED"}: ${JSON.stringify(execResult).slice(0, 200)}`);
      } catch (tradeErr: any) {
        autoTrades.push({ pair: p.pair, direction, confidence, success: false, error: tradeErr.message });
        console.error(`[AUTO-TRADE] ${p.pair} execution error:`, tradeErr.message);
      }
    }

    // Update scan record with auto-trade results
    if (autoTrades.length > 0) {
      await db
        .from("senate_scans")
        .update({
          scan_payload: { ...parsed, auto_trades: autoTrades },
        })
        .eq("id", scanId);
    }

    return new Response(JSON.stringify({
      ok: true,
      scan_id: scanId,
      duration_ms: durationMs,
      execution_ready_count: executionReady,
      best_pair: parsed?.best_pair || null,
      auto_trades: autoTrades,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    console.error(`[AUTO-SCAN] Error:`, err);

    // Update scan record with error
    await db
      .from("senate_scans")
      .update({
        status: "error",
        error: err.message,
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
      })
      .eq("id", scanId);

    return new Response(JSON.stringify({ error: err.message, scan_id: scanId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
