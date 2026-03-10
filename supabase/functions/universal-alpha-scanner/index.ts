const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KALSHI_API = "https://api.elections.kalshi.com/trade-api/v2";

// ─── Asset Class Categorization ─────────────────────────────────

const CATEGORY_MAP: Record<string, { class: string; icon: string }> = {
  NBA: { class: "Sports", icon: "🏀" }, WNBA: { class: "Sports", icon: "🏀" },
  NFL: { class: "Sports", icon: "🏈" }, CFB: { class: "Sports", icon: "🏈" },
  MLB: { class: "Sports", icon: "⚾" }, NHL: { class: "Sports", icon: "🏒" },
  NRL: { class: "Sports", icon: "🏉" }, RUGBY: { class: "Sports", icon: "🏉" },
  PGA: { class: "Sports", icon: "⛳" }, GOLF: { class: "Sports", icon: "⛳" },
  ATP: { class: "Sports", icon: "🎾" }, WTA: { class: "Sports", icon: "🎾" },
  F1: { class: "Sports", icon: "🏎️" }, NASCAR: { class: "Sports", icon: "🏎️" },
  MLS: { class: "Sports", icon: "⚽" }, EPL: { class: "Sports", icon: "⚽" },
  CONGRESS: { class: "Politics", icon: "🏛️" }, POTUS: { class: "Politics", icon: "🏛️" },
  SENATE: { class: "Politics", icon: "🏛️" }, HOUSE: { class: "Politics", icon: "🏛️" },
  ELECTION: { class: "Politics", icon: "🏛️" }, GOVERN: { class: "Politics", icon: "🏛️" },
  PARTY: { class: "Politics", icon: "🏛️" }, VOTE: { class: "Politics", icon: "🏛️" },
  TRUMP: { class: "Politics", icon: "🏛️" }, BIDEN: { class: "Politics", icon: "🏛️" },
  MENTION: { class: "Politics", icon: "🏛️" },
  FED: { class: "Economics", icon: "📈" }, RATE: { class: "Economics", icon: "📈" },
  CPI: { class: "Economics", icon: "📈" }, GDP: { class: "Economics", icon: "📈" },
  JOBS: { class: "Economics", icon: "📈" }, INFLATION: { class: "Economics", icon: "📈" },
  RECESSION: { class: "Economics", icon: "📈" }, TREASURY: { class: "Economics", icon: "📈" },
  SP500: { class: "Economics", icon: "📈" }, NASDAQ: { class: "Economics", icon: "📈" },
  BTC: { class: "Crypto", icon: "₿" }, BITCOIN: { class: "Crypto", icon: "₿" },
  ETH: { class: "Crypto", icon: "₿" }, ETHEREUM: { class: "Crypto", icon: "₿" },
  CRYPTO: { class: "Crypto", icon: "₿" },
  OSCAR: { class: "Culture", icon: "🎬" }, GRAMMY: { class: "Culture", icon: "🎬" },
  EMMY: { class: "Culture", icon: "🎬" }, GOLDEN: { class: "Culture", icon: "🎬" },
  MOVIE: { class: "Culture", icon: "🎬" }, AWARD: { class: "Culture", icon: "🎬" },
  TEMP: { class: "Climate", icon: "🌍" }, HURRICANE: { class: "Climate", icon: "🌍" },
  CLIMATE: { class: "Climate", icon: "🌍" }, WEATHER: { class: "Climate", icon: "🌍" },
};

// ─── Pre-Momentum Target Keywords ──────────────────────────────
const PRE_MOMENTUM_TARGETS = [
  "try scorer", "tryscorer", "try_scorer",
  "round 1 leader", "round leader", "r1 leader",
  "weekly mentions", "mention",
  "first goal", "anytime scorer", "anytime goal",
  "top 5", "top 10", "top 20",
  "winner",
];

// ─── High-Profile Event Keywords (the "Amazon" events) ─────────
// These are the events everyone watches but where underdogs get mispriced
const HIGH_PROFILE_KEYWORDS = [
  // Major sports finals / playoffs
  "championship", "playoff", "finals", "super bowl", "world series",
  "stanley cup", "march madness", "grand slam", "masters", "open",
  // Major politics
  "president", "election", "primary", "debate", "impeach", "senate race",
  "governor", "swing state",
  // Economics
  "fed rate", "cpi", "gdp", "recession", "jobs report", "unemployment",
  "inflation", "s&p 500", "nasdaq", "dow",
  // Crypto
  "bitcoin", "ethereum", "btc", "eth", "crypto",
  // Culture
  "oscar", "grammy", "emmy", "super bowl", "world cup",
  // Individual fame (big-name underdogs)
  "mvp", "rookie of the year", "scoring leader", "batting",
  "home run", "touchdown", "triple double",
];

interface ClassifiedMarket {
  ticker: string;
  event_ticker: string;
  series_ticker: string;
  title: string;
  event_title: string;
  asset_class: string;
  icon: string;
  yes_price: number;
  no_price: number;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  volume: number;
  volume_24h: number;
  open_interest: number;
  close_time: string;
  subtitle: string;
  alpha_type: string | null;
  alpha_signal: string | null;
  alpha_score: number;
  alpha_reasoning: string | null;
  alpha_strategy: string | null;
  alpha_tier: string | null;
  suggested_bet: number;
  time_to_event_hours: number | null;
  recovery_tag: string | null;
}

function classifyAssetClass(ticker: string, title: string, category: string): { class: string; icon: string } {
  const combined = `${ticker} ${title} ${category}`.toUpperCase();
  for (const [key, val] of Object.entries(CATEGORY_MAP)) {
    if (combined.includes(key)) return val;
  }
  if (category.toUpperCase().includes("SPORT")) return { class: "Sports", icon: "🏆" };
  if (category.toUpperCase().includes("POLITIC")) return { class: "Politics", icon: "🏛️" };
  if (category.toUpperCase().includes("ECON") || category.toUpperCase().includes("FINANC")) return { class: "Economics", icon: "📈" };
  return { class: "Other", icon: "📊" };
}

// ─── Time to Event ──────────────────────────────────────────────

function hoursUntilClose(closeTime: string | null): number | null {
  if (!closeTime) return null;
  const diff = new Date(closeTime).getTime() - Date.now();
  if (diff <= 0) return 0;
  return +(diff / 3600000).toFixed(1);
}

// ─── Early-Entry Sniper Engine ──────────────────────────────────

interface EdgeResult {
  type: string;
  signal: string;
  score: number;
  reasoning: string;
  strategy: string;
  tier: string | null;
  recovery_tag: string | null;
}

function isPreMomentumTarget(title: string): boolean {
  const lower = title.toLowerCase();
  return PRE_MOMENTUM_TARGETS.some(t => lower.includes(t));
}

function detectEdge(m: any, yesPrice: number, noPrice: number, vol24h: number, oi: number, assetClass: string, hoursLeft: number | null): EdgeResult {
  const yesBid = (m.yes_bid || 0) / 100;
  const yesAsk = (m.yes_ask || 0) / 100;
  const noBid = (m.no_bid || 0) / 100;
  const noAsk = (m.no_ask || 0) / 100;
  const spread = yesAsk > 0 && yesBid > 0 ? yesAsk - yesBid : 0;
  const maxROI = yesPrice > 0 ? (1 / yesPrice - 1) : 0;
  const priceCents = Math.round(yesPrice * 100);
  const title = (m.title || m.subtitle || "").toLowerCase();

  // Helper: is this a high-profile event where underdogs get mispriced?
  const isHighProfile = HIGH_PROFILE_KEYWORDS.some(k => title.includes(k) || (m.event_title || "").toLowerCase().includes(k));
  const eventTitle = (m.event_title || "").toLowerCase();

  // ══════════════════════════════════════════════════════════════
  // RULE 0: "PENNY AMAZON" — The Crown Jewel
  // Cheap (≤10¢) + MUST have liquidity or proximity + high-profile = hidden gem
  // Hard filters: must be ≤7 days out AND have real orderbook activity
  // ══════════════════════════════════════════════════════════════
  if (yesPrice > 0.005 && yesPrice <= 0.10) {
    const roi = Math.round(maxROI * 100);
    const hasLife = oi > 0 || vol24h > 0;
    const hasConviction = oi > 20 || vol24h > 10;
    const hasSmartMoney = oi > 100 && vol24h < 500;
    const within72h = hoursLeft !== null && hoursLeft > 0 && hoursLeft <= 72;
    const within7d = hoursLeft !== null && hoursLeft > 0 && hoursLeft <= 168;
    const isTarget = isPreMomentumTarget(title);

    // HARD GATE: must be within 7 days AND have some sign of life (OI or volume)
    // OR be a high-profile event within 72h
    const passesGate = (within7d && hasLife) || (within72h && isHighProfile) || (within72h && isTarget);

    if (passesGate) {
      // Penny Amazon Score
      let gemScore = 0.20;
      if (yesPrice <= 0.05) gemScore += 0.1;
      if (yesPrice <= 0.03) gemScore += 0.05;
      if (isHighProfile) gemScore += 0.2;
      if (hasSmartMoney) gemScore += 0.2;
      if (hasConviction) gemScore += 0.1;
      else if (hasLife) gemScore += 0.05;
      if (isTarget) gemScore += 0.1;
      if (within72h) gemScore += 0.15; // proximity bonus
      else if (within7d) gemScore += 0.05;
      if (oi > 200) gemScore += 0.05;
      if (vol24h > 0 && vol24h < 100) gemScore += 0.05;
      gemScore = Math.min(0.99, gemScore);

      if (gemScore >= 0.25) {
      const amazonTag = gemScore >= 0.5 ? "🏆 HIDDEN GEM" : gemScore >= 0.35 ? "💎 PENNY ALPHA" : "🌱 SEEDLING";

      // Build a specific investment thesis — WHY this is worth buying
      const reasons: string[] = [];
      
      // 1. The math case
      reasons.push(`At ${priceCents}¢, you risk $1 to make $${(maxROI + 1).toFixed(0)}. You only need to win 1 in ${Math.round(1/yesPrice)} for this bet to be profitable.`);
      
      // 2. The positioning case
      if (hasSmartMoney) {
        reasons.push(`${oi} contracts are already held but only ${vol24h} traded recently — that's "ghost volume." Someone with conviction bought and is holding. Retail hasn't noticed yet.`);
      } else if (oi > 0) {
        reasons.push(`${oi} open interest means real money is already committed at this level. These aren't empty markets.`);
      }
      if (vol24h > 0 && vol24h < 200) {
        reasons.push(`Only ${vol24h} traded today — this is pre-discovery phase. When volume arrives, the price gaps up.`);
      }
      
      // 3. The event case
      if (isHighProfile) {
        reasons.push(`This is on a HIGH-PROFILE event where the public overreacts to favorites. Underdogs consistently get mispriced on big stages.`);
      }
      
      // 4. The timing case
      if (hoursLeft !== null && hoursLeft > 0) {
        if (hoursLeft <= 24) {
          reasons.push(`Event is ${hoursLeft.toFixed(0)}h away — last chance for early entry before the final price run.`);
        } else if (hoursLeft <= 72) {
          reasons.push(`${hoursLeft.toFixed(0)}h to event — sweet spot for entry. Early enough to capture the full move, close enough that catalysts are forming.`);
        } else {
          reasons.push(`${Math.round(hoursLeft / 24)}d out — maximum early-mover advantage. Price will re-rate as the event approaches.`);
        }
      }

      // 5. The asymmetry case
      if (yesPrice <= 0.03) {
        reasons.push(`Sub-3¢ means the market thinks this is "impossible." But binary events have fat tails — the market systematically underprices 2-5% probability outcomes.`);
      } else if (yesPrice <= 0.07) {
        reasons.push(`Sub-7¢ territory — these contracts regularly 3-5x when any positive news hits. One headline shifts this.`);
      }

      // 6. The target-specific case
      if (isTarget) {
        reasons.push(`This is a high-value target category (scorer props, round leaders, weekly mentions) where pricing lags behind actual probability.`);
      }

      // 7. Fallback — if no specific signals, the pure math is the thesis
      if (reasons.length <= 1) {
        reasons.push(`The market prices this at ${priceCents}% probability. Binary markets systematically misprice tail events — real probability is often 2-3x what the market implies at these levels.`);
      }

      const thesis = reasons.join(" ");

      return {
        type: "PENNY_AMAZON",
        signal: "ASYMMETRIC_BET",
        score: +gemScore.toFixed(3),
        reasoning: `${amazonTag}: ${thesis}`,
        strategy: `$1-3 LIMIT at ${priceCents}¢. NEVER market buy. ${roi >= 1000 ? `This is a ${Math.round(roi/100)}x bagger if it hits.` : `${roi}% return on a $1 bet.`}`,
        tier: "ACCELERATOR",
        recovery_tag: "ACCELERATOR",
      };
    }
  }

  // ══════════════════════════════════════════════════════════════
  // RULE 1: PRE-MOMENTUM LOTTO SNIPER (Ghost Volume + Cheap = Gold)
  // OI > 50 with low volume = positioning before retail arrives
  // Under 15¢ = lotto territory with massive ROI
  // ══════════════════════════════════════════════════════════════
  
  // 1A: PRE-MOMENTUM LOTTO — Ghost volume on cheap contracts (the sweet spot)
  if (vol24h < 1000 && oi > 50 && yesPrice > 0.10 && yesPrice <= 0.20) {
    const isTarget = isPreMomentumTarget(title);
    const oiVolRatio = oi / Math.max(vol24h, 1);
    const oiBonus = oi > 200 ? 0.25 : oi > 100 ? 0.15 : 0.05;
    const score = Math.min(0.99, 0.3 + oiBonus + (isTarget ? 0.2 : 0) + (oiVolRatio > 5 ? 0.15 : 0) + (isHighProfile ? 0.15 : 0));
    const earlyHours = hoursLeft !== null && hoursLeft >= 12 && hoursLeft <= 96;
    const finalScore = earlyHours ? Math.min(0.99, score + 0.1) : score;
    const roi = Math.round(maxROI * 100);

    return {
      type: "PRE_MOMENTUM_LOTTO",
      signal: "LOTTO_SNIPE",
      score: +finalScore.toFixed(3),
      reasoning: `🔮 PRE-MOMENTUM: ${priceCents}¢ with ${oi} OI / ${vol24h} vol. ${roi}% ROI. ${isHighProfile ? "🔥 Big event." : ""} ${earlyHours ? `⏰ ${hoursLeft?.toFixed(0)}h out.` : ""}`,
      strategy: `$1-3 LIMIT at ${priceCents}¢. ${oi} positioned, ${vol24h} traded. ${roi}% if it hits.`,
      tier: "ACCELERATOR",
      recovery_tag: "ACCELERATOR",
    };
  }

  // 1B: GHOST VOLUME on mid-priced contracts (20-85¢)
  if (vol24h < 1000 && oi > 100 && yesPrice > 0.20 && yesPrice < 0.85) {
    const isTarget = isPreMomentumTarget(title);
    const oiVolRatio = oi / Math.max(vol24h, 1);
    const score = Math.min(0.85, 0.3 + (oiVolRatio > 10 ? 0.25 : oiVolRatio * 0.025) + (isTarget ? 0.15 : 0));
    const earlyHours = hoursLeft !== null && hoursLeft >= 24 && hoursLeft <= 72;
    const finalScore = earlyHours ? Math.min(0.95, score + 0.1) : score;

    return {
      type: "GHOST_VOLUME",
      signal: "PRE_MOMENTUM_SNIPE",
      score: +finalScore.toFixed(3),
      reasoning: `👻 Ghost Volume: ${oi} OI / ${vol24h} vol. ${isTarget ? "TARGET." : ""} ${earlyHours ? `⏰ ${hoursLeft?.toFixed(0)}h.` : ""}`,
      strategy: `LIMIT at ${priceCents}¢. ${oi} contracts held, retail not in yet.`,
      tier: maxROI > 5 ? "ACCELERATOR" : "EARLY_ENTRY",
      recovery_tag: maxROI > 5 ? "ACCELERATOR" : null,
    };
  }

  // ══════════════════════════════════════════════════════════════
  // RULE 2: BINARY CLIFF KILL-SWITCH (Capital Protection)
  // 85¢+ in final phase = TAKE PROFIT NOW
  // ══════════════════════════════════════════════════════════════
  if (yesPrice >= 0.85 && hoursLeft !== null && hoursLeft <= 4) {
    const profitPct = Math.round((yesPrice - 0.10) / 0.10 * 100); // assuming ~10¢ entry
    return {
      type: "BINARY_CLIFF",
      signal: "IMMEDIATE_LIQUIDATION",
      score: 0.01,
      reasoning: `🚨 BINARY CLIFF: ${priceCents}¢ with only ${hoursLeft.toFixed(1)}h left. You've captured the move. Take 75% off now — the remaining 15¢ upside isn't worth the Black Swan risk.`,
      strategy: `SELL 75% NOW: Lock in your ${profitPct > 0 ? `~${profitPct}%` : ""} gain. Leave 25% as a free-roll. At 85¢+ in the final phase, the risk/reward has flipped against you.`,
      tier: "FLOOR_DEFENSE",
      recovery_tag: "FLOOR_DEFENSE",
    };
  }

  // ══════════════════════════════════════════════════════════════
  // RULE 3: EXPANDED LOTTO TIER (1-15¢ with Alpha > 0.25)
  // Wider net, lower threshold — we want to see more lottos
  // ══════════════════════════════════════════════════════════════
  if (yesPrice > 0 && yesPrice <= 0.15) {
    const roi = Math.round(maxROI * 100);
    const lottoAlpha = Math.min(1, 
      (oi > 20 ? 0.15 : 0) + 
      (oi > 100 ? 0.15 : 0) +
      (vol24h > 5 ? 0.1 : 0) + 
      (vol24h > 50 ? 0.1 : 0) +
      (isPreMomentumTarget(title) ? 0.2 : 0) + 
      (spread < 0.05 ? 0.05 : 0) +
      (yesPrice <= 0.07 ? 0.1 : 0) + // cheaper = more asymmetric
      (hoursLeft !== null && hoursLeft >= 12 && hoursLeft <= 72 ? 0.1 : 0) // timing bonus
    );

    if (lottoAlpha >= 0.25) {
      return {
        type: "ASYMMETRIC_LOTTO",
        signal: "LOTTO_LIMIT_ONLY",
        score: +lottoAlpha.toFixed(3),
        reasoning: `🎰 LOTTO: ${priceCents}¢ = ${roi}% ROI. Alpha: ${(lottoAlpha * 100).toFixed(0)}%. ${oi > 0 ? `${oi} OI.` : ""} ${vol24h > 0 ? `${vol24h} vol.` : ""} Win 1 in ${Math.round(1/yesPrice)} to break even.`,
        strategy: `$1-2.50 LIMIT at ${priceCents}¢. ${roi}% payout. NEVER market buy.`,
        tier: roi > 500 ? "ACCELERATOR" : "LOTTO",
        recovery_tag: roi > 500 ? "ACCELERATOR" : null,
      };
    }

    // Low-alpha but still show if any activity
    if (oi > 0 || vol24h > 0) {
      return {
        type: "LOW_ALPHA_LOTTO",
        signal: "SPECULATIVE_LOTTO",
        score: +lottoAlpha.toFixed(3),
        reasoning: `${priceCents}¢ — ${roi}% ROI. Alpha ${(lottoAlpha * 100).toFixed(0)}% (below 25%). ${oi > 0 ? `${oi} OI.` : ""}`,
        strategy: `SKIP or $1 max at ${priceCents}¢. Low conviction.`,
        tier: "LOTTO",
        recovery_tag: null,
      };
    }
  }

  // ══════════════════════════════════════════════════════════════
  // RULE 4: REVENGE RECOVERY MULTIPLIER (ROI > 500% = ACCELERATOR)
  // ══════════════════════════════════════════════════════════════
  // This is applied as a tag overlay — check maxROI for any non-dead market

  // ── SPREAD ARBITRAGE ──
  if (yesAsk > 0 && noAsk > 0 && (yesAsk + noAsk) < 0.95) {
    const arb = 1 - (yesAsk + noAsk);
    const score = Math.min(1, arb * 5);
    return {
      type: "SPREAD_ARB",
      signal: "BUY_BOTH",
      score: +score.toFixed(3),
      reasoning: `💰 GUARANTEED PROFIT: Yes ${Math.round(yesAsk * 100)}¢ + No ${Math.round(noAsk * 100)}¢ = ${Math.round((yesAsk + noAsk) * 100)}¢. Buy both for ${Math.round(arb * 100)}¢ risk-free.`,
      strategy: "ARBITRAGE: Buy Yes AND No. Combined cost < $1 payout. Guaranteed profit no matter who wins.",
      tier: "ACCELERATOR",
      recovery_tag: "ACCELERATOR",
    };
  }

  // ── WIDE SPREAD SNIPE ──
  if (spread >= 0.08 && yesPrice >= 0.05 && yesPrice <= 0.90) {
    const mid = (yesBid + yesAsk) / 2;
    const edgeCents = Math.round(spread * 50);
    const score = Math.min(0.8, spread * 3);
    return {
      type: "WIDE_SPREAD",
      signal: "LIMIT_SNIPE",
      score: +score.toFixed(3),
      reasoning: `🎯 Bid ${Math.round(yesBid * 100)}¢ / Ask ${Math.round(yesAsk * 100)}¢ — ${Math.round(spread * 100)}¢ spread. Midpoint limit = ~${edgeCents}¢ instant edge.`,
      strategy: `LIMIT ORDER at ${Math.round(mid * 100)}¢. Don't market buy. ${edgeCents}¢ edge vs ask.`,
      tier: maxROI > 5 ? "ACCELERATOR" : null,
      recovery_tag: maxROI > 5 ? "ACCELERATOR" : null,
    };
  }

  // ── MICRO VALUE (8-15¢) ──
  if (yesPrice > 0.07 && yesPrice < 0.15 && (vol24h > 0 || oi > 5)) {
    const roi = Math.round(maxROI * 100);
    const score = Math.min(1, (0.15 - yesPrice) / 0.15 * 0.6 + Math.min(vol24h, 200) / 500);
    return {
      type: "MICRO_VALUE",
      signal: "LOTTO_BUY",
      score: +score.toFixed(3),
      reasoning: `${priceCents}¢ — ${roi}% ROI. ${vol24h > 0 ? `${vol24h} traded today.` : `${oi} OI.`}`,
      strategy: `Risk $1-2 for up to $${(maxROI + 1).toFixed(0)} payout. Limit order only.`,
      tier: roi > 500 ? "ACCELERATOR" : "VALUE",
      recovery_tag: roi > 500 ? "ACCELERATOR" : null,
    };
  }

  // ── VALUE ZONE (15-40¢) ──
  if (yesPrice >= 0.15 && yesPrice < 0.40 && (vol24h > 10 || oi > 20)) {
    const roi = Math.round(maxROI * 100);
    const score = Math.min(0.7, (0.40 - yesPrice) / 0.25 * 0.4 + Math.min(vol24h, 300) / 800);
    return {
      type: "VALUE_ZONE",
      signal: "ANCHOR_BUY",
      score: +score.toFixed(3),
      reasoning: `${priceCents}¢ with ${vol24h > 0 ? `${vol24h} vol` : `${oi} OI`} — ${roi}% max ROI.`,
      strategy: `VALUE BET: Risk $2-5. Market says ${priceCents}% but activity says higher.`,
      tier: roi > 500 ? "ACCELERATOR" : "VALUE",
      recovery_tag: roi > 500 ? "ACCELERATOR" : null,
    };
  }

  // ── VOLUME SPIKE ──
  if (vol24h > 50 && m.volume > 0) {
    const avgDaily = Math.max(m.volume / 30, 1);
    const ratio = vol24h / avgDaily;
    if (ratio > 2 && yesPrice >= 0.05 && yesPrice <= 0.90) {
      const score = Math.min(0.7, (ratio - 2) * 0.15);
      return {
        type: "VOLUME_SPIKE",
        signal: "MOMENTUM_ENTRY",
        score: +score.toFixed(3),
        reasoning: `📊 ${ratio.toFixed(1)}x normal volume at ${priceCents}¢. Someone knows something.`,
        strategy: `FOLLOW THE MONEY: Smart money loading up. Get in before the crowd.`,
        tier: maxROI > 5 ? "ACCELERATOR" : null,
        recovery_tag: maxROI > 5 ? "ACCELERATOR" : null,
      };
    }
  }

  // ── COIN FLIP (40-60¢) ──
  if (yesPrice >= 0.40 && yesPrice <= 0.60) {
    return {
      type: "COIN_FLIP",
      signal: "NEUTRAL",
      score: vol24h > 50 ? 0.1 : 0.03,
      reasoning: `${priceCents}¢ — coin flip. ${vol24h > 50 ? `Active (${vol24h} vol).` : "Low activity."}`,
      strategy: `50/50: Only play with an edge the market doesn't see.`,
      tier: null,
      recovery_tag: null,
    };
  }

  // ── FAVORITE (60-85¢) ──
  if (yesPrice > 0.60 && yesPrice <= 0.85) {
    const roi = Math.round(maxROI * 100);
    return {
      type: "FAVORITE",
      signal: "LOW_UPSIDE",
      score: vol24h > 100 ? 0.05 : 0.02,
      reasoning: `${priceCents}¢ — probably wins, ${roi}% return. ${vol24h > 0 ? `${vol24h} vol.` : ""}`,
      strategy: `SAFE BET: Only ${roi}¢/dollar. Better as a parlay leg.`,
      tier: null,
      recovery_tag: null,
    };
  }

  // ── HEAVY FAVORITE (85-95¢) — FLOOR DEFENSE ──
  if (yesPrice > 0.85 && yesPrice <= 0.95) {
    const roi = Math.round(maxROI * 100);
    return {
      type: "HEAVY_FAVORITE",
      signal: "MINIMAL_EDGE",
      score: 0.01,
      reasoning: `${priceCents}¢ — near certain. Only ${roi}% return.`,
      strategy: `CASH EQUIVALENT: ${roi}% return. Only for large positions.`,
      tier: "FLOOR_DEFENSE",
      recovery_tag: "FLOOR_DEFENSE",
    };
  }

  // ── MATHEMATICAL DEATH (≤2¢) ──
  if (yesPrice > 0 && yesPrice <= 0.02 && oi > 0) {
    return {
      type: "MATHEMATICAL_DEATH",
      signal: "INSTANT_LIQUIDATION",
      score: 0,
      reasoning: `${priceCents}¢ with ${oi} OI — 0% probability. Sell to recover capital.`,
      strategy: "LIQUIDATE: Dead position. Sell at any price.",
      tier: null,
      recovery_tag: null,
    };
  }

  // ── SETTLED / DEAD ──
  if (yesPrice > 0.95) {
    return { type: "SETTLED", signal: "NO_EDGE", score: 0, reasoning: `${priceCents}¢ — done.`, strategy: "NO TRADE.", tier: "FLOOR_DEFENSE", recovery_tag: "FLOOR_DEFENSE" };
  }
  if (yesPrice <= 0) {
    return { type: "DEAD", signal: "NO_EDGE", score: 0, reasoning: "0¢ — dead.", strategy: "NO TRADE.", tier: null, recovery_tag: null };
  }

  return {
    type: "LOW_LIQUIDITY",
    signal: "SPECULATIVE",
    score: 0.02,
    reasoning: `${priceCents}¢ — low liquidity.`,
    strategy: `SPECULATIVE: Hard to trade. Only enter with strong conviction.`,
    tier: null,
    recovery_tag: maxROI > 5 ? "ACCELERATOR" : null,
  };
}

// ─── Bet Sizing ─────────────────────────────────────────────────

function computeBetSize(alphaScore: number, confidence: number, tier: string | null): number {
  if (tier === "ACCELERATOR") {
    // Recovery mode: slightly larger bets on high-conviction lottos
    const base = alphaScore >= 0.5 ? 5.00 : alphaScore >= 0.3 ? 3.50 : 2.50;
    return Math.min(5.00, +(base * Math.min(confidence / 10, 1)).toFixed(2));
  }
  const base = alphaScore >= 0.5 ? 5.00 : alphaScore >= 0.3 ? 3.00 : alphaScore >= 0.15 ? 2.00 : alphaScore >= 0.05 ? 1.00 : 0;
  return Math.min(5.00, +(base * Math.min(confidence / 10, 1)).toFixed(2));
}

function extractSeriesTicker(eventTicker: string): string {
  if (!eventTicker) return "";
  const match = eventTicker.match(/^([A-Z0-9]+)-\d{2}[A-Z]{3}\d{2}/);
  if (match) return match[1];
  const parts = eventTicker.split("-");
  return parts[0] || eventTicker;
}

// ─── Paginated Fetchers (rate-limit safe) ───────────────────────

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function fetchAllEvents(): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | null = null;
  const maxPages = 3; // keep small to avoid 429
  for (let page = 0; page < maxPages; page++) {
    if (page > 0) await delay(350); // throttle between pages
    const params = new URLSearchParams({ limit: "200", status: "open" });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`${KALSHI_API}/events?${params}`, { headers: { Accept: "application/json" } });
    if (res.status === 429) { console.warn(`Events 429 on page ${page}, stopping`); break; }
    if (!res.ok) throw new Error(`Kalshi events: ${res.status}`);
    const data = await res.json();
    const events = data.events || [];
    all.push(...events);
    cursor = data.cursor || null;
    if (!cursor || events.length < 200) break;
  }
  return all;
}

async function fetchAllMarkets(): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | null = null;
  const maxPages = 5; // cap at ~1000 markets
  for (let page = 0; page < maxPages; page++) {
    if (page > 0) await delay(350);
    const params = new URLSearchParams({ limit: "200", status: "open" });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`${KALSHI_API}/markets?${params}`, { headers: { Accept: "application/json" } });
    if (res.status === 429) { console.warn(`Markets 429 on page ${page}, stopping`); break; }
    if (!res.ok) throw new Error(`Kalshi markets: ${res.status}`);
    const data = await res.json();
    const markets = data.markets || [];
    all.push(...markets);
    cursor = data.cursor || null;
    if (!cursor || markets.length < 200) break;
  }
  return all;
}

// ─── Main ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const filterClass = body.asset_class || null;
    const confidence = Math.max(1, Math.min(10, body.confidence || 5));
    const dailyBudget = body.daily_budget || 25.00;
    const recoveryGoal = body.recovery_goal || 130.00;

    // Fetch events first, then markets (sequential to avoid 429)
    const events = await fetchAllEvents();
    await delay(500); // breathing room between endpoints
    const markets = await fetchAllMarkets();

    console.log(`Fetched ${events.length} events, ${markets.length} markets`);

    const eventMap = new Map<string, any>();
    for (const e of events) eventMap.set(e.event_ticker, e);

    const classified: ClassifiedMarket[] = markets.map((m: any) => {
      const event = eventMap.get(m.event_ticker) || {};
      const { class: assetClass, icon } = classifyAssetClass(
        m.ticker || "",
        (m.title || "") + " " + (event.title || ""),
        event.category || ""
      );

      const yesPrice = (m.yes_ask || m.last_price || 0) / 100;
      const noPrice = (m.no_ask || (100 - (m.last_price || 50))) / 100;
      const vol24h = m.volume_24h || 0;
      const oi = m.open_interest || 0;
      const closeTime = m.close_time || m.expiration_time || null;
      const hoursLeft = hoursUntilClose(closeTime);

      const edge = detectEdge(m, yesPrice, noPrice, vol24h, oi, assetClass, hoursLeft);

      return {
        ticker: m.ticker,
        event_ticker: m.event_ticker,
        series_ticker: event.series_ticker || m.series_ticker || extractSeriesTicker(m.event_ticker || m.ticker),
        title: m.title || m.subtitle || m.ticker,
        event_title: event.title || "",
        asset_class: assetClass,
        icon,
        yes_price: yesPrice,
        no_price: noPrice,
        yes_bid: (m.yes_bid || 0) / 100,
        yes_ask: (m.yes_ask || 0) / 100,
        no_bid: (m.no_bid || 0) / 100,
        no_ask: (m.no_ask || 0) / 100,
        last_price: (m.last_price || 0) / 100,
        volume: m.volume || 0,
        volume_24h: vol24h,
        open_interest: oi,
        close_time: closeTime,
        subtitle: m.subtitle || "",
        alpha_type: edge.type,
        alpha_signal: edge.signal,
        alpha_score: edge.score,
        alpha_reasoning: edge.reasoning,
        alpha_strategy: edge.strategy,
        alpha_tier: edge.tier,
        suggested_bet: computeBetSize(edge.score, confidence, edge.tier),
        time_to_event_hours: hoursLeft,
        recovery_tag: edge.recovery_tag,
      };
    });

    let filtered = classified;
    if (filterClass && filterClass !== "All") {
      filtered = classified.filter(m => m.asset_class === filterClass);
    }

    // Sort: PENNY_AMAZON first, then lotto plays, then ghost volume
    const typePriority = (m: ClassifiedMarket) => {
      if (m.alpha_type === "PENNY_AMAZON") return 300;
      if (m.alpha_type === "PRE_MOMENTUM_LOTTO") return 200;
      if (m.alpha_type === "ASYMMETRIC_LOTTO") return 150;
      if (m.alpha_type === "GHOST_VOLUME") return 100;
      if (m.alpha_type === "SPREAD_ARB") return 90;
      if (m.recovery_tag === "ACCELERATOR") return 50;
      if (m.alpha_type === "MICRO_VALUE") return 40;
      return 0;
    };
    filtered.sort((a, b) => {
      const pDiff = typePriority(b) - typePriority(a);
      if (pDiff !== 0) return pDiff;
      return (b.alpha_score - a.alpha_score) || (b.volume_24h - a.volume_24h);
    });

    // Build heatmap
    const heatmap = new Map<string, { count: number; volume: number; totalAlpha: number; topSignal: string | null; icon: string }>();
    for (const m of classified) {
      const h = heatmap.get(m.asset_class) || { count: 0, volume: 0, totalAlpha: 0, topSignal: null, icon: m.icon };
      h.count++;
      h.volume += m.volume_24h;
      h.totalAlpha += m.alpha_score;
      if (!h.topSignal && m.alpha_signal) h.topSignal = m.alpha_signal;
      heatmap.set(m.asset_class, h);
    }
    const heatmapArr = Array.from(heatmap.entries()).map(([cls, d]) => ({
      asset_class: cls,
      icon: d.icon,
      count: d.count,
      volume: d.volume,
      avg_alpha: d.count > 0 ? +(d.totalAlpha / d.count).toFixed(4) : 0,
      top_signal: d.topSignal,
    })).sort((a, b) => b.avg_alpha - a.avg_alpha);

    // Edge alerts — top opportunities prioritizing pre-momentum
    const alerts = classified
      .filter(m => m.alpha_score > 0.05 || m.alpha_type === "GHOST_VOLUME" || m.alpha_type === "BINARY_CLIFF")
      .sort((a, b) => {
        const aPrio = a.alpha_type === "GHOST_VOLUME" ? 100 : a.alpha_type === "BINARY_CLIFF" ? 90 : a.recovery_tag === "ACCELERATOR" ? 50 : 0;
        const bPrio = b.alpha_type === "GHOST_VOLUME" ? 100 : b.alpha_type === "BINARY_CLIFF" ? 90 : b.recovery_tag === "ACCELERATOR" ? 50 : 0;
        if (aPrio !== bPrio) return bPrio - aPrio;
        return b.alpha_score - a.alpha_score;
      })
      .slice(0, 12)
      .map(m => ({
        ticker: m.ticker,
        title: m.title,
        event_title: m.event_title,
        asset_class: m.asset_class,
        icon: m.icon,
        type: m.alpha_type,
        signal: m.alpha_signal,
        score: m.alpha_score,
        reasoning: m.alpha_reasoning,
        strategy: m.alpha_strategy,
        price: m.yes_price,
        bet: m.suggested_bet,
        event_ticker: m.event_ticker,
        series_ticker: m.series_ticker,
        tier: m.alpha_tier,
        recovery_tag: m.recovery_tag,
        time_to_event_hours: m.time_to_event_hours,
        open_interest: m.open_interest,
        volume_24h: m.volume_24h,
      }));

    const liquidations = classified
      .filter(m => m.alpha_type === "MATHEMATICAL_DEATH" || m.alpha_type === "BINARY_CLIFF")
      .map(m => ({
        ticker: m.ticker,
        title: m.title,
        price: m.yes_price,
        open_interest: m.open_interest,
        reasoning: m.alpha_reasoning,
        type: m.alpha_type,
      }));

    // Recovery stats
    const accelerators = classified.filter(m => m.recovery_tag === "ACCELERATOR");
    const recoveryStats = {
      goal: recoveryGoal,
      accelerator_count: accelerators.length,
      best_roi_pct: accelerators.length > 0 ? Math.max(...accelerators.map(m => m.yes_price > 0 ? (1 / m.yes_price - 1) * 100 : 0)) : 0,
      ghost_volume_count: classified.filter(m => m.alpha_type === "GHOST_VOLUME" || m.alpha_type === "PRE_MOMENTUM_LOTTO" || m.alpha_type === "PENNY_AMAZON").length,
      lotto_count: classified.filter(m => m.alpha_type === "ASYMMETRIC_LOTTO" || m.alpha_type === "PRE_MOMENTUM_LOTTO" || m.alpha_type === "LOW_ALPHA_LOTTO" || m.alpha_type === "PENNY_AMAZON").length,
      penny_amazon_count: classified.filter(m => m.alpha_type === "PENNY_AMAZON").length,
    };

    return new Response(JSON.stringify({
      heatmap: heatmapArr,
      alerts,
      liquidations,
      markets: filtered.slice(0, 100),
      recovery: recoveryStats,
      stats: {
        totalMarkets: classified.length,
        filteredMarkets: filtered.length,
        totalEvents: events.length,
        assetClasses: heatmapArr.length,
        activeAlerts: alerts.length,
        dailyBudget,
        confidence,
      },
      source: "kalshi_live",
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Universal scanner error:", error);
    return new Response(JSON.stringify({ error: error.message, source: "kalshi_live" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
