-- Add time_to_mfe_bars: bars until first positive MFE excursion
ALTER TABLE public.oanda_orders
ADD COLUMN IF NOT EXISTS time_to_mfe_bars integer DEFAULT NULL;