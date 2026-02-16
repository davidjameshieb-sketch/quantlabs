
-- ═══════════════════════════════════════════════════════════
-- FM TOP 10 INFRASTRUCTURE: Tables for Shadow Ledger, 
-- Execution Analytics, and Sovereign Memory v2
-- ═══════════════════════════════════════════════════════════

-- #2: Ghost Shadow-DB — dedicated ledger for virtual shadow executions
CREATE TABLE public.shadow_trade_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT NOT NULL,
  currency_pair TEXT NOT NULL,
  direction TEXT NOT NULL,
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC,
  units INTEGER NOT NULL DEFAULT 1000,
  status TEXT NOT NULL DEFAULT 'open',
  signal_id TEXT NOT NULL,
  entry_reason TEXT,
  exit_reason TEXT,
  regime_label TEXT,
  session_label TEXT,
  r_pips NUMERIC,
  mfe_pips NUMERIC,
  mae_pips NUMERIC,
  entry_spread NUMERIC,
  friction_score INTEGER,
  dna_template TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shadow_trade_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read shadow ledger" ON public.shadow_trade_ledger FOR SELECT USING (true);
CREATE POLICY "Service role can manage shadow ledger" ON public.shadow_trade_ledger FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_shadow_ledger_agent ON public.shadow_trade_ledger(agent_id);
CREATE INDEX idx_shadow_ledger_status ON public.shadow_trade_ledger(status);
CREATE INDEX idx_shadow_ledger_opened ON public.shadow_trade_ledger(opened_at DESC);

-- #4: Execution Analytics — slippage/latency attribution model
CREATE TABLE public.execution_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  currency_pair TEXT NOT NULL,
  session_label TEXT,
  regime_label TEXT,
  direction TEXT NOT NULL,
  requested_price NUMERIC,
  fill_price NUMERIC,
  slippage_pips NUMERIC NOT NULL DEFAULT 0,
  spread_at_entry NUMERIC,
  fill_latency_ms INTEGER NOT NULL DEFAULT 0,
  provider_latency_ms INTEGER,
  is_news_window BOOLEAN NOT NULL DEFAULT false,
  vix_at_entry NUMERIC,
  tick_density NUMERIC,
  toxicity_score NUMERIC,
  oanda_order_id TEXT,
  agent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.execution_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read execution analytics" ON public.execution_analytics FOR SELECT USING (true);
CREATE POLICY "Service role can manage execution analytics" ON public.execution_analytics FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_exec_analytics_pair ON public.execution_analytics(currency_pair);
CREATE INDEX idx_exec_analytics_session ON public.execution_analytics(session_label);
CREATE INDEX idx_exec_analytics_created ON public.execution_analytics(created_at DESC);

-- #10: Sovereign Memory v2 — add time-series tracking columns
ALTER TABLE public.sovereign_memory 
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS previous_payload JSONB,
  ADD COLUMN IF NOT EXISTS change_velocity NUMERIC,
  ADD COLUMN IF NOT EXISTS decision_latency_ms INTEGER;

-- Enable Realtime for shadow ledger
ALTER PUBLICATION supabase_realtime ADD TABLE public.shadow_trade_ledger;
