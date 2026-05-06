// supabase/functions/update-plugin/index.ts
// Edge Function — ejecuta la actualización real de un plugin/tema/core en WordPress.
// Auth: X-Lumina-Token via site_token — NO usa Application Passwords.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status: 200, headers: cors });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json();
    const { project_id, plugin_slug, plugin_file, update_type } = body as {
      project_id: string;
      plugin_slug: string;
      plugin_file?: string;
      update_type: 'plugin' | 'theme' | 'core';
    };

    console.log('[update-plugin] start:', { project_id, plugin_slug, update_type, plugin_file });

    if (!project_id || !plugin_slug) {
      return ok({ success: false, error: 'Faltan parámetros: project_id, plugin_slug' });
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: project, error: pErr } = await sb
      .from('projects')
      .select('id, name, url, admin_url, site_token, platform')
      .eq('id', project_id)
      .single();

    if (pErr || !project) {
      return ok({ success: false, error: 'Proyecto no encontrado' });
    }

    if (!project.site_token) {
      return ok({ success: false, error: 'El plugin Lumina Agent no está conectado. Instálalo en WordPress y pega tu API Key desde el panel.' });
    }

    let base = (project.admin_url || project.url || '').replace(/\/wp-admin\/?$/, '').replace(/\/+$/, '');
    if (!base.startsWith('http')) base = `https://${base}`;

    const extraHeaders: Record<string, string> = { 'X-Lumina-Token': project.site_token };
    console.log('[update-plugin] using site_token (v3)');

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
        return ok({ success: false, error: 'Token inválido. Reconecta el plugin Lumina Agent.' });
      }
      if (responseStatus === 404 || responseText.includes('rest_no_route')) {
        return ok({
          success: false,
          error: 'El plugin Lumina Agent no está instalado o activo en este sitio WordPress.',
        });
      }
      return ok({ success: false, error: `WordPress respondió con HTTP ${responseStatus}. Respuesta: ${responseText.substring(0, 200)}` });
    }

    if (responseStatus === 403 || responseStatus === 401) {
      return ok({
        success: false,
        error: 'Token inválido. Reconecta el plugin Lumina Agent desde WordPress → Ajustes → Lumina Agent.',
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
        error: 'El plugin Lumina Agent no está instalado o activo en este sitio WordPress.',
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
 * Resolve plugin file path from slug querying the Lumina Agent endpoint.
 */
async function resolvePluginFile(base: string, headers: Record<string, string>, slug: string): Promise<string | null> {
  try {
    const res = await fetch(`${base}/wp-json/lumina/v1/plugins`, { headers });
    if (!res.ok) {
      console.log('[resolvePluginFile] lumina/v1/plugins returned', res.status);
      return null;
    }
    const data = await res.json() as { plugins?: Array<{ slug: string; plugin_file: string }> };
    const plugins = data.plugins || [];
    const match = plugins.find(p => p.slug === slug);
    if (match) return match.plugin_file;
    console.log('[resolvePluginFile] no match for', slug);
    return null;
  } catch (e) {
    console.error('[resolvePluginFile] error:', e);
    return null;
  }
}

