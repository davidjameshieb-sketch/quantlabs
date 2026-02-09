// Backtest Module — Public API
export { runBacktest, DEFAULT_BACKTEST_CONFIG, type BacktestConfig, type BacktestTradeRecord, type BacktestSummary } from './backtestRunner';
export { persistBacktestTrades, clearBacktestTrades } from './backtestPersistence';
export { computeBacktestSpread, computeBacktestSlippage, computeFillPrice } from './spreadSlippageModels';
export { buildBacktestDataBundle, generateSyntheticCandles } from './oandaHistoricalProvider';
