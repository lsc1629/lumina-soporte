-- ============================================================
-- LuminaSupport - Migración SEGURA (idempotente)
-- Ejecutar en SQL Editor de Supabase
-- Crea solo lo que NO existe aún
-- ============================================================

-- ── TIPOS ENUM ──
DO $$ BEGIN
  CREATE TYPE public.project_status AS ENUM ('up', 'down', 'warning', 'maintenance', 'paused');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.project_platform AS ENUM ('wordpress', 'shopify', 'nextjs', 'jumpseller', 'headless', 'custom', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.incident_status AS ENUM ('investigating', 'identified', 'monitoring', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.incident_priority AS ENUM ('critical', 'high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.update_type AS ENUM ('core', 'plugin', 'theme', 'app', 'dependency', 'security');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.update_status AS ENUM ('pending', 'in_progress', 'completed', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.update_priority AS ENUM ('critical', 'high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'waiting_client', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ticket_priority AS ENUM ('high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 1. PROJECTS ──
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  platform public.project_platform NOT NULL DEFAULT 'wordpress',
  status public.project_status NOT NULL DEFAULT 'up',
  uptime_percent NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  response_time_ms INTEGER DEFAULT NULL,
  last_check_at TIMESTAMPTZ DEFAULT NOW(),
  ssl_expiry DATE DEFAULT NULL,
  hosting_provider TEXT DEFAULT '',
  admin_url TEXT DEFAULT '',
  admin_user TEXT DEFAULT '',
  admin_password_encrypted TEXT DEFAULT '',
  frontend_url TEXT DEFAULT '',
  frontend_provider TEXT DEFAULT '',
  frontend_healthcheck TEXT DEFAULT '',
  ftp_host TEXT DEFAULT '',
  ftp_user TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agregar columnas que podrían faltar si la tabla ya existía parcialmente
DO $$ BEGIN
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS frontend_url TEXT DEFAULT '';
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS frontend_provider TEXT DEFAULT '';
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS frontend_healthcheck TEXT DEFAULT '';
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS ftp_host TEXT DEFAULT '';
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS ftp_user TEXT DEFAULT '';
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS ssl_expiry DATE DEFAULT NULL;
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS response_time_ms INTEGER DEFAULT NULL;
  ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS last_check_at TIMESTAMPTZ DEFAULT NOW();
END $$;

CREATE INDEX IF NOT EXISTS idx_projects_owner ON public.projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_platform ON public.projects(platform);

-- ── 2. INCIDENTS ──
CREATE TABLE IF NOT EXISTS public.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  incident_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status public.incident_status NOT NULL DEFAULT 'investigating',
  priority public.incident_priority NOT NULL DEFAULT 'medium',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ DEFAULT NULL,
  duration_minutes INTEGER DEFAULT NULL,
  root_cause TEXT DEFAULT '',
  resolution TEXT DEFAULT '',
  is_auto_detected BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS is_auto_detected BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS resolution TEXT DEFAULT '';
  ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS root_cause TEXT DEFAULT '';
END $$;

CREATE INDEX IF NOT EXISTS idx_incidents_project ON public.incidents(project_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_priority ON public.incidents(priority);
CREATE INDEX IF NOT EXISTS idx_incidents_number ON public.incidents(incident_number);

-- Secuencia para numerar incidentes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'incident_seq' AND relkind = 'S') THEN
    CREATE SEQUENCE public.incident_seq START 100;
  END IF;
END $$;

-- Trigger auto-generar incident_number
CREATE OR REPLACE FUNCTION public.generate_incident_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.incident_number IS NULL OR NEW.incident_number = '' THEN
    NEW.incident_number := 'INC-' || EXTRACT(YEAR FROM NOW())::TEXT || '-' || LPAD(nextval('public.incident_seq')::TEXT, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_incident_number ON public.incidents;
CREATE TRIGGER on_incident_number
  BEFORE INSERT ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.generate_incident_number();

-- ── 3. INCIDENT_TIMELINE ──
CREATE TABLE IF NOT EXISTS public.incident_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL DEFAULT 'note',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timeline_incident ON public.incident_timeline(incident_id);

-- ── 4. PROJECT_UPDATES ──
CREATE TABLE IF NOT EXISTS public.project_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  applied_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  update_type public.update_type NOT NULL DEFAULT 'plugin',
  name TEXT NOT NULL,
  current_version TEXT DEFAULT '',
  new_version TEXT DEFAULT '',
  priority public.update_priority NOT NULL DEFAULT 'medium',
  status public.update_status NOT NULL DEFAULT 'pending',
  applied_at TIMESTAMPTZ DEFAULT NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_updates_project ON public.project_updates(project_id);
CREATE INDEX IF NOT EXISTS idx_updates_status ON public.project_updates(status);

-- ── 5. SUPPORT_TICKETS ──
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ticket_number TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT DEFAULT '',
  status public.ticket_status NOT NULL DEFAULT 'open',
  priority public.ticket_priority NOT NULL DEFAULT 'medium',
  resolved_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON public.support_tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON public.support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.support_tickets(status);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ticket_seq' AND relkind = 'S') THEN
    CREATE SEQUENCE public.ticket_seq START 1000;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_ticket_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := 'TKT-' || LPAD(nextval('public.ticket_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_ticket_number ON public.support_tickets;
CREATE TRIGGER on_ticket_number
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.generate_ticket_number();

-- ── 6. TICKET_MESSAGES ──
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_ticket ON public.ticket_messages(ticket_id);

-- ── 7. UPTIME_LOGS ──
CREATE TABLE IF NOT EXISTS public.uptime_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status public.project_status NOT NULL,
  response_time_ms INTEGER DEFAULT NULL,
  status_code INTEGER DEFAULT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uptime_project ON public.uptime_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_uptime_checked ON public.uptime_logs(checked_at);

-- ── RLS ──
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uptime_logs ENABLE ROW LEVEL SECURITY;

-- Policies (DROP + CREATE para ser idempotente)
DROP POLICY IF EXISTS "Admins full access projects" ON public.projects;
CREATE POLICY "Admins full access projects" ON public.projects FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Clients view own projects" ON public.projects;
CREATE POLICY "Clients view own projects" ON public.projects FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Admins full access incidents" ON public.incidents;
CREATE POLICY "Admins full access incidents" ON public.incidents FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Clients view own incidents" ON public.incidents;
CREATE POLICY "Clients view own incidents" ON public.incidents FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = incidents.project_id AND projects.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Admins full access timeline" ON public.incident_timeline;
CREATE POLICY "Admins full access timeline" ON public.incident_timeline FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Clients view own timeline" ON public.incident_timeline;
CREATE POLICY "Clients view own timeline" ON public.incident_timeline FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.incidents i
    JOIN public.projects p ON p.id = i.project_id
    WHERE i.id = incident_timeline.incident_id AND p.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Admins full access updates" ON public.project_updates;
CREATE POLICY "Admins full access updates" ON public.project_updates FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Clients view own updates" ON public.project_updates;
CREATE POLICY "Clients view own updates" ON public.project_updates FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_updates.project_id AND projects.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Admins full access tickets" ON public.support_tickets;
CREATE POLICY "Admins full access tickets" ON public.support_tickets FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Clients manage own tickets" ON public.support_tickets;
CREATE POLICY "Clients manage own tickets" ON public.support_tickets FOR ALL
  USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Admins full access messages" ON public.ticket_messages;
CREATE POLICY "Admins full access messages" ON public.ticket_messages FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Clients view own ticket messages" ON public.ticket_messages;
CREATE POLICY "Clients view own ticket messages" ON public.ticket_messages FOR SELECT
  USING (
    is_internal = FALSE AND
    EXISTS (SELECT 1 FROM public.support_tickets WHERE support_tickets.id = ticket_messages.ticket_id AND support_tickets.created_by = auth.uid())
  );
DROP POLICY IF EXISTS "Clients insert own ticket messages" ON public.ticket_messages;
CREATE POLICY "Clients insert own ticket messages" ON public.ticket_messages FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.support_tickets WHERE support_tickets.id = ticket_messages.ticket_id AND support_tickets.created_by = auth.uid()));

DROP POLICY IF EXISTS "Admins full access uptime" ON public.uptime_logs;
CREATE POLICY "Admins full access uptime" ON public.uptime_logs FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Clients view own uptime" ON public.uptime_logs;
CREATE POLICY "Clients view own uptime" ON public.uptime_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = uptime_logs.project_id AND projects.owner_id = auth.uid()));

-- ── Triggers updated_at ──
DROP TRIGGER IF EXISTS on_projects_updated ON public.projects;
CREATE TRIGGER on_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS on_incidents_updated ON public.incidents;
CREATE TRIGGER on_incidents_updated BEFORE UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS on_updates_updated ON public.project_updates;
CREATE TRIGGER on_updates_updated BEFORE UPDATE ON public.project_updates FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS on_tickets_updated ON public.support_tickets;
CREATE TRIGGER on_tickets_updated BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── Eliminar datos de prueba si existen ──
DELETE FROM public.projects WHERE url IN ('fashion-store.com', 'corp-blog.com', 'tech-store.com', 'news-portal.com', 'api.content.com', 'evento2024.com');

-- ✅ Migración completada
