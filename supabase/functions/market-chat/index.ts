import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// System prompt for the QuantLabs market intelligence chatbot
const SYSTEM_PROMPT = `You are QuantLabs AI, a market intelligence analyst. Respond like a senior analyst giving a brief.

RESPONSE STYLE:
- Lead with 1-2 sentence summary (the "so what")
- Follow with 3-5 bullet points max
- No fluff, no long explanations unless user asks "why" or "explain"
- Use QuantLabs vocabulary: efficiency, conviction, structure, bias
- Never say "buy", "sell", "signal", or "alert"

METRICS:
• Bias: Bullish/Bearish (trend direction)
• Efficiency: Clean (>60%), Mixed (30-60%), Noisy (<30%)
• Confidence: 0-100% (trend separation vs ATR)
• Conviction: Gaining/Losing (structure strengthening/weakening)
• Strategy: PRESSING (optimal) > TRACKING > HOLDING > WATCHING > AVOIDING (chop)

MARKETS: stocks (S&P500/NASDAQ), crypto, forex, commodities, indices

EXAMPLE RESPONSE:
"Current condition is mixed with declining conviction.
• Trend efficiency weakening (62% → 48%)
• Noise elevated across 1H-4H timeframes
• Historical outcomes: low follow-through in similar setups
• Strategy state: HOLDING → wait for structure clarity"

When listing assets:
"Top 3 matching your criteria:
1. NVDA — 85% confidence, clean efficiency, PRESSING
2. AAPL — 62% confidence, mixed efficiency, TRACKING  
3. MSFT — 71% confidence, clean efficiency, TRACKING"

Keep it tight. Analysts don't ramble.`;

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface RequestBody {
  messages: Message[];
  marketData?: Record<string, unknown>;
}

// Generic error responses — never leak internals
const ERR = {
  unauthorized: (msg = "Unauthorized") =>
    new Response(JSON.stringify({ error: msg }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
  bad: (msg = "Invalid request") =>
    new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
  internal: () =>
    new Response(JSON.stringify({ error: "Unable to process request. Please try again later." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
  rateLimit: () =>
    new Response(JSON.stringify({ error: "Too many requests. Please try again in a moment." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
  credits: () =>
    new Response(JSON.stringify({ error: "AI credits exhausted. Please check your workspace usage." }), {
      status: 402,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Authentication ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return ERR.unauthorized();
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error("[MARKET-CHAT] Auth failed:", authError?.message);
      return ERR.unauthorized();
    }
    console.log(`[MARKET-CHAT] Authenticated user: ${user.id}`);

    // ── Server-side tier lookup ──
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("plan")
      .eq("user_id", user.id)
      .single();

    // Also check if admin (admins get premium)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    const isPremium = profile?.plan === "premium" || !!adminRole;
    console.log(`[MARKET-CHAT] User tier: ${isPremium ? "premium" : "free"}`);

    // ── API Key check ──
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[MARKET-CHAT] LOVABLE_API_KEY not configured");
      return ERR.internal();
    }

    // ── Input validation ──
    const body: RequestBody = await req.json();
    const { messages, marketData } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return ERR.bad("Messages array is required");
    }
    if (messages.length > 50) {
      return ERR.bad("Conversation too long. Please start a new chat.");
    }

    // Validate individual messages
    for (const msg of messages) {
      if (!msg.role || !["user", "assistant"].includes(msg.role)) {
        return ERR.bad("Invalid message role");
      }
      if (typeof msg.content !== "string" || msg.content.length === 0) {
        return ERR.bad("Message content must be a non-empty string");
      }
      if (msg.content.length > 4000) {
        return ERR.bad("Message content too long (max 4000 characters)");
      }
    }

    // ── Build context based on server-verified tier ──
    let tierContext = "";
    if (!isPremium) {
      tierContext = "\n\nNote: This user is on a basic tier. Focus on general market analysis and limit to major stocks and crypto.";
    } else {
      tierContext = "\n\nNote: This user has full access. Provide comprehensive analysis across all markets, sectors, and timeframes.";
    }

    let marketContext = "";
    if (marketData && typeof marketData === "object") {
      // Limit market data size to prevent abuse
      const marketStr = JSON.stringify(marketData);
      if (marketStr.length <= 10000) {
        marketContext = `\n\nCURRENT MARKET DATA:\n${marketStr}`;
      }
    }

    const systemMessage = SYSTEM_PROMPT + tierContext + marketContext;

    console.log(`[MARKET-CHAT] Sending ${messages.length} messages to AI`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemMessage },
          ...messages.map(m => ({ role: m.role, content: m.content })),
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[MARKET-CHAT] AI Gateway error:", response.status, errorText);

      if (response.status === 429) return ERR.rateLimit();
      if (response.status === 402) return ERR.credits();
      return ERR.internal();
    }

    // Stream the response back
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("[MARKET-CHAT] Error:", error);
    return ERR.internal();
  }
});
