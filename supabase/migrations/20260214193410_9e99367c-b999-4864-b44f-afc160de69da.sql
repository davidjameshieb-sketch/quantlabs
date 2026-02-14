
-- Sovereign Memory: Persistent long-term brain for the AI Floor Manager
CREATE TABLE public.sovereign_memory (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  memory_type text NOT NULL,           -- 'dna_mutation', 'gate_performance', 'regime_forecast', 'strategic_note', 'session_debrief', 'backtest_result'
  memory_key text NOT NULL,            -- e.g. 'agent:trend-scalper:entry_logic', 'gate:G14:performance', 'regime:EUR_USD:forecast'
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  relevance_score numeric DEFAULT 1.0, -- AI can mark memories as more/less relevant over time
  expires_at timestamp with time zone, -- NULL = permanent, otherwise auto-prune
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT 'sovereign-loop'
);

-- Index for fast lookups by type and key
CREATE INDEX idx_sovereign_memory_type ON public.sovereign_memory(memory_type);
CREATE INDEX idx_sovereign_memory_key ON public.sovereign_memory(memory_key);
CREATE INDEX idx_sovereign_memory_relevance ON public.sovereign_memory(relevance_score DESC);

-- Enable RLS
ALTER TABLE public.sovereign_memory ENABLE ROW LEVEL SECURITY;

-- Anyone can read (dashboard visibility)
CREATE POLICY "Anyone can read sovereign memory"
ON public.sovereign_memory FOR SELECT
USING (true);

-- Service role can manage (edge functions write)
CREATE POLICY "Service role can manage sovereign memory"
ON public.sovereign_memory FOR ALL
USING (true)
WITH CHECK (true);

-- Auto-update timestamps
CREATE TRIGGER update_sovereign_memory_updated_at
BEFORE UPDATE ON public.sovereign_memory
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
