
-- Add direction provenance columns for era segmentation and backtest support
ALTER TABLE public.oanda_orders
ADD COLUMN IF NOT EXISTS direction_engine text NOT NULL DEFAULT 'auto-governance',
ADD COLUMN IF NOT EXISTS quantlabs_bias text,
ADD COLUMN IF NOT EXISTS quantlabs_confidence numeric,
ADD COLUMN IF NOT EXISTS direction_tf_used text,
ADD COLUMN IF NOT EXISTS confirmation_tf_used text,
ADD COLUMN IF NOT EXISTS governance_composite numeric;

-- Index for era/direction engine segmentation
CREATE INDEX IF NOT EXISTS idx_oanda_orders_direction_engine ON public.oanda_orders (direction_engine);
CREATE INDEX IF NOT EXISTS idx_oanda_orders_status ON public.oanda_orders (status);
