import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  LayoutDashboard, 
  Globe, 
  AlertTriangle, 
  RefreshCw, 
  FileText, 
  Settings,
  LogOut,
  Bell,
  Search,
  Menu,
  X,
  Headset,
  Eye,
  Monitor,
  ArrowUpCircle,
  Gauge,
  HeartPulse,
  ChevronDown,
  TrendingUp,
  FileImage,
  BookOpen,
  Package,
  ShieldCheck,
  Briefcase,
  UsersRound,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Dashboard from './Dashboard';
import ProjectsView from './ProjectsView';
import IncidentsView from './IncidentsView';
import UpdatesView from './UpdatesView';
import ReportsView from './ReportsView';
import SettingsView from './SettingsView';
import NewProjectView from './NewProjectView';
import EditProjectView from './EditProjectView';
import IncidentDetailsView from './IncidentDetailsView';
import UptimeView from './UptimeView';
import PerformanceView from './PerformanceView';
import SiteHealthView from './SiteHealthView';
import SeoPerformanceView from './SeoPerformanceView';
import ImageOptimizationView from './ImageOptimizationView';
import DocumentationView from './DocumentationView';
import ResourcesView from './ResourcesView';
import SecurityScanView from './SecurityScanView';
import CommercialManagementView from './CommercialManagementView';
import ClientManagementView from './ClientManagementView';

interface MainLayoutProps {
  onLogout: () => void;
  onPreviewClient?: () => void;
}

interface Notification {
  id: string;
  type: 'incident' | 'update' | 'downtime';
  title: string;
  description: string;
  time: string;
  read: boolean;
}

export default function MainLayout({ onLogout, onPreviewClient }: MainLayoutProps) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [editProjectId, setEditProjectId] = useState<string | null>(null);
  const [incidentCount, setIncidentCount] = useState(0);
  const [updateCount, setUpdateCount] = useState(0);
  const [downCount, setDownCount] = useState(0);
  const [monitoringOpen, setMonitoringOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    loadBadgeCounts();
    const interval = setInterval(loadBadgeCounts, 30000);
    const onRefresh = () => loadBadgeCounts();
    window.addEventListener('badges:refresh', onRefresh);
    return () => { clearInterval(interval); window.removeEventListener('badges:refresh', onRefresh); };
  }, []);

  // Refresh badges when tab changes (e.g. returning from incident-details)
  useEffect(() => { loadBadgeCounts(); }, [activeTab]);

  const loadBadgeCounts = async () => {
    const [incRes, pluginsRes, downRes] = await Promise.all([
      supabase.from('incidents').select('id, incident_number, title, created_at', { count: 'exact' }).in('status', ['investigating', 'identified', 'monitoring']).order('created_at', { ascending: false }).limit(5),
      supabase.from('project_plugins').select('id, name, plugin_type, current_version, latest_version, project:projects(name)').neq('latest_version', '').neq('latest_version', 'unknown'),
      supabase.from('projects').select('id, name', { count: 'exact', head: true }).eq('status', 'down').eq('is_active', true),
    ]);
    setIncidentCount(incRes.count || 0);
    const outdatedPlugins = (pluginsRes.data || []).filter(p =>
      p.latest_version && p.latest_version !== '' && p.latest_version !== 'unknown' && p.latest_version !== p.current_version
    );
    setUpdateCount(outdatedPlugins.length);
    setDownCount(downRes.count || 0);

    // Build notifications
    const notifs: Notification[] = [];
    for (const inc of (incRes.data || [])) {
      notifs.push({
        id: `inc-${inc.id}`,
        type: 'incident',
        title: inc.title || `Incidente ${inc.incident_number}`,
        description: 'Incidente abierto requiere atención',
        time: inc.created_at,
        read: false,
      });
    }
    for (const upd of outdatedPlugins.slice(0, 3)) {
      const projName = (upd as any).project?.name || '';
      notifs.push({
        id: `upd-${upd.id}`,
        type: 'update',
        title: upd.name || 'Actualización pendiente',
        description: `${projName ? projName + ' · ' : ''}${upd.plugin_type || 'plugin'}: ${upd.current_version} → ${upd.latest_version}`,
        time: new Date().toISOString(),
        read: false,
      });
    }
    if ((downRes.count || 0) > 0) {
      notifs.push({
        id: 'down-alert',
        type: 'downtime',
        title: `${downRes.count} sitio${(downRes.count || 0) > 1 ? 's' : ''} caído${(downRes.count || 0) > 1 ? 's' : ''}`,
        description: 'Requiere revisión inmediata',
        time: new Date().toISOString(),
        read: false,
      });
    }
    setNotifications(notifs);
  };

  const totalAlerts = incidentCount + updateCount + downCount;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'projects', label: 'Proyectos', icon: Globe },
  ];

  const monitoringItems = [
    { id: 'uptime', label: 'Uptime', icon: ArrowUpCircle },
    { id: 'performance', label: 'Performance', icon: Gauge },
    { id: 'site-health', label: 'Estado de Salud', icon: HeartPulse },
    { id: 'seo', label: 'SEO Performance', icon: TrendingUp },
    { id: 'image-optimization', label: 'Imágenes', icon: FileImage },
    { id: 'security', label: 'Seguridad', icon: ShieldCheck },
  ];

  const navItemsAfter = [
    { id: 'incidents', label: 'Incidentes', icon: AlertTriangle },
    { id: 'updates', label: 'Actualizaciones', icon: RefreshCw },
    { id: 'reports', label: 'Informes', icon: FileText },
    { id: 'resources', label: 'Recursos', icon: Package },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'projects': return <ProjectsView onNewProject={() => setActiveTab('new-project')} onEditProject={(id) => { setEditProjectId(id); setActiveTab('edit-project'); }} />;
      case 'new-project': return <NewProjectView onCancel={() => setActiveTab('projects')} />;
      case 'edit-project': return <EditProjectView projectId={editProjectId} onCancel={() => setActiveTab('projects')} />;
      case 'incidents': return <IncidentsView onViewDetails={(id) => { setSelectedIncident(id); setActiveTab('incident-details'); }} />;
      case 'incident-details': return <IncidentDetailsView incidentId={selectedIncident} onBack={() => setActiveTab('incidents')} />;
      case 'updates': return <UpdatesView />;
      case 'uptime': return <UptimeView />;
      case 'performance': return <PerformanceView />;
      case 'site-health': return <SiteHealthView />;
      case 'seo': return <SeoPerformanceView />;
      case 'image-optimization': return <ImageOptimizationView />;
      case 'security': return <SecurityScanView />;
      case 'reports': return <ReportsView />;
      case 'resources': return <ResourcesView />;
      case 'settings': return <SettingsView />;
      case 'documentation': return <DocumentationView />;
      case 'commercial': return <CommercialManagementView />;
      case 'client-management': return <ClientManagementView />;
      default: return <Dashboard />;
    }
  };

  const isActive = (itemId: string) => 
    activeTab === itemId || 
    (activeTab === 'new-project' && itemId === 'projects') || 
    (activeTab === 'edit-project' && itemId === 'projects') ||
    (activeTab === 'incident-details' && itemId === 'incidents');

  const isMonitoringActive = monitoringItems.some(m => activeTab === m.id);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-text-main">
      {/* Sidebar - Desktop */}
      <aside className="hidden w-64 flex-col border-r border-border bg-surface/50 backdrop-blur-xl md:flex">
        <div className="flex h-20 items-center gap-3 border-b border-border px-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white shadow-lg glow-effect">
            <Headset size={20} />
          </div>
          <div className="flex flex-col">
            <span className="font-display text-lg font-bold leading-tight tracking-tight text-white">Lumina<span className="text-primary">Support</span></span>
            <span className="text-[10px] font-medium leading-tight text-text-muted">por Luis Salas Cortés</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-6">
          <nav className="space-y-1 px-3">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive(item.id)
                    ? 'bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
                    : 'text-text-muted hover:bg-surface-hover hover:text-white'
                }`}
              >
                <item.icon size={18} className={isActive(item.id) ? 'text-primary' : 'text-text-muted'} />
                {item.label}
                {item.id === 'dashboard' && totalAlerts > 0 && (
                  <span className="relative ml-auto flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75"></span>
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger"></span>
                  </span>
                )}
              </button>
            ))}

            {/* Monitoring section with sub-items */}
            <button
              onClick={() => setMonitoringOpen(!monitoringOpen)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                isMonitoringActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-muted hover:bg-surface-hover hover:text-white'
              }`}
            >
              <Monitor size={18} className={isMonitoringActive ? 'text-primary' : 'text-text-muted'} />
              Monitoreo
              {downCount > 0 && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75"></span>
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger"></span>
                </span>
              )}
              <ChevronDown size={14} className={`ml-auto transition-transform duration-200 ${monitoringOpen || isMonitoringActive ? 'rotate-180' : ''}`} />
            </button>
            {(monitoringOpen || isMonitoringActive) && (
              <div className="ml-4 space-y-0.5 border-l border-border pl-3">
                {monitoringItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                      activeTab === item.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-text-muted hover:bg-surface-hover hover:text-white'
                    }`}
                  >
                    <item.icon size={16} className={activeTab === item.id ? 'text-primary' : 'text-text-muted'} />
                    {item.label}
                    {item.id === 'uptime' && downCount > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-danger/20 px-1 text-[10px] font-bold text-danger animate-pulse">{downCount}</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {navItemsAfter.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive(item.id)
                    ? 'bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
                    : 'text-text-muted hover:bg-surface-hover hover:text-white'
                }`}
              >
                <item.icon size={18} className={isActive(item.id) ? 'text-primary' : 'text-text-muted'} />
                {item.label}
                {item.id === 'incidents' && incidentCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-danger/20 px-1 text-[10px] font-bold text-danger animate-pulse">{incidentCount}</span>
                )}
                {item.id === 'updates' && updateCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-warning/20 px-1 text-[10px] font-bold text-warning animate-pulse">{updateCount}</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="border-t border-border p-4">
          <button 
            onClick={() => setActiveTab('settings')}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'settings' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-white'
            }`}
          >
            <Settings size={18} className={activeTab === 'settings' ? 'text-primary' : ''} />
            Configuración
          </button>
          <button 
            onClick={() => setActiveTab('documentation')}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'documentation' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-white'
            }`}
          >
            <BookOpen size={18} className={activeTab === 'documentation' ? 'text-primary' : ''} />
            Documentación
          </button>
          <button 
            onClick={() => setActiveTab('commercial')}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'commercial' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-white'
            }`}
          >
            <Briefcase size={18} className={activeTab === 'commercial' ? 'text-primary' : ''} />
            Gestión Comercial
          </button>
          <button 
            onClick={() => setActiveTab('client-management')}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'client-management' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-white'
            }`}
          >
            <UsersRound size={18} className={activeTab === 'client-management' ? 'text-primary' : ''} />
            Gestión de Clientes
          </button>
          {onPreviewClient && (
            <button 
              onClick={onPreviewClient}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <Eye size={18} />
              Vista Cliente
            </button>
          )}
          <button 
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <LogOut size={18} />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="relative z-[100] flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface/30 px-4 backdrop-blur-md md:px-8">
          <div className="flex items-center gap-4">
            <button className="rounded-lg p-2 text-text-muted hover:bg-surface-hover md:hidden" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu size={20} />
            </button>
            <div className="hidden items-center gap-2 rounded-full border border-border bg-surface/50 px-3 py-1.5 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 md:flex">
              <Search size={16} className="text-text-muted" />
              <input type="text" placeholder="Buscar proyecto..." className="w-64 bg-transparent text-sm text-white placeholder-text-muted outline-none" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                onClick={() => setBellOpen(!bellOpen)}
                className="relative rounded-full p-2 text-text-muted transition-colors hover:bg-surface-hover hover:text-white"
              >
                <Bell size={20} />
                {totalAlerts > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-background animate-pulse">
                    {totalAlerts > 99 ? '99+' : totalAlerts}
                  </span>
                )}
              </button>
              {bellOpen && (
                <>
                  <div className="fixed inset-0 z-[9998]" onClick={() => setBellOpen(false)} />
                  <div className="fixed right-4 top-14 z-[9999] w-80 rounded-xl border border-border bg-surface shadow-2xl">
                    <div className="flex items-center justify-between border-b border-border px-4 py-3">
                      <h3 className="text-sm font-semibold text-white">Notificaciones</h3>
                      {totalAlerts > 0 && (
                        <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-bold text-danger">{totalAlerts} nuevas</span>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-border">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-sm text-text-muted">Sin notificaciones</div>
                      ) : (
                        notifications.map(n => (
                          <button
                            key={n.id}
                            onClick={() => {
                              setBellOpen(false);
                              if (n.type === 'incident') setActiveTab('incidents');
                              else if (n.type === 'update') setActiveTab('updates');
                              else if (n.type === 'downtime') setActiveTab('uptime');
                            }}
                            className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover"
                          >
                            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              n.type === 'incident' ? 'bg-danger/10 text-danger' :
                              n.type === 'downtime' ? 'bg-danger/10 text-danger' :
                              'bg-warning/10 text-warning'
                            }`}>
                              {n.type === 'incident' ? <AlertTriangle size={14} /> :
                               n.type === 'downtime' ? <Globe size={14} /> :
                               <RefreshCw size={14} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{n.title}</p>
                              <p className="text-xs text-text-muted mt-0.5">{n.description}</p>
                              <p className="text-[10px] text-text-muted mt-1">
                                {(() => {
                                  const mins = Math.floor((Date.now() - new Date(n.time).getTime()) / 60000);
                                  if (mins < 1) return 'Ahora';
                                  if (mins < 60) return `Hace ${mins}m`;
                                  const hrs = Math.floor(mins / 60);
                                  if (hrs < 24) return `Hace ${hrs}h`;
                                  return `Hace ${Math.floor(hrs / 24)}d`;
                                })()}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                    {notifications.length > 0 && (
                      <div className="border-t border-border px-4 py-2">
                        <button
                          onClick={() => { setBellOpen(false); setActiveTab('incidents'); }}
                          className="w-full text-center text-xs font-medium text-primary hover:text-primary-hover transition-colors py-1"
                        >
                          Ver todas las alertas
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="relative h-8 w-8 overflow-hidden rounded-full border border-border">
              <img src="https://picsum.photos/seed/avatar/100/100" alt="User" className="h-full w-full object-cover" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mx-auto max-w-7xl h-full"
          >
            {renderContent()}
          </motion.div>
        </div>
      </main>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <motion.aside 
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            className="relative flex w-64 flex-col bg-surface"
          >
            <div className="flex h-20 items-center justify-between border-b border-border px-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white shadow-lg">
                  <Headset size={20} />
                </div>
                <div className="flex flex-col">
                  <span className="font-display text-lg font-bold leading-tight tracking-tight text-white">Lumina<span className="text-primary">Support</span></span>
                  <span className="text-[10px] font-medium leading-tight text-text-muted">por Luis Salas Cortés</span>
                </div>
              </div>
              <button onClick={() => setIsMobileMenuOpen(false)} className="text-text-muted hover:text-white">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto py-4">
              <nav className="space-y-1 px-2">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { setActiveTab(item.id); setIsMobileMenuOpen(false); }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                      isActive(item.id) ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-white'
                    }`}
                  >
                    <item.icon size={18} className={isActive(item.id) ? 'text-primary' : 'text-text-muted'} />
                    {item.label}
                    {item.id === 'dashboard' && totalAlerts > 0 && (
                      <span className="relative ml-auto flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75"></span>
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger"></span>
                      </span>
                    )}
                  </button>
                ))}

                {/* Mobile: Monitoring */}
                <button
                  onClick={() => setMonitoringOpen(!monitoringOpen)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                    isMonitoringActive ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-white'
                  }`}
                >
                  <Monitor size={18} className={isMonitoringActive ? 'text-primary' : 'text-text-muted'} />
                  Monitoreo
                  {downCount > 0 && (
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75"></span>
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger"></span>
                    </span>
                  )}
                  <ChevronDown size={14} className={`ml-auto transition-transform ${monitoringOpen || isMonitoringActive ? 'rotate-180' : ''}`} />
                </button>
                {(monitoringOpen || isMonitoringActive) && (
                  <div className="ml-4 space-y-0.5 border-l border-border pl-3">
                    {monitoringItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => { setActiveTab(item.id); setIsMobileMenuOpen(false); }}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          activeTab === item.id ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-white'
                        }`}
                      >
                        <item.icon size={16} className={activeTab === item.id ? 'text-primary' : 'text-text-muted'} />
                        {item.label}
                        {item.id === 'uptime' && downCount > 0 && (
                          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-danger/20 px-1 text-[10px] font-bold text-danger animate-pulse">{downCount}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {navItemsAfter.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { setActiveTab(item.id); setIsMobileMenuOpen(false); }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                      isActive(item.id) ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-white'
                    }`}
                  >
                    <item.icon size={18} className={isActive(item.id) ? 'text-primary' : 'text-text-muted'} />
                    {item.label}
                    {item.id === 'incidents' && incidentCount > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-danger/20 px-1 text-[10px] font-bold text-danger animate-pulse">{incidentCount}</span>
                    )}
                    {item.id === 'updates' && updateCount > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-warning/20 px-1 text-[10px] font-bold text-warning animate-pulse">{updateCount}</span>
                    )}
                  </button>
                ))}
              </nav>
            </div>
            <div className="border-t border-border p-4">
              <button 
                onClick={() => { setActiveTab('settings'); setIsMobileMenuOpen(false); }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'settings' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-white'
                }`}
              >
                <Settings size={18} className={activeTab === 'settings' ? 'text-primary' : ''} />
                Configuración
              </button>
              <button 
                onClick={() => { setActiveTab('documentation'); setIsMobileMenuOpen(false); }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'documentation' ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-white'
                }`}
              >
                <BookOpen size={18} className={activeTab === 'documentation' ? 'text-primary' : ''} />
                Documentación
              </button>
            </div>
          </motion.aside>
        </div>
      )}
    </div>
  );
}
