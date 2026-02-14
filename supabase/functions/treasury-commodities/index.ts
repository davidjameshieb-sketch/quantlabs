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
  try {
    // Treasury provides XML/JSON for daily yield curve rates
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/${month}?type=daily_treasury_yield_curve&field_tdr_date_value_month=${year}${month}&page&_format=json`;

    const res = await fetch(url, { headers: { "User-Agent": "QuantLabs/1.0" } });
    if (res.ok) {
      const data = await res.json();
      // Treasury JSON format varies; try to parse
      if (Array.isArray(data) && data.length > 0) {
        const latest = data[data.length - 1]; // Most recent date
        const maturities: Record<string, number | null> = {};
        const fieldMap: Record<string, string> = {
          "d1_month": "1M", "d2_month": "2M", "d3_month": "3M", "d6_month": "6M",
          "d1_year": "1Y", "d2_year": "2Y", "d3_year": "3Y", "d5_year": "5Y",
          "d7_year": "7Y", "d10_year": "10Y", "d20_year": "20Y", "d30_year": "30Y",
        };
        for (const [field, label] of Object.entries(fieldMap)) {
          if (latest[field] != null) maturities[label] = parseFloat(latest[field]);
        }

        // Previous day for change
        const prev = data.length > 1 ? data[data.length - 2] : null;
        const prevMaturities: Record<string, number | null> = {};
        if (prev) {
          for (const [field, label] of Object.entries(fieldMap)) {
            if (prev[field] != null) prevMaturities[label] = parseFloat(prev[field]);
          }
        }

        results.curve = maturities;
        results.date = latest.d_date || latest.record_date;
        results.changes = {};
        for (const [mat, val] of Object.entries(maturities)) {
          if (val != null && prevMaturities[mat] != null) {
            (results.changes as any)[mat] = +(val - prevMaturities[mat]!).toFixed(3);
          }
        }

        // Key spreads
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

        console.log(`[TREASURY] Yield curve loaded: ${Object.keys(maturities).length} maturities`);
      }
    } else {
      await res.text();
      console.warn("[TREASURY] Treasury API returned:", res.status);
    }
  } catch (e) {
    console.warn("[TREASURY] Yield curve fetch failed:", e);
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const EIA_API_KEY = Deno.env.get("EIA_API_KEY");

    const [treasury, eia] = await Promise.all([
      fetchTreasuryYields(),
      fetchEIA(EIA_API_KEY),
    ]);

    // Bonds/Commodities directive
    const spread = treasury.spread2s10s as any;
    const oil = eia.crudeOilInventory as any;
    const signals: string[] = [];
    if (spread?.signal) signals.push(`2s10s: ${spread.value}% (${spread.signal})`);
    if (oil?.signal) signals.push(`Crude: ${oil.signal} (${oil.change > 0 ? "+" : ""}${oil.change}k bbl)`);

    return json({
      bondsDirective: signals.join(" | ") || "Data loading...",
      treasury,
      energy: eia,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[TREASURY] Error:", err);
    return json({ error: "Treasury/commodities fetch failed" }, 500);
  }
});
