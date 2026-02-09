-- Drop the old environment check and add one that includes 'backtest' and 'shadow'
ALTER TABLE public.oanda_orders DROP CONSTRAINT oanda_orders_environment_check;
ALTER TABLE public.oanda_orders ADD CONSTRAINT oanda_orders_environment_check CHECK (environment = ANY (ARRAY['practice', 'live', 'backtest', 'shadow']));