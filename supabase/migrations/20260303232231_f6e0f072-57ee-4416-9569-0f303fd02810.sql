
-- Table to store automated Senate scan results with realtime
CREATE TABLE public.senate_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_type text NOT NULL DEFAULT 'full_majors',
  status text NOT NULL DEFAULT 'running',
  pairs_scanned integer NOT NULL DEFAULT 0,
  execution_ready_count integer NOT NULL DEFAULT 0,
  best_pair text,
  market_regime text,
  scan_summary text,
  scan_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_text text,
  model_used text,
  duration_ms integer,
  triggered_by text NOT NULL DEFAULT 'cron',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Enable RLS
ALTER TABLE public.senate_scans ENABLE ROW LEVEL SECURITY;

-- Anyone can read scans
CREATE POLICY "Anyone can read senate scans"
ON public.senate_scans FOR SELECT
USING (true);

-- Service role can manage
CREATE POLICY "Service role can manage senate scans"
ON public.senate_scans FOR ALL
USING (true)
WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.senate_scans;

-- Index for fast recent queries
CREATE INDEX idx_senate_scans_created ON public.senate_scans (created_at DESC);
CREATE INDEX idx_senate_scans_status ON public.senate_scans (status);
