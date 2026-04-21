import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  RefreshCw, 
  Package, 
  ShieldAlert, 
  CheckCircle2,
  Search,
  ArrowRight,
  ArrowLeft,
  Loader2,
  User,
  Globe,
  Building2,
  ChevronRight,
  Plug,
  CircleDot,
  AlertCircle,
  Plus,
  Palette,
  Ban,
  Clock,
  Trash2,
  HelpCircle,
  Download,
  ToggleLeft,
  ToggleRight,
  Upload,
  Zap
} from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import LoadingScreen from './LoadingScreen';


async function callFetchPlugins(projectId: string): Promise<{ plugins: any[]; api_error: string | null; fetched_count: number; wp_version?: string | null; wp_latest_version?: string | null }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-plugins`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ project_id: projectId }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
  }
  return res.json();
}

async function callUpdatePlugin(projectId: string, pluginSlug: string, updateType: 'plugin' | 'theme' | 'core', pluginFile?: string): Promise<{ success: boolean; error?: string; new_version?: string; message?: string; needs_mu_plugin?: boolean }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/update-plugin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ project_id: projectId, plugin_slug: pluginSlug, update_type: updateType, plugin_file: pluginFile }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
  }
  return res.json();
}

async function callManagePlugin(projectId: string, action: 'toggle_auto_update' | 'delete_plugin' | 'install_plugin', pluginSlug: string, pluginFile?: string, enable?: boolean): Promise<{ success: boolean; error?: string; message?: string; auto_update?: boolean; code?: string; name?: string; version?: string }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-plugin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ project_id: projectId, action, plugin_slug: pluginSlug, plugin_file: pluginFile, enable }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);
  }
  return res.json();
}

interface ClientInfo {
  id: string;
  full_name: string;
  email: string;
  company_name: string;
  project_count: number;
  pending_updates: number;
}

interface ProjectInfo {
  id: string;
  name: string;
  url: string;
  platform: string;
  owner_id: string;
}

interface PluginInfo {
  id: string;
  name: string;
  slug: string;
  current_version: string;
  latest_version: string;
  is_active: boolean;
  plugin_type: string;
  author: string;
  plugin_file: string;
  needs_update: boolean;
  is_unknown: boolean;
  auto_update: boolean;
}

type ViewMode = 'clients' | 'projects' | 'summary' | 'plugins';
type PluginTab = 'all' | 'update' | 'active' | 'inactive' | 'unknown' | 'excluded' | 'in_progress';

const PLUGIN_PLATFORMS = ['wordpress', 'woocommerce', 'wordpress-headless', 'woo-headless'];
const APP_PLATFORMS = ['shopify', 'shopify-headless', 'jumpseller'];

function getTermLabel(platform: string): { singular: string; plural: string } {
  if (APP_PLATFORMS.includes(platform)) return { singular: 'App', plural: 'Apps' };
  return { singular: 'Plugin', plural: 'Plugins' };
}

export default function UpdatesView() {
  const [viewMode, setViewMode] = useState<ViewMode>('clients');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Clients
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientInfo | null>(null);

  // Projects
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectInfo | null>(null);

  // Plugins/Apps
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [showAddPlugin, setShowAddPlugin] = useState(false);
  const [newPlugin, setNewPlugin] = useState({ name: '', slug: '', current_version: '', plugin_type: 'plugin' });
  const [savingPlugin, setSavingPlugin] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [updatingPluginId, setUpdatingPluginId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pluginTab, setPluginTab] = useState<PluginTab>('all');
  const [detailType, setDetailType] = useState<'plugin' | 'theme'>('plugin');

  // WordPress core version
  const [wpVersion, setWpVersion] = useState<string | null>(null);
  const [wpLatestVersion, setWpLatestVersion] = useState<string | null>(null);

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<PluginInfo | null>(null);

  // Global stats
  const [globalStats, setGlobalStats] = useState({ critical: 0, pending: 0 });

  useEffect(() => { loadClients(); }, []);

  const loadClients = async () => {
    setLoading(true);
    // Get all clients that have projects
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, company_name')
      .order('full_name');

    const { data: allProjects } = await supabase
      .from('projects')
      .select('id, owner_id')
      .eq('is_active', true);

    const { data: allUpdates } = await supabase
      .from('project_updates')
      .select('id, project_id, priority')
      .eq('status', 'pending');

    const projectsByOwner = new Map<string, string[]>();
    (allProjects || []).forEach(p => {
      const list = projectsByOwner.get(p.owner_id) || [];
      list.push(p.id);
      projectsByOwner.set(p.owner_id, list);
    });

    const updatesByProject = new Map<string, typeof allUpdates>();
    (allUpdates || []).forEach(u => {
      const list = updatesByProject.get(u.project_id) || [];
      list.push(u);
      updatesByProject.set(u.project_id, list);
    });

    const clientList: ClientInfo[] = (profiles || [])
      .filter(p => projectsByOwner.has(p.id))
      .map(p => {
        const projIds = projectsByOwner.get(p.id) || [];
        let pending = 0;
        projIds.forEach(pid => {
          pending += (updatesByProject.get(pid) || []).length;
        });
        return {
          id: p.id,
          full_name: p.full_name || 'Sin nombre',
          email: p.email || '',
          company_name: p.company_name || '',
          project_count: projIds.length,
          pending_updates: pending,
        };
      });

    setClients(clientList);
    setGlobalStats({
      critical: (allUpdates || []).filter(u => u.priority === 'critical' || u.priority === 'high').length,
      pending: (allUpdates || []).length,
    });
    setLoading(false);
  };

  const selectClient = async (client: ClientInfo) => {
    setSelectedClient(client);
    setLoading(true);
    setSearchQuery('');

    const { data } = await supabase
      .from('projects')
      .select('id, name, url, platform, owner_id')
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
    setSearchQuery('');
    setShowAddPlugin(false);
    setSyncError(null);
    setPluginTab('all');

    // Check if platform supports plugin fetching
    const hasFetchablePlugins = ['wordpress', 'headless', 'shopify', 'jumpseller'].includes(project.platform);

    if (hasFetchablePlugins) {
      setSyncing(true);
      setWpVersion(null);
      try {
        const fnData = await callFetchPlugins(project.id);

        if (fnData.api_error) {
          setSyncError(fnData.api_error);
        }
        if (fnData.wp_version) setWpVersion(fnData.wp_version);
        if (fnData.wp_latest_version) setWpLatestVersion(fnData.wp_latest_version);

        const pluginList: PluginInfo[] = (fnData.plugins || []).map((p: PluginInfo) => ({
          ...p,
          needs_update: !!(p.latest_version && p.latest_version !== '' && p.latest_version !== 'unknown' && p.latest_version !== p.current_version),
          is_unknown: p.latest_version === 'unknown',
        }));
        setPlugins(pluginList);
        setSyncing(false);
        setViewMode('summary');
        setLoading(false);
        return;
      } catch (e) {
        setSyncError(e instanceof Error ? e.message : 'Error de conexión con Edge Function');
      }
      setSyncing(false);
    }

    // Fallback: load directly from project_plugins table
    const { data } = await supabase
      .from('project_plugins')
      .select('id, name, slug, current_version, latest_version, is_active, plugin_type, author, plugin_file, auto_update')
      .eq('project_id', project.id)
      .order('name');

    const pluginList: PluginInfo[] = (data || []).map(p => ({
      ...p,
      plugin_file: p.plugin_file || '',
      auto_update: p.auto_update ?? false,
      needs_update: !!(p.latest_version && p.latest_version !== '' && p.latest_version !== 'unknown' && p.latest_version !== p.current_version),
      is_unknown: p.latest_version === 'unknown',
    }));

    setPlugins(pluginList);
    setViewMode('summary');
    setLoading(false);
  };

  const syncPlugins = async () => {
    if (!selectedProject) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const fnData = await callFetchPlugins(selectedProject.id);
      if (fnData.api_error) {
        setSyncError(fnData.api_error);
      }
      if (fnData.wp_version) setWpVersion(fnData.wp_version);
      if (fnData.wp_latest_version) setWpLatestVersion(fnData.wp_latest_version);
      setPlugins((fnData.plugins || []).map((p: PluginInfo) => ({
        ...p,
        needs_update: !!(p.latest_version && p.latest_version !== '' && p.latest_version !== 'unknown' && p.latest_version !== p.current_version),
        is_unknown: p.latest_version === 'unknown',
      })));
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Error de conexión con Edge Function');
    }
    setSyncing(false);
  };

  const goBack = () => {
    setSearchQuery('');
    if (viewMode === 'plugins') {
      setViewMode('summary');
    } else if (viewMode === 'summary') {
      setViewMode('projects');
      setSelectedProject(null);
      setPlugins([]);
      setShowAddPlugin(false);
    } else if (viewMode === 'projects') {
      setViewMode('clients');
      setSelectedClient(null);
      setProjects([]);
    }
  };

  const updatePlugin = async (plugin: PluginInfo) => {
    if (!selectedProject) return;
    setUpdatingPluginId(plugin.id);
    setSyncError(null);
    try {
      const updateType = plugin.plugin_type === 'theme' ? 'theme' as const : plugin.slug === 'wordpress-core' ? 'core' as const : 'plugin' as const;
      const result = await callUpdatePlugin(selectedProject.id, plugin.slug, updateType, plugin.plugin_file || undefined);

      if (result.needs_mu_plugin) {
        setSyncError('⚠️ Instala el plugin Lumina Updater en WordPress para habilitar actualizaciones remotas. Descárgalo desde el banner azul.');
        return;
      }

      if (!result.success) {
        setSyncError(`Error al actualizar ${plugin.name}: ${result.error}`);
        return;
      }

      // Update succeeded — resync to get fresh data from WP
      setSyncing(true);
      try {
        const fnData = await callFetchPlugins(selectedProject.id);
        if (fnData.wp_version) setWpVersion(fnData.wp_version);
        if (fnData.wp_latest_version) setWpLatestVersion(fnData.wp_latest_version);
        setPlugins((fnData.plugins || []).map((p: PluginInfo) => ({
          ...p,
          needs_update: !!(p.latest_version && p.latest_version !== '' && p.latest_version !== 'unknown' && p.latest_version !== p.current_version),
          is_unknown: p.latest_version === 'unknown',
        })));
      } catch (syncErr) {
        console.error('[updatePlugin] resync failed:', syncErr);
      }
    } catch (e) {
      console.error('[updatePlugin] exception:', e);
      setSyncError(`Error de conexión: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUpdatingPluginId(null);
      setSyncing(false);
    }
  };

  const confirmDeletePlugin = async () => {
    const plugin = deleteTarget;
    if (!plugin || !selectedProject) return;
    setDeleteTarget(null);
    setUpdatingPluginId(plugin.id);
    setSyncError(null);

    const isWp = ['wordpress', 'headless'].includes(selectedProject.platform);
    if (isWp && plugin.plugin_file) {
      try {
        const result = await callManagePlugin(selectedProject.id, 'delete_plugin', plugin.slug, plugin.plugin_file);
        if (!result.success) {
          setSyncError(`Error al eliminar ${plugin.name}: ${result.error}`);
          setUpdatingPluginId(null);
          return;
        }
      } catch (e) {
        setSyncError(`Error de conexión: ${e instanceof Error ? e.message : String(e)}`);
        setUpdatingPluginId(null);
        return;
      }
    } else {
      await supabase.from('project_plugins').delete().eq('id', plugin.id);
    }

    setPlugins(prev => prev.filter(p => p.id !== plugin.id));
    setUpdatingPluginId(null);
  };

  const toggleAutoUpdate = async (plugin: PluginInfo) => {
    if (!selectedProject) return;
    setUpdatingPluginId(plugin.id);
    setSyncError(null);
    try {
      const newState = !plugin.auto_update;
      const result = await callManagePlugin(selectedProject.id, 'toggle_auto_update', plugin.slug, plugin.plugin_file || undefined, newState);
      if (!result.success) {
        setSyncError(`Error: ${result.error}`);
      } else {
        setPlugins(prev => prev.map(p => p.id === plugin.id ? { ...p, auto_update: result.auto_update ?? newState } : p));
      }
    } catch (e) {
      setSyncError(`Error de conexión: ${e instanceof Error ? e.message : String(e)}`);
    }
    setUpdatingPluginId(null);
  };

  const installPlugin = async (pluginSlug: string) => {
    if (!selectedProject) return;
    setSyncError(null);
    setSyncing(true);
    try {
      const result = await callManagePlugin(selectedProject.id, 'install_plugin', pluginSlug);
      if (!result.success) {
        setSyncError(`Error al instalar ${pluginSlug}: ${result.error}`);
      } else {
        // Re-sync to get the full updated list
        const fnData = await callFetchPlugins(selectedProject.id);
        if (fnData.wp_version) setWpVersion(fnData.wp_version);
        if (fnData.wp_latest_version) setWpLatestVersion(fnData.wp_latest_version);
        setPlugins((fnData.plugins || []).map((p: PluginInfo) => ({
          ...p,
          needs_update: !!(p.latest_version && p.latest_version !== '' && p.latest_version !== 'unknown' && p.latest_version !== p.current_version),
          is_unknown: p.latest_version === 'unknown',
        })));
      }
    } catch (e) {
      setSyncError(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setSyncing(false);
  };

  const updateCore = async () => {
    if (!selectedProject) return;
    setUpdatingPluginId('core');
    setSyncError(null);
    try {
      const result = await callUpdatePlugin(selectedProject.id, 'wordpress-core', 'core');
      if (result.needs_mu_plugin) {
        setSyncError('⚠️ Instala el plugin Lumina Updater en WordPress para actualizar el core remotamente.');
      } else if (!result.success) {
        setSyncError(`Error al actualizar WordPress Core: ${result.error}`);
      } else {
        // Re-sync
        setSyncing(true);
        const fnData = await callFetchPlugins(selectedProject.id);
        if (fnData.wp_version) setWpVersion(fnData.wp_version);
        if (fnData.wp_latest_version) setWpLatestVersion(fnData.wp_latest_version);
        setPlugins((fnData.plugins || []).map((p: PluginInfo) => ({
          ...p,
          needs_update: !!(p.latest_version && p.latest_version !== '' && p.latest_version !== 'unknown' && p.latest_version !== p.current_version),
          is_unknown: p.latest_version === 'unknown',
        })));
        setSyncing(false);
      }
    } catch (e) {
      setSyncError(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setUpdatingPluginId(null);
  };

  const addPlugin = async () => {
    if (!selectedProject || !newPlugin.name.trim() || !newPlugin.slug.trim()) return;
    setSavingPlugin(true);
    const term = getTermLabel(selectedProject.platform);
    const { data } = await supabase.from('project_plugins').insert({
      project_id: selectedProject.id,
      name: newPlugin.name.trim(),
      slug: newPlugin.slug.trim(),
      current_version: newPlugin.current_version.trim(),
      plugin_type: APP_PLATFORMS.includes(selectedProject.platform) ? 'app' : newPlugin.plugin_type,
    }).select('id, name, slug, current_version, latest_version, is_active, plugin_type, author, plugin_file, auto_update').single();
    if (data) {
      setPlugins(prev => [...prev, { ...data, plugin_file: data.plugin_file || '', auto_update: data.auto_update ?? false, needs_update: false, is_unknown: data.latest_version === 'unknown' }]);
    }
    setNewPlugin({ name: '', slug: '', current_version: '', plugin_type: 'plugin' });
    setShowAddPlugin(false);
    setSavingPlugin(false);
  };

  const filteredClients = clients.filter(c =>
    c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.company_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPlugins = plugins.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pluginItems = plugins.filter(p => p.plugin_type === 'plugin' || p.plugin_type === 'app');
  const themeItems = plugins.filter(p => p.plugin_type === 'theme');
  const outdatedPlugins = pluginItems.filter(p => p.needs_update).length;
  const outdatedThemes = themeItems.filter(p => p.needs_update).length;
  const outdatedCount = plugins.filter(p => p.needs_update).length;
  const termLabel = selectedProject ? getTermLabel(selectedProject.platform) : { singular: 'Plugin', plural: 'Plugins' };

  // Tab filtering for plugin detail view
  const activePluginList = plugins.filter(p => p.plugin_type === (detailType === 'plugin' ? 'plugin' : 'theme') || (detailType === 'plugin' && p.plugin_type === 'app'));
  const getTabFiltered = () => {
    let list = activePluginList;
    switch (pluginTab) {
      case 'update': list = list.filter(p => p.needs_update); break;
      case 'active': list = list.filter(p => p.is_active); break;
      case 'inactive': list = list.filter(p => !p.is_active); break;
      case 'unknown': list = list.filter(p => p.is_unknown); break;
      case 'excluded': list = []; break;
      case 'in_progress': list = []; break;
    }
    if (searchQuery) {
      list = list.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.slug.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return list;
  };
  const tabCounts = {
    all: activePluginList.length,
    update: activePluginList.filter(p => p.needs_update).length,
    active: activePluginList.filter(p => p.is_active).length,
    inactive: activePluginList.filter(p => !p.is_active).length,
    unknown: activePluginList.filter(p => p.is_unknown).length,
    excluded: 0,
    in_progress: 0,
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
              <ArrowLeft size={20} />
            </button>
          )}
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-white">Actualizaciones</h1>
            <p className="text-sm text-text-muted">
              {viewMode === 'clients' && 'Selecciona un cliente para ver sus proyectos.'}
              {viewMode === 'projects' && `Proyectos de ${selectedClient?.full_name}`}
              {viewMode === 'plugins' && `${termLabel.plural} de ${selectedProject?.name}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
            <Search size={16} className="text-text-muted" />
            <input type="text" placeholder={viewMode === 'clients' ? 'Buscar cliente...' : viewMode === 'projects' ? 'Buscar proyecto...' : 'Buscar plugin...'} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-56 bg-transparent text-sm text-white placeholder-text-muted outline-none" />
          </div>
          {viewMode === 'plugins' && (
            <button onClick={() => setShowAddPlugin(!showAddPlugin)} className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover shadow-lg shadow-primary/20">
              <Plus size={16} />
              Agregar {termLabel.singular}
            </button>
          )}
        </div>
      </div>

      {/* Breadcrumb */}
      {viewMode !== 'clients' && (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <button onClick={() => { setViewMode('clients'); setSelectedClient(null); setSelectedProject(null); setSearchQuery(''); }} className="cursor-pointer hover:text-primary transition-colors">Clientes</button>
          <ChevronRight size={14} />
          {selectedClient && (
            <>
              <button onClick={() => { if (viewMode !== 'projects') { setViewMode('projects'); setSelectedProject(null); setPlugins([]); } }} className={`${viewMode !== 'projects' ? 'cursor-pointer hover:text-primary' : 'text-white font-medium'} transition-colors`}>
                {selectedClient.full_name}
              </button>
              {(viewMode === 'summary' || viewMode === 'plugins') && selectedProject && (
                <>
                  <ChevronRight size={14} />
                  <button onClick={() => { if (viewMode === 'plugins') setViewMode('summary'); }} className={`${viewMode === 'plugins' ? 'cursor-pointer hover:text-primary' : 'text-white font-medium'} transition-colors`}>
                    {selectedProject.name}
                  </button>
                  {viewMode === 'plugins' && (
                    <>
                      <ChevronRight size={14} />
                      <span className="text-white font-medium">{detailType === 'plugin' ? termLabel.plural : 'Temas'}</span>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Stats */}
      {viewMode === 'clients' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="glass-panel rounded-2xl p-5 border-l-4 border-l-danger">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10 text-danger"><ShieldAlert size={20} /></div>
              <div>
                <p className="text-sm font-medium text-text-muted">Críticas / Altas</p>
                <h2 className="font-display text-2xl font-bold text-white">{globalStats.critical}</h2>
              </div>
            </div>
          </div>
          <div className="glass-panel rounded-2xl p-5 border-l-4 border-l-warning">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10 text-warning"><Package size={20} /></div>
              <div>
                <p className="text-sm font-medium text-text-muted">Pendientes Total</p>
                <h2 className="font-display text-2xl font-bold text-white">{globalStats.pending}</h2>
              </div>
            </div>
          </div>
          <div className="glass-panel rounded-2xl p-5 border-l-4 border-l-success">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 text-success"><CheckCircle2 size={20} /></div>
              <div>
                <p className="text-sm font-medium text-text-muted">Clientes</p>
                <h2 className="font-display text-2xl font-bold text-white">{clients.length}</h2>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <AnimatePresence mode="wait">
        {/* === Clients List === */}
        {viewMode === 'clients' && (
          <motion.div key="clients" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="glass-panel overflow-hidden rounded-2xl">
            {filteredClients.length === 0 ? (
              <div className="p-12 text-center text-text-muted text-sm">
                {searchQuery ? 'No se encontraron clientes.' : 'No hay clientes con proyectos activos.'}
              </div>
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
                          {client.company_name && (
                            <span className="flex items-center gap-1 text-xs text-text-muted"><Building2 size={10} /> {client.company_name}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-white">{client.project_count} proyecto{client.project_count !== 1 ? 's' : ''}</p>
                        {client.pending_updates > 0 && (
                          <p className="text-xs text-warning">{client.pending_updates} update{client.pending_updates !== 1 ? 's' : ''} pendiente{client.pending_updates !== 1 ? 's' : ''}</p>
                        )}
                      </div>
                      <ChevronRight size={18} className="text-text-muted" />
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* === Projects List === */}
        {viewMode === 'projects' && (
          <motion.div key="projects" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
            {filteredProjects.length === 0 ? (
              <div className="glass-panel p-12 rounded-2xl text-center text-text-muted text-sm">
                {searchQuery ? 'No se encontraron proyectos.' : 'Este cliente no tiene proyectos activos.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProjects.map((project, i) => (
                  <motion.button
                    key={project.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => selectProject(project)}
                    className="glass-panel cursor-pointer rounded-2xl p-5 text-left transition-all hover:border-primary/50 hover:shadow-[0_0_20px_rgba(139,92,246,0.1)]"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Globe size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-lg font-semibold text-white truncate">{project.name}</h3>
                        <p className="text-xs text-text-muted truncate">{project.url}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="rounded-md bg-surface-hover px-2 py-1 text-xs font-medium text-text-muted border border-border capitalize">{project.platform}</span>
                      <ChevronRight size={16} className="text-text-muted" />
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* === Summary View (cards for plugins & themes) === */}
        {viewMode === 'summary' && (
          <motion.div key="summary" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-4">
            {/* Sync error */}
            {syncError && (
              <div className="flex items-center gap-3 rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
                <AlertCircle size={16} />
                <span className="flex-1">{syncError}</span>
                <button onClick={() => setSyncError(null)} className="text-danger/60 hover:text-danger cursor-pointer">✕</button>
              </div>
            )}

            {/* Sync bar */}
            <div className="flex items-center gap-3">
              {syncing && (
                <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-sm text-primary">
                  <Loader2 size={14} className="animate-spin" />
                  <span>Sincronizando con API...</span>
                </div>
              )}
              {selectedProject && ['wordpress', 'headless', 'shopify', 'jumpseller'].includes(selectedProject.platform) && !syncing && (
                <button onClick={syncPlugins} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text-muted hover:text-white hover:bg-surface-hover transition-colors">
                  <RefreshCw size={14} />
                  Sincronizar
                </button>
              )}
            </div>

            {/* Lumina Updater mu-plugin download banner */}
            {selectedProject && ['wordpress', 'headless'].includes(selectedProject.platform) && (
              <div className="flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                  <Download size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">Lumina Updater</p>
                  <p className="text-xs text-text-muted">Instala este plugin en WordPress (<b>Plugins → Añadir nuevo → Subir plugin</b>) para habilitar actualizaciones remotas.</p>
                </div>
                <a
                  href="/lumina-updater.zip"
                  download="lumina-updater.zip"
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/20 transition-colors"
                >
                  <Download size={12} />
                  Descargar .zip
                </a>
              </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Plugins Card */}
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => { setDetailType('plugin'); setPluginTab('all'); setSearchQuery(''); setViewMode('plugins'); }}
                className={`glass-panel cursor-pointer rounded-2xl p-6 text-left transition-all hover:border-primary/50 hover:shadow-[0_0_20px_rgba(139,92,246,0.1)] ${outdatedPlugins > 0 ? 'border-l-4 border-l-warning' : 'border-l-4 border-l-success'}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${outdatedPlugins > 0 ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
                      <Plug size={24} />
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-semibold text-white">{termLabel.plural}</h3>
                      <p className="text-xs text-text-muted">{pluginItems.length} instalados</p>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-text-muted" />
                </div>
                <div className={`grid gap-3 ${pluginItems.some(p => p.is_unknown) ? 'grid-cols-4' : 'grid-cols-3'}`}>
                  <div className="rounded-lg bg-surface/80 p-3 text-center">
                    <p className="font-display text-xl font-bold text-success">{pluginItems.filter(p => p.is_active).length}</p>
                    <p className="text-[10px] text-text-muted mt-0.5">Activos</p>
                  </div>
                  <div className="rounded-lg bg-surface/80 p-3 text-center">
                    <p className="font-display text-xl font-bold text-text-muted">{pluginItems.filter(p => !p.is_active).length}</p>
                    <p className="text-[10px] text-text-muted mt-0.5">Inactivos</p>
                  </div>
                  <div className="rounded-lg bg-surface/80 p-3 text-center">
                    {outdatedPlugins > 0 ? (
                      <motion.p animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="font-display text-xl font-bold text-warning">{outdatedPlugins}</motion.p>
                    ) : (
                      <p className="font-display text-xl font-bold text-success">0</p>
                    )}
                    <p className="text-[10px] text-text-muted mt-0.5">Actualizar</p>
                  </div>
                  {pluginItems.some(p => p.is_unknown) && (
                    <div className="rounded-lg bg-surface/80 p-3 text-center">
                      <p className="font-display text-xl font-bold text-blue-400">{pluginItems.filter(p => p.is_unknown).length}</p>
                      <p className="text-[10px] text-text-muted mt-0.5">Sin verificar</p>
                    </div>
                  )}
                </div>
              </motion.button>

              {/* Themes Card */}
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                onClick={() => { setDetailType('theme'); setPluginTab('all'); setSearchQuery(''); setViewMode('plugins'); }}
                className={`glass-panel cursor-pointer rounded-2xl p-6 text-left transition-all hover:border-primary/50 hover:shadow-[0_0_20px_rgba(139,92,246,0.1)] ${outdatedThemes > 0 ? 'border-l-4 border-l-warning' : 'border-l-4 border-l-success'}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${outdatedThemes > 0 ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'}`}>
                      <Palette size={24} />
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-semibold text-white">Temas</h3>
                      <p className="text-xs text-text-muted">{themeItems.length} instalados</p>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-text-muted" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-surface/80 p-3 text-center">
                    <p className="font-display text-xl font-bold text-success">{themeItems.filter(t => t.is_active).length}</p>
                    <p className="text-[10px] text-text-muted mt-0.5">Activo</p>
                  </div>
                  <div className="rounded-lg bg-surface/80 p-3 text-center">
                    <p className="font-display text-xl font-bold text-text-muted">{themeItems.filter(t => !t.is_active).length}</p>
                    <p className="text-[10px] text-text-muted mt-0.5">Inactivos</p>
                  </div>
                  <div className="rounded-lg bg-surface/80 p-3 text-center">
                    {outdatedThemes > 0 ? (
                      <motion.p animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="font-display text-xl font-bold text-warning">{outdatedThemes}</motion.p>
                    ) : (
                      <p className="font-display text-xl font-bold text-success">0</p>
                    )}
                    <p className="text-[10px] text-text-muted mt-0.5">Actualizar</p>
                  </div>
                </div>
              </motion.button>

              {/* WordPress Core Card — only for WP platforms */}
              {selectedProject && ['wordpress', 'headless'].includes(selectedProject.platform) && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className={`glass-panel rounded-2xl p-6 text-left sm:col-span-2 border-l-4 ${
                    wpVersion && wpLatestVersion && wpVersion !== wpLatestVersion ? 'border-l-warning' : 'border-l-primary'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                        wpVersion && wpLatestVersion && wpVersion !== wpLatestVersion
                          ? 'bg-warning/10 text-warning'
                          : 'bg-primary/10 text-primary'
                      }`}>
                        <Globe size={24} />
                      </div>
                      <div>
                        <h3 className="font-display text-lg font-semibold text-white">WordPress Core</h3>
                        <p className="text-xs text-text-muted">Núcleo del CMS</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {wpVersion ? (
                        <div>
                          {wpLatestVersion && wpVersion !== wpLatestVersion ? (
                            <div className="flex items-center gap-2">
                              <span className="font-display text-xl font-bold text-white">{wpVersion}</span>
                              <ArrowRight size={16} className="text-warning" />
                              <motion.span
                                animate={{ opacity: [1, 0.5, 1] }}
                                transition={{ repeat: Infinity, duration: 1.5 }}
                                className="font-display text-xl font-bold rounded-md bg-warning/10 border border-warning/30 px-2 py-0.5 text-warning"
                              >
                                {wpLatestVersion}
                              </motion.span>
                            </div>
                          ) : (
                            <p className="font-display text-2xl font-bold text-success">{wpVersion}</p>
                          )}
                          <p className="text-xs text-text-muted mt-0.5">
                            {wpLatestVersion && wpVersion !== wpLatestVersion
                              ? 'Actualización disponible'
                              : 'Al día ✓'
                            }
                          </p>
                        </div>
                      ) : syncing ? (
                        <div className="flex items-center gap-2 text-sm text-text-muted">
                          <Loader2 size={14} className="animate-spin" />
                          Detectando...
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm text-text-muted">No detectada</p>
                          <p className="text-[10px] text-text-muted mt-0.5">Sincroniza para detectar</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-4">
                    <p className="text-xs text-text-muted leading-relaxed flex-1">
                      {wpVersion && wpLatestVersion && wpVersion !== wpLatestVersion
                        ? `⚠️ Tu sitio ejecuta WordPress ${wpVersion} pero la versión ${wpLatestVersion} está disponible.`
                        : wpVersion
                          ? `✅ El sitio ejecuta WordPress ${wpVersion}${wpLatestVersion ? ' — es la versión más reciente.' : '. Sincroniza para verificar si hay actualizaciones.'}`
                          : 'Sincroniza los plugins para detectar la versión del núcleo de WordPress instalada.'}
                    </p>
                    {wpVersion && wpLatestVersion && wpVersion !== wpLatestVersion && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={updateCore}
                        disabled={updatingPluginId === 'core'}
                        className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-warning/10 border border-warning/20 px-4 py-2 text-sm font-medium text-warning hover:bg-warning/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {updatingPluginId === 'core' ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                        {updatingPluginId === 'core' ? 'Actualizando Core...' : `Actualizar a ${wpLatestVersion}`}
                      </motion.button>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {/* === Plugins / Themes Detail with Tabs === */}
        {viewMode === 'plugins' && (
          <motion.div key="plugins" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-4">
            {/* Sync error in plugins view */}
            {syncError && (
              <div className="flex items-center gap-3 rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
                <AlertCircle size={16} />
                <span className="flex-1">{syncError}</span>
                <button onClick={() => setSyncError(null)} className="text-danger/60 hover:text-danger cursor-pointer">✕</button>
              </div>
            )}
            {/* Syncing indicator in plugins view */}
            {syncing && (
              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-sm text-primary">
                <Loader2 size={14} className="animate-spin" />
                <span>Sincronizando con WordPress...</span>
              </div>
            )}
            {/* Tab bar (like screenshot) */}
            <div className="flex items-center gap-1 border-b border-border pb-0 overflow-x-auto">
              {([
                { key: 'all' as PluginTab, label: 'Todos' },
                { key: 'update' as PluginTab, label: 'Actualización disponible' },
                { key: 'active' as PluginTab, label: 'Activos' },
                { key: 'inactive' as PluginTab, label: 'Inactivos' },
                { key: 'unknown' as PluginTab, label: 'Sin verificar' },
                { key: 'excluded' as PluginTab, label: 'Excluidos' },
                { key: 'in_progress' as PluginTab, label: 'En Proceso' },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setPluginTab(tab.key)}
                  className={`cursor-pointer whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                    pluginTab === tab.key
                      ? 'border-primary text-primary'
                      : 'border-transparent text-text-muted hover:text-white hover:border-border'
                  }`}
                >
                  {tab.label} ({tabCounts[tab.key]})
                </button>
              ))}
            </div>

            {/* Action bar */}
            <div className="flex items-center gap-3 flex-wrap">
              {selectedProject && ['wordpress', 'headless', 'shopify', 'jumpseller'].includes(selectedProject.platform) && !syncing && (
                <button onClick={syncPlugins} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text-muted hover:text-white hover:bg-surface-hover transition-colors">
                  <RefreshCw size={14} />
                  Sincronizar
                </button>
              )}
              {syncing && (
                <div className="flex items-center gap-2 text-sm text-primary">
                  <Loader2 size={14} className="animate-spin" />
                  Sincronizando...
                </div>
              )}
              <button onClick={() => setShowAddPlugin(!showAddPlugin)} className="flex cursor-pointer items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition-colors">
                <Plus size={14} />
                Agregar {detailType === 'plugin' ? termLabel.singular : 'Tema'}
              </button>
            </div>

            {/* Add plugin form — simplified: only slug needed for WP */}
            <AnimatePresence>
              {showAddPlugin && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="glass-panel rounded-2xl p-5 space-y-4">
                    <h4 className="text-sm font-semibold text-white">Instalar {detailType === 'plugin' ? termLabel.singular : 'Tema'} desde WordPress.org</h4>
                    <p className="text-xs text-text-muted">Ingresa el slug del plugin (ej: <span className="font-mono text-primary">contact-form-7</span>, <span className="font-mono text-primary">elementor</span>). WordPress descargará e instalará la última versión automáticamente.</p>
                    <div className="flex gap-3 items-center">
                      <input type="text" placeholder="Slug del plugin (ej: contact-form-7)" value={newPlugin.slug} onChange={e => setNewPlugin(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary font-mono" />
                      <button
                        onClick={() => { if (newPlugin.slug.trim()) installPlugin(newPlugin.slug.trim()); }}
                        disabled={syncing || !newPlugin.slug.trim()}
                        className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 transition-colors"
                      >
                        {syncing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        Instalar
                      </button>
                      <button onClick={() => setShowAddPlugin(false)} className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-muted hover:text-white hover:bg-surface-hover cursor-pointer">
                        Cancelar
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Plugin/Theme list */}
            <div className="glass-panel overflow-hidden rounded-2xl">
              {getTabFiltered().length === 0 ? (
                <div className="p-12 text-center">
                  <Package size={32} className="mx-auto mb-3 text-text-muted" />
                  <p className="text-sm text-text-muted">
                    {pluginTab === 'excluded' ? 'No hay elementos excluidos de actualizaciones.' :
                     pluginTab === 'in_progress' ? 'No hay actualizaciones en proceso.' :
                     searchQuery ? 'No se encontraron resultados.' :
                     `No hay ${detailType === 'plugin' ? termLabel.plural.toLowerCase() : 'temas'} en esta categoría.`}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {getTabFiltered().map((plugin, index) => (
                    <motion.div
                      key={plugin.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: index * 0.03 }}
                      className={`flex items-center justify-between gap-4 p-4 transition-colors hover:bg-surface-hover ${plugin.needs_update ? 'border-l-2 border-l-warning' : plugin.is_unknown ? 'border-l-2 border-l-blue-400/50' : ''}`}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          plugin.needs_update ? 'bg-warning/10 text-warning' : plugin.is_unknown ? 'bg-blue-500/10 text-blue-400' : plugin.is_active ? 'bg-success/10 text-success' : 'bg-surface-hover text-text-muted'
                        }`}>
                          {plugin.needs_update ? (
                            <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}>
                              <AlertCircle size={18} />
                            </motion.div>
                          ) : plugin.is_unknown ? <HelpCircle size={18} /> : plugin.plugin_type === 'theme' ? <Palette size={18} /> : <Plug size={18} />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-white truncate">{plugin.name}</p>
                            {!plugin.is_active && <span className="rounded-md bg-surface-hover px-1.5 py-0.5 text-[10px] font-medium text-text-muted border border-border">Inactivo</span>}
                            {plugin.is_unknown && <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-400 border border-blue-500/20">Premium</span>}
                            {plugin.auto_update && <span className="rounded-md bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success border border-success/20">Auto-update</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-text-muted font-mono">{plugin.slug}</span>
                            {plugin.author && <span className="text-xs text-text-muted">por {plugin.author}</span>}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        {/* Version info with colors */}
                        <div className="text-right">
                          {plugin.needs_update ? (
                            <div className="flex items-center gap-2 font-mono text-xs">
                              <span className="text-success font-medium">{plugin.current_version}</span>
                              <ArrowRight size={12} className="text-warning" />
                              <motion.span
                                animate={{ opacity: [1, 0.5, 1] }}
                                transition={{ repeat: Infinity, duration: 1.5 }}
                                className="rounded-md bg-warning/10 border border-warning/30 px-2 py-0.5 text-warning font-semibold"
                              >
                                {plugin.latest_version}
                              </motion.span>
                            </div>
                          ) : plugin.is_unknown ? (
                            <div className="flex items-center gap-2 font-mono text-xs">
                              <span className="text-white font-medium">{plugin.current_version}</span>
                              <span className="rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-blue-400 text-[10px]">Sin verificar</span>
                            </div>
                          ) : (
                            <span className="font-mono text-xs text-success font-medium">{plugin.current_version || 'Sin versión'}</span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          {/* Auto-update toggle */}
                          {plugin.plugin_type === 'plugin' && selectedProject && ['wordpress', 'headless'].includes(selectedProject.platform) && (
                            <button
                              onClick={() => toggleAutoUpdate(plugin)}
                              disabled={updatingPluginId === plugin.id}
                              title={plugin.auto_update ? 'Desactivar auto-update' : 'Activar auto-update'}
                              className={`cursor-pointer rounded-lg border p-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                plugin.auto_update
                                  ? 'border-success/30 bg-success/10 text-success hover:bg-success/20'
                                  : 'border-border bg-surface text-text-muted hover:text-white hover:bg-surface-hover'
                              }`}
                            >
                              {updatingPluginId === plugin.id ? <Loader2 size={14} className="animate-spin" /> : plugin.auto_update ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                            </button>
                          )}
                          {/* Install button for unknown/unverified plugins */}
                          {plugin.is_unknown && selectedProject && ['wordpress', 'headless'].includes(selectedProject.platform) && (
                            <button
                              onClick={() => installPlugin(plugin.slug)}
                              disabled={syncing}
                              title={`Instalar ${plugin.slug} desde WordPress.org (reemplazará la versión actual)`}
                              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                            >
                              {syncing ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                              Instalar
                            </button>
                          )}
                          {/* Update button */}
                          {plugin.needs_update && (
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => updatePlugin(plugin)}
                              disabled={updatingPluginId === plugin.id}
                              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-warning/10 border border-warning/20 px-3 py-1.5 text-xs font-medium text-warning hover:bg-warning/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {updatingPluginId === plugin.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                              {updatingPluginId === plugin.id ? 'Actualizando...' : 'Actualizar'}
                            </motion.button>
                          )}
                          {/* Delete button */}
                          <button
                            onClick={() => setDeleteTarget(plugin)}
                            disabled={updatingPluginId === plugin.id}
                            className="cursor-pointer rounded-lg border border-border bg-surface p-1.5 text-text-muted hover:text-danger hover:border-danger/50 transition-colors disabled:opacity-50"
                          >
                            {updatingPluginId === plugin.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setDeleteTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-md glass-panel rounded-2xl overflow-hidden border border-danger/20"
            >
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
                    <Trash2 size={22} />
                  </div>
                  <div>
                    <h3 className="font-display text-lg font-bold text-white">Eliminar {deleteTarget.plugin_type === 'theme' ? 'Tema' : 'Plugin'}</h3>
                    <p className="text-sm text-text-muted mt-0.5">{deleteTarget.name}</p>
                  </div>
                </div>
                <div className="rounded-xl bg-danger/5 border border-danger/10 p-4">
                  <p className="text-sm text-text-muted leading-relaxed">
                    {selectedProject && ['wordpress', 'headless'].includes(selectedProject.platform)
                      ? <>Esta acción <span className="text-danger font-medium">desinstalará</span> el plugin del sitio WordPress y lo eliminará de la lista. Esta acción no se puede deshacer.</>
                      : <>Se eliminará el registro de la lista. Esta acción no se puede deshacer.</>
                    }
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-text-muted bg-surface/50 rounded-lg px-3 py-2 font-mono">
                  <Plug size={12} />
                  <span>{deleteTarget.slug}</span>
                  {deleteTarget.current_version && <span className="text-text-muted/60">v{deleteTarget.current_version}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3 px-6 py-4 border-t border-border bg-surface/30">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 cursor-pointer rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-muted hover:text-white hover:bg-surface-hover transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDeletePlugin}
                  className="flex-1 cursor-pointer flex items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2.5 text-sm font-medium text-white hover:bg-danger/80 transition-colors"
                >
                  <Trash2 size={14} />
                  Eliminar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
