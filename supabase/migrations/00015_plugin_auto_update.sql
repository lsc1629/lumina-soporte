-- ============================================================
-- Añadir campo auto_update a project_plugins
-- Para rastrear si el plugin tiene actualizaciones automáticas habilitadas en WP
-- ============================================================

ALTER TABLE public.project_plugins ADD COLUMN IF NOT EXISTS auto_update BOOLEAN NOT NULL DEFAULT false;
