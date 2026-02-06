-- Explicit deny-write policies for stripe_customers (defense-in-depth)
CREATE POLICY "Deny user inserts on stripe_customers"
  ON public.stripe_customers FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Deny user updates on stripe_customers"
  ON public.stripe_customers FOR UPDATE
  USING (false);

CREATE POLICY "Deny user deletes on stripe_customers"
  ON public.stripe_customers FOR DELETE
  USING (false);

-- Explicit deny-write policies for webhook_events
CREATE POLICY "Deny user inserts on webhook_events"
  ON public.webhook_events FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Deny user updates on webhook_events"
  ON public.webhook_events FOR UPDATE
  USING (false);

CREATE POLICY "Deny user deletes on webhook_events"
  ON public.webhook_events FOR DELETE
  USING (false);