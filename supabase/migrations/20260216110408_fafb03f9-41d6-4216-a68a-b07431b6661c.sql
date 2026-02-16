-- Add baseline_excluded flag to oanda_orders
ALTER TABLE public.oanda_orders 
ADD COLUMN baseline_excluded boolean NOT NULL DEFAULT false;

-- Mark all trades older than 7 days as excluded from baseline
UPDATE public.oanda_orders 
SET baseline_excluded = true 
WHERE created_at < now() - interval '7 days' 
AND status IN ('filled', 'closed');

-- Index for fast filtering
CREATE INDEX idx_oanda_orders_baseline ON public.oanda_orders (baseline_excluded) WHERE baseline_excluded = false;