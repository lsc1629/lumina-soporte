import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  MessageSquare,
  Wrench,
  Search,
  Loader2,
  Plus,
  Eye,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import LoadingScreen from './LoadingScreen';

interface Incident {
  id: string;
  incident_number: string;
  title: string;
  status: string;
  priority: string;
  started_at: string;
  resolved_at: string | null;
  duration_minutes: number | null;
  is_auto_detected: boolean;
  project: { name: string } | null;
  assigned_profile: { full_name: string } | null;
  timeline_count: number;
}

interface IncidentsViewProps {
  onViewDetails: (id: string) => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `Hace ${days}d`;
}

function formatDuration(mins: number | null, startedAt: string, resolvedAt: string | null): string {
  if (mins) {
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }
  if (!resolvedAt) {
    const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
    if (elapsed < 60) return `${elapsed}m`;
    return `${Math.floor(elapsed / 60)}h ${elapsed % 60}m`;
  }
  return '-';
}

export default function IncidentsView({ onViewDetails }: IncidentsViewProps) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [newIncident, setNewIncident] = useState({ project_id: '', title: '', description: '', priority: 'medium' });
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => { loadIncidents(); }, []);

  const loadIncidents = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('incidents')
      .select('id, incident_number, title, status, priority, started_at, resolved_at, duration_minutes, is_auto_detected, project_id, assigned_to')
      .order('started_at', { ascending: false });

    if (data) {
      // Fetch project names and profile names in bulk
      const projectIds = [...new Set(data.map(i => i.project_id).filter(Boolean))];
      const assignedIds = [...new Set(data.map(i => i.assigned_to).filter(Boolean))] as string[];

      const [projectsRes, profilesRes] = await Promise.all([
        projectIds.length > 0
          ? supabase.from('projects').select('id, name').in('id', projectIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        assignedIds.length > 0
          ? supabase.from('profiles').select('id, full_name').in('id', assignedIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      ]);

      const projectMap = new Map((projectsRes.data || []).map(p => [p.id, p.name]));
      const profileMap = new Map((profilesRes.data || []).map(p => [p.id, p.full_name]));

      const withDetails = await Promise.all(
        data.map(async (inc) => {
          const { count } = await supabase
            .from('incident_timeline')
            .select('*', { count: 'exact', head: true })
            .eq('incident_id', inc.id);
          return {
            id: inc.id,
            incident_number: inc.incident_number,
            title: inc.title,
            status: inc.status,
            priority: inc.priority,
            started_at: inc.started_at,
            resolved_at: inc.resolved_at,
            duration_minutes: inc.duration_minutes,
            is_auto_detected: inc.is_auto_detected,
            project: inc.project_id ? { name: projectMap.get(inc.project_id) || 'Desconocido' } : null,
            assigned_profile: inc.assigned_to ? { full_name: profileMap.get(inc.assigned_to) || 'Sin asignar' } : null,
            timeline_count: count || 0,
          } as Incident;
        })
      );
      setIncidents(withDetails);
    }
    setLoading(false);
  };

  const openNewForm = async () => {
    const { data } = await supabase.from('projects').select('id, name').eq('is_active', true).order('name');
    if (data) setProjects(data);
    setShowNewForm(true);
  };

  const createIncident = async () => {
    if (!newIncident.project_id || !newIncident.title.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('incidents').insert({
      project_id: newIncident.project_id,
      reported_by: user?.id,
      assigned_to: user?.id,
      title: newIncident.title.trim(),
      description: newIncident.description,
      priority: newIncident.priority,
    });
    setSaving(false);
    setShowNewForm(false);
    setNewIncident({ project_id: '', title: '', description: '', priority: 'medium' });
    loadIncidents();
  };

  const stats = {
    open: incidents.filter(i => i.status === 'investigating' || i.status === 'identified').length,
    monitoring: incidents.filter(i => i.status === 'monitoring').length,
    resolved7d: incidents.filter(i => i.status === 'resolved' && new Date(i.resolved_at || i.started_at).getTime() > Date.now() - 7 * 86400000).length,
    avgMttr: (() => {
      const resolved = incidents.filter(i => i.duration_minutes && i.duration_minutes > 0);
      if (resolved.length === 0) return '—';
      const avg = Math.round(resolved.reduce((a, b) => a + (b.duration_minutes || 0), 0) / resolved.length);
      return avg < 60 ? `${avg}m` : `${Math.floor(avg / 60)}h ${avg % 60}m`;
    })(),
  };

  const filtered = incidents.filter(i =>
    i.title.toLowerCase().includes(search.toLowerCase()) ||
    i.incident_number.toLowerCase().includes(search.toLowerCase()) ||
    (i.project as any)?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedIncidents = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">Incidentes</h1>
          <p className="text-sm text-text-muted">Gestión reactiva y notificaciones de caídas.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
            <Search size={16} className="text-text-muted" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar incidente..." className="w-48 bg-transparent text-sm text-white placeholder-text-muted outline-none" />
          </div>
          <button onClick={openNewForm} className="flex items-center gap-2 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-danger/90 shadow-lg shadow-danger/20">
            <Plus size={16} />
            Reportar Incidente
          </button>
        </div>
      </div>

      {showNewForm && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-2xl p-6 space-y-4">
          <h3 className="font-display text-lg font-semibold text-white">Nuevo Incidente</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-muted">Proyecto *</label>
              <select value={newIncident.project_id} onChange={e => setNewIncident(n => ({ ...n, project_id: e.target.value }))} className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary">
                <option value="">Seleccionar...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-muted">Prioridad</label>
              <select value={newIncident.priority} onChange={e => setNewIncident(n => ({ ...n, priority: e.target.value }))} className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary">
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="critical">Crítica</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-muted">Título *</label>
            <input type="text" value={newIncident.title} onChange={e => setNewIncident(n => ({ ...n, title: e.target.value }))} placeholder="Ej: Sitio caído - Error 502" className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-muted">Descripción</label>
            <textarea value={newIncident.description} onChange={e => setNewIncident(n => ({ ...n, description: e.target.value }))} rows={3} placeholder="Detalles del incidente..." className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary resize-none" />
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowNewForm(false)} className="rounded-lg px-4 py-2 text-sm text-text-muted hover:text-white">Cancelar</button>
            <button onClick={createIncident} disabled={saving} className="flex items-center gap-2 rounded-lg bg-danger px-6 py-2 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-70">
              {saving ? <Loader2 size={14} className="animate-spin" /> : null} Crear Incidente
            </button>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Abiertos', value: String(stats.open), color: 'text-danger' },
          { label: 'Monitoreando', value: String(stats.monitoring), color: 'text-warning' },
          { label: 'Resueltos (7d)', value: String(stats.resolved7d), color: 'text-success' },
          { label: 'MTTR Promedio', value: stats.avgMttr, color: 'text-primary' },
        ].map((stat, i) => (
          <div key={i} className="glass-panel rounded-xl p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{stat.label}</p>
            <p className={`mt-2 font-display text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="glass-panel overflow-hidden rounded-2xl">
        <div className="border-b border-border bg-surface/50 px-6 py-4">
          <h3 className="font-display text-lg font-semibold text-white">Historial de Incidentes</h3>
        </div>
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-text-muted text-sm">
            {search ? 'No se encontraron incidentes.' : 'No hay incidentes registrados.'}
          </div>
        ) : (
          <>
          <div className="divide-y divide-border">
            {paginatedIncidents.map((incident, index) => {
              const projectName = (incident.project as any)?.name || 'Sin proyecto';
              const assigneeName = (incident.assigned_profile as any)?.full_name || 'Sin asignar';
              return (
                <motion.div
                  key={incident.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="flex flex-col gap-4 p-6 transition-colors hover:bg-surface-hover sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-4">
                    <div className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${incident.status === 'investigating' || incident.status === 'identified' ? 'bg-danger/10 text-danger animate-pulse' : incident.status === 'monitoring' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
                      {incident.status === 'investigating' || incident.status === 'identified' ? <AlertTriangle size={20} /> : incident.status === 'monitoring' ? <Wrench size={20} /> : <CheckCircle2 size={20} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-text-muted">{incident.incident_number}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${incident.priority === 'critical' ? 'bg-danger/20 text-danger border border-danger/30' : incident.priority === 'high' ? 'bg-warning/20 text-warning border border-warning/30' : incident.priority === 'medium' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-surface-hover text-text-muted border border-border'}`}>
                          {incident.priority}
                        </span>
                        {incident.is_auto_detected && (
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">Auto</span>
                        )}
                      </div>
                      <h4 className="mt-1 font-display text-base font-semibold text-white">{incident.title}</h4>
                      <p className="mt-1 text-sm text-text-muted">{projectName}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-6 sm:justify-end">
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                      <Clock size={14} />
                      <span>{timeAgo(incident.started_at)} ({formatDuration(incident.duration_minutes, incident.started_at, incident.resolved_at)})</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface border border-border text-xs font-medium text-white">
                        {assigneeName.charAt(0)}
                      </div>
                      <span>{assigneeName}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-text-muted">
                      <MessageSquare size={14} />
                      <span>{incident.timeline_count}</span>
                    </div>
                    <button 
                      onClick={() => onViewDetails(incident.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary hover:text-white hover:border-primary"
                    >
                      <Eye size={14} />
                      Ver Detalles
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              <p className="text-sm text-text-muted">
                Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} de {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface text-text-muted transition-colors hover:bg-surface-hover hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                      page === currentPage
                        ? 'bg-primary text-white'
                        : 'border border-border bg-surface text-text-muted hover:bg-surface-hover hover:text-white'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface text-text-muted transition-colors hover:bg-surface-hover hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}
