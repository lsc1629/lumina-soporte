// supabase/functions/signup-and-subscribe/index.ts
// Registro de usuario + creación de suscripción + checkout Mercado Pago.
// Flujo: crear usuario en auth → insertar profile → buscar plan → crear suscripción →
//        crear preferencia de pago en Mercado Pago → devolver checkout_url.

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
    const { email, password, full_name, company_name, plan_slug } = await req.json() as {
      email: string;
      password: string;
      full_name: string;
      company_name?: string;
      plan_slug: string;
    };

    // Validaciones básicas
    if (!email || !password || !full_name || !plan_slug) {
      return respond({ error: 'Faltan campos requeridos (email, password, full_name, plan_slug).' }, 400);
    }
    if (password.length < 8) {
      return respond({ error: 'La contraseña debe tener al menos 8 caracteres.' }, 400);
    }
    if (!['web', 'ecommerce'].includes(plan_slug)) {
      return respond({ error: 'Plan inválido.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, serviceRoleKey);

    // 1. Crear usuario en Supabase Auth
    const { data: authData, error: authErr } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Confirmar email automáticamente para MVP
      user_metadata: { full_name, company_name: company_name || '' },
    });

    if (authErr) {
      console.error('[signup] auth error:', authErr.message);
      if (authErr.message?.includes('already been registered') || authErr.message?.includes('already exists')) {
        return respond({ error: 'Este email ya está registrado. Inicia sesión en el panel.' }, 409);
      }
      return respond({ error: `Error al crear cuenta: ${authErr.message}` }, 500);
    }

    const userId = authData.user.id;
    console.log('[signup] user created:', userId, email);

    // 2. Buscar plan en BD
    const { data: plan, error: planErr } = await sb
      .from('plans')
      .select('id, name, slug, price_monthly, price_currency')
      .eq('slug', plan_slug)
      .eq('is_active', true)
      .single();

    if (planErr || !plan) {
      console.error('[signup] plan not found:', plan_slug, planErr?.message);
      return respond({ error: 'Plan no encontrado.' }, 404);
    }

    // 3. Actualizar profile con plan y datos
    const { error: profileErr } = await sb
      .from('profiles')
      .update({
        full_name,
        company_name: company_name || null,
        plan_id: plan.id,
        subscription_status: 'trial',
        role: 'client',
        is_active: true,
      })
      .eq('id', userId);

    if (profileErr) {
      console.error('[signup] profile update error:', profileErr.message);
    }

    // 4. Crear suscripción con trial de 7 días
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7);

    const { data: subscription, error: subErr } = await sb
      .from('subscriptions')
      .insert({
        client_id: userId,
        plan_id: plan.id,
        status: 'trial',
        payment_provider: 'mercadopago',
        current_period_start: new Date().toISOString(),
        current_period_end: trialEnd.toISOString(),
      })
      .select('id')
      .single();

    if (subErr) {
      console.error('[signup] subscription error:', subErr.message);
      return respond({ error: `Error al crear suscripción: ${subErr.message}` }, 500);
    }

    console.log('[signup] subscription created:', subscription.id, '| plan:', plan.slug, '| trial until:', trialEnd.toISOString());

    // 5. Crear preferencia de pago en Mercado Pago
    const mpAccessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');

    if (!mpAccessToken) {
      // Sin Mercado Pago configurado: redirigir al panel directamente (modo trial)
      console.log('[signup] no MP token, skipping checkout — trial mode');
      return respond({
        success: true,
        user_id: userId,
        subscription_id: subscription.id,
        plan: plan.slug,
        trial_ends: trialEnd.toISOString(),
        message: 'Cuenta creada. Tienes 7 días de prueba gratis.',
      });
    }

    // Crear preferencia de suscripción en Mercado Pago
    const baseUrl = Deno.env.get('LANDING_URL') || 'https://land1.luissalascortes.dev';
    const appUrl = Deno.env.get('APP_URL') || 'https://soporte.luissalascortes.dev';

    const preferencePayload = {
      reason: `LuminaSupport — Plan ${plan.name}`,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: Number(plan.price_monthly),
        currency_id: 'CLP',
      },
      back_url: `${appUrl}?welcome=true&plan=${plan.slug}`,
      payer_email: email,
      external_reference: JSON.stringify({
        subscription_id: subscription.id,
        user_id: userId,
        plan_slug: plan.slug,
      }),
    };

    const mpRes = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mpAccessToken}`,
      },
      body: JSON.stringify(preferencePayload),
    });

    const mpData = await mpRes.json() as Record<string, unknown>;

    if (!mpRes.ok || !mpData.init_point) {
      console.error('[signup] MP error:', JSON.stringify(mpData));
      // No fallar el registro — el usuario puede pagar después
      return respond({
        success: true,
        user_id: userId,
        subscription_id: subscription.id,
        plan: plan.slug,
        trial_ends: trialEnd.toISOString(),
        message: 'Cuenta creada con trial. El pago se configurará manualmente.',
      });
    }

    // Guardar el ID de suscripción de MP
    await sb
      .from('subscriptions')
      .update({ payment_provider_subscription_id: mpData.id })
      .eq('id', subscription.id);

    console.log('[signup] MP subscription created:', mpData.id);

    return respond({
      success: true,
      user_id: userId,
      subscription_id: subscription.id,
      plan: plan.slug,
      trial_ends: trialEnd.toISOString(),
      checkout_url: mpData.init_point,
      message: 'Cuenta creada. Redirigiendo al pago.',
    });

  } catch (e) {
    console.error('[signup-and-subscribe] FATAL:', e);
    return respond({ error: `Error interno: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
});
