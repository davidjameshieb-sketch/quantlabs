
-- 1. Explicitly deny DELETE on profiles (defense-in-depth, matches stripe_customers/webhook_events pattern)
CREATE POLICY "Deny all profile deletes"
  ON public.profiles FOR DELETE
  USING (false);

-- 2. Deny unauthenticated SELECT on profiles
CREATE POLICY "Deny unauthenticated profile access"
  ON public.profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 3. Deny unauthenticated SELECT on stripe_customers
CREATE POLICY "Deny unauthenticated stripe access"
  ON public.stripe_customers FOR SELECT
  USING (auth.uid() IS NOT NULL);
