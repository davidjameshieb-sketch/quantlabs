
-- Drop existing restrictive SELECT policies on analytics tables
DROP POLICY IF EXISTS "Authenticated users can read snapshots" ON public.analytics_snapshots;
DROP POLICY IF EXISTS "Authenticated users can read snapshot runs" ON public.analytics_snapshot_runs;

-- Create permissive SELECT policies for public access
CREATE POLICY "Anyone can read snapshots"
  ON public.analytics_snapshots
  FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read snapshot runs"
  ON public.analytics_snapshot_runs
  FOR SELECT
  USING (true);
