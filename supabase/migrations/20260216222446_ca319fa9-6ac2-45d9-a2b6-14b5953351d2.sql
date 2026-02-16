
-- ═══ Agent Promotion Ledger ═══
-- Tracks shadow agent performance and auto-promotes when criteria met

CREATE TABLE public.agent_promotion_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'B', -- B=shadow, A=live, C=restricted, D=disabled
  total_trades INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  net_pips NUMERIC NOT NULL DEFAULT 0,
  gross_profit_pips NUMERIC NOT NULL DEFAULT 0,
  gross_loss_pips NUMERIC NOT NULL DEFAULT 0,
  avg_r_ratio NUMERIC NOT NULL DEFAULT 0,
  win_rate NUMERIC NOT NULL DEFAULT 0,
  expectancy_r NUMERIC NOT NULL DEFAULT 0,
  promoted_at TIMESTAMP WITH TIME ZONE,
  demoted_at TIMESTAMP WITH TIME ZONE,
  promotion_reason TEXT,
  demotion_reason TEXT,
  target_session TEXT,
  strategy TEXT,
  sizing_multiplier NUMERIC NOT NULL DEFAULT 0.1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(agent_id)
);

ALTER TABLE public.agent_promotion_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read promotion ledger" ON public.agent_promotion_ledger FOR SELECT USING (true);
CREATE POLICY "Service role can manage promotion ledger" ON public.agent_promotion_ledger FOR ALL USING (true) WITH CHECK (true);

-- Auto-update timestamp
CREATE TRIGGER update_agent_promotion_ledger_updated_at
  BEFORE UPDATE ON public.agent_promotion_ledger
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══ Cross-Asset Canary Alerts Table ═══
-- Stores push alerts for VIX/BTC/Yield spikes that trigger sovereign loop

CREATE TABLE public.canary_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type TEXT NOT NULL, -- 'VIX_SPIKE', 'BTC_CRASH', 'YIELD_SPIKE', etc.
  source TEXT NOT NULL, -- 'vix', 'btc', 'us10y'
  current_value NUMERIC,
  threshold NUMERIC,
  severity TEXT NOT NULL DEFAULT 'warning', -- 'warning', 'critical'
  message TEXT NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '1 hour')
);

ALTER TABLE public.canary_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read canary alerts" ON public.canary_alerts FOR SELECT USING (true);
CREATE POLICY "Service role can manage canary alerts" ON public.canary_alerts FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for canary alerts so sovereign loop can subscribe
ALTER PUBLICATION supabase_realtime ADD TABLE public.canary_alerts;
