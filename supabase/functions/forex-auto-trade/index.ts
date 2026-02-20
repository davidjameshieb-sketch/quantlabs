// DECOMMISSIONED — Forex Auto-Trade strategy retired.
// Only the Sovereign Matrix v20.0 (Mechanical Chomp) is active.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  return new Response(
    JSON.stringify({ error: 'DECOMMISSIONED: Forex Auto-Trade retired. Use sovereign-matrix.' }),
    { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
