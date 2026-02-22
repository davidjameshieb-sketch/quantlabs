# Memory: logic/execution/backtest-position-sizing-normalization
Updated: Feb 22, 2026

All backtest simulation engines (Alpha Discovery, Profile Discovery, Experimental, and Dynamic Sandbox) utilize a normalized position sizing of $0.20 per pip (2000 units) on a $1,000 base equity. This standardization ensures that total return percentages, net pips, and equity curves are mathematically comparable across all manual and automated optimization modules. +100 pips equals a +2.0% return on the $1,000 simulation account.