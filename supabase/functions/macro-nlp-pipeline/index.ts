// Macro-Economic NLP Pipeline
// Scrapes Fed/ECB/BoJ communications via Firecrawl, classifies sentiment via Lovable AI,
// persists results to sovereign_memory for the sovereign loop to consume.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIRECRAWL_API = "https://api.firecrawl.dev/v1";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const CB_SOURCES = [
  { name: "Federal Reserve", url: "https://www.federalreserve.gov/newsevents/pressreleases.htm", currency: "USD" },
  { name: "ECB", url: "https://www.ecb.europa.eu/press/pr/html/index.en.html", currency: "EUR" },
  { name: "Bank of Japan", url: "https://www.boj.or.jp/en/mopo/mpmdeci/index.htm", currency: "JPY" },
  { name: "Bank of England", url: "https://www.bankofengland.co.uk/news/news", currency: "GBP" },
  { name: "Reserve Bank of Australia", url: "https://www.rba.gov.au/media-releases/", currency: "AUD" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!FIRECRAWL_API_KEY) return new Response(JSON.stringify({ error: "FIRECRAWL_API_KEY not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (!LOVABLE_API_KEY) return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return new Response(JSON.stringify({ error: "Supabase env not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const results: Record<string, unknown>[] = [];

    // Step 1: Scrape each central bank page
    for (const source of CB_SOURCES) {
      try {
        console.log(`[MACRO-NLP] Scraping ${source.name}...`);
        const scrapeRes = await fetch(`${FIRECRAWL_API}/scrape`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: source.url,
            formats: ["markdown"],
            onlyMainContent: true,
            waitFor: 3000,
          }),
        });

        if (!scrapeRes.ok) {
          console.error(`[MACRO-NLP] Scrape failed for ${source.name}: ${scrapeRes.status}`);
          results.push({ source: source.name, error: `Scrape failed: ${scrapeRes.status}` });
          continue;
        }

        const scrapeData = await scrapeRes.json();
        const markdown = scrapeData.data?.markdown || scrapeData.markdown || "";

        if (!markdown || markdown.length < 100) {
          results.push({ source: source.name, error: "Insufficient content scraped" });
          continue;
        }

        // Step 2: NLP sentiment classification via Lovable AI
        const truncatedContent = markdown.slice(0, 6000);
        console.log(`[MACRO-NLP] Classifying sentiment for ${source.name} (${truncatedContent.length} chars)...`);

        const aiRes = await fetch(AI_GATEWAY, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              {
                role: "system",
                content: `You are a macro-economic sentiment analyst for FX trading. Analyze central bank communications and classify the monetary policy stance. You MUST respond using the provided tool.`,
              },
              {
                role: "user",
                content: `Analyze this ${source.name} communication and classify the monetary policy sentiment:\n\n${truncatedContent}`,
              },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "classify_cb_sentiment",
                  description: "Classify central bank communication sentiment for FX trading",
                  parameters: {
                    type: "object",
                    properties: {
                      overall_stance: {
                        type: "string",
                        enum: ["hawkish", "dovish", "neutral", "hawkish_surprise", "dovish_surprise"],
                        description: "Overall monetary policy stance"
                      },
                      confidence: {
                        type: "number",
                        description: "Confidence in classification (0-100)"
                      },
                      rate_direction: {
                        type: "string",
                        enum: ["hike_likely", "cut_likely", "hold_likely", "uncertain"],
                        description: "Expected next rate decision"
                      },
                      key_phrases: {
                        type: "array",
                        items: { type: "string" },
                        description: "Key phrases indicating stance (max 5)"
                      },
                      fx_impact: {
                        type: "string",
                        enum: ["bullish_currency", "bearish_currency", "neutral_currency"],
                        description: "Expected impact on the currency"
                      },
                      summary: {
                        type: "string",
                        description: "One-sentence summary of the communication"
                      },
                      risk_events: {
                        type: "array",
                        items: { type: "string" },
                        description: "Upcoming risk events mentioned"
                      }
                    },
                    required: ["overall_stance", "confidence", "rate_direction", "fx_impact", "summary"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "classify_cb_sentiment" } },
          }),
        });

        if (!aiRes.ok) {
          const errText = await aiRes.text();
          console.error(`[MACRO-NLP] AI classification failed for ${source.name}: ${aiRes.status} ${errText}`);
          if (aiRes.status === 429) {
            results.push({ source: source.name, error: "Rate limited — try again later" });
            continue;
          }
          if (aiRes.status === 402) {
            results.push({ source: source.name, error: "AI credits exhausted" });
            break; // Stop processing all sources
          }
          results.push({ source: source.name, error: `AI error: ${aiRes.status}` });
          continue;
        }

        const aiData = await aiRes.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        let sentiment: Record<string, unknown> = {};

        if (toolCall?.function?.arguments) {
          try {
            sentiment = JSON.parse(toolCall.function.arguments);
          } catch {
            console.error(`[MACRO-NLP] Failed to parse AI response for ${source.name}`);
            results.push({ source: source.name, error: "Failed to parse AI response" });
            continue;
          }
        }

        // Step 3: Persist to sovereign_memory
        const memoryKey = `macro_nlp:${source.currency}:${new Date().toISOString().slice(0, 13)}`;

        const payload = {
          source: source.name,
          currency: source.currency,
          url: source.url,
          ...sentiment,
          scraped_at: new Date().toISOString(),
          content_length: markdown.length,
        };

        const { error: upsertError } = await supabase
          .from("sovereign_memory")
          .upsert(
            {
              memory_type: "macro_sentiment",
              memory_key: memoryKey,
              payload,
              relevance_score: (sentiment.confidence as number || 50) / 100,
              created_by: "macro-nlp-pipeline",
              expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12h TTL
            },
            { onConflict: "memory_key" }
          );

        if (upsertError) {
          console.error(`[MACRO-NLP] DB upsert error for ${source.name}:`, upsertError);
          results.push({ source: source.name, error: `DB error: ${upsertError.message}` });
          continue;
        }

        console.log(`[MACRO-NLP] ✅ ${source.name}: ${sentiment.overall_stance} (${sentiment.confidence}% confidence)`);
        results.push({ source: source.name, currency: source.currency, sentiment });

      } catch (err) {
        console.error(`[MACRO-NLP] Error processing ${source.name}:`, err);
        results.push({ source: source.name, error: (err as Error).message });
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[MACRO-NLP] Pipeline error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
