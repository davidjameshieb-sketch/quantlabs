# Memory: logic/execution/backtest-position-sizing-normalization
Updated: Feb 22, 2026

All backtest simulation engines (Alpha Discovery, Profile Discovery, Experimental Strategies, Dynamic Sandbox, OOS Validation, and Rank Expectancy) use **5% Risk Dynamic Position Sizing** with geometric compounding. On every trade signal, the engine calculates:

- `Risk_Amount = Current_Account_Equity × 0.05`
- `Target_Units = Risk_Amount / (SL_pips × Pip_Value_Per_Unit)`
- `PnL = Result_Pips × Target_Units × Pip_Value_Per_Unit`

Starting equity is $1,000. As the account grows, unit size scales up geometrically; during drawdowns, unit size scales down to preserve capital. A 10% equity cap per trade prevents single-trade blowups. The standardized SL estimate for engines without explicit ATR-based SL (Rank Expectancy, OOS Validation, TimePeriodBreakdown) is 15 pips.
