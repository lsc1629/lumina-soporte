-- ============================================================
-- Security Scans — Tabla para almacenar resultados de escaneos de seguridad
-- ============================================================

CREATE TABLE IF NOT EXISTS public.security_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  issues_count INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0,
  high_count INTEGER NOT NULL DEFAULT 0,
  medium_count INTEGER NOT NULL DEFAULT 0,
  results JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_security_scans_project ON public.security_scans(project_id);
CREATE INDEX idx_security_scans_created ON public.security_scans(created_at DESC);

-- RLS
ALTER TABLE public.security_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access security_scans" ON public.security_scans FOR ALL USING (public.is_admin());
CREATE POLICY "Clients view own project scans" ON public.security_scans FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = security_scans.project_id AND projects.owner_id = auth.uid()));
