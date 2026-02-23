# Memory: logic/execution/backtest-position-sizing-normalization
Updated: Feb 23, 2026

All backtest simulation engines (Alpha Discovery, Profile Discovery, Experimental Strategies, Dynamic Sandbox, OOS Validation, and Rank Expectancy) use **5% Risk Dynamic Position Sizing** with geometric compounding. On every trade signal, the engine calculates:

- `Risk_Amount = Current_Account_Equity × 0.05`
- `Target_Units = Risk_Amount / (SL_pips × Pip_Value_Per_Unit)`
- `PnL = Result_Pips × Target_Units × Pip_Value_Per_Unit`

Starting equity is $1,000. As the account grows, unit size scales up geometrically; during drawdowns, unit size scales down to preserve capital. A 10% equity cap per trade prevents single-trade blowups. The standardized SL estimate for engines without explicit ATR-based SL (Rank Expectancy, OOS Validation, TimePeriodBreakdown) is 15 pips.

**EXCEPTION — Live Profile Backtest Engine v6.0 (Sovereign-Alpha Mandate):**

Uses **dual-metric benchmarking** with institutional-grade constraints:

1. **Aggressive Model (5% Risk)**: Geometric compounding with 5% equity risk per trade, capped at **50 standard lots** (5,000,000 units) per position to simulate real-world broker/liquidity limits.

2. **Institutional Model (1% Fixed Risk)**: Conservative 1% equity risk per trade, also capped at 50 lots. This is the **primary sorting metric** — results are ranked by the 1% risk Profit Factor to prioritize edge quality over compounding luck.

3. **Fatal-Failure Filter**: Any profile exceeding **20% peak-to-trough equity drawdown** (on the institutional model) at any point is **instantly REJECTED** and removed from results entirely.

4. **Triple-Lock Entry**: Only G1+G2+G3 (Terrain + Atlas + Vector) gate combinations are simulated. No partial gate entries allowed.

5. **Execution Friction Penalty**: 1.5 pips subtracted from every trade (wins reduced by 1.5 pips, losses worsened by 1.5 pips) to simulate real-world slippage and commissions.
