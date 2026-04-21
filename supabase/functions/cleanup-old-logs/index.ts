// supabase/functions/cleanup-old-logs/index.ts
// Purga automática de uptime_logs antiguos basada en log_retention_days por proyecto.
// Se puede invocar manualmente desde el frontend o via cron (pg_cron / Supabase Cron).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    // Get all active projects with their retention settings
    const { data: projects, error: projErr } = await sb
      .from('projects')
      .select('id, name, log_retention_days')
      .eq('is_active', true);

    if (projErr) throw projErr;
    if (!projects || projects.length === 0) {
      return new Response(JSON.stringify({ purged: 0, projects: 0, message: 'No active projects' }), { headers: cors });
    }

    let totalPurged = 0;
    const details: { project: string; retention_days: number; deleted: number }[] = [];

    for (const project of projects) {
      const retentionDays = project.log_retention_days || 90;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const cutoffISO = cutoffDate.toISOString();

      // Count logs to delete (for reporting)
      const { count } = await sb
        .from('uptime_logs')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .lt('checked_at', cutoffISO);

      const toDelete = count || 0;

      if (toDelete > 0) {
        // Delete in batches of 5000 to avoid timeouts
        let deletedTotal = 0;
        let batchDeleted = 0;
        do {
          const { data: batch } = await sb
            .from('uptime_logs')
            .select('id')
            .eq('project_id', project.id)
            .lt('checked_at', cutoffISO)
            .limit(5000);

          if (!batch || batch.length === 0) break;

          const ids = batch.map((r: { id: string }) => r.id);
          const { error: delErr } = await sb
            .from('uptime_logs')
            .delete()
            .in('id', ids);

          if (delErr) {
            console.error(`Error deleting logs for project ${project.name}:`, delErr);
            break;
          }

          batchDeleted = ids.length;
          deletedTotal += batchDeleted;
        } while (batchDeleted === 5000);

        totalPurged += deletedTotal;
        details.push({
          project: project.name,
          retention_days: retentionDays,
          deleted: deletedTotal,
        });
      }
    }

    const result = {
      purged: totalPurged,
      projects: projects.length,
      details,
      executed_at: new Date().toISOString(),
    };

    console.log('Cleanup completed:', JSON.stringify(result));

    return new Response(JSON.stringify(result), { headers: cors });
  } catch (err) {
    console.error('cleanup-old-logs error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: cors },
    );
  }
});
