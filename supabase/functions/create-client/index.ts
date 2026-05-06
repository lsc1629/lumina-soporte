// supabase/functions/create-client/index.ts
// Crea un usuario cliente sin afectar la sesión del admin.
// Usa service_role para crear el usuario en Supabase Auth.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { full_name, email, phone, company_name } = await req.json() as {
      full_name: string; email: string; phone?: string; company_name?: string;
    };

    if (!email || !full_name) {
      return new Response(JSON.stringify({ error: 'email y full_name son obligatorios' }), { status: 400, headers: cors });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    // Verificar si ya existe el perfil
    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, phone, company_name, role')
      .eq('email', email.trim())
      .maybeSingle();

    if (existing) {
      await supabaseAdmin.from('profiles').update({
        full_name: full_name.trim(),
        phone: phone || existing.phone,
        company_name: company_name || existing.company_name,
      }).eq('id', existing.id);

      return new Response(JSON.stringify({
        id: existing.id,
        full_name: full_name.trim(),
        email: existing.email,
        phone: phone || existing.phone,
        company_name: company_name || existing.company_name,
        role: existing.role,
      }), { status: 200, headers: cors });
    }

    // Crear nuevo usuario con service_role (no afecta sesión actual)
    const tempPassword = crypto.randomUUID().slice(0, 16) + 'Aa1!';
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password: tempPassword,
      user_metadata: { full_name: full_name.trim(), role: 'client' },
      email_confirm: true,
    });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), { status: 400, headers: cors });
    }

    // Esperar que el trigger cree el perfil
    await new Promise(r => setTimeout(r, 800));

    await supabaseAdmin.from('profiles').update({
      full_name: full_name.trim(),
      phone: phone || '',
      company_name: company_name || '',
      role: 'client',
    }).eq('id', authData.user.id);

    return new Response(JSON.stringify({
      id: authData.user.id,
      full_name: full_name.trim(),
      email: email.trim(),
      phone: phone || '',
      company_name: company_name || '',
      role: 'client',
    }), { status: 200, headers: cors });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
