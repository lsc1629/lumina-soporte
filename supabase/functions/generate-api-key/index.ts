// supabase/functions/generate-api-key/index.ts
// Genera una API Key única para el usuario autenticado.
// La key se devuelve UNA SOLA VEZ en texto plano; en DB solo se guarda el hash SHA-256.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

/** Genera una API Key con prefijo "lmn_" + 48 chars hex aleatorios = 52 chars total */
function generateRawKey(): string {
  const bytes = new Uint8Array(24); // 24 bytes = 48 hex chars
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `lmn_${hex}`;
}

/** SHA-256 hash de la key */
async function hashKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // Autenticar usuario
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return respond({ error: 'No autorizado' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Usar service role para verificar el JWT del usuario
    const sb = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return respond({ error: 'No autorizado' }, 401);

    // Parsear body opcional (label, target_user_id)
    let label = 'Default';
    let targetUserId = user.id;
    let isAdmin = false;
    try {
      const body = await req.json() as Record<string, unknown>;
      if (body.label) label = String(body.label).slice(0, 100);
      if (body.target_user_id && typeof body.target_user_id === 'string') {
        // Verificar que el caller es admin
        const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();
        if (profile?.role === 'admin') {
          isAdmin = true;
          targetUserId = body.target_user_id as string;
        }
      }
    } catch { /* no body */ }

    if (isAdmin) {
      // Admin generando para cliente: eliminar TODAS las keys anteriores del cliente
      await sb.from('api_keys').delete().eq('user_id', targetUserId);
    } else {
      // Usuario normal: límite de 3 keys propias
      const { count } = await sb
        .from('api_keys')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', targetUserId);

      if ((count || 0) >= 3) {
        return respond({ error: 'Máximo 3 API Keys activas por cuenta. Revoca una antes de crear otra.' }, 400);
      }
    }

    // Generar la key
    const rawKey = generateRawKey();
    const keyHash = await hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 8); // "lmn_xxxx"

    // Guardar en DB
    const { error: insertErr } = await sb.from('api_keys').insert({
      user_id: targetUserId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      label,
      is_active: true,
    });

    if (insertErr) {
      console.error('[generate-api-key] insert error:', insertErr.message);
      return respond({ error: 'Error al crear API Key' }, 500);
    }

    console.log('[generate-api-key] key created for user:', targetUserId, '| prefix:', keyPrefix);

    // Devolver la key en texto plano (única vez)
    return respond({
      success: true,
      api_key: rawKey,
      prefix: keyPrefix,
      label,
      message: 'Guarda esta API Key en un lugar seguro. No podrás verla de nuevo.',
    });

  } catch (e) {
    console.error('[generate-api-key] FATAL:', e);
    return respond({ error: `Error interno: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
});
