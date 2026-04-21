-- ============================================================
-- LuminaSupport - Tablas de Configuración de Usuario
-- ============================================================

-- 1. Preferencias de notificaciones
CREATE TABLE public.notification_preferences (
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

-- 2. Configuración de seguridad
CREATE TABLE public.security_settings (
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

-- 3. Registro de sesiones activas
CREATE TABLE public.active_sessions (
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

-- 4. Integraciones externas
CREATE TABLE public.integrations (
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

-- 5. Preferencias de apariencia
CREATE TABLE public.appearance_settings (
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

-- 6. Preferencias de idioma y región
CREATE TABLE public.locale_settings (
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

-- ============================================================
-- RLS para todas las tablas
-- ============================================================

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appearance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locale_settings ENABLE ROW LEVEL SECURITY;

-- Cada usuario solo ve/edita sus propios datos
CREATE POLICY "Users manage own notification_preferences" ON public.notification_preferences FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own security_settings" ON public.security_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own active_sessions" ON public.active_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own integrations" ON public.integrations FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own appearance_settings" ON public.appearance_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users manage own locale_settings" ON public.locale_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Admins pueden ver todo
CREATE POLICY "Admins view all notification_preferences" ON public.notification_preferences FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins view all security_settings" ON public.security_settings FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins view all active_sessions" ON public.active_sessions FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins view all integrations" ON public.integrations FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins view all appearance_settings" ON public.appearance_settings FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins view all locale_settings" ON public.locale_settings FOR SELECT USING (public.is_admin());

-- ============================================================
-- Triggers updated_at
-- ============================================================

CREATE TRIGGER on_notification_preferences_updated BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER on_security_settings_updated BEFORE UPDATE ON public.security_settings FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER on_integrations_updated BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER on_appearance_settings_updated BEFORE UPDATE ON public.appearance_settings FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER on_locale_settings_updated BEFORE UPDATE ON public.locale_settings FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- Seed: Datos por defecto para el admin existente
-- ============================================================

INSERT INTO public.notification_preferences (user_id) VALUES ('9588ac16-5de9-4580-8bc0-923de40e4fe4') ON CONFLICT (user_id) DO NOTHING;
INSERT INTO public.security_settings (user_id) VALUES ('9588ac16-5de9-4580-8bc0-923de40e4fe4') ON CONFLICT (user_id) DO NOTHING;
INSERT INTO public.appearance_settings (user_id) VALUES ('9588ac16-5de9-4580-8bc0-923de40e4fe4') ON CONFLICT (user_id) DO NOTHING;
INSERT INTO public.locale_settings (user_id) VALUES ('9588ac16-5de9-4580-8bc0-923de40e4fe4') ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.integrations (user_id, service_name, service_type, is_enabled) VALUES
  ('9588ac16-5de9-4580-8bc0-923de40e4fe4', 'UptimeRobot', 'monitoring', false),
  ('9588ac16-5de9-4580-8bc0-923de40e4fe4', 'Slack', 'communication', false),
  ('9588ac16-5de9-4580-8bc0-923de40e4fe4', 'Discord', 'communication', false),
  ('9588ac16-5de9-4580-8bc0-923de40e4fe4', 'GitHub', 'development', false),
  ('9588ac16-5de9-4580-8bc0-923de40e4fe4', 'Cloudflare', 'infrastructure', false),
  ('9588ac16-5de9-4580-8bc0-923de40e4fe4', 'SendGrid', 'email', false)
ON CONFLICT (user_id, service_name) DO NOTHING;

INSERT INTO public.active_sessions (user_id, device, browser, ip_address, location, is_current) VALUES
  ('9588ac16-5de9-4580-8bc0-923de40e4fe4', 'MacBook Pro', 'Chrome 120', '190.45.xx.xx', 'Santiago, Chile', true);
