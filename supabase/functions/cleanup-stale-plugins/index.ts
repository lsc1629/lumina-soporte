// supabase/functions/cleanup-stale-plugins/index.ts
// Limpia plugins stale de project_plugins y auto-cierra incidentes de plugins desactualizados.
// Se invoca desde el frontend al cargar Dashboard/MainLayout.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decrypt } from '../_shared/crypto.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Get all active WP projects
    const { data: projects } = await sb
      .from('projects')
      .select('id, name, url, platform, admin_url, admin_user, admin_password_encrypted')
      .eq('is_active', true);

    if (!projects || projects.length === 0) {
      return new Response(JSON.stringify({ cleaned: 0 }), { headers: cors });
    }

    // Decrypt credentials
    for (const p of projects) {
      if (p.admin_password_encrypted) p.admin_password_encrypted = await decrypt(p.admin_password_encrypted);
    }

    let totalCleaned = 0;
    let incidentsClosed = 0;

    for (const project of projects) {
      if (!['wordpress', 'headless'].includes(project.platform)) continue;
      if (!project.admin_url || !project.admin_user || !project.admin_password_encrypted) continue;

      const baseUrl = (project.admin_url || project.url || '').replace(/\/+$/, '');
      const isWoo = project.admin_user.startsWith('ck_');
      let liveSlugs: string[] = [];

      try {
        if (isWoo) {
          const wooUrl = `${baseUrl}/wp-json/wc/v3/system_status?consumer_key=${encodeURIComponent(project.admin_user)}&consumer_secret=${encodeURIComponent(project.admin_password_encrypted)}`;
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 20000);
          const res = await fetch(wooUrl, { signal: ctrl.signal });
          clearTimeout(t);
          if (res.ok) {
            const ss = await res.json() as any;
            const active = (ss.active_plugins || []).map((p: any) => (p.plugin || '').split('/')[0]).filter(Boolean);
            const inactive = (ss.inactive_plugins || []).map((p: any) => (p.plugin || '').split('/')[0]).filter(Boolean);
            liveSlugs = [...active, ...inactive];
            if (ss.theme?.stylesheet) liveSlugs.push(ss.theme.stylesheet);
          }
        } else {
          const enc = new TextEncoder();
          const raw = enc.encode(`${project.admin_user}:${project.admin_password_encrypted}`);
          let b64 = '';
          for (const byte of raw) b64 += String.fromCharCode(byte);
          b64 = btoa(b64);
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 20000);
          const res = await fetch(`${baseUrl}/wp-json/wp/v2/plugins`, {
            headers: { 'Authorization': `Basic ${b64}` },
            signal: ctrl.signal,
          });
          clearTimeout(t);
          if (res.ok) {
            const plugins = await res.json() as any[];
            liveSlugs = plugins.map(p => (p.plugin || '').split('/')[0]).filter(Boolean);
          }
        }

        console.log(`[cleanup] ${project.name}: ${liveSlugs.length} live slugs from API`);

        if (liveSlugs.length > 0) {
          const { data: dbPlugins } = await sb
            .from('project_plugins')
            .select('id, slug, name')
            .eq('project_id', project.id);

          if (dbPlugins) {
            const toDelete = dbPlugins.filter(d => !liveSlugs.includes(d.slug));
            if (toDelete.length > 0) {
              const ids = toDelete.map(d => d.id);
              await sb.from('project_plugins').delete().in('id', ids);
              totalCleaned += toDelete.length;
              console.log(`[cleanup] deleted ${toDelete.length} stale plugins for ${project.name}:`, toDelete.map(d => d.name).join(', '));
            }
          }
        }

        // Check if this project still has outdated plugins after cleanup
        const { data: remaining } = await sb
          .from('project_plugins')
          .select('id, latest_version, current_version')
          .eq('project_id', project.id);

        const stillOutdated = (remaining || []).filter(p =>
          p.latest_version && p.latest_version !== '' && p.latest_version !== 'unknown' && p.latest_version !== p.current_version
        );

        // If no outdated plugins remain, auto-close any open plugin incidents
        if (stillOutdated.length === 0) {
          const { data: openIncs } = await sb
            .from('incidents')
            .select('id, incident_number')
            .eq('project_id', project.id)
            .eq('is_auto_detected', true)
            .ilike('title', '%plugin%desactualizado%')
            .in('status', ['investigating', 'identified', 'monitoring']);

          for (const inc of (openIncs || [])) {
            await sb.from('incidents').update({
              status: 'resolved',
              resolved_at: new Date().toISOString(),
              resolution: 'Todos los plugins están actualizados. Incidente cerrado automáticamente.',
            }).eq('id', inc.id);

            await sb.from('incident_timeline').insert({
              incident_id: inc.id,
              event_type: 'status_change',
              message: 'Resuelto automáticamente: ya no se detectan plugins desactualizados.',
            });

            incidentsClosed++;
            console.log(`[cleanup] auto-resolved incident ${inc.incident_number} for ${project.name}`);
          }
        }
      } catch (e) {
        console.log(`[cleanup] error for ${project.name}:`, e instanceof Error ? e.message : e);
      }
    }

    return new Response(JSON.stringify({ cleaned: totalCleaned, incidents_closed: incidentsClosed }), { headers: cors });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: cors });
  }
});
