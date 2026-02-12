
-- Add THS Expectancy columns to oanda_orders
-- entry_ths: THS at the moment trade was filled
-- peak_ths: highest THS observed during trade lifetime
-- exit_ths: THS at the moment of close
-- mae_r: Maximum Adverse Excursion in R-multiples (worst drawdown from entry)

ALTER TABLE public.oanda_orders
  ADD COLUMN IF NOT EXISTS entry_ths integer,
  ADD COLUMN IF NOT EXISTS peak_ths integer,
  ADD COLUMN IF NOT EXISTS exit_ths integer,
  ADD COLUMN IF NOT EXISTS mae_r numeric;
