// ═══════════════════════════════════════════════════════════════
// CFTC Commitments of Traders (COT) Data — Smart Money vs Dumb Money
// Fetches weekly COT positioning for major forex futures from CFTC Open Data API
// Computes the "God Signal": Institutional bias vs Retail bias divergence
// ═══════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// CFTC Legacy COT Futures-Only reports — dataset 6dca-aqww (free, no API key)
const FOREX_CONTRACTS: Record<string, { cftcCode: string; name: string }> = {
  EUR: { cftcCode: "099741", name: "Euro FX" },
  GBP: { cftcCode: "096742", name: "British Pound" },
  JPY: { cftcCode: "097741", name: "Japanese Yen" },
  AUD: { cftcCode: "232741", name: "Australian Dollar" },
  CAD: { cftcCode: "090741", name: "Canadian Dollar" },
  CHF: { cftcCode: "092741", name: "Swiss Franc" },
  NZD: { cftcCode: "112741", name: "New Zealand Dollar" },
  MXN: { cftcCode: "095741", name: "Mexican Peso" },
  USD: { cftcCode: "098662", name: "US Dollar Index" },
};

let cachedCOTData: Record<string, unknown> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 4 * 60 * 60_000; // 4 hours

interface COTRecord {
  currency: string;
  reportDate: string;
  // Non-Commercial = Speculators (Hedge Funds, CTAs) = "Smart Money"
  specLong: number;
  specShort: number;
  specNet: number;
  specPctLong: number;
  // Commercial = Banks, Corporations = "Commercial Hedgers"
  commLong: number;
  commShort: number;
  commNet: number;
  commPctLong: number;
  // Non-Reportable = Small traders / Retail = "Dumb Money"
  retailLong: number;
  retailShort: number;
  retailNet: number;
  retailPctLong: number;
  // Open Interest
  openInterest: number;
  // Computed
  smartMoneyBias: "LONG" | "SHORT" | "NEUTRAL";
  retailBias: "LONG" | "SHORT" | "NEUTRAL";
  godSignal: string | null;
  godSignalStrength: number;
  weeklyChange: {
    specNetChange: number;
    commNetChange: number;
    retailNetChange: number;
    oiChange: number;
  } | null;
}

async function fetchCFTCData(cftcCode: string): Promise<any[]> {
  const url = `https://publicreporting.cftc.gov/resource/6dca-aqww.json?$where=cftc_contract_market_code='${cftcCode}'&$order=report_date_as_yyyy_mm_dd DESC&$limit=4`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      console.warn(`[COT] CFTC API ${res.status} for ${cftcCode}`);
      return [];
    }
    return await res.json();
  } catch (err) {
    console.warn(`[COT] Fetch error for ${cftcCode}:`, (err as Error).message);
    return [];
  }
}

function parseCOTRecord(currency: string, records: any[]): COTRecord | null {
  if (!records || records.length === 0) return null;
  const r = records[0];
  const prev = records.length > 1 ? records[1] : null;

  const specLong = parseInt(r.noncomm_positions_long_all || "0");
  const specShort = parseInt(r.noncomm_positions_short_all || "0");
  const commLong = parseInt(r.comm_positions_long_all || "0");
  const commShort = parseInt(r.comm_positions_short_all || "0");
  const retailLong = parseInt(r.nonrept_positions_long_all || "0");
  const retailShort = parseInt(r.nonrept_positions_short_all || "0");
  const openInterest = parseInt(r.open_interest_all || "0");

  const specNet = specLong - specShort;
  const commNet = commLong - commShort;
  const retailNet = retailLong - retailShort;

  const specTotal = specLong + specShort || 1;
  const commTotal = commLong + commShort || 1;
  const retailTotal = retailLong + retailShort || 1;

  const specPctLong = +(specLong / specTotal * 100).toFixed(1);
  const commPctLong = +(commLong / commTotal * 100).toFixed(1);
  const retailPctLong = +(retailLong / retailTotal * 100).toFixed(1);

  // Smart Money = Non-Commercial (speculators/hedge funds)
  const smartMoneyBias: "LONG" | "SHORT" | "NEUTRAL" = specPctLong > 60 ? "LONG" : specPctLong < 40 ? "SHORT" : "NEUTRAL";
  const retailBias: "LONG" | "SHORT" | "NEUTRAL" = retailPctLong > 60 ? "LONG" : retailPctLong < 40 ? "SHORT" : "NEUTRAL";

  // GOD SIGNAL: Smart Money vs Retail divergence
  let godSignal: string | null = null;
  let godSignalStrength = 0;

  if (smartMoneyBias === "LONG" && retailBias === "SHORT") {
    const divergence = specPctLong - retailPctLong;
    godSignalStrength = Math.min(100, Math.round(divergence * 1.5));
    if (godSignalStrength >= 80) {
      godSignal = `🔱 GOD SIGNAL LONG: Speculators ${specPctLong.toFixed(0)}% Long, Retail ${retailPctLong.toFixed(0)}% Long (${(100 - retailPctLong).toFixed(0)}% Short). Maximum conviction LONG. Ride the 200-pip wave.`;
    } else if (godSignalStrength >= 50) {
      godSignal = `⚡ STRONG SPEC LONG: Speculators lean ${specPctLong.toFixed(0)}% Long while Retail is ${retailPctLong.toFixed(0)}% Long. Institutional conviction building.`;
    }
  } else if (smartMoneyBias === "SHORT" && retailBias === "LONG") {
    const divergence = retailPctLong - specPctLong;
    godSignalStrength = Math.min(100, Math.round(divergence * 1.5));
    if (godSignalStrength >= 80) {
      godSignal = `🔱 GOD SIGNAL SHORT: Speculators ${(100 - specPctLong).toFixed(0)}% Short, Retail ${retailPctLong.toFixed(0)}% Long (trapped). Maximum conviction SHORT. Retail is exit liquidity.`;
    } else if (godSignalStrength >= 50) {
      godSignal = `⚡ STRONG SPEC SHORT: Speculators lean ${(100 - specPctLong).toFixed(0)}% Short while Retail piles Long at ${retailPctLong.toFixed(0)}%.`;
    }
  } else if (smartMoneyBias === retailBias && smartMoneyBias !== "NEUTRAL") {
    godSignal = `📊 ALIGNED: Both Speculators and Retail are ${smartMoneyBias}. No divergence edge — wait for separation.`;
    godSignalStrength = 10;
  }

  let weeklyChange = null;
  if (prev) {
    const prevSpecNet = parseInt(prev.noncomm_positions_long_all || "0") - parseInt(prev.noncomm_positions_short_all || "0");
    const prevCommNet = parseInt(prev.comm_positions_long_all || "0") - parseInt(prev.comm_positions_short_all || "0");
    const prevRetailNet = parseInt(prev.nonrept_positions_long_all || "0") - parseInt(prev.nonrept_positions_short_all || "0");
    const prevOI = parseInt(prev.open_interest_all || "0");
    weeklyChange = {
      specNetChange: specNet - prevSpecNet,
      commNetChange: commNet - prevCommNet,
      retailNetChange: retailNet - prevRetailNet,
      oiChange: openInterest - prevOI,
    };
  }

  return {
    currency, reportDate: r.report_date_as_yyyy_mm_dd?.slice(0, 10) || "unknown",
    specLong, specShort, specNet, specPctLong,
    commLong, commShort, commNet, commPctLong,
    retailLong, retailShort, retailNet, retailPctLong,
    openInterest, smartMoneyBias, retailBias, godSignal, godSignalStrength, weeklyChange,
  };
}

function computePairSignals(cotRecords: Record<string, COTRecord>): Record<string, { signal: string; strength: number; baseCOT: string; quoteCOT: string }> {
  const pairSignals: Record<string, { signal: string; strength: number; baseCOT: string; quoteCOT: string }> = {};
  const MAJOR_PAIRS: Record<string, [string, string]> = {
    EUR_USD: ["EUR", "USD"], GBP_USD: ["GBP", "USD"], AUD_USD: ["AUD", "USD"],
    NZD_USD: ["NZD", "USD"], USD_JPY: ["USD", "JPY"], USD_CAD: ["USD", "CAD"],
    USD_CHF: ["USD", "CHF"], EUR_GBP: ["EUR", "GBP"], EUR_JPY: ["EUR", "JPY"],
    GBP_JPY: ["GBP", "JPY"], AUD_JPY: ["AUD", "JPY"], EUR_AUD: ["EUR", "AUD"],
    EUR_CHF: ["EUR", "CHF"], GBP_AUD: ["GBP", "AUD"], AUD_NZD: ["AUD", "NZD"],
    AUD_CAD: ["AUD", "CAD"], EUR_CAD: ["EUR", "CAD"], GBP_CAD: ["GBP", "CAD"],
    EUR_NZD: ["EUR", "NZD"], GBP_NZD: ["GBP", "NZD"], NZD_JPY: ["NZD", "JPY"],
    CAD_JPY: ["CAD", "JPY"], CHF_JPY: ["CHF", "JPY"], NZD_CAD: ["NZD", "CAD"],
  };

  for (const [pair, [base, quote]] of Object.entries(MAJOR_PAIRS)) {
    const baseCOT = cotRecords[base];
    const quoteCOT = cotRecords[quote];
    if (!baseCOT || !quoteCOT) continue;

    const netSmartBias = baseCOT.specPctLong - quoteCOT.specPctLong;
    let signal = "NEUTRAL";
    const strength = Math.min(100, Math.round(Math.abs(netSmartBias) * 1.2));
    if (netSmartBias > 15) signal = strength >= 70 ? "STRONG INSTITUTIONAL LONG" : "INSTITUTIONAL LONG";
    else if (netSmartBias < -15) signal = strength >= 70 ? "STRONG INSTITUTIONAL SHORT" : "INSTITUTIONAL SHORT";

    pairSignals[pair] = {
      signal, strength,
      baseCOT: `${base}: Spec ${baseCOT.specPctLong}%L, Retail ${baseCOT.retailPctLong}%L`,
      quoteCOT: `${quote}: Spec ${quoteCOT.specPctLong}%L, Retail ${quoteCOT.retailPctLong}%L`,
    };
  }
  return pairSignals;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const now = Date.now();
    if (cachedCOTData && now - cacheTimestamp < CACHE_TTL) {
      return new Response(JSON.stringify(cachedCOTData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[COT] Fetching CFTC Commitments of Traders data...");

    const entries = Object.entries(FOREX_CONTRACTS);
    const results = await Promise.allSettled(
      entries.map(async ([currency, config]) => {
        const records = await fetchCFTCData(config.cftcCode);
        return { currency, records };
      })
    );

    const cotRecords: Record<string, COTRecord> = {};
    const godSignals: string[] = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        const { currency, records } = result.value;
        const parsed = parseCOTRecord(currency, records);
        if (parsed) {
          cotRecords[currency] = parsed;
          if (parsed.godSignal && parsed.godSignalStrength >= 50) {
            godSignals.push(`${currency}: ${parsed.godSignal}`);
          }
        }
      }
    }

    const pairSignals = computePairSignals(cotRecords);

    const sortedByStrength = Object.values(cotRecords)
      .filter(r => r.godSignalStrength >= 50)
      .sort((a, b) => b.godSignalStrength - a.godSignalStrength);

    let masterDirective = "📊 COT NEUTRAL: No significant Smart Money vs Retail divergence detected this week.";
    if (sortedByStrength.length > 0) {
      const top = sortedByStrength[0];
      if (top.godSignalStrength >= 80) {
        masterDirective = `🔱 GOD SIGNAL ACTIVE on ${top.currency}: ${top.godSignal}`;
      } else {
        masterDirective = `⚡ SMART MONEY DIVERGENCE on ${top.currency}: ${top.godSignal}`;
      }
    }

    const response = {
      timestamp: new Date().toISOString(),
      reportFrequency: "Weekly (CFTC publishes Fridays 3:30pm ET, data as of Tuesday)",
      masterDirective,
      godSignals,
      byCurrency: cotRecords,
      pairSignals,
      strongestPairSignals: Object.entries(pairSignals)
        .filter(([, v]) => v.strength >= 50)
        .sort(([, a], [, b]) => b.strength - a.strength)
        .slice(0, 10)
        .map(([pair, v]) => ({ pair, ...v })),
    };

    cachedCOTData = response;
    cacheTimestamp = now;
    console.log(`[COT] Loaded ${Object.keys(cotRecords).length} currencies, ${godSignals.length} god signals, ${Object.keys(pairSignals).length} pair signals`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[COT] Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
