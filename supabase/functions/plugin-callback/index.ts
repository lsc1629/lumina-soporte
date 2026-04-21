// supabase/functions/plugin-callback/index.ts
// Edge Function — recibe el webhook del plugin Lumina Agent cuando se auto-configura.
// Guarda wp_app_user y wp_app_password_encrypted en la tabla projects.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encrypt } from '../_shared/crypto.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function ok(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json() as Record<string, unknown>;
    const project_token = body.project_token as string | undefined;
    const site_url = body.site_url as string | undefined;
    const wp_app_user = body.wp_app_user as string | undefined;
    const wp_app_password = body.wp_app_password as string | undefined;
    const wp_version = body.wp_version as string | undefined;
    const php_version = body.php_version as string | undefined;
    const agent_version = body.agent_version as string | undefined;
    const woocommerce = body.woocommerce as boolean | undefined;
    const multisite = body.multisite as boolean | undefined;

    console.log('[plugin-callback] received webhook for project:', project_token, '| site:', site_url);

    // Validate required fields
    if (!project_token) {
      return ok({ success: false, error: 'project_token es requerido.' }, 400);
    }
    if (!wp_app_user || !wp_app_password) {
      return ok({ success: false, error: 'wp_app_user y wp_app_password son requeridos.' }, 400);
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Buscar proyecto por ID (project_token = project.id)
    const { data: project, error: pErr } = await sb
      .from('projects')
      .select('id, name, url, platform, admin_user')
      .eq('id', project_token)
      .single();

    if (pErr || !project) {
      console.log('[plugin-callback] project not found:', project_token, pErr?.message);
      return ok({ success: false, error: 'Proyecto no encontrado. Verifica el token.' }, 404);
    }

    console.log('[plugin-callback] project found:', project.name, '| platform:', project.platform);

    // Encriptar la contraseña
    const encryptedPassword = await encrypt(wp_app_password);

    // Actualizar proyecto con las credenciales del agente
    const updateData: Record<string, unknown> = {
      wp_app_user: wp_app_user,
      wp_app_password_encrypted: encryptedPassword,
    };

    const { error: updateErr } = await sb
      .from('projects')
      .update(updateData)
      .eq('id', project.id);

    if (updateErr) {
      console.log('[plugin-callback] update error:', updateErr.message);
      return ok({ success: false, error: 'Error al guardar credenciales: ' + updateErr.message }, 500);
    }

    console.log('[plugin-callback] credentials saved for', project.name, '| user:', wp_app_user, '| agent:', agent_version);

    // Log extra info
    const meta: Record<string, unknown> = {};
    if (site_url) meta.site_url = site_url;
    if (wp_version) meta.wp_version = wp_version;
    if (php_version) meta.php_version = php_version;
    if (agent_version) meta.agent_version = agent_version;
    if (woocommerce !== undefined) meta.woocommerce = woocommerce;
    if (multisite !== undefined) meta.multisite = multisite;
    console.log('[plugin-callback] site meta:', JSON.stringify(meta));

    return ok({
      success: true,
      message: `Credenciales guardadas para ${project.name}. Lumina Agent conectado.`,
      project_name: project.name,
    });

  } catch (e) {
    console.error('[plugin-callback] FATAL:', e);
    return ok({ success: false, error: `Error interno: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
});
