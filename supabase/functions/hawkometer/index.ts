// hawkometer: Central Bank NLP "Hawkometer"
// Quantifies tone delta between last two Fed/ECB/BoJ meetings
// If hawkish score jumps >20 points, writes autonomous 2.0x USD sizing mandate
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CENTRAL_BANKS = [
  { name: "Federal Reserve", id: "fed", currency: "USD", queries: [
    "Federal Reserve FOMC statement monetary policy",
    "Fed interest rate decision press conference",
  ]},
  { name: "ECB", id: "ecb", currency: "EUR", queries: [
    "ECB monetary policy decision statement",
    "European Central Bank interest rate press conference",
  ]},
  { name: "Bank of Japan", id: "boj", currency: "JPY", queries: [
    "Bank of Japan monetary policy statement",
    "BOJ interest rate decision yield curve control",
  ]},
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");

  try {
    const body = await req.json().catch(() => ({}));
    const banks = body.banks ?? ["fed", "ecb", "boj"];
    const injectSizing = body.inject_sizing !== false;

    const results: any[] = [];

    for (const bank of CENTRAL_BANKS) {
      if (!banks.includes(bank.id)) continue;

      // 1. Scrape recent statements via Firecrawl
      let combinedText = "";
      if (firecrawlKey) {
        for (const query of bank.queries) {
          try {
            const res = await fetch("https://api.firecrawl.dev/v1/search", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${firecrawlKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                query,
                limit: 3,
                tbs: "qdr:m", // last month
                scrapeOptions: { formats: ["markdown"] },
              }),
            });
            if (res.ok) {
              const data = await res.json();
              for (const r of data.data || []) {
                combinedText += `\n[${r.title}]\n${(r.markdown || r.description || "").slice(0, 2000)}\n---\n`;
              }
            }
          } catch { /* skip */ }
        }
      }

      // 2. Also check sovereign_memory for existing central bank data
      const { data: existingMemory } = await supabase
        .from("sovereign_memory")
        .select("payload")
        .eq("memory_type", "central_bank_sentiment")
        .eq("memory_key", bank.id)
        .limit(1);

      const previousScore = (existingMemory?.[0]?.payload as any)?.hawkishScore ?? 50;

      // 3. Analyze with Gemini
      let analysis: any = { hawkishScore: 50, delta: 0, reasoning: "No data" };

      if (combinedText.length > 100 && lovableKey) {
        try {
          const geminiRes = await fetch(
            "https://ai.gateway.lovable.dev/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${lovableKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash-lite",
                messages: [
                  { role: "system", content: "You are a central bank policy analyst. Score hawkish/dovish tone. Respond in valid JSON only." },
                  { role: "user", content: `Analyze these ${bank.name} communications and score the hawkish/dovish tone.

Previous hawkish score: ${previousScore}/100

Score 0 = extremely dovish (cutting rates, QE expansion)
Score 50 = neutral
Score 100 = extremely hawkish (aggressive tightening, QT acceleration)

Communications:
${combinedText.slice(0, 8000)}

Respond in JSON:
{
  "hawkishScore": 0-100,
  "delta": change_from_previous,
  "rateDirection": "hiking|holding|cutting",
  "keyPhrases": ["phrase1", "phrase2"],
  "fxImpact": "strengthening|neutral|weakening for ${bank.currency}",
  "reasoning": "one paragraph"
}` }
                ],
                temperature: 0.2,
                max_tokens: 500,
              }),
            }
          );

          if (geminiRes.ok) {
            const data = await geminiRes.json();
            const raw = data.choices?.[0]?.message?.content || "";
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try { analysis = JSON.parse(jsonMatch[0]); } catch { analysis.reasoning = raw.slice(0, 300); }
            } else {
              analysis.reasoning = raw.slice(0, 300);
            }
          }
        } catch (e) {
          console.error(`${bank.name} Gemini error:`, e);
        }
      }

      const delta = (analysis.hawkishScore ?? 50) - previousScore;
      analysis.delta = delta;
      analysis.previousScore = previousScore;
      analysis.bank = bank.name;
      analysis.bankId = bank.id;
      analysis.currency = bank.currency;
      analysis.updatedAt = new Date().toISOString();

      results.push(analysis);

      // 4. Persist to sovereign_memory
      await supabase.from("sovereign_memory").upsert(
        {
          memory_type: "central_bank_sentiment",
          memory_key: bank.id,
          payload: analysis,
          relevance_score: Math.abs(delta) > 15 ? 1.0 : 0.5,
          created_by: "hawkometer",
        },
        { onConflict: "memory_type,memory_key" }
      );

      // 5. If delta > 20, inject autonomous sizing mandate
      if (injectSizing && Math.abs(delta) > 20) {
        const sizingDir = bank.id === "fed"
          ? (delta > 0 ? "USD_BULL" : "USD_BEAR")
          : (delta > 0 ? `${bank.currency}_BULL` : `${bank.currency}_BEAR`);

        const gateId = `HAWKOMETER_SIZING:${bank.id}:${sizingDir}`;

        const { data: existing } = await supabase
          .from("gate_bypasses")
          .select("id")
          .eq("gate_id", gateId)
          .eq("revoked", false)
          .gte("expires_at", new Date().toISOString())
          .limit(1);

        if (!existing?.length) {
          await supabase.from("gate_bypasses").insert({
            gate_id: gateId,
            reason: `Hawkometer: ${bank.name} hawkish delta +${delta} (${previousScore}→${analysis.hawkishScore}). ${analysis.rateDirection || "unknown"} stance. Auto-mandate 2.0x ${bank.currency} sizing.`,
            expires_at: new Date(Date.now() + 24 * 3600000).toISOString(), // 24h
            pair: null,
            created_by: "hawkometer",
          });

          analysis.sizingMandateInjected = true;
          analysis.sizingDirection = sizingDir;
        }
      }
    }

    return new Response(JSON.stringify({ results, timestamp: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
