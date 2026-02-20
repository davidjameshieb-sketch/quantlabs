// DECOMMISSIONED — David & Atlas strategy has been retired.
// Only the Sovereign Matrix v20.0 (Mechanical Chomp) is active.
// This function is intentionally disabled to prevent rogue trade execution.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  return new Response(
    JSON.stringify({ error: 'DECOMMISSIONED: David & Atlas strategy retired. Use sovereign-matrix.' }),
    { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
