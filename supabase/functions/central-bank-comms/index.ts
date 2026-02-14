import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1h — speeches don't change often

// Hawkish/Dovish word lists for sentiment scoring
const HAWKISH_WORDS = ['inflation', 'tightening', 'restrictive', 'rate hike', 'overheating', 'higher for longer', 'vigilant', 'upside risks', 'price stability', 'above target', 'too high', 'further increases', 'normalization'];
const DOVISH_WORDS = ['easing', 'accommodative', 'downside risks', 'slowdown', 'recession', 'below target', 'cut', 'support', 'patience', 'gradual', 'uncertainty', 'weakening', 'employment concerns'];

function scoreSentiment(text: string): { score: number; label: string; hawkishHits: string[]; dovishHits: string[] } {
  const lower = text.toLowerCase();
  const hawkishHits = HAWKISH_WORDS.filter(w => lower.includes(w));
  const dovishHits = DOVISH_WORDS.filter(w => lower.includes(w));
  const rawScore = hawkishHits.length - dovishHits.length;
  const total = hawkishHits.length + dovishHits.length;
  const normalizedScore = total > 0 ? +(rawScore / total * 100).toFixed(0) : 0;
  
  let label = 'NEUTRAL';
  if (normalizedScore > 40) label = 'HAWKISH';
  else if (normalizedScore > 20) label = 'SLIGHTLY HAWKISH';
  else if (normalizedScore < -40) label = 'DOVISH';
  else if (normalizedScore < -20) label = 'SLIGHTLY DOVISH';
  
  return { score: normalizedScore, label, hawkishHits, dovishHits };
}

// Fetch recent Fed communications from federalreserve.gov RSS
async function fetchFedComms(): Promise<{ speeches: any[]; sentiment: ReturnType<typeof scoreSentiment> }> {
  try {
    const url = 'https://www.federalreserve.gov/feeds/speeches.xml';
    const res = await fetch(url);
    if (!res.ok) return { speeches: [], sentiment: { score: 0, label: 'NO DATA', hawkishHits: [], dovishHits: [] } };
    
    const xml = await res.text();
    
    // Simple XML parsing for titles and descriptions
    const items: { title: string; date: string; description: string }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      const item = match[1];
      const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() || '';
      const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || '';
      const desc = item.match(/<description>([\s\S]*?)<\/description>/)?.[1]?.trim() || '';
      items.push({ title, date: pubDate, description: desc.replace(/<[^>]+>/g, '').slice(0, 500) });
    }

    // Score combined text
    const combinedText = items.map(i => `${i.title} ${i.description}`).join(' ');
    const sentiment = scoreSentiment(combinedText);

    return { speeches: items, sentiment };
  } catch (e) {
    console.error('[CB-COMMS] Fed fetch failed:', e);
    return { speeches: [], sentiment: { score: 0, label: 'FETCH ERROR', hawkishHits: [], dovishHits: [] } };
  }
}

// Fetch ECB meeting accounts / press releases
async function fetchECBComms(): Promise<{ releases: any[]; sentiment: ReturnType<typeof scoreSentiment> }> {
  try {
    // ECB press releases RSS
    const url = 'https://www.ecb.europa.eu/rss/press.html';
    const res = await fetch(url);
    if (!res.ok) return { releases: [], sentiment: { score: 0, label: 'NO DATA', hawkishHits: [], dovishHits: [] } };
    
    const xml = await res.text();
    const items: { title: string; date: string; description: string }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      const item = match[1];
      const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() || '';
      const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || '';
      const desc = item.match(/<description>([\s\S]*?)<\/description>/)?.[1]?.trim() || '';
      items.push({ title, date: pubDate, description: desc.replace(/<[^>]+>/g, '').slice(0, 500) });
    }

    const combinedText = items.map(i => `${i.title} ${i.description}`).join(' ');
    const sentiment = scoreSentiment(combinedText);

    return { releases: items, sentiment };
  } catch (e) {
    console.error('[CB-COMMS] ECB fetch failed:', e);
    return { releases: [], sentiment: { score: 0, label: 'FETCH ERROR', hawkishHits: [], dovishHits: [] } };
  }
}

// Fetch BOJ communications
async function fetchBOJComms(): Promise<{ releases: any[]; sentiment: ReturnType<typeof scoreSentiment> }> {
  try {
    const url = 'https://www.boj.or.jp/en/mopo/mpmdeci/index.htm';
    const res = await fetch(url);
    if (!res.ok) return { releases: [], sentiment: { score: 0, label: 'NO DATA', hawkishHits: [], dovishHits: [] } };
    
    const html = await res.text();
    // Extract recent text content for sentiment
    const textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000);
    const sentiment = scoreSentiment(textContent);

    return { releases: [{ title: 'BOJ Monetary Policy Page', description: textContent.slice(0, 300) }], sentiment };
  } catch (e) {
    console.error('[CB-COMMS] BOJ fetch failed:', e);
    return { releases: [], sentiment: { score: 0, label: 'FETCH ERROR', hawkishHits: [], dovishHits: [] } };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (cache && Date.now() - cache.ts < CACHE_TTL) {
      return new Response(JSON.stringify(cache.data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const [fed, ecb, boj] = await Promise.all([
      fetchFedComms(),
      fetchECBComms(),
      fetchBOJComms(),
    ]);

    // Composite central bank directive
    const cbSignals: string[] = [];
    if (fed.sentiment.label !== 'NEUTRAL' && fed.sentiment.label !== 'NO DATA') {
      cbSignals.push(`Fed: ${fed.sentiment.label} (${fed.sentiment.score})`);
    }
    if (ecb.sentiment.label !== 'NEUTRAL' && ecb.sentiment.label !== 'NO DATA') {
      cbSignals.push(`ECB: ${ecb.sentiment.label} (${ecb.sentiment.score})`);
    }
    if (boj.sentiment.label !== 'NEUTRAL' && boj.sentiment.label !== 'NO DATA') {
      cbSignals.push(`BOJ: ${boj.sentiment.label} (${boj.sentiment.score})`);
    }

    const cbDirective = cbSignals.length > 0
      ? `CENTRAL BANK TONE: ${cbSignals.join(' | ')}`
      : 'CENTRAL BANK TONE: NEUTRAL / NO RECENT DATA';

    // Implications for FX
    const fxImplications: string[] = [];
    if (fed.sentiment.score > 20) fxImplications.push('Fed hawkish → USD bullish bias');
    if (fed.sentiment.score < -20) fxImplications.push('Fed dovish → USD bearish bias');
    if (ecb.sentiment.score > 20) fxImplications.push('ECB hawkish → EUR bullish bias');
    if (ecb.sentiment.score < -20) fxImplications.push('ECB dovish → EUR bearish bias');
    if (boj.sentiment.score > 20) fxImplications.push('BOJ hawkish → JPY bullish (yen strengthening)');
    if (boj.sentiment.score < -20) fxImplications.push('BOJ dovish → JPY bearish (yen weakening)');

    const payload = {
      cbDirective,
      fxImplications,
      fed: { recentSpeeches: fed.speeches.slice(0, 3), sentiment: fed.sentiment },
      ecb: { recentReleases: ecb.releases.slice(0, 3), sentiment: ecb.sentiment },
      boj: { recentReleases: boj.releases.slice(0, 3), sentiment: boj.sentiment },
      timestamp: new Date().toISOString(),
    };

    cache = { data: payload, ts: Date.now() };
    console.log(`[CB-COMMS] ${cbDirective}`);

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[CB-COMMS] Error:', error);
    return new Response(JSON.stringify({ error: 'Service unavailable' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
