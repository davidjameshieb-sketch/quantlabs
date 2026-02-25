// Fast Poll Triggers — fires decorrelated-blend-executor every 10 seconds
// Called once per minute by pg_cron, internally loops 6 times with 10s spacing.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const blendUrl = `${supabaseUrl}/functions/v1/decorrelated-blend-executor`;

  const results: Array<{ tick: number; status: number; ms: number }> = [];

  for (let tick = 0; tick < 6; tick++) {
    if (tick > 0) await new Promise(r => setTimeout(r, 10_000)); // wait 10s between ticks

    const t0 = Date.now();
    try {
      const res = await fetch(blendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ tick, ts: new Date().toISOString() }),
      });
      await res.text(); // consume body
      results.push({ tick, status: res.status, ms: Date.now() - t0 });
    } catch (err) {
      results.push({ tick, status: 0, ms: Date.now() - t0 });
      console.error(`[FAST-POLL] Tick ${tick} error:`, (err as Error).message);
    }
  }

  console.log(`[FAST-POLL] 6 ticks complete: ${results.map(r => `t${r.tick}=${r.status}/${r.ms}ms`).join(' ')}`);

  return new Response(
    JSON.stringify({ success: true, ticks: results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
