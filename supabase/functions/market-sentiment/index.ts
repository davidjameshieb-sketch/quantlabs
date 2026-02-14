// ═══════════════════════════════════════════════════════════════
// MARKET SENTIMENT — CNN Fear & Greed + Reddit WSB/Forex
// Sentiment scoring from multiple sources
// ═══════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ── CNN Fear & Greed Index ──
async function fetchCNNFearGreed(): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  try {
    const url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata";
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.fear_and_greed) {
        const current = data.fear_and_greed;
        results.current = {
          value: Math.round(current.score),
          label: current.rating,
          timestamp: current.timestamp,
        };
        if (data.fear_and_greed_historical) {
          const hist = data.fear_and_greed_historical;
          results.previousClose = hist.previousClose ? { value: Math.round(hist.previousClose), label: ratingFromScore(Math.round(hist.previousClose)) } : null;
          results.oneWeekAgo = hist.oneWeekAgo ? { value: Math.round(hist.oneWeekAgo), label: ratingFromScore(Math.round(hist.oneWeekAgo)) } : null;
          results.oneMonthAgo = hist.oneMonthAgo ? { value: Math.round(hist.oneMonthAgo), label: ratingFromScore(Math.round(hist.oneMonthAgo)) } : null;
          results.oneYearAgo = hist.oneYearAgo ? { value: Math.round(hist.oneYearAgo), label: ratingFromScore(Math.round(hist.oneYearAgo)) } : null;
        }
        // Signal interpretation
        const score = Math.round(current.score);
        results.signal = score <= 20 ? "EXTREME FEAR — Contrarian Buy Signal" :
          score <= 35 ? "FEAR — Cautious, potential bottom" :
          score >= 80 ? "EXTREME GREED — Contrarian Sell Signal" :
          score >= 65 ? "GREED — Elevated risk, potential top" : "NEUTRAL";
        results.contrarian = score <= 25 ? "BUY" : score >= 75 ? "SELL" : "HOLD";
      }
    } else {
      await res.text();
      console.warn("[SENTIMENT] CNN F&G returned:", res.status);
    }
  } catch (e) {
    console.warn("[SENTIMENT] CNN Fear & Greed failed:", e);
    results.error = "CNN Fear & Greed unavailable";
  }
  return results;
}

function ratingFromScore(score: number): string {
  if (score <= 20) return "Extreme Fear";
  if (score <= 40) return "Fear";
  if (score <= 60) return "Neutral";
  if (score <= 80) return "Greed";
  return "Extreme Greed";
}

// ── Reddit Sentiment (r/wallstreetbets, r/forex) ──
async function fetchRedditSentiment(): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  const subreddits = ["wallstreetbets", "forex", "stocks"];

  for (const sub of subreddits) {
    try {
      // Use Reddit's public JSON API (no auth needed for .json endpoints)
      const url = `https://www.reddit.com/r/${sub}/hot.json?limit=15`;
      const res = await fetch(url, {
        headers: { "User-Agent": "QuantLabs/1.0 (Market Sentiment Analysis)" },
      });
      if (res.ok) {
        const data = await res.json();
        const posts = data.data?.children || [];
        const analyzed = posts.map((p: any) => {
          const d = p.data;
          return {
            title: d.title?.slice(0, 120),
            score: d.score,
            numComments: d.num_comments,
            upvoteRatio: d.upvote_ratio,
            created: new Date(d.created_utc * 1000).toISOString(),
            flair: d.link_flair_text,
          };
        });

        // Simple sentiment heuristics from titles
        const bullishKeywords = ["buy", "calls", "moon", "bull", "long", "green", "pump", "rocket", "all in", "yolo", "tendies"];
        const bearishKeywords = ["sell", "puts", "crash", "bear", "short", "red", "dump", "bag", "loss", "rip"];

        let bullCount = 0, bearCount = 0;
        for (const post of analyzed) {
          const title = (post.title || "").toLowerCase();
          if (bullishKeywords.some(k => title.includes(k))) bullCount++;
          if (bearishKeywords.some(k => title.includes(k))) bearCount++;
        }

        const total = bullCount + bearCount || 1;
        const bullPct = +(bullCount / total * 100).toFixed(0);

        results[sub] = {
          topPosts: analyzed.slice(0, 5),
          sentiment: {
            bullish: bullCount,
            bearish: bearCount,
            bullPct,
            bias: bullPct > 65 ? "BULLISH" : bullPct < 35 ? "BEARISH" : "MIXED",
          },
        };
      } else {
        await res.text();
        console.warn(`[SENTIMENT] Reddit r/${sub} returned:`, res.status);
      }
      // Be respectful to Reddit rate limits
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.warn(`[SENTIMENT] Reddit r/${sub} failed:`, e);
      results[sub] = { error: (e as Error).message };
    }
  }

  return results;
}

// ── Compute Sentiment Composite ──
function computeSentimentDirective(cnn: Record<string, unknown>, reddit: Record<string, unknown>): string {
  const signals: string[] = [];

  const cnnScore = (cnn.current as any)?.value;
  if (cnnScore != null) {
    signals.push(`CNN F&G: ${cnnScore} (${(cnn.current as any)?.label})`);
  }

  // WSB sentiment
  const wsb = reddit.wallstreetbets as any;
  if (wsb?.sentiment?.bias) {
    signals.push(`WSB: ${wsb.sentiment.bias} (${wsb.sentiment.bullPct}% bull)`);
  }

  const forex = reddit.forex as any;
  if (forex?.sentiment?.bias) {
    signals.push(`r/forex: ${forex.sentiment.bias}`);
  }

  // Overall contrarian signal
  const contrarian = (cnn.contrarian as string) || "HOLD";
  signals.push(`Contrarian: ${contrarian}`);

  return signals.join(" | ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const [cnnFearGreed, redditSentiment] = await Promise.all([
      fetchCNNFearGreed(),
      fetchRedditSentiment(),
    ]);

    const sentimentDirective = computeSentimentDirective(cnnFearGreed, redditSentiment);

    return json({
      sentimentDirective,
      cnnFearGreed,
      reddit: redditSentiment,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[SENTIMENT] Error:", err);
    return json({ error: "Sentiment fetch failed" }, 500);
  }
});
