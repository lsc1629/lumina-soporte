import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Loader2,
  Search,
  ChevronRight,
  Globe,
  Building2,
  Gauge,
  Zap,
  Clock,
  TrendingUp,
  TrendingDown,
  Activity,
  Wifi,
  Server,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Puzzle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import LoadingScreen from './LoadingScreen';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

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
}

interface PerfLog {
  checked_at: string;
  response_time_ms: number | null;
  status: string;
}

type ViewMode = 'clients' | 'projects' | 'detail';

export default function PerformanceView() {
  const [viewMode, setViewMode] = useState<ViewMode>('clients');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientInfo | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectInfo | null>(null);
  const [perfLogs, setPerfLogs] = useState<PerfLog[]>([]);
  const [detailTab, setDetailTab] = useState<'metrics' | 'plugins'>('metrics');

  // Plugin performance analysis
  interface PluginPerf {
    name: string;
    slug: string;
    current_version: string;
    latest_version: string;
    is_active: boolean;
    plugin_type: string;
    author: string;
    outdated: boolean;
    impact: 'high' | 'medium' | 'low' | 'unknown';
    category: string;
    description: string;
    suggestion: string;
    flags: string[];
  }
  interface PluginSummary { total: number; outdated: number; high_impact: number; medium_impact: number; low_impact: number; unknown_impact: number; active: number; inactive: number; }
  const [pluginPerf, setPluginPerf] = useState<PluginPerf[]>([]);
  const [pluginSummary, setPluginSummary] = useState<PluginSummary | null>(null);
  const [pluginLoading, setPluginLoading] = useState(false);
  const [pluginError, setPluginError] = useState('');
  const [pluginFilter, setPluginFilter] = useState<'all' | 'outdated' | 'high' | 'medium' | 'low'>('all');
  const [pluginPage, setPluginPage] = useState(1);
  const PLUGINS_PER_PAGE = 10;

  useEffect(() => { loadClients(); }, []);

  const loadClients = async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, company_name')
      .order('full_name');

    const { data: allProjects } = await supabase
      .from('projects')
      .select('id, owner_id')
      .eq('is_active', true);

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
      .select('id, name, url, platform')
      .eq('owner_id', client.id)
      .eq('is_active', true)
      .order('name');
    setProjects(data || []);
    setViewMode('projects');
    setLoading(false);
  };

  const selectProject = async (project: ProjectInfo) => {
    setSelectedProject(project);
    setLoading(true);
    setSearch('');

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: logs } = await supabase
      .from('uptime_logs')
      .select('checked_at, response_time_ms, status')
      .eq('project_id', project.id)
      .gte('checked_at', thirtyDaysAgo)
      .order('checked_at', { ascending: true });

    setPerfLogs(logs || []);
    setViewMode('detail');
    setDetailTab('metrics');
    setLoading(false);
  };

  const loadPluginPerf = async (projectId: string) => {
    setPluginLoading(true);
    setPluginError('');
    setPluginPerf([]);
    setPluginSummary(null);
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const res = await fetch(`${SUPA_URL}/functions/v1/analyze-plugin-performance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_KEY}`, 'apikey': SUPA_KEY },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.error) setPluginError(data.error);
        setPluginPerf(data.plugins || []);
        setPluginSummary(data.summary || null);
      } else {
        setPluginError('Error al analizar plugins.');
      }
    } catch { setPluginError('Error de conexión.'); }
    setPluginLoading(false);
  };

  const goBack = () => {
    setSearch('');
    if (viewMode === 'detail') { setViewMode('projects'); setSelectedProject(null); }
    else if (viewMode === 'projects') { setViewMode('clients'); setSelectedClient(null); }
  };

  // Stats
  const validLogs = perfLogs.filter(l => l.response_time_ms && l.response_time_ms > 0);
  const responseTimes = validLogs.map(l => l.response_time_ms!);
  const avgResponse = responseTimes.length > 0 ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : 0;
  const minResponse = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
  const maxResponse = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
  const medianResponse = (() => {
    if (responseTimes.length === 0) return 0;
    const sorted = [...responseTimes].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  })();
  const p95Response = (() => {
    if (responseTimes.length === 0) return 0;
    const sorted = [...responseTimes].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.95)];
  })();
  const p99Response = (() => {
    if (responseTimes.length === 0) return 0;
    const sorted = [...responseTimes].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.99)];
  })();

  // Trend: compare last 7 days avg vs previous 7 days
  const now = Date.now();
  const last7 = validLogs.filter(l => new Date(l.checked_at).getTime() > now - 7 * 86400000).map(l => l.response_time_ms!);
  const prev7 = validLogs.filter(l => {
    const t = new Date(l.checked_at).getTime();
    return t > now - 14 * 86400000 && t <= now - 7 * 86400000;
  }).map(l => l.response_time_ms!);
  const avgLast7 = last7.length > 0 ? Math.round(last7.reduce((a, b) => a + b, 0) / last7.length) : 0;
  const avgPrev7 = prev7.length > 0 ? Math.round(prev7.reduce((a, b) => a + b, 0) / prev7.length) : 0;
  const trendPct = avgPrev7 > 0 ? Math.round(((avgLast7 - avgPrev7) / avgPrev7) * 100) : 0;

  // Chart: daily avg response time
  const dailyChart = (() => {
    const map = new Map<string, { sum: number; count: number }>();
    validLogs.forEach(l => {
      const d = new Date(l.checked_at).toISOString().split('T')[0];
      const e = map.get(d) || { sum: 0, count: 0 };
      e.sum += l.response_time_ms!;
      e.count++;
      map.set(d, e);
    });
    return Array.from(map.entries()).map(([date, v]) => ({
      date: date.slice(5),
      avg: Math.round(v.sum / v.count),
    }));
  })();

  // Distribution histogram
  const distribution = (() => {
    const buckets = [
      { label: '<200ms', min: 0, max: 200, count: 0 },
      { label: '200-500ms', min: 200, max: 500, count: 0 },
      { label: '500-1s', min: 500, max: 1000, count: 0 },
      { label: '1-2s', min: 1000, max: 2000, count: 0 },
      { label: '2-5s', min: 2000, max: 5000, count: 0 },
      { label: '>5s', min: 5000, max: Infinity, count: 0 },
    ];
    responseTimes.forEach(ms => {
      const b = buckets.find(b => ms >= b.min && ms < b.max);
      if (b) b.count++;
    });
    return buckets;
  })();

  const bucketColors = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444', '#dc2626'];

  const getSpeedRating = (ms: number): { label: string; color: string } => {
    if (ms < 300) return { label: 'Excelente', color: 'text-success' };
    if (ms < 600) return { label: 'Bueno', color: 'text-primary' };
    if (ms < 1000) return { label: 'Aceptable', color: 'text-warning' };
    if (ms < 2000) return { label: 'Lento', color: 'text-orange-400' };
    return { label: 'Muy lento', color: 'text-danger' };
  };

  const filteredClients = clients.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

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
            <h1 className="font-display text-3xl font-bold tracking-tight text-white">Performance</h1>
            <p className="text-sm text-text-muted">
              {viewMode === 'clients' && 'Métricas de rendimiento de sitios.'}
              {viewMode === 'projects' && `Proyectos de ${selectedClient?.full_name}`}
              {viewMode === 'detail' && `Rendimiento: ${selectedProject?.name}`}
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
        <div className="glass-panel rounded-2xl p-5 border-l-4 border-l-primary">
          <div className="flex items-start gap-3">
            <Gauge size={20} className="text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-text-muted leading-relaxed">
                Aquí puedes revisar el <strong className="text-white">rendimiento y velocidad de respuesta</strong> de cada sitio que monitoreamos. Selecciona un cliente para ver sus proyectos y analizar métricas como el tiempo de respuesta promedio, mediana, percentiles P95/P99, tendencias semanales y la distribución de tiempos de carga.
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
                <><ChevronRight size={14} /><span className="text-white font-medium">{selectedProject.name}</span></>
              )}
            </>
          )}
        </div>
      )}

      {/* Clients */}
      {viewMode === 'clients' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel overflow-hidden rounded-2xl">
          {filteredClients.length === 0 ? (
            <div className="p-12 text-center text-text-muted text-sm">No hay clientes.</div>
          ) : (
            <div className="divide-y divide-border">
              {filteredClients.map((client, i) => (
                <motion.button key={client.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  onClick={() => selectClient(client)}
                  className="flex w-full cursor-pointer items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-surface-hover"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">{client.full_name.charAt(0).toUpperCase()}</div>
                    <div>
                      <p className="font-medium text-white">{client.full_name}</p>
                      <span className="text-xs text-text-muted">{client.email}</span>
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
            {projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map((project, i) => (
              <motion.button key={project.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                onClick={() => selectProject(project)}
                className="glass-panel cursor-pointer rounded-2xl p-5 text-left transition-all hover:border-primary/50"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Globe size={20} /></div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display font-semibold text-white truncate">{project.name}</h3>
                    <p className="text-xs text-text-muted truncate">{project.url}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted capitalize">{project.platform}</span>
                  <ChevronRight size={16} className="text-text-muted" />
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Performance Detail */}
      {viewMode === 'detail' && selectedProject && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Tab switcher */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1 w-fit">
            <button
              onClick={() => setDetailTab('metrics')}
              className={`cursor-pointer rounded-md px-4 py-2 text-sm font-medium transition-colors ${detailTab === 'metrics' ? 'bg-primary text-white' : 'text-text-muted hover:text-white'}`}
            >
              <span className="flex items-center gap-2"><Gauge size={14} /> Métricas</span>
            </button>
            <button
              onClick={() => { setDetailTab('plugins'); if (pluginPerf.length === 0 && !pluginLoading) loadPluginPerf(selectedProject.id); }}
              className={`cursor-pointer rounded-md px-4 py-2 text-sm font-medium transition-colors ${detailTab === 'plugins' ? 'bg-primary text-white' : 'text-text-muted hover:text-white'}`}
            >
              <span className="flex items-center gap-2"><Puzzle size={14} /> Plugins</span>
            </button>
          </div>

          {/* === PLUGINS TAB === */}
          {detailTab === 'plugins' && (
            <div className="space-y-6">
              {pluginLoading && (
                <div className="glass-panel rounded-2xl p-16 text-center">
                  <Loader2 size={32} className="animate-spin text-primary mx-auto mb-3" />
                  <p className="text-sm text-text-muted">Analizando consumo de recursos de cada plugin...</p>
                </div>
              )}

              {pluginError && (
                <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{pluginError}</div>
              )}

              {!pluginLoading && pluginPerf.length > 0 && (
                <>
                  {/* Summary cards — clickeable to filter */}
                  {pluginSummary && (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                      {[
                        { key: 'all' as const, label: 'Total', value: pluginSummary.total, sub: `${pluginSummary.active} activos · ${pluginSummary.inactive} inactivos`, icon: Puzzle, color: 'text-primary', ring: 'ring-primary/30' },
                        { key: 'outdated' as const, label: 'Desactualizados', value: pluginSummary.outdated, sub: undefined, icon: RefreshCw, color: 'text-orange-400', ring: 'ring-orange-400/30' },
                        { key: 'high' as const, label: 'Alto impacto', value: pluginSummary.high_impact, sub: undefined, icon: XCircle, color: 'text-danger', ring: 'ring-danger/30' },
                        { key: 'medium' as const, label: 'Medio impacto', value: pluginSummary.medium_impact, sub: undefined, icon: AlertTriangle, color: 'text-warning', ring: 'ring-warning/30' },
                        { key: 'low' as const, label: 'Bajo impacto', value: pluginSummary.low_impact, sub: undefined, icon: CheckCircle2, color: 'text-success', ring: 'ring-success/30' },
                      ].map(card => (
                        <button
                          key={card.key}
                          onClick={() => { setPluginFilter(card.key); setPluginPage(1); }}
                          className={`glass-panel rounded-xl p-4 text-left cursor-pointer transition-all hover:scale-[1.02] ${
                            pluginFilter === card.key ? `ring-2 ${card.ring}` : ''
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1"><card.icon size={14} className={card.color} /><span className="text-[10px] font-medium text-text-muted uppercase">{card.label}</span></div>
                          <p className={`font-display text-2xl font-bold ${card.color}`}>{card.value}</p>
                          {card.sub && <p className="text-[10px] text-text-muted mt-0.5">{card.sub}</p>}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Re-analyze button */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => loadPluginPerf(selectedProject.id)}
                      disabled={pluginLoading}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text-muted hover:text-white hover:bg-surface-hover transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={14} /> Re-analizar
                    </button>
                    <p className="text-xs text-text-muted">Datos reales de {pluginPerf.length} plugins/temas instalados en el sitio.</p>
                  </div>

                  {/* Plugin list */}
                  <div className="glass-panel rounded-2xl overflow-hidden">
                    <div className="divide-y divide-border">
                      {(() => {
                        let filtered = pluginPerf;
                        if (pluginFilter === 'outdated') filtered = filtered.filter(p => p.outdated);
                        else if (pluginFilter === 'high') filtered = filtered.filter(p => p.impact === 'high');
                        else if (pluginFilter === 'medium') filtered = filtered.filter(p => p.impact === 'medium');
                        else if (pluginFilter === 'low') filtered = filtered.filter(p => p.impact === 'low');
                        const totalPages = Math.max(1, Math.ceil(filtered.length / PLUGINS_PER_PAGE));
                        const paginated = filtered.slice((pluginPage - 1) * PLUGINS_PER_PAGE, pluginPage * PLUGINS_PER_PAGE);
                        return (<>
                      {paginated.map((pl, i) => {
                        const impactColor = pl.impact === 'high' ? 'text-danger bg-danger/10 border-danger/20'
                          : pl.impact === 'medium' ? 'text-warning bg-warning/10 border-warning/20'
                          : pl.impact === 'low' ? 'text-success bg-success/10 border-success/20'
                          : 'text-text-muted bg-surface-hover border-border';
                        const impactLabel = pl.impact === 'high' ? 'Alto' : pl.impact === 'medium' ? 'Medio' : pl.impact === 'low' ? 'Bajo' : '—';
                        return (
                          <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="p-5 hover:bg-surface-hover/50 transition-colors">
                            <div className="flex items-start gap-4">
                              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${pl.outdated ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' : impactColor}`}>
                                {pl.outdated ? <RefreshCw size={18} /> : pl.impact === 'high' ? <XCircle size={18} /> : pl.impact === 'medium' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-sm font-semibold text-white">{pl.name}</h4>
                                  {pl.outdated && (
                                    <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-0.5 text-[10px] font-bold text-orange-400">Desactualizado</span>
                                  )}
                                  {pl.impact !== 'unknown' && (
                                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${impactColor}`}>{impactLabel}</span>
                                  )}
                                  <span className="rounded-md bg-surface-hover px-2 py-0.5 text-[10px] text-text-muted">{pl.category}</span>
                                  {pl.plugin_type === 'theme' && <span className="rounded-md bg-secondary/10 px-2 py-0.5 text-[10px] text-secondary font-medium">Tema</span>}
                                  {!pl.is_active && <span className="rounded-md bg-surface-hover px-2 py-0.5 text-[10px] text-text-muted">Inactivo</span>}
                                </div>
                                {/* Version info */}
                                <div className="flex items-center gap-3 mt-1.5">
                                  <span className="text-[11px] text-text-muted">v{pl.current_version || '?'}</span>
                                  {pl.outdated && pl.latest_version && (
                                    <span className="text-[11px] text-orange-400 font-medium">→ v{pl.latest_version} disponible</span>
                                  )}
                                  {!pl.outdated && pl.latest_version && pl.latest_version === pl.current_version && (
                                    <span className="text-[11px] text-success">Al día</span>
                                  )}
                                  {pl.author && <span className="text-[10px] text-text-muted ml-auto">{pl.author}</span>}
                                </div>
                                <p className="text-xs text-text-muted mt-1.5 leading-relaxed">{pl.description}</p>
                                {pl.suggestion && (
                                  <div className="mt-2 rounded-lg bg-primary/5 border border-primary/10 px-3 py-2">
                                    <p className="text-xs text-primary leading-relaxed"><strong>Sugerencia:</strong> {pl.suggestion}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between border-t border-border px-5 py-3">
                          <p className="text-xs text-text-muted">
                            Mostrando {(pluginPage - 1) * PLUGINS_PER_PAGE + 1}–{Math.min(pluginPage * PLUGINS_PER_PAGE, filtered.length)} de {filtered.length}
                          </p>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setPluginPage(p => Math.max(1, p - 1))}
                              disabled={pluginPage === 1}
                              className="flex cursor-pointer items-center justify-center h-8 w-8 rounded-lg border border-border bg-surface text-text-muted hover:text-white hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:cursor-default"
                            >
                              <ChevronRight size={14} className="rotate-180" />
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                              .filter(p => p === 1 || p === totalPages || Math.abs(p - pluginPage) <= 1)
                              .reduce<(number | string)[]>((acc, p, idx, arr) => {
                                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                                acc.push(p);
                                return acc;
                              }, [])
                              .map((p, idx) =>
                                typeof p === 'string' ? (
                                  <span key={`dot-${idx}`} className="px-1 text-xs text-text-muted">…</span>
                                ) : (
                                  <button
                                    key={p}
                                    onClick={() => setPluginPage(p)}
                                    className={`flex cursor-pointer items-center justify-center h-8 w-8 rounded-lg text-xs font-medium transition-colors ${
                                      pluginPage === p
                                        ? 'bg-primary text-white'
                                        : 'border border-border bg-surface text-text-muted hover:text-white hover:bg-surface-hover'
                                    }`}
                                  >
                                    {p}
                                  </button>
                                )
                              )}
                            <button
                              onClick={() => setPluginPage(p => Math.min(totalPages, p + 1))}
                              disabled={pluginPage === totalPages}
                              className="flex cursor-pointer items-center justify-center h-8 w-8 rounded-lg border border-border bg-surface text-text-muted hover:text-white hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:cursor-default"
                            >
                              <ChevronRight size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                      </>);
                      })()}
                    </div>
                  </div>
                </>
              )}

              {!pluginLoading && pluginPerf.length === 0 && !pluginError && (
                <div className="glass-panel rounded-2xl p-12 text-center">
                  <Puzzle size={40} className="text-text-muted mx-auto mb-3" />
                  <p className="text-sm text-text-muted">No se encontraron plugins para analizar. Sincroniza los plugins del proyecto primero desde Actualizaciones.</p>
                </div>
              )}
            </div>
          )}

          {/* === METRICS TAB === */}
          {detailTab === 'metrics' && (
          <div className="space-y-6">
          {/* Speed Rating */}
          {avgResponse > 0 && (
            <div className="glass-panel rounded-2xl p-6 flex items-center gap-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                <Gauge size={32} className="text-primary" />
              </div>
              <div>
                <p className="text-sm text-text-muted">Calificación general de velocidad</p>
                <p className={`font-display text-3xl font-bold ${getSpeedRating(avgResponse).color}`}>{getSpeedRating(avgResponse).label}</p>
                <p className="text-xs text-text-muted mt-1">Basado en {validLogs.length.toLocaleString()} mediciones en 30 días</p>
              </div>
              {trendPct !== 0 && (
                <div className="ml-auto flex items-center gap-2">
                  {trendPct > 0 ? <TrendingDown size={18} className="text-danger" /> : <TrendingUp size={18} className="text-success" />}
                  <div className="text-right">
                    <p className={`text-sm font-bold ${trendPct > 0 ? 'text-danger' : 'text-success'}`}>{trendPct > 0 ? '+' : ''}{trendPct}%</p>
                    <p className="text-[10px] text-text-muted">vs semana anterior</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            {[
              { label: 'Promedio', value: `${avgResponse}ms`, icon: Clock, color: 'text-primary' },
              { label: 'Mediana', value: `${medianResponse}ms`, icon: Activity, color: 'text-secondary' },
              { label: 'Mínimo', value: `${minResponse}ms`, icon: Zap, color: 'text-success' },
              { label: 'Máximo', value: `${maxResponse}ms`, icon: Server, color: 'text-danger' },
              { label: 'P95', value: `${p95Response}ms`, icon: TrendingUp, color: 'text-warning' },
              { label: 'P99', value: `${p99Response}ms`, icon: Wifi, color: 'text-accent' },
            ].map((stat, i) => (
              <div key={i} className="glass-panel rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <stat.icon size={14} className={stat.color} />
                  <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">{stat.label}</span>
                </div>
                <p className={`font-display text-xl font-bold text-white`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Response Time Chart */}
          {dailyChart.length > 0 && (
            <div className="glass-panel rounded-2xl p-6">
              <h3 className="font-display text-lg font-semibold text-white mb-4">Tiempo de Respuesta Diario (ms)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyChart}>
                    <defs>
                      <linearGradient id="perfGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} unit="ms" />
                    <Tooltip
                      cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
                      contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px', padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
                      labelStyle={{ color: '#fff', fontWeight: 600, marginBottom: '4px' }}
                      itemStyle={{ color: '#a78bfa', padding: '2px 0' }}
                    />
                    <Area type="monotone" dataKey="avg" stroke="var(--color-primary)" fill="url(#perfGrad)" strokeWidth={2} dot={{ r: 3, fill: 'var(--color-primary)', strokeWidth: 0 }} activeDot={{ r: 5, fill: 'var(--color-primary)', stroke: '#fff', strokeWidth: 2 }} name="Promedio (ms)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Distribution */}
          {distribution.some(b => b.count > 0) && (
            <div className="glass-panel rounded-2xl p-6">
              <h3 className="font-display text-lg font-semibold text-white mb-4">Distribución de Tiempos de Respuesta</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="label" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                      contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px', padding: '10px 14px', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
                      labelStyle={{ color: '#fff', fontWeight: 600, marginBottom: '4px' }}
                      itemStyle={{ color: '#a78bfa', padding: '2px 0' }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Requests">
                      {distribution.map((_, i) => (
                        <Cell key={i} fill={bucketColors[i]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
