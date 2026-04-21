import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  ArrowLeft, 
  AlertTriangle, 
  Clock, 
  MessageSquare,
  User,
  Activity,
  CheckCircle2,
  RefreshCw,
  Globe,
  Loader2,
  Send
} from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import LoadingScreen from './LoadingScreen';

interface IncidentData {
  id: string;
  incident_number: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  started_at: string;
  resolved_at: string | null;
  duration_minutes: number | null;
  root_cause: string;
  resolution: string;
  project: { name: string; url: string } | null;
  assigned_profile: { full_name: string } | null;
  reported_profile: { full_name: string } | null;
}

interface TimelineEvent {
  id: string;
  event_type: string;
  message: string;
  created_at: string;
  user: { full_name: string } | null;
}

interface IncidentDetailsViewProps {
  incidentId: string | null;
  onBack: () => void;
}

const statusLabels: Record<string, string> = { investigating: 'Investigando', identified: 'Identificado', monitoring: 'Monitoreando', resolved: 'Resuelto' };
const priorityLabels: Record<string, string> = { critical: 'Crítica', high: 'Alta', medium: 'Media', low: 'Baja' };

function formatElapsed(startedAt: string, resolvedAt: string | null, durationMins: number | null): string {
  if (durationMins) return durationMins < 60 ? `${durationMins}m` : `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`;
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
  return elapsed < 60 ? `${elapsed}m` : `${Math.floor(elapsed / 60)}h ${elapsed % 60}m`;
}

export default function IncidentDetailsView({ incidentId, onBack }: IncidentDetailsViewProps) {
  const [incident, setIncident] = useState<IncidentData | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => { if (incidentId) load(); }, [incidentId]);

  const load = async () => {
    setLoading(true);

    // Load incident without JOINs to avoid inner join filtering
    const [{ data: inc }, { data: tl }] = await Promise.all([
      supabase
        .from('incidents')
        .select('id, incident_number, title, description, status, priority, started_at, resolved_at, duration_minutes, root_cause, resolution, project_id, assigned_to, reported_by')
        .eq('id', incidentId!)
        .single(),
      supabase
        .from('incident_timeline')
        .select('id, event_type, message, created_at, user_id')
        .eq('incident_id', incidentId!)
        .order('created_at', { ascending: true }),
    ]);

    if (inc) {
      // Fetch related data separately
      const ids = [inc.project_id, inc.assigned_to, inc.reported_by].filter(Boolean) as string[];
      const uniqueProfileIds = [...new Set([inc.assigned_to, inc.reported_by].filter(Boolean))] as string[];

      const [projectRes, profilesRes] = await Promise.all([
        inc.project_id
          ? supabase.from('projects').select('name, url').eq('id', inc.project_id).single()
          : Promise.resolve({ data: null }),
        uniqueProfileIds.length > 0
          ? supabase.from('profiles').select('id, full_name').in('id', uniqueProfileIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      ]);

      const profileMap = new Map((profilesRes.data || []).map(p => [p.id, p.full_name]));

      setIncident({
        id: inc.id,
        incident_number: inc.incident_number,
        title: inc.title,
        description: inc.description || '',
        status: inc.status,
        priority: inc.priority,
        started_at: inc.started_at,
        resolved_at: inc.resolved_at,
        duration_minutes: inc.duration_minutes,
        root_cause: inc.root_cause || '',
        resolution: inc.resolution || '',
        project: projectRes.data ? { name: projectRes.data.name, url: projectRes.data.url } : null,
        assigned_profile: inc.assigned_to ? { full_name: profileMap.get(inc.assigned_to) || 'Sin asignar' } : null,
        reported_profile: inc.reported_by ? { full_name: profileMap.get(inc.reported_by) || 'Desconocido' } : null,
      });
    }

    if (tl) {
      // Fetch timeline user names
      const userIds = [...new Set(tl.map(t => t.user_id).filter(Boolean))] as string[];
      const { data: users } = userIds.length > 0
        ? await supabase.from('profiles').select('id, full_name').in('id', userIds)
        : { data: [] as { id: string; full_name: string }[] };
      const userMap = new Map((users || []).map(u => [u.id, u.full_name]));

      setTimeline(tl.map(t => ({
        id: t.id,
        event_type: t.event_type,
        message: t.message,
        created_at: t.created_at,
        user: t.user_id ? { full_name: userMap.get(t.user_id) || '' } : null,
      })));
    }

    setLoading(false);
  };

  const addTimelineEntry = async () => {
    if (!newMessage.trim() || !incidentId) return;
    setSending(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from('incident_timeline')
      .insert({ incident_id: incidentId, user_id: user?.id, event_type: 'note', message: newMessage.trim() })
      .select('*, user:profiles(full_name)')
      .single();
    if (data) setTimeline(prev => [...prev, data as unknown as TimelineEvent]);
    setNewMessage('');
    setSending(false);
  };

  const changeStatus = async (newStatus: string) => {
    if (!incidentId || !incident) return;
    setUpdating(true);
    const updateData: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
      updateData.duration_minutes = Math.floor((Date.now() - new Date(incident.started_at).getTime()) / 60000);
    }
    await supabase.from('incidents').update(updateData).eq('id', incidentId);

    const { data: { user } } = await supabase.auth.getUser();
    const { data: entry } = await supabase
      .from('incident_timeline')
      .insert({ incident_id: incidentId, user_id: user?.id, event_type: 'status_change', message: `Estado cambiado a: ${statusLabels[newStatus] || newStatus}` })
      .select('*, user:profiles(full_name)')
      .single();
    if (entry) setTimeline(prev => [...prev, entry as unknown as TimelineEvent]);

    // Notify admin + client via Edge Function (fire-and-forget)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      fetch(`${SUPABASE_URL}/functions/v1/notify-incident`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ incidentId, newStatus, changedBy: user?.id }),
      });
    } catch { /* notification is best-effort */ }

    setIncident(prev => prev ? { ...prev, status: newStatus, ...(newStatus === 'resolved' ? { resolved_at: new Date().toISOString(), duration_minutes: Math.floor((Date.now() - new Date(prev.started_at).getTime()) / 60000) } : {}) } : prev);
    setUpdating(false);

    // Refresh sidebar badges immediately
    window.dispatchEvent(new CustomEvent('badges:refresh'));
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (!incident) {
    return (
      <div className="space-y-6">
        <button onClick={onBack} className="flex items-center gap-2 text-text-muted hover:text-white"><ArrowLeft size={20} /> Volver</button>
        <div className="glass-panel rounded-2xl p-12 text-center text-text-muted">Incidente no encontrado.</div>
      </div>
    );
  }

  const projectName = (incident.project as any)?.name || 'Sin proyecto';
  const projectUrl = (incident.project as any)?.url || '';
  const assigneeName = (incident.assigned_profile as any)?.full_name || 'Sin asignar';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button 
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-text-muted transition-colors hover:bg-surface-hover hover:text-white border border-border"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-bold tracking-tight text-white">Detalles del Incidente</h1>
            <span className="rounded-full bg-surface-hover px-3 py-1 text-xs font-mono font-bold text-text-muted border border-border">
              {incident.incident_number}
            </span>
          </div>
          <p className="text-sm text-text-muted">Análisis y resolución en tiempo real.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="col-span-1 lg:col-span-2 space-y-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-2xl p-6 lg:p-8 relative overflow-hidden"
          >
            {(incident.status === 'investigating' || incident.status === 'identified') && (
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-danger via-warning to-danger animate-pulse"></div>
            )}
            
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="font-display text-2xl font-bold text-white mb-2">{incident.title}</h2>
                <div className="flex items-center gap-2 text-sm text-text-muted">
                  <Globe size={16} className="text-primary" />
                  <span className="font-medium text-white">{projectName}</span>
                  {projectUrl && <span className="opacity-50">({projectUrl})</span>}
                </div>
              </div>
              
              <div className="flex flex-col items-end gap-2">
                <span className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${incident.status === 'investigating' || incident.status === 'identified' ? 'bg-danger/20 text-danger border border-danger/30' : incident.status === 'monitoring' ? 'bg-warning/20 text-warning border border-warning/30' : 'bg-success/20 text-success border border-success/30'}`}>
                  {incident.status === 'investigating' || incident.status === 'identified' ? <AlertTriangle size={14} className="animate-pulse" /> : incident.status === 'monitoring' ? <Activity size={14} /> : <CheckCircle2 size={14} />}
                  {statusLabels[incident.status] || incident.status}
                </span>
                <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${incident.priority === 'critical' ? 'bg-danger/20 text-danger border border-danger/30' : incident.priority === 'high' ? 'bg-warning/20 text-warning border border-warning/30' : incident.priority === 'medium' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-surface-hover text-text-muted border border-border'}`}>
                  Prioridad: {priorityLabels[incident.priority] || incident.priority}
                </span>
              </div>
            </div>

            {incident.description && (
              <div className="bg-surface/50 rounded-xl p-4 border border-border mb-8">
                <h3 className="text-sm font-semibold text-white mb-2">Descripción del Problema</h3>
                <p className="text-sm text-text-muted leading-relaxed">{incident.description}</p>
              </div>
            )}

            <h3 className="font-display text-lg font-semibold text-white mb-4">Línea de Tiempo</h3>
            {timeline.length === 0 ? (
              <p className="text-sm text-text-muted">No hay entradas en la línea de tiempo aún.</p>
            ) : (
              <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                {timeline.map((item) => (
                  <div key={item.id} className="relative flex items-start gap-4 pl-12">
                    <div className="absolute left-0 flex items-center justify-center w-10 h-10 rounded-full border border-border bg-surface shrink-0 shadow-sm z-10">
                      {item.event_type === 'alert' ? <AlertTriangle size={16} className="text-danger" /> :
                       item.event_type === 'status_change' ? <Activity size={16} className="text-warning" /> :
                       item.event_type === 'notification' ? <MessageSquare size={16} className="text-primary" /> :
                       <RefreshCw size={16} className="text-success" />}
                    </div>
                    <div className="flex-1 bg-surface/30 p-4 rounded-xl border border-border hover:bg-surface-hover transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs font-bold text-primary">
                          {new Date(item.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {(item.user as any)?.full_name && (
                          <span className="text-xs text-text-muted">{(item.user as any).full_name}</span>
                        )}
                      </div>
                      <p className="text-sm text-text-muted">{item.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        <div className="col-span-1 space-y-6">
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="glass-panel rounded-2xl p-6"
          >
            <h3 className="font-display text-lg font-semibold text-white mb-4">Información Operativa</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-2 text-text-muted">
                  <Clock size={16} />
                  <span className="text-sm">Tiempo Transcurrido</span>
                </div>
                <span className="font-mono text-sm font-bold text-white">{formatElapsed(incident.started_at, incident.resolved_at, incident.duration_minutes)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-2 text-text-muted">
                  <User size={16} />
                  <span className="text-sm">Asignado a</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                    {assigneeName.charAt(0)}
                  </div>
                  <span className="text-sm font-medium text-white">{assigneeName}</span>
                </div>
              </div>
              {incident.status !== 'resolved' && (
                <div className="pt-2 space-y-2">
                  {incident.status === 'investigating' && (
                    <button onClick={() => changeStatus('identified')} disabled={updating} className="w-full rounded-lg bg-warning/10 px-4 py-2 text-sm font-medium text-warning transition-colors hover:bg-warning hover:text-white border border-warning/20 disabled:opacity-50">
                      Marcar como Identificado
                    </button>
                  )}
                  {(incident.status === 'investigating' || incident.status === 'identified') && (
                    <button onClick={() => changeStatus('monitoring')} disabled={updating} className="w-full rounded-lg bg-surface-hover px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-surface border border-border disabled:opacity-50">
                      Pasar a Monitoreando
                    </button>
                  )}
                  <button onClick={() => changeStatus('resolved')} disabled={updating} className="w-full flex items-center justify-center gap-2 rounded-lg bg-success/10 px-4 py-2 text-sm font-medium text-success transition-colors hover:bg-success hover:text-white border border-success/20 disabled:opacity-50">
                    {updating ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Marcar como Resuelto
                  </button>
                </div>
              )}
              {incident.status === 'resolved' && (
                <div className="pt-2 rounded-lg bg-success/10 p-3 text-center border border-success/20">
                  <CheckCircle2 size={20} className="mx-auto mb-1 text-success" />
                  <p className="text-sm font-medium text-success">Incidente Resuelto</p>
                  {incident.resolved_at && <p className="text-xs text-text-muted mt-1">{new Date(incident.resolved_at).toLocaleString('es-CL')}</p>}
                </div>
              )}
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-panel rounded-2xl p-6"
          >
            <h3 className="font-display text-lg font-semibold text-white mb-4">Agregar Nota</h3>
            <textarea 
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none h-24 mb-4"
              placeholder="Escribe una actualización o nota..."
            ></textarea>
            <button onClick={addTimelineEntry} disabled={sending || !newMessage.trim()} className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover shadow-lg shadow-primary/20 disabled:opacity-50">
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Agregar a Línea de Tiempo
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
