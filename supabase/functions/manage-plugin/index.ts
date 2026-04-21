// supabase/functions/manage-plugin/index.ts
// Edge Function — gestión de plugins WordPress: toggle auto-update, delete, install.
// Strategy: GET all plugins from WP, find the target, use its _links.self href for PUT/DELETE.
// This avoids all URL-encoding issues with plugin file paths containing "/".

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

interface WpPlugin {
  plugin: string;        // e.g. "elementor/elementor.php"
  name: string;
  version?: string;
  status: string;        // "active" | "inactive"
  author?: string;
  textdomain?: string;
  auto_update?: boolean;
  _links?: { self?: Array<{ href: string }> };
}

// Find the plugin in the WP API response by slug
function findPlugin(plugins: WpPlugin[], slug: string): WpPlugin | null {
  // 1. Exact folder match
  const byFolder = plugins.find(p => p.plugin.split('/')[0] === slug);
  if (byFolder) return byFolder;
  // 2. textdomain match
  const byTd = plugins.find(p => p.textdomain === slug);
  if (byTd) return byTd;
  // 3. Folder contains slug or slug contains folder
  const byContains = plugins.find(p => {
    const folder = p.plugin.split('/')[0];
    return folder.includes(slug) || slug.includes(folder);
  });
  if (byContains) return byContains;
  // 4. Partial path match
  const byPartial = plugins.find(p => p.plugin.toLowerCase().includes(slug.toLowerCase()));
  if (byPartial) return byPartial;
  // 5. Fuzzy (remove dashes)
  const norm = slug.replace(/-/g, '').toLowerCase();
  const byFuzzy = plugins.find(p => {
    const folder = p.plugin.split('/')[0].replace(/-/g, '').toLowerCase();
    return folder === norm || norm.includes(folder) || folder.includes(norm);
  });
  return byFuzzy || null;
}

// Get the self URL for a plugin from its _links, or build it manually
function getSelfUrl(base: string, wp: WpPlugin): string {
  const selfLink = wp._links?.self?.[0]?.href;
  if (selfLink) return selfLink;
  // Fallback: build URL manually
  return `${base}/wp-json/wp/v2/plugins/${encodeURIComponent(wp.plugin)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json();
    const { project_id, action, plugin_slug, enable } = body as {
      project_id: string;
      action: 'toggle_auto_update' | 'delete_plugin' | 'install_plugin';
      plugin_slug: string;
      enable?: boolean;
    };

    console.log('[manage-plugin] start:', { project_id, action, plugin_slug, enable });

    if (!project_id || !action || !plugin_slug) {
      return ok({ success: false, error: 'Faltan parámetros: project_id, action, plugin_slug' });
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: project, error: pErr } = await sb
      .from('projects')
      .select('id, name, url, admin_url, admin_user, admin_password_encrypted, platform')
      .eq('id', project_id)
      .single();

    if (pErr || !project) {
      return ok({ success: false, error: 'Proyecto no encontrado' });
    }

    if (project.admin_password_encrypted) {
      project.admin_password_encrypted = await decrypt(project.admin_password_encrypted);
    }

    if (!project.admin_user || !project.admin_password_encrypted) {
      return ok({ success: false, error: 'Credenciales WordPress no configuradas.' });
    }

    let base = (project.admin_url || project.url || '').replace(/\/wp-admin\/?$/, '').replace(/\/+$/, '');
    if (!base.startsWith('http')) base = `https://${base}`;
    const auth = `Basic ${encodeBasic(project.admin_user, project.admin_password_encrypted)}`;

    // ── For toggle & delete: fetch ALL plugins from WP, find the target, use its self URL ──
    if (action === 'toggle_auto_update' || action === 'delete_plugin') {
      // Step 1: GET all plugins
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const listRes = await fetch(`${base}/wp-json/wp/v2/plugins`, {
        headers: { 'Authorization': auth, 'Accept': 'application/json' },
        signal: ctrl.signal,
      });
      clearTimeout(t);

      if (!listRes.ok) {
        const errText = await listRes.text();
        console.log('[manage-plugin] list plugins failed:', listRes.status, errText.substring(0, 200));
        if (listRes.status === 401 || listRes.status === 403) {
          return ok({ success: false, error: 'Sin permisos para acceder a plugins. Verifica las credenciales (Application Password).' });
        }
        return ok({ success: false, error: `No se pudo obtener la lista de plugins: HTTP ${listRes.status}` });
      }

      const allPlugins = await listRes.json() as WpPlugin[];
      console.log(`[manage-plugin] fetched ${allPlugins.length} plugins from WP`);

      // Step 2: Find the target plugin
      const target = findPlugin(allPlugins, plugin_slug);
      if (!target) {
        console.log('[manage-plugin] plugin NOT FOUND. Slug:', plugin_slug, '| Available:', allPlugins.map(p => `${p.plugin} (td:${p.textdomain})`));
        return ok({ success: false, error: `Plugin "${plugin_slug}" no encontrado en WordPress. Plugins disponibles: ${allPlugins.map(p => p.plugin.split('/')[0]).join(', ')}` });
      }

      // Step 3: Get the exact self URL from WP's _links
      const selfUrl = getSelfUrl(base, target);
      console.log(`[manage-plugin] target: ${target.plugin} | selfUrl: ${selfUrl}`);

      if (action === 'toggle_auto_update') {
        const res = await fetch(selfUrl, {
          method: 'PUT',
          headers: { 'Authorization': auth, 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ auto_update: enable ?? false }),
        });

        const text = await res.text();
        console.log('[manage-plugin] toggle response:', res.status, text.substring(0, 300));

        if (!res.ok) {
          return ok({ success: false, error: `Error HTTP ${res.status}: ${text.substring(0, 200)}` });
        }

        let result: { auto_update?: boolean };
        try { result = JSON.parse(text); } catch { return ok({ success: false, error: 'Respuesta no es JSON válido.' }); }

        await sb.from('project_plugins')
          .update({ auto_update: result.auto_update ?? enable ?? false })
          .eq('project_id', project_id)
          .eq('slug', plugin_slug);

        return ok({
          success: true,
          message: `Auto-update ${result.auto_update ? 'habilitado' : 'deshabilitado'} para ${plugin_slug}`,
          auto_update: result.auto_update ?? enable ?? false,
        });

      } else {
        // delete_plugin: deactivate first, then delete
        if (target.status === 'active') {
          console.log('[manage-plugin] deactivating before delete...');
          const deactRes = await fetch(selfUrl, {
            method: 'PUT',
            headers: { 'Authorization': auth, 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ status: 'inactive' }),
          });
          console.log('[manage-plugin] deactivate response:', deactRes.status);
          if (!deactRes.ok) {
            const dt = await deactRes.text();
            return ok({ success: false, error: `Error al desactivar: HTTP ${deactRes.status}: ${dt.substring(0, 200)}` });
          }
        }

        const delRes = await fetch(selfUrl, {
          method: 'DELETE',
          headers: { 'Authorization': auth, 'Accept': 'application/json' },
        });
        const delText = await delRes.text();
        console.log('[manage-plugin] delete response:', delRes.status, delText.substring(0, 300));

        if (!delRes.ok) {
          return ok({ success: false, error: `Error al eliminar: HTTP ${delRes.status}: ${delText.substring(0, 200)}` });
        }

        await sb.from('project_plugins')
          .delete()
          .eq('project_id', project_id)
          .eq('slug', plugin_slug);

        return ok({
          success: true,
          message: `Plugin "${plugin_slug}" eliminado correctamente de WordPress`,
        });
      }

    } else if (action === 'install_plugin') {
      const endpoint = `${base}/wp-json/wp/v2/plugins`;
      console.log('[manage-plugin] installing plugin:', plugin_slug);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      let installRes: Response;
      try {
        installRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Authorization': auth, 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ slug: plugin_slug, status: 'active' }),
          signal: controller.signal,
        });
      } catch (fetchErr) {
        clearTimeout(timeout);
        if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
          return ok({ success: false, error: 'Timeout: la instalación tardó demasiado.' });
        }
        throw fetchErr;
      }
      clearTimeout(timeout);

      const installText = await installRes.text();
      console.log('[manage-plugin] install response:', installRes.status, installText.substring(0, 500));

      if (!installRes.ok) {
        if (installRes.status === 401 || installRes.status === 403) {
          return ok({ success: false, error: 'Sin permisos para instalar plugins.' });
        }
        try {
          const errData = JSON.parse(installText) as { code?: string; message?: string };
          if (errData.code === 'folder_exists') {
            return ok({ success: false, error: 'El plugin ya existe en WordPress.', code: 'folder_exists' });
          }
          return ok({ success: false, error: errData.message || `Error HTTP ${installRes.status}` });
        } catch {
          return ok({ success: false, error: `Error HTTP ${installRes.status}: ${installText.substring(0, 200)}` });
        }
      }

      let result: { plugin?: string; name?: string; version?: string; status?: string; author?: string };
      try { result = JSON.parse(installText); } catch { return ok({ success: false, error: 'Respuesta no es JSON válido.' }); }

      await sb.from('project_plugins').upsert({
        project_id: project_id,
        name: (result.name || plugin_slug).replace(/<[^>]*>/g, ''),
        slug: plugin_slug,
        current_version: result.version || '',
        latest_version: result.version || '',
        is_active: result.status === 'active',
        plugin_type: 'plugin',
        author: (typeof result.author === 'string' ? result.author : '').replace(/<[^>]*>/g, ''),
        plugin_file: result.plugin || '',
        last_checked_at: new Date().toISOString(),
      }, { onConflict: 'project_id,slug', ignoreDuplicates: false });

      return ok({
        success: true,
        message: `Plugin "${result.name || plugin_slug}" v${result.version || '?'} instalado y activado`,
        name: result.name,
        version: result.version,
        plugin_file: result.plugin,
      });
    }

    return ok({ success: false, error: `Acción "${action}" no soportada` });

  } catch (e) {
    console.error('[manage-plugin] FATAL:', e);
    return ok({ success: false, error: `Error interno: ${e instanceof Error ? e.message : String(e)}` });
  }
});
