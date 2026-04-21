-- 00018_update_plans_web_ecommerce.sql
-- Reemplaza los planes anteriores por 2 planes definitivos: Web y Ecommerce en CLP.

-- Desactivar planes anteriores
UPDATE public.plans SET is_active = false WHERE slug IN ('starter', 'professional', 'business', 'enterprise');

-- Insertar nuevos planes
INSERT INTO public.plans (name, slug, description, price_monthly, price_currency, max_projects, monitoring_interval_minutes, features, sort_order, is_active) VALUES
(
  'Sitio Web',
  'web',
  'Monitoreo completo para tu sitio web WordPress.',
  14990,
  'CLP',
  1,
  5,
  '["1 sitio web WordPress", "Monitoreo cada 5 minutos, 24/7", "Alertas por email instantáneas", "Certificado SSL monitoreado", "Actualizaciones remotas de plugins y temas", "Detección de caídas con doble verificación", "Página de estado pública", "Reporte mensual automático", "Panel de cliente con historial de uptime", "Conexión con un clic vía Lumina Agent"]',
  1,
  true
),
(
  'Ecommerce',
  'ecommerce',
  'Todo lo del plan Web más monitoreo especializado para WooCommerce y Shopify.',
  29990,
  'CLP',
  1,
  3,
  '["1 tienda online (WooCommerce o Shopify)", "Monitoreo cada 3 minutos, 24/7", "Alertas por email instantáneas", "Certificado SSL monitoreado", "Actualizaciones remotas de plugins y temas", "Detección de caídas con doble verificación", "Monitoreo de estado WooCommerce / Shopify", "Escaneo de imágenes no optimizadas", "Página de estado pública personalizada", "Reporte mensual detallado con PDF", "Panel de cliente con historial completo", "Soporte prioritario"]',
  2,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  price_currency = EXCLUDED.price_currency,
  max_projects = EXCLUDED.max_projects,
  monitoring_interval_minutes = EXCLUDED.monitoring_interval_minutes,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
