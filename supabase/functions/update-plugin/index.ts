// supabase/functions/update-plugin/index.ts
// Edge Function — ejecuta la actualización real de un plugin/tema/core en WordPress.

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json();
    const { project_id, plugin_slug, plugin_file, update_type } = body as {
      project_id: string;
      plugin_slug: string;       // e.g. "elementor"
      plugin_file?: string;      // e.g. "elementor/elementor.php" (for plugins)
      update_type: 'plugin' | 'theme' | 'core';
    };

    console.log('[update-plugin] start:', { project_id, plugin_slug, update_type, plugin_file });

    if (!project_id || !plugin_slug) {
      return ok({ success: false, error: 'Faltan parámetros: project_id, plugin_slug' });
    }

    // Get project credentials from DB
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: project, error: pErr } = await sb
      .from('projects')
      .select('id, name, url, admin_url, admin_user, admin_password_encrypted, wp_app_user, wp_app_password_encrypted, site_token, platform')
      .eq('id', project_id)
      .single();

    if (pErr || !project) {
      return ok({ success: false, error: 'Proyecto no encontrado' });
    }

    if (project.admin_password_encrypted) {
      project.admin_password_encrypted = await decrypt(project.admin_password_encrypted);
    }
    if (project.wp_app_password_encrypted) {
      project.wp_app_password_encrypted = await decrypt(project.wp_app_password_encrypted);
    }

    const isWoo = project.admin_user?.startsWith('ck_');
    const hasAgent = !!project.site_token || (!!project.wp_app_user && !!project.wp_app_password_encrypted);

    let base = (project.admin_url || project.url || '').replace(/\/wp-admin\/?$/, '').replace(/\/+$/, '');
    if (!base.startsWith('http')) base = `https://${base}`;

    if (!hasAgent && (!project.admin_user || !project.admin_password_encrypted)) {
      return ok({ success: false, error: 'Credenciales WordPress no configuradas. Instala el plugin Lumina Agent y pega tu API Key.' });
    }

    // For WooCommerce sites WITHOUT Lumina Agent, try legacy route
    if (isWoo && !hasAgent) {
      console.log('[update-plugin] WooCommerce site (no agent) — using legacy WP REST API route');
      return await updateViaWpRestApi(sb, base, project, project_id, plugin_slug, update_type);
    }

    // Build auth: prefer site_token (v3), fallback to Basic Auth (v2/legacy)
    let auth = '';
    const extraHeaders: Record<string, string> = {};
    if (project.site_token) {
      extraHeaders['X-Lumina-Token'] = project.site_token;
      console.log('[update-plugin] using site_token (v3)');
    } else {
      const authUser = hasAgent ? project.wp_app_user : project.admin_user;
      const authPass = hasAgent ? project.wp_app_password_encrypted : project.admin_password_encrypted;
      auth = `Basic ${encodeBasic(authUser, authPass)}`;
      console.log('[update-plugin] using', hasAgent ? 'Lumina Agent v2' : 'legacy', 'credentials | user:', authUser);
    }

    // Build endpoint and body based on update type
    let endpoint = '';
    let postBody = '';

    if (update_type === 'core') {
      endpoint = `${base}/wp-json/lumina/v1/update-core`;
      postBody = JSON.stringify({});
    } else if (update_type === 'theme') {
      endpoint = `${base}/wp-json/lumina/v1/update-theme`;
      postBody = JSON.stringify({ theme: plugin_slug });
    } else {
      endpoint = `${base}/wp-json/lumina/v1/update-plugin`;
      // Resolve the actual plugin file path from the WP REST API
      let file = plugin_file;
      if (!file) {
        const resolveHdrs: Record<string, string> = { 'Accept': 'application/json', ...extraHeaders };
        if (auth) resolveHdrs['Authorization'] = auth;
        file = await resolvePluginFile(base, resolveHdrs, plugin_slug) ?? undefined;
        console.log('[update-plugin] resolved file for slug', plugin_slug, '->', file);
      }
      if (!file) {
        return ok({ success: false, error: `No se pudo resolver el archivo del plugin "${plugin_slug}". Verifica que el plugin exista en WordPress.` });
      }
      // Ensure the file path ends with .php
      if (!file.endsWith('.php')) file = file + '.php';
      postBody = JSON.stringify({ plugin: file });
    }

    console.log('[update-plugin] calling:', endpoint, 'body:', postBody);

    // Call the Lumina Updater endpoint on the WP site
    // Use AbortController with 120s timeout (plugin updates can be slow)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    let updateRes: Response;
    try {
      const fetchHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...extraHeaders,
      };
      if (auth) fetchHeaders['Authorization'] = auth;
      updateRes = await fetch(endpoint, {
        method: 'POST',
        headers: fetchHeaders,
        body: postBody,
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
        return ok({ success: false, error: 'Timeout: la actualización tardó demasiado. Verifica manualmente en WordPress.' });
      }
      throw fetchErr;
    }
    clearTimeout(timeout);

    const responseUrl = updateRes.url;
    const responseStatus = updateRes.status;
    console.log('[update-plugin] response status:', responseStatus, 'url:', responseUrl, 'redirected:', updateRes.redirected);

    // Read the response body as text first to debug
    const responseText = await updateRes.text();
    console.log('[update-plugin] response body (first 500):', responseText.substring(0, 500));

    // Check for non-JSON responses (HTML error pages, redirects, etc.)
    const contentType = updateRes.headers.get('content-type') || '';
    if (!contentType.includes('json') && responseStatus !== 200) {
      // Likely a redirect to login page or an HTML error
      if (responseText.includes('wp-login') || responseText.includes('login_form')) {
        return ok({ success: false, error: 'WordPress redirigió al login. Verifica que las Application Passwords estén habilitadas y el usuario sea Administrador.' });
      }
      if (responseStatus === 404 || responseText.includes('rest_no_route')) {
        return ok({
          success: false,
          error: 'El plugin Lumina Updater no está activado en este sitio WordPress. Ve a Plugins y actívalo.',
          needs_mu_plugin: true,
        });
      }
      return ok({ success: false, error: `WordPress respondió con HTTP ${responseStatus}. Respuesta: ${responseText.substring(0, 200)}` });
    }

    if (responseStatus === 403 || responseStatus === 401) {
      return ok({
        success: false,
        error: 'Sin permisos para actualizar. Verifica que el usuario tenga rol Administrador.',
      });
    }

    // Parse JSON
    let result: { success?: boolean; error?: string; new_version?: string; name?: string; code?: string; message?: string; data?: { status?: number } };
    try {
      result = JSON.parse(responseText);
    } catch {
      return ok({ success: false, error: `Respuesta no es JSON válido: ${responseText.substring(0, 200)}` });
    }
    console.log('[update-plugin] result:', JSON.stringify(result));

    // WordPress REST API error format: { code: "rest_no_route", message: "...", data: { status: 404 } }
    if (result.code === 'rest_no_route') {
      return ok({
        success: false,
        error: 'El plugin Lumina Updater no está activado en este sitio. Ve a Plugins en WordPress y actívalo.',
        needs_mu_plugin: true,
      });
    }

    if (result.code === 'rest_forbidden' || result.code === 'rest_cannot_update_plugins') {
      return ok({ success: false, error: `Sin permisos: ${result.message || 'El usuario no tiene capability update_plugins'}` });
    }

    if (result.success) {
      // Update the plugin version in our DB
      const updateData: Record<string, string> = {};
      if (result.new_version) {
        updateData.current_version = result.new_version;
        updateData.latest_version = result.new_version;
      }

      if (Object.keys(updateData).length > 0) {
        await sb.from('project_plugins')
          .update(updateData)
          .eq('project_id', project_id)
          .eq('slug', plugin_slug);
      }

      return ok({
        success: true,
        message: `${result.name || plugin_slug} actualizado a v${result.new_version || '?'}`,
        new_version: result.new_version || null,
      });
    } else {
      return ok({
        success: false,
        error: result.error || 'Error desconocido al actualizar',
      });
    }

  } catch (e) {
    console.error('[update-plugin] FATAL:', e);
    return ok({ success: false, error: `Error interno: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * Resolve plugin file path from slug by querying WP REST API.
 */
async function resolvePluginFile(base: string, headers: Record<string, string>, slug: string): Promise<string | null> {
  try {
    const res = await fetch(`${base}/wp-json/wp/v2/plugins`, {
      headers,
    });
    if (!res.ok) {
      console.log('[resolvePluginFile] API returned', res.status, '- cannot resolve');
      return null;
    }

    const plugins = await res.json() as Array<{ plugin: string; textdomain?: string; name?: string }>;
    console.log('[resolvePluginFile] found', plugins.length, 'plugins, looking for slug:', slug);

    const byFolder = plugins.find(p => p.plugin.split('/')[0] === slug);
    if (byFolder) return byFolder.plugin;
    const byTextdomain = plugins.find(p => p.textdomain === slug);
    if (byTextdomain) return byTextdomain.plugin;
    const byContains = plugins.find(p => {
      const folder = p.plugin.split('/')[0];
      return folder.includes(slug) || slug.includes(folder);
    });
    if (byContains) return byContains.plugin;
    const byPartial = plugins.find(p => p.plugin.toLowerCase().includes(slug.toLowerCase()));
    if (byPartial) return byPartial.plugin;

    console.log('[resolvePluginFile] no match found for', slug);
    return null;
  } catch (e) {
    console.error('[resolvePluginFile] error:', e);
    return null;
  }
}

/**
 * WooCommerce fallback: update plugins via WP REST API /wp/v2/plugins
 * using wp_app_user + wp_app_password stored in the project, or
 * attempting with the site's admin Application Password credentials.
 */
interface WpPluginInfo {
  plugin: string;
  name: string;
  version?: string;
  status: string;
  textdomain?: string;
  _links?: { self?: Array<{ href: string }> };
}

// deno-lint-ignore no-explicit-any
async function updateViaWpRestApi(sb: any, base: string, project: any, project_id: string, plugin_slug: string, update_type: string): Promise<Response> {
  // For WooCommerce sites the admin_user is ck_... and admin_password is cs_...
  // These DON'T work for WP REST API /wp/v2/plugins endpoints.
  // We need Application Password credentials.
  // Check if the project has wp_app_user / wp_app_password fields.
  const { data: projFull } = await sb
    .from('projects')
    .select('wp_app_user, wp_app_password_encrypted')
    .eq('id', project_id)
    .single();

  let appUser = projFull?.wp_app_user || '';
  let appPass = projFull?.wp_app_password_encrypted || '';

  if (appPass) {
    try { appPass = await decrypt(appPass); } catch { /* use raw */ }
  }

  // If no dedicated app password fields, the update won't work with ck_/cs_ credentials
  if (!appUser || !appPass) {
    console.log('[update-plugin] No wp_app_user/wp_app_password found. Attempting with admin_user as Basic Auth anyway...');
    // Some WooCommerce sites store Application Password user in admin_user field
    // despite it starting with ck_. Let's attempt anyway — worst case we get 401.
    appUser = project.admin_user;
    appPass = project.admin_password_encrypted;
  }

  const auth = `Basic ${encodeBasic(appUser, appPass)}`;

  if (update_type === 'core') {
    // Try lumina/v1/update-core first
    const coreEndpoint = `${base}/wp-json/lumina/v1/update-core`;
    console.log('[update-plugin:woo] trying core update:', coreEndpoint);
    try {
      const coreRes = await fetch(coreEndpoint, {
        method: 'POST',
        headers: { 'Authorization': auth, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: '{}',
      });
      const coreText = await coreRes.text();
      console.log('[update-plugin:woo] core response:', coreRes.status, coreText.substring(0, 300));
      if (coreRes.ok) {
        try {
          const r = JSON.parse(coreText) as { success?: boolean; new_version?: string; error?: string; name?: string };
          if (r.success) {
            if (r.new_version) {
              await sb.from('project_plugins').update({ current_version: r.new_version, latest_version: r.new_version }).eq('project_id', project_id).eq('slug', 'wordpress-core');
            }
            return ok({ success: true, message: `WordPress Core actualizado a v${r.new_version || '?'}`, new_version: r.new_version });
          }
          return ok({ success: false, error: r.error || 'Error al actualizar core' });
        } catch { /* continue */ }
      }
      if (coreRes.status === 404) {
        return ok({ success: false, error: 'El plugin Lumina Updater no está activado en este sitio WordPress.', needs_mu_plugin: true });
      }
      if (coreRes.status === 401 || coreRes.status === 403) {
        return ok({ success: false, error: 'Sin permisos. Configura Application Password para este sitio WooCommerce en la sección de credenciales del proyecto.' });
      }
    } catch (e) {
      console.log('[update-plugin:woo] core error:', e);
    }
    return ok({ success: false, error: 'No se pudo actualizar el core de WordPress en este sitio WooCommerce.' });
  }

  // Plugin/Theme update via WP REST API
  console.log('[update-plugin:woo] fetching plugin list from WP REST API...');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  let listRes: Response;
  try {
    listRes = await fetch(`${base}/wp-json/wp/v2/plugins`, {
      headers: { 'Authorization': auth, 'Accept': 'application/json' },
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(t);
    return ok({ success: false, error: `No se pudo conectar con la API de WordPress: ${e instanceof Error ? e.message : String(e)}` });
  }
  clearTimeout(t);

  if (!listRes.ok) {
    const errText = await listRes.text();
    console.log('[update-plugin:woo] list failed:', listRes.status, errText.substring(0, 200));
    if (listRes.status === 401 || listRes.status === 403) {
      return ok({ success: false, error: 'Las credenciales no tienen permisos para la API de plugins. Para sitios WooCommerce, necesitas configurar Application Password (usuario WP + contraseña de aplicación) en las credenciales del proyecto.' });
    }
    return ok({ success: false, error: `Error HTTP ${listRes.status} al obtener plugins` });
  }

  const allPlugins = await listRes.json() as WpPluginInfo[];
  console.log(`[update-plugin:woo] fetched ${allPlugins.length} plugins`);

  // Find plugin
  let target: WpPluginInfo | undefined;
  target = allPlugins.find(p => p.plugin.split('/')[0] === plugin_slug);
  if (!target) target = allPlugins.find(p => p.textdomain === plugin_slug);
  if (!target) target = allPlugins.find(p => p.plugin.split('/')[0].includes(plugin_slug) || plugin_slug.includes(p.plugin.split('/')[0]));
  if (!target) target = allPlugins.find(p => p.plugin.toLowerCase().includes(plugin_slug.toLowerCase()));

  if (!target) {
    return ok({ success: false, error: `Plugin "${plugin_slug}" no encontrado en WordPress.` });
  }

  // Get self URL
  const selfUrl = target._links?.self?.[0]?.href || `${base}/wp-json/wp/v2/plugins/${encodeURIComponent(target.plugin)}`;
  console.log(`[update-plugin:woo] target: ${target.plugin} | selfUrl: ${selfUrl}`);

  // The WP REST API doesn't have a direct "update plugin" endpoint.
  // Plugin updates are done via the WordPress upgrader, not via PUT.
  // We need to use the lumina/v1/update-plugin endpoint.
  const luminaEndpoint = `${base}/wp-json/lumina/v1/update-plugin`;
  console.log('[update-plugin:woo] trying lumina update endpoint:', luminaEndpoint);

  const updateCtrl = new AbortController();
  const updateTimeout = setTimeout(() => updateCtrl.abort(), 120000);

  let updateRes: Response;
  try {
    updateRes = await fetch(luminaEndpoint, {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ plugin: target.plugin }),
      signal: updateCtrl.signal,
    });
  } catch (e) {
    clearTimeout(updateTimeout);
    if (e instanceof DOMException && e.name === 'AbortError') {
      return ok({ success: false, error: 'Timeout: la actualización tardó demasiado.' });
    }
    return ok({ success: false, error: `Error de conexión: ${e instanceof Error ? e.message : String(e)}` });
  }
  clearTimeout(updateTimeout);

  const resText = await updateRes.text();
  console.log('[update-plugin:woo] update response:', updateRes.status, resText.substring(0, 500));

  if (updateRes.status === 404) {
    return ok({ success: false, error: 'El plugin Lumina Updater no está activado en este sitio. Instálalo para poder actualizar plugins remotamente.', needs_mu_plugin: true });
  }

  if (updateRes.status === 401 || updateRes.status === 403) {
    return ok({ success: false, error: 'Sin permisos para actualizar plugins. Para sitios WooCommerce, configura Application Password en las credenciales del proyecto.' });
  }

  try {
    const result = JSON.parse(resText) as { success?: boolean; error?: string; new_version?: string; name?: string; code?: string; message?: string };
    if (result.code === 'rest_no_route') {
      return ok({ success: false, error: 'El plugin Lumina Updater no está activado en este sitio.', needs_mu_plugin: true });
    }
    if (result.success) {
      if (result.new_version) {
        await sb.from('project_plugins').update({ current_version: result.new_version, latest_version: result.new_version }).eq('project_id', project_id).eq('slug', plugin_slug);
      }
      return ok({ success: true, message: `${result.name || plugin_slug} actualizado a v${result.new_version || '?'}`, new_version: result.new_version });
    }
    return ok({ success: false, error: result.error || result.message || 'Error desconocido al actualizar' });
  } catch {
    return ok({ success: false, error: `Respuesta no es JSON: ${resText.substring(0, 200)}` });
  }
}
