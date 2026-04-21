// supabase/functions/mercadopago-webhook/index.ts
// Webhook que recibe notificaciones de Mercado Pago sobre suscripciones.
// Tipos de notificación: subscription_preapproval (suscripción) y payment (pago individual).
// Actualiza el estado de la suscripción y registra pagos en la tabla payments.

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

  // Mercado Pago envía GET para verificar el endpoint
  if (req.method === 'GET') return respond({ status: 'ok' });

  try {
    const body = await req.json() as Record<string, unknown>;
    const type = body.type as string | undefined;
    const dataObj = body.data as Record<string, unknown> | undefined;
    const resourceId = dataObj?.id as string | undefined;

    console.log('[mp-webhook] received:', type, '| resource:', resourceId);

    if (!type || !resourceId) {
      return respond({ received: true, skipped: 'missing type or id' });
    }

    const mpAccessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
    if (!mpAccessToken) {
      console.error('[mp-webhook] MERCADOPAGO_ACCESS_TOKEN not set');
      return respond({ error: 'MP not configured' }, 500);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, serviceRoleKey);

    // Manejar notificación de suscripción (preapproval)
    if (type === 'subscription_preapproval') {
      const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${resourceId}`, {
        headers: { 'Authorization': `Bearer ${mpAccessToken}` },
      });
      const sub = await mpRes.json() as Record<string, unknown>;

      if (!mpRes.ok) {
        console.error('[mp-webhook] fetch preapproval error:', JSON.stringify(sub));
        return respond({ received: true, error: 'fetch failed' });
      }

      const mpStatus = sub.status as string; // authorized, paused, cancelled, pending
      const externalRef = sub.external_reference as string | undefined;

      // Mapear estado MP → estado interno
      const statusMap: Record<string, string> = {
        authorized: 'active',
        paused: 'suspended',
        cancelled: 'cancelled',
        pending: 'trial',
      };
      const internalStatus = statusMap[mpStatus] || 'active';

      console.log('[mp-webhook] preapproval:', resourceId, '| MP status:', mpStatus, '→', internalStatus);

      // Buscar suscripción por payment_provider_subscription_id
      let subscriptionId: string | null = null;
      let userId: string | null = null;

      const { data: existingSub } = await sb
        .from('subscriptions')
        .select('id, client_id')
        .eq('payment_provider_subscription_id', resourceId)
        .single();

      if (existingSub) {
        subscriptionId = existingSub.id;
        userId = existingSub.client_id;
      } else if (externalRef) {
        // Fallback: buscar por external_reference
        try {
          const ref = JSON.parse(externalRef) as Record<string, string>;
          subscriptionId = ref.subscription_id;
          userId = ref.user_id;
        } catch { /* ignore */ }
      }

      if (subscriptionId) {
        // Actualizar suscripción
        const updateData: Record<string, unknown> = {
          status: internalStatus,
          updated_at: new Date().toISOString(),
        };
        if (mpStatus === 'cancelled') {
          updateData.cancelled_at = new Date().toISOString();
        }

        await sb.from('subscriptions').update(updateData).eq('id', subscriptionId);

        // Actualizar profile
        if (userId) {
          await sb.from('profiles').update({ subscription_status: internalStatus }).eq('id', userId);
        }

        console.log('[mp-webhook] subscription updated:', subscriptionId, '→', internalStatus);
      }

      return respond({ received: true, processed: 'subscription_preapproval' });
    }

    // Manejar notificación de pago
    if (type === 'payment') {
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${resourceId}`, {
        headers: { 'Authorization': `Bearer ${mpAccessToken}` },
      });
      const payment = await mpRes.json() as Record<string, unknown>;

      if (!mpRes.ok) {
        console.error('[mp-webhook] fetch payment error:', JSON.stringify(payment));
        return respond({ received: true, error: 'fetch failed' });
      }

      const mpPaymentStatus = payment.status as string; // approved, rejected, pending, in_process
      const amount = payment.transaction_amount as number;
      const currency = payment.currency_id as string;
      const externalRef = payment.external_reference as string | undefined;

      // Mapear estado de pago
      const paymentStatusMap: Record<string, string> = {
        approved: 'completed',
        rejected: 'failed',
        pending: 'pending',
        in_process: 'pending',
        refunded: 'refunded',
      };
      const internalPaymentStatus = paymentStatusMap[mpPaymentStatus] || 'pending';

      let subscriptionId: string | null = null;
      let userId: string | null = null;

      if (externalRef) {
        try {
          const ref = JSON.parse(externalRef) as Record<string, string>;
          subscriptionId = ref.subscription_id;
          userId = ref.user_id;
        } catch { /* ignore */ }
      }

      if (subscriptionId && userId) {
        // Registrar pago
        await sb.from('payments').insert({
          subscription_id: subscriptionId,
          client_id: userId,
          amount: amount || 0,
          currency: currency || 'CLP',
          status: internalPaymentStatus,
          payment_provider: 'mercadopago',
          payment_provider_id: String(resourceId),
          payment_method: (payment.payment_method_id as string) || null,
          description: `Pago MercadoPago #${resourceId}`,
          paid_at: internalPaymentStatus === 'completed' ? new Date().toISOString() : null,
        });

        // Si el pago fue aprobado, activar suscripción
        if (internalPaymentStatus === 'completed') {
          const periodEnd = new Date();
          periodEnd.setMonth(periodEnd.getMonth() + 1);

          await sb.from('subscriptions').update({
            status: 'active',
            current_period_start: new Date().toISOString(),
            current_period_end: periodEnd.toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', subscriptionId);

          await sb.from('profiles').update({ subscription_status: 'active' }).eq('id', userId);
        }

        // Si el pago fue rechazado, marcar como past_due
        if (internalPaymentStatus === 'failed') {
          await sb.from('subscriptions').update({
            status: 'past_due',
            updated_at: new Date().toISOString(),
          }).eq('id', subscriptionId);

          await sb.from('profiles').update({ subscription_status: 'past_due' }).eq('id', userId);
        }

        console.log('[mp-webhook] payment processed:', resourceId, '| status:', internalPaymentStatus, '| amount:', amount, currency);
      }

      return respond({ received: true, processed: 'payment' });
    }

    // Otros tipos de notificación — solo confirmar recepción
    console.log('[mp-webhook] unhandled type:', type);
    return respond({ received: true, skipped: type });

  } catch (e) {
    console.error('[mp-webhook] FATAL:', e);
    return respond({ error: `Error interno: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
});
