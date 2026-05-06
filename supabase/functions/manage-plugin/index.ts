// supabase/functions/manage-plugin/index.ts
// Edge Function — gestión de plugins WordPress via Lumina Agent v3 (site_token).
// Acciones: toggle_auto_update, delete_plugin, install_plugin.
// Auth: X-Lumina-Token — NO usa Application Passwords.

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
    const { project_id, action, plugin_slug, plugin_file, enable } = body as {
      project_id: string;
      action: 'toggle_auto_update' | 'delete_plugin' | 'install_plugin';
      plugin_slug: string;
      plugin_file?: string;
      enable?: boolean;
    };

    console.log('[manage-plugin] start:', { project_id, action, plugin_slug, plugin_file, enable });

    if (!project_id || !action || !plugin_slug) {
      return ok({ success: false, error: 'Faltan parámetros: project_id, action, plugin_slug' });
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
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
      return ok({
        success: false,
        error: 'El plugin Lumina Agent no está conectado. Instálalo en WordPress y pega tu API Key desde el panel.',
      });
    }

    let base = (project.admin_url || project.url || '').replace(/\/wp-admin\/?$/, '').replace(/\/+$/, '');
    if (!base.startsWith('http')) base = `https://${base}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Lumina-Token': project.site_token,
    };

    if (action === 'toggle_auto_update') {
      // Requires plugin_file (e.g. "elementor/elementor.php")
      const file = plugin_file || `${plugin_slug}/${plugin_slug}.php`;
      const newState = enable ?? false;

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);

      let res: Response;
      try {
        res = await fetch(`${base}/wp-json/lumina/v1/toggle-auto-update`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ plugin_file: file, enable: newState }),
          signal: ctrl.signal,
        });
      } catch (e) {
        clearTimeout(t);
        return ok({ success: false, error: `Error de conexión: ${e instanceof Error ? e.message : String(e)}` });
      }
      clearTimeout(t);

      const text = await res.text();
      console.log('[manage-plugin] toggle response:', res.status, text.substring(0, 300));

      if (res.status === 401 || res.status === 403) {
        return ok({ success: false, error: 'Token inválido. Reconecta el plugin Lumina Agent.' });
      }
      if (!res.ok) {
        return ok({ success: false, error: `Error HTTP ${res.status}: ${text.substring(0, 200)}` });
      }

      let result: { success?: boolean; auto_update?: boolean };
      try { result = JSON.parse(text); } catch { return ok({ success: false, error: 'Respuesta no es JSON válido.' }); }

      if (!result.success) {
        return ok({ success: false, error: 'El plugin reportó un error al cambiar auto-update.' });
      }

      await sb.from('project_plugins')
        .update({ auto_update: result.auto_update ?? newState })
        .eq('project_id', project_id)
        .eq('slug', plugin_slug);

      return ok({
        success: true,
        message: `Auto-update ${result.auto_update ? 'habilitado' : 'deshabilitado'} para ${plugin_slug}`,
        auto_update: result.auto_update ?? newState,
      });

    } else if (action === 'delete_plugin') {
      const file = plugin_file || `${plugin_slug}/${plugin_slug}.php`;

      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);

      let res: Response;
      try {
        res = await fetch(`${base}/wp-json/lumina/v1/delete-plugin`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ plugin_file: file }),
          signal: ctrl.signal,
        });
      } catch (e) {
        clearTimeout(t);
        return ok({ success: false, error: `Error de conexión: ${e instanceof Error ? e.message : String(e)}` });
      }
      clearTimeout(t);

      const text = await res.text();
      console.log('[manage-plugin] delete response:', res.status, text.substring(0, 300));

      if (res.status === 401 || res.status === 403) {
        return ok({ success: false, error: 'Token inválido. Reconecta el plugin Lumina Agent.' });
      }
      if (!res.ok) {
        return ok({ success: false, error: `Error al eliminar: HTTP ${res.status}: ${text.substring(0, 200)}` });
      }

      let result: { success?: boolean; error?: string };
      try { result = JSON.parse(text); } catch { return ok({ success: false, error: 'Respuesta no es JSON válido.' }); }

      if (!result.success) {
        return ok({ success: false, error: result.error || 'Error al eliminar el plugin.' });
      }

      await sb.from('project_plugins')
        .delete()
        .eq('project_id', project_id)
        .eq('slug', plugin_slug);

      return ok({ success: true, message: `Plugin "${plugin_slug}" eliminado correctamente` });

    } else if (action === 'install_plugin') {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 90000);

      let res: Response;
      try {
        res = await fetch(`${base}/wp-json/lumina/v1/install-plugin`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ slug: plugin_slug }),
          signal: ctrl.signal,
        });
      } catch (e) {
        clearTimeout(t);
        if (e instanceof DOMException && e.name === 'AbortError') {
          return ok({ success: false, error: 'Timeout: la instalación tardó demasiado.' });
        }
        return ok({ success: false, error: `Error de conexión: ${e instanceof Error ? e.message : String(e)}` });
      }
      clearTimeout(t);

      const text = await res.text();
      console.log('[manage-plugin] install response:', res.status, text.substring(0, 500));

      if (res.status === 401 || res.status === 403) {
        return ok({ success: false, error: 'Token inválido. Reconecta el plugin Lumina Agent.' });
      }
      if (!res.ok) {
        return ok({ success: false, error: `Error HTTP ${res.status}: ${text.substring(0, 200)}` });
      }

      let result: { success?: boolean; slug?: string; name?: string; version?: string; plugin_file?: string; error?: string };
      try { result = JSON.parse(text); } catch { return ok({ success: false, error: 'Respuesta no es JSON válido.' }); }

      if (!result.success) {
        return ok({ success: false, error: result.error || 'Error al instalar el plugin.' });
      }

      await sb.from('project_plugins').upsert({
        project_id,
        name: result.name || plugin_slug,
        slug: plugin_slug,
        current_version: result.version || '',
        latest_version: result.version || '',
        is_active: true,
        plugin_type: 'plugin',
        plugin_file: result.plugin_file || '',
        last_checked_at: new Date().toISOString(),
      }, { onConflict: 'project_id,slug', ignoreDuplicates: false });

      return ok({
        success: true,
        message: `Plugin "${result.name || plugin_slug}" v${result.version || '?'} instalado y activado`,
        name: result.name,
        version: result.version,
        plugin_file: result.plugin_file,
      });
    }

    return ok({ success: false, error: `Acción "${action}" no soportada` });

  } catch (e) {
    console.error('[manage-plugin] FATAL:', e);
    return ok({ success: false, error: `Error interno: ${e instanceof Error ? e.message : String(e)}` });
  }
});
