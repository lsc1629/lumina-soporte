// Supabase Edge Function: test-connection
// Validates connectivity to backend and frontend services server-side (no CORS)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestRequest {
  url: string;
  platform: string;
  admin_url?: string;
  admin_user?: string;
  admin_password?: string;
  frontend_url?: string;
  frontend_healthcheck?: string;
}

interface TestDetail {
  text: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'separator';
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json() as TestRequest;
    const { url, platform, admin_url, admin_user, admin_password, frontend_url, frontend_healthcheck } = body;

    if (!url) {
      return new Response(JSON.stringify({ ok: false, message: 'URL del sitio es requerida', details: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const baseUrl = url.replace(/\/$/, '');
    const normalizedUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
    const details: TestDetail[] = [];
    let ok = false;

    // ── 1. Basic site reachability ──
    details.push({ text: 'Verificando disponibilidad del sitio...', type: 'info' });
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const siteRes = await fetch(normalizedUrl, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      details.push({ text: `Sitio alcanzable — HTTP ${siteRes.status} ${siteRes.statusText}`, type: 'success' });
      ok = true;
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Error desconocido';
      details.push({ text: `No se pudo conectar al sitio: ${errMsg}`, type: 'error' });
      return new Response(JSON.stringify({ ok: false, message: 'Sitio no alcanzable', details }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Platform-specific checks ──
    try {
      if (platform === 'wordpress' || platform === 'woocommerce' || platform === 'wordpress-headless' || platform === 'woo-headless') {

        // WordPress REST API
        details.push({ text: 'Verificando WordPress REST API...', type: 'info' });

        // deno-lint-ignore no-explicit-any
        let wpData: any = null;
        let wpApiBase = '';

        // Build list of REST API URLs to try, in priority order
        const isHeadless = platform === 'wordpress-headless' || platform === 'woo-headless';
        const apiCandidates: string[] = [];

        if (isHeadless && admin_url?.trim()) {
          const apiUrl = admin_url.replace(/\/$/, '');
          const base = apiUrl.startsWith('http') ? apiUrl : `https://${apiUrl}`;
          // If user provided the exact /wp-json URL, use it; otherwise try appending /wp-json
          if (base.endsWith('/wp-json') || base.includes('/wp-json/') || base.includes('rest_route')) {
            apiCandidates.push(base);
          } else {
            // User gave just the domain (e.g. https://app.castell.cl) — try with /wp-json first
            apiCandidates.push(`${base}/wp-json`);
            apiCandidates.push(base);
            apiCandidates.push(`${base}/?rest_route=/`);
          }
        }

        // Always add standard paths from the site URL as final fallback
        apiCandidates.push(`${normalizedUrl}/wp-json`);
        apiCandidates.push(`${normalizedUrl}/wp-json/`);
        apiCandidates.push(`${normalizedUrl}/?rest_route=/`);

        // Deduplicate
        const uniqueCandidates = [...new Set(apiCandidates)];

        for (const wpPath of uniqueCandidates) {
          if (wpData) break;
          details.push({ text: `Probando REST API en: ${wpPath}`, type: 'info' });
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 10000);
            const res = await fetch(wpPath, { signal: ctrl.signal });
            clearTimeout(t);
            const contentType = res.headers.get('content-type') || '';
            if (res.ok && contentType.includes('application/json')) {
              wpData = await res.json();
              wpApiBase = wpPath;
              details.push({ text: `✓ REST API encontrada en: ${wpPath}`, type: 'success' });
            }
          } catch { /* try next */ }
        }

        if (wpData) {
          details.push({ text: `WordPress detectado: "${wpData.name || 'Sin nombre'}" — ${wpData.description || ''}`, type: 'success' });
          details.push({ text: `REST API activa — ${wpData.namespaces?.length || 0} namespaces: ${(wpData.namespaces || []).slice(0, 8).join(', ')}`, type: 'success' });

          // WooCommerce check
          if (platform === 'woocommerce' || platform === 'woo-headless') {
            const hasWc = wpData.namespaces?.some((ns: string) => ns.startsWith('wc/'));
            if (hasWc) {
              details.push({ text: 'WooCommerce REST API detectada', type: 'success' });

              // Try WC store info
              try {
                const apiBase = wpApiBase.replace(/\/$/, '');
                let wcUrl = `${apiBase}/wc/v3/system_status`;
                if (admin_user && admin_password) {
                  wcUrl += `?consumer_key=${encodeURIComponent(admin_user)}&consumer_secret=${encodeURIComponent(admin_password)}`;
                }
                const wcCtrl = new AbortController();
                const wcTimeout = setTimeout(() => wcCtrl.abort(), 8000);
                const wcRes = await fetch(wcUrl, { signal: wcCtrl.signal });
                clearTimeout(wcTimeout);

                if (wcRes.ok) {
                  const wcData = await wcRes.json() as Record<string, any>;
                  const env = wcData.environment;
                  if (env) {
                    details.push({ text: `WooCommerce ${env.version || '?'} — PHP ${env.php_version || '?'} — WP ${env.wp_version || '?'}`, type: 'success' });
                  }
                  details.push({ text: 'Credenciales de WooCommerce validadas correctamente', type: 'success' });
                } else if (wcRes.status === 401) {
                  details.push({ text: 'Credenciales de WooCommerce inválidas (401 Unauthorized)', type: 'error' });
                } else {
                  details.push({ text: `WooCommerce system_status respondió con HTTP ${wcRes.status}`, type: 'warning' });
                }
              } catch {
                details.push({ text: 'No se pudo verificar credenciales de WooCommerce', type: 'warning' });
              }
            } else {
              details.push({ text: 'WooCommerce REST API no detectada. Verifica que el plugin esté activo.', type: 'warning' });
            }
          }

          // WordPress auth check (Application Passwords)
          if ((platform === 'wordpress' || platform === 'wordpress-headless') && admin_user && admin_password) {
            details.push({ text: 'Verificando credenciales de WordPress...', type: 'info' });
            try {
              const authCtrl = new AbortController();
              const authTimeout = setTimeout(() => authCtrl.abort(), 8000);
              const apiBase = wpApiBase.replace(/\/$/, '');
              const authRes = await fetch(`${apiBase}/wp/v2/users/me`, {
                headers: {
                  'Authorization': 'Basic ' + btoa(`${admin_user}:${admin_password}`),
                },
                signal: authCtrl.signal,
              });
              clearTimeout(authTimeout);

              if (authRes.ok) {
                const userData = await authRes.json() as Record<string, any>;
                details.push({ text: `Autenticado como: ${userData.name || userData.slug} (${userData.roles?.join(', ') || 'sin roles'})`, type: 'success' });
              } else if (authRes.status === 401) {
                details.push({ text: 'Credenciales de WordPress inválidas (401 Unauthorized)', type: 'error' });
              } else {
                details.push({ text: `Verificación de auth respondió con HTTP ${authRes.status}`, type: 'warning' });
              }
            } catch {
              details.push({ text: 'No se pudo verificar las credenciales de WordPress', type: 'warning' });
            }
          }

        } else {
          details.push({ text: 'WordPress REST API no disponible', type: 'warning' });
          details.push({ text: '', type: 'separator' });
          details.push({ text: '── Pasos para solucionar ──', type: 'separator' });
          details.push({ text: '1. Ve a WordPress → Ajustes → Enlaces permanentes y selecciona cualquier opción que NO sea "Simple" (ej: "Nombre de la entrada"). Guarda los cambios.', type: 'info' });
          details.push({ text: '2. Verifica que no haya un plugin de seguridad (Wordfence, iThemes, etc.) bloqueando /wp-json/. Si lo hay, agrega una excepción para la ruta /wp-json/*.', type: 'info' });
          details.push({ text: '3. Revisa el archivo .htaccess — debe contener las reglas de rewrite de WordPress. Si no, ve a Enlaces permanentes y guarda de nuevo para regenerarlo.', type: 'info' });
          details.push({ text: '4. Si usas un CDN o proxy (Cloudflare, etc.), verifica que no esté bloqueando las rutas de la API REST.', type: 'info' });
          details.push({ text: '5. Prueba acceder manualmente a: ' + normalizedUrl + '/wp-json/ — debería mostrar un JSON con información del sitio.', type: 'info' });
        }

      } else if (platform === 'shopify' || platform === 'shopify-headless') {
        details.push({ text: 'Verificando tienda Shopify...', type: 'info' });
        const shopUrl = normalizedUrl.includes('myshopify.com') ? normalizedUrl : `https://${baseUrl}`;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        const shopRes = await fetch(`${shopUrl}/meta.json`, { signal: ctrl.signal });
        clearTimeout(t);

        if (shopRes.ok) {
          const meta = await shopRes.json() as Record<string, any>;
          details.push({ text: 'Tienda Shopify detectada correctamente', type: 'success' });
          if (meta.name) details.push({ text: `Nombre: ${meta.name}`, type: 'success' });

          // Admin API check
          if (admin_url && admin_password) {
            details.push({ text: 'Verificando Shopify Admin API...', type: 'info' });
            try {
              const domain = admin_url.replace(/^https?:\/\//, '').replace(/\/$/, '');
              const version = admin_user || '2024-01';
              const apiCtrl = new AbortController();
              const apiT = setTimeout(() => apiCtrl.abort(), 8000);
              const apiRes = await fetch(`https://${domain}/admin/api/${version}/shop.json`, {
                headers: { 'X-Shopify-Access-Token': admin_password },
                signal: apiCtrl.signal,
              });
              clearTimeout(apiT);

              if (apiRes.ok) {
                const shopData = await apiRes.json() as Record<string, any>;
                details.push({ text: `Admin API conectada — Tienda: ${shopData.shop?.name || domain}`, type: 'success' });
                if (shopData.shop?.plan_name) details.push({ text: `Plan: ${shopData.shop.plan_name}`, type: 'success' });
              } else if (apiRes.status === 401 || apiRes.status === 403) {
                details.push({ text: `Admin API: Token inválido o permisos insuficientes (HTTP ${apiRes.status})`, type: 'error' });
              } else {
                details.push({ text: `Admin API respondió con HTTP ${apiRes.status}`, type: 'warning' });
              }
            } catch {
              details.push({ text: 'No se pudo conectar a la Shopify Admin API', type: 'warning' });
            }
          }
        } else {
          details.push({ text: 'No se pudo verificar la tienda Shopify. Asegúrate de usar el dominio .myshopify.com', type: 'warning' });
        }

      } else if (platform === 'jumpseller') {
        details.push({ text: 'Verificando tienda Jumpseller...', type: 'info' });
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        const jsRes = await fetch(normalizedUrl, { signal: ctrl.signal });
        clearTimeout(t);

        if (jsRes.ok) {
          const html = await jsRes.text();
          if (html.toLowerCase().includes('jumpseller')) {
            details.push({ text: 'Indicadores de Jumpseller detectados en el sitio', type: 'success' });
          } else {
            details.push({ text: 'El sitio responde pero no se detectaron indicadores de Jumpseller', type: 'warning' });
          }
        } else {
          details.push({ text: `Sitio respondió con HTTP ${jsRes.status}`, type: 'warning' });
        }

        // Jumpseller API check
        if (admin_user && admin_password) {
          details.push({ text: 'Verificando Jumpseller API...', type: 'info' });
          try {
            const apiCtrl = new AbortController();
            const apiT = setTimeout(() => apiCtrl.abort(), 8000);
            const apiRes = await fetch(`https://api.jumpseller.com/v1/store.json?login=${encodeURIComponent(admin_user)}&authtoken=${encodeURIComponent(admin_password)}`, {
              signal: apiCtrl.signal,
            });
            clearTimeout(apiT);

            if (apiRes.ok) {
              const storeData = await apiRes.json() as Record<string, any>;
              details.push({ text: `API conectada — Tienda: ${storeData.store?.name || 'OK'}`, type: 'success' });
            } else if (apiRes.status === 401) {
              details.push({ text: 'Credenciales de Jumpseller API inválidas (401)', type: 'error' });
            } else {
              details.push({ text: `Jumpseller API respondió con HTTP ${apiRes.status}`, type: 'warning' });
            }
          } catch {
            details.push({ text: 'No se pudo conectar a la Jumpseller API', type: 'warning' });
          }
        }

      } else if (platform === 'nextjs') {
        details.push({ text: 'Verificando aplicación Next.js...', type: 'info' });
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        const njRes = await fetch(normalizedUrl, { signal: ctrl.signal });
        clearTimeout(t);

        if (njRes.ok) {
          const html = await njRes.text();
          if (html.includes('__NEXT_DATA__') || html.includes('_next/')) {
            details.push({ text: 'Aplicación Next.js detectada', type: 'success' });
          } else {
            details.push({ text: 'Sitio responde correctamente (Next.js no confirmado desde HTML)', type: 'success' });
          }
        }

        if (admin_url) {
          details.push({ text: 'Verificando healthcheck endpoint...', type: 'info' });
          try {
            const hcCtrl = new AbortController();
            const hcT = setTimeout(() => hcCtrl.abort(), 8000);
            const hcRes = await fetch(admin_url, { signal: hcCtrl.signal });
            clearTimeout(hcT);

            if (hcRes.ok) {
              try {
                const hcData = await hcRes.json();
                details.push({ text: `Healthcheck OK: ${JSON.stringify(hcData).slice(0, 100)}`, type: 'success' });
              } catch {
                details.push({ text: 'Healthcheck endpoint responde OK', type: 'success' });
              }
            } else {
              details.push({ text: `Healthcheck respondió con HTTP ${hcRes.status}`, type: 'warning' });
            }
          } catch {
            details.push({ text: 'No se pudo alcanzar el endpoint de healthcheck', type: 'warning' });
          }
        }

      } else {
        details.push({ text: 'Verificación básica HTTP completada', type: 'success' });
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Error desconocido';
      details.push({ text: `Verificación de plataforma falló: ${errMsg}`, type: 'warning' });
    }

    // ── 3. Frontend check for headless platforms ──
    const headlessPlatforms = ['wordpress-headless', 'woo-headless', 'shopify-headless'];
    if (headlessPlatforms.includes(platform) && frontend_url?.trim()) {
      const feBase = frontend_url.replace(/\/$/, '');
      const feUrl = feBase.startsWith('http') ? feBase : `https://${feBase}`;

      details.push({ text: '', type: 'separator' });
      details.push({ text: '── Frontend ──', type: 'separator' });

      // Reachability
      details.push({ text: 'Verificando disponibilidad del frontend...', type: 'info' });
      try {
        const feCtrl = new AbortController();
        const feT = setTimeout(() => feCtrl.abort(), 12000);
        const feRes = await fetch(feUrl, { signal: feCtrl.signal });
        clearTimeout(feT);

        details.push({ text: `Frontend alcanzable — HTTP ${feRes.status} ${feRes.statusText}`, type: 'success' });

        // Framework detection
        const feHtml = await feRes.text();
        if (feHtml.includes('__NEXT_DATA__') || feHtml.includes('_next/')) {
          details.push({ text: 'Next.js detectado en el frontend', type: 'success' });
        } else if (feHtml.includes('__NUXT__') || feHtml.includes('_nuxt/')) {
          details.push({ text: 'Nuxt.js detectado en el frontend', type: 'success' });
        } else if (feHtml.includes('gatsby') || feHtml.includes('___gatsby')) {
          details.push({ text: 'Gatsby detectado en el frontend', type: 'success' });
        } else if (feHtml.includes('__remix') || feHtml.includes('remix')) {
          details.push({ text: 'Remix detectado en el frontend', type: 'success' });
        } else {
          details.push({ text: 'Frontend responde correctamente', type: 'success' });
        }

        // SSL check
        if (feUrl.startsWith('https://')) {
          details.push({ text: 'SSL activo en el frontend', type: 'success' });
        } else {
          details.push({ text: 'Frontend sin HTTPS — se recomienda habilitar SSL', type: 'warning' });
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Error desconocido';
        details.push({ text: `No se pudo conectar al frontend: ${errMsg}`, type: 'error' });
      }

      // Healthcheck
      if (frontend_healthcheck?.trim()) {
        details.push({ text: 'Verificando healthcheck del frontend...', type: 'info' });
        try {
          const hcCtrl = new AbortController();
          const hcT = setTimeout(() => hcCtrl.abort(), 8000);
          const hcRes = await fetch(frontend_healthcheck, { signal: hcCtrl.signal });
          clearTimeout(hcT);

          if (hcRes.ok) {
            try {
              const hcData = await hcRes.json();
              details.push({ text: `Healthcheck del frontend OK: ${JSON.stringify(hcData).slice(0, 100)}`, type: 'success' });
            } catch {
              details.push({ text: 'Healthcheck del frontend responde OK', type: 'success' });
            }
          } else {
            details.push({ text: `Healthcheck del frontend respondió con HTTP ${hcRes.status}`, type: 'warning' });
          }
        } catch {
          details.push({ text: 'No se pudo alcanzar el healthcheck del frontend', type: 'warning' });
        }
      }
    } else if (headlessPlatforms.includes(platform) && !frontend_url?.trim()) {
      details.push({ text: '', type: 'separator' });
      details.push({ text: 'No se ingresó URL de frontend. Se recomienda para monitoreo completo.', type: 'warning' });
    }

    // ── 4. Credential note ──
    if (admin_user || admin_password) {
      const hasRealValidation = ['wordpress', 'wordpress-headless', 'woocommerce', 'woo-headless', 'shopify', 'shopify-headless', 'jumpseller'].includes(platform);
      if (!hasRealValidation) {
        details.push({ text: 'Las credenciales de API fueron registradas pero no se pudieron validar para esta plataforma.', type: 'info' });
      }
    }

    return new Response(JSON.stringify({ ok, message: ok ? 'Conexión verificada' : 'Error de conexión', details }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Error desconocido';
    return new Response(JSON.stringify({ ok: false, message: 'Error interno', details: [{ text: errMsg, type: 'error' }] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
