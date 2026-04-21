// supabase/functions/send-report/index.ts
// Edge Function proxy para enviar informes mensuales via Resend.
// Evita problemas de CORS al llamar a la API de Resend desde el frontend.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RESEND_KEY = 're_LdUWjauZ_6HWDLXNkYjv69YrRbiBNh72i';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { to, subject, html, pdfBase64, pdfFilename } = await req.json();

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: 'Faltan campos requeridos: to, subject, html' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const recipients = Array.isArray(to) ? to : [to];

    const emailPayload: Record<string, unknown> = {
      from: 'onboarding@resend.dev',
      to: recipients,
      subject,
      html,
    };

    if (pdfBase64 && pdfFilename) {
      emailPayload.attachments = [
        {
          filename: pdfFilename,
          content: pdfBase64,
        },
      ];
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify(emailPayload),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('[send-report] Resend error:', res.status, body);
      return new Response(
        JSON.stringify({ error: 'Error al enviar email', details: body }),
        { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, id: body.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[send-report] Exception:', err);
    return new Response(
      JSON.stringify({ error: 'Error interno', message: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
