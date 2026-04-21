import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Activity, 
  Server, 
  AlertCircle, 
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Bot
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { supabase } from '@/lib/supabase';
import LoadingScreen from './LoadingScreen';

interface DashboardStats {
  totalProjects: number;
  avgUptime: number;
  activeIncidents: number;
  pendingUpdates: number;
  agentCount: number;
}

interface ActivityItem {
  id: string;
  title: string;
  project: string;
  time: string;
  type: 'danger' | 'success' | 'warning';
}

interface ChartPoint {
  name: string;
  response: number;
}

const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({ totalProjects: 0, avgUptime: 0, activeIncidents: 0, pendingUpdates: 0, agentCount: 0 });
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [systemOk, setSystemOk] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadDashboard(); }, []);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {

    const [projectsRes, incidentsRes, pluginsRes, recentIncidentsRes, recentUpdatesRes, agentRes] = await Promise.all([
      supabase.from('projects').select('id, uptime_percent, response_time_ms, status, last_check_at').eq('is_active', true),
      supabase.from('incidents').select('id').in('status', ['investigating', 'identified', 'monitoring']),
      supabase.from('project_plugins').select('id, current_version, latest_version'),
      supabase.from('incidents').select('id, title, status, started_at, project:projects(name)').in('status', ['investigating', 'identified', 'monitoring']).order('started_at', { ascending: false }).limit(5),
      supabase.from('project_updates').select('id, name, status, applied_at, created_at, project:projects(name)').eq('status', 'completed').order('applied_at', { ascending: false }).limit(3),
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('is_active', true).or('wp_app_user.neq.,site_token.neq.'),
    ]);
    const agentCount = agentRes.count || 0;

    const projects = projectsRes.data || [];
    const activeIncidents = incidentsRes.data?.length || 0;
    const pendingUpdates = (pluginsRes.data || []).filter(p => 
      p.latest_version && p.latest_version !== '' && p.latest_version !== 'unknown' && p.latest_version !== p.current_version
    ).length;

    // Calculate avgUptime from uptime_logs (last 24h) — counts 'warning' as operational
    let avgUptime = 0;
    if (projects.length > 0) {
      const projectIds = projects.map(p => p.id);
      const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentLogs } = await supabase
        .from('uptime_logs')
        .select('status')
        .in('project_id', projectIds)
        .gte('checked_at', cutoff24h);
      const allLogs = recentLogs || [];
      if (allLogs.length > 0) {
        const upCount = allLogs.filter(l => l.status === 'up' || l.status === 'warning').length;
        avgUptime = Number((upCount / allLogs.length * 100).toFixed(2));
      } else {
        avgUptime = 100;
      }
    }

    setStats({ totalProjects: projects.length, avgUptime, activeIncidents, pendingUpdates, agentCount });
    setSystemOk(activeIncidents === 0);

    // Build chart from real uptime_logs (last 7 days) — single query
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const { data: allChartLogs } = await supabase
      .from('uptime_logs')
      .select('response_time_ms, checked_at')
      .gte('checked_at', sevenDaysAgo.toISOString())
      .not('response_time_ms', 'is', null);

    const chart: ChartPoint[] = [];
    const logsByDay = new Map<string, number[]>();
    for (const log of (allChartLogs || [])) {
      const d = new Date(log.checked_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!logsByDay.has(key)) logsByDay.set(key, []);
      logsByDay.get(key)!.push(log.response_time_ms || 0);
    }
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const dayName = dayNames[d.getDay()];
      const dayLogs = logsByDay.get(key);
      if (dayLogs && dayLogs.length > 0) {
        chart.push({ name: dayName, response: Math.round(dayLogs.reduce((a, v) => a + v, 0) / dayLogs.length) });
      } else {
        const projectsWithResponse = projects.filter(p => p.response_time_ms != null);
        const avgResponse = projectsWithResponse.length > 0
          ? Math.round(projectsWithResponse.reduce((a, p) => a + (p.response_time_ms || 0), 0) / projectsWithResponse.length)
          : 0;
        chart.push({ name: dayName, response: avgResponse });
      }
    }
    setChartData(chart);

    const activityItems: ActivityItem[] = [];
    (recentIncidentsRes.data || []).forEach((inc: any) => {
      activityItems.push({
        id: `inc-${inc.id}`,
        title: inc.title,
        project: inc.project?.name || 'Sin proyecto',
        time: timeAgo(inc.started_at),
        type: 'danger',
      });
    });
    (recentUpdatesRes.data || []).forEach((upd: any) => {
      activityItems.push({
        id: `upd-${upd.id}`,
        title: `Actualización: ${upd.name}`,
        project: upd.project?.name || 'Sin proyecto',
        time: timeAgo(upd.applied_at || upd.created_at),
        type: 'success',
      });
    });
    activityItems.sort((a, b) => {
      const getMs = (t: string) => {
        if (t === 'Ahora') return 0;
        const m = t.match(/(\d+)/);
        return m ? parseInt(m[1]) : 9999;
      };
      return getMs(a.time) - getMs(b.time);
    });
    setActivity(activityItems.slice(0, 5));
    } catch (err) {
      console.error('[Dashboard] loadDashboard error:', err);
      setError('Error al cargar el dashboard. Verifica tu conexión e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const iconMap = { danger: AlertCircle, success: CheckCircle2, warning: Clock };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3">
          <AlertCircle size={18} className="text-danger shrink-0" />
          <p className="text-sm text-danger">{error}</p>
          <button onClick={loadDashboard} className="ml-auto flex items-center gap-1 rounded-lg bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/20 transition-colors">
            <RefreshCw size={12} /> Reintentar
          </button>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">Panorama General</h1>
          <p className="text-sm text-text-muted">Estado de salud de todos los proyectos en tiempo real.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-surface/50 px-4 py-1.5 text-sm font-medium text-text-muted backdrop-blur-md">
          <span className="relative flex h-2 w-2">
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${systemOk ? 'bg-success' : 'bg-danger'} opacity-75`}></span>
            <span className={`relative inline-flex h-2 w-2 rounded-full ${systemOk ? 'bg-success' : 'bg-danger'}`}></span>
          </span>
          {systemOk ? 'Sistema Operativo' : 'Incidentes Activos'}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <motion.div whileHover={{ y: -2 }} className="glass-panel relative overflow-hidden rounded-2xl p-5">
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/10 blur-2xl"></div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-muted">Proyectos Activos</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Server size={16} /></div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <h2 className="font-display text-3xl font-bold text-white">{stats.totalProjects}</h2>
            <span className="flex items-center text-xs font-medium text-text-muted">sitios monitoreados</span>
          </div>
          {stats.agentCount > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-primary">
              <Bot size={12} />
              <span>{stats.agentCount} con Lumina Agent</span>
            </div>
          )}
        </motion.div>

        <motion.div whileHover={{ y: -2 }} className="glass-panel relative overflow-hidden rounded-2xl p-5">
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-success/10 blur-2xl"></div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-muted">Uptime Global</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success"><Activity size={16} /></div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <h2 className="font-display text-3xl font-bold text-white">{stats.avgUptime}%</h2>
            <span className={`flex items-center text-xs font-medium ${stats.avgUptime >= 99.9 ? 'text-success' : stats.avgUptime >= 99 ? 'text-warning' : 'text-danger'}`}>
              {stats.avgUptime >= 99.9 ? <><ArrowUpRight size={12} className="mr-0.5" /> Excelente</> : stats.avgUptime >= 99 ? 'Aceptable' : <><ArrowDownRight size={12} className="mr-0.5" /> Bajo</>}
            </span>
          </div>
        </motion.div>

        <motion.div whileHover={{ y: -2 }} className={`glass-panel relative overflow-hidden rounded-2xl p-5 ${stats.activeIncidents > 0 ? 'border-danger/20' : ''}`}>
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-danger/10 blur-2xl"></div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-muted">Incidentes Activos</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger/10 text-danger"><AlertCircle size={16} /></div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <h2 className="font-display text-3xl font-bold text-white">{stats.activeIncidents}</h2>
            <span className={`flex items-center text-xs font-medium ${stats.activeIncidents > 0 ? 'text-danger' : 'text-success'}`}>
              {stats.activeIncidents > 0 ? <><AlertTriangle size={12} className="mr-0.5" /> Requiere atención</> : <><CheckCircle2 size={12} className="mr-0.5" /> Todo en orden</>}
            </span>
          </div>
        </motion.div>

        <motion.div whileHover={{ y: -2 }} className={`glass-panel relative overflow-hidden rounded-2xl p-5 ${stats.pendingUpdates > 0 ? 'border-warning/20' : ''}`}>
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-warning/10 blur-2xl"></div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-text-muted">Actualizaciones</p>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning/10 text-warning"><RefreshCw size={16} /></div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <h2 className="font-display text-3xl font-bold text-white">{stats.pendingUpdates}</h2>
            <span className="flex items-center text-xs font-medium text-text-muted">pendientes</span>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="glass-panel col-span-1 rounded-2xl p-6 lg:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold text-white">Tiempo de Respuesta Promedio</h3>
              <p className="text-sm text-text-muted">Últimos 7 días (ms)</p>
            </div>
          </div>
          <div className="h-[300px] w-full min-h-[300px]">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorResponse" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', borderRadius: '8px' }}
                    itemStyle={{ color: 'var(--color-text-main)' }}
                    formatter={(value: number) => [`${value}ms`, 'Respuesta']}
                  />
                  <Area type="monotone" dataKey="response" stroke="var(--color-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorResponse)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-text-muted text-sm">Sin datos de respuesta disponibles</div>
            )}
          </div>
        </div>

        <div className="glass-panel col-span-1 rounded-2xl p-6">
          <h3 className="mb-6 font-display text-lg font-semibold text-white">Actividad Reciente</h3>
          {activity.length === 0 ? (
            <p className="text-sm text-text-muted">No hay actividad reciente.</p>
          ) : (
            <div className="space-y-6">
              {activity.map((item) => {
                const Icon = iconMap[item.type] || Clock;
                return (
                  <div key={item.id} className="flex gap-4">
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${item.type === 'danger' ? 'bg-danger/10 text-danger' : item.type === 'success' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                      <Icon size={14} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{item.title}</p>
                      <p className="text-xs text-text-muted">{item.project}</p>
                      <p className="mt-1 text-xs text-text-muted opacity-70">{item.time}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
