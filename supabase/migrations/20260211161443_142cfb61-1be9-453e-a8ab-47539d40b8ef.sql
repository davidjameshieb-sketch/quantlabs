-- Add counterfactual tracking columns for blocked/rejected trades
ALTER TABLE public.oanda_orders
  ADD COLUMN IF NOT EXISTS counterfactual_entry_price numeric,
  ADD COLUMN IF NOT EXISTS counterfactual_exit_5m numeric,
  ADD COLUMN IF NOT EXISTS counterfactual_exit_10m numeric,
  ADD COLUMN IF NOT EXISTS counterfactual_exit_15m numeric,
  ADD COLUMN IF NOT EXISTS counterfactual_pips numeric,
  ADD COLUMN IF NOT EXISTS counterfactual_result text;

-- Index for efficient counterfactual monitor queries
CREATE INDEX IF NOT EXISTS idx_oanda_orders_counterfactual 
  ON public.oanda_orders (status, counterfactual_entry_price, counterfactual_exit_15m)
  WHERE status IN ('rejected', 'blocked', 'skipped');