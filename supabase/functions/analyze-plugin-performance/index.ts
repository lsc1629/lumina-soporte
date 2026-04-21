// supabase/functions/analyze-plugin-performance/index.ts
// Analyzes REAL plugins installed on a project from project_plugins table.
// - Reads plugins/themes already synced by fetch-plugins (with current_version & latest_version)
// - Detects outdated plugins by comparing current_version vs latest_version
// - Applies known resource-impact profiles where available
// - Returns everything with real data, zero dummy/invented data

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status: 200, headers: cors });
}

// Known resource-impact profiles for common WP plugins (slug → impact info).
// These are ONLY applied when the slug matches a plugin that IS actually installed.
const KNOWN_PROFILES: Record<string, { impact: 'high' | 'medium' | 'low'; category: string; description: string; suggestion: string }> = {
  'elementor': { impact: 'high', category: 'Page Builder', description: 'Carga CSS/JS pesados en cada página, incluso donde no se usa.', suggestion: 'Desactiva la carga de assets en páginas que no usan Elementor. Usa "Experimentos" → "Optimized CSS Loading".' },
  'js_composer': { impact: 'high', category: 'Page Builder', description: 'WPBakery carga scripts masivos en cada página.', suggestion: 'Considera migrar a Gutenberg nativo o un builder más ligero.' },
  'divi-builder': { impact: 'high', category: 'Page Builder', description: 'Divi carga frameworks CSS y JS completos.', suggestion: 'Activa "Performance mode" de Divi y desactiva módulos no usados.' },
  'beaver-builder-lite-version': { impact: 'medium', category: 'Page Builder', description: 'Carga CSS/JS adicional en el frontend.', suggestion: 'Habilita la minificación en Beaver Builder → Ajustes.' },
  'wordpress-seo': { impact: 'medium', category: 'SEO', description: 'Yoast SEO añade queries a la base de datos en cada carga.', suggestion: 'Desactiva funciones que no uses como XML sitemaps si usas otra solución.' },
  'all-in-one-seo-pack': { impact: 'medium', category: 'SEO', description: 'Similar a Yoast, añade overhead de base de datos.', suggestion: 'Desactiva módulos no necesarios desde AIOSEO → Funcionalidades.' },
  'rank-math-seo': { impact: 'low', category: 'SEO', description: 'Más ligero que Yoast pero aún añade queries.', suggestion: 'Desactiva módulos no utilizados en Rank Math → Dashboard.' },
  'wordfence': { impact: 'high', category: 'Seguridad', description: 'Escaneo constante del filesystem y firewall WAF en cada request.', suggestion: 'Configura escaneo en horarios de bajo tráfico. Considera un WAF externo como Cloudflare.' },
  'better-wp-security': { impact: 'high', category: 'Seguridad', description: 'iThemes Security ejecuta múltiples checks en cada petición.', suggestion: 'Desactiva módulos de detección que no necesites.' },
  'sucuri-scanner': { impact: 'medium', category: 'Seguridad', description: 'Monitoreo continuo y escaneo de archivos.', suggestion: 'Reduce la frecuencia de escaneo y usa el firewall cloud de Sucuri.' },
  'all-in-one-wp-security-and-firewall': { impact: 'medium', category: 'Seguridad', description: 'Múltiples reglas de firewall procesadas en cada request.', suggestion: 'Revisa las reglas activas y desactiva las que tu hosting ya cubre.' },
  'woocommerce': { impact: 'high', category: 'eCommerce', description: 'Carga CSS/JS en todas las páginas, incluso donde no hay tienda.', suggestion: 'Usa un plugin como "Disable WooCommerce Bloat" para cargar assets solo en páginas de tienda.' },
  'contact-form-7': { impact: 'medium', category: 'Formularios', description: 'Carga CSS/JS en TODAS las páginas, no solo donde hay formulario.', suggestion: 'Desactiva la carga global de CF7 y cárgalo solo en páginas con formularios.' },
  'wpforms-lite': { impact: 'low', category: 'Formularios', description: 'Carga assets moderados.', suggestion: 'Asegúrate de no usar la versión lite + pro simultáneamente.' },
  'google-analytics-for-wordpress': { impact: 'medium', category: 'Analytics', description: 'MonsterInsights añade JS tracking y requests adicionales.', suggestion: 'Considera usar GTM directamente o incrustar el snippet de GA4 manualmente.' },
  'google-site-kit': { impact: 'medium', category: 'Analytics', description: 'Múltiples llamadas a APIs de Google en el admin.', suggestion: 'No afecta mucho al frontend pero ralentiza el admin.' },
  'revslider': { impact: 'high', category: 'Slider', description: 'Revolution Slider carga librerías JS pesadas.', suggestion: 'Si no usas sliders en todas las páginas, desactiva la carga global.' },
  'jetpack': { impact: 'high', category: 'Suite', description: 'Jetpack incluye decenas de módulos, muchos innecesarios.', suggestion: 'Desactiva TODOS los módulos que no uses.' },
  'sitepress-multilingual-cms': { impact: 'high', category: 'Traducción', description: 'WPML añade queries significativas para cada traducción.', suggestion: 'Activa el cache de traducciones de WPML y minimiza los idiomas activos.' },
  'polylang': { impact: 'medium', category: 'Traducción', description: 'Más ligero que WPML pero aún añade overhead.', suggestion: 'Usa la versión Pro con cache de URLs para mejor rendimiento.' },
  'w3-total-cache': { impact: 'low', category: 'Cache', description: 'Bien configurado mejora el rendimiento; mal configurado lo empeora.', suggestion: 'Verifica que page cache y browser cache estén activos.' },
  'wp-super-cache': { impact: 'low', category: 'Cache', description: 'Plugin de cache simple y efectivo.', suggestion: 'Asegúrate de que el modo "Expert" esté activo.' },
  'litespeed-cache': { impact: 'low', category: 'Cache', description: 'Excelente si tu servidor es LiteSpeed.', suggestion: 'Si no usas LiteSpeed server, este plugin no hace nada.' },
  'updraftplus': { impact: 'low', category: 'Backup', description: 'Solo consume recursos durante los backups programados.', suggestion: 'Programa backups en horarios de bajo tráfico.' },
  'autoptimize': { impact: 'low', category: 'Optimización', description: 'Mejora rendimiento combinando y minificando CSS/JS.', suggestion: 'Activa "Optimizar CSS" y "Optimizar JS".' },
  'wp-rocket': { impact: 'low', category: 'Optimización', description: 'Plugin premium de cache y optimización muy eficiente.', suggestion: 'Activa lazy load, preload y optimización de base de datos.' },
  'ewww-image-optimizer': { impact: 'medium', category: 'Media', description: 'Optimiza imágenes en upload pero puede saturar el servidor.', suggestion: 'Usa optimización en la nube (API) en lugar de local.' },
  'smush': { impact: 'medium', category: 'Media', description: 'Compresión de imágenes que puede usar recursos del servidor.', suggestion: 'Activa la compresión lazy y en segundo plano.' },
  'woocommerce-multilingual': { impact: 'medium', category: 'eCommerce', description: 'Traducciones dinámicas añaden queries adicionales.', suggestion: 'Usa cache de traducciones y pre-compila las cadenas.' },
  'ml-slider': { impact: 'medium', category: 'Slider', description: 'MetaSlider añade CSS/JS adicional.', suggestion: 'Carga los assets solo en páginas que usan el slider.' },
  'social-warfare': { impact: 'medium', category: 'Social', description: 'Consultas externas para contar shares.', suggestion: 'Desactiva el conteo de shares si no lo necesitas.' },
  'duplicator': { impact: 'low', category: 'Backup', description: 'Solo impacta durante la creación de paquetes.', suggestion: 'Ideal solo para migración. Para backups recurrentes usa UpdraftPlus.' },
  'regenerate-thumbnails': { impact: 'low', category: 'Media', description: 'Solo impacta cuando se regeneran thumbnails.', suggestion: 'Úsalo solo cuando cambies tamaños de imagen en el tema.' },
};

// Compare semver-like versions: returns true if current < latest
function isOutdated(current: string, latest: string): boolean {
  if (!current || !latest) return false;
  if (current === latest) return false;
  const parse = (v: string) => v.replace(/[^0-9.]/g, '').split('.').map(n => parseInt(n, 10) || 0);
  const c = parse(current);
  const l = parse(latest);
  const len = Math.max(c.length, l.length);
  for (let i = 0; i < len; i++) {
    const cv = c[i] || 0;
    const lv = l[i] || 0;
    if (cv < lv) return true;
    if (cv > lv) return false;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json();
    const projectId = body?.project_id;

    if (!projectId) return ok({ plugins: [], error: 'project_id requerido' });

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Read ALL real plugins and themes for this project from the DB
    const { data: plugins, error: pErr } = await sb
      .from('project_plugins')
      .select('name, slug, current_version, latest_version, is_active, plugin_type, author')
      .eq('project_id', projectId);

    if (pErr) return ok({ plugins: [], error: pErr.message });

    if (!plugins || plugins.length === 0) {
      return ok({
        plugins: [],
        summary: { total: 0, outdated: 0, high_impact: 0, medium_impact: 0, low_impact: 0, unknown_impact: 0, active: 0, inactive: 0 },
        error: 'No hay plugins sincronizados para este proyecto. Sincroniza primero desde la vista de Actualizaciones.',
      });
    }

    const results = plugins.map(plugin => {
      const slug = (plugin.slug || '').toLowerCase().replace(/\s+/g, '-');
      const known = KNOWN_PROFILES[slug];

      // Determine if outdated based on REAL versions from DB
      const outdated = isOutdated(plugin.current_version || '', plugin.latest_version || '');

      // Resource impact: use known profile if available, otherwise mark as unknown
      let impact: 'high' | 'medium' | 'low' | 'unknown' = 'unknown';
      let category = plugin.plugin_type === 'theme' ? 'Tema' : 'Otro';
      let description = '';
      let suggestion = '';

      if (known && plugin.is_active) {
        impact = known.impact;
        category = known.category;
        description = known.description;
        suggestion = known.suggestion;
      } else if (!plugin.is_active) {
        impact = 'low';
        category = plugin.plugin_type === 'theme' ? 'Tema' : (known?.category || 'Otro');
        description = 'Inactivo — no consume recursos en el frontend.';
        suggestion = outdated
          ? 'Plugin inactivo y desactualizado. Si no lo necesitas, elimínalo para reducir vulnerabilidades.'
          : 'Plugin inactivo. Si no lo necesitas, elimínalo para reducir superficie de ataque.';
      } else {
        // Active plugin without known profile
        description = 'Plugin activo sin perfil de impacto conocido.';
        suggestion = 'Monitorea su impacto con Query Monitor o el Health Check de WordPress.';
      }

      // Build status flags
      const flags: string[] = [];
      if (outdated) flags.push('desactualizado');
      if (!plugin.is_active) flags.push('inactivo');

      return {
        name: plugin.name,
        slug: plugin.slug,
        current_version: plugin.current_version || '',
        latest_version: plugin.latest_version || '',
        is_active: plugin.is_active,
        plugin_type: plugin.plugin_type,
        author: plugin.author || '',
        outdated,
        impact,
        category,
        description,
        suggestion,
        flags,
      };
    });

    // Sort: outdated first, then by impact (high→medium→low→unknown), then active before inactive
    const impactOrder = { high: 0, medium: 1, low: 2, unknown: 3 };
    results.sort((a, b) => {
      // Outdated first
      if (a.outdated !== b.outdated) return a.outdated ? -1 : 1;
      // Then by impact
      const ia = impactOrder[a.impact] ?? 3;
      const ib = impactOrder[b.impact] ?? 3;
      if (ia !== ib) return ia - ib;
      // Active before inactive
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      return 0;
    });

    const summary = {
      total: results.length,
      outdated: results.filter(r => r.outdated).length,
      high_impact: results.filter(r => r.impact === 'high' && r.is_active).length,
      medium_impact: results.filter(r => r.impact === 'medium' && r.is_active).length,
      low_impact: results.filter(r => r.impact === 'low').length,
      unknown_impact: results.filter(r => r.impact === 'unknown').length,
      active: results.filter(r => r.is_active).length,
      inactive: results.filter(r => !r.is_active).length,
    };

    console.log('[analyze-plugin-performance] project', projectId, '| total:', summary.total, '| outdated:', summary.outdated, '| high:', summary.high_impact);
    return ok({ plugins: results, summary, error: null });

  } catch (e) {
    console.error('[analyze-plugin-performance] FATAL:', e);
    return ok({ plugins: [], error: `Error interno: ${e instanceof Error ? e.message : String(e)}` });
  }
});
