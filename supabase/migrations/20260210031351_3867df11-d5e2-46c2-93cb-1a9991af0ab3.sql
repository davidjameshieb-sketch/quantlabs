
-- ═══════════════════════════════════════════════════════════════
-- A) INDEXES on oanda_orders for analytical queries
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_oanda_orders_status_created_agent
  ON public.oanda_orders (status, created_at DESC, agent_id);

CREATE INDEX IF NOT EXISTS idx_oanda_orders_env_status_created
  ON public.oanda_orders (environment, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_oanda_orders_created
  ON public.oanda_orders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_oanda_orders_pair_created
  ON public.oanda_orders (currency_pair, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_oanda_orders_session_created
  ON public.oanda_orders (session_label, created_at DESC);

-- Refresh planner statistics
ANALYZE public.oanda_orders;

-- ═══════════════════════════════════════════════════════════════
-- B) SNAPSHOT LAYER — analytics_snapshots + analytics_snapshot_runs
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.analytics_snapshots (
  snapshot_type TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  as_of_ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'ready',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_type, scope_key)
);

ALTER TABLE public.analytics_snapshots ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read snapshots (fleet-wide analytics)
CREATE POLICY "Authenticated users can read snapshots"
  ON public.analytics_snapshots FOR SELECT
  TO authenticated
  USING (true);

-- Only service_role (edge functions) can write snapshots
CREATE POLICY "Service role can manage snapshots"
  ON public.analytics_snapshots FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.analytics_snapshot_runs (
  run_id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_type TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.analytics_snapshot_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read snapshot runs"
  ON public.analytics_snapshot_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage snapshot runs"
  ON public.analytics_snapshot_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Index for fast lookups on runs
CREATE INDEX IF NOT EXISTS idx_snapshot_runs_type_scope
  ON public.analytics_snapshot_runs (snapshot_type, scope_key, started_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- F) PRE-AGGREGATION: Daily rollup table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.oanda_orders_daily_rollup (
  rollup_date DATE NOT NULL,
  environment TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  currency_pair TEXT NOT NULL,
  session_label TEXT NOT NULL DEFAULT 'unknown',
  regime_label TEXT NOT NULL DEFAULT 'unknown',
  direction TEXT NOT NULL,
  trades INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  net_pips NUMERIC NOT NULL DEFAULT 0,
  gross_profit_pips NUMERIC NOT NULL DEFAULT 0,
  gross_loss_pips NUMERIC NOT NULL DEFAULT 0,
  max_dd_pips NUMERIC NOT NULL DEFAULT 0,
  avg_spread NUMERIC NOT NULL DEFAULT 0,
  avg_slippage NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rollup_date, environment, agent_id, currency_pair, session_label, regime_label, direction)
);

ALTER TABLE public.oanda_orders_daily_rollup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read rollups"
  ON public.oanda_orders_daily_rollup FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage rollups"
  ON public.oanda_orders_daily_rollup FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_rollup_env_date
  ON public.oanda_orders_daily_rollup (environment, rollup_date DESC);

CREATE INDEX IF NOT EXISTS idx_rollup_agent_date
  ON public.oanda_orders_daily_rollup (agent_id, rollup_date DESC);
