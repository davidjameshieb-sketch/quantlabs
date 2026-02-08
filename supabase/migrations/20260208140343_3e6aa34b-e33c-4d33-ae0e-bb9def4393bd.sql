
-- Create table to track all OANDA order executions
CREATE TABLE public.oanda_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  signal_id TEXT NOT NULL,
  currency_pair TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  units INTEGER NOT NULL,
  entry_price NUMERIC,
  exit_price NUMERIC,
  oanda_order_id TEXT,
  oanda_trade_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'filled', 'rejected', 'closed', 'cancelled')),
  error_message TEXT,
  confidence_score NUMERIC,
  agent_id TEXT,
  environment TEXT NOT NULL DEFAULT 'practice' CHECK (environment IN ('practice', 'live')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.oanda_orders ENABLE ROW LEVEL SECURITY;

-- Users can view their own orders
CREATE POLICY "Users can view own OANDA orders"
ON public.oanda_orders
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own orders
CREATE POLICY "Users can insert own OANDA orders"
ON public.oanda_orders
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own orders
CREATE POLICY "Users can update own OANDA orders"
ON public.oanda_orders
FOR UPDATE
USING (auth.uid() = user_id);

-- Admins can view all orders
CREATE POLICY "Admins can view all OANDA orders"
ON public.oanda_orders
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Deny deletes
CREATE POLICY "Deny deletes on OANDA orders"
ON public.oanda_orders
FOR DELETE
USING (false);

-- Add updated_at trigger
CREATE TRIGGER update_oanda_orders_updated_at
BEFORE UPDATE ON public.oanda_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups
CREATE INDEX idx_oanda_orders_user_id ON public.oanda_orders(user_id);
CREATE INDEX idx_oanda_orders_status ON public.oanda_orders(status);
CREATE INDEX idx_oanda_orders_signal_id ON public.oanda_orders(signal_id);
