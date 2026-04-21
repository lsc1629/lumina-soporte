import { useState } from 'react';
import { motion } from 'motion/react';
import { 
  LayoutDashboard, 
  Globe, 
  LifeBuoy, 
  LogOut,
  Bell,
  Menu,
  X,
  Headset,
  Settings,
  ArrowLeft,
  Shield,
  BookOpen,
  AlertCircle,
} from 'lucide-react';
import ClientDashboard from './ClientDashboard';
import ClientProjectsView from './ClientProjectsView';
import ClientSupportView from './ClientSupportView';
import ClientSettingsView from './ClientSettingsView';
import ClientDocumentationView from './ClientDocumentationView';
import ClientIssuesView from './ClientIssuesView';
import { PreviewContext } from '@/lib/PreviewContext';

interface ClientLayoutProps {
  onLogout: () => void;
  onBackToAdmin?: () => void;
  previewClientId?: string | null;
}

export default function ClientLayout({ onLogout, onBackToAdmin, previewClientId }: ClientLayoutProps) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Mi Panel', icon: LayoutDashboard },
    { id: 'projects', label: 'Mis Sitios', icon: Globe },
    { id: 'issues', label: 'Incidencias', icon: AlertCircle },
    { id: 'support', label: 'Soporte', icon: LifeBuoy },
    { id: 'settings', label: 'Configuración', icon: Settings },
    { id: 'documentation', label: 'Documentación', icon: BookOpen },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <ClientDashboard />;
      case 'projects': return <ClientProjectsView />;
      case 'issues': return <ClientIssuesView />;
      case 'support': return <ClientSupportView />;
      case 'settings': return <ClientSettingsView />;
      case 'documentation': return <ClientDocumentationView />;
      default: return <ClientDashboard />;
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-text-main">
      {/* Admin Preview Banner */}
      {onBackToAdmin && (
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-3 bg-primary/90 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
          <Shield size={14} />
          <span>Vista previa como cliente</span>
          <button onClick={onBackToAdmin} className="ml-2 flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1 text-xs font-semibold text-white hover:bg-white/30 transition-colors">
            <ArrowLeft size={12} />
            Volver al Admin
          </button>
        </div>
      )}
      {/* Sidebar - Desktop */}
      <aside className="hidden w-64 flex-col border-r border-border bg-surface/50 backdrop-blur-xl md:flex">
        <div className="flex h-20 items-center gap-3 border-b border-border px-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white shadow-lg glow-effect">
            <Headset size={20} />
          </div>
          <div className="flex flex-col">
            <span className="font-display text-lg font-bold leading-tight tracking-tight text-white">Lumina<span className="text-primary">Support</span></span>
            <span className="text-[10px] font-medium leading-tight text-text-muted">Portal de Cliente</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-6">
          <nav className="space-y-1 px-3">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  activeTab === item.id
                    ? 'bg-primary/10 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
                    : 'text-text-muted hover:bg-surface-hover hover:text-white'
                }`}
              >
                <item.icon size={18} className={activeTab === item.id ? 'text-primary' : 'text-text-muted'} />
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="border-t border-border p-4">
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
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface/30 px-4 backdrop-blur-md md:px-8">
          <div className="flex items-center gap-4">
            <button className="rounded-lg p-2 text-text-muted hover:bg-surface-hover md:hidden" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu size={20} />
            </button>
            <h2 className="hidden md:block font-display text-lg font-semibold text-white">
              {navItems.find(i => i.id === activeTab)?.label}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative rounded-full p-2 text-text-muted transition-colors hover:bg-surface-hover hover:text-white">
              <Bell size={20} />
            </button>
            <div className="relative h-8 w-8 overflow-hidden rounded-full border border-border">
              <img src="https://picsum.photos/seed/client/100/100" alt="Client" className="h-full w-full object-cover" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <PreviewContext.Provider value={{ previewClientId: previewClientId || null }}>
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="mx-auto max-w-7xl h-full"
            >
              {renderContent()}
            </motion.div>
          </PreviewContext.Provider>
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
                  <span className="text-[10px] font-medium leading-tight text-text-muted">Portal de Cliente</span>
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
                      activeTab === item.id ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-white'
                    }`}
                  >
                    <item.icon size={18} className={activeTab === item.id ? 'text-primary' : 'text-text-muted'} />
                    {item.label}
                  </button>
                ))}
              </nav>
            </div>
            <div className="border-t border-border p-4">
              <button 
                onClick={onLogout}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <LogOut size={18} />
                Cerrar Sesión
              </button>
            </div>
          </motion.aside>
        </div>
      )}
    </div>
  );
}
