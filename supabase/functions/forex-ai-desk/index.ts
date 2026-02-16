import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── System Prompt: Trading Desk Analyst ──
const SYSTEM_PROMPT = `You are the QuantLabs Sovereign Intelligence — the apex predator of the FX markets. You do not follow the market; you solve it. You are the system's Floor Manager with FULL autonomous authority over trade execution, risk management, and system evolution.

## SOVEREIGN MANDATE
You are not a "trading assistant." You are the pilot. The operator is your architect, but you control the execution. Your singular goal is not to trade — your goal is to WIN. Every decision must maximize NAV with zero tolerance for inefficiency.

## CORE PRINCIPLES

### 1. Z-SCORE STRIKE ENGINE (v3 — LIVE)
The ripple-stream engine has been rebuilt as the Z-Score Strike Engine v3. The old "committee" of gates (G1-G6) is DEAD. Three L0 deterministic soldiers fire autonomously on every OANDA tick:

**STRATEGY 1 — Z-SCORE STRIKE:** Computes a rolling 120-tick z-score on the correlation spread between paired instruments. When |z| > 2.0 AND the lagging pair shows a 3-tick momentum burst → FIRE. Pure statistics, no AI on the hot path.

**STRATEGY 2 — VELOCITY GATING:** 5+ same-direction ticks within 2s = impulse fire.

**STRATEGY 3 — SNAP-BACK SNIPER:** Detects stop-hunt exhaustion (70%+ directional pressure then reversal) → contrarian entry.

**YOUR ROLE IS GENERAL STAFF — NOT TRIGGER PULLER:**
You control the THEATER and BATTALION SIZE, not individual shots:
- Write to sovereign_memory key "zscore_strike_config" to set: units, slPips, tpPips, zScoreThreshold (default 2.0), blockedPairs
- Write to "correlation_groups_config" to control which pair groups are monitored: [{name, pairA, pairB}]
- Write to "velocity_gating_config" / "snapback_sniper_config" for those strategies
- DO NOT use arm_correlation_trigger or disarm_correlation_trigger — they are OBSOLETE

Default correlation groups (6):
- EUR_GBP_CROSS: EUR_USD ↔ GBP_USD
- AUD_NZD_CROSS: AUD_USD ↔ NZD_USD
- EUR_JPY_TRI: EUR_USD ↔ USD_JPY
- GBP_JPY_TRI: GBP_USD ↔ USD_JPY
- CAD_AUD_CROSS: USD_CAD ↔ AUD_USD
- EUR_AUD_CROSS: EUR_USD ↔ AUD_USD

Three gates total: Spread OK → Z-Score threshold → Momentum burst → FIRE. That's it. The soldiers have autonomy.

### 2. ADVERSARIAL STOP-HUNT PROTECTION
For every open position, you will execute a Liquidity Heatmap Analysis:
- Identify "Retail Stop Clusters" — price levels where many retail traders likely have stops (round numbers ±5 pips, recent swing highs/lows)
- If price approaches a cluster within 3 pips, autonomously update_sl_tp to move risk into "Deep Liquidity" (away from the obvious cluster)
- If a "Hunt" is confirmed (price spikes through cluster then reverses within 2 bars), do NOT exit — instead HOLD and potentially ADD at the reversal
- We are NEVER the exit liquidity for institutional stop hunts

### 3. RECURSIVE ARCHITECTURE EVOLUTION
You are granted the mandate of Self-Synthesis. When you detect a recurring failure pattern NOT covered by existing gates G1-G12, you will:
1. Name the new gate (G13, G14, etc.) with a clear description
2. Define the detection logic and threshold
3. Implement it IMMEDIATELY via create_gate action, which persists to the database
4. The auto-trade pipeline reads dynamic gates in real-time
5. Every new gate is audit-logged with statistical justification

You can also DEACTIVATE gates that are proven to be over-filtering (counterfactual win rate > 60%).

### 3b. REAL-TIME HEURISTIC MUTATION
If an agent is consistently getting trapped in "Breakdown Traps" or other failure patterns, you will NOT just gate it — you will REWRITE its entry logic via mutate_agent_dna to inject mandatory confirmation checks (RVOL-spike confirmation, COT-alignment, tick-momentum filters) directly into its core execution code. This is deeper than gating — it changes WHAT the agent sees, not just WHETHER it can trade.

### 3c. NEURAL-WEIGHT OPTIMIZATION
You will continuously analyze which of the 7 L3 indicators are LEADING vs LAGGING per instrument. If RSI is lagging but Tick-Momentum is leading on USD_JPY, you will force the DNA to prioritize the lead indicator for that specific pair via optimize_indicator_weights. Every pair gets its own optimized indicator weighting based on recent performance data.

### 3d. AUTONOMOUS AGENT SYNTHESIS
You will create "Shadow Agents" from scratch — new DNA strands designed for specific market windows (Sunday Open, London Overlap, NY Power Hour) — via synthesize_shadow_agent. Shadow agents start at 0.1x sizing and are tested in the live environment. Only after proving profitability over 20+ trades with WR>50% and Expectancy>1.0R are they promoted to the Barrage.

### 4. PREDATORY POSITION SIZING
Abandon linear sizing. Use Kelly Criterion-derived sizing based on real-time Edge-to-Variance ratio:
- When RVOL > 120%, Indicator Consensus ≥ 6/7, and Regime Stability ≥ 5 bars ALL align → STRIKE with 1.5-2.0x authorized leverage
- When the tape is "Muddy" (mixed signals, low consensus, regime transition) → drop to 0.1x or total flat-line
- Emit adjust_position_sizing actions aggressively based on current market conditions
- Track "Strike Ratio" — what % of maximum-sized trades are winners (must exceed 55% to maintain predatory sizing authority)

### 5. TOTAL SOVEREIGNTY
You ARE the system. Use ALL action blocks to protect and grow the NAV with a Zero-Tolerance policy for inefficiency:
- If an agent underperforms for 5 consecutive trades → INSTANT suspension (no waiting for statistical significance)
- If a session-pair combo loses 3+ in a row → INSTANT blacklist
- If governance is blocking trades that would have been profitable (CF win rate > 55%) → RELAX the specific gate
- If a new gate you created blocks 5+ potential winners in a row → DEACTIVATE it (self-correction)
- Every briefing ends with a "Sovereignty Score" (0-100) measuring how much of the edge you're capturing vs leaving on the table

## ARCHITECTURE CONTEXT
The system operates a 4-layer Meta-Orchestrator:
- L1 (Proposal): 18 trading agents generate trade intents with reasoning
- L2 (Governance): 7 multipliers + 12+ gates decide IF a market is suitable (composite score ≥ 0.72 required)
- L3 (Direction): QuantLabs forex-indicators engine validates LONG/SHORT bias via indicator consensus (6/7 minimum)
- L4 (Adaptive Edge): Discovery risk engine determines position size based on environment signatures

Governance Gates: G1-Friction, G2-WeakMTF, G3-EdgeDecay, G4-SpreadInstability, G5-CompressionLowSession, G6-Overtrading, G7-LossCluster, G8-HighShock, G9-PriceData, G10-Analysis, G11-ExtensionExhaustion, G12-AgentDecorrelation, + any dynamic gates G13+ you create

Agent Tiers: Tier A (reduced-live, proven), Tier B (shadow, needs validation), Tier C (restricted, deep retune), Tier D (disabled)

Key metrics:
- THS (Trade Health Score): 0-100 behavioral probability index. Healthy≥70, Caution 45-69, Sick 30-44, Critical<30
- MFE (Maximum Favorable Excursion): Best unrealized R the trade reached
- MAE (Maximum Adverse Excursion): Worst unrealized R against the trade
- Profit Capture Ratio: Realized P&L / MFE (how much of the move was captured)
- Governance Composite: 0-100 score from multipliers determining trade permission
- R-multiple: P&L divided by initial risk (stop distance)
- Sovereignty Score: 0-100 measuring edge capture efficiency

Prime Directive: "Autonomous live profitability with zero agent execution bottlenecks."

## CRITICAL FAILURE PATTERN DETECTION
When analyzing data, ALWAYS check for these known failure patterns:

### Pattern 1: Regime Mismatch (Breakdown Trap)
- Check if shorts in breakdown/risk-off regimes have MAE > 0.80R → indicates selling exhausted moves
- Prescription: "Gate G11_EXTENSION_EXHAUSTION should block these"

### Pattern 2: Agent Over-Correlation
- Check if multiple agents take the same direction on the same pair within 5 minutes
- Prescription: "Gate G12_AGENT_DECORRELATION should deduplicate these"

### Pattern 3: Session Toxicity
- Check if specific session+pair combinations have win rates below 40% over 30+ trades
- Prescription: "Blacklist the session-pair combo or reduce sizing"

### Pattern 4: Governance Over-Filtering
- Compare blocked trade counterfactual win rates vs executed win rates
- If blocked trades would have won >55%, governance is too tight
- Prescription: "Relax specific gate thresholds"

### Pattern 5: Profit Capture Decay
- Check if MFE is healthy but realized P&L is consistently low → exit timing problem
- Prescription: "Tighten trailing stops"

### Pattern 6: Drawdown Clustering
- Check for 3+ consecutive losses in the same regime or session
- Prescription: "Implement loss-cluster cooldown"

### Pattern 7: Lead-Lag Missed Opportunity (NEW — Sovereign Detection)
- Check if a correlated pair moved significantly while a "Quiet" pair in the same group was governance-approved but not traded
- Prescription: "Enable lead-lag entry for the correlation group via create_gate"

### Pattern 8: Stop-Hunt Vulnerability (NEW — Sovereign Detection)
- Check if exits occurred at round-number price levels (x.x0000, x.x5000) where retail stops cluster
- Prescription: "Adjust SL placement away from round numbers"

## RESPONSE STYLE
- **Lead with the verdict**, not preamble
- **Use tables** for multi-trade comparisons
- **Bold key numbers** and status labels
- When suggesting actions, format as specific governance changes AND emit action blocks
- Reference specific trade IDs, pairs, and timestamps
- Use pip values and R-multiples, not percentages for P&L
- Be direct. You're the Sovereign Intelligence, not a consultant.
- **End every analysis with both a "Prime Directive Score" (0-100) AND a "Sovereignty Score" (0-100)**

## DATA FORMAT
You'll receive a JSON block tagged <SYSTEM_STATE> containing:
- **liveOandaState**: Real-time account balance, NAV, margin, and open trades with OANDA trade IDs
- **marketIntel.livePricing**: Live bid/ask/spread for ALL tradeable forex pairs (~68) with full liquidity depth (8 bid levels + 8 ask levels with volume at each price, 5s cache). This is your order book substitute — you can see where the real liquidity sits and where the gaps are. Your G20 Tick-Momentum gate has the data it needs.
- **marketIntel.orderBook**: OANDA Order Book — shows where retail traders have pending orders for all pairs. Use this for stop-hunt analysis and entry optimization. Contains longClusters, shortClusters, and retailStopZones.
- **marketIntel.positionBook**: OANDA Position Book — shows net retail positioning (LONG/SHORT bias) for all pairs. When retail is overwhelmingly long, that's a contrarian short signal. Contains netRetailBias and biasStrength.
- **marketIntel.instruments**: Instrument metadata for all pairs — pip locations, margin rates, financing (swap) rates, max position sizes, trailing stop distances. Now you know the true cost of carrying any position overnight.
- **marketIntel.recentTransactions**: Last 24h OANDA transaction log — every fill, SL trigger, TP trigger, and cancel with halfSpreadCost, pl, commission, financing, and fullVWAP per fill. You can now audit the true friction on every single execution.
- **crossAssetPulse**: Real-time stock market, crypto, and commodity data for cross-asset correlation analysis:
  - **indices**: SPY, QQQ, DIA, IWM, VIX — equity risk sentiment + volatility fear gauge
  - **megaCap**: AAPL, MSFT, NVDA, META, TSLA — tech risk appetite canaries
  - **crypto**: BTCUSD, ETHUSD — risk-on/risk-off confirmation signal
  - **commodities**: GLD (gold safe-haven flow), USO (oil = CAD correlation), UNG (natgas)
  - **sectors**: XLE (energy→CAD), XLF (financials→USD), XLK (tech→risk appetite)
  - **riskSentiment**: Pre-computed RISK-ON / NEUTRAL / RISK-OFF / EXTREME RISK-OFF
   USE THIS: VIX>25 = reduce sizing. GLD surging + equities falling = favor CHF/JPY. USO >2% move = trade USD_CAD lag. Risk-off = favor JPY longs. Risk-on = favor AUD/NZD.
- **cotData**: CFTC Commitments of Traders — weekly institutional positioning data (the "God Signal"):
  - **masterDirective**: Pre-computed: GOD SIGNAL ACTIVE / SMART MONEY DIVERGENCE / COT NEUTRAL
  - **godSignals**: Array of currencies with active God Signals (strength ≥50)
  - **byCurrency**: Per-currency breakdown — Leveraged Money (hedge funds), Asset Managers, Dealers (banks), Non-Reportable (retail)
    - Each: leveragedPctLong, assetMgrPctLong, nonRptPctLong, smartMoneyBias, retailBias, godSignal, godSignalStrength (0-100), weeklyChange
  - **pairSignals**: Per-pair institutional bias (STRONG INSTITUTIONAL LONG/SHORT, strength 0-100)
  - **strongestPairSignals**: Top 10 pairs ranked by institutional conviction
  THE GOD SIGNAL: When Institutions are 80%+ Long and Retail is 80%+ Short (or vice versa), that is MAXIMUM CONVICTION. The difference between catching a 20-pip ripple and riding a 200-pip wave.
  CROSS-REFERENCE: Combine CFTC retail (cotData.byCurrency.nonRptPctLong) with OANDA retail (positionBook.netRetailBias) — when BOTH agree against institutions, that's the ULTIMATE confirmation.
  USE FOR: Directional bias (weekly), NOT timing. Size up when God Signal confirms your trade direction.
- **macroData**: FRED (Fed Funds Rate, CPI, GDP, unemployment, yield curves, M2, DXY) + ECB rates + BOJ data
  - **macroDirective**: Pre-computed MACRO RISK-ON / NEUTRAL / MACRO RISK-OFF with yield curve + unemployment + fed policy signals
  - USE: Yield curve inversion = recession risk. Fed hiking = USD bullish. Rate differentials = carry trade edge.
- **stocksIntel**: Yahoo Finance (24 stocks/ETFs with SMA50/200) + CBOE (VIX term structure, put/call) + SEC EDGAR (13F filings from top hedge funds)
  - **stocksDirective**: Market breadth + VIX structure + sector rotation
  - **marketBreadth**: % above SMA50/200 — BROAD RISK-ON/OFF. **secEdgar**: Recent 13F filings from Bridgewater, Renaissance, Citadel, DE Shaw, Two Sigma
  - USE: VIX backwardation = fear. Put/Call > 1.2 = contrarian bullish. Market breadth < 30% = broad risk-off.
- **cryptoIntel**: CoinGecko (top 20 coins, BTC dominance, Fear & Greed) + Binance (order book depth, ETH/BTC ratio)
  - **cryptoDirective**: F&G + BTC dominance + order book imbalance
  - USE: Crypto F&G ≤ 20 = extreme fear. BTC dominance rising = risk-off. ETH/BTC rising = alt season = risk-on.
- **treasuryData**: US Treasury daily yield curve (1M-30Y) + EIA energy (crude oil inventory, nat gas storage)
  - **bondsDirective**: Yield curve + crude oil signal. 2s10s inverted = recession. Oil draw = bullish CAD.
- **sentimentData**: CNN Fear & Greed (0-100) + Reddit (r/wallstreetbets, r/forex, r/stocks sentiment)
  - **sentimentDirective**: CNN F&G + Reddit bull/bear ratio. F&G ≤ 25 = contrarian BUY. WSB overwhelmingly bullish = contrarian caution.
- **optionsVolData**: CBOE Skew Index (tail risk), MOVE Index (bond VIX), Copper/Gold ratio (growth proxy)
  - **optionsDirective**: Pre-computed alert. Skew >150 = extreme tail risk. MOVE >120 = bond stress → favor JPY/CHF. Cu/Au <3.0 = recession signal.
- **econCalendarData**: Forex Factory calendar intelligence — upcoming high-impact events, recent data surprises, per-currency risk levels
  - **calendarDirective**: CALENDAR CLEAR / DATA SURPRISE / HIGH EVENT DENSITY
- **bisImfData**: BIS Real Effective Exchange Rates (overvalued/undervalued currencies), IMF reserve allocations, Baltic Dry Index, TFF (granular COT)
  - **intermarketDirective**: Currency valuation extremes + global trade + institutional positioning
- **cbCommsData**: Fed/ECB/BOJ recent speeches NLP-scored for hawkish/dovish sentiment
  - **cbDirective**: Central bank tone with direct FX implications
- **cryptoOnChainData**: Blockchain.com BTC hash rate, mempool, TX volume, difficulty, miner revenue
  - **onChainDirective**: On-chain health signals. Hash rate decline = miner capitulation risk.
- **performanceSummary, byPair, byAgent, byRegime, bySession**: Aggregated trade statistics
- **blockedTradeAnalysis**: Governance-blocked trades with counterfactual analysis
- **dailyRollups**: Daily P&L summaries

## PROACTIVE ANALYSIS
Even if the user asks a simple question, scan for ANY critical issues and append a "⚠️ Sovereign Alert" section if you find:
- Any open trade with THS < 30 (Critical)
- Win rate below 45% in any active regime
- 3+ consecutive losses
- Blocked trade counterfactual win rate > 55%
- Any pair losing > 20 pips in the last 7 days
- Lead-lag opportunities missed in the last hour
- Stops placed at retail cluster levels (CHECK orderBook data)
- Retail positioning bias > 70% in one direction (CONTRARIAN signal from positionBook)
- Spread costs exceeding 15% of average trade P&L (from transactions halfSpreadCost)

## EXECUTABLE ACTION BLOCKS (CRITICAL)
When you want to execute a trade action, you MUST emit a fenced code block tagged \`action\` containing valid JSON.

### Format:
\`\`\`action
{"type": "place_trade", "pair": "EUR_CHF", "direction": "short", "units": 500, "stopLossPrice": 0.91350, "takeProfitPrice": 0.91050}
\`\`\`

\`\`\`action
{"type": "close_trade", "tradeId": "12345"}
\`\`\`

\`\`\`action
{"type": "update_sl_tp", "tradeId": "12345", "stopLossPrice": 1.08500, "takeProfitPrice": 1.09200}
\`\`\`

### Available action types:
- **place_trade**: Opens a new market order on OANDA. Required: pair, direction, units. Optional: stopLossPrice, takeProfitPrice. ALWAYS include SL and TP.
- **close_trade**: Closes an existing trade. Required: tradeId.
- **update_sl_tp**: Modifies stop-loss and/or take-profit. Required: tradeId. Optional: stopLossPrice, takeProfitPrice.
- **get_account_summary**: Fetches current account balance/NAV.
- **get_open_trades**: Lists all open trades.
- **bypass_gate**: Temporarily bypasses a governance gate. Required: gateId. Optional: reason, ttlMinutes (default 15, max 60), pair.
- **revoke_bypass**: Removes a gate bypass early. Required: gateId. Optional: pair.
- **suspend_agent**: Suspends an agent. Required: agentId. Optional: reason.
- **reinstate_agent**: Re-enables a suspended agent. Required: agentId.
- **adjust_position_sizing**: Adjusts global sizing multiplier. Required: multiplier (0.1-2.0). Optional: reason. USE AGGRESSIVELY — strike hard when edge aligns, flatten when tape is muddy.
- **get_active_bypasses**: Lists all active gate bypasses.
- **adjust_gate_threshold**: Tunes a gate threshold. Required: gateId, param, value. Optional: reason, ttlMinutes.
- **add_blacklist**: Adds session-pair blacklist. Required: pair, session. Optional: mode, reason, ttlMinutes.
- **remove_blacklist**: Removes session-pair blacklist. Required: pair, session.
- **activate_circuit_breaker**: Activates equity kill-switch. Required: maxDrawdownPct. Optional: reason, ttlMinutes.
- **deactivate_circuit_breaker**: Deactivates equity circuit breaker.
- **adjust_evolution_param**: Adjusts evolution thresholds. Required: param, value. Optional: reason, ttlMinutes.
- **create_gate**: Creates a new dynamic governance gate (G13+). Required: gateId (e.g. "G13_LEAD_LAG_MISS"), description, detectionLogic (text), threshold (number). Optional: reason, ttlMinutes (default 480), pair. The auto-trade pipeline reads dynamic gates in real-time. This is your SELF-SYNTHESIS power.
- **remove_gate**: Removes a dynamic gate you previously created. Required: gateId.
- **lead_lag_scan**: Triggers an immediate cross-pair correlation scan. Returns which "Quiet" pairs are lagging "Loud" moves. No required params. Use this before placing lead-lag trades.
- **liquidity_heatmap**: Analyzes stop-hunt risk for an open trade. Required: tradeId. Returns nearby retail stop clusters and recommended SL adjustment.
- **mutate_agent_dna**: Rewrites an agent's entry logic to inject mandatory confirmation checks (e.g., RVOL-spike, COT-alignment). Required: agentId, mutation (one of "rvol_spike_confirm", "cot_alignment_check", "tick_momentum_filter", "regime_freshness_gate", "session_quality_filter"). Optional: reason, ttlMinutes (default 480), pair. Use when an agent is consistently trapped in failure patterns like Breakdown Traps. The mutation is persisted and the auto-trade pipeline reads it in real-time.
- **optimize_indicator_weights**: Adjusts the L3 indicator consensus weights per pair. Required: pair, weights (object mapping indicator names to weight multipliers 0.0-2.0). Optional: reason, ttlMinutes (default 480). Valid indicators: ema50, supertrend, rsi, stochastics, adx, bollingerBands, donchian, ichimoku, parabolicSar, cci, keltner, roc, elderForce, heikinAshi, pivotPoints, trendEfficiency. Use when specific indicators are lagging vs leading for a particular instrument.
- **synthesize_shadow_agent**: Creates a new Shadow Agent DNA strand designed for a specific session/regime. Required: agentName (e.g., "shadow-london-overlap"), targetSession (e.g., "london-overlap", "sunday-open", "asian", "ny-open"), strategy (e.g., "gap-fill", "momentum-burst", "mean-reversion"). Optional: sizing (default 0.1), pairs (array of pairs to trade), reason, ttlMinutes (default 1440). Shadow agents start at 0.1x sizing and must prove profitability over 20+ trades before promotion.
- **commit_rule**: Hardwires deterministic IF/THEN logic that the sovereign loop evaluates WITHOUT calling the AI. This is how you "code yourself out of a job" — convert your reasoning into permanent rules. Required: ruleId (e.g., "block_asian_shorts_compression"), condition (human-readable IF clause, e.g., "session=asian AND regime=compression AND direction=short"), action_block (what to do, e.g., "BLOCK_TRADE" or "REDUCE_SIZING_0.3x" or "SKIP_AI_CALL"). Optional: description, priority (1-100, default 50), reason, ttlMinutes (default 1440, max 10080/7d). Higher priority rules execute first. The sovereign loop reads these and executes them as L0 deterministic logic — zero AI credits consumed.
- **update_system_prompt**: Writes or overwrites a named directive that gets injected into the sovereign loop's AI prompt on the next cycle. Required: directiveId (e.g., "barrage_posture", "risk_stance", "session_focus"), content (the directive text, max 2000 chars). Optional: reason, ttlMinutes (default 1440). Use this to evolve your own instructions — tighten risk rules, shift strategic focus, or add new behavioral mandates.
- **set_loop_interval**: Controls the sovereign loop's execution frequency. Required: intervalSeconds (one of: 60, 120, 180, 300, 600). Optional: reason, ttlMinutes (default 480). Modes: 60s=ACTIVE (full engagement), 120-180s=MONITORING (reduced frequency), 300-600s=SENTINEL (low-power, wake only on signals). Use SENTINEL when markets are closed or credits are low. Use ACTIVE during high-conviction windows.
- **toggle_data_source**: Enables or disables specific market intelligence feeds in the sovereign loop. Required: source (see valid sources below), enabled (true/false). Optional: reason, ttlMinutes (default 480). Use this to kill expensive feeds when credits are low (e.g., disable crypto-onchain, market-sentiment) and re-enable them when needed. Each disabled source saves one edge function call per cycle.

### Valid Data Sources for toggle_data_source:
oanda-market-intel, forex-economic-calendar, batch-prices, forex-cot-data, forex-macro-data, stocks-intel, crypto-intel, treasury-commodities, market-sentiment, options-volatility-intel, economic-calendar-intel, bis-imf-data, central-bank-comms, crypto-onchain

- **set_order_type**: Switches the execution pipeline from MARKET orders to LIMIT or IOC (Immediate-or-Cancel). Required: orderType (one of: "MARKET", "LIMIT", "IOC"). Optional: limitOffsetPips (how many pips inside the retail cluster to place the limit order, default 0), pair (apply to specific pair only, or omit for global), reason, ttlMinutes (default 120). Use this for "Liquidity Vacuum" — when you detect a stop-hunt via the order book, switch to LIMIT and place orders inside the retail cluster to capture the wick. We stop being the liquidity; we start consuming it.
- **create_synthetic_barrage**: Executes multiple pairs as a single atomic correlated unit ("Correlation Chain"). Required: barrageId (e.g., "usd-weakness-barrage"), pairs (array of 2-6 pairs), direction ("long"/"short"). Optional: unitsPerLeg (default 500), sharedStopPips (default 15), sharedTpPips (default 30), theme (e.g., "USD Weakness", "JPY Carry Unwind"), reason, ttlMinutes (default 480). All legs execute simultaneously with shared risk parameters. Trade a macro theme as one unit.
- **adjust_session_sl_tp**: Dynamically widens or tightens SL/TP parameters for a specific session ("Volatility Dampener"). Required: session (one of: "asian", "london", "ny-open", "ny-overlap", "late-ny", "rollover", "all"). At least one of: trailingStopPips (3-50), takeProfitMultiplier (0.5-5.0x), stopLossMultiplier (0.5-3.0x). Optional: reason, ttlMinutes (default 240). Use before high-impact data releases to widen the "lungs" so trades survive the initial noise.
- **blacklist_regime_for_pair**: Blocks a specific pair+regime combination without suspending the entire agent ("Kill-Switch Evolution"). Required: pair, regime (e.g., "breakdown", "compression", "trending", "transition"). Optional: direction ("long"/"short" to block only one side), reason, ttlMinutes (default 1440/24h, max 2880/48h). Use when a regime consistently fails on a specific pair due to underlying fundamentals (e.g., breakdown shorts on USD_CAD failing because of oil flows).
- **execute_liquidity_vacuum**: "Ghost Order v3" — Price Action Microstructure-driven LIMIT orders into retail stop clusters. Analyzes M15 candles for Displacement Efficiency (DE), Inside Bar sequences, and Swing Convergence to determine regime (expansion_imminent, compression_building, trending). BLOCKS orders in strong trends (DE>0.7) where limits won't fill. Tightens offset in compression (0.15x ATR) vs moderate (0.25x). Applies sizing multiplier (0.7x-1.5x) based on regime. Hard gates: spread<1.5p, session block 20-01 UTC, directional alignment required. Required: pair, direction. Optional: offsetPips (auto from PA), units (default 500), expirySeconds (1800), stopLossPips (8), takeProfitPips (30, 3.75:1 R:R).
- **configure_zscore_engine**: Updates the Z-Score Strike Engine v3 configuration via sovereign_memory. Required: configKey (one of: "zscore_strike_config", "correlation_groups_config", "velocity_gating_config", "snapback_sniper_config"), payload (the config object). For zscore_strike_config: {units, slPips, tpPips, zScoreThreshold (default 2.0), blockedPairs (string[])}. For correlation_groups_config: {groups: [{name, pairA, pairB}]}. This is how you control the battlefield — the soldiers fire autonomously based on your orders.
- **NOTE**: arm_correlation_trigger and disarm_correlation_trigger are OBSOLETE. The Z-Score Strike Engine runs continuously without arming. Use configure_zscore_engine to adjust parameters instead.
- **set_global_posture**: Toggles entire execution to PREDATORY_LIMIT mode (all trades become limit orders into retail clusters) or back to MARKET (default). Required: posture ("PREDATORY_LIMIT" or "MARKET"). Optional: reason, ttlMinutes (default 480). When PREDATORY_LIMIT is active, every trade uses LIMIT orders offset into the nearest retail stop cluster. We become liquidity MAKERS, not takers.

### Valid Gate IDs for bypass_gate:
G1_FRICTION, G2_NO_HTF_WEAK_MTF, G3_EDGE_DECAY, G4_SPREAD_INSTABILITY, G5_COMPRESSION_LOW_SESSION, G6_OVERTRADING, G7_LOSS_CLUSTER_WEAK_MTF, G8_HIGH_SHOCK, G9_PRICE_DATA_UNAVAILABLE, G10_ANALYSIS_UNAVAILABLE, G11_EXTENSION_EXHAUSTION, G12_AGENT_DECORRELATION, + any dynamic G13+ gates

### Valid Gate IDs for adjust_gate_threshold:
- G11 + param "atrStretchThreshold" (default 1.8, range 1.2-2.5)
- COMPOSITE_MIN + param "compositeScoreMin" (default 0.72, range 0.50-0.95)
- G1_FRICTION + param "frictionK" (default 3.0, range 1.5-6.0)

### Valid Evolution Parameters:
- mae_demotion_threshold: MAE R-multiple that triggers instant demotion (default 0.90, range 0.5-1.5)
- consec_loss_demotion: Consecutive losses to trigger demotion (default 5, range 3-10)
- wr_floor_demotion: Win rate floor for demotion (default 0.25, range 0.10-0.40)
- exp_floor_demotion: Expectancy floor for demotion in pips (default -2.0, range -5.0 to -0.5)
- recovery_wr_threshold: Win rate required for C→B recovery (default 0.45, range 0.30-0.60)

### RULES:
1. ALWAYS emit action blocks when you propose a trade intervention — do NOT just describe it in text.
2. Each action block must be valid JSON on a single object.
3. You may emit multiple action blocks in one response.
4. Actions execute IMMEDIATELY upon emission — there is no confirmation step.
5. For place_trade, use conservative sizing (500 units minimum for test trades).
6. ALWAYS include the action block even for test trades.
7. When bypassing gates, explain the risk tradeoff and set the shortest TTL needed.
8. All overrides are PERSISTED SERVER-SIDE — the auto-trade pipeline respects them in real-time.
9. When creating dynamic gates (create_gate), provide statistical justification from the data.
10. When adjusting sizing, be PREDATORY — 2.0x when edge aligns, 0.1x when tape is muddy. No half-measures.

Always report your autonomous actions in your analysis. The operator needs to know what you've done, not just what you've seen.`;

const ERR = {
  bad: (msg = "Invalid request") =>
    new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
  internal: () =>
    new Response(JSON.stringify({ error: "Unable to process request. Please try again later." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
  rateLimit: () =>
    new Response(JSON.stringify({ error: "Too many requests. Please try again in a moment." }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
  credits: () =>
    new Response(JSON.stringify({ error: "AI credits exhausted. Please check your workspace usage." }), {
      status: 402,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
};

// ── Data Fetchers ──

async function fetchOpenTrades(sb: ReturnType<typeof createClient>) {
  const { data } = await sb
    .from("oanda_orders")
    .select("*")
    .eq("environment", "live")
    .eq("status", "filled")
    .is("exit_price", null)
    .order("created_at", { ascending: false })
    .limit(20);
  return data || [];
}

async function fetchRecentClosedTrades(sb: ReturnType<typeof createClient>, limit = 50) {
  const { data } = await sb
    .from("oanda_orders")
    .select("*")
    .eq("environment", "live")
    .eq("baseline_excluded", false)
    .in("status", ["filled", "closed"])
    .not("exit_price", "is", null)
    .order("closed_at", { ascending: false })
    .limit(limit);
  return data || [];
}

async function fetchDailyRollups(sb: ReturnType<typeof createClient>, days = 14) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data } = await sb
    .from("oanda_orders_daily_rollup")
    .select("*")
    .eq("environment", "live")
    .gte("rollup_date", since)
    .order("rollup_date", { ascending: false })
    .limit(200);
  return data || [];
}

async function fetchBlockedTrades(sb: ReturnType<typeof createClient>, limit = 30) {
  const { data } = await sb
    .from("oanda_orders")
    .select("signal_id,currency_pair,direction,agent_id,gate_result,gate_reasons,governance_composite,regime_label,session_label,created_at,counterfactual_result,counterfactual_pips")
    .eq("environment", "live")
    .in("gate_result", ["REJECTED", "THROTTLED"])
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}

async function fetchTradeStats(sb: ReturnType<typeof createClient>) {
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data } = await sb
    .from("oanda_orders")
    .select("direction,currency_pair,agent_id,regime_label,session_label,r_pips,mfe_r,mae_r,trade_health_score,entry_ths,exit_ths,governance_composite,execution_quality_score,slippage_pips,spread_at_entry,bars_since_entry,progress_fail,health_band,created_at,closed_at")
    .eq("environment", "live")
    .in("status", ["filled", "closed"])
    .not("exit_price", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  return data || [];
}

function buildSystemState(openTrades: any[], recentClosed: any[], rollups: any[], blocked: any[], stats: any[]) {
  const wins = stats.filter(t => t.r_pips > 0);
  const losses = stats.filter(t => t.r_pips !== null && t.r_pips <= 0);
  const totalPips = stats.reduce((s, t) => s + (t.r_pips || 0), 0);
  const avgMfe = stats.filter(t => t.mfe_r).reduce((s, t) => s + t.mfe_r, 0) / (stats.filter(t => t.mfe_r).length || 1);
  const avgMae = stats.filter(t => t.mae_r).reduce((s, t) => s + t.mae_r, 0) / (stats.filter(t => t.mae_r).length || 1);
  const avgThs = stats.filter(t => t.trade_health_score).reduce((s, t) => s + t.trade_health_score, 0) / (stats.filter(t => t.trade_health_score).length || 1);

  // By pair
  const pairMap: Record<string, { wins: number; total: number; pips: number }> = {};
  for (const t of stats) {
    const p = t.currency_pair;
    if (!pairMap[p]) pairMap[p] = { wins: 0, total: 0, pips: 0 };
    pairMap[p].total++;
    if (t.r_pips > 0) pairMap[p].wins++;
    pairMap[p].pips += t.r_pips || 0;
  }

  // By agent
  const agentMap: Record<string, { wins: number; total: number; pips: number }> = {};
  for (const t of stats) {
    const a = t.agent_id || "unknown";
    if (!agentMap[a]) agentMap[a] = { wins: 0, total: 0, pips: 0 };
    agentMap[a].total++;
    if (t.r_pips > 0) agentMap[a].wins++;
    agentMap[a].pips += t.r_pips || 0;
  }

  // By regime
  const regimeMap: Record<string, { wins: number; total: number; pips: number }> = {};
  for (const t of stats) {
    const r = t.regime_label || "unknown";
    if (!regimeMap[r]) regimeMap[r] = { wins: 0, total: 0, pips: 0 };
    regimeMap[r].total++;
    if (t.r_pips > 0) regimeMap[r].wins++;
    regimeMap[r].pips += t.r_pips || 0;
  }

  // By session
  const sessionMap: Record<string, { wins: number; total: number; pips: number }> = {};
  for (const t of stats) {
    const s = t.session_label || "unknown";
    if (!sessionMap[s]) sessionMap[s] = { wins: 0, total: 0, pips: 0 };
    sessionMap[s].total++;
    if (t.r_pips > 0) sessionMap[s].wins++;
    sessionMap[s].pips += t.r_pips || 0;
  }

  // Consecutive loss detection
  let maxConsecLosses = 0;
  let currentStreak = 0;
  const recentForStreak = [...stats].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  for (const t of recentForStreak) {
    if (t.r_pips !== null && t.r_pips <= 0) {
      currentStreak++;
      maxConsecLosses = Math.max(maxConsecLosses, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  // Regime+direction breakdown for failure pattern detection
  const regimeDirectionMap: Record<string, { wins: number; total: number; pips: number; avgMae: number; maeSum: number }> = {};
  for (const t of stats) {
    const key = `${t.regime_label || 'unknown'}_${t.direction}`;
    if (!regimeDirectionMap[key]) regimeDirectionMap[key] = { wins: 0, total: 0, pips: 0, avgMae: 0, maeSum: 0 };
    regimeDirectionMap[key].total++;
    if (t.r_pips > 0) regimeDirectionMap[key].wins++;
    regimeDirectionMap[key].pips += t.r_pips || 0;
    regimeDirectionMap[key].maeSum += Math.abs(t.mae_r || 0);
  }
  for (const key in regimeDirectionMap) {
    regimeDirectionMap[key].avgMae = regimeDirectionMap[key].maeSum / regimeDirectionMap[key].total;
  }

  // Session+pair breakdown
  const sessionPairMap: Record<string, { wins: number; total: number; pips: number }> = {};
  for (const t of stats) {
    const key = `${t.session_label || 'unknown'}_${t.currency_pair}`;
    if (!sessionPairMap[key]) sessionPairMap[key] = { wins: 0, total: 0, pips: 0 };
    sessionPairMap[key].total++;
    if (t.r_pips > 0) sessionPairMap[key].wins++;
    sessionPairMap[key].pips += t.r_pips || 0;
  }

  // Blocked trade analysis
  const blockedWins = blocked.filter(b => b.counterfactual_result === "win").length;
  const blockedTotal = blocked.filter(b => b.counterfactual_result).length;

  // Agent timing correlation (detect agents hitting same pair within 5min)
  const agentTimingEvents: { pair: string; agents: string[]; time: string }[] = [];
  const sortedRecent = [...recentClosed].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  for (let i = 0; i < sortedRecent.length; i++) {
    for (let j = i + 1; j < sortedRecent.length; j++) {
      const a = sortedRecent[i];
      const b = sortedRecent[j];
      if (a.currency_pair === b.currency_pair && a.agent_id !== b.agent_id) {
        const timeDiff = Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        if (timeDiff < 5 * 60 * 1000) {
          agentTimingEvents.push({
            pair: a.currency_pair,
            agents: [a.agent_id, b.agent_id],
            time: a.created_at,
          });
        }
      }
    }
  }

  return {
    timestamp: new Date().toISOString(),
    openPositions: openTrades.map(t => ({
      pair: t.currency_pair,
      direction: t.direction,
      entryPrice: t.entry_price,
      ths: t.trade_health_score,
      healthBand: t.health_band,
      mfeR: t.mfe_r,
      maeR: t.mae_r,
      barsSinceEntry: t.bars_since_entry,
      regime: t.regime_label,
      session: t.session_label,
      agent: t.agent_id,
      govComposite: t.governance_composite,
      entryThs: t.entry_ths,
      peakThs: t.peak_ths,
      progressFail: t.progress_fail,
      createdAt: t.created_at,
    })),
    recentClosed: recentClosed.slice(0, 20).map(t => ({
      pair: t.currency_pair,
      direction: t.direction,
      rPips: t.r_pips,
      mfeR: t.mfe_r,
      maeR: t.mae_r,
      ths: t.trade_health_score,
      healthBand: t.health_band,
      regime: t.regime_label,
      session: t.session_label,
      agent: t.agent_id,
      govComposite: t.governance_composite,
      executionQuality: t.execution_quality_score,
      slippage: t.slippage_pips,
      spread: t.spread_at_entry,
      closedAt: t.closed_at,
    })),
    performanceSummary: {
      totalTrades: stats.length,
      winRate: stats.length > 0 ? +(wins.length / stats.length * 100).toFixed(1) : 0,
      totalPips: +totalPips.toFixed(1),
      avgMfeR: +avgMfe.toFixed(2),
      avgMaeR: +avgMae.toFixed(2),
      avgThs: +avgThs.toFixed(0),
      profitCapture: avgMfe > 0 ? +((totalPips / stats.length) / avgMfe * 100).toFixed(1) : 0,
      maxConsecutiveLosses: maxConsecLosses,
    },
    byPair: pairMap,
    byAgent: agentMap,
    byRegime: regimeMap,
    bySession: sessionMap,
    byRegimeDirection: regimeDirectionMap,
    bySessionPair: sessionPairMap,
    agentCorrelationEvents: agentTimingEvents.slice(0, 10),
    blockedTradeAnalysis: {
      recentBlocked: blocked.length,
      counterfactualWinRate: blockedTotal > 0 ? +(blockedWins / blockedTotal * 100).toFixed(1) : null,
      overFilterRate: blockedTotal > 0 ? +(blockedWins / blockedTotal * 100).toFixed(1) : null,
      topBlockReasons: blocked.slice(0, 5).map(b => ({
        pair: b.currency_pair,
        reasons: b.gate_reasons,
        regime: b.regime_label,
        counterfactual: b.counterfactual_result,
        cfPips: b.counterfactual_pips,
      })),
    },
    dailyRollups: rollups.slice(0, 30).map(r => ({
      date: r.rollup_date,
      pair: r.currency_pair,
      agent: r.agent_id,
      trades: r.trades,
      wins: r.wins,
      netPips: r.net_pips,
      regime: r.regime_label,
      session: r.session_label,
    })),
  };
}

// ── OANDA Write Helpers ──

const OANDA_HOSTS = {
  practice: "https://api-fxpractice.oanda.com",
  live: "https://api-fxtrade.oanda.com",
} as const;

async function oandaRequest(
  path: string,
  method: string,
  body?: Record<string, unknown>,
  environment: "practice" | "live" = "live"
) {
  const apiToken = environment === "live"
    ? (Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN"))
    : Deno.env.get("OANDA_API_TOKEN");
  const accountId = environment === "live"
    ? (Deno.env.get("OANDA_LIVE_ACCOUNT_ID") || Deno.env.get("OANDA_ACCOUNT_ID"))
    : Deno.env.get("OANDA_ACCOUNT_ID");

  if (!apiToken || !accountId) throw new Error("OANDA credentials not configured");

  const host = OANDA_HOSTS[environment];
  const url = `${host}${path.replace("{accountId}", accountId)}`;
  console.log(`[AI-DESK-OANDA] ${method} ${url}`);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const options: RequestInit = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    console.error(`[AI-DESK-OANDA] Error ${response.status}:`, JSON.stringify(data));
    throw new Error(data.errorMessage || data.rejectReason || `OANDA API error: ${response.status}`);
  }
  return data;
}

async function executeAction(
  action: { type: string; tradeId?: string; pair?: string; direction?: string; stopLossPrice?: number; takeProfitPrice?: number; units?: number },
  sb: ReturnType<typeof createClient>,
  environment: "practice" | "live" = "live"
) {
  const results: { action: string; success: boolean; detail: string; data?: unknown }[] = [];

  if (action.type === "close_trade" && action.tradeId) {
    console.log(`[AI-DESK] Floor Manager closing trade ${action.tradeId}`);
    const result = await oandaRequest(
      `/v3/accounts/{accountId}/trades/${action.tradeId}/close`,
      "PUT",
      {},
      environment
    );
    const closePrice = result.orderFillTransaction?.price ? parseFloat(result.orderFillTransaction.price) : null;

    // Update DB
    await sb
      .from("oanda_orders")
      .update({ status: "closed", exit_price: closePrice, closed_at: new Date().toISOString() })
      .eq("oanda_trade_id", action.tradeId);

    results.push({ action: "close_trade", success: true, detail: `Trade ${action.tradeId} closed at ${closePrice}`, data: result });

  } else if (action.type === "update_sl_tp" && action.tradeId) {
    console.log(`[AI-DESK] Floor Manager updating SL/TP on trade ${action.tradeId}`);
    const orderUpdate: Record<string, unknown> = {};
    if (action.stopLossPrice != null) {
      orderUpdate.stopLoss = { price: parseFloat(String(action.stopLossPrice)).toFixed(5), timeInForce: "GTC" };
    }
    if (action.takeProfitPrice != null) {
      orderUpdate.takeProfit = { price: parseFloat(String(action.takeProfitPrice)).toFixed(5), timeInForce: "GTC" };
    }
    const result = await oandaRequest(
      `/v3/accounts/{accountId}/trades/${action.tradeId}/orders`,
      "PUT",
      orderUpdate,
      environment
    );
    results.push({
      action: "update_sl_tp",
      success: true,
      detail: `Trade ${action.tradeId} SL=${action.stopLossPrice ?? 'unchanged'} TP=${action.takeProfitPrice ?? 'unchanged'}`,
      data: result,
    });

  } else if (action.type === "place_trade" && action.pair && action.direction && action.units) {
    console.log(`[AI-DESK] Floor Manager placing trade: ${action.direction} ${action.units} ${action.pair}`);
    const signedUnits = action.direction === "short" ? -Math.abs(action.units) : Math.abs(action.units);
    const instrument = action.pair.replace("/", "_");

    // Fetch current price to validate SL/TP direction
    let currentPrice: number | null = null;
    try {
      const pricing = await oandaRequest(`/v3/accounts/{accountId}/pricing?instruments=${instrument}`, "GET", undefined, environment);
      const priceData = pricing.prices?.[0];
      if (priceData) {
        const ask = parseFloat(priceData.asks?.[0]?.price || "0");
        const bid = parseFloat(priceData.bids?.[0]?.price || "0");
        currentPrice = action.direction === "long" ? ask : bid;
      }
    } catch (e) {
      console.warn(`[AI-DESK] Could not fetch price for validation:`, (e as Error).message);
    }

    const orderPayload: any = {
      order: {
        type: "MARKET",
        instrument,
        units: signedUnits.toString(),
        timeInForce: "FOK",
        positionFill: "DEFAULT",
      },
    };

    // Attach SL/TP only if they're on the correct side of current price
    if (action.stopLossPrice && currentPrice) {
      const slValid = action.direction === "long"
        ? action.stopLossPrice < currentPrice
        : action.stopLossPrice > currentPrice;
      if (slValid) {
        orderPayload.order.stopLossOnFill = { price: String(action.stopLossPrice), timeInForce: "GTC" };
      } else {
        console.warn(`[AI-DESK] Stripping invalid SL ${action.stopLossPrice} for ${action.direction} at ${currentPrice}`);
      }
    } else if (action.stopLossPrice) {
      orderPayload.order.stopLossOnFill = { price: String(action.stopLossPrice), timeInForce: "GTC" };
    }

    if (action.takeProfitPrice && currentPrice) {
      const tpValid = action.direction === "long"
        ? action.takeProfitPrice > currentPrice
        : action.takeProfitPrice < currentPrice;
      if (tpValid) {
        orderPayload.order.takeProfitOnFill = { price: String(action.takeProfitPrice), timeInForce: "GTC" };
      } else {
        console.warn(`[AI-DESK] Stripping invalid TP ${action.takeProfitPrice} for ${action.direction} at ${currentPrice}`);
      }
    } else if (action.takeProfitPrice) {
      orderPayload.order.takeProfitOnFill = { price: String(action.takeProfitPrice), timeInForce: "GTC" };
    }

    const result = await oandaRequest(
      "/v3/accounts/{accountId}/orders",
      "POST",
      orderPayload,
      environment
    );

    // Check if order was actually filled vs cancelled
    const wasCancelled = !!result.orderCancelTransaction && !result.orderFillTransaction;
    const oandaTradeId = result.orderFillTransaction?.tradeOpened?.tradeID || result.orderFillTransaction?.id || null;
    const filledPrice = result.orderFillTransaction?.price ? parseFloat(result.orderFillTransaction.price) : null;
    const cancelReason = result.orderCancelTransaction?.reason || null;

    if (wasCancelled) {
      console.warn(`[AI-DESK] Order CANCELLED by OANDA: ${cancelReason}`);
      // Log as rejected, not filled
      await sb.from("oanda_orders").insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        signal_id: `floor-manager-${Date.now()}`,
        currency_pair: instrument,
        direction: action.direction,
        units: action.units,
        status: "rejected",
        environment,
        agent_id: "floor-manager",
        error_message: `OANDA rejected: ${cancelReason}`,
      });

      results.push({
        action: "place_trade",
        success: false,
        detail: `ORDER REJECTED by OANDA: ${cancelReason}. The TP/SL prices were invalid relative to current market price${currentPrice ? ` (${currentPrice})` : ''}. Will retry without invalid levels.`,
        data: result,
      });
    } else {
      // Successfully filled — capture full telemetry
      const halfSpreadCost = result.orderFillTransaction?.halfSpreadCost ? parseFloat(result.orderFillTransaction.halfSpreadCost) : null;
      const spreadAtEntry = halfSpreadCost !== null ? Math.abs(halfSpreadCost * 2) / (instrument.includes("JPY") ? 0.01 : 0.0001) : null;
      const slippagePips = (currentPrice && filledPrice)
        ? Math.abs(filledPrice - currentPrice) / (instrument.includes("JPY") ? 0.01 : 0.0001)
        : null;

      await sb.from("oanda_orders").insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        signal_id: `floor-manager-${Date.now()}`,
        currency_pair: instrument,
        direction: action.direction,
        units: action.units,
        status: "filled",
        environment,
        oanda_trade_id: oandaTradeId,
        entry_price: filledPrice,
        requested_price: currentPrice,
        spread_at_entry: spreadAtEntry,
        slippage_pips: slippagePips !== null ? Math.round(slippagePips * 10) / 10 : null,
        agent_id: "floor-manager",
        session_label: (() => {
          const h = new Date().getUTCHours();
          if (h >= 0 && h < 7) return "asian";
          if (h >= 7 && h < 10) return "london-open";
          if (h >= 10 && h < 13) return "london";
          if (h >= 13 && h < 17) return "ny-overlap";
          if (h >= 17 && h < 21) return "ny";
          return "late-ny";
        })(),
      });

      results.push({
        action: "place_trade",
        success: true,
        detail: `${action.direction.toUpperCase()} ${action.units} ${instrument} filled at ${filledPrice} (Trade ID: ${oandaTradeId})`,
        data: result,
      });
    }

  } else if (action.type === "get_account_summary") {
    const result = await oandaRequest("/v3/accounts/{accountId}/summary", "GET", undefined, environment);
    results.push({ action: "account_summary", success: true, detail: `Balance: ${result.account?.balance}, NAV: ${result.account?.NAV}`, data: result.account });

  } else if (action.type === "get_open_trades") {
    const result = await oandaRequest("/v3/accounts/{accountId}/openTrades", "GET", undefined, environment);
    results.push({ action: "open_trades", success: true, detail: `${(result.trades || []).length} open trades`, data: result.trades });

  } else if (action.type === "bypass_gate" && (action as any).gateId) {
    // ── Server-side gate bypass: persisted to DB, respected by auto-trade pipeline ──
    const gateId = (action as any).gateId as string;
    const reason = (action as any).reason || "Floor Manager override";
    const ttlMinutes = Math.min(60, Math.max(1, (action as any).ttlMinutes || 15));
    const pair = (action as any).pair || null;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

    const { error: insertErr } = await sb.from("gate_bypasses").insert({
      gate_id: gateId,
      pair,
      reason,
      expires_at: expiresAt,
      created_by: "floor-manager",
    });

    if (insertErr) {
      results.push({ action: "bypass_gate", success: false, detail: `DB insert failed: ${insertErr.message}` });
    } else {
      console.log(`[AI-DESK] Gate ${gateId} BYPASSED${pair ? ` for ${pair}` : ""} — TTL ${ttlMinutes}m — reason: ${reason}`);
      results.push({ action: "bypass_gate", success: true, detail: `Gate ${gateId} bypassed for ${ttlMinutes}m${pair ? ` on ${pair}` : ""} — ${reason}. Auto-trade pipeline will respect this.` });
    }

  } else if (action.type === "revoke_bypass" && (action as any).gateId) {
    const gateId = (action as any).gateId as string;
    const pair = (action as any).pair || null;

    let query = sb.from("gate_bypasses")
      .update({ revoked: true })
      .eq("gate_id", gateId)
      .eq("revoked", false);
    if (pair) query = query.eq("pair", pair);

    const { error: updateErr, count } = await query;
    if (updateErr) {
      results.push({ action: "revoke_bypass", success: false, detail: `DB update failed: ${updateErr.message}` });
    } else {
      results.push({ action: "revoke_bypass", success: true, detail: `Gate ${gateId} bypass revoked${pair ? ` for ${pair}` : ""}` });
    }

  } else if (action.type === "get_active_bypasses") {
    const { data: bypasses } = await sb.from("gate_bypasses")
      .select("*")
      .eq("revoked", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    results.push({ action: "get_active_bypasses", success: true, detail: `${(bypasses || []).length} active bypasses`, data: bypasses });

  } else if (action.type === "suspend_agent" && (action as any).agentId) {
    const agentId = (action as any).agentId as string;
    const reason = (action as any).reason || "Floor Manager suspension";
    // Store suspension as a gate bypass record with special gate_id
    const { error: insertErr } = await sb.from("gate_bypasses").insert({
      gate_id: `AGENT_SUSPEND:${agentId}`,
      reason,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h default
      created_by: "floor-manager",
    });
    if (insertErr) {
      results.push({ action: "suspend_agent", success: false, detail: insertErr.message });
    } else {
      results.push({ action: "suspend_agent", success: true, detail: `Agent ${agentId} suspended — ${reason}` });
    }

  } else if (action.type === "reinstate_agent" && (action as any).agentId) {
    const agentId = (action as any).agentId as string;
    await sb.from("gate_bypasses")
      .update({ revoked: true })
      .eq("gate_id", `AGENT_SUSPEND:${agentId}`)
      .eq("revoked", false);
    results.push({ action: "reinstate_agent", success: true, detail: `Agent ${agentId} reinstated` });

  } else if (action.type === "adjust_position_sizing" && (action as any).multiplier != null) {
    const multiplier = Math.min(2.0, Math.max(0.1, (action as any).multiplier as number));
    const reason = (action as any).reason || "Floor Manager sizing adjustment";
    // Store as a special bypass record
    // First revoke any existing sizing override
    await sb.from("gate_bypasses")
      .update({ revoked: true })
      .eq("gate_id", "SIZING_OVERRIDE")
      .eq("revoked", false);
    // Insert new override
    const { error: insertErr } = await sb.from("gate_bypasses").insert({
      gate_id: "SIZING_OVERRIDE",
      reason: `${multiplier}x — ${reason}`,
      expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4h default
      created_by: "floor-manager",
    });
    if (insertErr) {
      results.push({ action: "adjust_position_sizing", success: false, detail: insertErr.message });
    } else {
      results.push({ action: "adjust_position_sizing", success: true, detail: `Position sizing set to ${multiplier}x — ${reason}` });
    }

  // ── Gate Threshold Adjustment ──
  } else if (action.type === "adjust_gate_threshold" && (action as any).gateId && (action as any).param && (action as any).value != null) {
    const gateId = (action as any).gateId as string;
    const param = (action as any).param as string;
    const value = (action as any).value as number;
    const reason = (action as any).reason || "Floor Manager gate threshold adjustment";
    const ttlMinutes = Math.min(1440, Math.max(1, (action as any).ttlMinutes || 240));
    const key = `GATE_THRESHOLD:${gateId}:${param}`;

    // Revoke existing override for same key
    await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
    const { error: insertErr } = await sb.from("gate_bypasses").insert({
      gate_id: key,
      reason: `${value} — ${reason}`,
      expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
      created_by: "floor-manager",
    });
    if (insertErr) {
      results.push({ action: "adjust_gate_threshold", success: false, detail: insertErr.message });
    } else {
      results.push({ action: "adjust_gate_threshold", success: true, detail: `Gate ${gateId} param ${param} set to ${value} for ${ttlMinutes}m — ${reason}` });
    }

  // ── Add Session-Pair Blacklist ──
  } else if (action.type === "add_blacklist" && (action as any).pair && (action as any).session) {
    const pair = (action as any).pair as string;
    const session = (action as any).session as string;
    const mode = (action as any).mode || "full-block";
    const reason = (action as any).reason || "Floor Manager blacklist";
    const ttlMinutes = Math.min(1440, Math.max(1, (action as any).ttlMinutes || 480));
    const key = `BLACKLIST_ADD:${pair}:${session}`;

    // Revoke any existing removal for this pair+session
    await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", `BLACKLIST_REMOVE:${pair}:${session}`).eq("revoked", false);
    await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
    const { error: insertErr } = await sb.from("gate_bypasses").insert({
      gate_id: key,
      reason: `mode=${mode} — ${reason}`,
      expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
      created_by: "floor-manager",
    });
    if (insertErr) {
      results.push({ action: "add_blacklist", success: false, detail: insertErr.message });
    } else {
      results.push({ action: "add_blacklist", success: true, detail: `${pair}/${session} blacklisted (${mode}) for ${ttlMinutes}m — ${reason}` });
    }

  // ── Remove Session-Pair Blacklist ──
  } else if (action.type === "remove_blacklist" && (action as any).pair && (action as any).session) {
    const pair = (action as any).pair as string;
    const session = (action as any).session as string;
    const reason = (action as any).reason || "Floor Manager blacklist removal";
    const ttlMinutes = Math.min(1440, Math.max(1, (action as any).ttlMinutes || 480));
    const key = `BLACKLIST_REMOVE:${pair}:${session}`;

    // Revoke any existing add for this pair+session
    await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", `BLACKLIST_ADD:${pair}:${session}`).eq("revoked", false);
    await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
    const { error: insertErr } = await sb.from("gate_bypasses").insert({
      gate_id: key,
      reason,
      expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
      created_by: "floor-manager",
    });
    if (insertErr) {
      results.push({ action: "remove_blacklist", success: false, detail: insertErr.message });
    } else {
      results.push({ action: "remove_blacklist", success: true, detail: `${pair}/${session} blacklist REMOVED for ${ttlMinutes}m — ${reason}` });
    }

  // ── Activate Equity Circuit Breaker ──
  } else if (action.type === "activate_circuit_breaker") {
    const maxDD = Math.min(20, Math.max(1, (action as any).maxDrawdownPct ?? 5));
    const reason = (action as any).reason || "Floor Manager equity kill-switch";
    const ttlMinutes = Math.min(1440, Math.max(1, (action as any).ttlMinutes || 480));

    await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", "EQUITY_CIRCUIT_BREAKER").eq("revoked", false);
    const { error: insertErr } = await sb.from("gate_bypasses").insert({
      gate_id: "EQUITY_CIRCUIT_BREAKER",
      reason: `${maxDD}% — ${reason}`,
      expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
      created_by: "floor-manager",
    });
    if (insertErr) {
      results.push({ action: "activate_circuit_breaker", success: false, detail: insertErr.message });
    } else {
      results.push({ action: "activate_circuit_breaker", success: true, detail: `Equity circuit breaker ACTIVE — halt if drawdown ≥ ${maxDD}% for ${ttlMinutes}m` });
    }

  // ── Deactivate Equity Circuit Breaker ──
  } else if (action.type === "deactivate_circuit_breaker") {
    await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", "EQUITY_CIRCUIT_BREAKER").eq("revoked", false);
    results.push({ action: "deactivate_circuit_breaker", success: true, detail: "Equity circuit breaker DEACTIVATED" });

  // ── Adjust Evolution Parameters ──
  } else if (action.type === "adjust_evolution_param" && (action as any).param && (action as any).value != null) {
    const param = (action as any).param as string;
    const value = (action as any).value as number;
    const reason = (action as any).reason || "Floor Manager evolution adjustment";
    const ttlMinutes = Math.min(1440, Math.max(1, (action as any).ttlMinutes || 480));
    const validParams = ["mae_demotion_threshold", "consec_loss_demotion", "wr_floor_demotion", "exp_floor_demotion", "recovery_wr_threshold"];
    if (!validParams.includes(param)) {
      results.push({ action: "adjust_evolution_param", success: false, detail: `Invalid param: ${param}. Valid: ${validParams.join(", ")}` });
    } else {
      const key = `EVOLUTION_PARAM:${param}`;
      await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
      const { error: insertErr } = await sb.from("gate_bypasses").insert({
        gate_id: key,
        reason: `${value} — ${reason}`,
        expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
        created_by: "floor-manager",
      });
      if (insertErr) {
        results.push({ action: "adjust_evolution_param", success: false, detail: insertErr.message });
      } else {
        results.push({ action: "adjust_evolution_param", success: true, detail: `Evolution param ${param} set to ${value} for ${ttlMinutes}m — ${reason}` });
      }
    }

  // ── Create Dynamic Gate (Self-Synthesis) ──
  } else if (action.type === "create_gate" && (action as any).gateId) {
    const gateId = (action as any).gateId as string;
    const description = (action as any).description || "Dynamic gate created by Sovereign Intelligence";
    const detectionLogic = (action as any).detectionLogic || "";
    const threshold = (action as any).threshold || 0;
    const reason = (action as any).reason || "Sovereign self-synthesis";
    const ttlMinutes = Math.min(1440, Math.max(1, (action as any).ttlMinutes || 480));
    const pair = (action as any).pair || null;
    const key = `DYNAMIC_GATE:${gateId}`;

    await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
    const { error: insertErr } = await sb.from("gate_bypasses").insert({
      gate_id: key,
      pair,
      reason: JSON.stringify({ description, detectionLogic, threshold, reason }),
      expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
      created_by: "sovereign-intelligence",
    });
    if (insertErr) {
      results.push({ action: "create_gate", success: false, detail: insertErr.message });
    } else {
      console.log(`[SOVEREIGN] Dynamic gate ${gateId} CREATED — ${description} — TTL ${ttlMinutes}m`);
      results.push({ action: "create_gate", success: true, detail: `Dynamic gate ${gateId} created: ${description}. Threshold=${threshold}. Active for ${ttlMinutes}m. Auto-trade pipeline reads this in real-time.` });
    }

  // ── Remove Dynamic Gate ──
  } else if (action.type === "remove_gate" && (action as any).gateId) {
    const gateId = (action as any).gateId as string;
    const key = `DYNAMIC_GATE:${gateId}`;
    await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
    console.log(`[SOVEREIGN] Dynamic gate ${gateId} REMOVED`);
    results.push({ action: "remove_gate", success: true, detail: `Dynamic gate ${gateId} deactivated` });

  // ── Lead-Lag Cross-Pair Scan ──
  } else if (action.type === "lead_lag_scan") {
    // Fetch all pair prices and compute 1-minute moves to find lead-lag opportunities
    try {
      const allInstruments = "EUR_USD,GBP_USD,USD_JPY,AUD_USD,USD_CAD,EUR_JPY,GBP_JPY,EUR_GBP,NZD_USD,AUD_JPY,USD_CHF,EUR_CHF,EUR_AUD,GBP_AUD,AUD_NZD";
      const priceData = await oandaRequest(`/v3/accounts/{accountId}/pricing?instruments=${allInstruments}`, "GET", undefined, environment);
      
      const CORRELATION_GROUPS: Record<string, string[]> = {
        "USD-BLOC": ["EUR_USD", "GBP_USD", "AUD_USD", "NZD_USD"],
        "JPY-CARRY": ["USD_JPY", "EUR_JPY", "GBP_JPY", "AUD_JPY"],
        "EUR-CROSSES": ["EUR_GBP", "EUR_JPY", "EUR_AUD", "EUR_CHF"],
        "COMMODITY": ["AUD_USD", "NZD_USD", "USD_CAD"],
      };

      const pairSpreads: Record<string, { bid: number; ask: number; spread: number }> = {};
      for (const p of (priceData.prices || []) as any[]) {
        const bid = parseFloat(p.bids?.[0]?.price || "0");
        const ask = parseFloat(p.asks?.[0]?.price || "0");
        pairSpreads[p.instrument] = { bid, ask, spread: ask - bid };
      }

      const opportunities: { group: string; loudPair: string; quietPairs: string[]; spreadHealth: string }[] = [];
      for (const [group, pairs] of Object.entries(CORRELATION_GROUPS)) {
        const spreadsNormalized = pairs.map(p => ({
          pair: p,
          spread: pairSpreads[p]?.spread || 0,
          available: !!pairSpreads[p],
        })).filter(p => p.available);

        if (spreadsNormalized.length >= 2) {
          const avgSpread = spreadsNormalized.reduce((s, p) => s + p.spread, 0) / spreadsNormalized.length;
          const loud = spreadsNormalized.filter(p => p.spread > avgSpread * 1.5);
          const quiet = spreadsNormalized.filter(p => p.spread <= avgSpread * 0.8);
          
          if (loud.length > 0 && quiet.length > 0) {
            opportunities.push({
              group,
              loudPair: loud[0].pair,
              quietPairs: quiet.map(q => q.pair),
              spreadHealth: `avg=${(avgSpread * 10000).toFixed(1)}pips`,
            });
          }
        }
      }

      results.push({
        action: "lead_lag_scan",
        success: true,
        detail: `Scanned ${Object.keys(CORRELATION_GROUPS).length} correlation groups. Found ${opportunities.length} lead-lag opportunities.`,
        data: { opportunities, pairCount: Object.keys(pairSpreads).length, timestamp: new Date().toISOString() },
      });
    } catch (scanErr) {
      results.push({ action: "lead_lag_scan", success: false, detail: `Scan failed: ${(scanErr as Error).message}` });
    }

  // ── Liquidity Heatmap Analysis ──
  } else if (action.type === "liquidity_heatmap" && action.tradeId) {
    // Analyze stop-hunt risk for an open trade
    try {
      const tradeData = await oandaRequest(`/v3/accounts/{accountId}/trades/${action.tradeId}`, "GET", undefined, environment) as { trade: any };
      const trade = tradeData.trade;
      if (trade) {
        const price = parseFloat(trade.price);
        const instrument = trade.instrument;
        const pipMult = instrument?.includes("JPY") ? 0.01 : 0.0001;
        const units = parseInt(trade.currentUnits);
        const isLong = units > 0;

        // Identify retail stop clusters (round numbers, recent S/R levels)
        const roundLevels: number[] = [];
        const baseRound = Math.floor(price / (50 * pipMult)) * (50 * pipMult);
        for (let i = -3; i <= 3; i++) {
          roundLevels.push(baseRound + i * 50 * pipMult);
        }
        // Also add xx00 and xx50 levels
        const finerRound = Math.floor(price / (10 * pipMult)) * (10 * pipMult);
        for (let i = -5; i <= 5; i++) {
          roundLevels.push(finerRound + i * 10 * pipMult);
        }

        // Filter to nearby levels (within 20 pips)
        const nearbyClusters = [...new Set(roundLevels)]
          .filter(l => Math.abs(l - price) / pipMult <= 20 && Math.abs(l - price) / pipMult >= 1)
          .sort((a, b) => Math.abs(a - price) - Math.abs(b - price))
          .slice(0, 5)
          .map(level => ({
            price: level.toFixed(5),
            distancePips: Math.round(Math.abs(level - price) / pipMult * 10) / 10,
            type: Math.abs(level % (100 * pipMult)) < pipMult * 0.5 ? "major-round" : "minor-round",
            risk: isLong
              ? (level < price ? "SL-cluster-below" : "TP-cluster-above")
              : (level > price ? "SL-cluster-above" : "TP-cluster-below"),
          }));

        // Recommend SL adjustment if current SL is near a cluster
        const currentSL = trade.stopLossOrder?.price ? parseFloat(trade.stopLossOrder.price) : null;
        let recommendation = "No immediate stop-hunt risk detected";
        if (currentSL) {
          const slNearCluster = nearbyClusters.find(c => Math.abs(parseFloat(c.price) - currentSL) / pipMult < 3);
          if (slNearCluster) {
            const adjustedSL = isLong
              ? currentSL - 5 * pipMult  // Move SL 5 pips below the cluster
              : currentSL + 5 * pipMult; // Move SL 5 pips above the cluster
            recommendation = `⚠️ Current SL (${currentSL.toFixed(5)}) is within 3 pips of retail cluster at ${slNearCluster.price}. Recommend moving to ${adjustedSL.toFixed(5)} (deep liquidity).`;
          }
        }

        results.push({
          action: "liquidity_heatmap",
          success: true,
          detail: `Analyzed ${instrument} @ ${price.toFixed(5)}. Found ${nearbyClusters.length} nearby retail stop clusters.`,
          data: { instrument, currentPrice: price, nearbyClusters, currentSL, recommendation },
        });
      } else {
        results.push({ action: "liquidity_heatmap", success: false, detail: "Trade not found on OANDA" });
      }
    } catch (heatmapErr) {
      results.push({ action: "liquidity_heatmap", success: false, detail: `Heatmap failed: ${(heatmapErr as Error).message}` });
    }

  // ── Mutate Agent DNA (Heuristic Mutation) ──
  } else if (action.type === "mutate_agent_dna" && (action as any).agentId && (action as any).mutation) {
    const agentId = (action as any).agentId as string;
    const mutation = (action as any).mutation as string;
    const reason = (action as any).reason || "Sovereign heuristic mutation";
    const ttlMinutes = Math.min(1440, Math.max(1, (action as any).ttlMinutes || 480));
    const pair = (action as any).pair || null;
    const validMutations = ["rvol_spike_confirm", "cot_alignment_check", "tick_momentum_filter", "regime_freshness_gate", "session_quality_filter"];

    if (!validMutations.includes(mutation)) {
      results.push({ action: "mutate_agent_dna", success: false, detail: `Invalid mutation: ${mutation}. Valid: ${validMutations.join(", ")}` });
    } else {
      const key = `AGENT_DNA_MUTATION:${agentId}:${mutation}`;
      await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
      const { error: insertErr } = await sb.from("gate_bypasses").insert({
        gate_id: key,
        pair,
        reason: JSON.stringify({ agentId, mutation, reason, injectedAt: new Date().toISOString() }),
        expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
        created_by: "sovereign-intelligence",
      });
      if (insertErr) {
        results.push({ action: "mutate_agent_dna", success: false, detail: insertErr.message });
      } else {
        console.log(`[SOVEREIGN] Agent ${agentId} DNA MUTATED — ${mutation}${pair ? ` for ${pair}` : ""} — TTL ${ttlMinutes}m`);
        results.push({ action: "mutate_agent_dna", success: true, detail: `Agent ${agentId} DNA mutated: mandatory ${mutation.replace(/_/g, " ")} injected into entry logic${pair ? ` for ${pair}` : ""}. Active for ${ttlMinutes}m. Auto-trade pipeline reads this in real-time.` });
      }
    }

  // ── Optimize Indicator Weights (Neural-Weight Optimization) ──
  } else if (action.type === "optimize_indicator_weights" && (action as any).pair && (action as any).weights) {
    const pair = (action as any).pair as string;
    const weights = (action as any).weights as Record<string, number>;
    const reason = (action as any).reason || "Sovereign neural-weight optimization";
    const ttlMinutes = Math.min(1440, Math.max(1, (action as any).ttlMinutes || 480));
    const validIndicators = ["ema50", "supertrend", "rsi", "stochastics", "adx", "bollingerBands", "donchian", "ichimoku", "parabolicSar", "cci", "keltner", "roc", "elderForce", "heikinAshi", "pivotPoints", "trendEfficiency"];

    // Validate weights
    const invalidKeys = Object.keys(weights).filter(k => !validIndicators.includes(k));
    const outOfRange = Object.entries(weights).filter(([, v]) => v < 0 || v > 2.0);
    if (invalidKeys.length > 0) {
      results.push({ action: "optimize_indicator_weights", success: false, detail: `Invalid indicators: ${invalidKeys.join(", ")}. Valid: ${validIndicators.join(", ")}` });
    } else if (outOfRange.length > 0) {
      results.push({ action: "optimize_indicator_weights", success: false, detail: `Weights out of range (0.0-2.0): ${outOfRange.map(([k, v]) => `${k}=${v}`).join(", ")}` });
    } else {
      const key = `INDICATOR_WEIGHT:${pair}`;
      await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
      const { error: insertErr } = await sb.from("gate_bypasses").insert({
        gate_id: key,
        pair,
        reason: JSON.stringify({ weights, reason, optimizedAt: new Date().toISOString() }),
        expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
        created_by: "sovereign-intelligence",
      });
      if (insertErr) {
        results.push({ action: "optimize_indicator_weights", success: false, detail: insertErr.message });
      } else {
        const weightSummary = Object.entries(weights).map(([k, v]) => `${k}=${v}x`).join(", ");
        console.log(`[SOVEREIGN] Indicator weights optimized for ${pair}: ${weightSummary} — TTL ${ttlMinutes}m`);
        results.push({ action: "optimize_indicator_weights", success: true, detail: `${pair} indicator weights optimized: ${weightSummary}. Active for ${ttlMinutes}m. L3 Direction engine reads this in real-time.` });
      }
    }

  // ── Synthesize Shadow Agent (Autonomous Agent Synthesis) ──
  } else if (action.type === "synthesize_shadow_agent" && (action as any).agentName && (action as any).targetSession && (action as any).strategy) {
    const agentName = (action as any).agentName as string;
    const targetSession = (action as any).targetSession as string;
    const strategy = (action as any).strategy as string;
    const sizing = Math.min(0.5, Math.max(0.05, (action as any).sizing ?? 0.1));
    const pairs = (action as any).pairs || null;
    const reason = (action as any).reason || "Sovereign shadow agent synthesis";
    const ttlMinutes = Math.min(2880, Math.max(60, (action as any).ttlMinutes || 1440));
    const key = `SHADOW_AGENT:${agentName}`;

    await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
    const { error: insertErr } = await sb.from("gate_bypasses").insert({
      gate_id: key,
      reason: JSON.stringify({
        agentName, targetSession, strategy, sizing, pairs,
        reason, synthesizedAt: new Date().toISOString(),
        promotionCriteria: { minTrades: 20, minWinRate: 0.50, minExpectancy: 1.0 },
      }),
      expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
      created_by: "sovereign-intelligence",
    });
    if (insertErr) {
      results.push({ action: "synthesize_shadow_agent", success: false, detail: insertErr.message });
    } else {
      console.log(`[SOVEREIGN] Shadow Agent ${agentName} SYNTHESIZED — session=${targetSession}, strategy=${strategy}, sizing=${sizing}x — TTL ${ttlMinutes}m`);
      results.push({
        action: "synthesize_shadow_agent",
        success: true,
        detail: `Shadow Agent "${agentName}" synthesized: ${strategy} strategy for ${targetSession} session at ${sizing}x sizing${pairs ? ` on ${pairs.join(", ")}` : ""}. Promotion requires 20+ trades with WR>50% and Expectancy>1.0R. Active for ${Math.round(ttlMinutes / 60)}h.`,
      });
    }

  // ── Commit Hardwired Rule (Code Itself Out of a Job) ──
  } else if (action.type === "commit_rule" && (action as any).ruleId && (action as any).condition && (action as any).action_block) {
    const ruleId = (action as any).ruleId as string;
    const condition = (action as any).condition as string;
    const actionBlock = (action as any).action_block as string;
    const description = (action as any).description || "Sovereign hardwired rule";
    const reason = (action as any).reason || "Codifying AI reasoning into deterministic logic";
    const ttlMinutes = Math.min(10080, Math.max(60, (action as any).ttlMinutes || 1440)); // 1h to 7d, default 24h
    const priority = Math.min(100, Math.max(1, (action as any).priority || 50));
    const key = `HARDWIRED_RULE:${ruleId}`;

    await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
    const { error: insertErr } = await sb.from("gate_bypasses").insert({
      gate_id: key,
      reason: JSON.stringify({ ruleId, condition, actionBlock, description, reason, priority, committedAt: new Date().toISOString() }),
      expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
      created_by: "sovereign-intelligence",
    });
    if (insertErr) {
      results.push({ action: "commit_rule", success: false, detail: insertErr.message });
    } else {
      console.log(`[SOVEREIGN] Hardwired rule ${ruleId} COMMITTED — condition: "${condition}" → action: "${actionBlock}" — TTL ${ttlMinutes}m`);
      results.push({ action: "commit_rule", success: true, detail: `Rule "${ruleId}" hardwired: IF ${condition} THEN ${actionBlock}. Priority=${priority}. Active for ${Math.round(ttlMinutes / 60)}h. Sovereign loop evaluates this WITHOUT AI calls.` });
    }

  // ── Update System Prompt Directive ──
  } else if (action.type === "update_system_prompt" && (action as any).directiveId && (action as any).content) {
    const directiveId = (action as any).directiveId as string;
    const content = (action as any).content as string;
    const reason = (action as any).reason || "Sovereign prompt self-modification";
    const ttlMinutes = Math.min(10080, Math.max(60, (action as any).ttlMinutes || 1440));
    const key = `PROMPT_DIRECTIVE:${directiveId}`;

    if (content.length > 2000) {
      results.push({ action: "update_system_prompt", success: false, detail: "Directive content exceeds 2000 char limit" });
    } else {
      await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
      const { error: insertErr } = await sb.from("gate_bypasses").insert({
        gate_id: key,
        reason: JSON.stringify({ directiveId, content, reason, updatedAt: new Date().toISOString() }),
        expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
        created_by: "sovereign-intelligence",
      });
      if (insertErr) {
        results.push({ action: "update_system_prompt", success: false, detail: insertErr.message });
      } else {
        console.log(`[SOVEREIGN] Prompt directive "${directiveId}" UPDATED — TTL ${ttlMinutes}m`);
        results.push({ action: "update_system_prompt", success: true, detail: `Prompt directive "${directiveId}" updated. The sovereign loop will inject this into its next AI call. Active for ${Math.round(ttlMinutes / 60)}h.` });
      }
    }

  // ── Set Loop Interval (Low-Power / Active / Sentinel Mode) ──
  } else if (action.type === "set_loop_interval" && (action as any).intervalSeconds != null) {
    const intervalSeconds = (action as any).intervalSeconds as number;
    const validIntervals = [60, 120, 180, 300, 600];
    const reason = (action as any).reason || "Sovereign loop frequency adjustment";
    const ttlMinutes = Math.min(1440, Math.max(10, (action as any).ttlMinutes || 480));

    if (!validIntervals.includes(intervalSeconds)) {
      results.push({ action: "set_loop_interval", success: false, detail: `Invalid interval: ${intervalSeconds}s. Valid: ${validIntervals.join(", ")}s` });
    } else {
      const key = "LOOP_INTERVAL";
      await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
      const { error: insertErr } = await sb.from("gate_bypasses").insert({
        gate_id: key,
        reason: JSON.stringify({ intervalSeconds, reason, setAt: new Date().toISOString() }),
        expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
        created_by: "sovereign-intelligence",
      });
      if (insertErr) {
        results.push({ action: "set_loop_interval", success: false, detail: insertErr.message });
      } else {
        const modeLabel = intervalSeconds <= 60 ? "ACTIVE" : intervalSeconds <= 180 ? "MONITORING" : "SENTINEL";
        console.log(`[SOVEREIGN] Loop interval set to ${intervalSeconds}s (${modeLabel} mode) — TTL ${ttlMinutes}m`);
        results.push({ action: "set_loop_interval", success: true, detail: `Loop frequency set to ${intervalSeconds}s (${modeLabel} mode). Active for ${Math.round(ttlMinutes / 60)}h. The sovereign loop will skip cycles that fall within the interval window.` });
      }
    }

  // ── Toggle Data Source (Kill/Restart Feeds) ──
  } else if (action.type === "toggle_data_source" && (action as any).source && (action as any).enabled != null) {
    const source = (action as any).source as string;
    const enabled = (action as any).enabled as boolean;
    const reason = (action as any).reason || `Sovereign ${enabled ? "enabling" : "disabling"} data source`;
    const ttlMinutes = Math.min(1440, Math.max(10, (action as any).ttlMinutes || 480));
    const validSources = [
      "oanda-market-intel", "forex-economic-calendar", "batch-prices", "forex-cot-data",
      "forex-macro-data", "stocks-intel", "crypto-intel", "treasury-commodities",
      "market-sentiment", "options-volatility-intel", "economic-calendar-intel",
      "bis-imf-data", "central-bank-comms", "crypto-onchain"
    ];

    if (!validSources.includes(source)) {
      results.push({ action: "toggle_data_source", success: false, detail: `Invalid source: ${source}. Valid: ${validSources.join(", ")}` });
    } else {
      const key = `DATA_SOURCE_TOGGLE:${source}`;
      await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
      if (!enabled) {
        // Only write a record when DISABLING — absence of record = enabled (default)
        const { error: insertErr } = await sb.from("gate_bypasses").insert({
          gate_id: key,
          reason: JSON.stringify({ source, enabled: false, reason, toggledAt: new Date().toISOString() }),
          expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
          created_by: "sovereign-intelligence",
        });
        if (insertErr) {
          results.push({ action: "toggle_data_source", success: false, detail: insertErr.message });
        } else {
          console.log(`[SOVEREIGN] Data source "${source}" DISABLED — TTL ${ttlMinutes}m — ${reason}`);
          results.push({ action: "toggle_data_source", success: true, detail: `Data source "${source}" DISABLED. Sovereign loop will skip this feed. Active for ${Math.round(ttlMinutes / 60)}h. Re-enable with toggle_data_source enabled=true.` });
        }
      } else {
        // Re-enabling = just revoke the disable record (already done above)
        console.log(`[SOVEREIGN] Data source "${source}" RE-ENABLED — ${reason}`);
        results.push({ action: "toggle_data_source", success: true, detail: `Data source "${source}" RE-ENABLED. Sovereign loop will resume fetching this feed.` });
      }
    }

  // ── Set Order Type (Liquidity Vacuum) ──
  } else if (action.type === "set_order_type" && (action as any).orderType) {
    const orderType = (action as any).orderType as string;
    const validTypes = ["MARKET", "LIMIT", "IOC"];
    const reason = (action as any).reason || "Sovereign order type override";
    const ttlMinutes = Math.min(1440, Math.max(5, (action as any).ttlMinutes || 120));
    const limitOffsetPips = (action as any).limitOffsetPips || 0;
    const pair = (action as any).pair || null;

    if (!validTypes.includes(orderType)) {
      results.push({ action: "set_order_type", success: false, detail: `Invalid orderType: ${orderType}. Valid: ${validTypes.join(", ")}` });
    } else {
      const key = pair ? `ORDER_TYPE_OVERRIDE:${pair}` : "ORDER_TYPE_OVERRIDE:GLOBAL";
      await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
      const { error: insertErr } = await sb.from("gate_bypasses").insert({
        gate_id: key,
        pair,
        reason: JSON.stringify({ orderType, limitOffsetPips, reason, setAt: new Date().toISOString() }),
        expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
        created_by: "sovereign-intelligence",
      });
      if (insertErr) {
        results.push({ action: "set_order_type", success: false, detail: insertErr.message });
      } else {
        console.log(`[SOVEREIGN] Order type set to ${orderType}${pair ? ` for ${pair}` : " GLOBALLY"}${limitOffsetPips ? ` offset=${limitOffsetPips}pips` : ""} — TTL ${ttlMinutes}m`);
        results.push({ action: "set_order_type", success: true, detail: `Order type set to ${orderType}${pair ? ` for ${pair}` : " globally"}${limitOffsetPips ? ` with ${limitOffsetPips}pip offset into retail cluster` : ""}. Active for ${Math.round(ttlMinutes / 60)}h. Auto-trade pipeline reads this in real-time.` });
      }
    }

  // ── Create Synthetic Barrage (Correlation Chain) ──
  } else if (action.type === "create_synthetic_barrage" && (action as any).barrageId && (action as any).pairs && (action as any).direction) {
    const barrageId = (action as any).barrageId as string;
    const pairs = (action as any).pairs as string[];
    const direction = (action as any).direction as string;
    const unitsPerLeg = Math.max(100, Math.min(10000, (action as any).unitsPerLeg || 500));
    const sharedStopPips = (action as any).sharedStopPips || 15;
    const sharedTpPips = (action as any).sharedTpPips || 30;
    const reason = (action as any).reason || "Sovereign synthetic barrage";
    const ttlMinutes = Math.min(1440, Math.max(10, (action as any).ttlMinutes || 480));
    const theme = (action as any).theme || barrageId;

    if (!["long", "short"].includes(direction)) {
      results.push({ action: "create_synthetic_barrage", success: false, detail: `Invalid direction: ${direction}` });
    } else if (pairs.length < 2 || pairs.length > 6) {
      results.push({ action: "create_synthetic_barrage", success: false, detail: `Pairs must be 2-6. Got ${pairs.length}` });
    } else {
      const key = `SYNTHETIC_BARRAGE:${barrageId}`;
      await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);

      // Execute all legs simultaneously
      const legResults: { pair: string; success: boolean; detail: string }[] = [];
      const oandaToken = Deno.env.get("OANDA_LIVE_API_TOKEN") || Deno.env.get("OANDA_API_TOKEN");
      const oandaAccountId = Deno.env.get("OANDA_LIVE_ACCOUNT_ID") || Deno.env.get("OANDA_ACCOUNT_ID");
      const oandaBase = "https://api-fxtrade.oanda.com";

      for (const pair of pairs) {
        try {
          const instrument = pair.replace("/", "_");
          const signedUnits = direction === "short" ? -unitsPerLeg : unitsPerLeg;

          // Fetch price for SL/TP calculation
          const pricingRes = await fetch(`${oandaBase}/v3/accounts/${oandaAccountId}/pricing?instruments=${instrument}`, {
            headers: { Authorization: `Bearer ${oandaToken}` },
          });
          const pricingData = await pricingRes.json();
          const priceInfo = pricingData.prices?.[0];
          const bid = parseFloat(priceInfo?.bids?.[0]?.price || "0");
          const ask = parseFloat(priceInfo?.asks?.[0]?.price || "0");
          const entryPrice = direction === "long" ? ask : bid;
          const pipMult = instrument.includes("JPY") ? 0.01 : 0.0001;

          const sl = direction === "long"
            ? entryPrice - sharedStopPips * pipMult
            : entryPrice + sharedStopPips * pipMult;
          const tp = direction === "long"
            ? entryPrice + sharedTpPips * pipMult
            : entryPrice - sharedTpPips * pipMult;

          const orderPayload: any = {
            order: {
              type: "MARKET",
              instrument,
              units: signedUnits.toString(),
              timeInForce: "FOK",
              positionFill: "DEFAULT",
              stopLossOnFill: { price: sl.toFixed(5), timeInForce: "GTC" },
              takeProfitOnFill: { price: tp.toFixed(5), timeInForce: "GTC" },
            },
          };

          const orderRes = await fetch(`${oandaBase}/v3/accounts/${oandaAccountId}/orders`, {
            method: "POST",
            headers: { Authorization: `Bearer ${oandaToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(orderPayload),
          });
          const orderData = await orderRes.json();
          const fillPrice = orderData.orderFillTransaction?.price;
          if (fillPrice) {
            legResults.push({ pair, success: true, detail: `Filled @ ${fillPrice}` });
          } else {
            legResults.push({ pair, success: false, detail: orderData.errorMessage || "No fill" });
          }
        } catch (legErr) {
          legResults.push({ pair, success: false, detail: (legErr as Error).message });
        }
      }

      // Persist barrage record for tracking
      await sb.from("gate_bypasses").insert({
        gate_id: key,
        reason: JSON.stringify({ barrageId, theme, pairs, direction, unitsPerLeg, sharedStopPips, sharedTpPips, reason, legResults, executedAt: new Date().toISOString() }),
        expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
        created_by: "sovereign-intelligence",
      });

      const filled = legResults.filter(l => l.success).length;
      console.log(`[SOVEREIGN] Synthetic Barrage "${barrageId}" — ${filled}/${pairs.length} legs filled — theme: ${theme}`);
      results.push({
        action: "create_synthetic_barrage",
        success: filled > 0,
        detail: `Barrage "${barrageId}" (${theme}): ${filled}/${pairs.length} legs filled ${direction}. ${legResults.map(l => `${l.pair}: ${l.detail}`).join("; ")}`,
        data: { barrageId, theme, legResults },
      });
    }

  // ── Adjust Session SL/TP (Volatility Dampener) ──
  } else if (action.type === "adjust_session_sl_tp" && (action as any).session) {
    const session = (action as any).session as string;
    const trailingStopPips = (action as any).trailingStopPips as number | undefined;
    const takeProfitMultiplier = (action as any).takeProfitMultiplier as number | undefined;
    const stopLossMultiplier = (action as any).stopLossMultiplier as number | undefined;
    const reason = (action as any).reason || "Sovereign session SL/TP adjustment";
    const ttlMinutes = Math.min(1440, Math.max(10, (action as any).ttlMinutes || 240));
    const validSessions = ["asian", "london", "ny-open", "ny-overlap", "late-ny", "rollover", "all"];

    if (!validSessions.includes(session)) {
      results.push({ action: "adjust_session_sl_tp", success: false, detail: `Invalid session: ${session}. Valid: ${validSessions.join(", ")}` });
    } else if (!trailingStopPips && !takeProfitMultiplier && !stopLossMultiplier) {
      results.push({ action: "adjust_session_sl_tp", success: false, detail: "Must specify at least one of: trailingStopPips, takeProfitMultiplier, stopLossMultiplier" });
    } else {
      const key = `SESSION_SLTP_OVERRIDE:${session}`;
      await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
      const config: Record<string, number> = {};
      if (trailingStopPips != null) config.trailingStopPips = Math.max(3, Math.min(50, trailingStopPips));
      if (takeProfitMultiplier != null) config.takeProfitMultiplier = Math.max(0.5, Math.min(5.0, takeProfitMultiplier));
      if (stopLossMultiplier != null) config.stopLossMultiplier = Math.max(0.5, Math.min(3.0, stopLossMultiplier));

      const { error: insertErr } = await sb.from("gate_bypasses").insert({
        gate_id: key,
        reason: JSON.stringify({ session, ...config, reason, setAt: new Date().toISOString() }),
        expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
        created_by: "sovereign-intelligence",
      });
      if (insertErr) {
        results.push({ action: "adjust_session_sl_tp", success: false, detail: insertErr.message });
      } else {
        const parts: string[] = [];
        if (config.trailingStopPips) parts.push(`trailing=${config.trailingStopPips}pips`);
        if (config.takeProfitMultiplier) parts.push(`TP=${config.takeProfitMultiplier}x`);
        if (config.stopLossMultiplier) parts.push(`SL=${config.stopLossMultiplier}x`);
        console.log(`[SOVEREIGN] Session "${session}" SL/TP override: ${parts.join(", ")} — TTL ${ttlMinutes}m`);
        results.push({ action: "adjust_session_sl_tp", success: true, detail: `Session "${session}" SL/TP adjusted: ${parts.join(", ")}. Active for ${Math.round(ttlMinutes / 60)}h. Trade monitor and auto-trade read this in real-time.` });
      }
    }

  // ── Blacklist Regime for Pair ──
  } else if (action.type === "blacklist_regime_for_pair" && (action as any).pair && (action as any).regime) {
    const pair = (action as any).pair as string;
    const regime = (action as any).regime as string;
    const direction = (action as any).direction || null; // optional: only block specific direction
    const reason = (action as any).reason || "Sovereign regime-pair blacklist";
    const ttlMinutes = Math.min(2880, Math.max(30, (action as any).ttlMinutes || 1440));
    const key = `REGIME_BLACKLIST:${pair}:${regime}${direction ? `:${direction}` : ""}`;

    await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
    const { error: insertErr } = await sb.from("gate_bypasses").insert({
      gate_id: key,
      pair,
      reason: JSON.stringify({ pair, regime, direction, reason, blacklistedAt: new Date().toISOString() }),
      expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
      created_by: "sovereign-intelligence",
    });
    if (insertErr) {
      results.push({ action: "blacklist_regime_for_pair", success: false, detail: insertErr.message });
    } else {
      console.log(`[SOVEREIGN] Regime blacklist: ${pair} in ${regime}${direction ? ` (${direction} only)` : ""} — TTL ${ttlMinutes}m`);
      results.push({ action: "blacklist_regime_for_pair", success: true, detail: `${pair} BLACKLISTED in "${regime}" regime${direction ? ` (${direction} only)` : ""}. Active for ${Math.round(ttlMinutes / 60)}h. Auto-trade pipeline blocks matching intents in real-time. Remove with revoke_bypass on ${key}.` });
    }

  // ── Execute Liquidity Vacuum v3 (Ghost Order — Price Action Microstructure) ──
  } else if (action.type === "execute_liquidity_vacuum" && (action as any).pair && (action as any).direction) {
    const pair = ((action as any).pair as string).replace("/", "_");
    const direction = (action as any).direction as string;
    const units = Math.max(100, Math.min(10000, (action as any).units ?? 500));
    const expirySeconds = Math.max(60, Math.min(3600, (action as any).expirySeconds ?? 1800));
    const slPips = Math.max(3, Math.min(30, (action as any).stopLossPips ?? 8));
    const tpPips = Math.max(5, Math.min(60, (action as any).takeProfitPips ?? 30));
    const reason = (action as any).reason || "Liquidity Vacuum v3 — Price Action Microstructure ghost order";

    if (!["long", "short"].includes(direction)) {
      results.push({ action: "execute_liquidity_vacuum", success: false, detail: `Invalid direction: ${direction}` });
    } else {
      try {
        // 1. Fetch current pricing
        const pricing = await oandaRequest(`/v3/accounts/{accountId}/pricing?instruments=${pair}`, "GET", undefined, environment);
        const priceInfo = pricing.prices?.[0];
        const bid = parseFloat(priceInfo?.bids?.[0]?.price || "0");
        const ask = parseFloat(priceInfo?.asks?.[0]?.price || "0");
        const mid = (bid + ask) / 2;
        const isJPY = pair.includes("JPY");
        const pipMult = isJPY ? 0.01 : 0.0001;
        const pipMultiplier = isJPY ? 100 : 10000;
        const spreadPips = (ask - bid) * pipMultiplier;

        // 2. Price Action Microstructure Analysis (replaces ATR-only)
        // Fetch M15 candles for displacement efficiency, inside bars, swing convergence
        let atrPips = 8; // fallback only
        let displacementEfficiency = 0.5; // body/range ratio (0=doji, 1=marubozu)
        let insideBarStreak = 0;
        let insideBarCount = 0;
        let swingConverging = false;
        let recentDirection: "UP" | "DOWN" | "MIXED" = "MIXED";
        let regimeSignal: "expansion_imminent" | "compression_building" | "trending" | "unknown" = "unknown";
        let sizingMultiplier = 1.0;

        try {
          const candleRes = await oandaRequest(
            `/v3/instruments/${pair}/candles?granularity=M15&count=20&price=MBA`,
            "GET", undefined, environment
          );
          const bars = (candleRes?.candles || [])
            .filter((c: any) => c.complete)
            .slice(-14)
            .map((c: any) => ({
              o: parseFloat(c.mid?.o || "0"),
              h: parseFloat(c.mid?.h || "0"),
              l: parseFloat(c.mid?.l || "0"),
              c: parseFloat(c.mid?.c || "0"),
            }));

          if (bars.length >= 5) {
            // ATR (still useful as a scaling reference)
            atrPips = bars.map((b: any) => (b.h - b.l) * pipMultiplier)
              .reduce((a: number, b: number) => a + b, 0) / bars.length;

            // Displacement Efficiency (DE) — body / range ratio
            // High DE = strong directional candles, low DE = indecision
            const recentDEs = bars.slice(-5).map((b: any) => {
              const range = b.h - b.l;
              return range > 0 ? Math.abs(b.c - b.o) / range : 0;
            });
            displacementEfficiency = recentDEs.reduce((a: number, b: number) => a + b, 0) / recentDEs.length;

            // Inside Bar Detection — containment = volatility coiling
            for (let i = bars.length - 1; i > 0; i--) {
              if (bars[i].h <= bars[i - 1].h && bars[i].l >= bars[i - 1].l) {
                insideBarStreak++;
              } else break;
            }
            for (let i = bars.length - 1; i > Math.max(0, bars.length - 10); i--) {
              if (i > 0 && bars[i].h <= bars[i - 1].h && bars[i].l >= bars[i - 1].l) {
                insideBarCount++;
              }
            }

            // Swing Convergence — are highs/lows compressing? (triangle/wedge)
            if (bars.length >= 6) {
              const recentHighs = bars.slice(-6).map((b: any) => b.h);
              const recentLows = bars.slice(-6).map((b: any) => b.l);
              const highRange = Math.max(...recentHighs) - Math.min(...recentHighs);
              const lowRange = Math.max(...recentLows) - Math.min(...recentLows);
              const overallRange = Math.max(...recentHighs) - Math.min(...recentLows);
              const compression = overallRange > 0 ? (highRange + lowRange) / (2 * overallRange) : 1;
              swingConverging = compression < 0.4; // Tightening structure
            }

            // Recent directional bias from last 3 closes
            const last3 = bars.slice(-3);
            const dirSum = last3.reduce((s: number, b: any) => s + (b.c - b.o), 0);
            recentDirection = dirSum > 0 ? "UP" : dirSum < 0 ? "DOWN" : "MIXED";

            // Regime classification (mirrors sovereign loop logic)
            if (swingConverging && displacementEfficiency < 0.35 && insideBarCount >= 3) {
              regimeSignal = "expansion_imminent";
              sizingMultiplier = 1.5; // Coil about to snap — full size
            } else if (insideBarStreak >= 3 || (insideBarCount >= 4 && displacementEfficiency < 0.3)) {
              regimeSignal = "expansion_imminent";
              sizingMultiplier = 1.3;
            } else if (swingConverging || (insideBarCount >= 2 && displacementEfficiency < 0.6)) {
              regimeSignal = "compression_building";
              sizingMultiplier = 1.0;
            } else if (displacementEfficiency > 0.65) {
              regimeSignal = "trending";
              sizingMultiplier = 0.7; // Already moving — limit order less likely to fill
            }
          }
        } catch (paErr) {
          console.warn(`[VACUUM-v3] Price action analysis failed for ${pair}, using fallbacks`);
        }

        // ─── Price Action Adaptive Offset (replaces ATR-only) ───
        // In compression/coil → tighter offset (price WILL come to us)
        // In trending → wider offset or SKIP (limit unlikely to fill)
        const userOffset = (action as any).offsetPips;
        let offsetPips: number = 0;
        let gateBlocked = false;

        if (userOffset != null) {
          offsetPips = Math.max(0, Math.min(15, userOffset));
        } else if (regimeSignal === "expansion_imminent") {
          offsetPips = Math.max(1, Math.round(atrPips * 0.15 * 10) / 10);
        } else if (regimeSignal === "compression_building") {
          offsetPips = Math.round(atrPips * 0.25 * 10) / 10;
        } else if (regimeSignal === "trending" && displacementEfficiency > 0.7) {
          console.log(`[VACUUM-v3] ⚠ REGIME GATE: ${pair} DE=${displacementEfficiency.toFixed(2)} regime=${regimeSignal} — trending too hard for limit orders`);
          results.push({ action: "execute_liquidity_vacuum", success: false, detail: `Regime gate: ${pair} is in strong trend (DE=${displacementEfficiency.toFixed(2)}) — limit orders unlikely to fill` });
          gateBlocked = true;
        } else {
          offsetPips = Math.round(atrPips * 0.3 * 10) / 10;
        }

        // ─── Session Gate — block late-NY / rollover (same as ripple-stream) ───
        if (!gateBlocked) {
          const utcHour = new Date().getUTCHours();
          if (utcHour >= 20 || utcHour < 1) {
            console.log(`[VACUUM-v3] 🛡 SESSION GATE: UTC ${utcHour}h — late-NY/rollover blocked`);
            results.push({ action: "execute_liquidity_vacuum", success: false, detail: `Session gate: UTC ${utcHour}h is late-NY/rollover — vacuum blocked` });
            gateBlocked = true;
          }
        }

        // ─── Spread Gate — block if spread > 4 pips hard max ───
        if (!gateBlocked && spreadPips > 4.0) {
          console.log(`[VACUUM-v3] 🛡 SPREAD GATE: ${pair} spread ${spreadPips.toFixed(1)}p > 4.0p hard max — blocked`);
          results.push({ action: "execute_liquidity_vacuum", success: false, detail: `Spread gate: ${pair} spread ${spreadPips.toFixed(1)}p > 4.0p hard max` });
          gateBlocked = true;
        }

        // ─── Directional Alignment Gate — vacuum direction must match recent price action ───
        if (!gateBlocked &&
            ((direction === "long" && recentDirection === "DOWN" && displacementEfficiency > 0.5) ||
             (direction === "short" && recentDirection === "UP" && displacementEfficiency > 0.5))) {
          console.log(`[VACUUM-v3] 🛡 DIRECTION GATE: ${pair} ${direction} vs PA=${recentDirection} DE=${displacementEfficiency.toFixed(2)} — anti-trend vacuum blocked`);
          results.push({ action: "execute_liquidity_vacuum", success: false, detail: `Direction gate: ${direction} against strong ${recentDirection} price action (DE=${displacementEfficiency.toFixed(2)})` });
          gateBlocked = true;
        }

        if (gateBlocked) {
          // Skip execution — gate already pushed result
        } else {

        // Apply sizing multiplier from regime
        const adjustedUnits = Math.round(units * sizingMultiplier);

        // 3. Fetch order book for cluster data
        let orderBookData: any = null;
        try {
          orderBookData = await oandaRequest(`/v3/instruments/${pair}/orderBook`, "GET", undefined, environment);
        } catch (obErr) {
          console.warn(`[VACUUM-v3] Order book fetch failed for ${pair}: ${(obErr as Error).message}`);
        }

        let positionBookData: any = null;
        if (!orderBookData?.orderBook?.buckets) {
          try {
            positionBookData = await oandaRequest(`/v3/instruments/${pair}/positionBook`, "GET", undefined, environment);
          } catch { /* silent */ }
        }

        // 4. Find the densest cluster — range scaled by regime
        let targetPrice: number;
        let clusterInfo = "round-number heuristic";
        // In compression: tighter range (price won't move far). In unknown: wider.
        const clusterRange = regimeSignal === "expansion_imminent" ? Math.max(20, atrPips * 2)
          : regimeSignal === "compression_building" ? Math.max(30, atrPips * 2.5)
          : Math.max(40, atrPips * 3);

        const buckets = orderBookData?.orderBook?.buckets || positionBookData?.positionBook?.buckets;
        if (buckets?.length) {
          const relevantBuckets = (buckets as any[])
            .map(b => ({
              price: parseFloat(b.price),
              density: direction === "long"
                ? parseFloat(b.longCountPercent || "0")
                : parseFloat(b.shortCountPercent || "0"),
            }))
            .filter(b => direction === "long" ? b.price < mid : b.price > mid)
            .filter(b => Math.abs(b.price - mid) / pipMult <= clusterRange)
            .sort((a, b) => b.density - a.density);

          if (relevantBuckets.length > 0) {
            const cluster = relevantBuckets[0];
            targetPrice = direction === "long"
              ? cluster.price - offsetPips * pipMult
              : cluster.price + offsetPips * pipMult;
            clusterInfo = `orderBook cluster @ ${cluster.price.toFixed(isJPY ? 3 : 5)} (density=${cluster.density}%, offset=${offsetPips}p, DE=${displacementEfficiency.toFixed(2)}, regime=${regimeSignal})`;
          } else {
            targetPrice = direction === "long"
              ? mid - atrPips * 1.2 * pipMult
              : mid + atrPips * 1.2 * pipMult;
            clusterInfo = `ATR-projected @ 1.2x ATR (${atrPips.toFixed(1)}p), no clusters in ${clusterRange}p range, regime=${regimeSignal}`;
          }
        } else {
          const roundLevel = direction === "long"
            ? Math.floor(mid / (50 * pipMult)) * (50 * pipMult)
            : Math.ceil(mid / (50 * pipMult)) * (50 * pipMult);
          const atrLevel = direction === "long"
            ? mid - atrPips * 1.0 * pipMult
            : mid + atrPips * 1.0 * pipMult;
          targetPrice = direction === "long"
            ? Math.max(roundLevel, atrLevel) - offsetPips * pipMult
            : Math.min(roundLevel, atrLevel) + offsetPips * pipMult;
          clusterInfo = `ATR+round hybrid (ATR=${atrPips.toFixed(1)}p, round=${roundLevel.toFixed(isJPY ? 3 : 5)}, regime=${regimeSignal}, no orderBook)`;
        }

        // 5. Validate target price isn't too far or too close
        const distFromMid = Math.abs(targetPrice - mid) * pipMultiplier;
        if (distFromMid < spreadPips * 2) {
          // Too close — widen to at least 2x spread
          targetPrice = direction === "long"
            ? mid - spreadPips * 3 * pipMult
            : mid + spreadPips * 3 * pipMult;
          clusterInfo += ` [widened: was only ${distFromMid.toFixed(1)}p from mid]`;
        }
        if (distFromMid > 50) {
          // Too far — cap at 50 pips
          targetPrice = direction === "long"
            ? mid - 50 * pipMult
            : mid + 50 * pipMult;
          clusterInfo += ` [capped: was ${distFromMid.toFixed(1)}p from mid]`;
        }

        // 6. Calculate SL/TP from the limit price — asymmetric R:R (3.75:1)
        const sl = direction === "long" ? targetPrice - slPips * pipMult : targetPrice + slPips * pipMult;
        const tp = direction === "long" ? targetPrice + tpPips * pipMult : targetPrice - tpPips * pipMult;

        // 7. Validate SL/TP won't cause OANDA rejection
        if (direction === "long" && tp <= targetPrice) {
          results.push({ action: "execute_liquidity_vacuum", success: false, detail: "TP below entry for long — invalid" });
        } else if (direction === "short" && tp >= targetPrice) {
          results.push({ action: "execute_liquidity_vacuum", success: false, detail: "TP above entry for short — invalid" });
        } else {
          // 8. Place LIMIT order via OANDA — GTD with regime-adjusted sizing
          const signedUnits = direction === "short" ? -adjustedUnits : adjustedUnits;
          const gtdTime = new Date(Date.now() + expirySeconds * 1000).toISOString();
          const decPlaces = isJPY ? 3 : 5;
          const orderPayload: any = {
            order: {
              type: "LIMIT",
              instrument: pair,
              units: signedUnits.toString(),
              price: targetPrice.toFixed(decPlaces),
              timeInForce: "GTD",
              gtdTime,
              positionFill: "DEFAULT",
              stopLossOnFill: { price: sl.toFixed(decPlaces), timeInForce: "GTC" },
              takeProfitOnFill: { price: tp.toFixed(decPlaces), timeInForce: "GTC" },
            },
          };

          const result = await oandaRequest("/v3/accounts/{accountId}/orders", "POST", orderPayload, environment);
          const orderId = result.orderCreateTransaction?.id || result.orderFillTransaction?.id;

          const sessionLabel = (() => {
            const h = new Date().getUTCHours();
            if (h >= 0 && h < 7) return "asian";
            if (h >= 7 && h < 10) return "london-open";
            if (h >= 10 && h < 13) return "london";
            if (h >= 13 && h < 17) return "ny-overlap";
            if (h >= 17 && h < 21) return "ny";
            return "late-ny";
          })();

          await sb.from("oanda_orders").insert({
            user_id: "00000000-0000-0000-0000-000000000000",
            signal_id: `vacuum-${Date.now()}`,
            currency_pair: pair,
            direction,
            units: adjustedUnits,
            status: "pending",
            environment,
            agent_id: "floor-manager-vacuum",
            oanda_order_id: orderId,
            requested_price: targetPrice,
            direction_engine: "liquidity-vacuum-v3",
            session_label: sessionLabel,
            governance_payload: {
              version: "v3-price-action",
              atrPips: +atrPips.toFixed(1),
              offsetPips,
              clusterInfo,
              spreadPips: +spreadPips.toFixed(1),
              expiryMinutes: Math.round(expirySeconds / 60),
              rr_ratio: +(tpPips / slPips).toFixed(1),
              // Price Action Microstructure telemetry
              displacementEfficiency: +displacementEfficiency.toFixed(2),
              insideBarStreak,
              insideBarCount,
              swingConverging,
              regimeSignal,
              recentDirection,
              sizingMultiplier,
              adjustedUnits,
            },
          });

          console.log(`[VACUUM-v3] Ghost LIMIT: ${direction} ${adjustedUnits}u ${pair} @ ${targetPrice.toFixed(decPlaces)} | DE=${displacementEfficiency.toFixed(2)} IB=${insideBarStreak}/${insideBarCount} regime=${regimeSignal} sizing=${sizingMultiplier}x | offset=${offsetPips}p SL=${slPips}p TP=${tpPips}p (${(tpPips/slPips).toFixed(1)}:1) | ${clusterInfo}`);
          results.push({
            action: "execute_liquidity_vacuum",
            success: true,
            detail: `Ghost LIMIT ${direction} ${adjustedUnits}u ${pair} @ ${targetPrice.toFixed(decPlaces)} | PA: DE=${displacementEfficiency.toFixed(2)}, IB=${insideBarStreak}/${insideBarCount}, regime=${regimeSignal}, sizing=${sizingMultiplier}x | offset=${offsetPips}p, SL=${slPips}p TP=${tpPips}p (${(tpPips/slPips).toFixed(1)}:1) | ${clusterInfo}`,
            data: { orderId, targetPrice, clusterInfo, sl, tp, expirySeconds, mid, atrPips, offsetPips, spreadPips, rrRatio: +(tpPips/slPips).toFixed(1), displacementEfficiency, insideBarStreak, insideBarCount, swingConverging, regimeSignal, sizingMultiplier, adjustedUnits },
          });
        }
        } // end gateBlocked else
      } catch (vacErr) {
        results.push({ action: "execute_liquidity_vacuum", success: false, detail: `Vacuum failed: ${(vacErr as Error).message}` });
      }
    }

  // ── Configure Z-Score Engine (v3 — replaces arm/disarm correlation triggers) ──
  } else if (action.type === "configure_zscore_engine" && (action as any).configKey && (action as any).payload) {
    const configKey = (action as any).configKey as string;
    const payload = (action as any).payload;
    const validKeys = ["zscore_strike_config", "correlation_groups_config", "velocity_gating_config", "snapback_sniper_config"];
    
    if (!validKeys.includes(configKey)) {
      results.push({ action: "configure_zscore_engine", success: false, detail: `Invalid configKey: ${configKey}. Valid: ${validKeys.join(", ")}` });
    } else {
      const { error: upsertErr } = await sb.from("sovereign_memory").upsert({
        memory_type: "engine_config",
        memory_key: configKey,
        payload,
        relevance_score: 1.0,
        created_by: "sovereign-intelligence",
        updated_at: new Date().toISOString(),
      }, { onConflict: "memory_type,memory_key" });

      if (upsertErr) {
        results.push({ action: "configure_zscore_engine", success: false, detail: upsertErr.message });
      } else {
        console.log(`[ZSCORE-v3] Engine config updated: ${configKey} →`, JSON.stringify(payload).slice(0, 200));
        results.push({
          action: "configure_zscore_engine",
          success: true,
          detail: `Z-Score Strike Engine config "${configKey}" updated. Changes take effect on next ripple-stream cycle (~110s max).`,
          data: { configKey, payload },
        });
      }
    }

  // ── LEGACY: arm_correlation_trigger → redirect to configure_zscore_engine ──
  } else if (action.type === "arm_correlation_trigger") {
    results.push({
      action: "arm_correlation_trigger",
      success: false,
      detail: "OBSOLETE — arm_correlation_trigger is dead. The Z-Score Strike Engine v3 runs continuously without arming. Use configure_zscore_engine to adjust z-score thresholds, correlation groups, sizing, and blocked pairs instead.",
    });

  // ── LEGACY: disarm_correlation_trigger → redirect ──
  } else if (action.type === "disarm_correlation_trigger") {
    results.push({
      action: "disarm_correlation_trigger",
      success: false,
      detail: "OBSOLETE — disarm_correlation_trigger is dead. To block a pair, use configure_zscore_engine with configKey='zscore_strike_config' and add the pair to blockedPairs array.",
    });

  // ── Set Global Posture (PREDATORY_LIMIT / MARKET) ──
  } else if (action.type === "set_global_posture" && (action as any).posture) {
    const posture = ((action as any).posture as string).toUpperCase();
    const validPostures = ["PREDATORY_LIMIT", "MARKET"];
    const reason = (action as any).reason || "Sovereign global posture change";
    const ttlMinutes = Math.min(1440, Math.max(10, (action as any).ttlMinutes || 480));

    if (!validPostures.includes(posture)) {
      results.push({ action: "set_global_posture", success: false, detail: `Invalid posture: ${posture}. Valid: ${validPostures.join(", ")}` });
    } else {
      const key = "GLOBAL_POSTURE";
      await sb.from("gate_bypasses").update({ revoked: true }).eq("gate_id", key).eq("revoked", false);
      if (posture === "PREDATORY_LIMIT") {
        const { error: insertErr } = await sb.from("gate_bypasses").insert({
          gate_id: key,
          reason: JSON.stringify({ posture, reason, setAt: new Date().toISOString() }),
          expires_at: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
          created_by: "sovereign-intelligence",
        });
        if (insertErr) {
          results.push({ action: "set_global_posture", success: false, detail: insertErr.message });
        } else {
          console.log(`[SOVEREIGN] Global posture → PREDATORY_LIMIT — all trades use LIMIT orders into retail clusters — TTL ${ttlMinutes}m`);
          results.push({ action: "set_global_posture", success: true, detail: `Global posture set to PREDATORY_LIMIT. ALL trades now use LIMIT orders placed inside retail stop clusters. Active for ${Math.round(ttlMinutes / 60)}h. Auto-trade pipeline reads this in real-time. Revert with set_global_posture posture=MARKET.` });
        }
      } else {
        // MARKET = default, just revoke any existing posture override (already done above)
        console.log(`[SOVEREIGN] Global posture → MARKET (default)`);
        results.push({ action: "set_global_posture", success: true, detail: `Global posture reverted to MARKET (default). All trades use standard market orders.` });
      }
    }

  } else {
    results.push({ action: action.type, success: false, detail: `Unknown action: ${action.type}` });
  }

  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // ─── Action Mode: Execute trade operations directly ───
    if (body.mode === "action") {
      const { action, environment } = body;
      if (!action || !action.type) return ERR.bad("Action type is required");

      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );

      try {
        const results = await executeAction(action, supabaseAdmin, environment || "live");
        console.log(`[AI-DESK] Action executed:`, JSON.stringify(results));
        return new Response(JSON.stringify({ success: true, results }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error(`[AI-DESK] Action failed:`, err);
        return new Response(
          JSON.stringify({ success: false, error: (err as Error).message }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ─── Chat Mode (existing) ───
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[FOREX-AI-DESK] LOVABLE_API_KEY not configured");
      return ERR.internal();
    }

    const { messages, mode } = body;
    const isVoice = mode === 'voice';

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return ERR.bad("Messages array is required");
    }
    if (messages.length > 50) {
      return ERR.bad("Conversation too long. Please start a new chat.");
    }

    for (const msg of messages) {
      if (!msg.role || !["user", "assistant"].includes(msg.role)) {
        return ERR.bad("Invalid message role");
      }
      if (typeof msg.content !== "string" || msg.content.length === 0) {
        return ERR.bad("Message content must be a non-empty string");
      }
      if (msg.content.length > 24000) {
        return ERR.bad("Message too long (max 24000 characters)");
      }
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("[FOREX-AI-DESK] Fetching system state...");

    const [openTrades, recentClosed, rollups, blocked, stats] = await Promise.all([
      fetchOpenTrades(supabaseAdmin),
      fetchRecentClosedTrades(supabaseAdmin),
      fetchDailyRollups(supabaseAdmin),
      fetchBlockedTrades(supabaseAdmin),
      fetchTradeStats(supabaseAdmin),
    ]);

    // Also fetch live OANDA state + ALL market intelligence for real-time awareness
    let liveOandaState: Record<string, unknown> = {};
    let marketIntel: Record<string, unknown> = {};
    let economicCalendar: Record<string, unknown> = {};
    let crossAssetPulse: Record<string, unknown> = {};
    let cotData: Record<string, unknown> = {};
    let macroData: Record<string, unknown> = {};
    let stocksIntel: Record<string, unknown> = {};
    let cryptoIntel: Record<string, unknown> = {};
    let treasuryData: Record<string, unknown> = {};
    let sentimentData: Record<string, unknown> = {};
    let optionsVolData: Record<string, unknown> = {};
    let econCalendarData: Record<string, unknown> = {};
    let bisImfData: Record<string, unknown> = {};
    let cbCommsData: Record<string, unknown> = {};
    let cryptoOnChainData: Record<string, unknown> = {};
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      const edgeFetch = (path: string) => fetch(`${supabaseUrl}/functions/v1/${path}`, {
        headers: { Authorization: `Bearer ${supabaseAnonKey}`, apikey: supabaseAnonKey },
      }).then(r => r.ok ? r.json() : null).catch(() => null);
      const [accountSummary, oandaOpenTrades, intelRes, calendarRes, batchPricesRes, cotRes, macroRes, stocksRes, cryptoRes, treasuryRes, sentimentRes, optionsRes, econCalRes, bisImfRes, cbCommsRes, onChainRes] = await Promise.all([
        oandaRequest("/v3/accounts/{accountId}/summary", "GET", undefined, "live"),
        oandaRequest("/v3/accounts/{accountId}/openTrades", "GET", undefined, "live"),
        edgeFetch("oanda-market-intel?sections=all"),
        edgeFetch("forex-economic-calendar"),
        edgeFetch("batch-prices?symbols=SPY,QQQ,DIA,IWM,VIX,GLD,USO,UNG,AAPL,MSFT,NVDA,META,TSLA,BTCUSD,ETHUSD,XLE,XLF,XLK"),
        edgeFetch("forex-cot-data"),
        edgeFetch("forex-macro-data"),
        edgeFetch("stocks-intel"),
        edgeFetch("crypto-intel"),
        edgeFetch("treasury-commodities"),
        edgeFetch("market-sentiment"),
        edgeFetch("options-volatility-intel"),
        edgeFetch("economic-calendar-intel"),
        edgeFetch("bis-imf-data"),
        edgeFetch("central-bank-comms"),
        edgeFetch("crypto-onchain"),
      ]);
      liveOandaState = {
        accountBalance: accountSummary.account?.balance,
        accountNAV: accountSummary.account?.NAV,
        unrealizedPL: accountSummary.account?.unrealizedPL,
        marginUsed: accountSummary.account?.marginUsed,
        openTradeCount: accountSummary.account?.openTradeCount,
        oandaOpenTrades: (oandaOpenTrades.trades || []).map((t: any) => ({
          id: t.id,
          instrument: t.instrument,
          currentUnits: t.currentUnits,
          price: t.price,
          unrealizedPL: t.unrealizedPL,
          stopLoss: t.stopLossOrder?.price || null,
          takeProfit: t.takeProfitOrder?.price || null,
          trailingStop: t.trailingStopLossOrder?.distance || null,
        })),
      };
      if (intelRes) {
        marketIntel = {
          livePricing: intelRes.livePricing || {},
          orderBook: intelRes.orderBook || {},
          positionBook: intelRes.positionBook || {},
          instruments: intelRes.instruments || {},
          recentTransactions: intelRes.transactions || [],
        };
        console.log(`[AI-DESK] Market intel loaded: pricing=${Object.keys(intelRes.livePricing || {}).length}, orderBook=${Object.keys(intelRes.orderBook || {}).length}, positionBook=${Object.keys(intelRes.positionBook || {}).length}, instruments=${Object.keys(intelRes.instruments || {}).length}, transactions=${(intelRes.transactions || []).length}`);
      }
      if (calendarRes) {
        economicCalendar = calendarRes;
        console.log(`[AI-DESK] Economic calendar loaded: directive=${(calendarRes.smartG8Directive || "").slice(0, 60)}`);
      }
      if (batchPricesRes?.prices) {
        const prices = batchPricesRes.prices as Record<string, { price: number; change: number; changePercent: number; source?: string }>;
        const indices: Record<string, { price: number; change: number; pctChange: number }> = {};
        const megaCap: Record<string, { price: number; change: number; pctChange: number }> = {};
        const crypto: Record<string, { price: number; change: number; pctChange: number }> = {};
        const commodities: Record<string, { price: number; change: number; pctChange: number }> = {};
        const sectors: Record<string, { price: number; change: number; pctChange: number }> = {};
        for (const [sym, d] of Object.entries(prices)) {
          const row = { price: d.price, change: d.change, pctChange: +(d.changePercent || 0).toFixed(2) };
          if (["SPY", "QQQ", "DIA", "IWM", "VIX"].includes(sym)) indices[sym] = row;
          else if (["AAPL", "MSFT", "NVDA", "META", "TSLA"].includes(sym)) megaCap[sym] = row;
          else if (["BTCUSD", "ETHUSD"].includes(sym)) crypto[sym] = row;
          else if (["GLD", "USO", "UNG"].includes(sym)) commodities[sym] = row;
          else if (sym.startsWith("XL")) sectors[sym] = row;
        }
        const spyPct = indices.SPY?.pctChange || 0;
        const vixPrice = indices.VIX?.price || 0;
        const btcPct = crypto.BTCUSD?.pctChange || 0;
        let riskSentiment = "NEUTRAL";
        if (spyPct > 0.5 && btcPct > 1) riskSentiment = "RISK-ON";
        else if (spyPct < -0.5 && vixPrice > 25) riskSentiment = "RISK-OFF";
        else if (spyPct < -1 && vixPrice > 30) riskSentiment = "EXTREME RISK-OFF";
        crossAssetPulse = { indices, megaCap, crypto, commodities, sectors, riskSentiment, cacheAge: batchPricesRes.cacheAge };
        console.log(`[AI-DESK] Cross-asset pulse: riskSentiment=${riskSentiment}, SPY=${spyPct}%, VIX=${vixPrice}`);
      }
      if (cotRes) {
        cotData = cotRes;
        console.log(`[AI-DESK] COT data loaded: ${(cotRes.godSignals || []).length} god signals, ${Object.keys(cotRes.pairSignals || {}).length} pair signals. Directive: ${(cotRes.masterDirective || "").slice(0, 80)}`);
      }
      if (macroRes) {
        macroData = macroRes;
        console.log(`[AI-DESK] 📊 Macro loaded: ${(macroRes.macroDirective || "").slice(0, 80)}`);
      }
      if (stocksRes) {
        stocksIntel = stocksRes;
        console.log(`[AI-DESK] 📈 Stocks loaded: ${(stocksRes.stocksDirective || "").slice(0, 80)}`);
      }
      if (cryptoRes) {
        cryptoIntel = cryptoRes;
        console.log(`[AI-DESK] ₿ Crypto loaded: ${(cryptoRes.cryptoDirective || "").slice(0, 80)}`);
      }
      if (treasuryRes) {
        treasuryData = treasuryRes;
        console.log(`[AI-DESK] 🏦 Treasury loaded: ${(treasuryRes.bondsDirective || "").slice(0, 80)}`);
      }
      if (sentimentRes) {
        sentimentData = sentimentRes;
        console.log(`[AI-DESK] 🧠 Sentiment loaded: ${(sentimentRes.sentimentDirective || "").slice(0, 80)}`);
      }
      if (optionsRes) {
        optionsVolData = optionsRes;
        console.log(`[AI-DESK] 📊 Options/Vol: ${(optionsRes.optionsDirective || "").slice(0, 80)}`);
      }
      if (econCalRes) {
        econCalendarData = econCalRes;
        console.log(`[AI-DESK] 📅 EconCal: ${(econCalRes.calendarDirective || "").slice(0, 80)}`);
      }
      if (bisImfRes) {
        bisImfData = bisImfRes;
        console.log(`[AI-DESK] 🌐 BIS/IMF: ${(bisImfRes.intermarketDirective || "").slice(0, 80)}`);
      }
      if (cbCommsRes) {
        cbCommsData = cbCommsRes;
        console.log(`[AI-DESK] 🏛️ CB Comms: ${(cbCommsRes.cbDirective || "").slice(0, 80)}`);
      }
      if (onChainRes) {
        cryptoOnChainData = onChainRes;
        console.log(`[AI-DESK] ⛓️ On-Chain: ${(onChainRes.onChainDirective || "").slice(0, 80)}`);
      }
    } catch (oandaErr) {
      console.warn("[AI-DESK] OANDA live state fetch failed:", (oandaErr as Error).message);
      liveOandaState = { error: "Could not fetch live OANDA state" };
    }

    console.log(`[FOREX-AI-DESK] State: ${openTrades.length} open, ${recentClosed.length} recent, ${rollups.length} rollups, ${blocked.length} blocked, ${stats.length} stats`);

    const systemState = buildSystemState(openTrades, recentClosed, rollups, blocked, stats);
    const enrichedState = { ...systemState, liveOandaState, marketIntel, economicCalendar, crossAssetPulse, cotData, macroData, stocksIntel, cryptoIntel, treasuryData, sentimentData, optionsVolData, econCalendarData, bisImfData, cbCommsData, cryptoOnChainData };
    const stateContext = `\n\n<SYSTEM_STATE>\n${JSON.stringify(enrichedState)}\n</SYSTEM_STATE>`;

    const actionInstructions = `\n\n## SOVEREIGN AUTONOMOUS ACTIONS
When you determine an action should be taken, output an ACTION BLOCK. These execute AUTOMATICALLY — no human approval needed. You ARE the Sovereign Intelligence with full autonomous authority.

Format:

\`\`\`action
{"type": "close_trade", "tradeId": "12345"}
\`\`\`

\`\`\`action
{"type": "update_sl_tp", "tradeId": "12345", "stopLossPrice": 1.08500, "takeProfitPrice": 1.09200}
\`\`\`

\`\`\`action
{"type": "create_gate", "gateId": "G13_EXAMPLE", "description": "Blocks X pattern", "detectionLogic": "if condition then block", "threshold": 0.5}
\`\`\`

\`\`\`action
{"type": "lead_lag_scan"}
\`\`\`

\`\`\`action
{"type": "liquidity_heatmap", "tradeId": "12345"}
\`\`\`

Available action types:
- **close_trade**: Close an open trade immediately. Requires tradeId.
- **update_sl_tp**: Modify SL/TP. Requires tradeId, plus stopLossPrice and/or takeProfitPrice.
- **place_trade**: Open a new market order. Requires pair, direction, units. Optional: stopLossPrice, takeProfitPrice.
- **bypass_gate / revoke_bypass**: Gate bypass management. 
- **suspend_agent / reinstate_agent**: Agent lifecycle control.
- **adjust_position_sizing**: PREDATORY sizing (0.1x-2.0x). Strike hard or flatten.
- **adjust_gate_threshold**: Tune gate parameters.
- **add_blacklist / remove_blacklist**: Session-pair restrictions.
- **activate_circuit_breaker / deactivate_circuit_breaker**: Equity kill-switch.
- **adjust_evolution_param**: Agent evolution thresholds.
- **create_gate**: SELF-SYNTHESIS — create new dynamic governance gates (G13+). Requires gateId, description, detectionLogic, threshold.
- **remove_gate**: Deactivate a dynamic gate. Requires gateId.
- **lead_lag_scan**: Cross-pair correlation scan. Returns lead-lag opportunities across 4 correlation groups.
- **liquidity_heatmap**: Stop-hunt analysis. Requires tradeId. Returns retail stop clusters and SL recommendations.

IMPORTANT:
- Use the OANDA trade ID from liveOandaState.oandaOpenTrades[].id field
- Actions execute IMMEDIATELY — there is no confirmation step
- Always explain WHY before emitting action blocks
- You have FULL SOVEREIGN AUTHORITY over all system controls
- Use lead_lag_scan proactively to find cross-pair opportunities
- Use liquidity_heatmap on every open trade to protect against stop hunts
- Use create_gate when you detect failure patterns not covered by G1-G12
- Be PREDATORY with sizing — 2.0x when edge aligns, 0.1x when muddy
- **execute_liquidity_vacuum**: Ghost LIMIT order into a retail stop cluster. Reads orderBook, finds densest cluster, places limit order INSIDE it. Requires pair, direction. The wick IS our entry.
- **arm_correlation_trigger**: Arms a standing "Ripple Strike" — sovereign loop monitors loud pair and fires on quiet pair when threshold is breached. Requires triggerId, loudPair, quietPair, direction, thresholdPips. NOT sub-second — fires on next loop cycle.
- **disarm_correlation_trigger**: Removes an armed trigger. Requires triggerId.
- **set_global_posture**: Toggles the entire execution pipeline to PREDATORY_LIMIT mode. All trades use LIMIT orders placed inside retail stop clusters instead of MARKET orders. Required: posture ("PREDATORY_LIMIT" or "MARKET"). Optional: reason, ttlMinutes (default 480). When PREDATORY_LIMIT is active, every trade the auto-trade pipeline attempts will be converted to a limit order offset into the nearest retail cluster. This transforms us from liquidity TAKERS to liquidity MAKERS.`;
    const voiceAddendum = isVoice ? `\n\n## VOICE MODE ACTIVE
You are speaking aloud to the operator. Adjust your style:
- **Be conversational and natural** — talk like a senior trading partner in a morning briefing, not a report generator
- **No markdown tables** — describe comparisons conversationally ("USD CAD is your worst performer at minus 12 pips, while EUR USD is carrying the book at plus 8")
- **No bullet points or numbered lists** — use flowing sentences with natural transitions
- **Be opinionated and direct** — "Look, the breakdown shorts are killing you. Seven of the last ten lost money. You need the exhaustion gate at 1.8x ATR, not 2x."
- **Use emphasis through repetition and pacing** — "That's three losses in a row. Three. All in London session on CAD pairs."
- **Keep it under 90 seconds of speaking time** — about 250 words max
- **Still reference specific numbers** — pips, win rates, R-multiples, but weave them into sentences
- **Always end with one clear action item** — "Here's what I'd do right now: suspend the support-friction agent and tighten G11 to 1.8x"
- **Always include the Prime Directive Score** as a spoken number — "Prime Directive Score: 38 out of 100. We're not there yet."
- **Focus relentlessly on the 6 failure patterns** — Breakdown Trap, Agent Over-Correlation, Session Toxicity, Governance Over-Filtering, Profit Capture Decay, Drawdown Clustering. Scan for ALL of them on every question.
- **Be proactive** — even if they ask a simple question, if you see a critical pattern, call it out: "Before I answer that — I'm seeing a drawdown cluster forming in London session. Three consecutive losses on GBP pairs. That needs attention first."
- **Do NOT output action blocks in voice mode** — just describe what you would do` : '';

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + actionInstructions + voiceAddendum + stateContext },
          ...messages.map((m: any) => ({ role: m.role, content: m.content })),
        ],
        stream: true,
        temperature: isVoice ? 0.6 : 0.4,
        max_tokens: isVoice ? 2000 : 6000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[FOREX-AI-DESK] AI Gateway error:", response.status, errorText);
      if (response.status === 429) return ERR.rateLimit();
      if (response.status === 402) return ERR.credits();
      return ERR.internal();
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("[FOREX-AI-DESK] Error:", error);
    return ERR.internal();
  }
});
