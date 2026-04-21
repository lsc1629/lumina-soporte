// supabase/functions/migrate-encrypt/index.ts
// ONE-TIME Edge Function to encrypt existing plaintext credentials in projects table.
// Run once after setting ENCRYPTION_KEY secret. Safe to run multiple times (skips already encrypted).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { encrypt } from '../_shared/crypto.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: projects, error } = await sb
      .from('projects')
      .select('id, name, admin_password_encrypted')
      .not('admin_password_encrypted', 'is', null)
      .neq('admin_password_encrypted', '');

    if (error) throw error;

    let encrypted = 0;
    let skipped = 0;

    for (const p of (projects || [])) {
      if (!p.admin_password_encrypted || p.admin_password_encrypted.startsWith('enc:')) {
        skipped++;
        continue;
      }

      const enc = await encrypt(p.admin_password_encrypted);
      const { error: upErr } = await sb
        .from('projects')
        .update({ admin_password_encrypted: enc })
        .eq('id', p.id);

      if (upErr) {
        console.error(`[migrate-encrypt] Failed for ${p.name}:`, upErr.message);
      } else {
        encrypted++;
        console.log(`[migrate-encrypt] Encrypted credentials for: ${p.name}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total: (projects || []).length,
      encrypted,
      skipped,
    }), { headers: cors });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[migrate-encrypt] error:', msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: cors,
    });
  }
});
