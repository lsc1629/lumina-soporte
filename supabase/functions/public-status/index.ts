// supabase/functions/public-status/index.ts
// Edge Function que sirve datos públicos de estado de un proyecto.
// No requiere autenticación — accesible por cualquiera con el slug.
// Endpoint: GET /public-status?slug=mi-tienda

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UptimeLog {
  status: string;
  response_time_ms: number | null;
  checked_at: string;
}

interface Incident {
  id: string;
  incident_number: string;
  title: string;
  status: string;
  priority: string;
  started_at: string;
  resolved_at: string | null;
  duration_minutes: number | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const slug = url.searchParams.get('slug');

  if (!slug) {
    return new Response(JSON.stringify({ error: 'Missing slug parameter' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(supabaseUrl, serviceRoleKey);

  try {
    // 1. Find project by slug (must have status page enabled)
    const { data: project, error: projErr } = await sb
      .from('projects')
      .select('id, name, url, platform, status, uptime_percent, response_time_ms, last_check_at, ssl_expiry')
      .eq('public_slug', slug)
      .eq('status_page_enabled', true)
      .single();

    if (projErr || !project) {
      return new Response(JSON.stringify({ error: 'Project not found or status page not enabled' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Get uptime logs from last 90 days (for uptime bars) — aggregated by day
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: uptimeLogs } = await sb
      .from('uptime_logs')
      .select('status, response_time_ms, checked_at')
      .eq('project_id', project.id)
      .gte('checked_at', ninetyDaysAgo)
      .order('checked_at', { ascending: true }) as { data: UptimeLog[] | null };

    // Aggregate logs by day
    const dailyStats: Record<string, { total: number; up: number; avgResponseMs: number; responseTimes: number[] }> = {};
    if (uptimeLogs) {
      for (const log of uptimeLogs) {
        const day = log.checked_at.substring(0, 10); // YYYY-MM-DD
        if (!dailyStats[day]) {
          dailyStats[day] = { total: 0, up: 0, avgResponseMs: 0, responseTimes: [] };
        }
        dailyStats[day].total++;
        if (log.status === 'up' || log.status === 'warning') dailyStats[day].up++;
        if (log.response_time_ms) dailyStats[day].responseTimes.push(log.response_time_ms);
      }
    }

    const uptimeDays = Object.entries(dailyStats).map(([date, stats]) => ({
      date,
      uptime: stats.total > 0 ? parseFloat((stats.up / stats.total * 100).toFixed(2)) : 100,
      avgResponseMs: stats.responseTimes.length > 0
        ? Math.round(stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length)
        : null,
      checks: stats.total,
    }));

    // 3. Calculate uptime for different periods
    const now = Date.now();
    const periods = [
      { label: '24h', ms: 24 * 60 * 60 * 1000 },
      { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
      { label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
      { label: '90d', ms: 90 * 24 * 60 * 60 * 1000 },
    ];

    const uptimeByPeriod: Record<string, number> = {};
    if (uptimeLogs && uptimeLogs.length > 0) {
      for (const period of periods) {
        const cutoff = now - period.ms;
        const logsInPeriod = uptimeLogs.filter(l => new Date(l.checked_at).getTime() >= cutoff);
        const upCount = logsInPeriod.filter(l => l.status === 'up' || l.status === 'warning').length;
        uptimeByPeriod[period.label] = logsInPeriod.length > 0
          ? parseFloat((upCount / logsInPeriod.length * 100).toFixed(2))
          : 100;
      }
    } else {
      for (const period of periods) uptimeByPeriod[period.label] = 100;
    }

    // 4. Response time data (last 24h, every check)
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const responseTimeLogs = uptimeLogs?.filter(
      l => l.checked_at >= twentyFourHoursAgo && l.response_time_ms !== null
    ).map(l => ({
      time: l.checked_at,
      ms: l.response_time_ms,
    })) || [];

    // 5. Recent incidents (last 90 days, max 20)
    const { data: incidents } = await sb
      .from('incidents')
      .select('id, incident_number, title, status, priority, started_at, resolved_at, duration_minutes')
      .eq('project_id', project.id)
      .gte('started_at', ninetyDaysAgo)
      .order('started_at', { ascending: false })
      .limit(20) as { data: Incident[] | null };

    // 6. Current status label
    const statusLabel = project.status === 'up' ? 'Todos los sistemas operativos'
      : project.status === 'warning' ? 'Rendimiento degradado'
      : project.status === 'down' ? 'Interrupción mayor'
      : project.status === 'maintenance' ? 'En mantenimiento'
      : 'Desconocido';

    return new Response(JSON.stringify({
      project: {
        name: project.name,
        url: project.url,
        platform: project.platform,
        status: project.status,
        statusLabel,
        uptimePercent: project.uptime_percent,
        responseTimeMs: project.response_time_ms,
        lastCheckAt: project.last_check_at,
        sslExpiry: project.ssl_expiry,
      },
      uptime: uptimeByPeriod,
      uptimeDays,
      responseTimeLogs,
      incidents: incidents || [],
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
