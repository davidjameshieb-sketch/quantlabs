
-- Gate Bypasses table: server-side registry for Floor Manager overrides
CREATE TABLE public.gate_bypasses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gate_id TEXT NOT NULL,
  pair TEXT,
  reason TEXT NOT NULL DEFAULT 'Floor Manager override',
  bypassed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'floor-manager',
  revoked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_gate_bypasses_active ON public.gate_bypasses (gate_id, pair) WHERE revoked = false;
CREATE INDEX idx_gate_bypasses_expires ON public.gate_bypasses (expires_at) WHERE revoked = false;

-- Enable RLS
ALTER TABLE public.gate_bypasses ENABLE ROW LEVEL SECURITY;

-- Anyone can read (needed by edge functions via service role, and client)
CREATE POLICY "Anyone can read gate bypasses"
  ON public.gate_bypasses FOR SELECT USING (true);

-- Service role manages (edge functions insert/update)
CREATE POLICY "Service role can manage gate bypasses"
  ON public.gate_bypasses FOR ALL USING (true) WITH CHECK (true);
