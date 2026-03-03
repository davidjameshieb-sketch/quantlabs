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

    return new Response(JSON.stringify({
      ok: true,
      scan_id: scanId,
      duration_ms: durationMs,
      execution_ready_count: executionReady,
      best_pair: parsed?.best_pair || null,
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
