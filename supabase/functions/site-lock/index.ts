import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ─── In-memory rate limiting ───
const attempts: Map<string, { count: number; resetAt: number }> = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

// ─── Constant-time string comparison to prevent timing attacks ───
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    let result = 1;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      result |= (a.charCodeAt(i % a.length) ^ b.charCodeAt(i % b.length));
    }
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ─── HMAC token signing ───
async function signToken(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const sigArray = Array.from(new Uint8Array(signature));
  return btoa(String.fromCharCode(...sigArray));
}

async function verifyToken(payload: string, token: string, secret: string): Promise<boolean> {
  const expected = await signToken(payload, secret);
  return secureCompare(expected, token);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';

  if (isRateLimited(clientIp)) {
    console.warn(`[site-lock] Rate limited: ${clientIp}`);
    return new Response(
      JSON.stringify({ error: 'Too many attempts. Please wait 60 seconds.' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } }
    );
  }

  try {
    const body = await req.json();
    const { step, value, pinToken: providedPinToken } = body;

    if (!step || !value || typeof value !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Invalid request' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (value.length > 128) {
      return new Response(
        JSON.stringify({ error: 'Invalid input' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const SITE_PIN = Deno.env.get('SITE_LOCK_PIN');
    const SITE_PASSWORD = Deno.env.get('SITE_LOCK_PASSWORD');
    const HMAC_SECRET = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'fallback-hmac-key';

    if (!SITE_PIN || !SITE_PASSWORD) {
      console.error('[site-lock] SITE_LOCK_PIN or SITE_LOCK_PASSWORD not configured');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (step === 'pin') {
      const valid = secureCompare(value, SITE_PIN);
      if (!valid) {
        console.warn(`[site-lock] Invalid PIN attempt from ${clientIp}`);
        return new Response(
          JSON.stringify({ valid: false }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Generate HMAC-signed token proving PIN was validated
      const timestamp = Date.now().toString();
      const payload = `pin_verified:${timestamp}`;
      const token = await signToken(payload, HMAC_SECRET);

      console.log(`[site-lock] PIN verified for ${clientIp}`);
      return new Response(
        JSON.stringify({ valid: true, pinToken: `${timestamp}:${token}` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (step === 'password') {
      // Require PIN token
      if (!providedPinToken || typeof providedPinToken !== 'string') {
        return new Response(
          JSON.stringify({ error: 'PIN verification required first' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate PIN token format and expiry (max 10 min)
      const colonIdx = providedPinToken.indexOf(':');
      if (colonIdx === -1) {
        return new Response(
          JSON.stringify({ valid: false }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const timestamp = providedPinToken.substring(0, colonIdx);
      const sig = providedPinToken.substring(colonIdx + 1);

      const tokenAge = Date.now() - parseInt(timestamp, 10);
      if (isNaN(tokenAge) || tokenAge > 10 * 60 * 1000) {
        console.warn(`[site-lock] Expired PIN token from ${clientIp}`);
        return new Response(
          JSON.stringify({ valid: false, expired: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const pinPayload = `pin_verified:${timestamp}`;
      const pinValid = await verifyToken(pinPayload, sig, HMAC_SECRET);
      if (!pinValid) {
        console.warn(`[site-lock] Invalid PIN token from ${clientIp}`);
        return new Response(
          JSON.stringify({ valid: false }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate password with constant-time comparison
      const passwordValid = secureCompare(value, SITE_PASSWORD);
      if (!passwordValid) {
        console.warn(`[site-lock] Invalid password attempt from ${clientIp}`);
        return new Response(
          JSON.stringify({ valid: false }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Generate 24h session token
      const sessionTs = Date.now().toString();
      const sessionPayload = `site_unlocked:${sessionTs}`;
      const sessionToken = await signToken(sessionPayload, HMAC_SECRET);

      console.log(`[site-lock] Full access granted to ${clientIp}`);
      return new Response(
        JSON.stringify({ valid: true, sessionToken: `${sessionTs}:${sessionToken}` }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid step' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[site-lock] Error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
