
-- Drop the existing restrictive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view OANDA orders" ON public.oanda_orders;

-- Create a permissive SELECT policy allowing anyone (including anon) to read orders
CREATE POLICY "Anyone can view OANDA orders"
  ON public.oanda_orders
  FOR SELECT
  USING (true);
