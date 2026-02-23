# Memory: logic/execution/backtest-position-sizing-normalization
Updated: Feb 23, 2026

All backtest simulation engines (Alpha Discovery, Profile Discovery, Experimental Strategies, Dynamic Sandbox, OOS Validation, and Rank Expectancy) use **5% Risk Dynamic Position Sizing** with geometric compounding. On every trade signal, the engine calculates:

- `Risk_Amount = Current_Account_Equity × 0.05`
- `Target_Units = Risk_Amount / (SL_pips × Pip_Value_Per_Unit)`
- `PnL = Result_Pips × Target_Units × Pip_Value_Per_Unit`

Starting equity is $1,000. As the account grows, unit size scales up geometrically; during drawdowns, unit size scales down to preserve capital. A 10% equity cap per trade prevents single-trade blowups. The standardized SL estimate for engines without explicit ATR-based SL (Rank Expectancy, OOS Validation, TimePeriodBreakdown) is 15 pips.

**EXCEPTION — Live Profile Backtest Engine:** Uses flat position sizing (2,000 units / $0.20 per pip) to eliminate compounding distortions. Additionally enforces three "Suck Rules":

1. **Operational Resilience Filter**: Any profile exceeding 15% equity-relative drawdown at any point is flagged as "UNSTABLE" and sorted to the bottom of results.
2. **Predator-Gate Hardening**: Results are sorted to prioritize G1+G2+G3 triple-lock profiles within each stability tier.
3. **Execution Friction Penalty**: 1.5 pips subtracted from every trade (wins reduced by 1.5 pips, losses worsened by 1.5 pips) to simulate real-world slippage and commissions.
