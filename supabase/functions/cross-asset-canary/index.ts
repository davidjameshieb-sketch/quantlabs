// Cross-Asset Canary — Push alerts for regime-shift catalysts
// Monitors VIX, BTC, US10Y and fires alerts to canary_alerts table
// Sovereign loop subscribes via Supabase Realtime

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Thresholds ───
const CANARY_THRESHOLDS = {
  VIX_SPIKE: { threshold: 30, source: "vix", alertType: "VIX_SPIKE", severity: "critical" as const },
  VIX_ELEVATED: { threshold: 25, source: "vix", alertType: "VIX_ELEVATED", severity: "warning" as const },
  BTC_CRASH_5PCT: { threshold: -5, source: "btc", alertType: "BTC_CRASH", severity: "critical" as const },
  BTC_SURGE_5PCT: { threshold: 5, source: "btc", alertType: "BTC_SURGE", severity: "warning" as const },
  US10Y_SPIKE: { threshold: 0.10, source: "us10y", alertType: "YIELD_SPIKE", severity: "critical" as const },
  GOLD_SPIKE: { threshold: 2, source: "gold", alertType: "GOLD_SPIKE", severity: "warning" as const },
  SPY_DROP: { threshold: -2, source: "spy", alertType: "SPY_DROP", severity: "critical" as const },
};

interface CanaryResult {
  alertType: string;
  source: string;
  currentValue: number;
  threshold: number;
  severity: string;
  message: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const FINNHUB_KEY = Deno.env.get("FINNHUB_API_KEY");
  const ALPHA_VANTAGE_KEY = Deno.env.get("ALPHA_VANTAGE_API_KEY");

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const alerts: CanaryResult[] = [];

  try {
    // ─── 1. VIX (via Yahoo Finance proxy or Finnhub) ───
    let vixValue: number | null = null;
    try {
      if (FINNHUB_KEY) {
        const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=VIX&token=${FINNHUB_KEY}`);
        if (res.ok) {
          const data = await res.json();
          vixValue = data.c || null; // current price
        }
      }
      if (!vixValue) {
        // Fallback: try Yahoo
        const res = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1d");
        if (res.ok) {
          const data = await res.json();
          const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
          if (closes?.length) vixValue = closes[closes.length - 1];
        }
      }
    } catch (e) {
      console.warn(`[CANARY] VIX fetch failed: ${(e as Error).message}`);
    }

    if (vixValue != null) {
      if (vixValue >= CANARY_THRESHOLDS.VIX_SPIKE.threshold) {
        alerts.push({
          alertType: "VIX_SPIKE", source: "vix", currentValue: vixValue,
          threshold: CANARY_THRESHOLDS.VIX_SPIKE.threshold, severity: "critical",
          message: `🚨 VIX SPIKE: ${vixValue.toFixed(1)} ≥ ${CANARY_THRESHOLDS.VIX_SPIKE.threshold} — EXTREME FEAR. Favor JPY/CHF, reduce FX sizing.`,
        });
      } else if (vixValue >= CANARY_THRESHOLDS.VIX_ELEVATED.threshold) {
        alerts.push({
          alertType: "VIX_ELEVATED", source: "vix", currentValue: vixValue,
          threshold: CANARY_THRESHOLDS.VIX_ELEVATED.threshold, severity: "warning",
          message: `⚠️ VIX elevated: ${vixValue.toFixed(1)} ≥ ${CANARY_THRESHOLDS.VIX_ELEVATED.threshold} — risk-off conditions building.`,
        });
      }
      console.log(`[CANARY] VIX: ${vixValue.toFixed(1)}`);
    }

    // ─── 2. BTC 1h change (via CoinGecko) ───
    let btcChange1h: number | null = null;
    try {
      const res = await fetch("https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false");
      if (res.ok) {
        const data = await res.json();
        btcChange1h = data?.market_data?.price_change_percentage_1h_in_currency?.usd ?? null;
      }
    } catch (e) {
      console.warn(`[CANARY] BTC fetch failed: ${(e as Error).message}`);
    }

    if (btcChange1h != null) {
      if (btcChange1h <= CANARY_THRESHOLDS.BTC_CRASH_5PCT.threshold) {
        alerts.push({
          alertType: "BTC_CRASH", source: "btc", currentValue: btcChange1h,
          threshold: CANARY_THRESHOLDS.BTC_CRASH_5PCT.threshold, severity: "critical",
          message: `🚨 BTC CRASH: ${btcChange1h.toFixed(1)}% in 1h — risk-off cascade likely. Reduce all FX sizing, favor safe havens.`,
        });
      } else if (btcChange1h >= CANARY_THRESHOLDS.BTC_SURGE_5PCT.threshold) {
        alerts.push({
          alertType: "BTC_SURGE", source: "btc", currentValue: btcChange1h,
          threshold: CANARY_THRESHOLDS.BTC_SURGE_5PCT.threshold, severity: "warning",
          message: `📈 BTC SURGE: +${btcChange1h.toFixed(1)}% in 1h — strong risk-on. Favor AUD/NZD/CAD.`,
        });
      }
      console.log(`[CANARY] BTC 1h: ${btcChange1h.toFixed(2)}%`);
    }

    // ─── 3. US 10Y Yield (via FRED or Alpha Vantage) ───
    let yieldChange: number | null = null;
    try {
      if (ALPHA_VANTAGE_KEY) {
        const res = await fetch(`https://www.alphavantage.co/query?function=TREASURY_YIELD&interval=daily&maturity=10year&apikey=${ALPHA_VANTAGE_KEY}`);
        if (res.ok) {
          const data = await res.json();
          const yields = data?.data;
          if (yields?.length >= 2) {
            const current = parseFloat(yields[0].value);
            const prev = parseFloat(yields[1].value);
            yieldChange = current - prev; // in percentage points (0.10 = 10bps)
            if (Math.abs(yieldChange) >= CANARY_THRESHOLDS.US10Y_SPIKE.threshold) {
              alerts.push({
                alertType: "YIELD_SPIKE", source: "us10y", currentValue: yieldChange * 100,
                threshold: CANARY_THRESHOLDS.US10Y_SPIKE.threshold * 100, severity: "critical",
                message: `🚨 US10Y YIELD ${yieldChange > 0 ? "SPIKE" : "PLUNGE"}: ${(yieldChange * 100).toFixed(0)}bps move — regime shift catalyst. ${yieldChange > 0 ? "USD bullish, JPY/gold risk" : "USD bearish, JPY/gold bullish"}.`,
              });
            }
            console.log(`[CANARY] US10Y: ${(yieldChange * 100).toFixed(1)}bps change`);
          }
        }
      }
    } catch (e) {
      console.warn(`[CANARY] US10Y fetch failed: ${(e as Error).message}`);
    }

    // ─── 4. SPY (via Yahoo) ───
    let spyChange: number | null = null;
    try {
      const res = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1h&range=1d");
      if (res.ok) {
        const data = await res.json();
        const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((c: number | null) => c != null);
        if (closes?.length >= 2) {
          const prev = closes[closes.length - 2];
          const curr = closes[closes.length - 1];
          spyChange = ((curr - prev) / prev) * 100;
          if (spyChange <= CANARY_THRESHOLDS.SPY_DROP.threshold) {
            alerts.push({
              alertType: "SPY_DROP", source: "spy", currentValue: spyChange,
              threshold: CANARY_THRESHOLDS.SPY_DROP.threshold, severity: "critical",
              message: `🚨 SPY DROP: ${spyChange.toFixed(1)}% in 1h — equity selloff. Risk-off for FX.`,
            });
          }
          console.log(`[CANARY] SPY 1h: ${spyChange.toFixed(2)}%`);
        }
      }
    } catch (e) {
      console.warn(`[CANARY] SPY fetch failed: ${(e as Error).message}`);
    }

    // ─── 5. Gold (via Yahoo) ───
    let goldChange: number | null = null;
    try {
      const res = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/GLD?interval=1h&range=1d");
      if (res.ok) {
        const data = await res.json();
        const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((c: number | null) => c != null);
        if (closes?.length >= 2) {
          const prev = closes[closes.length - 2];
          const curr = closes[closes.length - 1];
          goldChange = ((curr - prev) / prev) * 100;
          if (goldChange >= CANARY_THRESHOLDS.GOLD_SPIKE.threshold) {
            alerts.push({
              alertType: "GOLD_SPIKE", source: "gold", currentValue: goldChange,
              threshold: CANARY_THRESHOLDS.GOLD_SPIKE.threshold, severity: "warning",
              message: `📈 GOLD SPIKE: +${goldChange.toFixed(1)}% in 1h — safe haven flow. Favor JPY/CHF longs.`,
            });
          }
          console.log(`[CANARY] Gold 1h: ${goldChange.toFixed(2)}%`);
        }
      }
    } catch (e) {
      console.warn(`[CANARY] Gold fetch failed: ${(e as Error).message}`);
    }

    // ─── 6. Persist alerts to canary_alerts table (triggers Realtime) ───
    if (alerts.length > 0) {
      const rows = alerts.map(a => ({
        alert_type: a.alertType,
        source: a.source,
        current_value: a.currentValue,
        threshold: a.threshold,
        severity: a.severity,
        message: a.message,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      }));

      const { error } = await supabase.from("canary_alerts").insert(rows);
      if (error) console.error(`[CANARY] DB insert failed: ${error.message}`);
      else console.log(`[CANARY] 🚨 ${alerts.length} alerts persisted — Realtime will push to sovereign loop`);

      // Also write to sovereign_memory for the sovereign loop to pick up
      await supabase.from("sovereign_memory").upsert({
        memory_type: "canary_alert",
        memory_key: "latest_canary_scan",
        payload: {
          alerts,
          scannedAt: new Date().toISOString(),
          vix: vixValue,
          btc1h: btcChange1h,
          us10yBps: yieldChange != null ? yieldChange * 100 : null,
          spy1h: spyChange,
          gold1h: goldChange,
        },
        relevance_score: 1.0,
        created_by: "cross-asset-canary",
      }, { onConflict: "memory_type,memory_key" });
    } else {
      console.log(`[CANARY] ✅ All clear — no threshold breaches`);
      // Still persist scan result
      await supabase.from("sovereign_memory").upsert({
        memory_type: "canary_alert",
        memory_key: "latest_canary_scan",
        payload: {
          alerts: [],
          scannedAt: new Date().toISOString(),
          vix: vixValue,
          btc1h: btcChange1h,
          us10yBps: yieldChange != null ? yieldChange * 100 : null,
          spy1h: spyChange,
          gold1h: goldChange,
          status: "all_clear",
        },
        relevance_score: 0.5,
        created_by: "cross-asset-canary",
      }, { onConflict: "memory_type,memory_key" });
    }

    // ─── 7. Auto-promote shadow agents if criteria met ───
    try {
      const { data: shadows } = await supabase
        .from("agent_promotion_ledger")
        .select("*")
        .eq("tier", "B");

      if (shadows?.length) {
        for (const agent of shadows) {
          if (
            agent.total_trades >= 20 &&
            agent.win_rate > 55 &&
            agent.avg_r_ratio > 1.2
          ) {
            // Auto-promote!
            await supabase
              .from("agent_promotion_ledger")
              .update({
                tier: "A",
                sizing_multiplier: 1.0,
                promoted_at: new Date().toISOString(),
                promotion_reason: `Auto-promoted: ${agent.total_trades} trades, ${agent.win_rate.toFixed(1)}% WR, ${agent.avg_r_ratio.toFixed(2)} R-ratio`,
              })
              .eq("id", agent.id);

            console.log(`[CANARY] 🎯 SHADOW PROMOTED: ${agent.agent_id} → Tier A | ${agent.total_trades} trades, ${agent.win_rate.toFixed(1)}% WR`);

            // Persist promotion event
            await supabase.from("gate_bypasses").insert({
              gate_id: `AGENT_PROMOTED:${agent.agent_id}`,
              reason: `Shadow agent auto-promoted to live fleet: ${agent.total_trades} trades, ${agent.win_rate.toFixed(1)}% WR, ${agent.avg_r_ratio.toFixed(2)} avg R`,
              expires_at: new Date(Date.now() + 86400_000 * 30).toISOString(), // 30d record
              created_by: "canary-promoter",
            });
          }
        }
      }
    } catch (promoErr) {
      console.warn(`[CANARY] Promotion check failed: ${(promoErr as Error).message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        alertsTriggered: alerts.length,
        alerts,
        scan: {
          vix: vixValue,
          btc1hPct: btcChange1h,
          us10yBps: yieldChange != null ? +(yieldChange * 100).toFixed(1) : null,
          spy1hPct: spyChange,
          gold1hPct: goldChange,
        },
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[CANARY] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
