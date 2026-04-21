// supabase/functions/test-agent-connection/index.ts
// Edge Function — verifica que el Lumina Agent v3 esté instalado y respondiendo.
// Usa site_token con header X-Lumina-Token (nuevo) o Basic Auth legacy como fallback.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decrypt } from '../_shared/crypto.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function ok(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
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
    const body = await req.json() as Record<string, unknown>;
    const projectId = body.project_id as string | undefined;

    if (!projectId) return ok({ success: false, error: 'project_id requerido' }, 400);

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: project, error: pErr } = await sb
      .from('projects')
      .select('id, name, url, admin_url, platform, site_token, wp_app_user, wp_app_password_encrypted, admin_user, admin_password_encrypted')
      .eq('id', projectId)
      .single();

    if (pErr || !project) {
      return ok({ success: false, error: 'Proyecto no encontrado' }, 404);
    }

    let base = (project.admin_url || project.url || '').replace(/\/wp-admin\/?$/, '').replace(/\/+$/, '');
    if (!base.startsWith('http')) base = `https://${base}`;

    // Build auth headers — prefer site_token (v3), fallback to Basic Auth (v2 legacy)
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    let authMethod = 'none';

    if (project.site_token) {
      headers['X-Lumina-Token'] = project.site_token;
      authMethod = 'site_token';
    } else {
      // Legacy fallback: wp_app_user or admin_user with Basic Auth
      let authUser = project.wp_app_user || '';
      let authPass = project.wp_app_password_encrypted || '';
      if (authPass) {
        try { authPass = await decrypt(authPass); } catch { /* use raw */ }
      }
      if (!authUser && project.admin_user && !project.admin_user.startsWith('ck_')) {
        authUser = project.admin_user;
        authPass = project.admin_password_encrypted || '';
        if (authPass) {
          try { authPass = await decrypt(authPass); } catch { /* use raw */ }
        }
      }
      if (authUser && authPass) {
        headers['Authorization'] = `Basic ${encodeBasic(authUser, authPass)}`;
        authMethod = 'basic_auth';
      }
    }

    if (authMethod === 'none') {
      return ok({
        success: false,
        connected: false,
        error: 'No hay credenciales configuradas. Instala el plugin Lumina Agent en WordPress y pega tu API Key.',
      });
    }

    // Test /lumina/v1/status
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);

    let statusData: Record<string, unknown> | null = null;
    let agentFound = false;
    let statusCode = 0;
    let errorMsg = '';

    try {
      const res = await fetch(`${base}/wp-json/lumina/v1/status`, {
        headers,
        signal: ctrl.signal,
      });
      clearTimeout(t);
      statusCode = res.status;

      if (res.ok) {
        statusData = await res.json() as Record<string, unknown>;
        agentFound = true;
      } else if (res.status === 404) {
        errorMsg = 'El endpoint /lumina/v1/status no existe. Verifica que el plugin Lumina Agent esté instalado y activado.';
      } else if (res.status === 401 || res.status === 403) {
        errorMsg = authMethod === 'site_token'
          ? 'Token inválido. El site_token no coincide con el del plugin. Reconecta el sitio desde WP Admin → Ajustes → Lumina Agent.'
          : 'Credenciales inválidas o permisos insuficientes.';
      } else {
        const text = await res.text();
        errorMsg = `HTTP ${res.status}: ${text.substring(0, 200)}`;
      }
    } catch (e) {
      clearTimeout(t);
      if (e instanceof DOMException && e.name === 'AbortError') {
        errorMsg = 'Timeout: el sitio no respondió en 15 segundos.';
      } else {
        errorMsg = `Error de conexión: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    if (agentFound && statusData) {
      return ok({
        success: true,
        connected: true,
        auth_method: authMethod,
        agent_version: statusData.agent_version || 'unknown',
        wp_version: statusData.wp_version || null,
        php_version: statusData.php_version || null,
        site_url: statusData.site_url || base,
        woocommerce: statusData.woocommerce || false,
        multisite: statusData.multisite || false,
        plugins_total: statusData.plugins_total || 0,
        plugins_updates: statusData.plugins_updates || 0,
        themes_updates: statusData.themes_updates || 0,
      });
    }

    return ok({
      success: false,
      connected: false,
      status_code: statusCode,
      error: errorMsg,
    });

  } catch (e) {
    console.error('[test-agent-connection] FATAL:', e);
    return ok({ success: false, error: `Error interno: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
});
