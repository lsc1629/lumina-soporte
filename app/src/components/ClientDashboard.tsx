import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  Activity, 
  ShieldCheck,
  ArrowUpRight,
  Server,
  RefreshCw,
  Loader2,
  Puzzle,
  XCircle,
  Globe,
  Clock,
  ArrowRight,
  Plug
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '@/lib/supabase';
import LoadingScreen from './LoadingScreen';
import { usePreviewClient } from '@/lib/PreviewContext';

interface ChartPoint { time: string; uptime: number; }
interface TaskItem { id: string; title: string; date: string; type: string; }
interface ProblemItem { id: string; title: string; description: string; severity: 'high' | 'medium' | 'low'; }
interface IncidentItem { id: string; title: string; status: string; started_at: string; project_name: string; }
interface PluginUpdateItem { id: string; name: string; from_version: string; to_version: string; date: string; project_name: string; }
interface WpCoreInfo { project_name: string; current: string; latest: string; needs_update: boolean; }

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

export default function ClientDashboard() {
  const previewClientId = usePreviewClient();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [projectCount, setProjectCount] = useState(0);
  const [avgUptime, setAvgUptime] = useState(0);
  const [activeIncidents, setActiveIncidents] = useState(0);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [problems, setProblems] = useState<ProblemItem[]>([]);
  const [outdatedCount, setOutdatedCount] = useState(0);
  const [recentIncidents, setRecentIncidents] = useState<IncidentItem[]>([]);
  const [recentPluginUpdates, setRecentPluginUpdates] = useState<PluginUpdateItem[]>([]);
  const [wpCoreInfos, setWpCoreInfos] = useState<WpCoreInfo[]>([]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const userId = previewClientId || user?.id;
    if (!userId) { setLoading(false); return; }

    const [profileRes, projectsRes, incidentsRes, updatesRes, allIncidentsRes] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', userId).single(),
      supabase.from('projects').select('id, name, status, platform').eq('owner_id', userId).eq('is_active', true),
      supabase.from('incidents').select('id, title, started_at, status, project_id').in('status', ['investigating', 'identified', 'monitoring']),
      supabase.from('project_updates').select('id, name, update_type, applied_at, created_at, status, project_id, from_version, to_version').order('created_at', { ascending: false }).limit(20),
      supabase.from('incidents').select('id, title, started_at, status, project_id').order('started_at', { ascending: false }).limit(15),
    ]);

    setUserName(profileRes.data?.full_name || 'Cliente');
    const projects = projectsRes.data || [];
    setProjectCount(projects.length);

    const projectIds = new Set(projects.map(p => p.id));
    const myProjectIds = projects.map(p => p.id);

    const myIncidents = (incidentsRes.data || []).filter(i => projectIds.has(i.project_id));
    setActiveIncidents(myIncidents.length);

    // Fetch outdated plugins — exclude plugins with auto_update enabled
    const { data: pluginsData } = myProjectIds.length > 0
      ? await supabase.from('project_plugins').select('id, project_id, name, slug, current_version, latest_version, auto_update, plugin_type').in('project_id', myProjectIds)
      : { data: [] };
    const outdatedPlugins = (pluginsData || []).filter(p =>
      !p.auto_update &&
      p.latest_version && p.latest_version !== '' && p.latest_version !== 'unknown' && p.latest_version !== p.current_version
    );
    setOutdatedCount(outdatedPlugins.length);

    // WP Core info from project_plugins where slug='wordpress-core'
    const corePlugins = (pluginsData || []).filter(p => p.slug === 'wordpress-core');
    const projectNameMap = new Map((projects || []).map(p => [p.id, p.name]));
    setWpCoreInfos(corePlugins.map(cp => ({
      project_name: projectNameMap.get(cp.project_id) || 'Proyecto',
      current: cp.current_version || '',
      latest: cp.latest_version || '',
      needs_update: !!(cp.latest_version && cp.latest_version !== '' && cp.latest_version !== 'unknown' && cp.latest_version !== cp.current_version),
    })));

    // Build problems list
    const probs: ProblemItem[] = [];
    const downProjects = projects.filter(p => p.status === 'down');
    if (downProjects.length > 0) {
      probs.push({ id: 'down', title: `${downProjects.length} sitio${downProjects.length > 1 ? 's' : ''} caído${downProjects.length > 1 ? 's' : ''}`, description: 'Se detectaron problemas de conectividad. El equipo está trabajando en la solución.', severity: 'high' });
    }
    myIncidents.forEach(inc => {
      probs.push({ id: `inc-${inc.id}`, title: inc.title || 'Incidente activo', description: `Detectado ${timeAgo(inc.started_at)}. En investigación.`, severity: 'high' });
    });
    if (outdatedPlugins.length > 0) {
      probs.push({ id: 'outdated', title: `${outdatedPlugins.length} plugin${outdatedPlugins.length > 1 ? 's' : ''} desactualizado${outdatedPlugins.length > 1 ? 's' : ''}`, description: 'Hay actualizaciones pendientes (excluyendo plugins con auto-update). Contacta a soporte para programarlas.', severity: 'medium' });
    }
    setProblems(probs);

    // Recent incidents (all statuses, last 10 for this client)
    const allMyIncidents = (allIncidentsRes.data || []).filter(i => projectIds.has(i.project_id));
    setRecentIncidents(allMyIncidents.slice(0, 5).map(i => ({
      id: i.id,
      title: i.title || 'Incidente',
      status: i.status,
      started_at: i.started_at,
      project_name: projectNameMap.get(i.project_id) || 'Proyecto',
    })));

    // Calculate uptime from real uptime_logs (last 30 days) instead of stale uptime_percent column
    let uptime = 100;
    if (myProjectIds.length > 0) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: uptimeLogs } = await supabase
        .from('uptime_logs')
        .select('status')
        .in('project_id', myProjectIds)
        .gte('checked_at', thirtyDaysAgo);
      const allLogs = uptimeLogs || [];
      if (allLogs.length > 0) {
        const upCount = allLogs.filter(l => l.status === 'up' || l.status === 'warning').length;
        uptime = Number((upCount / allLogs.length * 100).toFixed(2));
      }
    }
    setAvgUptime(uptime);

    // Build chart from real uptime_logs (last 24h, grouped by 4h blocks)
    const chartPoints: ChartPoint[] = [];
    const now2 = new Date();
    const blocks = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'];
    for (let i = 0; i < blocks.length; i++) {
      const blockStart = new Date(now2.getFullYear(), now2.getMonth(), now2.getDate(), i * 4);
      const blockEnd = new Date(now2.getFullYear(), now2.getMonth(), now2.getDate(), (i + 1) * 4);
      if (blockStart > now2) { chartPoints.push({ time: blocks[i], uptime }); continue; }
      if (myProjectIds.length === 0) { chartPoints.push({ time: blocks[i], uptime: 100 }); continue; }
      const { data: blockLogs } = await supabase
        .from('uptime_logs')
        .select('status')
        .in('project_id', myProjectIds)
        .gte('checked_at', blockStart.toISOString())
        .lt('checked_at', blockEnd.toISOString());
      if (blockLogs && blockLogs.length > 0) {
        const upCount = blockLogs.filter(l => l.status === 'up' || l.status === 'warning').length;
        chartPoints.push({ time: blocks[i], uptime: Number((upCount / blockLogs.length * 100).toFixed(2)) });
      } else {
        chartPoints.push({ time: blocks[i], uptime });
      }
    }
    setChartData(chartPoints);

    const myUpdates = (updatesRes.data || []).filter(u => projectIds.has(u.project_id));
    setTasks(myUpdates.slice(0, 5).map(u => ({
      id: u.id,
      title: `${u.update_type === 'core' ? 'Actualización Core' : u.update_type === 'plugin' ? 'Plugin' : u.update_type === 'theme' ? 'Tema' : 'Dependencia'}: ${u.name}`,
      date: timeAgo(u.applied_at || u.created_at),
      type: u.update_type,
    })));

    // Recent plugin updates (applied)
    const pluginUpdates = myUpdates.filter(u => u.update_type === 'plugin' || u.update_type === 'theme');
    setRecentPluginUpdates(pluginUpdates.slice(0, 5).map(u => ({
      id: u.id,
      name: u.name,
      from_version: u.from_version || '',
      to_version: u.to_version || u.name,
      date: timeAgo(u.applied_at || u.created_at),
      project_name: projectNameMap.get(u.project_id) || 'Proyecto',
    })));

    setLoading(false);
  };

  if (loading) {
    return <LoadingScreen />;
  }

  const allOk = problems.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">Hola, {userName}</h1>
          <p className="text-sm text-text-muted">Aquí tienes el estado actual de tus servicios.</p>
        </div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative overflow-hidden rounded-2xl border p-6 ${allOk ? 'border-success/30 bg-success/10' : 'border-danger/30 bg-danger/10'}`}
      >
        <div className={`absolute -right-10 -top-10 h-40 w-40 rounded-full ${allOk ? 'bg-success/20' : 'bg-danger/20'} blur-3xl`}></div>
        <div className="flex items-center gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-full ${allOk ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
            {allOk ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-white">
              {allOk ? 'Todos los sistemas operativos' : `${problems.length} problema${problems.length !== 1 ? 's' : ''} detectado${problems.length !== 1 ? 's' : ''}`}
            </h2>
            <p className={`text-sm ${allOk ? 'text-success' : 'text-danger'}`}>
              {allOk ? `Tus ${projectCount} sitios web están funcionando correctamente.` : 'Revisa los detalles a continuación para conocer el estado de tus sitios.'}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Problems detail panel */}
      {problems.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-panel rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
            <XCircle size={18} className="text-danger" />
            <h3 className="font-display text-lg font-semibold text-white">Problemas Detectados</h3>
          </div>
          <div className="divide-y divide-border">
            {problems.map(prob => (
              <div key={prob.id} className="flex items-start gap-4 px-5 py-4">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${prob.severity === 'high' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>
                  {prob.id === 'outdated' ? <Puzzle size={14} /> : <AlertTriangle size={14} />}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{prob.title}</p>
                  <p className="text-xs text-text-muted mt-0.5">{prob.description}</p>
                </div>
                <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${prob.severity === 'high' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>
                  {prob.severity === 'high' ? 'Crítico' : 'Atención'}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Uptime Chart + Maintenance Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="glass-panel col-span-1 rounded-2xl p-6 lg:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold text-white">Disponibilidad (Últimas 24h)</h3>
              <p className="text-sm text-text-muted">Uptime promedio: <span className={`font-bold ${avgUptime >= 99.9 ? 'text-success' : avgUptime >= 99 ? 'text-warning' : 'text-danger'}`}>{avgUptime}%</span></p>
            </div>
            <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border ${allOk ? 'bg-success/10 text-success border-success/20' : 'bg-danger/10 text-danger border-danger/20'}`}>
              <Activity size={12} /> {allOk ? 'En línea' : 'Problemas'}
            </span>
          </div>
          
          <div className="h-[250px] w-full min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorUptime" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-success)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-success)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="time" stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} domain={[99, 100]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--color-success)' }}
                  formatter={(v: number) => [`${v}%`, 'Uptime']}
                />
                <Area type="monotone" dataKey="uptime" stroke="var(--color-success)" strokeWidth={3} fillOpacity={1} fill="url(#colorUptime)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Card: Movimiento Reciente */}
        <div className="glass-panel col-span-1 rounded-2xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-white">Movimiento Reciente</h3>
            <ShieldCheck size={20} className="text-primary" />
          </div>
          {tasks.length === 0 ? (
            <p className="text-sm text-text-muted">No hay actividad de mantenimiento reciente.</p>
          ) : (
            <div className="space-y-3">
              {tasks.map((task, index) => (
                <motion.div 
                  key={task.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  className="flex items-start gap-3 rounded-xl border border-border bg-surface/30 p-3"
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {task.type === 'core' ? <ArrowUpRight size={13} /> :
                     task.type === 'plugin' ? <RefreshCw size={13} /> :
                     task.type === 'security' ? <ShieldCheck size={13} /> :
                     <Server size={13} />}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-medium text-white leading-tight truncate">{task.title}</h4>
                    <p className="text-xs text-text-muted">{task.date}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cards row: Últimas Incidencias, Plugins Actualizados, WordPress Core */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Card: Últimas Incidencias */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel rounded-2xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-white">Últimas Incidencias</h3>
            <AlertTriangle size={20} className="text-warning" />
          </div>
          {recentIncidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <CheckCircle2 size={32} className="text-success mb-2" />
              <p className="text-sm text-text-muted">Sin incidencias recientes.</p>
              <p className="text-xs text-text-muted mt-1">Todo funcionando correctamente.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentIncidents.map((inc, index) => {
                const statusColor = ['investigating', 'identified'].includes(inc.status) ? 'text-danger' : inc.status === 'monitoring' ? 'text-warning' : 'text-success';
                const statusBg = ['investigating', 'identified'].includes(inc.status) ? 'bg-danger/10' : inc.status === 'monitoring' ? 'bg-warning/10' : 'bg-success/10';
                const statusLabel = inc.status === 'investigating' ? 'Investigando' : inc.status === 'identified' ? 'Identificado' : inc.status === 'monitoring' ? 'Monitoreando' : 'Resuelto';
                return (
                  <motion.div
                    key={inc.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.08 }}
                    className="flex items-start gap-3 rounded-xl border border-border bg-surface/30 p-3"
                  >
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${statusBg} ${statusColor}`}>
                      <AlertTriangle size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-medium text-white leading-tight truncate">{inc.title}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${statusBg} ${statusColor}`}>{statusLabel}</span>
                        <span className="text-xs text-text-muted">{inc.project_name}</span>
                        <span className="text-xs text-text-muted">{timeAgo(inc.started_at)}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Card: Plugins Actualizados */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-panel rounded-2xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-white">Plugins Actualizados</h3>
            <Plug size={20} className="text-success" />
          </div>
          {recentPluginUpdates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <RefreshCw size={32} className="text-text-muted mb-2" />
              <p className="text-sm text-text-muted">Sin actualizaciones recientes.</p>
              <p className="text-xs text-text-muted mt-1">Los plugins se actualizarán según necesidad.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentPluginUpdates.map((upd, index) => (
                <motion.div
                  key={upd.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.08 }}
                  className="flex items-start gap-3 rounded-xl border border-border bg-surface/30 p-3"
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                    <RefreshCw size={13} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-medium text-white leading-tight truncate">{upd.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      {upd.from_version && (
                        <span className="font-mono text-[10px] text-text-muted">{upd.from_version}</span>
                      )}
                      {upd.from_version && <ArrowRight size={10} className="text-success" />}
                      <span className="font-mono text-[10px] text-success font-medium">{upd.to_version}</span>
                      <span className="text-xs text-text-muted">{upd.date}</span>
                    </div>
                    <p className="text-[10px] text-text-muted mt-0.5">{upd.project_name}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
          {outdatedCount > 0 && (
            <div className="mt-3 rounded-lg bg-warning/5 border border-warning/20 px-3 py-2">
              <p className="text-xs text-warning">
                <Puzzle size={12} className="inline mr-1" />
                {outdatedCount} plugin{outdatedCount > 1 ? 's' : ''} pendiente{outdatedCount > 1 ? 's' : ''} de actualización
              </p>
            </div>
          )}
        </motion.div>

        {/* Card: WordPress Core */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-panel rounded-2xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-white">WordPress Core</h3>
            <Globe size={20} className="text-primary" />
          </div>
          {wpCoreInfos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Globe size={32} className="text-text-muted mb-2" />
              <p className="text-sm text-text-muted">Sin información de WordPress.</p>
              <p className="text-xs text-text-muted mt-1">Sincroniza los plugins para detectar la versión.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {wpCoreInfos.map((core, index) => (
                <motion.div
                  key={`core-${index}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.08 }}
                  className={`rounded-xl border p-4 ${core.needs_update ? 'border-warning/30 bg-warning/5' : 'border-success/30 bg-success/5'}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{core.project_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-xs text-white">{core.current}</span>
                        {core.needs_update && (
                          <>
                            <ArrowRight size={12} className="text-warning" />
                            <span className="font-mono text-xs text-warning font-semibold">{core.latest}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${core.needs_update ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
                      {core.needs_update ? 'Actualizar' : 'Al día'}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
