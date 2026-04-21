-- 00007: Tabla report_settings para configuración de envío de informes
-- Una fila por admin (user_id), singleton pattern

CREATE TABLE IF NOT EXISTS public.report_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auto_send BOOLEAN DEFAULT false,
  send_day INTEGER DEFAULT 28 CHECK (send_day BETWEEN 1 AND 28),
  send_to_clients BOOLEAN DEFAULT true,
  send_to_admin BOOLEAN DEFAULT true,
  include_chart BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.report_settings ENABLE ROW LEVEL SECURITY;

-- Admin puede leer y escribir su propia config
CREATE POLICY "Admin can manage own report settings"
  ON public.report_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_report_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_report_settings_updated
  BEFORE UPDATE ON public.report_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_report_settings_timestamp();
