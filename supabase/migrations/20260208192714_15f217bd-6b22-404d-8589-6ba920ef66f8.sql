
-- Add execution telemetry columns to oanda_orders for slippage tracking and execution quality
ALTER TABLE public.oanda_orders
  ADD COLUMN IF NOT EXISTS requested_price numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS slippage_pips numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS fill_latency_ms integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS spread_at_entry numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS friction_score integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS execution_quality_score integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS session_label text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS regime_label text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gate_result text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gate_reasons text[] DEFAULT NULL;

-- Add unique constraint on idempotency_key to prevent duplicate orders
CREATE UNIQUE INDEX IF NOT EXISTS idx_oanda_orders_idempotency 
  ON public.oanda_orders (idempotency_key) 
  WHERE idempotency_key IS NOT NULL;

-- Add index for execution quality analysis
CREATE INDEX IF NOT EXISTS idx_oanda_orders_execution_quality 
  ON public.oanda_orders (execution_quality_score, created_at DESC)
  WHERE execution_quality_score IS NOT NULL;
