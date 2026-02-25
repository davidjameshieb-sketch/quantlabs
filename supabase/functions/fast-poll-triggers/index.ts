// Fast Poll Triggers — fires decorrelated-blend-executor once per cron invocation.
// Called every minute by pg_cron. No internal loop — one call per minute.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const blendUrl = `${supabaseUrl}/functions/v1/decorrelated-blend-executor`;

  const t0 = Date.now();
  try {
    const res = await fetch(blendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ ts: new Date().toISOString() }),
    });
    const body = await res.text();
    const ms = Date.now() - t0;
    console.log(`[FAST-POLL] Executor returned ${res.status} in ${ms}ms`);

    return new Response(
      JSON.stringify({ success: true, status: res.status, ms }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const ms = Date.now() - t0;
    console.error(`[FAST-POLL] Error after ${ms}ms:`, (err as Error).message);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message, ms }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
