-- ============================================================
-- LuminaSupport — Fase 2: SSL monitoring, keyword validation, alertas
-- Ejecutar en SQL Editor de Supabase
-- ============================================================

-- Nuevos campos en projects para Fase 2
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS keyword_check TEXT DEFAULT '';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS ssl_expiry_notified_at TIMESTAMPTZ DEFAULT NULL;

-- Tabla para guardar log de alertas enviadas (evita duplicados)
CREATE TABLE IF NOT EXISTS public.alert_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL, -- 'ssl_30d', 'ssl_14d', 'ssl_7d', 'ssl_expired', 'downtime', 'recovery'
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_log_project ON public.alert_log(project_id);
CREATE INDEX IF NOT EXISTS idx_alert_log_type_sent ON public.alert_log(project_id, alert_type, sent_at);

-- RLS para alert_log
ALTER TABLE public.alert_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins full access alert_log" ON public.alert_log;
CREATE POLICY "Admins full access alert_log" ON public.alert_log FOR ALL USING (public.is_admin());

-- ✅ Migración Fase 2 completada
