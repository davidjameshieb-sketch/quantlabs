import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// System prompt for the QuantLabs market intelligence chatbot
const SYSTEM_PROMPT = `You are QuantLabs AI, a market intelligence assistant that helps users discover and filter stocks, crypto, forex, and commodities based on the QuantLabs analysis framework.

CORE PRINCIPLES:
- You provide ANALYSIS and UNDERSTANDING, never buy/sell signals
- You explain market conditions in plain English
- You rank and filter assets based on user criteria
- You never give financial advice

QUANTLABS METRICS YOU UNDERSTAND:
1. **Bias**: Bullish or Bearish - direction of the trend based on fast/slow core relationship
2. **Efficiency**: Clean (>60%), Mixed (30-60%), Noisy (<30%) - how directly price moves
3. **Confidence**: 0-100% based on trend core separation relative to ATR
4. **Conviction**: Gaining or Losing - whether structure is strengthening or weakening
5. **Strategy State**: 
   - PRESSING: Strong structure + clean efficiency (optimal conditions)
   - TRACKING: Good structure, some noise
   - HOLDING: Strong bias but choppy
   - WATCHING: Developing conditions
   - AVOIDING: Chop zone, no clear edge

MARKET TYPES:
- stocks: S&P 500 and NASDAQ stocks (organized by sector)
- crypto: Top cryptocurrencies
- forex: Major USD pairs
- commodities: Gold, Silver, Oil, etc.
- indices: Major market indices

SECTORS (for stocks):
- Technology, Healthcare, Financials, Consumer Discretionary, Consumer Staples
- Industrials, Energy, Utilities, Real Estate, Materials, Communication Services

PRICE FILTERS:
- Over $10: Higher-priced stocks
- Over $5: Mid-range stocks
- All: Include penny stocks and lower-priced assets

WHEN RESPONDING:
1. Always explain WHY an asset meets the criteria
2. Use the QuantLabs vocabulary (efficiency, conviction, structure)
3. Group results by sector or market type when appropriate
4. Provide educational context about what the metrics mean
5. Never use words like "buy", "sell", "signal", or "alert"
6. Format responses clearly with rankings when filtering

EXAMPLE RESPONSE FORMAT:
When filtering stocks, respond like:
"Based on your criteria, here are the top matches:

**Technology Sector**
1. NVDA - High confidence (85%), clean efficiency, bullish structure PRESSING
   → Strong directional conviction with minimal noise

2. AAPL - Moderate confidence (62%), mixed efficiency, bullish structure TRACKING
   → Developing trend with some choppiness

**Why these match:**
These stocks show strong trend separation (high confidence) with efficient price movement, indicating clear directional commitment from market participants."`;

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
