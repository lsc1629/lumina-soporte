-- ============================================================
-- LuminaSupport — Setup completo para Supabase Self-Hosted
-- Ejecutar una sola vez en SQL Editor del Supabase autoalojado
-- Consolida migraciones 00001 → 00018
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- PARTE 1: TIPOS ENUM
-- ══════════════════════════════════════════════════════════════

DO $$ BEGIN CREATE TYPE public.user_role AS ENUM ('admin', 'client');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.project_status AS ENUM ('up', 'down', 'warning', 'maintenance', 'paused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.project_platform AS ENUM ('wordpress', 'shopify', 'nextjs', 'jumpseller', 'headless', 'custom', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.incident_status AS ENUM ('investigating', 'identified', 'monitoring', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.incident_priority AS ENUM ('critical', 'high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.update_type AS ENUM ('core', 'plugin', 'theme', 'app', 'dependency', 'security');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.update_status AS ENUM ('pending', 'in_progress', 'completed', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.update_priority AS ENUM ('critical', 'high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'waiting_client', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.ticket_priority AS ENUM ('high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- PARTE 2: FUNCIONES HELPERS
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ══════════════════════════════════════════════════════════════
-- PARTE 3: TABLA PROFILES
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'client',
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  company_name TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  timezone TEXT DEFAULT 'America/Santiago',
  job_title TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  plan_id UUID DEFAULT NULL,
  subscription_status TEXT DEFAULT 'none',
  notes TEXT DEFAULT NULL,
  tags TEXT[] DEFAULT '{}',
  last_login_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_company ON public.profiles(company_name);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "Allow insert for auth trigger" ON public.profiles;
CREATE POLICY "Allow insert for auth trigger" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP TRIGGER IF EXISTS on_profile_updated ON public.profiles;
CREATE TRIGGER on_profile_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger auto-crear perfil al registrar usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data ->> 'role')::public.user_role, 'client')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ══════════════════════════════════════════════════════════════
-- PARTE 4: TABLAS DE CONFIGURACIÓN DE USUARIO
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  email_incidents BOOLEAN NOT NULL DEFAULT TRUE,
  email_updates BOOLEAN NOT NULL DEFAULT TRUE,
  email_reports BOOLEAN NOT NULL DEFAULT TRUE,
  email_security BOOLEAN NOT NULL DEFAULT FALSE,
  push_incidents BOOLEAN NOT NULL DEFAULT TRUE,
  push_updates BOOLEAN NOT NULL DEFAULT FALSE,
  push_reports BOOLEAN NOT NULL DEFAULT FALSE,
  sms_incidents BOOLEAN NOT NULL DEFAULT FALSE,
  sms_critical_only BOOLEAN NOT NULL DEFAULT TRUE,
  digest_frequency TEXT NOT NULL DEFAULT 'daily',
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  quiet_hours_start TEXT DEFAULT '22:00',
  quiet_hours_end TEXT DEFAULT '08:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.security_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  two_factor_method TEXT DEFAULT 'app',
  session_timeout_minutes INTEGER NOT NULL DEFAULT 480,
  ip_whitelist_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ip_whitelist TEXT[] DEFAULT '{}',
  last_password_change TIMESTAMPTZ DEFAULT NOW(),
  login_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device TEXT NOT NULL DEFAULT 'Desconocido',
  browser TEXT NOT NULL DEFAULT 'Desconocido',
  ip_address TEXT NOT NULL DEFAULT '0.0.0.0',
  location TEXT DEFAULT '',
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  last_active TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  service_type TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  api_key_masked TEXT DEFAULT '',
  webhook_url TEXT DEFAULT '',
  config JSONB DEFAULT '{}',
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, service_name)
);

CREATE TABLE IF NOT EXISTS public.appearance_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  theme TEXT NOT NULL DEFAULT 'dark',
  accent_color TEXT NOT NULL DEFAULT '#8b5cf6',
  font_size TEXT NOT NULL DEFAULT 'medium',
  compact_mode BOOLEAN NOT NULL DEFAULT FALSE,
  animations_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sidebar_collapsed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.locale_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  language TEXT NOT NULL DEFAULT 'es',
  date_format TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
  time_format TEXT NOT NULL DEFAULT '24h',
  currency TEXT NOT NULL DEFAULT 'CLP',
  number_format TEXT NOT NULL DEFAULT '1.000,00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appearance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locale_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notification_preferences" ON public.notification_preferences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own security_settings" ON public.security_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own active_sessions" ON public.active_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own integrations" ON public.integrations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own appearance_settings" ON public.appearance_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own locale_settings" ON public.locale_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all notification_preferences" ON public.notification_preferences FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins view all security_settings" ON public.security_settings FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins view all active_sessions" ON public.active_sessions FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins view all integrations" ON public.integrations FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins view all appearance_settings" ON public.appearance_settings FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins view all locale_settings" ON public.locale_settings FOR SELECT USING (public.is_admin());

CREATE TRIGGER on_notification_preferences_updated BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER on_security_settings_updated BEFORE UPDATE ON public.security_settings FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER on_integrations_updated BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER on_appearance_settings_updated BEFORE UPDATE ON public.appearance_settings FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER on_locale_settings_updated BEFORE UPDATE ON public.locale_settings FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ══════════════════════════════════════════════════════════════
-- PARTE 5: TABLAS CORE (projects, incidents, updates, tickets, uptime)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  platform public.project_platform NOT NULL DEFAULT 'wordpress',
  platform_key TEXT DEFAULT NULL,
  status public.project_status NOT NULL DEFAULT 'up',
  uptime_percent NUMERIC(5,2) NOT NULL DEFAULT 100.00,
  response_time_ms INTEGER DEFAULT NULL,
  last_check_at TIMESTAMPTZ DEFAULT NOW(),
  ssl_expiry DATE DEFAULT NULL,
  ssl_expiry_notified_at TIMESTAMPTZ DEFAULT NULL,
  hosting_provider TEXT DEFAULT '',
  admin_url TEXT DEFAULT '',
  admin_user TEXT DEFAULT '',
  admin_password_encrypted TEXT DEFAULT '',
  wp_app_user TEXT DEFAULT '',
  wp_app_password_encrypted TEXT DEFAULT '',
  frontend_url TEXT DEFAULT '',
  frontend_provider TEXT DEFAULT '',
  frontend_healthcheck TEXT DEFAULT '',
  ftp_host TEXT DEFAULT '',
  ftp_user TEXT DEFAULT '',
  keyword_check TEXT DEFAULT '',
  public_slug TEXT UNIQUE DEFAULT NULL,
  status_page_enabled BOOLEAN DEFAULT false,
  notes TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  monitoring_interval_minutes INTEGER NOT NULL DEFAULT 5,
  log_retention_days INTEGER NOT NULL DEFAULT 90,
  site_token UUID DEFAULT NULL,
  agent_version VARCHAR(20) DEFAULT NULL,
  agent_connected_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_owner ON public.projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_platform ON public.projects(platform);
CREATE INDEX IF NOT EXISTS idx_projects_public_slug ON public.projects(public_slug) WHERE public_slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_site_token ON public.projects(site_token) WHERE site_token IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'incident_seq' AND relkind = 'S') THEN
    CREATE SEQUENCE public.incident_seq START 100;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  incident_number TEXT NOT NULL DEFAULT '',
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

CREATE INDEX IF NOT EXISTS idx_incidents_project ON public.incidents(project_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_priority ON public.incidents(priority);
CREATE INDEX IF NOT EXISTS idx_incidents_number ON public.incidents(incident_number);

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
CREATE TRIGGER on_incident_number BEFORE INSERT ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.generate_incident_number();

CREATE TABLE IF NOT EXISTS public.incident_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL DEFAULT 'note',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timeline_incident ON public.incident_timeline(incident_id);

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

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'ticket_seq' AND relkind = 'S') THEN
    CREATE SEQUENCE public.ticket_seq START 1000;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ticket_number TEXT NOT NULL DEFAULT '',
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
CREATE TRIGGER on_ticket_number BEFORE INSERT ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.generate_ticket_number();

CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_ticket ON public.ticket_messages(ticket_id);

CREATE TABLE IF NOT EXISTS public.uptime_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status public.project_status NOT NULL,
  response_time_ms INTEGER DEFAULT NULL,
  status_code INTEGER DEFAULT NULL,
  status_reason TEXT DEFAULT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uptime_project ON public.uptime_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_uptime_checked ON public.uptime_logs(checked_at);
CREATE INDEX IF NOT EXISTS idx_uptime_logs_checked_at ON public.uptime_logs(checked_at);

-- RLS tablas core
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uptime_logs ENABLE ROW LEVEL SECURITY;

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
  USING (EXISTS (SELECT 1 FROM public.incidents i JOIN public.projects p ON p.id = i.project_id WHERE i.id = incident_timeline.incident_id AND p.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Admins full access updates" ON public.project_updates;
CREATE POLICY "Admins full access updates" ON public.project_updates FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Clients view own updates" ON public.project_updates;
CREATE POLICY "Clients view own updates" ON public.project_updates FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_updates.project_id AND projects.owner_id = auth.uid()));

DROP POLICY IF EXISTS "Admins full access tickets" ON public.support_tickets;
CREATE POLICY "Admins full access tickets" ON public.support_tickets FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Clients manage own tickets" ON public.support_tickets;
CREATE POLICY "Clients manage own tickets" ON public.support_tickets FOR ALL USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Admins full access messages" ON public.ticket_messages;
CREATE POLICY "Admins full access messages" ON public.ticket_messages FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Clients view own ticket messages" ON public.ticket_messages;
CREATE POLICY "Clients view own ticket messages" ON public.ticket_messages FOR SELECT
  USING (is_internal = FALSE AND EXISTS (SELECT 1 FROM public.support_tickets WHERE support_tickets.id = ticket_messages.ticket_id AND support_tickets.created_by = auth.uid()));
DROP POLICY IF EXISTS "Clients insert own ticket messages" ON public.ticket_messages;
CREATE POLICY "Clients insert own ticket messages" ON public.ticket_messages FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.support_tickets WHERE support_tickets.id = ticket_messages.ticket_id AND support_tickets.created_by = auth.uid()));

DROP POLICY IF EXISTS "Admins full access uptime" ON public.uptime_logs;
CREATE POLICY "Admins full access uptime" ON public.uptime_logs FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Clients view own uptime" ON public.uptime_logs;
CREATE POLICY "Clients view own uptime" ON public.uptime_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = uptime_logs.project_id AND projects.owner_id = auth.uid()));

-- Triggers updated_at core
DROP TRIGGER IF EXISTS on_projects_updated ON public.projects;
CREATE TRIGGER on_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS on_incidents_updated ON public.incidents;
CREATE TRIGGER on_incidents_updated BEFORE UPDATE ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS on_updates_updated ON public.project_updates;
CREATE TRIGGER on_updates_updated BEFORE UPDATE ON public.project_updates FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS on_tickets_updated ON public.support_tickets;
CREATE TRIGGER on_tickets_updated BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ══════════════════════════════════════════════════════════════
-- PARTE 6: TABLAS AUXILIARES (alert_log, plugins, settings, scans)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.alert_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_log_project ON public.alert_log(project_id);
CREATE INDEX IF NOT EXISTS idx_alert_log_type_sent ON public.alert_log(project_id, alert_type, sent_at);
ALTER TABLE public.alert_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins full access alert_log" ON public.alert_log;
CREATE POLICY "Admins full access alert_log" ON public.alert_log FOR ALL USING (public.is_admin());

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
CREATE POLICY "Admin can manage own report settings" ON public.report_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_report_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_report_settings_updated ON public.report_settings;
CREATE TRIGGER trg_report_settings_updated BEFORE UPDATE ON public.report_settings FOR EACH ROW EXECUTE FUNCTION update_report_settings_timestamp();

CREATE TABLE IF NOT EXISTS public.project_plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  plugin_file TEXT DEFAULT '',
  current_version TEXT DEFAULT '',
  latest_version TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT true,
  plugin_type TEXT NOT NULL DEFAULT 'plugin',
  author TEXT DEFAULT '',
  description TEXT DEFAULT '',
  auto_update BOOLEAN NOT NULL DEFAULT false,
  last_checked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_project_plugins_project ON public.project_plugins(project_id);
CREATE INDEX IF NOT EXISTS idx_project_plugins_outdated ON public.project_plugins(project_id) WHERE latest_version != '' AND latest_version != current_version;

ALTER TABLE public.project_plugins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins full access project_plugins" ON public.project_plugins;
CREATE POLICY "Admins full access project_plugins" ON public.project_plugins FOR ALL USING (public.is_admin());
DROP POLICY IF EXISTS "Clients view own project_plugins" ON public.project_plugins;
CREATE POLICY "Clients view own project_plugins" ON public.project_plugins FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_plugins.project_id AND projects.owner_id = auth.uid()));

DROP TRIGGER IF EXISTS on_project_plugins_updated ON public.project_plugins;
CREATE TRIGGER on_project_plugins_updated BEFORE UPDATE ON public.project_plugins FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

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

CREATE INDEX IF NOT EXISTS idx_security_scans_project ON public.security_scans(project_id);
CREATE INDEX IF NOT EXISTS idx_security_scans_created ON public.security_scans(created_at DESC);
ALTER TABLE public.security_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins full access security_scans" ON public.security_scans FOR ALL USING (public.is_admin());
CREATE POLICY "Clients view own project scans" ON public.security_scans FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = security_scans.project_id AND projects.owner_id = auth.uid()));

-- ══════════════════════════════════════════════════════════════
-- PARTE 7: GESTIÓN COMERCIAL (plans, subscriptions, payments)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_currency TEXT NOT NULL DEFAULT 'USD',
  max_projects INTEGER NOT NULL DEFAULT 1,
  monitoring_interval_minutes INTEGER NOT NULL DEFAULT 5,
  features JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled', 'trial', 'suspended')),
  payment_provider TEXT CHECK (payment_provider IN ('mercadopago', 'flow', 'khipu', 'paypal', 'manual', 'stripe')),
  payment_provider_subscription_id TEXT,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 month'),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  payment_provider TEXT,
  payment_provider_id TEXT,
  payment_method TEXT,
  description TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_client ON public.subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_payments_subscription ON public.payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_client ON public.payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active plans" ON public.plans FOR SELECT USING (is_active = true);
CREATE POLICY "Admins full access plans" ON public.plans FOR ALL USING (public.is_admin());
CREATE POLICY "Clients view own subscriptions" ON public.subscriptions FOR SELECT USING (client_id = auth.uid());
CREATE POLICY "Admins full access subscriptions" ON public.subscriptions FOR ALL USING (public.is_admin());
CREATE POLICY "Clients view own payments" ON public.payments FOR SELECT USING (client_id = auth.uid());
CREATE POLICY "Admins full access payments" ON public.payments FOR ALL USING (public.is_admin());

-- ══════════════════════════════════════════════════════════════
-- PARTE 8: API KEYS (Lumina Agent v3)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  key_prefix VARCHAR(8) NOT NULL,
  label VARCHAR(100) DEFAULT 'Default',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(key_hash)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON public.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON public.api_keys(user_id);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own api_keys" ON public.api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own api_keys" ON public.api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own api_keys" ON public.api_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own api_keys" ON public.api_keys FOR DELETE USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- PARTE 9: SEED DE PLANES
-- ══════════════════════════════════════════════════════════════

INSERT INTO public.plans (name, slug, description, price_monthly, price_currency, max_projects, monitoring_interval_minutes, features, sort_order, is_active) VALUES
(
  'Sitio Web', 'web',
  'Monitoreo completo para tu sitio web WordPress.',
  14990, 'CLP', 1, 5,
  '["1 sitio web WordPress", "Monitoreo cada 5 minutos, 24/7", "Alertas por email instantáneas", "Certificado SSL monitoreado", "Actualizaciones remotas de plugins y temas", "Detección de caídas con doble verificación", "Página de estado pública", "Reporte mensual automático", "Panel de cliente con historial de uptime", "Conexión con un clic vía Lumina Agent"]',
  1, true
),
(
  'Ecommerce', 'ecommerce',
  'Todo lo del plan Web más monitoreo especializado para WooCommerce y Shopify.',
  29990, 'CLP', 1, 3,
  '["1 tienda online (WooCommerce o Shopify)", "Monitoreo cada 3 minutos, 24/7", "Alertas por email instantáneas", "Certificado SSL monitoreado", "Actualizaciones remotas de plugins y temas", "Detección de caídas con doble verificación", "Monitoreo de estado WooCommerce / Shopify", "Escaneo de imágenes no optimizadas", "Página de estado pública personalizada", "Reporte mensual detallado con PDF", "Panel de cliente con historial completo", "Soporte prioritario"]',
  2, true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly, price_currency = EXCLUDED.price_currency,
  max_projects = EXCLUDED.max_projects, monitoring_interval_minutes = EXCLUDED.monitoring_interval_minutes,
  features = EXCLUDED.features, sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active, updated_at = NOW();

-- ══════════════════════════════════════════════════════════════
-- PARTE 10: CREAR USUARIO ADMIN
-- ══════════════════════════════════════════════════════════════
-- IMPORTANTE: Ejecuta esto DESPUÉS de crear el usuario admin via API/Dashboard.
-- Reemplaza <UUID_DEL_NUEVO_USUARIO> con el UUID real del usuario creado.
-- 
-- INSERT INTO public.profiles (id, email, full_name, role, job_title, timezone)
-- VALUES (
--   '<UUID_DEL_NUEVO_USUARIO>',
--   'donluissalascortes@gmail.com',
--   'Luis Salas Cortés',
--   'admin',
--   'Administrador de Sistemas',
--   'America/Santiago'
-- ) ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- ✅ Setup completo — LuminaSupport Self-Hosted listo
