import { useState } from 'react';
import { 
  User, 
  Bell, 
  Shield, 
  Globe, 
  Database,
  Palette
} from 'lucide-react';
import ProfileSection from './settings/ProfileSection';
import NotificationsSection from './settings/NotificationsSection';
import SecuritySection from './settings/SecuritySection';
import IntegrationsSection from './settings/IntegrationsSection';
import AppearanceSection from './settings/AppearanceSection';
import LocaleSection from './settings/LocaleSection';

const tabs = [
  { id: 'profile', label: 'Perfil', icon: User },
  { id: 'notifications', label: 'Notificaciones', icon: Bell },
  { id: 'security', label: 'Seguridad', icon: Shield },
  { id: 'integrations', label: 'Integraciones', icon: Database },
  { id: 'appearance', label: 'Apariencia', icon: Palette },
  { id: 'language', label: 'Idioma y Región', icon: Globe },
];

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState('profile');

  const renderSection = () => {
    switch (activeTab) {
      case 'profile': return <ProfileSection />;
      case 'notifications': return <NotificationsSection />;
      case 'security': return <SecuritySection />;
      case 'integrations': return <IntegrationsSection />;
      case 'appearance': return <AppearanceSection />;
      case 'language': return <LocaleSection />;
      default: return <ProfileSection />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">Configuración</h1>
        <p className="text-sm text-text-muted">Administra tus preferencias y ajustes de la plataforma.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="col-span-1 space-y-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === item.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-muted hover:bg-surface-hover hover:text-white'
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </div>

        <div className="col-span-1 lg:col-span-3">
          {renderSection()}
        </div>
      </div>
    </div>
  );
}
