-- 00008: Tabla project_plugins — plugins/apps instalados por proyecto
-- Almacena la lista completa de plugins (WP/Woo) o apps (Shopify/Jumpseller)

CREATE TABLE IF NOT EXISTS public.project_plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  current_version TEXT DEFAULT '',
  latest_version TEXT DEFAULT '',       -- cuando != current_version → necesita update
  is_active BOOLEAN DEFAULT true,
  plugin_type TEXT NOT NULL DEFAULT 'plugin', -- 'plugin', 'theme', 'app'
  author TEXT DEFAULT '',
  description TEXT DEFAULT '',
  last_checked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_project_plugins_project ON public.project_plugins(project_id);
CREATE INDEX IF NOT EXISTS idx_project_plugins_outdated ON public.project_plugins(project_id)
  WHERE latest_version != '' AND latest_version != current_version;

ALTER TABLE public.project_plugins ENABLE ROW LEVEL SECURITY;

-- Admin acceso total
DROP POLICY IF EXISTS "Admins full access project_plugins" ON public.project_plugins;
CREATE POLICY "Admins full access project_plugins" ON public.project_plugins
  FOR ALL USING (public.is_admin());

-- Clientes ven plugins de sus propios proyectos
DROP POLICY IF EXISTS "Clients view own project_plugins" ON public.project_plugins;
CREATE POLICY "Clients view own project_plugins" ON public.project_plugins
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_plugins.project_id AND projects.owner_id = auth.uid())
  );

-- Trigger updated_at
DROP TRIGGER IF EXISTS on_project_plugins_updated ON public.project_plugins;
CREATE TRIGGER on_project_plugins_updated
  BEFORE UPDATE ON public.project_plugins
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
