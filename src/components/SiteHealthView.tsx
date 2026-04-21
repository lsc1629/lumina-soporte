import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Loader2,
  Search,
  ChevronRight,
  ChevronDown,
  Globe,
  Building2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Server,
  Wifi,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  ArrowUpCircle,
  ArrowDownCircle,
  Eye,
  RefreshCw,
  Database,
  Code,
  Palette,
  Zap,
  HardDrive,
  ShieldOff,
  FileCode,
} from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import LoadingScreen from './LoadingScreen';


interface ClientInfo {
  id: string;
  full_name: string;
  email: string;
  company_name: string;
  project_count: number;
}

interface ProjectHealth {
  id: string;
  name: string;
  url: string;
  platform: string;
  status: string;
  hosting_provider: string;
  ssl_expiry: string | null;
  response_time_ms: number | null;
  last_check_at: string | null;
  uptime30d: number;
  avgResponse: number;
  downEvents: number;
  lastIncident: string | null;
  pluginCount: number;
  outdatedPlugins: number;
  themeCount: number;
}

interface ScanResult {
  ssl: {
    active: boolean;
    issuer: string | null;
    expiry: string | null;
    days_left: number | null;
    protocol: string | null;
  };
  server: {
    software: string | null;
    powered_by: string | null;
    php_version: string | null;
    content_encoding: string | null;
    cache_control: string | null;
    cdn: string | null;
  };
  wordpress: {
    version: string | null;
    theme: string | null;
    rest_api: boolean;
    multisite: boolean;
    language: string | null;
    timezone: string | null;
    db_version: string | null;
    memory_limit: string | null;
    max_upload: string | null;
    debug_mode: boolean;
    cron_active: boolean;
    permalink_structure: string | null;
  } | null;
  performance: {
    ttfb_ms: number | null;
    total_time_ms: number | null;
    page_size_kb: number | null;
    gzip: boolean;
  };
  security: {
    x_frame_options: string | null;
    x_content_type: string | null;
    strict_transport: boolean;
    csp: boolean;
    x_xss_protection: string | null;
  };
}

type ViewMode = 'clients' | 'detail';

export default function SiteHealthView() {
  const [viewMode, setViewMode] = useState<ViewMode>('clients');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientInfo | null>(null);
  const [projectsHealth, setProjectsHealth] = useState<ProjectHealth[]>([]);

  // Scan state per project
  const [scanResults, setScanResults] = useState<Record<string, ScanResult>>({});
  const [scanning, setScanning] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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
    setScanResults({});
    setScanning({});
    setExpanded({});

    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, url, platform, status, hosting_provider, ssl_expiry, response_time_ms, last_check_at')
      .eq('owner_id', client.id)
      .eq('is_active', true)
      .order('name');

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const projectIds = (projects || []).map(p => p.id);

    const [uptimeRes, incidentRes, pluginsRes] = await Promise.all([
      projectIds.length > 0
        ? supabase.from('uptime_logs').select('project_id, status, response_time_ms').in('project_id', projectIds).gte('checked_at', thirtyDaysAgo)
        : Promise.resolve({ data: [] as any[] }),
      projectIds.length > 0
        ? supabase.from('incidents').select('project_id, started_at').in('project_id', projectIds).order('started_at', { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      projectIds.length > 0
        ? supabase.from('project_plugins').select('project_id, plugin_type, current_version, latest_version').in('project_id', projectIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const uptimeLogs = uptimeRes.data || [];
    const incidents = incidentRes.data || [];
    const allPlugins = pluginsRes.data || [];

    const healthList: ProjectHealth[] = (projects || []).map(p => {
      const logs = uptimeLogs.filter((l: any) => l.project_id === p.id);
      const upCount = logs.filter((l: any) => l.status === 'up').length;
      const uptime30d = logs.length > 0 ? Math.round((upCount / logs.length) * 10000) / 100 : 100;
      const respTimes = logs.filter((l: any) => l.response_time_ms > 0).map((l: any) => l.response_time_ms);
      const avgResponse = respTimes.length > 0 ? Math.round(respTimes.reduce((a: number, b: number) => a + b, 0) / respTimes.length) : 0;
      const downEvents = logs.filter((l: any) => l.status === 'down').length;

      const projIncidents = incidents.filter((inc: any) => inc.project_id === p.id);
      const lastIncident = projIncidents.length > 0 ? projIncidents[0].started_at : null;

      const projPlugins = allPlugins.filter((pl: any) => pl.project_id === p.id);
      const plugins = projPlugins.filter((pl: any) => pl.plugin_type === 'plugin' || pl.plugin_type === 'app');
      const themes = projPlugins.filter((pl: any) => pl.plugin_type === 'theme');
      const outdated = projPlugins.filter((pl: any) => pl.latest_version && pl.latest_version !== '' && pl.latest_version !== 'unknown' && pl.latest_version !== pl.current_version);

      return {
        id: p.id, name: p.name, url: p.url, platform: p.platform, status: p.status || 'up',
        hosting_provider: p.hosting_provider || '', ssl_expiry: p.ssl_expiry,
        response_time_ms: p.response_time_ms, last_check_at: p.last_check_at,
        uptime30d, avgResponse, downEvents, lastIncident,
        pluginCount: plugins.length, outdatedPlugins: outdated.length, themeCount: themes.length,
      };
    });

    setProjectsHealth(healthList);
    setViewMode('detail');
    setLoading(false);

    // Auto-scan all projects
    for (const p of healthList) {
      scanProject(p.id);
    }
  };

  const scanProject = async (projectId: string) => {
    setScanning(prev => ({ ...prev, [projectId]: true }));
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/site-health`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.health) {
          setScanResults(prev => ({ ...prev, [projectId]: data.health }));
        }
      }
    } catch { /* silently fail */ }
    setScanning(prev => ({ ...prev, [projectId]: false }));
  };

  const goBack = () => {
    setSearch('');
    setViewMode('clients');
    setSelectedClient(null);
  };

  const toggleExpand = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const getSslStatus = (p: ProjectHealth, scan?: ScanResult): { label: string; color: string; icon: typeof ShieldCheck } => {
    // Prefer scan result
    if (scan) {
      if (scan.ssl.active) {
        if (scan.ssl.days_left !== null) {
          if (scan.ssl.days_left < 0) return { label: 'Expirado', color: 'text-danger', icon: Unlock };
          if (scan.ssl.days_left < 14) return { label: `${scan.ssl.days_left}d restantes`, color: 'text-warning', icon: ShieldAlert };
          if (scan.ssl.days_left < 30) return { label: `${scan.ssl.days_left}d restantes`, color: 'text-primary', icon: Shield };
          return { label: 'Válido', color: 'text-success', icon: ShieldCheck };
        }
        return { label: 'Activo', color: 'text-success', icon: ShieldCheck };
      }
      return { label: 'Sin SSL', color: 'text-danger', icon: Unlock };
    }
    // Fallback to DB
    if (!p.ssl_expiry) {
      // If URL starts with https, mark as active anyway
      if (p.url?.startsWith('https')) return { label: 'Activo (sin fecha)', color: 'text-success', icon: ShieldCheck };
      return { label: 'Sin datos', color: 'text-text-muted', icon: Shield };
    }
    const daysLeft = Math.floor((new Date(p.ssl_expiry).getTime() - Date.now()) / 86400000);
    if (daysLeft < 0) return { label: 'Expirado', color: 'text-danger', icon: Unlock };
    if (daysLeft < 14) return { label: `${daysLeft}d restantes`, color: 'text-warning', icon: ShieldAlert };
    if (daysLeft < 30) return { label: `${daysLeft}d restantes`, color: 'text-primary', icon: Shield };
    return { label: 'Válido', color: 'text-success', icon: ShieldCheck };
  };

  const getOverallHealth = (p: ProjectHealth, scan?: ScanResult): { score: number; label: string; color: string } => {
    let score = 100;
    if (p.status === 'down') score -= 40;
    else if (p.status === 'warning') score -= 15;
    if (p.uptime30d < 99) score -= 20;
    else if (p.uptime30d < 99.9) score -= 10;
    if (p.avgResponse > 2000) score -= 15;
    else if (p.avgResponse > 1000) score -= 8;
    // SSL from scan
    if (scan) {
      if (!scan.ssl.active) score -= 20;
      else if (scan.ssl.days_left !== null && scan.ssl.days_left < 14) score -= 10;
    } else if (p.ssl_expiry) {
      const daysLeft = Math.floor((new Date(p.ssl_expiry).getTime() - Date.now()) / 86400000);
      if (daysLeft < 0) score -= 20;
      else if (daysLeft < 14) score -= 10;
    }
    if (p.outdatedPlugins > 5) score -= 15;
    else if (p.outdatedPlugins > 0) score -= 5;
    // Security headers
    if (scan) {
      let secScore = 0;
      if (scan.security.strict_transport) secScore++;
      if (scan.security.csp) secScore++;
      if (scan.security.x_frame_options) secScore++;
      if (scan.security.x_content_type) secScore++;
      if (secScore < 2) score -= 5;
    }

    score = Math.max(0, Math.min(100, score));
    const label = score >= 90 ? 'Saludable' : score >= 70 ? 'Aceptable' : score >= 50 ? 'Necesita atención' : 'Crítico';
    const color = score >= 90 ? 'text-success' : score >= 70 ? 'text-primary' : score >= 50 ? 'text-warning' : 'text-danger';
    return { score, label, color };
  };

  const filteredClients = clients.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  const InfoRow = ({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | null; color?: string }) => {
    if (!value) return null;
    return (
      <div className="flex items-center gap-3 py-2">
        <Icon size={14} className={color || 'text-text-muted'} />
        <span className="text-xs text-text-muted w-36 shrink-0">{label}</span>
        <span className="text-sm text-white font-medium truncate">{value}</span>
      </div>
    );
  };

  const SecurityBadge = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
      {ok ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
      {label}
    </span>
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
            <h1 className="font-display text-3xl font-bold tracking-tight text-white">Estado de Salud</h1>
            <p className="text-sm text-text-muted">
              {viewMode === 'clients' ? 'Diagnóstico integral de todos los sitios.' : `Sitios de ${selectedClient?.full_name}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <Search size={16} className="text-text-muted" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="w-56 bg-transparent text-sm text-white placeholder-text-muted outline-none" />
        </div>
      </div>

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

      {/* Health Detail */}
      {viewMode === 'detail' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {projectsHealth.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map((project, i) => {
            const scan = scanResults[project.id];
            const isScanning = scanning[project.id];
            const isExpanded = expanded[project.id];
            const health = getOverallHealth(project, scan);
            const ssl = getSslStatus(project, scan);
            const SslIcon = ssl.icon;

            return (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="glass-panel rounded-2xl overflow-hidden"
              >
                {/* Project header with health score */}
                <div className="flex items-center justify-between p-6 border-b border-border">
                  <div className="flex items-center gap-4">
                    <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                      health.score >= 90 ? 'bg-success/10' : health.score >= 70 ? 'bg-primary/10' : health.score >= 50 ? 'bg-warning/10' : 'bg-danger/10'
                    }`}>
                      <span className={`font-display text-2xl font-bold ${health.color}`}>{health.score}</span>
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-semibold text-white">{project.name}</h3>
                      <p className="text-sm text-text-muted">{project.url}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => scanProject(project.id)}
                      disabled={isScanning}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text-muted hover:text-white hover:bg-surface-hover transition-colors disabled:opacity-50"
                    >
                      {isScanning ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      {isScanning ? 'Escaneando...' : 'Escanear'}
                    </button>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${health.color}`}>{health.label}</p>
                      <p className="text-xs text-text-muted capitalize">{project.platform} {project.hosting_provider ? `· ${project.hosting_provider}` : ''}</p>
                    </div>
                  </div>
                </div>

                {/* Health metrics grid */}
                <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
                  {/* Status */}
                  <div className="bg-background p-4">
                    <div className="flex items-center gap-2 mb-2">
                      {project.status === 'up' ? <ArrowUpCircle size={14} className="text-success" /> :
                       project.status === 'down' ? <ArrowDownCircle size={14} className="text-danger" /> :
                       <AlertTriangle size={14} className="text-warning" />}
                      <span className="text-[10px] font-medium text-text-muted uppercase">Estado</span>
                    </div>
                    <p className={`font-display text-lg font-bold ${
                      project.status === 'up' ? 'text-success' : project.status === 'down' ? 'text-danger' : 'text-warning'
                    }`}>
                      {project.status === 'up' ? 'En Línea' : project.status === 'down' ? 'Caído' : 'Advertencia'}
                    </p>
                  </div>

                  {/* Uptime */}
                  <div className="bg-background p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity size={14} className="text-primary" />
                      <span className="text-[10px] font-medium text-text-muted uppercase">Uptime 30d</span>
                    </div>
                    <p className={`font-display text-lg font-bold ${
                      project.uptime30d >= 99.9 ? 'text-success' : project.uptime30d >= 99 ? 'text-primary' : project.uptime30d >= 95 ? 'text-warning' : 'text-danger'
                    }`}>{project.uptime30d}%</p>
                  </div>

                  {/* Response */}
                  <div className="bg-background p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock size={14} className="text-secondary" />
                      <span className="text-[10px] font-medium text-text-muted uppercase">Resp. Prom.</span>
                    </div>
                    <p className={`font-display text-lg font-bold ${
                      project.avgResponse < 500 ? 'text-success' : project.avgResponse < 1000 ? 'text-primary' : project.avgResponse < 2000 ? 'text-warning' : 'text-danger'
                    }`}>{project.avgResponse > 0 ? project.avgResponse : (scan?.performance.total_time_ms || 0)}<span className="text-xs text-text-muted ml-0.5">ms</span></p>
                  </div>

                  {/* SSL */}
                  <div className="bg-background p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <SslIcon size={14} className={ssl.color} />
                      <span className="text-[10px] font-medium text-text-muted uppercase">SSL</span>
                    </div>
                    <p className={`text-sm font-bold ${ssl.color}`}>{ssl.label}</p>
                    {scan?.ssl.expiry && <p className="text-[10px] text-text-muted mt-0.5">Expira: {new Date(scan.ssl.expiry).toLocaleDateString('es-CL')}</p>}
                    {!scan?.ssl.expiry && project.ssl_expiry && <p className="text-[10px] text-text-muted mt-0.5">Expira: {new Date(project.ssl_expiry).toLocaleDateString('es-CL')}</p>}
                    {scan?.ssl.issuer && <p className="text-[10px] text-text-muted mt-0.5">{scan.ssl.issuer}</p>}
                  </div>

                  {/* Plugins */}
                  <div className="bg-background p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Server size={14} className="text-accent" />
                      <span className="text-[10px] font-medium text-text-muted uppercase">Plugins</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="font-display text-lg font-bold text-white">{project.pluginCount}</p>
                      {project.outdatedPlugins > 0 && (
                        <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-bold text-warning">{project.outdatedPlugins} desact.</span>
                      )}
                    </div>
                  </div>

                  {/* Incidents */}
                  <div className="bg-background p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle size={14} className="text-warning" />
                      <span className="text-[10px] font-medium text-text-muted uppercase">Caídas 30d</span>
                    </div>
                    <p className={`font-display text-lg font-bold ${project.downEvents > 0 ? 'text-danger' : 'text-success'}`}>{project.downEvents}</p>
                    {project.lastIncident && (
                      <p className="text-[10px] text-text-muted mt-0.5">Último: {new Date(project.lastIncident).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}</p>
                    )}
                  </div>
                </div>

                {/* Expand button for detailed scan */}
                {scan && (
                  <button
                    onClick={() => toggleExpand(project.id)}
                    className="flex w-full cursor-pointer items-center justify-center gap-2 border-t border-border py-3 text-xs font-medium text-text-muted hover:text-white hover:bg-surface-hover transition-colors"
                  >
                    <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    {isExpanded ? 'Ocultar detalles del servidor' : 'Ver detalles del servidor'}
                  </button>
                )}

                {/* Expanded scan details */}
                <AnimatePresence>
                  {scan && isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-t border-border"
                    >
                      <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2 xl:grid-cols-3">
                        {/* Server Info */}
                        <div className="space-y-1">
                          <h4 className="flex items-center gap-2 text-sm font-bold text-white mb-3">
                            <HardDrive size={14} className="text-primary" /> Servidor
                          </h4>
                          <InfoRow icon={Server} label="Software" value={scan.server.software} color="text-primary" />
                          <InfoRow icon={Code} label="Powered By" value={scan.server.powered_by} color="text-secondary" />
                          <InfoRow icon={FileCode} label="PHP" value={scan.server.php_version ? `v${scan.server.php_version}` : null} color="text-warning" />
                          <InfoRow icon={Zap} label="Compresión" value={scan.server.content_encoding || (scan.performance.gzip ? 'Activa' : 'Sin compresión')} color={scan.performance.gzip ? 'text-success' : 'text-warning'} />
                          <InfoRow icon={Globe} label="CDN" value={scan.server.cdn || 'No detectado'} color={scan.server.cdn ? 'text-success' : 'text-text-muted'} />
                          <InfoRow icon={HardDrive} label="Cache-Control" value={scan.server.cache_control} color="text-text-muted" />
                        </div>

                        {/* SSL Info */}
                        <div className="space-y-1">
                          <h4 className="flex items-center gap-2 text-sm font-bold text-white mb-3">
                            <Lock size={14} className="text-success" /> Certificado SSL
                          </h4>
                          <InfoRow icon={ShieldCheck} label="Estado" value={scan.ssl.active ? 'Activo' : 'Inactivo'} color={scan.ssl.active ? 'text-success' : 'text-danger'} />
                          <InfoRow icon={Shield} label="Emisor" value={scan.ssl.issuer} color="text-primary" />
                          <InfoRow icon={Clock} label="Expira" value={scan.ssl.expiry ? new Date(scan.ssl.expiry).toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' }) : null} color="text-text-muted" />
                          <InfoRow icon={Activity} label="Días restantes" value={scan.ssl.days_left !== null ? `${scan.ssl.days_left} días` : null} color={scan.ssl.days_left !== null && scan.ssl.days_left < 30 ? 'text-warning' : 'text-success'} />
                          <InfoRow icon={Lock} label="Protocolo" value={scan.ssl.protocol} color="text-text-muted" />
                        </div>

                        {/* Performance */}
                        <div className="space-y-1">
                          <h4 className="flex items-center gap-2 text-sm font-bold text-white mb-3">
                            <Zap size={14} className="text-warning" /> Rendimiento
                          </h4>
                          <InfoRow icon={Clock} label="TTFB" value={scan.performance.ttfb_ms ? `${scan.performance.ttfb_ms}ms` : null} color={scan.performance.ttfb_ms && scan.performance.ttfb_ms < 500 ? 'text-success' : 'text-warning'} />
                          <InfoRow icon={Clock} label="Tiempo total" value={scan.performance.total_time_ms ? `${scan.performance.total_time_ms}ms` : null} color="text-primary" />
                          <InfoRow icon={HardDrive} label="Tamaño página" value={scan.performance.page_size_kb ? `${scan.performance.page_size_kb} KB` : null} color={scan.performance.page_size_kb && scan.performance.page_size_kb < 500 ? 'text-success' : 'text-warning'} />
                          <InfoRow icon={Zap} label="Gzip/Brotli" value={scan.performance.gzip ? 'Activo' : 'Inactivo'} color={scan.performance.gzip ? 'text-success' : 'text-danger'} />
                        </div>

                        {/* WordPress Info */}
                        {scan.wordpress && (
                          <div className="space-y-1">
                            <h4 className="flex items-center gap-2 text-sm font-bold text-white mb-3">
                              <Globe size={14} className="text-primary" /> WordPress
                            </h4>
                            <InfoRow icon={Code} label="Versión WP" value={scan.wordpress.version ? `v${scan.wordpress.version}` : 'No detectada'} color="text-primary" />
                            <InfoRow icon={Palette} label="Tema activo" value={scan.wordpress.theme} color="text-secondary" />
                            <InfoRow icon={Database} label="Base de datos" value={scan.wordpress.db_version} color="text-text-muted" />
                            <InfoRow icon={HardDrive} label="Memoria" value={scan.wordpress.memory_limit} color="text-text-muted" />
                            <InfoRow icon={ArrowUpCircle} label="Max Upload" value={scan.wordpress.max_upload} color="text-text-muted" />
                            <InfoRow icon={Wifi} label="REST API" value={scan.wordpress.rest_api ? 'Activa' : 'Inactiva'} color={scan.wordpress.rest_api ? 'text-success' : 'text-danger'} />
                            <InfoRow icon={Clock} label="Zona horaria" value={scan.wordpress.timezone} color="text-text-muted" />
                            <InfoRow icon={AlertTriangle} label="Debug Mode" value={scan.wordpress.debug_mode ? 'ACTIVADO' : 'Desactivado'} color={scan.wordpress.debug_mode ? 'text-danger' : 'text-success'} />
                            <InfoRow icon={Activity} label="WP-Cron" value={scan.wordpress.cron_active ? 'Activo' : 'Inactivo'} color={scan.wordpress.cron_active ? 'text-success' : 'text-warning'} />
                            {scan.wordpress.multisite && <InfoRow icon={Globe} label="Multisite" value="Sí" color="text-primary" />}
                          </div>
                        )}

                        {/* Security Headers */}
                        <div className="space-y-3 md:col-span-2 xl:col-span-2">
                          <h4 className="flex items-center gap-2 text-sm font-bold text-white">
                            <ShieldOff size={14} className="text-danger" /> Headers de Seguridad
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            <SecurityBadge ok={scan.security.strict_transport} label="HSTS" />
                            <SecurityBadge ok={scan.security.csp} label="CSP" />
                            <SecurityBadge ok={!!scan.security.x_frame_options} label="X-Frame-Options" />
                            <SecurityBadge ok={!!scan.security.x_content_type} label="X-Content-Type" />
                            <SecurityBadge ok={!!scan.security.x_xss_protection} label="X-XSS-Protection" />
                          </div>
                          {(!scan.security.strict_transport || !scan.security.csp) && (
                            <p className="text-[11px] text-warning leading-relaxed mt-2">
                              {!scan.security.strict_transport && !scan.security.csp
                                ? 'Se recomienda configurar HSTS y Content-Security-Policy para mejorar la seguridad del sitio.'
                                : !scan.security.strict_transport
                                  ? 'Se recomienda configurar Strict-Transport-Security (HSTS) para forzar conexiones HTTPS.'
                                  : 'Se recomienda configurar Content-Security-Policy (CSP) para prevenir ataques XSS.'}
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Scanning indicator */}
                {isScanning && !scan && (
                  <div className="flex items-center justify-center gap-2 border-t border-border py-4 text-xs text-text-muted">
                    <Loader2 size={14} className="animate-spin text-primary" />
                    Escaneando servidor, SSL y configuración...
                  </div>
                )}
              </motion.div>
            );
          })}

          {projectsHealth.length === 0 && (
            <div className="glass-panel rounded-2xl p-12 text-center text-text-muted text-sm">Este cliente no tiene proyectos activos.</div>
          )}
        </motion.div>
      )}
    </div>
  );
}
