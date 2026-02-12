
ALTER TABLE public.oanda_orders
ADD COLUMN IF NOT EXISTS r_pips numeric,
ADD COLUMN IF NOT EXISTS entry_tf text,
ADD COLUMN IF NOT EXISTS mfe_price numeric,
ADD COLUMN IF NOT EXISTS mae_price numeric;
