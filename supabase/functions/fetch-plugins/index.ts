// supabase/functions/fetch-plugins/index.ts
// Edge Function — rescata plugins/themes/apps instalados por proyecto.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decrypt } from '../_shared/crypto.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status: 200, headers: cors });
}

function encodeBasic(user: string, pass: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${user}:${pass}`);
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json();
    const projectId = body?.project_id;
    console.log('[fetch-plugins] start, project_id:', projectId);

    if (!projectId) return ok({ plugins: [], api_error: 'project_id requerido' });

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: project, error: pErr } = await sb
      .from('projects')
      .select('id, name, url, platform, admin_url, admin_user, admin_password_encrypted, wp_app_user, wp_app_password_encrypted, site_token')
      .eq('id', projectId)
      .single();

    if (pErr || !project) {
      console.log('[fetch-plugins] project error:', pErr?.message);
      return ok({ plugins: [], api_error: `Proyecto no encontrado: ${pErr?.message || ''}` });
    }

    // Decrypt credentials
    if (project.admin_password_encrypted) {
      project.admin_password_encrypted = await decrypt(project.admin_password_encrypted);
    }
    if (project.wp_app_password_encrypted) {
      project.wp_app_password_encrypted = await decrypt(project.wp_app_password_encrypted);
    }

    console.log('[fetch-plugins] project:', project.name, 'platform:', project.platform);

    const platform = project.platform;
    const isWp = ['wordpress', 'headless'].includes(platform);
    // Detect WooCommerce: platform='wordpress' but credentials are Consumer Key/Secret (ck_/cs_)
    const isWoo = isWp && project.admin_user?.startsWith('ck_');
    // Detect Lumina Agent: site_token (v3) or wp_app_user (v2 legacy)
    const hasLuminaAgent = isWp && (!!project.site_token || (!!project.wp_app_user && !!project.wp_app_password_encrypted));
    const results: Array<{ name: string; slug: string; current_version: string; latest_version: string; is_active: boolean; plugin_type: string; author: string; plugin_file: string; auto_update: boolean }> = [];
    let apiError: string | null = null;
    let wpVersion: string | null = null;

    if (isWp && hasLuminaAgent) {
      // ══════════════════════════════════════════════════════════════
      // RUTA UNIFICADA: Lumina Agent instalado (WP y WooCommerce igual)
      // Usa /lumina/v1/plugins + /lumina/v1/themes + /lumina/v1/status
      // ══════════════════════════════════════════════════════════════
      let base = (project.admin_url || project.url || '').replace(/\/wp-admin\/?$/, '').replace(/\/+$/, '');
      if (!base.startsWith('http')) base = `https://${base}`;
      // Build auth headers: prefer site_token (v3), fallback Basic Auth (v2)
      const agentHdrs: Record<string, string> = { 'Accept': 'application/json' };
      if (project.site_token) {
        agentHdrs['X-Lumina-Token'] = project.site_token;
      } else {
        agentHdrs['Authorization'] = `Basic ${encodeBasic(project.wp_app_user, project.wp_app_password_encrypted)}`;
      }
      console.log('[fetch-plugins] Lumina Agent route | base:', base, '| auth:', project.site_token ? 'site_token' : 'basic_auth', '| isWoo:', isWoo);

      // 1. GET /lumina/v1/status — WP version, permissions, site info
      try {
        const statusRes = await fetch(`${base}/wp-json/lumina/v1/status`, {
          headers: agentHdrs,
        });
        if (statusRes.ok) {
          const status = await statusRes.json() as Record<string, unknown>;
          wpVersion = (status.wp_version as string) || null;
          console.log('[fetch-plugins] Agent status: WP', wpVersion, '| agent:', status.agent_version, '| woo:', status.woocommerce);
        } else {
          console.log('[fetch-plugins] Agent /status failed:', statusRes.status);
        }
      } catch (e) {
        console.log('[fetch-plugins] Agent /status error:', e instanceof Error ? e.message : e);
      }

      // 2. GET /lumina/v1/plugins — plugins completos con versiones, auto_update, has_update
      try {
        const plugRes = await fetch(`${base}/wp-json/lumina/v1/plugins`, {
          headers: agentHdrs,
        });
        console.log('[fetch-plugins] Agent /plugins response:', plugRes.status);
        if (plugRes.ok) {
          const plugData = await plugRes.json() as { success: boolean; plugins: Array<Record<string, unknown>> };
          for (const p of (plugData.plugins || [])) {
            results.push({
              name: ((p.name as string) || '').replace(/<[^>]*>/g, ''),
              slug: (p.slug as string) || '',
              current_version: (p.current_version as string) || '',
              latest_version: (p.latest_version as string) || '',
              is_active: (p.is_active as boolean) ?? false,
              plugin_type: 'plugin',
              author: ((p.author as string) || '').replace(/<[^>]*>/g, ''),
              plugin_file: (p.plugin_file as string) || '',
              auto_update: (p.auto_update as boolean) ?? false,
            });
          }
          console.log('[fetch-plugins] Agent returned', plugData.plugins?.length || 0, 'plugins');
        } else {
          const t = await plugRes.text();
          console.log('[fetch-plugins] Agent /plugins error:', plugRes.status, t.substring(0, 200));
          if (plugRes.status === 401 || plugRes.status === 403) {
            apiError = 'Lumina Agent: credenciales inválidas o permisos insuficientes. Reconecta el sitio desde WP Admin → Ajustes → Lumina Agent.';
          } else if (plugRes.status === 404) {
            apiError = 'Lumina Agent no encontrado en el sitio. Verifica que el plugin esté instalado y activado.';
          } else {
            apiError = `Lumina Agent /plugins error (${plugRes.status}): ${t.substring(0, 100)}`;
          }
        }
      } catch (e) {
        apiError = `Error conectando con Lumina Agent: ${e instanceof Error ? e.message : String(e)}`;
        console.log('[fetch-plugins]', apiError);
      }

      // 3. GET /lumina/v1/themes — temas completos
      try {
        const themeRes = await fetch(`${base}/wp-json/lumina/v1/themes`, {
          headers: agentHdrs,
        });
        if (themeRes.ok) {
          const themeData = await themeRes.json() as { success: boolean; themes: Array<Record<string, unknown>> };
          for (const t of (themeData.themes || [])) {
            results.push({
              name: ((t.name as string) || '').replace(/<[^>]*>/g, ''),
              slug: (t.slug as string) || '',
              current_version: (t.current_version as string) || '',
              latest_version: (t.latest_version as string) || '',
              is_active: (t.is_active as boolean) ?? false,
              plugin_type: 'theme',
              author: ((t.author as string) || '').replace(/<[^>]*>/g, ''),
              plugin_file: '',
              auto_update: (t.auto_update as boolean) ?? false,
            });
          }
          console.log('[fetch-plugins] Agent returned', themeData.themes?.length || 0, 'themes');
        }
      } catch (_) { /* themes optional */ }

    } else if (isWp && isWoo) {
      // ── WooCommerce LEGACY: Consumer Key / Secret (sin Lumina Agent) ──
      if (!project.admin_user || !project.admin_password_encrypted) {
        return ok({ plugins: [], api_error: 'Credenciales WooCommerce no configuradas. Edita el proyecto y agrega Consumer Key + Consumer Secret, o instala el plugin Lumina Agent.' });
      }

      let base = (project.admin_url || project.url || '').replace(/\/wp-admin\/?$/, '').replace(/\/+$/, '');
      if (!base.startsWith('http')) base = `https://${base}`;
      const ck = project.admin_user;
      const cs = project.admin_password_encrypted;
      console.log('[fetch-plugins] WooCommerce LEGACY base:', base, '| ck length:', ck?.length, '| cs length:', cs?.length);

      // WooCommerce system status shows installed plugins with versions
      try {
        const res = await fetch(`${base}/wp-json/wc/v3/system_status?consumer_key=${encodeURIComponent(ck)}&consumer_secret=${encodeURIComponent(cs)}`, {
          headers: { 'Accept': 'application/json' },
        });
        console.log('[fetch-plugins] WC system_status response:', res.status);
        if (res.ok) {
          const data = await res.json() as {
            environment?: { version?: string; wp_version?: string };
            active_plugins: Array<{ plugin: string; name: string; version: string; author: string; network_activated: boolean }>;
            inactive_plugins: Array<{ plugin: string; name: string; version: string; author: string }>;
            theme: { name: string; version: string; author_url: string; is_child_theme: boolean; has_woocommerce_support: boolean };
          };
          if (data.environment?.wp_version) wpVersion = data.environment.wp_version;
          console.log('[fetch-plugins] WC wp_version:', data.environment?.wp_version, '| wc_version:', data.environment?.version);
          for (const p of (data.active_plugins || [])) {
            results.push({
              name: (p.name || '').replace(/<[^>]*>/g, ''),
              slug: (p.plugin || '').split('/')[0] || p.name,
              current_version: p.version || '',
              latest_version: '',
              is_active: true,
              plugin_type: 'plugin',
              author: (p.author || '').replace(/<[^>]*>/g, ''),
              plugin_file: p.plugin || '',
              auto_update: false,
            });
          }
          for (const p of (data.inactive_plugins || [])) {
            results.push({
              name: (p.name || '').replace(/<[^>]*>/g, ''),
              slug: (p.plugin || '').split('/')[0] || p.name,
              current_version: p.version || '',
              latest_version: '',
              is_active: false,
              plugin_type: 'plugin',
              author: (p.author || '').replace(/<[^>]*>/g, ''),
              plugin_file: p.plugin || '',
              auto_update: false,
            });
          }
          if (data.theme?.name) {
            results.push({
              name: data.theme.name,
              slug: data.theme.name.toLowerCase().replace(/\s+/g, '-'),
              current_version: data.theme.version || '',
              latest_version: '',
              is_active: true,
              plugin_type: 'theme',
              author: '',
              plugin_file: '',
              auto_update: false,
            });
          }
        } else {
          const t = await res.text();
          console.log('[fetch-plugins] WC system_status error:', res.status, t.substring(0, 200));
          if (res.status === 401) {
            apiError = 'Consumer Key/Secret de WooCommerce inválidos. Ve a WooCommerce → Ajustes → Avanzado → REST API y genera nuevas claves con permisos de Lectura.';
          } else {
            apiError = `WooCommerce API error (${res.status}): ${t.substring(0, 100)}`;
          }
        }
      } catch (e) {
        apiError = `Error conectando WooCommerce: ${e instanceof Error ? e.message : String(e)}`;
        console.log('[fetch-plugins]', apiError);
      }

      // WooCommerce fallback: if wp_version not found via system_status, try /wp-login.php
      if (!wpVersion) {
        try {
          const loginRes = await fetch(`${base}/wp-login.php`, {
            headers: { 'Accept': 'text/html' },
            redirect: 'follow',
          });
          if (loginRes.ok) {
            const loginHtml = (await loginRes.text()).substring(0, 10000);
            const verMatches = loginHtml.match(/[?&]ver=([\d]+\.[\d]+(?:\.[\d]+)?)/g);
            if (verMatches && verMatches.length > 0) {
              const versions = verMatches.map(m => m.replace(/^[?&]ver=/, ''));
              const freq = new Map<string, number>();
              for (const v of versions) freq.set(v, (freq.get(v) || 0) + 1);
              const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
              if (sorted.length > 0) {
                wpVersion = sorted[0][0];
                console.log('[fetch-plugins] WC wp_version from /wp-login.php fallback:', wpVersion);
              }
            }
          }
        } catch (_) { /* optional */ }
      }
      console.log('[fetch-plugins] WooCommerce final WP version:', wpVersion);

    } else if (isWp && !isWoo) {
      // ── WordPress LEGACY: Application Password auth (sin Lumina Agent) ──
      if (!project.admin_user || !project.admin_password_encrypted) {
        return ok({ plugins: [], api_error: 'Credenciales WordPress no configuradas. Edita el proyecto y agrega usuario + Contraseña de Aplicación, o instala el plugin Lumina Agent.' });
      }

      let base = (project.admin_url || project.url || '').replace(/\/wp-admin\/?$/, '').replace(/\/+$/, '');
      if (!base.startsWith('http')) base = `https://${base}`;
      const auth = `Basic ${encodeBasic(project.admin_user, project.admin_password_encrypted)}`;
      console.log('[fetch-plugins] WP LEGACY base:', base, '| user:', project.admin_user);

      // Test auth
      try {
        const testRes = await fetch(`${base}/wp-json/wp/v2/users/me?context=edit`, {
          headers: { 'Authorization': auth, 'Accept': 'application/json' },
        });
        if (testRes.ok) {
          const me = await testRes.json() as { slug: string; roles: string[]; capabilities: Record<string, boolean> };
          console.log('[fetch-plugins] WP user:', me.slug, '| roles:', me.roles);
          if (!me.capabilities?.activate_plugins) {
            return ok({ plugins: [], api_error: `El usuario "${me.slug}" (roles: ${(me.roles || []).join(', ')}) no tiene el permiso "activate_plugins". Revisa plugins de seguridad del sitio.` });
          }
        } else if (testRes.status === 401) {
          return ok({ plugins: [], api_error: 'Credenciales WordPress inválidas. Verifica usuario y Contraseña de Aplicación.' });
        }
      } catch (e) {
        console.log('[fetch-plugins] WP auth test error:', e instanceof Error ? e.message : e);
      }

      // Detect WP core version
      try {
        const loginRes = await fetch(`${base}/wp-login.php`, {
          headers: { 'Accept': 'text/html' },
          redirect: 'follow',
        });
        if (loginRes.ok) {
          const loginHtml = (await loginRes.text()).substring(0, 10000);
          const verMatches = loginHtml.match(/[?&]ver=([\d]+\.[\d]+(?:\.[\d]+)?)/g);
          if (verMatches && verMatches.length > 0) {
            const versions = verMatches.map(m => m.replace(/^[?&]ver=/, ''));
            const freq = new Map<string, number>();
            for (const v of versions) freq.set(v, (freq.get(v) || 0) + 1);
            const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
            if (sorted.length > 0) {
              wpVersion = sorted[0][0];
              console.log('[fetch-plugins] WP core version from /wp-login.php ver params:', wpVersion, '(found in', sorted[0][1], 'assets)');
            }
          }
        }
      } catch (_) { /* optional */ }

      if (!wpVersion) {
        try {
          const homeRes = await fetch(base, { headers: { 'Accept': 'text/html' }, redirect: 'follow' });
          if (homeRes.ok) {
            const html = (await homeRes.text()).substring(0, 5000);
            const match = html.match(/content="WordPress\s+([\d.]+)"/i);
            if (match) wpVersion = match[1];
            console.log('[fetch-plugins] WP core version from meta tag fallback:', wpVersion);
          }
        } catch (_) { /* optional */ }
      }
      console.log('[fetch-plugins] Final WP version detected:', wpVersion);

      // Fetch plugins
      try {
        const cacheBust = Date.now();
        const res = await fetch(`${base}/wp-json/wp/v2/plugins?_=${cacheBust}&force-check=1`, {
          headers: { 'Authorization': auth, 'Accept': 'application/json', 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' },
        });
        console.log('[fetch-plugins] plugins response:', res.status);
        if (res.ok) {
          const data = await res.json() as Array<{ plugin: string; name: string; version: string; status: string; author: string; update?: Record<string, unknown> | string; auto_update?: boolean }>;
          let wpApiUpdates = 0;
          for (const p of data) {
            let latestVer = '';
            if (p.update && typeof p.update === 'object') {
              latestVer = (p.update.new_version as string) || (p.update.version as string) || '';
            } else if (p.update && typeof p.update === 'string' && p.update !== 'unavailable') {
              latestVer = p.update;
            }
            if (latestVer) wpApiUpdates++;
            results.push({
              name: (p.name || p.plugin || '').replace(/<[^>]*>/g, ''),
              slug: (p.plugin || '').split('/')[0] || p.plugin,
              current_version: p.version || '',
              latest_version: latestVer,
              is_active: p.status === 'active',
              plugin_type: 'plugin',
              author: (typeof p.author === 'string' ? p.author : '').replace(/<[^>]*>/g, ''),
              plugin_file: p.plugin || '',
              auto_update: p.auto_update ?? false,
            });
          }
          console.log('[fetch-plugins] WP API reported updates for', wpApiUpdates, 'of', data.length, 'plugins');
        } else {
          const t = await res.text();
          if (res.status === 401) {
            apiError = 'Sin permisos para listar plugins. Verifica que el usuario sea Administrador y la Contraseña de Aplicación sea válida.';
          } else {
            apiError = `WP Plugins API error (${res.status}): ${t.substring(0, 100)}`;
          }
        }
      } catch (e) {
        apiError = `Error conectando plugins: ${e instanceof Error ? e.message : String(e)}`;
      }

      // Fetch themes
      try {
        const res = await fetch(`${base}/wp-json/wp/v2/themes?_=${Date.now()}`, {
          headers: { 'Authorization': auth, 'Accept': 'application/json', 'Cache-Control': 'no-cache, no-store' },
        });
        if (res.ok) {
          const data = await res.json() as Array<{ stylesheet: string; name: unknown; version: string; status: string; author: unknown; update?: { new_version?: string } }>;
          for (const t of data) {
            const nm = typeof t.name === 'string' ? t.name : ((t.name as any)?.raw || (t.name as any)?.rendered || t.stylesheet);
            const au = typeof t.author === 'string' ? t.author : ((t.author as any)?.raw || '');
            results.push({
              name: nm.replace(/<[^>]*>/g, ''),
              slug: t.stylesheet,
              current_version: t.version || '',
              latest_version: t.update?.new_version || '',
              is_active: t.status === 'active',
              plugin_type: 'theme',
              author: au.replace(/<[^>]*>/g, ''),
              plugin_file: '',
              auto_update: false,
            });
          }
        }
      } catch (_) { /* themes optional */ }

    } else if (platform === 'shopify') {
      // Shopify themes
      try {
        const domain = (project.admin_url || project.url || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
        const ver = project.admin_user || '2024-01';
        const res = await fetch(`https://${domain}/admin/api/${ver}/themes.json`, {
          headers: { 'X-Shopify-Access-Token': project.admin_password_encrypted, 'Accept': 'application/json' },
        });
        if (res.ok) {
          const d = await res.json() as { themes: Array<{ id: number; name: string; role: string }> };
          for (const t of (d.themes || [])) {
            results.push({ name: t.name, slug: `theme-${t.id}`, current_version: t.role === 'main' ? 'Activo' : t.role, latest_version: '', is_active: t.role === 'main', plugin_type: 'theme', author: '', plugin_file: '', auto_update: false });
          }
        } else {
          apiError = `Shopify API ${res.status}`;
        }
      } catch (e) { apiError = `Shopify error: ${e instanceof Error ? e.message : String(e)}`; }

    } else if (platform === 'jumpseller') {
      try {
        const res = await fetch(`https://api.jumpseller.com/v1/apps.json?login=${project.admin_user}&authtoken=${project.admin_password_encrypted}`, {
          headers: { 'Accept': 'application/json' },
        });
        if (res.ok) {
          const d = await res.json() as Array<{ id: number; name: string; version?: string; status?: string }>;
          for (const a of (d || [])) {
            results.push({ name: a.name, slug: `app-${a.id}`, current_version: a.version || '', latest_version: '', is_active: a.status !== 'inactive', plugin_type: 'app', author: '', plugin_file: '', auto_update: false });
          }
        } else { apiError = `Jumpseller API ${res.status}`; }
      } catch (e) { apiError = `Jumpseller error: ${e instanceof Error ? e.message : String(e)}`; }

    } else {
      return ok({ plugins: [], api_error: null, message: `Plataforma "${platform}" no soporta listado de plugins.` });
    }

    console.log('[fetch-plugins] fetched:', results.length, 'items, error:', apiError);

    // Upsert into project_plugins — always write latest_version (even empty) to keep data fresh
    if (results.length > 0) {
      const { error: upErr } = await sb.from('project_plugins').upsert(
        results.map(p => ({
          project_id: project.id, name: p.name, slug: p.slug,
          current_version: p.current_version,
          latest_version: p.latest_version || '',
          is_active: p.is_active, plugin_type: p.plugin_type, author: p.author,
          plugin_file: p.plugin_file || '',
          auto_update: p.auto_update ?? false,
          last_checked_at: new Date().toISOString(),
        })),
        { onConflict: 'project_id,slug', ignoreDuplicates: false },
      );
      if (upErr) {
        console.log('[fetch-plugins] upsert error:', upErr.message);
        apiError = (apiError ? apiError + ' | ' : '') + `DB: ${upErr.message}`;
      }

      // DELETE plugins/themes that no longer exist on the site
      // (e.g. user uninstalled a plugin from WP admin)
      const freshSlugs = results.map(p => p.slug);
      const { data: existingInDb } = await sb
        .from('project_plugins')
        .select('id, slug')
        .eq('project_id', project.id);
      if (existingInDb) {
        const toDelete = existingInDb.filter(e => !freshSlugs.includes(e.slug)).map(e => e.id);
        if (toDelete.length > 0) {
          await sb.from('project_plugins').delete().in('id', toDelete);
          console.log('[fetch-plugins] removed', toDelete.length, 'plugins no longer on site:', existingInDb.filter(e => !freshSlugs.includes(e.slug)).map(e => e.slug).join(', '));
        }
      }
    }

    // ── Fetch latest_version from WordPress.org API for plugins that didn't get it from WP REST API ──
    if (isWp && results.length > 0) {
      const pluginSlugs = results.filter(r => r.plugin_type === 'plugin' && !r.latest_version).map(r => r.slug);
      console.log('[fetch-plugins] checking latest versions for', pluginSlugs.length, 'plugins on wp.org (skipped', results.filter(r => r.plugin_type === 'plugin' && r.latest_version).length, 'already known)');

      // Batch: query wp.org API for each slug (up to 50 in parallel batches of 5)
      const BATCH_SIZE = 5;
      const latestVersions = new Map<string, string>();

      for (let i = 0; i < pluginSlugs.length; i += BATCH_SIZE) {
        const batch = pluginSlugs.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (slug) => {
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 5000);
            const res = await fetch(
              `https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]=${encodeURIComponent(slug)}&request[fields][version]=1`,
              { signal: ctrl.signal, headers: { 'Accept': 'application/json' } }
            );
            clearTimeout(t);
            if (res.ok) {
              const data = await res.json() as { version?: string; error?: string };
              if (data.version && !data.error) {
                latestVersions.set(slug, data.version);
              }
            }
          } catch { /* wp.org lookup optional */ }
        });
        await Promise.all(promises);
      }

      console.log('[fetch-plugins] found latest versions for', latestVersions.size, 'of', pluginSlugs.length, 'plugins');

      // Also check themes on wp.org
      const themeSlugs = results.filter(r => r.plugin_type === 'theme').map(r => r.slug);
      for (let i = 0; i < themeSlugs.length; i += BATCH_SIZE) {
        const batch = themeSlugs.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (slug) => {
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 5000);
            const res = await fetch(
              `https://api.wordpress.org/themes/info/1.2/?action=theme_information&request[slug]=${encodeURIComponent(slug)}&request[fields][version]=1`,
              { signal: ctrl.signal, headers: { 'Accept': 'application/json' } }
            );
            clearTimeout(t);
            if (res.ok) {
              const data = await res.json() as { version?: string; error?: string };
              if (data.version && !data.error) {
                latestVersions.set(slug, data.version);
              }
            }
          } catch { /* wp.org lookup optional */ }
        });
        await Promise.all(promises);
      }

      // Update latest_version in DB for each plugin/theme found via wp.org
      if (latestVersions.size > 0) {
        const updates = Array.from(latestVersions.entries()).map(([slug, version]) => 
          sb.from('project_plugins')
            .update({ latest_version: version })
            .eq('project_id', project.id)
            .eq('slug', slug)
        );
        const settled = await Promise.allSettled(updates);
        const failCount = settled.filter(r => r.status === 'rejected').length;
        if (failCount > 0) console.log('[fetch-plugins] failed to update latest_version for', failCount, 'plugins');
        console.log('[fetch-plugins] updated latest_version for', latestVersions.size, 'plugins/themes via wp.org');
      }

      // Mark plugins/themes still without latest_version as 'unknown' (premium/proprietary)
      // so the UI can show them as "Sin verificar" instead of hiding them
      const stillUnknown = results.filter(r => !r.latest_version && !latestVersions.has(r.slug));
      if (stillUnknown.length > 0) {
        const unknownUpdates = stillUnknown.map(r =>
          sb.from('project_plugins')
            .update({ latest_version: 'unknown' })
            .eq('project_id', project.id)
            .eq('slug', r.slug)
        );
        await Promise.allSettled(unknownUpdates);
        console.log('[fetch-plugins] marked', stillUnknown.length, 'plugins as unknown (premium/proprietary):', stillUnknown.map(r => r.slug).join(', '));
      }
    }

    // ── Check WP core latest version ──
    let wpLatestVersion: string | null = null;
    if (isWp && wpVersion) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const coreRes = await fetch('https://api.wordpress.org/core/version-check/1.7/', { signal: ctrl.signal });
        clearTimeout(t);
        if (coreRes.ok) {
          const coreData = await coreRes.json() as { offers?: Array<{ version: string; response: string }> };
          const latest = coreData.offers?.find(o => o.response === 'upgrade' || o.response === 'latest');
          if (latest) wpLatestVersion = latest.version;
          console.log('[fetch-plugins] WP core:', wpVersion, '→ latest:', wpLatestVersion);
        }
      } catch (_) { /* wp core check optional */ }

      // Upsert WP core as a special entry in project_plugins
      if (wpLatestVersion) {
        await sb.from('project_plugins').upsert({
          project_id: project.id,
          name: 'WordPress Core',
          slug: 'wordpress-core',
          current_version: wpVersion,
          latest_version: wpLatestVersion,
          is_active: true,
          plugin_type: 'core',
          author: 'WordPress.org',
          last_checked_at: new Date().toISOString(),
        }, { onConflict: 'project_id,slug', ignoreDuplicates: false });
      }
    }

    // Return full list from DB
    const { data: all, error: lErr } = await sb
      .from('project_plugins')
      .select('id, name, slug, current_version, latest_version, is_active, plugin_type, author, plugin_file, auto_update')
      .eq('project_id', project.id)
      .order('name');

    if (lErr) {
      console.log('[fetch-plugins] load error:', lErr.message);
      return ok({ plugins: [], api_error: `DB read: ${lErr.message}` });
    }

    // Calculate outdated count — exclude 'unknown' (premium/proprietary plugins without wp.org listing)
    const outdatedCount = (all || []).filter(p => p.latest_version && p.latest_version !== '' && p.latest_version !== 'unknown' && p.latest_version !== p.current_version).length;
    console.log('[fetch-plugins] done, returning', (all || []).length, 'wp_version:', wpVersion, 'wp_latest:', wpLatestVersion, 'outdated:', outdatedCount);
    return ok({ plugins: all || [], fetched_count: results.length, outdated_count: outdatedCount, api_error: apiError, wp_version: wpVersion, wp_latest_version: wpLatestVersion });

  } catch (e) {
    console.error('[fetch-plugins] FATAL:', e);
    return ok({ plugins: [], api_error: `Error interno: ${e instanceof Error ? e.message : String(e)}` });
  }
});
