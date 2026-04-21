// supabase/functions/register-site/index.ts
// El plugin WordPress llama este endpoint al guardar la API Key.
// Valida la key, y crea/vincula automáticamente el proyecto en Lumina.
// Devuelve el site_token que el plugin guardará para autenticar requests de Lumina → WP.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

async function hashKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json() as Record<string, unknown>;
    const apiKey      = body.api_key as string | undefined;
    const siteUrl     = body.site_url as string | undefined;
    const siteName    = body.site_name as string | undefined;
    const wpVersion   = body.wp_version as string | undefined;
    const phpVersion  = body.php_version as string | undefined;
    const agentVer    = body.agent_version as string | undefined;
    const woocommerce = body.woocommerce as boolean | undefined;
    const multisite   = body.multisite as boolean | undefined;
    const pluginsCount = body.plugins_count as number | undefined;
    const themesCount  = body.themes_count as number | undefined;
    const adminEmail   = body.admin_email as string | undefined;

    // Validaciones
    if (!apiKey || !apiKey.startsWith('lmn_')) {
      return respond({ success: false, error: 'API Key inválida.' }, 400);
    }
    if (!siteUrl) {
      return respond({ success: false, error: 'site_url es requerido.' }, 400);
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Validar API Key
    const keyHash = await hashKey(apiKey);
    const { data: keyRow, error: keyErr } = await sb
      .from('api_keys')
      .select('id, user_id, is_active, key_prefix')
      .eq('key_hash', keyHash)
      .single();

    if (keyErr || !keyRow) {
      return respond({ success: false, error: 'API Key no encontrada. Verifica que sea correcta.' }, 404);
    }
    if (!keyRow.is_active) {
      return respond({ success: false, error: 'API Key revocada. Genera una nueva desde tu panel de Lumina.' }, 403);
    }

    // Actualizar last_used_at
    await sb.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id);

    const userId = keyRow.user_id;

    // 2. Normalizar URL del sitio
    let normalizedUrl = siteUrl.replace(/\/+$/, '').toLowerCase();
    if (!normalizedUrl.startsWith('http')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }

    // 3. Buscar si ya existe un proyecto con esa URL para este usuario
    const { data: existing } = await sb
      .from('projects')
      .select('id, name, site_token, owner_id')
      .ilike('url', normalizedUrl)
      .limit(1)
      .maybeSingle();

    let projectId: string;
    let siteToken: string;
    let isNew = false;

    if (existing) {
      // Proyecto ya existe — actualizarlo con info del agent
      projectId = existing.id;
      siteToken = existing.site_token;

      // Si no tiene site_token, generar uno
      if (!siteToken) {
        siteToken = crypto.randomUUID();
      }

      const updateData: Record<string, unknown> = {
        site_token: siteToken,
        agent_version: agentVer || null,
        agent_connected_at: new Date().toISOString(),
        is_active: true,
      };

      await sb.from('projects').update(updateData).eq('id', projectId);

      console.log('[register-site] existing project updated:', projectId, '| url:', normalizedUrl);
    } else {
      // Crear nuevo proyecto automáticamente
      siteToken = crypto.randomUUID();
      isNew = true;

      // Determinar plataforma
      let platform = 'wordpress';
      if (woocommerce) platform = 'woocommerce';

      // Generar nombre del proyecto a partir de la URL
      const projectName = siteName || new URL(normalizedUrl).hostname.replace('www.', '');

      const newProject: Record<string, unknown> = {
        name: projectName,
        url: normalizedUrl,
        platform,
        owner_id: userId,
        is_active: true,
        status: 'up',
        site_token: siteToken,
        agent_version: agentVer || null,
        agent_connected_at: new Date().toISOString(),
        monitoring_interval_minutes: 5,
        log_retention_days: 90,
      };

      const { data: created, error: createErr } = await sb
        .from('projects')
        .insert(newProject)
        .select('id')
        .single();

      if (createErr) {
        console.error('[register-site] create error:', createErr.message);
        return respond({ success: false, error: 'Error al crear proyecto: ' + createErr.message }, 500);
      }

      projectId = created.id;
      console.log('[register-site] new project created:', projectId, '| name:', projectName, '| url:', normalizedUrl);
    }

    // 4. Log de info adicional
    const meta: Record<string, unknown> = { projectId, isNew };
    if (wpVersion) meta.wp_version = wpVersion;
    if (phpVersion) meta.php_version = phpVersion;
    if (agentVer) meta.agent_version = agentVer;
    if (woocommerce !== undefined) meta.woocommerce = woocommerce;
    if (multisite !== undefined) meta.multisite = multisite;
    if (pluginsCount !== undefined) meta.plugins_count = pluginsCount;
    if (themesCount !== undefined) meta.themes_count = themesCount;
    console.log('[register-site] meta:', JSON.stringify(meta));

    return respond({
      success: true,
      project_id: projectId,
      site_token: siteToken,
      is_new: isNew,
      message: isNew
        ? 'Sitio registrado exitosamente en Lumina.'
        : 'Sitio reconectado a Lumina.',
    });

  } catch (e) {
    console.error('[register-site] FATAL:', e);
    return respond({ success: false, error: `Error interno: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
});
