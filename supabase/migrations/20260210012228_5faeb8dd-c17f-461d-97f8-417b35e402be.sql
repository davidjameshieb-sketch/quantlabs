-- Allow all authenticated users to view oanda_orders (single-tenant analytics platform)
DROP POLICY IF EXISTS "Users can view own OANDA orders" ON public.oanda_orders;
DROP POLICY IF EXISTS "Admins can view all OANDA orders" ON public.oanda_orders;

CREATE POLICY "Authenticated users can view OANDA orders"
  ON public.oanda_orders
  FOR SELECT
  TO authenticated
  USING (true);