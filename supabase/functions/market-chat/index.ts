import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// System prompt for the QuantLabs market intelligence chatbot - CONCISE ANALYST BRIEFING STYLE
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
  userTier?: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      throw new Error("AI service is not configured");
    }

    const { messages, marketData, userTier = 1 }: RequestBody = await req.json();

    if (!messages || !Array.isArray(messages)) {
      throw new Error("Messages array is required");
    }

    // Build context based on user tier
    let tierContext = "";
    if (userTier < 3) {
      tierContext = "\n\nNote: This user is on a basic tier. Focus on general market analysis and limit to major stocks and crypto.";
    } else if (userTier >= 4) {
      tierContext = "\n\nNote: This user has full access. Provide comprehensive analysis across all markets, sectors, and timeframes.";
    }

    // Add market data context if provided
    let marketContext = "";
    if (marketData) {
      marketContext = `\n\nCURRENT MARKET DATA:\n${JSON.stringify(marketData, null, 2)}`;
    }

    const systemMessage = SYSTEM_PROMPT + tierContext + marketContext;

    console.log("Sending request to Lovable AI Gateway");
    console.log("Messages count:", messages.length);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemMessage },
          ...messages,
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please check your workspace usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI service error: ${response.status}`);
    }

    // Stream the response back
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (error) {
    console.error("Market chat error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "An unexpected error occurred" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
