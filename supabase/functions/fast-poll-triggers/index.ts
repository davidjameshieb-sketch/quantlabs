// Fast Poll Triggers — DISABLED
// The blend executor has been disabled on the practice/demo account.
// Only NYC Love Agent is authorized to trade on demo.
// To re-enable, restore the original fetch call to decorrelated-blend-executor.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  console.log('[FAST-POLL] DISABLED — only NYC Love Agent trades on demo. Blend executor paused.');

  return new Response(
    JSON.stringify({
      success: true,
      status: 'disabled',
      reason: 'Demo account isolated for NYC Love Agent only',
      timestamp: new Date().toISOString(),
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
