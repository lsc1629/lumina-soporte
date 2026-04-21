import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Image,
  Puzzle,
  Activity,
  ArrowUpCircle,
  XCircle,
  ChevronDown,
  Globe,
  ShieldCheck,
  Clock,
} from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import LoadingScreen from './LoadingScreen';
import { usePreviewClient } from '@/lib/PreviewContext';


interface ProjectBasic {
  id: string;
  name: string;
  url: string;
  platform: string;
  status: string;
}

interface PendingUpdate {
  id: string;
  name: string;
  update_type: string;
  current_version: string;
  new_version: string;
  project_name: string;
}

interface ImageIssue {
  project_name: string;
  total_images: number;
  needs_conversion: number;
  optimized: number;
}

interface PluginIssue {
  name: string;
  slug: string;
  current_version: string;
  latest_version: string;
  is_active: boolean;
  outdated: boolean;
  impact: 'high' | 'medium' | 'low' | 'unknown';
  category: string;
  description: string;
  suggestion: string;
  author: string;
  project_name: string;
}

interface UptimeInfo {
  project_name: string;
  uptime30d: number;
  avgResponse: number;
  downEvents: number;
  lastDown: string | null;
  status: string;
}

type SectionKey = 'updates' | 'images' | 'plugins' | 'uptime';

export default function ClientIssuesView() {
  const previewClientId = usePreviewClient();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectBasic[]>([]);

  const [pendingUpdates, setPendingUpdates] = useState<PendingUpdate[]>([]);
  const [imageIssues, setImageIssues] = useState<ImageIssue[]>([]);
  const [pluginIssues, setPluginIssues] = useState<PluginIssue[]>([]);
  const [uptimeInfo, setUptimeInfo] = useState<UptimeInfo[]>([]);

  const [scanningImages, setScanningImages] = useState(false);
  const [scanningPlugins, setScanningPlugins] = useState(false);

  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({
    updates: true,
    images: true,
    plugins: true,
    uptime: true,
  });

  const toggle = (key: SectionKey) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const userId = previewClientId || user?.id;
    if (!userId) { setLoading(false); return; }

    // Get projects
    const { data: projs } = await supabase
      .from('projects')
      .select('id, name, url, platform, status')
      .eq('owner_id', userId)
      .eq('is_active', true)
      .order('name');

    const myProjects = projs || [];
    setProjects(myProjects);
    const projectIds = myProjects.map(p => p.id);

    if (projectIds.length === 0) { setLoading(false); return; }

    // Parallel fetch: updates, plugins (for outdated check), uptime logs
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [pluginsRes, uptimeRes] = await Promise.all([
      supabase.from('project_plugins')
        .select('id, project_id, name, slug, current_version, latest_version, plugin_type, is_active')
        .in('project_id', projectIds),
      supabase.from('uptime_logs')
        .select('project_id, status, response_time_ms, checked_at')
        .in('project_id', projectIds)
        .gte('checked_at', thirtyDaysAgo),
    ]);

    // 1. Pending updates from project_plugins (comparing versions)
    const allPlugins = pluginsRes.data || [];
    const outdated = allPlugins.filter(p =>
      p.latest_version && p.latest_version !== '' && p.latest_version !== 'unknown' && p.latest_version !== p.current_version
    );
    const updates: PendingUpdate[] = outdated.map(p => ({
      id: p.id,
      name: p.name,
      update_type: p.plugin_type || 'plugin',
      current_version: p.current_version || '',
      new_version: p.latest_version || '',
      project_name: myProjects.find(pr => pr.id === p.project_id)?.name || '',
    }));
    setPendingUpdates(updates);

    // 2. Uptime per project
    const uptimeLogs = uptimeRes.data || [];
    const uptimeList: UptimeInfo[] = myProjects.map(p => {
      const logs = uptimeLogs.filter((l: any) => l.project_id === p.id);
      const upCount = logs.filter((l: any) => l.status === 'up' || l.status === 'warning').length;
      const uptime30d = logs.length > 0 ? Math.round((upCount / logs.length) * 10000) / 100 : 100;
      const respTimes = logs.filter((l: any) => l.response_time_ms > 0).map((l: any) => l.response_time_ms);
      const avgResponse = respTimes.length > 0 ? Math.round(respTimes.reduce((a: number, b: number) => a + b, 0) / respTimes.length) : 0;
      const downLogs = logs.filter((l: any) => l.status === 'down');
      const lastDown = downLogs.length > 0 ? downLogs[downLogs.length - 1].checked_at : null;
      return {
        project_name: p.name,
        uptime30d,
        avgResponse,
        downEvents: downLogs.length,
        lastDown,
        status: p.status,
      };
    });
    setUptimeInfo(uptimeList);

    setLoading(false);

    // 3. Scan images async per project
    scanAllImages(myProjects);

    // 4. Analyze plugins async per project
    analyzeAllPlugins(projectIds, myProjects);
  };

  const scanAllImages = async (projs: ProjectBasic[]) => {
    setScanningImages(true);
    const results: ImageIssue[] = [];
    for (const p of projs) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/scan-images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ project_id: p.id }),
        });
        if (res.ok) {
          const data = await res.json();
          const imgs = data.images || [];
          const needsConversion = imgs.filter((i: any) => i.needsConversion).length;
          if (imgs.length > 0) {
            results.push({
              project_name: p.name,
              total_images: imgs.length,
              needs_conversion: needsConversion,
              optimized: imgs.length - needsConversion,
            });
          }
        }
      } catch { /* skip */ }
    }
    setImageIssues(results);
    setScanningImages(false);
  };

  const analyzeAllPlugins = async (projectIds: string[], projs: ProjectBasic[]) => {
    setScanningPlugins(true);
    const results: PluginIssue[] = [];
    for (const pid of projectIds) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-plugin-performance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'apikey': SUPABASE_ANON_KEY },
          body: JSON.stringify({ project_id: pid }),
        });
        if (res.ok) {
          const data = await res.json();
          // Include outdated plugins AND high/medium impact plugins (real data only)
          const relevant = (data.plugins || []).filter((pl: any) => pl.outdated || pl.impact === 'high' || pl.impact === 'medium');
          const projName = projs.find(p => p.id === pid)?.name || '';
          relevant.forEach((pl: any) => {
            results.push({
              name: pl.name,
              slug: pl.slug,
              current_version: pl.current_version || '',
              latest_version: pl.latest_version || '',
              is_active: pl.is_active,
              outdated: pl.outdated || false,
              impact: pl.impact,
              category: pl.category,
              description: pl.description,
              suggestion: pl.suggestion,
              author: pl.author || '',
              project_name: projName,
            });
          });
        }
      } catch { /* skip */ }
    }
    // Sort: outdated first, then high impact, then medium
    const impOrd = { high: 0, medium: 1, low: 2, unknown: 3 };
    results.sort((a, b) => {
      if (a.outdated !== b.outdated) return a.outdated ? -1 : 1;
      return (impOrd[a.impact] ?? 3) - (impOrd[b.impact] ?? 3);
    });
    setPluginIssues(results);
    setScanningPlugins(false);
  };

  // Count totals for summary
  const totalIssues =
    pendingUpdates.length +
    imageIssues.reduce((a, i) => a + i.needs_conversion, 0) +
    pluginIssues.filter(p => p.outdated || p.impact === 'high').length +
    uptimeInfo.filter(u => u.uptime30d < 99.5 || u.status === 'down').length;

  if (loading) {
    return <LoadingScreen />;
  }

  if (projects.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">Incidencias</h1>
        <div className="glass-panel rounded-2xl p-12 text-center text-text-muted text-sm">No tienes proyectos activos.</div>
      </div>
    );
  }

  const SectionHeader = ({ sectionKey, icon: Icon, title, count, color }: { sectionKey: SectionKey; icon: any; title: string; count: number; color: string }) => (
    <button
      onClick={() => toggle(sectionKey)}
      className="flex w-full cursor-pointer items-center justify-between rounded-xl px-5 py-4 transition-colors hover:bg-surface-hover"
    >
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
          <Icon size={18} />
        </div>
        <div className="text-left">
          <h3 className="font-display text-base font-semibold text-white">{title}</h3>
          <p className="text-xs text-text-muted">{count > 0 ? `${count} elemento${count !== 1 ? 's' : ''}` : 'Sin problemas'}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {count > 0 && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${count > 0 ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
            {count}
          </span>
        )}
        {count === 0 && (
          <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-bold text-success">OK</span>
        )}
        <ChevronDown size={16} className={`text-text-muted transition-transform ${expanded[sectionKey] ? 'rotate-180' : ''}`} />
      </div>
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">Incidencias</h1>
        <p className="text-sm text-text-muted">Resumen de problemas y recomendaciones para tus sitios web.</p>
      </div>

      {/* Summary Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative overflow-hidden rounded-2xl border p-6 ${totalIssues === 0 ? 'border-success/30 bg-success/10' : 'border-warning/30 bg-warning/10'}`}
      >
        <div className={`absolute -right-10 -top-10 h-40 w-40 rounded-full ${totalIssues === 0 ? 'bg-success/20' : 'bg-warning/20'} blur-3xl`} />
        <div className="flex items-center gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-full ${totalIssues === 0 ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
            {totalIssues === 0 ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-white">
              {totalIssues === 0 ? 'Todo en orden' : `${totalIssues} incidencia${totalIssues !== 1 ? 's' : ''} detectada${totalIssues !== 1 ? 's' : ''}`}
            </h2>
            <p className={`text-sm ${totalIssues === 0 ? 'text-success' : 'text-warning'}`}>
              {totalIssues === 0
                ? 'Todos tus sitios están funcionando correctamente sin problemas detectados.'
                : 'Revisa las recomendaciones a continuación para mejorar el rendimiento y seguridad de tus sitios.'}
            </p>
          </div>
        </div>
      </motion.div>

      {/* 1. Actualizaciones Pendientes */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-panel rounded-2xl overflow-hidden">
        <SectionHeader sectionKey="updates" icon={RefreshCw} title="Actualizaciones Pendientes" count={pendingUpdates.length} color="bg-primary/10 text-primary" />
        {expanded.updates && (
          <div className="border-t border-border">
            {pendingUpdates.length === 0 ? (
              <div className="flex items-center gap-3 p-5 text-sm text-text-muted">
                <CheckCircle2 size={16} className="text-success" />
                Todos los plugins, temas y core están actualizados.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {pendingUpdates.map((u, i) => (
                  <div key={u.id} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-hover/50 transition-colors">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      u.update_type === 'core' ? 'bg-danger/10 text-danger' :
                      u.update_type === 'plugin' ? 'bg-primary/10 text-primary' :
                      'bg-secondary/10 text-secondary'
                    }`}>
                      {u.update_type === 'core' ? <ArrowUpCircle size={14} /> :
                       u.update_type === 'plugin' ? <Puzzle size={14} /> :
                       <Globe size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{u.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-text-muted">{u.project_name}</span>
                        {u.current_version && u.new_version && (
                          <span className="text-[10px] text-text-muted">{u.current_version} → {u.new_version}</span>
                        )}
                      </div>
                    </div>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                      u.update_type === 'core' ? 'bg-danger/10 text-danger' :
                      u.update_type === 'plugin' ? 'bg-primary/10 text-primary' :
                      'bg-secondary/10 text-secondary'
                    }`}>{u.update_type}</span>
                  </div>
                ))}
              </div>
            )}
            {pendingUpdates.length > 0 && (
              <div className="border-t border-border px-5 py-3">
                <p className="text-xs text-primary leading-relaxed">
                  💡 <strong>Recomendación:</strong> Mantener plugins y temas actualizados es esencial para la seguridad y rendimiento de tu sitio. Contacta a soporte para programar las actualizaciones.
                </p>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* 2. Optimización de Imágenes */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel rounded-2xl overflow-hidden">
        <SectionHeader
          sectionKey="images"
          icon={Image}
          title="Optimización de Imágenes"
          count={scanningImages ? -1 : imageIssues.reduce((a, i) => a + i.needs_conversion, 0)}
          color="bg-warning/10 text-warning"
        />
        {expanded.images && (
          <div className="border-t border-border">
            {scanningImages ? (
              <div className="flex items-center justify-center gap-2 p-6 text-sm text-text-muted">
                <Loader2 size={16} className="animate-spin text-primary" />
                Escaneando imágenes de tus sitios...
              </div>
            ) : imageIssues.length === 0 ? (
              <div className="flex items-center gap-3 p-5 text-sm text-text-muted">
                <CheckCircle2 size={16} className="text-success" />
                No se detectaron imágenes sin optimizar.
              </div>
            ) : (
              <>
                <div className="divide-y divide-border">
                  {imageIssues.map((img, i) => (
                    <div key={i} className="flex items-center gap-4 px-5 py-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
                        <Image size={14} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">{img.project_name}</p>
                        <p className="text-xs text-text-muted mt-0.5">
                          {img.total_images} imágenes · {img.needs_conversion > 0 ? (
                            <span className="text-warning font-medium">{img.needs_conversion} necesitan conversión a WebP</span>
                          ) : (
                            <span className="text-success font-medium">Todas optimizadas</span>
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${img.needs_conversion > 0 ? 'text-warning' : 'text-success'}`}>
                          {Math.round((img.optimized / img.total_images) * 100)}%
                        </p>
                        <p className="text-[10px] text-text-muted">optimizado</p>
                      </div>
                    </div>
                  ))}
                </div>
                {imageIssues.some(i => i.needs_conversion > 0) && (
                  <div className="border-t border-border px-5 py-3">
                    <p className="text-xs text-primary leading-relaxed">
                      💡 <strong>Recomendación:</strong> Convertir imágenes PNG/JPG a formato WebP puede reducir el peso de tu sitio hasta un 30%, mejorando la velocidad de carga y el SEO. Contacta a soporte para realizar la optimización.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </motion.div>

      {/* 3. Plugins: Desactualizados y Alto Consumo */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-panel rounded-2xl overflow-hidden">
        <SectionHeader
          sectionKey="plugins"
          icon={Puzzle}
          title="Plugins: Actualizaciones y Rendimiento"
          count={scanningPlugins ? -1 : pluginIssues.filter(p => p.outdated || p.impact === 'high').length}
          color="bg-danger/10 text-danger"
        />
        {expanded.plugins && (
          <div className="border-t border-border">
            {scanningPlugins ? (
              <div className="flex items-center justify-center gap-2 p-6 text-sm text-text-muted">
                <Loader2 size={16} className="animate-spin text-primary" />
                Analizando plugins instalados...
              </div>
            ) : pluginIssues.length === 0 ? (
              <div className="flex items-center gap-3 p-5 text-sm text-text-muted">
                <CheckCircle2 size={16} className="text-success" />
                Todos los plugins están actualizados y sin alto consumo de recursos.
              </div>
            ) : (
              <>
                <div className="divide-y divide-border">
                  {pluginIssues.map((pl, i) => {
                    const isHigh = pl.impact === 'high';
                    const isMedium = pl.impact === 'medium';
                    return (
                      <div key={i} className="px-5 py-3 hover:bg-surface-hover/50 transition-colors">
                        <div className="flex items-start gap-4">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            pl.outdated ? 'bg-orange-500/10 text-orange-400' : isHigh ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'
                          }`}>
                            {pl.outdated ? <RefreshCw size={14} /> : isHigh ? <XCircle size={14} /> : <AlertTriangle size={14} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-white truncate">{pl.name}</p>
                              {pl.outdated && (
                                <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold text-orange-400">Desactualizado</span>
                              )}
                              {(isHigh || isMedium) && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isHigh ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>
                                  {isHigh ? 'Alto impacto' : 'Medio impacto'}
                                </span>
                              )}
                              {!pl.is_active && <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] text-text-muted">Inactivo</span>}
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[10px] text-text-muted">{pl.project_name}</span>
                              <span className="text-[10px] text-text-muted">v{pl.current_version || '?'}</span>
                              {pl.outdated && pl.latest_version && (
                                <span className="text-[10px] text-orange-400 font-medium">→ v{pl.latest_version} disponible</span>
                              )}
                              {!pl.outdated && pl.latest_version && pl.current_version === pl.latest_version && (
                                <span className="text-[10px] text-success">Al día</span>
                              )}
                            </div>
                            <p className="text-xs text-text-muted mt-1">{pl.description}</p>
                          </div>
                        </div>
                        {pl.suggestion && (
                          <div className="mt-2 ml-12 rounded-lg bg-primary/5 border border-primary/10 px-3 py-2">
                            <p className="text-xs text-primary leading-relaxed">💡 {pl.suggestion}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {(pluginIssues.some(p => p.outdated) || pluginIssues.some(p => p.impact === 'high')) && (
                  <div className="border-t border-border px-5 py-3">
                    <p className="text-xs text-primary leading-relaxed">
                      💡 <strong>Recomendación:</strong> {pluginIssues.some(p => p.outdated) ? 'Mantén tus plugins actualizados para evitar vulnerabilidades de seguridad. ' : ''}{pluginIssues.some(p => p.impact === 'high') ? 'Los plugins de alto impacto pueden ralentizar significativamente tu sitio. Considera desactivar los que no uses.' : ''}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </motion.div>

      {/* 4. Operatividad */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-panel rounded-2xl overflow-hidden">
        <SectionHeader
          sectionKey="uptime"
          icon={Activity}
          title="Operatividad"
          count={uptimeInfo.filter(u => u.uptime30d < 99.5 || u.status === 'down').length}
          color="bg-success/10 text-success"
        />
        {expanded.uptime && (
          <div className="border-t border-border">
            {uptimeInfo.length === 0 ? (
              <div className="flex items-center gap-3 p-5 text-sm text-text-muted">
                <CheckCircle2 size={16} className="text-success" />
                No hay datos de monitoreo disponibles.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {uptimeInfo.map((u, i) => {
                  const isGood = u.uptime30d >= 99.5 && u.status !== 'down';
                  return (
                    <div key={i} className="flex items-center gap-4 px-5 py-3">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isGood ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                        {isGood ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">{u.project_name}</p>
                        <div className="flex items-center gap-4 mt-0.5">
                          <span className="flex items-center gap-1 text-xs text-text-muted">
                            <Activity size={10} />
                            <span className={u.uptime30d >= 99.5 ? 'text-success' : u.uptime30d >= 99 ? 'text-warning' : 'text-danger'}>
                              {u.uptime30d}%
                            </span> uptime
                          </span>
                          {u.avgResponse > 0 && (
                            <span className="flex items-center gap-1 text-xs text-text-muted">
                              <Clock size={10} />
                              {u.avgResponse}ms
                            </span>
                          )}
                          {u.downEvents > 0 && (
                            <span className="flex items-center gap-1 text-xs text-danger">
                              <XCircle size={10} />
                              {u.downEvents} caídas
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                        u.status === 'down' ? 'bg-danger/10 text-danger' :
                        u.status === 'warning' ? 'bg-warning/10 text-warning' :
                        'bg-success/10 text-success'
                      }`}>
                        {u.status === 'up' ? 'En Línea' : u.status === 'down' ? 'Caído' : 'Advertencia'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {uptimeInfo.some(u => u.uptime30d < 99.5) && (
              <div className="border-t border-border px-5 py-3">
                <p className="text-xs text-primary leading-relaxed">
                  💡 <strong>Recomendación:</strong> Un uptime inferior al 99.5% indica problemas de estabilidad. Esto puede deberse a problemas del hosting, plugins con errores o falta de recursos del servidor. Contacta a soporte para una revisión.
                </p>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
