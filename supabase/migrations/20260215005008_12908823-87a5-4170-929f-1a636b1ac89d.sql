
-- Create market_liquidity_map table for Wall of Pain data
CREATE TABLE public.market_liquidity_map (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  currency_pair text NOT NULL,
  current_price numeric,
  top_stop_clusters jsonb NOT NULL DEFAULT '[]'::jsonb,
  long_clusters jsonb NOT NULL DEFAULT '[]'::jsonb,
  short_clusters jsonb NOT NULL DEFAULT '[]'::jsonb,
  bucket_width text,
  wall_of_pain_price numeric,
  wall_of_pain_type text,
  wall_of_pain_pct numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_pair UNIQUE (currency_pair)
);

-- Enable RLS
ALTER TABLE public.market_liquidity_map ENABLE ROW LEVEL SECURITY;

-- Anyone can read (FM loop needs this)
CREATE POLICY "Anyone can read liquidity map"
ON public.market_liquidity_map FOR SELECT
USING (true);

-- Service role can manage
CREATE POLICY "Service role can manage liquidity map"
ON public.market_liquidity_map FOR ALL
USING (true)
WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_market_liquidity_map_updated_at
BEFORE UPDATE ON public.market_liquidity_map
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast pair lookup
CREATE INDEX idx_liquidity_map_pair ON public.market_liquidity_map(currency_pair);
