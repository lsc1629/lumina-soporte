import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ArrowUpCircle,
  ArrowDownCircle,
  Clock,
  Loader2,
  Search,
  ChevronRight,
  Globe,
  Building2,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Calendar,
  Activity,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import LoadingScreen from './LoadingScreen';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface ClientInfo {
  id: string;
  full_name: string;
  email: string;
  company_name: string;
  project_count: number;
}

interface ProjectInfo {
  id: string;
  name: string;
  url: string;
  platform: string;
  status: string;
  statusReason?: string;
}

interface UptimeLog {
  checked_at: string;
  status: string;
  response_time_ms: number | null;
}

type ViewMode = 'clients' | 'projects' | 'detail';

export default function UptimeView() {
  const [viewMode, setViewMode] = useState<ViewMode>('clients');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientInfo | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedProject, setSelectedProject] = useState<ProjectInfo | null>(null);

  const [uptimeLogs, setUptimeLogs] = useState<UptimeLog[]>([]);
  const [uptimeStats, setUptimeStats] = useState({
    uptime24h: 0,
    uptime7d: 0,
    uptime30d: 0,
    avgResponse: 0,
    totalChecks: 0,
    downEvents: 0,
    lastDown: null as string | null,
    currentStreak: 0,
  });

  useEffect(() => { loadClients(); }, []);

  const loadClients = async () => {
    setLoading(true);
    setErrorMsg('');

    const { data: profiles, error: e1 } = await supabase
      .from('profiles')
      .select('id, full_name, email, company_name')
      .order('full_name');

    if (e1) { setErrorMsg(`Error cargando perfiles: ${e1.message}`); setLoading(false); return; }

    const { data: allProjects, error: e2 } = await supabase
      .from('projects')
      .select('id, owner_id')
      .eq('is_active', true);

    if (e2) { setErrorMsg(`Error cargando proyectos: ${e2.message}`); setLoading(false); return; }

    const projectsByOwner = new Map<string, number>();
    (allProjects || []).forEach(p => {
      projectsByOwner.set(p.owner_id, (projectsByOwner.get(p.owner_id) || 0) + 1);
    });

    setClients(
      (profiles || [])
        .filter(p => projectsByOwner.has(p.id))
        .map(p => ({
          id: p.id,
          full_name: p.full_name || 'Sin nombre',
          email: p.email || '',
          company_name: p.company_name || '',
          project_count: projectsByOwner.get(p.id) || 0,
        }))
    );
    setLoading(false);
  };

  const selectClient = async (client: ClientInfo) => {
    setSelectedClient(client);
    setLoading(true);
    setSearch('');

    const { data } = await supabase
      .from('projects')
      .select('id, name, url, platform, status')
      .eq('owner_id', client.id)
      .eq('is_active', true)
      .order('name');

    const projectList: ProjectInfo[] = (data || []).map(p => ({ ...p, statusReason: undefined }));

    // Fetch last status_reason for warning/down projects
    const warningProjects = projectList.filter(p => p.status === 'warning' || p.status === 'down');
    for (const wp of warningProjects) {
      const { data: lastLog } = await supabase
        .from('uptime_logs')
        .select('status_reason')
        .eq('project_id', wp.id)
        .not('status_reason', 'is', null)
        .order('checked_at', { ascending: false })
        .limit(1)
        .single();
      if (lastLog?.status_reason) wp.statusReason = lastLog.status_reason;
    }

    setProjects(projectList);
    setViewMode('projects');
    setLoading(false);
  };

  const selectProject = async (project: ProjectInfo) => {
    setSelectedProject(project);
    setLoading(true);
    setSearch('');

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: logs } = await supabase
      .from('uptime_logs')
      .select('checked_at, status, response_time_ms')
      .eq('project_id', project.id)
      .gte('checked_at', thirtyDaysAgo)
      .order('checked_at', { ascending: true });

    const allLogs = logs || [];
    setUptimeLogs(allLogs);

    // Calculate stats
    const calc = (hours: number) => {
      const cutoff = new Date(now.getTime() - hours * 60 * 60 * 1000);
      const filtered = allLogs.filter(l => new Date(l.checked_at) >= cutoff);
      if (filtered.length === 0) return 100;
      const up = filtered.filter(l => l.status === 'up' || l.status === 'warning').length;
      return Math.round((up / filtered.length) * 10000) / 100;
    };

    const responseTimes = allLogs.filter(l => l.response_time_ms && l.response_time_ms > 0).map(l => l.response_time_ms!);
    const avgResponse = responseTimes.length > 0 ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : 0;

    const downEvents = allLogs.filter(l => l.status === 'down').length;
    const lastDown = allLogs.filter(l => l.status === 'down').pop()?.checked_at || null;

    // Current uptime streak
    let streak = 0;
    for (let i = allLogs.length - 1; i >= 0; i--) {
      if (allLogs[i].status === 'up' || allLogs[i].status === 'warning') streak++;
      else break;
    }

    setUptimeStats({
      uptime24h: calc(24),
      uptime7d: calc(7 * 24),
      uptime30d: calc(30 * 24),
      avgResponse,
      totalChecks: allLogs.length,
      downEvents,
      lastDown,
      currentStreak: streak,
    });

    setViewMode('detail');
    setLoading(false);
  };

  const goBack = () => {
    setSearch('');
    if (viewMode === 'detail') {
      setViewMode('projects');
      setSelectedProject(null);
    } else if (viewMode === 'projects') {
      setViewMode('clients');
      setSelectedClient(null);
    }
  };

  // Build chart data: group by hour for last 24h or by day for 30d
  const chartData = (() => {
    if (uptimeLogs.length === 0) return [];
    const dayMap = new Map<string, { date: string; upCount: number; total: number; avgMs: number; msSum: number }>();
    uptimeLogs.forEach(l => {
      const d = new Date(l.checked_at).toISOString().split('T')[0];
      const entry = dayMap.get(d) || { date: d, upCount: 0, total: 0, avgMs: 0, msSum: 0 };
      entry.total++;
      if (l.status === 'up') entry.upCount++;
      if (l.response_time_ms) entry.msSum += l.response_time_ms;
      dayMap.set(d, entry);
    });
    return Array.from(dayMap.values()).map(e => ({
      date: e.date.slice(5),
      uptime: e.total > 0 ? Math.round((e.upCount / e.total) * 10000) / 100 : 100,
      response: e.total > 0 ? Math.round(e.msSum / e.total) : 0,
    }));
  })();

  // Uptime bars (last 30 days, 1 bar per day)
  const uptimeBars = (() => {
    const bars: { date: string; pct: number; status: 'up' | 'down' | 'warning' | 'no_data' }[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      const dayLogs = uptimeLogs.filter(l => l.checked_at.startsWith(dateStr));
      if (dayLogs.length === 0) {
        bars.push({ date: dateStr, pct: 100, status: 'no_data' });
      } else {
        const up = dayLogs.filter(l => l.status === 'up' || l.status === 'warning').length;
        const pct = Math.round((up / dayLogs.length) * 10000) / 100;
        bars.push({ date: dateStr, pct, status: pct === 100 ? 'up' : pct > 95 ? 'warning' : 'down' });
      }
    }
    return bars;
  })();

  const filteredClients = clients.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.url.toLowerCase().includes(search.toLowerCase())
  );

  const getUptimeColor = (pct: number) => {
    if (pct >= 99.9) return 'text-success';
    if (pct >= 99) return 'text-primary';
    if (pct >= 95) return 'text-warning';
    return 'text-danger';
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {viewMode !== 'clients' && (
            <button onClick={goBack} className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-surface text-text-muted transition-colors hover:bg-surface-hover hover:text-white border border-border">
              <ChevronRight size={20} className="rotate-180" />
            </button>
          )}
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-white">Uptime</h1>
            <p className="text-sm text-text-muted">
              {viewMode === 'clients' && 'Monitoreo de disponibilidad de sitios.'}
              {viewMode === 'projects' && `Proyectos de ${selectedClient?.full_name}`}
              {viewMode === 'detail' && `Detalle de uptime: ${selectedProject?.name}`}
            </p>
          </div>
        </div>
        {viewMode !== 'detail' && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
            <Search size={16} className="text-text-muted" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="w-56 bg-transparent text-sm text-white placeholder-text-muted outline-none" />
          </div>
        )}
      </div>

      {/* Intro */}
      {viewMode === 'clients' && (
        <div className="glass-panel rounded-2xl p-5 border-l-4 border-l-success">
          <div className="flex items-start gap-3">
            <Activity size={20} className="text-success mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-text-muted leading-relaxed">
                Aquí puedes monitorear la <strong className="text-white">disponibilidad (uptime)</strong> de cada sitio en tiempo real. Selecciona un cliente para ver el estado de sus proyectos: porcentaje de uptime en las últimas 24h, 7 y 30 días, tiempo de respuesta promedio, eventos de caída, racha actual de disponibilidad y un gráfico histórico de los últimos 30 días.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      {viewMode !== 'clients' && (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <button onClick={() => { setViewMode('clients'); setSelectedClient(null); setSearch(''); }} className="cursor-pointer hover:text-primary transition-colors">Clientes</button>
          <ChevronRight size={14} />
          {selectedClient && (
            <>
              <button onClick={() => { if (viewMode === 'detail') goBack(); }} className={`${viewMode === 'detail' ? 'cursor-pointer hover:text-primary' : 'text-white font-medium'} transition-colors`}>
                {selectedClient.full_name}
              </button>
              {viewMode === 'detail' && selectedProject && (
                <>
                  <ChevronRight size={14} />
                  <span className="text-white font-medium">{selectedProject.name}</span>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Error message */}
      {errorMsg && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          <p>{errorMsg}</p>
        </div>
      )}

      {/* Clients */}
      {viewMode === 'clients' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel overflow-hidden rounded-2xl">
          {filteredClients.length === 0 ? (
            <div className="p-12 text-center text-text-muted text-sm">No hay clientes con proyectos.</div>
          ) : (
            <div className="divide-y divide-border">
              {filteredClients.map((client, i) => (
                <motion.button
                  key={client.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => selectClient(client)}
                  className="flex w-full cursor-pointer items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-surface-hover"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-base">
                      {client.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-white">{client.full_name}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-text-muted">{client.email}</span>
                        {client.company_name && <span className="flex items-center gap-1 text-xs text-text-muted"><Building2 size={10} /> {client.company_name}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-text-muted">{client.project_count} proyecto{client.project_count !== 1 ? 's' : ''}</span>
                    <ChevronRight size={18} className="text-text-muted" />
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Projects */}
      {viewMode === 'projects' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project, i) => (
              <motion.button
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => selectProject(project)}
                className="glass-panel cursor-pointer rounded-2xl p-5 text-left transition-all hover:border-primary/50"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    project.status === 'up' ? 'bg-success/10 text-success' :
                    project.status === 'down' ? 'bg-danger/10 text-danger' :
                    'bg-warning/10 text-warning'
                  }`}>
                    {project.status === 'up' ? <ArrowUpCircle size={20} /> :
                     project.status === 'down' ? <ArrowDownCircle size={20} /> :
                     <AlertTriangle size={20} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display font-semibold text-white truncate">{project.name}</h3>
                    <p className="text-xs text-text-muted truncate">{project.url}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <span className={`text-xs font-semibold uppercase ${
                      project.status === 'up' ? 'text-success' :
                      project.status === 'down' ? 'text-danger' :
                      'text-warning'
                    }`}>
                      {project.status === 'up' ? 'En Línea' : project.status === 'down' ? 'Caído' : 'Advertencia'}
                    </span>
                    {project.statusReason && (
                      <p className="text-[10px] text-text-muted mt-0.5 leading-tight truncate">{project.statusReason}</p>
                    )}
                  </div>
                  <ChevronRight size={16} className="text-text-muted shrink-0" />
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Detail */}
      {viewMode === 'detail' && selectedProject && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="glass-panel rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <ArrowUpCircle size={16} className="text-success" />
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Uptime 24h</span>
              </div>
              <p className={`font-display text-3xl font-bold ${getUptimeColor(uptimeStats.uptime24h)}`}>{uptimeStats.uptime24h}%</p>
            </div>
            <div className="glass-panel rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={16} className="text-primary" />
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Uptime 7d</span>
              </div>
              <p className={`font-display text-3xl font-bold ${getUptimeColor(uptimeStats.uptime7d)}`}>{uptimeStats.uptime7d}%</p>
            </div>
            <div className="glass-panel rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={16} className="text-secondary" />
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Uptime 30d</span>
              </div>
              <p className={`font-display text-3xl font-bold ${getUptimeColor(uptimeStats.uptime30d)}`}>{uptimeStats.uptime30d}%</p>
            </div>
            <div className="glass-panel rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Clock size={16} className="text-accent" />
                <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Resp. Promedio</span>
              </div>
              <p className="font-display text-3xl font-bold text-white">{uptimeStats.avgResponse}<span className="text-sm text-text-muted ml-1">ms</span></p>
            </div>
          </div>

          {/* Extra stats row */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="glass-panel rounded-xl p-4 flex items-center gap-3">
              <Activity size={18} className="text-primary shrink-0" />
              <div>
                <p className="text-xs text-text-muted">Checks totales</p>
                <p className="font-display text-lg font-bold text-white">{uptimeStats.totalChecks.toLocaleString()}</p>
              </div>
            </div>
            <div className="glass-panel rounded-xl p-4 flex items-center gap-3">
              <ArrowDownCircle size={18} className="text-danger shrink-0" />
              <div>
                <p className="text-xs text-text-muted">Eventos de caída</p>
                <p className="font-display text-lg font-bold text-danger">{uptimeStats.downEvents}</p>
              </div>
            </div>
            <div className="glass-panel rounded-xl p-4 flex items-center gap-3">
              <CheckCircle2 size={18} className="text-success shrink-0" />
              <div>
                <p className="text-xs text-text-muted">Racha actual</p>
                <p className="font-display text-lg font-bold text-success">{uptimeStats.currentStreak} checks</p>
              </div>
            </div>
            <div className="glass-panel rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle size={18} className="text-warning shrink-0" />
              <div>
                <p className="text-xs text-text-muted">Última caída</p>
                <p className="text-sm font-medium text-white">{uptimeStats.lastDown ? new Date(uptimeStats.lastDown).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Nunca'}</p>
              </div>
            </div>
          </div>

          {/* Uptime Bars (30 days) */}
          <div className="glass-panel rounded-2xl p-6">
            <h3 className="font-display text-lg font-semibold text-white mb-4">Disponibilidad últimos 30 días</h3>
            <div className="flex items-end gap-1 h-16">
              {uptimeBars.map((bar, i) => (
                <div key={i} className="flex-1 group relative">
                  <div
                    className={`w-full rounded-sm transition-all cursor-default ${
                      bar.status === 'up' ? 'bg-success hover:bg-success/80' :
                      bar.status === 'warning' ? 'bg-warning hover:bg-warning/80' :
                      bar.status === 'down' ? 'bg-danger hover:bg-danger/80' :
                      'bg-surface-hover hover:bg-border'
                    }`}
                    style={{ height: bar.status === 'no_data' ? '25%' : `${Math.max(25, bar.pct)}%` }}
                  />
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-10">
                    <div className="rounded-lg bg-surface border border-border px-3 py-2 text-xs whitespace-nowrap shadow-xl">
                      <p className="font-medium text-white">{bar.date}</p>
                      <p className="text-text-muted">{bar.status === 'no_data' ? 'Sin datos' : `${bar.pct}%`}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 text-[10px] text-text-muted">
              <span>30 días atrás</span>
              <span>Hoy</span>
            </div>
          </div>

          {/* Response Time Chart */}
          {chartData.length > 0 && (
            <div className="glass-panel rounded-2xl p-6">
              <h3 className="font-display text-lg font-semibold text-white mb-4">Tiempo de Respuesta (ms)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="uptimeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} unit="ms" />
                    <Tooltip
                      contentStyle={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: '8px', fontSize: '12px' }}
                      labelStyle={{ color: '#fff' }}
                      itemStyle={{ color: '#a78bfa' }}
                    />
                    <Area type="monotone" dataKey="response" stroke="var(--color-primary)" fill="url(#uptimeGrad)" strokeWidth={2} name="Resp. (ms)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
