// ═══════════════════════════════════════════════════════════════
// STOCKS INTELLIGENCE — Yahoo Finance + CBOE + SEC EDGAR
// Real-time quotes, VIX term structure, put/call, 13F filings
// ═══════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ── Yahoo Finance (unofficial query endpoints) ──
const YAHOO_SYMBOLS = ["SPY", "QQQ", "DIA", "IWM", "AAPL", "MSFT", "NVDA", "META", "TSLA", "AMZN", "GOOGL", "JPM", "GS", "XLE", "XLF", "XLK", "XLV", "XLI", "GLD", "SLV", "USO", "TLT", "HYG", "VXX"];

async function fetchYahooQuotes(): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  try {
    const symbols = YAHOO_SYMBOLS.join(",");
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,marketCap,fiftyDayAverage,twoHundredDayAverage,fiftyTwoWeekHigh,fiftyTwoWeekLow`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) { await res.text(); return results; }
    const data = await res.json();
    const quotes = data.quoteResponse?.result || [];
    for (const q of quotes) {
      results[q.symbol] = {
        price: q.regularMarketPrice,
        change: q.regularMarketChange ? +q.regularMarketChange.toFixed(2) : null,
        pctChange: q.regularMarketChangePercent ? +q.regularMarketChangePercent.toFixed(2) : null,
        volume: q.regularMarketVolume,
        marketCap: q.marketCap,
        sma50: q.fiftyDayAverage,
        sma200: q.twoHundredDayAverage,
        high52w: q.fiftyTwoWeekHigh,
        low52w: q.fiftyTwoWeekLow,
        aboveSma50: q.regularMarketPrice > q.fiftyDayAverage,
        aboveSma200: q.regularMarketPrice > q.twoHundredDayAverage,
      };
    }
    console.log(`[STOCKS-INTEL] Yahoo: ${Object.keys(results).length} quotes`);
  } catch (e) {
    console.warn("[STOCKS-INTEL] Yahoo fetch failed:", e);
    results.error = (e as Error).message;
  }
  return results;
}

// ── CBOE VIX & Put/Call Ratio ──
async function fetchCBOE(): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};

  // VIX term structure from Yahoo (VIX, VIX3M, VIX9D)
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=^VIX,^VIX3M,^VIX9D&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (res.ok) {
      const data = await res.json();
      const quotes = data.quoteResponse?.result || [];
      const vixMap: Record<string, number> = {};
      for (const q of quotes) {
        const sym = q.symbol.replace("^", "");
        vixMap[sym] = q.regularMarketPrice;
      }
      results.vixSpot = vixMap["VIX"] || null;
      results.vix3M = vixMap["VIX3M"] || null;
      results.vix9D = vixMap["VIX9D"] || null;

      // Contango/Backwardation
      if (vixMap["VIX"] && vixMap["VIX3M"]) {
        const ratio = vixMap["VIX"] / vixMap["VIX3M"];
        results.vixTermStructure = ratio > 1 ? "BACKWARDATION (Fear)" : ratio < 0.9 ? "STEEP CONTANGO (Complacency)" : "CONTANGO (Normal)";
        results.vixRatio = +ratio.toFixed(3);
      }
    } else {
      await res.text();
    }
  } catch (e) {
    console.warn("[STOCKS-INTEL] VIX term structure failed:", e);
  }

  // CBOE Put/Call ratio - use CBOE daily data
  try {
    const url = "https://www.cboe.com/us/options/market_statistics/daily/?dt=&mkt=cone";
    // CBOE blocks direct scraping; use Yahoo for equity put/call proxy
    const pcUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=^PCALL&fields=regularMarketPrice`;
    const res = await fetch(pcUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (res.ok) {
      const data = await res.json();
      const pcRatio = data.quoteResponse?.result?.[0]?.regularMarketPrice;
      if (pcRatio) {
        results.putCallRatio = pcRatio;
        results.putCallSignal = pcRatio > 1.2 ? "EXTREME FEAR (Contrarian Bullish)" :
          pcRatio > 0.9 ? "ELEVATED PUTS (Cautious)" :
          pcRatio < 0.6 ? "EXTREME GREED (Contrarian Bearish)" : "NEUTRAL";
      }
    } else {
      await res.text();
    }
  } catch (e) {
    console.warn("[STOCKS-INTEL] Put/Call ratio failed:", e);
  }

  return results;
}

// ── SEC EDGAR — Recent 13F filings from top funds ──
const TOP_FUND_CIKS: Record<string, string> = {
  "Bridgewater":    "1350694",
  "Renaissance":    "1037389",
  "Citadel":        "1423053",
  "DEShaw":         "1009207",
  "TwoSigma":       "1179392",
  "Millennium":     "1048445",
  "PointSevenTwo":  "1336528",
  "Soros":          "1029160",
};

async function fetchSECEdgar(): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  const filings: Record<string, unknown>[] = [];

  for (const [fund, cik] of Object.entries(TOP_FUND_CIKS)) {
    try {
      const url = `https://efts.sec.gov/LATEST/search-index?q=%2213F%22&dateRange=custom&startdt=${getDateMonthsAgo(3)}&enddt=${new Date().toISOString().slice(0, 10)}&forms=13F-HR&entityName=${cik}`;
      // Simpler approach: use EDGAR filing API
      const apiUrl = `https://data.sec.gov/submissions/CIK${cik.padStart(10, "0")}.json`;
      const res = await fetch(apiUrl, {
        headers: {
          "User-Agent": "QuantLabs/1.0 (quantlabs@trading.com)",
          Accept: "application/json",
        },
      });
      if (res.ok) {
        const data = await res.json();
        const recent = data.filings?.recent;
        if (recent) {
          // Find most recent 13F
          const idx = recent.form?.findIndex((f: string) => f.includes("13F"));
          if (idx >= 0) {
            filings.push({
              fund,
              form: recent.form[idx],
              filingDate: recent.filingDate[idx],
              accessionNumber: recent.accessionNumber?.[idx],
              primaryDocument: recent.primaryDocument?.[idx],
            });
          }
        }
      } else {
        await res.text();
      }
      // Be nice to SEC servers
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      console.warn(`[STOCKS-INTEL] SEC EDGAR ${fund} failed:`, e);
    }
  }

  results.recentFilings = filings;
  results.fundCount = filings.length;
  console.log(`[STOCKS-INTEL] SEC EDGAR: ${filings.length} 13F filings found`);
  return results;
}

function getDateMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

// ── Compute Market Breadth Signal ──
function computeMarketBreadth(quotes: Record<string, any>): Record<string, unknown> {
  const tickers = Object.keys(quotes).filter(k => k !== "error");
  const aboveSma50 = tickers.filter(k => quotes[k]?.aboveSma50).length;
  const aboveSma200 = tickers.filter(k => quotes[k]?.aboveSma200).length;
  const total = tickers.length || 1;

  const breadth50 = +(aboveSma50 / total * 100).toFixed(1);
  const breadth200 = +(aboveSma200 / total * 100).toFixed(1);

  let signal = "NEUTRAL";
  if (breadth50 > 70 && breadth200 > 70) signal = "BROAD RISK-ON";
  else if (breadth50 < 30 || breadth200 < 40) signal = "BROAD RISK-OFF";
  else if (breadth50 < 50 && breadth200 > 60) signal = "DIVERGENCE (Weakening)";

  return { breadth50, breadth200, signal, sampledTickers: total };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const [yahooQuotes, cboeData, secData] = await Promise.all([
      fetchYahooQuotes(),
      fetchCBOE(),
      fetchSECEdgar(),
    ]);

    const marketBreadth = computeMarketBreadth(yahooQuotes);

    // Sector rotation analysis
    const sectorKeys = ["XLE", "XLF", "XLK", "XLV", "XLI"];
    const sectorPerformance: Record<string, number> = {};
    for (const s of sectorKeys) {
      if (yahooQuotes[s] && (yahooQuotes[s] as any).pctChange != null) {
        sectorPerformance[s] = (yahooQuotes[s] as any).pctChange;
      }
    }
    const leadingSector = Object.entries(sectorPerformance).sort((a, b) => b[1] - a[1])[0];
    const laggingSector = Object.entries(sectorPerformance).sort((a, b) => a[1] - b[1])[0];

    return json({
      stocksDirective: `Market Breadth: ${marketBreadth.signal} | VIX: ${cboeData.vixTermStructure || "N/A"} | Leading: ${leadingSector?.[0] || "N/A"} (${leadingSector?.[1] || 0}%) | Lagging: ${laggingSector?.[0] || "N/A"} (${laggingSector?.[1] || 0}%)`,
      yahooQuotes,
      cboe: cboeData,
      secEdgar: secData,
      marketBreadth,
      sectorRotation: { sectorPerformance, leading: leadingSector?.[0], lagging: laggingSector?.[0] },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[STOCKS-INTEL] Error:", err);
    return json({ error: "Stocks intel fetch failed" }, 500);
  }
});
