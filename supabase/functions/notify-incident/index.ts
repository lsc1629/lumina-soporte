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

    // Get admin emails + check their notification preferences
    const { data: admins } = await sb.from('profiles').select('id').eq('role', 'admin');
    const adminEmails: string[] = [];
    for (const admin of (admins || [])) {
      // Check admin preference for this incident type
      const { data: prefs } = await sb.from('notification_preferences').select('admin_notify_incidents, email_incidents').eq('user_id', admin.id).single();
      const wantsIncident = prefs ? (prefs.admin_notify_incidents ?? prefs.email_incidents ?? true) : true;
      if (!wantsIncident) continue;
      const { data: user } = await sb.auth.admin.getUserById(admin.id);
      if (user?.user?.email) adminEmails.push(user.user.email);
    }

    // Get owner email — only if client_notify_incidents is enabled in admin preferences
    let ownerEmail: string | null = null;
    if (ownerId) {
      // Check global admin preference for notifying clients about incidents
      const { data: adminsAll } = await sb.from('profiles').select('id').eq('role', 'admin');
      let clientNotifyEnabled = false;
      for (const admin of (adminsAll || [])) {
        const { data: prefs } = await sb.from('notification_preferences').select('client_notify_incidents').eq('user_id', admin.id).single();
        if (prefs?.client_notify_incidents) { clientNotifyEnabled = true; break; }
      }
      if (clientNotifyEnabled) {
        const { data: user } = await sb.auth.admin.getUserById(ownerId);
        ownerEmail = user?.user?.email || null;
      }
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

    const statusColors: Record<string, { color: string; bg: string; border: string }> = {
      investigating: { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)' },
      identified:   { color: '#fb923c', bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.3)'  },
      monitoring:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.3)'  },
      resolved:     { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.3)'  },
    };
    const sc = statusColors[newStatus] || { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.3)' };

    const priorityLabels: Record<string, string> = { critical: 'Crítica', high: 'Alta', medium: 'Media', low: 'Baja' };
    const priorityColors: Record<string, string> = { critical: '#f87171', high: '#fb923c', medium: '#fbbf24', low: '#4ade80' };
    const priorityLabel = priorityLabels[incident.priority] || incident.priority || 'Media';
    const priorityColor = priorityColors[incident.priority] || '#fbbf24';

    const dateStr = new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const startedStr = incident.started_at
      ? new Date(incident.started_at).toLocaleString('es-CL', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';

    const bodyMessage = newStatus === 'resolved'
      ? 'El incidente ha sido revisado, gestionado y marcado como <strong style="color:#4ade80;">resuelto</strong>. Tu sitio está operando con normalidad.'
      : newStatus === 'monitoring'
        ? 'El incidente ha sido identificado y estamos monitoreando la situación de cerca para confirmar su estabilidad.'
        : newStatus === 'identified'
          ? 'Hemos identificado la causa del problema y nuestro equipo está trabajando activamente en la solución.'
          : 'Hemos detectado un incidente en tu sitio y estamos investigando la causa. Te mantendremos informado.';

    const htmlBody = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <div style="margin-bottom:6px;">
        <span style="font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.5px;">Lumina<span style="color:#a78bfa;">Support</span></span>
      </div>
      <p style="color:#a78bfa;font-size:11px;margin:0 0 4px;font-weight:500;">por Luis Salas Cortés</p>
      <p style="color:#666;font-size:12px;margin:0;">Notificación de Incidente</p>
    </div>

    <!-- Status Banner -->
    <div style="background:${sc.bg};border:1px solid ${sc.border};border-radius:16px;padding:24px;margin-bottom:24px;text-align:center;">
      <p style="font-size:36px;margin:0 0 8px;">${emoji}</p>
      <p style="color:${sc.color};font-size:20px;font-weight:800;margin:0 0 4px;letter-spacing:-0.3px;">${label}</p>
      <p style="color:#aaa;font-size:12px;margin:0;">Estado actualizado por <strong style="color:#fff;">${changedByName}</strong></p>
    </div>

    <!-- Incident Card -->
    <div style="background:#16162a;border:1px solid #2a2a4a;border-radius:16px;padding:24px;margin-bottom:20px;">
      <p style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 12px;font-weight:600;">Detalles del Incidente</p>

      <p style="color:#fff;font-size:18px;font-weight:700;margin:0 0 16px;line-height:1.4;">${incident.title}</p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
        <div style="background:#1e1e35;border-radius:10px;padding:14px;">
          <p style="color:#666;font-size:9px;text-transform:uppercase;letter-spacing:1px;margin:0 0 5px;">Número</p>
          <p style="color:#a78bfa;font-size:15px;font-weight:700;margin:0;">${incident.incident_number}</p>
        </div>
        <div style="background:#1e1e35;border-radius:10px;padding:14px;">
          <p style="color:#666;font-size:9px;text-transform:uppercase;letter-spacing:1px;margin:0 0 5px;">Prioridad</p>
          <p style="color:${priorityColor};font-size:15px;font-weight:700;margin:0;">${priorityLabel}</p>
        </div>
        <div style="background:#1e1e35;border-radius:10px;padding:14px;">
          <p style="color:#666;font-size:9px;text-transform:uppercase;letter-spacing:1px;margin:0 0 5px;">Proyecto</p>
          <p style="color:#fff;font-size:13px;font-weight:600;margin:0;">${projectName}</p>
          ${projectUrl ? `<p style="color:#666;font-size:10px;margin:3px 0 0;">${projectUrl}</p>` : ''}
        </div>
        <div style="background:#1e1e35;border-radius:10px;padding:14px;">
          <p style="color:#666;font-size:9px;text-transform:uppercase;letter-spacing:1px;margin:0 0 5px;">Inicio</p>
          <p style="color:#fff;font-size:12px;font-weight:600;margin:0;">${startedStr}</p>
        </div>
      </div>

      <!-- Message -->
      <div style="background:#1e1e35;border-left:3px solid ${sc.color};border-radius:0 10px 10px 0;padding:14px 16px;">
        <p style="color:#ccc;font-size:13px;line-height:1.7;margin:0;">${bodyMessage}</p>
      </div>
    </div>

    <!-- Status badge -->
    <div style="text-align:center;margin-bottom:28px;">
      <span style="display:inline-block;padding:10px 24px;border-radius:999px;font-size:13px;font-weight:700;background:${sc.bg};color:${sc.color};border:1px solid ${sc.border};">
        ${emoji} Estado actual: ${label}
      </span>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding-top:20px;border-top:1px solid #2a2a4a;">
      <p style="color:#666;font-size:12px;margin:0 0 6px;">¿Tienes dudas? Responde este correo y con gusto te ayudamos.</p>
      <p style="color:#444;font-size:10px;margin:0;">LuminaSupport · ${dateStr}</p>
    </div>

  </div>
</body>
</html>`;

    // Send emails via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFrom = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev';
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
              from: `LuminaSupport <${resendFrom}>`,
              to: [email],
              subject,
              html: htmlBody,
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
