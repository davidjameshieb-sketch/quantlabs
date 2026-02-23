
CREATE POLICY "Authenticated users can insert agent configs"
  ON public.agent_configs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update agent configs"
  ON public.agent_configs FOR UPDATE
  TO authenticated
  USING (true);
