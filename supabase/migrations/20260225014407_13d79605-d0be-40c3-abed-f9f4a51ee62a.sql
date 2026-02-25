
-- System settings table for global toggles like auto_scaler_enabled
CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read settings
CREATE POLICY "Anyone can read system settings" ON public.system_settings
  FOR SELECT USING (true);

-- Authenticated users can upsert settings
CREATE POLICY "Authenticated users can update system settings" ON public.system_settings
  FOR UPDATE USING (true);

CREATE POLICY "Authenticated users can insert system settings" ON public.system_settings
  FOR INSERT WITH CHECK (true);

-- Insert default auto_scaler_enabled = true
INSERT INTO public.system_settings (key, value)
VALUES ('auto_scaler_enabled', '{"enabled": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Enable realtime for system_settings
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_settings;
