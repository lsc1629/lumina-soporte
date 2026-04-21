// supabase/functions/save-project/index.ts
// Edge Function que guarda/actualiza un proyecto encriptando las credenciales antes de escribir en BD.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encrypt } from '../_shared/crypto.ts';

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
    const { project_id, data } = body as {
      project_id?: string; // If provided, UPDATE; otherwise INSERT
      data: Record<string, unknown>;
    };

    if (!data) return ok({ success: false, error: 'data es requerido' });

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Get calling user from auth header
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    let userId: string | null = null;
    if (token) {
      const { data: { user } } = await sb.auth.getUser(token);
      userId = user?.id || null;
    }

    // Encrypt sensitive credential fields if present
    const sensitiveFields = ['admin_password_encrypted', 'admin_password', 'wp_app_password_encrypted', 'wp_app_password'];
    const cleanData = { ...data };

    for (const field of sensitiveFields) {
      if (cleanData[field] && typeof cleanData[field] === 'string' && (cleanData[field] as string).length > 0) {
        const plaintext = cleanData[field] as string;
        // Don't re-encrypt if already encrypted
        if (!plaintext.startsWith('enc:')) {
          cleanData[field] = await encrypt(plaintext);
        }
      }
    }

    // Normalize: frontend sends admin_password, DB column is admin_password_encrypted
    if (cleanData['admin_password'] !== undefined) {
      cleanData['admin_password_encrypted'] = cleanData['admin_password'];
      delete cleanData['admin_password'];
    }

    // Normalize: frontend sends wp_app_password, DB column is wp_app_password_encrypted
    if (cleanData['wp_app_password'] !== undefined) {
      cleanData['wp_app_password_encrypted'] = cleanData['wp_app_password'];
      delete cleanData['wp_app_password'];
    }

    if (project_id) {
      // UPDATE existing project
      const { error } = await sb.from('projects').update(cleanData).eq('id', project_id);
      if (error) return ok({ success: false, error: error.message });
      return ok({ success: true, project_id, action: 'updated' });
    } else {
      // INSERT new project
      if (!cleanData['owner_id'] && userId) {
        cleanData['owner_id'] = userId;
      }
      const { data: inserted, error } = await sb.from('projects').insert(cleanData).select('id').single();
      if (error) return ok({ success: false, error: error.message });
      return ok({ success: true, project_id: inserted.id, action: 'created' });
    }

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[save-project] error:', msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: cors,
    });
  }
});
