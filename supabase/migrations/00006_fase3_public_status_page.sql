-- ============================================================
-- LuminaSupport — Fase 3: Página de estado pública
-- Ejecutar en SQL Editor de Supabase
-- ============================================================

-- Slug público para la URL de la status page (ej: /status/mi-tienda)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS public_slug TEXT UNIQUE DEFAULT NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS status_page_enabled BOOLEAN DEFAULT false;

-- Índice para búsqueda rápida por slug
CREATE INDEX IF NOT EXISTS idx_projects_public_slug ON public.projects(public_slug) WHERE public_slug IS NOT NULL;

-- ✅ Migración Fase 3 completada
