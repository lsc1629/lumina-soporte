import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Search, 
  MoreVertical, 
  Activity, 
  Clock, 
  ShieldAlert,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Trash2,
  Pencil,
  Bot
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import LoadingScreen from './LoadingScreen';

interface Project {
  id: string;
  name: string;
  url: string;
  platform: string;
  status: string;
  uptime_percent: number;
  response_time_ms: number | null;
  last_check_at: string;
  is_active: boolean;
  hosting_provider: string;
  created_at: string;
  update_count?: number;
  wp_app_user?: string;
  site_token?: string;
}

interface ProjectsViewProps {
  onNewProject: () => void;
  onEditProject?: (id: string) => void;
}

type FilterType = 'all' | 'up' | 'warning' | 'down';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

export default function ProjectsView({ onNewProject, onEditProject }: ProjectsViewProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<string | null>(null);

  useEffect(() => { loadProjects(); }, []);

  const loadProjects = async () => {
    setLoading(true);
    const { data: projs } = await supabase
      .from('projects')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (projs) {
      // Count outdated plugins from project_plugins
      const { data: allPlugins } = await supabase
        .from('project_plugins')
        .select('project_id, current_version, latest_version')
        .in('project_id', projs.map(p => p.id));
      const pluginsByProject = new Map<string, number>();
      (allPlugins || []).forEach(pl => {
        if (pl.latest_version && pl.latest_version !== '' && pl.latest_version !== 'unknown' && pl.latest_version !== pl.current_version) {
          pluginsByProject.set(pl.project_id, (pluginsByProject.get(pl.project_id) || 0) + 1);
        }
      });
      const withCounts = projs.map(p => ({
        ...p,
        update_count: pluginsByProject.get(p.id) || 0,
      }));
      setProjects(withCounts);
    }
    setLoading(false);
  };

  const deleteProject = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este proyecto?')) return;
    await supabase.from('projects').update({ is_active: false }).eq('id', id);
    setProjects(prev => prev.filter(p => p.id !== id));
    setMenuOpen(null);
  };

  const editProject = (id: string) => {
    setMenuOpen(null);
    if (onEditProject) onEditProject(id);
  };

  const filtered = projects
    .filter(p => filter === 'all' || p.status === filter)
    .filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.url.toLowerCase().includes(search.toLowerCase())
    );

  const counts = {
    all: projects.length,
    up: projects.filter(p => p.status === 'up').length,
    warning: projects.filter(p => p.status === 'warning' || p.status === 'maintenance').length,
    down: projects.filter(p => p.status === 'down').length,
  };

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: `Todos (${counts.all})` },
    { key: 'up', label: `Operativos (${counts.up})` },
    { key: 'warning', label: `Con Problemas (${counts.warning})` },
    { key: 'down', label: `Caídos (${counts.down})` },
  ];

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">Proyectos</h1>
          <p className="text-sm text-text-muted">Monitoreo en tiempo real de todos los sitios.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
            <Search size={16} className="text-text-muted" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar proyecto..." className="w-48 bg-transparent text-sm text-white placeholder-text-muted outline-none" />
          </div>
          <button onClick={onNewProject} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover shadow-lg shadow-primary/20">
            Nuevo Proyecto
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {filters.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${filter === f.key ? 'bg-white text-background' : 'border border-border bg-surface text-text-muted hover:bg-surface-hover hover:text-white'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center">
          <Activity size={32} className="mx-auto mb-3 text-text-muted opacity-50" />
          <p className="text-sm text-text-muted">{search ? 'No se encontraron proyectos.' : 'No hay proyectos aún.'}</p>
          <button onClick={onNewProject} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Crear Primer Proyecto</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project, index) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className={`glass-panel relative flex flex-col justify-between overflow-hidden rounded-2xl p-5 transition-all hover:border-primary/50 hover:shadow-[0_0_20px_rgba(139,92,246,0.1)] ${project.status === 'down' ? 'border-danger/30 bg-danger/5' : ''}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${project.status === 'up' ? 'bg-success/10 text-success' : project.status === 'down' ? 'bg-danger/10 text-danger animate-pulse' : 'bg-warning/10 text-warning'}`}>
                    {project.status === 'up' ? <CheckCircle2 size={20} /> : project.status === 'down' ? <ShieldAlert size={20} /> : <Activity size={20} />}
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-semibold text-white">{project.name}</h3>
                    <a href={`https://${project.url}`} target="_blank" rel="noreferrer" className="flex cursor-pointer items-center text-xs text-text-muted hover:text-primary">
                      {project.url} <ExternalLink size={10} className="ml-1" />
                    </a>
                  </div>
                </div>
                <div className="relative">
                  <button onClick={() => setMenuOpen(menuOpen === project.id ? null : project.id)} className="cursor-pointer text-text-muted hover:text-white"><MoreVertical size={18} /></button>
                  {menuOpen === project.id && (
                    <div className="absolute right-0 top-8 z-10 w-40 rounded-lg border border-border bg-surface shadow-xl py-1">
                      <button onClick={() => editProject(project.id)} className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-muted hover:bg-surface-hover hover:text-white">
                        <Pencil size={14} /> Editar
                      </button>
                      <button onClick={() => deleteProject(project.id)} className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/10">
                        <Trash2 size={14} /> Eliminar
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <span className="rounded-md bg-surface-hover px-2 py-1 text-xs font-medium text-text-muted border border-border capitalize">{project.platform}</span>
                {(project.site_token || project.wp_app_user) && (
                  <span className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary border border-primary/20">
                    <Bot size={12} /> Agent
                  </span>
                )}
                {(project.update_count ?? 0) > 0 && (
                  <span className="rounded-md bg-warning/10 px-2 py-1 text-xs font-medium text-warning border border-warning/20">{project.update_count} updates</span>
                )}
              </div>

              <div className="mt-6 grid grid-cols-3 gap-2 border-t border-border pt-4">
                <div className="group relative cursor-default" onMouseEnter={() => setTooltip(`uptime-${project.id}`)} onMouseLeave={() => setTooltip(null)}>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Uptime</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-white">{project.uptime_percent}%</p>
                  {tooltip === `uptime-${project.id}` && (
                    <div className="absolute bottom-full left-0 z-20 mb-2 w-52 rounded-lg border border-border bg-surface p-2.5 text-xs text-text-muted shadow-xl">
                      Porcentaje de tiempo que el sitio estuvo disponible en las últimas 24 horas.
                    </div>
                  )}
                </div>
                <div className="group relative cursor-default" onMouseEnter={() => setTooltip(`resp-${project.id}`)} onMouseLeave={() => setTooltip(null)}>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Respuesta</p>
                  <p className={`mt-1 font-mono text-sm font-semibold ${!project.response_time_ms ? 'text-danger' : project.response_time_ms > 500 ? 'text-warning' : 'text-white'}`}>
                    {project.response_time_ms ? `${project.response_time_ms}ms` : 'N/A'}
                  </p>
                  {tooltip === `resp-${project.id}` && (
                    <div className="absolute bottom-full left-0 z-20 mb-2 w-52 rounded-lg border border-border bg-surface p-2.5 text-xs text-text-muted shadow-xl">
                      Tiempo que tarda el servidor en responder. Menos de 500ms es bueno, más de 1000ms es lento.
                    </div>
                  )}
                </div>
                <div className="group relative cursor-default" onMouseEnter={() => setTooltip(`check-${project.id}`)} onMouseLeave={() => setTooltip(null)}>
                  <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Check</p>
                  <p className="mt-1 flex items-center font-mono text-sm font-semibold text-white">
                    <Clock size={12} className="mr-1 text-text-muted" /> {timeAgo(project.last_check_at)}
                  </p>
                  {tooltip === `check-${project.id}` && (
                    <div className="absolute bottom-full right-0 z-20 mb-2 w-52 rounded-lg border border-border bg-surface p-2.5 text-xs text-text-muted shadow-xl">
                      Última vez que el monitor verificó automáticamente el estado de este sitio.
                    </div>
                  )}
                </div>
              </div>

              {project.status === 'down' && (
                <div className="mt-4 rounded-lg bg-danger/10 p-3 text-center border border-danger/20">
                  <p className="text-xs font-medium text-danger">Sitio Caído - Notificando al técnico...</p>
                  <button className="mt-2 w-full rounded-md bg-danger px-3 py-1.5 text-xs font-bold text-white hover:bg-danger/90">Ver Incidente</button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
