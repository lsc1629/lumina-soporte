-- ============================================================
-- Gestión Comercial: Planes y Suscripciones
-- Gestión de Clientes: Extensión de profiles
-- ============================================================

-- Tabla de planes comerciales
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

-- Tabla de suscripciones (cliente ↔ plan)
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

-- Tabla de pagos/historial
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

-- Extensión de profiles para gestión comercial
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.plans(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Índices
CREATE INDEX IF NOT EXISTS idx_subscriptions_client ON public.subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_payments_subscription ON public.payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payments_client ON public.payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- RLS
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Plans: todos pueden leer, solo admins modifican
CREATE POLICY "Anyone can read active plans" ON public.plans FOR SELECT USING (is_active = true);
CREATE POLICY "Admins full access plans" ON public.plans FOR ALL USING (public.is_admin());

-- Subscriptions: clientes ven las suyas, admins ven todas
CREATE POLICY "Clients view own subscriptions" ON public.subscriptions FOR SELECT USING (client_id = auth.uid());
CREATE POLICY "Admins full access subscriptions" ON public.subscriptions FOR ALL USING (public.is_admin());

-- Payments: clientes ven los suyos, admins ven todos
CREATE POLICY "Clients view own payments" ON public.payments FOR SELECT USING (client_id = auth.uid());
CREATE POLICY "Admins full access payments" ON public.payments FOR ALL USING (public.is_admin());

-- Seed: Planes iniciales
INSERT INTO public.plans (name, slug, description, price_monthly, price_currency, max_projects, monitoring_interval_minutes, features, sort_order) VALUES
(
  'Starter',
  'starter',
  'Ideal para freelancers o sitios personales',
  9.99,
  'USD',
  2,
  10,
  '["Monitoreo cada 10 min", "2 sitios web", "Alertas por email", "Reporte mensual básico", "Página de estado pública"]',
  1
),
(
  'Profesional',
  'professional',
  'Para agencias y desarrolladores con varios clientes',
  29.99,
  'USD',
  10,
  5,
  '["Monitoreo cada 5 min", "10 sitios web", "Alertas por email + prioridad", "Reportes mensuales detallados", "Escaneo de seguridad", "Optimización de imágenes", "SEO Performance", "Página de estado pública", "Soporte prioritario"]',
  2
),
(
  'Business',
  'business',
  'Para empresas con necesidades avanzadas de monitoreo',
  79.99,
  'USD',
  50,
  3,
  '["Monitoreo cada 3 min", "50 sitios web", "Alertas por email + SMS", "Reportes avanzados con PDF", "Escaneo de seguridad completo", "Optimización de imágenes", "SEO Performance + Core Web Vitals", "Páginas de estado personalizadas", "API access", "Soporte 24/7", "Gestión multi-equipo"]',
  3
),
(
  'Enterprise',
  'enterprise',
  'Solución personalizada para grandes operaciones',
  0,
  'USD',
  999,
  1,
  '["Monitoreo cada 1 min", "Sitios ilimitados", "Todas las funcionalidades", "Alertas multicanal", "SLA garantizado", "Integración personalizada", "Account manager dedicado", "On-boarding asistido"]',
  4
)
ON CONFLICT (slug) DO NOTHING;
