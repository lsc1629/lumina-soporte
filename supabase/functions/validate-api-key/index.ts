// supabase/functions/validate-api-key/index.ts
// Valida una API Key enviada desde el plugin WordPress.
// Recibe la key en texto plano, la hashea, y busca en api_keys.
// Devuelve si es válida + info del usuario propietario.
// NO requiere auth header (el plugin no tiene sesión Supabase).

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
    const apiKey = body.api_key as string | undefined;

    if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('lmn_')) {
      return respond({ valid: false, error: 'API Key inválida o no proporcionada.' }, 400);
    }

    const keyHash = await hashKey(apiKey);

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Buscar la key por hash
    const { data: keyRow, error: keyErr } = await sb
      .from('api_keys')
      .select('id, user_id, key_prefix, label, is_active, created_at')
      .eq('key_hash', keyHash)
      .single();

    if (keyErr || !keyRow) {
      return respond({ valid: false, error: 'API Key no encontrada.' }, 404);
    }

    if (!keyRow.is_active) {
      return respond({ valid: false, error: 'API Key revocada.' }, 403);
    }

    // Actualizar last_used_at
    await sb.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id);

    // Obtener info del usuario
    const { data: profile } = await sb
      .from('profiles')
      .select('full_name, email, company_name')
      .eq('id', keyRow.user_id)
      .single();

    console.log('[validate-api-key] valid key:', keyRow.key_prefix, '| user:', keyRow.user_id);

    return respond({
      valid: true,
      user_id: keyRow.user_id,
      key_prefix: keyRow.key_prefix,
      label: keyRow.label,
      owner: profile ? {
        name: profile.full_name,
        email: profile.email,
        company: profile.company_name,
      } : null,
    });

  } catch (e) {
    console.error('[validate-api-key] FATAL:', e);
    return respond({ valid: false, error: `Error interno: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
});
