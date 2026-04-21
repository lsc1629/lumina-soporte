// supabase/functions/notify-incident/index.ts
// Notifica a admin + cliente dueño del proyecto cuando cambia el estado de un incidente (manual o automático).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const statusLabels: Record<string, string> = {
  investigating: 'Investigando',
  identified: 'Identificado',
  monitoring: 'Monitoreando',
  resolved: 'Resuelto',
};

const statusEmojis: Record<string, string> = {
  investigating: '🔴',
  identified: '🟠',
  monitoring: '🟡',
  resolved: '🟢',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { incidentId, newStatus, changedBy } = await req.json() as {
      incidentId: string;
      newStatus: string;
      changedBy?: string;
    };

    if (!incidentId || !newStatus) {
      throw new Error('incidentId y newStatus son requeridos');
    }

    // Fetch incident with project info
    const { data: incident, error: incErr } = await sb
      .from('incidents')
      .select('id, incident_number, title, status, priority, project_id, started_at')
      .eq('id', incidentId)
      .single();

    if (incErr || !incident) throw new Error('Incidente no encontrado');

    // Fetch project for name and owner
    let projectName = 'Sin proyecto';
    let projectUrl = '';
    let ownerId: string | null = null;

    if (incident.project_id) {
      const { data: project } = await sb
        .from('projects')
        .select('name, url, owner_id')
        .eq('id', incident.project_id)
        .single();
      if (project) {
        projectName = project.name;
        projectUrl = project.url || '';
        ownerId = project.owner_id;
      }
    }

    // Get admin emails
    const { data: admins } = await sb.from('profiles').select('id').eq('role', 'admin');
    const adminEmails: string[] = [];
    for (const admin of (admins || [])) {
      const { data: user } = await sb.auth.admin.getUserById(admin.id);
      if (user?.user?.email) adminEmails.push(user.user.email);
    }

    // Get owner email
    let ownerEmail: string | null = null;
    if (ownerId) {
      const { data: user } = await sb.auth.admin.getUserById(ownerId);
      ownerEmail = user?.user?.email || null;
    }

    const recipients = [...new Set([...adminEmails, ...(ownerEmail ? [ownerEmail] : [])])];

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'No recipients found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get who made the change
    let changedByName = 'Sistema';
    if (changedBy) {
      const { data: profile } = await sb.from('profiles').select('full_name').eq('id', changedBy).single();
      if (profile?.full_name) changedByName = profile.full_name;
    }

    const emoji = statusEmojis[newStatus] || '🔵';
    const label = statusLabels[newStatus] || newStatus;
    const subject = `${emoji} Incidente ${incident.incident_number} — ${label} — ${projectName}`;

    const body = [
      `Incidente: ${incident.incident_number}`,
      `Título: ${incident.title}`,
      `Proyecto: ${projectName}${projectUrl ? ` (${projectUrl})` : ''}`,
      ``,
      `Estado actualizado a: ${label}`,
      `Actualizado por: ${changedByName}`,
      ``,
      newStatus === 'resolved'
        ? `El incidente ha sido marcado como resuelto.`
        : `El equipo está trabajando en la resolución de este incidente.`,
      ``,
      `— LuminaSupport`,
    ].join('\n');

    // Send emails via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    let sent = 0;

    if (resendApiKey) {
      for (const email of recipients) {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'LuminaSupport <onboarding@resend.dev>',
              to: [email],
              subject,
              text: body,
            }),
          });
          if (res.ok) sent++;
          else console.error(`Resend error for ${email}:`, await res.text());
        } catch (e) {
          console.error(`Email send error for ${email}:`, e instanceof Error ? e.message : e);
        }
      }
    }

    // Log alerts
    if (incident.project_id) {
      for (const email of recipients) {
        try {
          await sb.from('alert_log').insert({
            project_id: incident.project_id,
            alert_type: `incident_${newStatus}`,
            recipient_email: email,
            subject,
          });
        } catch { /* alert_log is optional */ }
      }
    }

    // Create in-app notification for the project owner (client)
    if (ownerId) {
      try {
        await sb.from('notifications').insert({
          user_id: ownerId,
          type: 'incident',
          title: `Incidente ${incident.incident_number}: ${label}`,
          message: `${incident.title} — ${projectName}`,
          project_id: incident.project_id,
        });
      } catch { /* notifications table may not exist yet */ }
    }

    return new Response(JSON.stringify({ sent, recipients: recipients.length }), {
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
