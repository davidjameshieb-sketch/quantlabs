
-- Add trade health governance telemetry columns to oanda_orders
ALTER TABLE public.oanda_orders
  ADD COLUMN IF NOT EXISTS trade_health_score integer,
  ADD COLUMN IF NOT EXISTS health_band text,
  ADD COLUMN IF NOT EXISTS mfe_r numeric,
  ADD COLUMN IF NOT EXISTS ue_r numeric,
  ADD COLUMN IF NOT EXISTS bars_since_entry integer,
  ADD COLUMN IF NOT EXISTS progress_fail boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS health_governance_action text;
