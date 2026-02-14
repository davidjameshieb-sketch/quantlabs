// ═══════════════════════════════════════════════════════════════
// CRYPTO INTELLIGENCE — CoinGecko + Binance
// Top coins, fear/greed, BTC dominance, order book depth
// ═══════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ── CoinGecko (free, no key for basic endpoints) ──
async function fetchCoinGecko(): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};

  // Top 20 coins by market cap
  try {
    const url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=1h,24h,7d";
    const res = await fetch(url);
    if (res.ok) {
      const coins = await res.json();
      results.top20 = (coins as any[]).map(c => ({
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        price: c.current_price,
        marketCap: c.market_cap,
        volume24h: c.total_volume,
        change1h: c.price_change_percentage_1h_in_currency ? +c.price_change_percentage_1h_in_currency.toFixed(2) : null,
        change24h: c.price_change_percentage_24h ? +c.price_change_percentage_24h.toFixed(2) : null,
        change7d: c.price_change_percentage_7d_in_currency ? +c.price_change_percentage_7d_in_currency.toFixed(2) : null,
        ath: c.ath,
        athChangePct: c.ath_change_percentage ? +c.ath_change_percentage.toFixed(1) : null,
      }));
      console.log(`[CRYPTO-INTEL] CoinGecko: ${(coins as any[]).length} coins`);
    } else {
      const text = await res.text();
      console.warn("[CRYPTO-INTEL] CoinGecko markets failed:", res.status, text.slice(0, 200));
    }
  } catch (e) {
    console.warn("[CRYPTO-INTEL] CoinGecko markets error:", e);
  }

  // Global data (BTC dominance, total market cap)
  try {
    const url = "https://api.coingecko.com/api/v3/global";
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const g = data.data;
      results.global = {
        totalMarketCap: g.total_market_cap?.usd,
        totalVolume24h: g.total_volume?.usd,
        btcDominance: g.market_cap_percentage?.btc ? +g.market_cap_percentage.btc.toFixed(1) : null,
        ethDominance: g.market_cap_percentage?.eth ? +g.market_cap_percentage.eth.toFixed(1) : null,
        activeCryptos: g.active_cryptocurrencies,
        marketCapChange24h: g.market_cap_change_percentage_24h_usd ? +g.market_cap_change_percentage_24h_usd.toFixed(2) : null,
      };
    } else {
      await res.text();
    }
  } catch (e) {
    console.warn("[CRYPTO-INTEL] CoinGecko global error:", e);
  }

  // Fear & Greed Index (alternative.me)
  try {
    const url = "https://api.alternative.me/fng/?limit=3";
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const fng = data.data;
      if (fng && fng.length > 0) {
        results.fearGreed = {
          value: parseInt(fng[0].value),
          label: fng[0].value_classification,
          previous: fng.length > 1 ? { value: parseInt(fng[1].value), label: fng[1].value_classification } : null,
          signal: parseInt(fng[0].value) <= 20 ? "EXTREME FEAR (Contrarian Buy)" :
                  parseInt(fng[0].value) <= 35 ? "FEAR" :
                  parseInt(fng[0].value) >= 80 ? "EXTREME GREED (Contrarian Sell)" :
                  parseInt(fng[0].value) >= 65 ? "GREED" : "NEUTRAL",
        };
      }
    } else {
      await res.text();
    }
  } catch (e) {
    console.warn("[CRYPTO-INTEL] Fear & Greed error:", e);
  }

  return results;
}

// ── Binance Public API (no key for market data) ──
async function fetchBinance(): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  const pairs = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "BNBUSDT"];

  // 24hr ticker stats
  try {
    const symbols = JSON.stringify(pairs);
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbols)}`;
    const res = await fetch(url);
    if (res.ok) {
      const tickers = await res.json();
      results.tickers = (tickers as any[]).map(t => ({
        symbol: t.symbol,
        price: parseFloat(t.lastPrice),
        change24h: parseFloat(t.priceChangePercent),
        high24h: parseFloat(t.highPrice),
        low24h: parseFloat(t.lowPrice),
        volume: parseFloat(t.volume),
        quoteVolume: parseFloat(t.quoteVolume),
        trades: t.count,
      }));
    } else {
      await res.text();
    }
  } catch (e) {
    console.warn("[CRYPTO-INTEL] Binance tickers error:", e);
  }

  // BTC order book depth (top 5 levels)
  try {
    const url = "https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=5";
    const res = await fetch(url);
    if (res.ok) {
      const book = await res.json();
      const bidVolume = (book.bids as [string, string][]).reduce((s, [_, v]) => s + parseFloat(v), 0);
      const askVolume = (book.asks as [string, string][]).reduce((s, [_, v]) => s + parseFloat(v), 0);
      results.btcOrderBook = {
        topBid: parseFloat(book.bids[0][0]),
        topAsk: parseFloat(book.asks[0][0]),
        spread: +(parseFloat(book.asks[0][0]) - parseFloat(book.bids[0][0])).toFixed(2),
        bidDepth: +bidVolume.toFixed(4),
        askDepth: +askVolume.toFixed(4),
        imbalance: bidVolume + askVolume > 0 ? +((bidVolume - askVolume) / (bidVolume + askVolume) * 100).toFixed(1) : 0,
        imbalanceSignal: bidVolume > askVolume * 1.5 ? "BID HEAVY (Bullish)" :
                         askVolume > bidVolume * 1.5 ? "ASK HEAVY (Bearish)" : "BALANCED",
      };
    } else {
      await res.text();
    }
  } catch (e) {
    console.warn("[CRYPTO-INTEL] Binance depth error:", e);
  }

  // ETH/BTC ratio (key correlation signal)
  try {
    const url = "https://api.binance.com/api/v3/ticker/24hr?symbol=ETHBTC";
    const res = await fetch(url);
    if (res.ok) {
      const t = await res.json();
      results.ethBtcRatio = {
        price: parseFloat(t.lastPrice),
        change24h: parseFloat(t.priceChangePercent),
        signal: parseFloat(t.priceChangePercent) > 2 ? "ETH OUTPERFORMING (Alt Season Signal)" :
                parseFloat(t.priceChangePercent) < -2 ? "BTC DOMINANCE RISING" : "STABLE",
      };
    } else {
      await res.text();
    }
  } catch (e) {
    console.warn("[CRYPTO-INTEL] Binance ETH/BTC error:", e);
  }

  return results;
}

// ── Compute Crypto Directive ──
function computeCryptoDirective(cg: Record<string, unknown>, binance: Record<string, unknown>): string {
  const fearGreed = cg.fearGreed as any;
  const global = cg.global as any;
  const btcBook = binance.btcOrderBook as any;
  const ethBtc = binance.ethBtcRatio as any;

  const signals: string[] = [];
  if (fearGreed?.signal) signals.push(`F&G: ${fearGreed.value} (${fearGreed.signal})`);
  if (global?.btcDominance) signals.push(`BTC.D: ${global.btcDominance}%`);
  if (global?.marketCapChange24h) signals.push(`MCap 24h: ${global.marketCapChange24h > 0 ? "+" : ""}${global.marketCapChange24h}%`);
  if (btcBook?.imbalanceSignal) signals.push(`BTC Book: ${btcBook.imbalanceSignal}`);
  if (ethBtc?.signal) signals.push(`ETH/BTC: ${ethBtc.signal}`);

  return signals.join(" | ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const [coinGecko, binance] = await Promise.all([
      fetchCoinGecko(),
      fetchBinance(),
    ]);

    const cryptoDirective = computeCryptoDirective(coinGecko, binance);

    return json({
      cryptoDirective,
      coinGecko,
      binance,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[CRYPTO-INTEL] Error:", err);
    return json({ error: "Crypto intel fetch failed" }, 500);
  }
});
