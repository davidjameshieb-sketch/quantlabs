CREATE TABLE public.penny_scan_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'processing',
  sector text NOT NULL DEFAULT 'all',
  progress integer NOT NULL DEFAULT 0,
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.penny_scan_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read scan jobs" ON public.penny_scan_jobs FOR SELECT USING (true);
CREATE POLICY "Anyone can insert scan jobs" ON public.penny_scan_jobs FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update scan jobs" ON public.penny_scan_jobs FOR UPDATE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.penny_scan_jobs;