
-- Fix pre-existing: agent_configs missing RLS
ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read agent configs" ON public.agent_configs FOR SELECT USING (true);
CREATE POLICY "Service role can manage agent configs" ON public.agent_configs FOR ALL USING (true) WITH CHECK (true);
