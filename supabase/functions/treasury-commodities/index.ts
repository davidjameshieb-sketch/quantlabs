// ═══════════════════════════════════════════════════════════════
// TREASURY & COMMODITIES — US Treasury Yield Curve + EIA Energy
// Daily yield curve rates, crude oil inventory, nat gas storage
// ═══════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ── US Treasury Yield Curve ──
async function fetchTreasuryYields(): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};
  // Try Fiscal Data API (official, stable JSON endpoint)
  try {
    const today = new Date();
    const lookback = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
    const filterDate = `${lookback.getFullYear()}-${String(lookback.getMonth() + 1).padStart(2, "0")}-01`;
    const fiscalUrl = `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?sort=-record_date&page[size]=30&filter=record_date:gte:${filterDate}`;

    const res = await fetch(fiscalUrl, {
      headers: { Accept: "application/json", "User-Agent": "QuantLabs/1.0" },
    });
    if (res.ok) {
      const data = await res.json();
      const rows = data?.data || [];
      if (rows.length > 0) {
        const maturities: Record<string, number | null> = {};
        // Group by record_date, take latest
        const latestDate = rows[0]?.record_date;
        const latestRows = rows.filter((r: any) => r.record_date === latestDate);

        for (const row of latestRows) {
          const desc = (row.security_desc || "").toLowerCase();
          const rate = parseFloat(row.avg_interest_rate_amt);
          if (isNaN(rate)) continue;
          if (desc.includes("bills")) maturities["Bills"] = rate;
          else if (desc.includes("notes")) maturities["Notes"] = rate;
          else if (desc.includes("bonds")) maturities["Bonds"] = rate;
        }

        if (Object.keys(maturities).length > 0) {
          results.curve = maturities;
          results.date = latestDate;
          results.source = "fiscal_data_api";
          console.log(`[TREASURY] Fiscal Data API loaded: ${Object.keys(maturities).length} categories`);
        }
      }
    } else {
      await res.text();
      console.warn("[TREASURY] Fiscal Data API returned:", res.status);
    }
  } catch (e) {
    console.warn("[TREASURY] Fiscal Data API failed:", e);
  }

  // Fallback: try legacy Treasury.gov Drupal JSON
  if (!results.curve) {
    try {
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, "0");
      const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/${month}?type=daily_treasury_yield_curve&field_tdr_date_value_month=${year}${month}&page&_format=json`;

      const res = await fetch(url, {
        headers: { "User-Agent": "QuantLabs/1.0", Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const latest = data[data.length - 1];
          const maturities: Record<string, number | null> = {};
          const fieldMap: Record<string, string> = {
            "d1_month": "1M", "d2_month": "2M", "d3_month": "3M", "d6_month": "6M",
            "d1_year": "1Y", "d2_year": "2Y", "d3_year": "3Y", "d5_year": "5Y",
            "d7_year": "7Y", "d10_year": "10Y", "d20_year": "20Y", "d30_year": "30Y",
          };
          for (const [field, label] of Object.entries(fieldMap)) {
            if (latest[field] != null) maturities[label] = parseFloat(latest[field]);
          }

          const prev = data.length > 1 ? data[data.length - 2] : null;
          const prevMaturities: Record<string, number | null> = {};
          if (prev) {
            for (const [field, label] of Object.entries(fieldMap)) {
              if (prev[field] != null) prevMaturities[label] = parseFloat(prev[field]);
            }
          }

          results.curve = maturities;
          results.date = latest.d_date || latest.record_date;
          results.source = "treasury_gov_legacy";
          results.changes = {};
          for (const [mat, val] of Object.entries(maturities)) {
            if (val != null && prevMaturities[mat] != null) {
              (results.changes as any)[mat] = +(val - prevMaturities[mat]!).toFixed(3);
            }
          }

          if (maturities["2Y"] != null && maturities["10Y"] != null) {
            const spread2s10s = +(maturities["10Y"]! - maturities["2Y"]!).toFixed(3);
            results.spread2s10s = {
              value: spread2s10s,
              signal: spread2s10s < 0 ? "INVERTED — Recession Warning" : spread2s10s < 0.2 ? "FLAT — Caution" : "NORMAL",
            };
          }
          if (maturities["3M"] != null && maturities["10Y"] != null) {
            const spread3m10y = +(maturities["10Y"]! - maturities["3M"]!).toFixed(3);
            results.spread3m10y = {
              value: spread3m10y,
              signal: spread3m10y < 0 ? "DEEPLY INVERTED — Strong Recession Signal" : "NORMAL",
            };
          }

          console.log(`[TREASURY] Legacy API loaded: ${Object.keys(maturities).length} maturities`);
        }
      } else {
        await res.text();
        // Silently fail — Fiscal Data API is primary now
      }
    } catch (e) {
      console.warn("[TREASURY] Legacy Treasury API failed:", e);
    }
  }

  // Fallback: try FRED if Treasury API failed
  if (!results.curve) {
    results.note = "Treasury direct API unavailable — use forex-macro-data FRED yields as backup";
  }

  return results;
}

// ── EIA (Energy Information Administration) ──
async function fetchEIA(apiKey: string | undefined): Promise<Record<string, unknown>> {
  const results: Record<string, unknown> = {};

  if (!apiKey) {
    results.error = "EIA_API_KEY not configured — get free key at https://www.eia.gov/opendata/register.php";
    return results;
  }

  // Crude oil weekly inventory
  try {
    const url = `https://api.eia.gov/v2/petroleum/stoc/wstk/data/?api_key=${apiKey}&frequency=weekly&data[0]=value&facets[product][]=EPC0&sort[0][column]=period&sort[0][direction]=desc&length=5`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const rows = data.response?.data || [];
      if (rows.length > 0) {
        const latest = rows[0];
        const prev = rows.length > 1 ? rows[1] : null;
        results.crudeOilInventory = {
          value: latest.value,
          unit: "thousand barrels",
          period: latest.period,
          change: prev ? +(latest.value - prev.value).toFixed(0) : null,
          signal: prev ? (latest.value > prev.value ? "BUILD (Bearish Oil)" : "DRAW (Bullish Oil)") : null,
        };
      }
    } else {
      await res.text();
    }
  } catch (e) {
    console.warn("[TREASURY] EIA crude failed:", e);
  }

  // Natural gas weekly storage
  try {
    const url = `https://api.eia.gov/v2/natural-gas/stor/wkly/data/?api_key=${apiKey}&frequency=weekly&data[0]=value&facets[process][]=SAL&sort[0][column]=period&sort[0][direction]=desc&length=5`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const rows = data.response?.data || [];
      if (rows.length > 0) {
        const latest = rows[0];
        const prev = rows.length > 1 ? rows[1] : null;
        results.natGasStorage = {
          value: latest.value,
          unit: "billion cubic feet",
          period: latest.period,
          change: prev ? +(latest.value - prev.value).toFixed(0) : null,
          signal: prev ? (latest.value > prev.value ? "INJECTION (Bearish NatGas)" : "WITHDRAWAL (Bullish NatGas)") : null,
        };
      }
    } else {
      await res.text();
    }
  } catch (e) {
    console.warn("[TREASURY] EIA natgas failed:", e);
  }

  return results;
}

// ── Copper/Gold Ratio (Risk-On/Risk-Off Proxy) ──
async function fetchCopperGoldRatio(avKey: string | undefined): Promise<Record<string, unknown>> {
  if (!avKey) return { error: "ALPHA_VANTAGE_API_KEY not configured for Copper/Gold ratio" };

  try {
    // Fetch Copper (HG) and Gold (GC) daily prices via Alpha Vantage commodities
    const [copperRes, goldRes] = await Promise.all([
      fetch(`https://www.alphavantage.co/query?function=COPPER&interval=monthly&apikey=${avKey}`),
      fetch(`https://www.alphavantage.co/query?function=GOLD&interval=monthly&apikey=${avKey}`),
    ]);

    if (!copperRes.ok || !goldRes.ok) {
      return { error: `Alpha Vantage returned ${copperRes.status}/${goldRes.status}` };
    }

    const copperData = await copperRes.json();
    const goldData = await goldRes.json();

    const copperSeries = copperData?.data || [];
    const goldSeries = goldData?.data || [];

    if (copperSeries.length === 0 || goldSeries.length === 0) {
      return { error: "No copper/gold data available" };
    }

    const latestCopper = parseFloat(copperSeries[0]?.value || "0");
    const latestGold = parseFloat(goldSeries[0]?.value || "0");
    const prevCopper = copperSeries.length > 1 ? parseFloat(copperSeries[1]?.value || "0") : null;
    const prevGold = goldSeries.length > 1 ? parseFloat(goldSeries[1]?.value || "0") : null;

    const ratio = latestGold > 0 ? +(latestCopper / latestGold * 1000).toFixed(4) : 0;
    const prevRatio = prevCopper && prevGold && prevGold > 0 ? +(prevCopper / prevGold * 1000).toFixed(4) : null;
    const ratioChange = prevRatio ? +(ratio - prevRatio).toFixed(4) : null;

    return {
      copper: latestCopper,
      gold: latestGold,
      ratio,
      prevRatio,
      ratioChange,
      signal: ratioChange !== null
        ? (ratioChange < -0.5 ? "RISK-OFF — Prioritize JPY/CHF longs" : ratioChange > 0.5 ? "RISK-ON — Growth favored" : "NEUTRAL")
        : "LOADING",
      date: copperSeries[0]?.date,
    };
  } catch (e) {
    console.warn("[TREASURY] Copper/Gold fetch failed:", e);
    return { error: String(e) };
  }
}

// ── VIX Term Structure (Contango/Backwardation) ──
async function fetchVIXTermStructure(avKey: string | undefined): Promise<Record<string, unknown>> {
  if (!avKey) return { error: "ALPHA_VANTAGE_API_KEY not configured for VIX term structure" };

  try {
    const res = await fetch(`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=VIX&outputsize=compact&apikey=${avKey}`);
    if (!res.ok) {
      await res.text();
      return { error: `Alpha Vantage VIX returned ${res.status}` };
    }

    const data = await res.json();
    const ts = data?.["Time Series (Daily)"] || {};
    const dates = Object.keys(ts).sort().reverse();

    if (dates.length < 5) return { error: "Insufficient VIX data" };

    const spotVIX = parseFloat(ts[dates[0]]?.["4. close"] || "0");
    const vix5dAgo = parseFloat(ts[dates[4]]?.["4. close"] || "0");

    // Proxy term structure: if spot < 5d-ago → contango (normal); if spot > 5d-ago → backwardation (panic)
    const termStructure = spotVIX > vix5dAgo * 1.05 ? "BACKWARDATION" : spotVIX < vix5dAgo * 0.95 ? "CONTANGO" : "FLAT";
    const isBackwardation = termStructure === "BACKWARDATION";

    return {
      spotVIX,
      vix5dAgo,
      termStructure,
      sizingDirective: isBackwardation ? "REDUCE_SIZING_0.2x — VIX backwardation detected, market expects immediate chaos" : "NORMAL",
      signal: isBackwardation
        ? "BACKWARDATION — Market broken, defensive posture required"
        : termStructure === "CONTANGO"
        ? "CONTANGO — Normal term structure, proceed"
        : "FLAT — Neutral VIX structure",
      date: dates[0],
    };
  } catch (e) {
    console.warn("[TREASURY] VIX term structure fetch failed:", e);
    return { error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const EIA_API_KEY = Deno.env.get("EIA_API_KEY");
    const AV_KEY = Deno.env.get("ALPHA_VANTAGE_API_KEY");

    const [treasury, eia, copperGold, vixTerm] = await Promise.all([
      fetchTreasuryYields(),
      fetchEIA(EIA_API_KEY),
      fetchCopperGoldRatio(AV_KEY),
      fetchVIXTermStructure(AV_KEY),
    ]);

    // Bonds/Commodities directive
    const spread = treasury.spread2s10s as any;
    const oil = eia.crudeOilInventory as any;
    const cgRatio = copperGold as any;
    const vix = vixTerm as any;
    const signals: string[] = [];
    if (spread?.signal) signals.push(`2s10s: ${spread.value}% (${spread.signal})`);
    if (oil?.signal) signals.push(`Crude: ${oil.signal} (${oil.change > 0 ? "+" : ""}${oil.change}k bbl)`);
    if (cgRatio?.signal && cgRatio.signal !== "LOADING") signals.push(`Cu/Au: ${cgRatio.signal}`);
    if (vix?.signal) signals.push(`VIX: ${vix.signal}`);

    return json({
      bondsDirective: signals.join(" | ") || "Data loading...",
      treasury,
      energy: eia,
      copperGold,
      vixTermStructure: vixTerm,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[TREASURY] Error:", err);
    return json({ error: "Treasury/commodities fetch failed" }, 500);
  }
});
