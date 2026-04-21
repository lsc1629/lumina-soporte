// supabase/functions/site-health/index.ts
// Edge Function — obtiene información completa de salud de un sitio: SSL, headers, WP info, PHP version, etc.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decrypt } from '../_shared/crypto.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status: 200, headers: cors });
}

function encodeBasic(user: string, pass: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${user}:${pass}`);
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary);
}

interface HealthInfo {
  ssl: {
    active: boolean;
    issuer: string | null;
    expiry: string | null;
    days_left: number | null;
    protocol: string | null;
  };
  server: {
    software: string | null;
    powered_by: string | null;
    php_version: string | null;
    content_encoding: string | null;
    cache_control: string | null;
    cdn: string | null;
  };
  wordpress: {
    version: string | null;
    theme: string | null;
    rest_api: boolean;
    multisite: boolean;
    language: string | null;
    timezone: string | null;
    db_version: string | null;
    memory_limit: string | null;
    max_upload: string | null;
    debug_mode: boolean;
    cron_active: boolean;
    permalink_structure: string | null;
  } | null;
  performance: {
    ttfb_ms: number | null;
    total_time_ms: number | null;
    page_size_kb: number | null;
    gzip: boolean;
  };
  security: {
    x_frame_options: string | null;
    x_content_type: string | null;
    strict_transport: boolean;
    csp: boolean;
    x_xss_protection: string | null;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json();
    const projectId = body?.project_id;

    if (!projectId) return ok({ health: null, error: 'project_id requerido' });

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: project, error: pErr } = await sb
      .from('projects')
      .select('id, name, url, platform, admin_url, admin_user, admin_password_encrypted')
      .eq('id', projectId)
      .single();

    if (project?.admin_password_encrypted) {
      project.admin_password_encrypted = await decrypt(project.admin_password_encrypted);
    }

    if (pErr || !project) return ok({ health: null, error: `Proyecto no encontrado` });

    let baseUrl = (project.url || '').replace(/\/$/, '');
    if (!baseUrl.startsWith('http')) baseUrl = `https://${baseUrl}`;

    const health: HealthInfo = {
      ssl: { active: false, issuer: null, expiry: null, days_left: null, protocol: null },
      server: { software: null, powered_by: null, php_version: null, content_encoding: null, cache_control: null, cdn: null },
      wordpress: null,
      performance: { ttfb_ms: null, total_time_ms: null, page_size_kb: null, gzip: false },
      security: { x_frame_options: null, x_content_type: null, strict_transport: false, csp: false, x_xss_protection: null },
    };

    // ── 1. Fetch site and analyze headers ──
    const startTime = Date.now();
    let pageHtml = '';
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(baseUrl, {
        headers: { 'Accept': 'text/html', 'User-Agent': 'LuminaSupport-HealthCheck/1.0' },
        redirect: 'follow',
        signal: ctrl.signal,
      });
      clearTimeout(timeout);

      const totalTime = Date.now() - startTime;
      health.performance.total_time_ms = totalTime;
      health.performance.ttfb_ms = totalTime; // approximate

      // SSL detection from URL
      const finalUrl = res.url || baseUrl;
      health.ssl.active = finalUrl.startsWith('https://');
      if (health.ssl.active) {
        health.ssl.protocol = 'TLS';
      }

      // Server headers
      const headers = res.headers;
      health.server.software = headers.get('server');
      health.server.powered_by = headers.get('x-powered-by');
      health.server.content_encoding = headers.get('content-encoding');
      health.server.cache_control = headers.get('cache-control');
      health.performance.gzip = (headers.get('content-encoding') || '').includes('gzip') || (headers.get('content-encoding') || '').includes('br');

      // CDN detection
      const cfRay = headers.get('cf-ray');
      const xCache = headers.get('x-cache');
      const via = headers.get('via');
      const xServedBy = headers.get('x-served-by');
      if (cfRay) health.server.cdn = 'Cloudflare';
      else if (xServedBy?.includes('cache')) health.server.cdn = 'Fastly';
      else if (via?.includes('cloudfront')) health.server.cdn = 'CloudFront';
      else if (xCache) health.server.cdn = 'CDN detectado';

      // PHP version from X-Powered-By
      const phpMatch = (health.server.powered_by || '').match(/PHP\/([\d.]+)/i);
      if (phpMatch) health.server.php_version = phpMatch[1];

      // Security headers
      health.security.x_frame_options = headers.get('x-frame-options');
      health.security.x_content_type = headers.get('x-content-type-options');
      health.security.strict_transport = !!headers.get('strict-transport-security');
      health.security.csp = !!headers.get('content-security-policy');
      health.security.x_xss_protection = headers.get('x-xss-protection');

      // Page size
      pageHtml = await res.text();
      health.performance.page_size_kb = Math.round(new TextEncoder().encode(pageHtml).length / 1024);

    } catch (e) {
      console.log('[site-health] fetch error:', e instanceof Error ? e.message : e);
    }

    // ── 2. SSL certificate info via external API ──
    try {
      const hostname = new URL(baseUrl).hostname;
      // Try to get SSL info from the site's headers or a public checker
      // We'll use a simple TLS check via fetch to an HTTPS endpoint
      if (health.ssl.active) {
        // Parse SSL info from common sources
        // Many WordPress sites expose this; we can also check via public API
        const sslCtrl = new AbortController();
        const sslTimeout = setTimeout(() => sslCtrl.abort(), 8000);
        try {
          const sslRes = await fetch(`https://ssl-checker.io/api/v1/check/${hostname}`, {
            signal: sslCtrl.signal,
            headers: { 'Accept': 'application/json' },
          });
          clearTimeout(sslTimeout);
          if (sslRes.ok) {
            const sslData = await sslRes.json() as Record<string, any>;
            if (sslData.result) {
              health.ssl.issuer = sslData.result.issuer || sslData.result.issuer_o || null;
              if (sslData.result.valid_till) {
                health.ssl.expiry = sslData.result.valid_till;
                const expiryDate = new Date(sslData.result.valid_till);
                health.ssl.days_left = Math.floor((expiryDate.getTime() - Date.now()) / 86400000);
              }
              health.ssl.protocol = sslData.result.protocol || health.ssl.protocol;
            }
          }
        } catch { /* SSL checker optional */ }

        // Fallback: if no SSL expiry found, just mark as active
        if (!health.ssl.expiry) {
          health.ssl.issuer = 'Detectado (detalles no disponibles)';
          health.ssl.days_left = null;
        }

        // Update project ssl_expiry in DB if we got it
        if (health.ssl.expiry) {
          await sb.from('projects').update({ ssl_expiry: health.ssl.expiry }).eq('id', project.id);
        }
      }
    } catch (e) {
      console.log('[site-health] SSL check error:', e instanceof Error ? e.message : e);
    }

    // ── 3. WordPress-specific checks ──
    const isWp = ['wordpress', 'headless'].includes(project.platform);
    if (isWp) {
      health.wordpress = {
        version: null,
        theme: null,
        rest_api: false,
        multisite: false,
        language: null,
        timezone: null,
        db_version: null,
        memory_limit: null,
        max_upload: null,
        debug_mode: false,
        cron_active: true,
        permalink_structure: null,
      };

      // Extract WP version from meta generator
      const wpVerMatch = pageHtml.match(/content="WordPress\s+([\d.]+)"/i);
      if (wpVerMatch) health.wordpress.version = wpVerMatch[1];

      // Check REST API
      let wpApiBase = (project.admin_url || project.url || '').replace(/\/wp-admin\/?$/, '').replace(/\/+$/, '');
      if (!wpApiBase.startsWith('http')) wpApiBase = `https://${wpApiBase}`;

      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const wpRes = await fetch(`${wpApiBase}/wp-json/`, { signal: ctrl.signal, headers: { 'Accept': 'application/json' } });
        clearTimeout(t);
        if (wpRes.ok) {
          const wpData = await wpRes.json() as Record<string, any>;
          health.wordpress.rest_api = true;
          if (wpData.name) health.wordpress.language = wpData.name;
          if (wpData.timezone_string) health.wordpress.timezone = wpData.timezone_string;
          if (wpData.gmt_offset !== undefined && !health.wordpress.timezone) {
            health.wordpress.timezone = `UTC${wpData.gmt_offset >= 0 ? '+' : ''}${wpData.gmt_offset}`;
          }
        }
      } catch { /* optional */ }

      // Detect WooCommerce credentials
      const isWoo = project.admin_user?.startsWith('ck_');

      // If WooCommerce, use system_status for detailed info
      if (isWoo && project.admin_user && project.admin_password_encrypted) {
        try {
          const ck = project.admin_user;
          const cs = project.admin_password_encrypted;
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 10000);
          const res = await fetch(`${wpApiBase}/wp-json/wc/v3/system_status?consumer_key=${encodeURIComponent(ck)}&consumer_secret=${encodeURIComponent(cs)}`, {
            signal: ctrl.signal,
            headers: { 'Accept': 'application/json' },
          });
          clearTimeout(t);
          if (res.ok) {
            const data = await res.json() as Record<string, any>;
            const env = data.environment;
            if (env) {
              health.wordpress.version = env.wp_version || health.wordpress.version;
              if (!health.server.php_version) health.server.php_version = env.php_version;
              health.wordpress.db_version = env.mysql_version || null;
              health.wordpress.memory_limit = env.wp_memory_limit ? `${Math.round(env.wp_memory_limit / 1048576)}MB` : null;
              health.wordpress.max_upload = env.max_upload_size ? `${Math.round(env.max_upload_size / 1048576)}MB` : null;
              health.wordpress.debug_mode = env.wp_debug === true;
              health.wordpress.multisite = env.wp_multisite === true;
              health.wordpress.cron_active = env.wp_cron !== false;
              health.wordpress.permalink_structure = env.default_permalink || null;
            }
            if (data.theme) {
              health.wordpress.theme = data.theme.name || null;
            }
          }
        } catch { /* optional */ }
      }

      // If WordPress pure, use Application Password auth for more info
      if (!isWoo && project.admin_user && project.admin_password_encrypted) {
        const auth = `Basic ${encodeBasic(project.admin_user, project.admin_password_encrypted)}`;
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 8000);
          const res = await fetch(`${wpApiBase}/wp-json/wp/v2/settings`, {
            signal: ctrl.signal,
            headers: { 'Authorization': auth, 'Accept': 'application/json' },
          });
          clearTimeout(t);
          if (res.ok) {
            const settings = await res.json() as Record<string, any>;
            if (settings.language) health.wordpress.language = settings.language;
            if (settings.timezone_string) health.wordpress.timezone = settings.timezone_string;
          }
        } catch { /* optional */ }

        // Get active theme
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 8000);
          const res = await fetch(`${wpApiBase}/wp-json/wp/v2/themes?status=active`, {
            signal: ctrl.signal,
            headers: { 'Authorization': auth, 'Accept': 'application/json' },
          });
          clearTimeout(t);
          if (res.ok) {
            const themes = await res.json() as Array<Record<string, any>>;
            if (themes.length > 0) {
              const name = themes[0].name;
              health.wordpress.theme = typeof name === 'string' ? name : (name?.rendered || name?.raw || null);
            }
          }
        } catch { /* optional */ }
      }

      // Detect theme from HTML if not found via API
      if (!health.wordpress.theme && pageHtml) {
        const themeMatch = pageHtml.match(/\/wp-content\/themes\/([^/"']+)/);
        if (themeMatch) health.wordpress.theme = themeMatch[1];
      }
    }

    console.log('[site-health] done for', project.name);
    return ok({ health, error: null });

  } catch (e) {
    console.error('[site-health] FATAL:', e);
    return ok({ health: null, error: `Error interno: ${e instanceof Error ? e.message : String(e)}` });
  }
});
