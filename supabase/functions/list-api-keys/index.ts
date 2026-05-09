// supabase/functions/list-api-keys/index.ts
// Lista API Keys del usuario autenticado. Admin ve también las de sus clientes.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return respond({ error: 'No autorizado' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return respond({ error: 'No autorizado' }, 401);

    // Verificar si es admin
    const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single();
    const isAdmin = profile?.role === 'admin';

    let query = sb
      .from('api_keys')
      .select('id, user_id, key_prefix, label, is_active, created_at, last_used_at')
      .order('created_at', { ascending: false });

    if (isAdmin) {
      const { data: clientProfiles } = await sb.from('profiles').select('id').eq('role', 'client');
      const clientIds = (clientProfiles || []).map(c => c.id);
      query = query.in('user_id', [user.id, ...clientIds]);
    } else {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;
    if (error) return respond({ error: error.message }, 500);

    return respond({ success: true, keys: data || [] });
  } catch (e) {
    return respond({ error: String(e) }, 500);
  }
});
