// supabase/functions/plugin-callback/index.ts
// DEPRECATED — Stub v2. El flujo v3 usa register-site con site_token.
// Se mantiene para no romper agentes legacy (v2) que aún llamen a este endpoint.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  console.log('[plugin-callback] DEPRECATED endpoint called — redirecting to register-site flow');
  return new Response(
    JSON.stringify({ success: true, deprecated: true, message: 'Este endpoint es legacy. Actualiza el plugin Lumina Agent a v3.' }),
    { status: 200, headers: cors },
  );
});
