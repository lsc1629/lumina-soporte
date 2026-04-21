import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { User, Bell, Shield, Loader2, Check, Lock, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import LoadingScreen from './LoadingScreen';
import { usePreviewClient } from '@/lib/PreviewContext';

type Tab = 'profile' | 'notifications' | 'security';

interface Profile { full_name: string; email: string; phone: string; company: string; avatar_url: string; }
interface NotifPrefs { email_incidents: boolean; email_updates: boolean; email_reports: boolean; }

export default function ClientSettingsView() {
  const previewClientId = usePreviewClient();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [profile, setProfile] = useState<Profile>({ full_name: '', email: '', phone: '', company: '', avatar_url: '' });
  const [notifs, setNotifs] = useState<NotifPrefs>({ email_incidents: true, email_updates: true, email_reports: true });
  const [passwords, setPasswords] = useState({ current: '', new1: '', new2: '' });
  const [showPass, setShowPass] = useState(false);
  const [passError, setPassError] = useState('');

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const userId = previewClientId || user?.id;
    if (!userId) { setLoading(false); return; }

    const { data: p } = await supabase.from('profiles').select('full_name, email, phone, company, avatar_url').eq('id', userId).single();
    if (p) setProfile(p as Profile);

    const { data: n } = await supabase.from('notification_preferences').select('email_incidents, email_updates, email_reports').eq('user_id', userId).single();
    if (n) setNotifs(n as NotifPrefs);

    setLoading(false);
  };

  const saveProfile = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({
        full_name: profile.full_name,
        phone: profile.phone,
        company: profile.company,
      }).eq('id', user.id);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const saveNotifs = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('notification_preferences').upsert({
        user_id: user.id,
        ...notifs,
      });
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const changePassword = async () => {
    setPassError('');
    if (passwords.new1.length < 6) { setPassError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (passwords.new1 !== passwords.new2) { setPassError('Las contraseñas no coinciden.'); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: passwords.new1 });
    if (error) { setPassError(error.message); }
    else { setPasswords({ current: '', new1: '', new2: '' }); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    setSaving(false);
  };

  const tabs = [
    { id: 'profile' as Tab, label: 'Mi Perfil', icon: User },
    { id: 'notifications' as Tab, label: 'Notificaciones', icon: Bell },
    { id: 'security' as Tab, label: 'Seguridad', icon: Shield },
  ];

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">Configuración</h1>
        <p className="text-sm text-text-muted">Administra tu perfil y preferencias de notificaciones.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="col-span-1 space-y-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === item.id ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-white'
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </div>

        <div className="col-span-1 lg:col-span-3">
          {activeTab === 'profile' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-2xl p-6">
              <h2 className="mb-6 font-display text-xl font-semibold text-white">Perfil de Usuario</h2>
              
              <div className="mb-8 flex items-center gap-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 text-2xl font-bold text-primary border-2 border-border">
                  {profile.full_name?.charAt(0) || '?'}
                </div>
                <div>
                  <h3 className="text-lg font-medium text-white">{profile.full_name || 'Usuario'}</h3>
                  <p className="text-sm text-text-muted">{profile.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-muted">Nombre Completo</label>
                  <input type="text" value={profile.full_name} onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))} className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-muted">Correo Electrónico</label>
                  <input type="email" value={profile.email} disabled className="w-full rounded-lg border border-border bg-surface/50 px-4 py-2.5 text-sm text-text-muted outline-none cursor-not-allowed" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-muted">Teléfono</label>
                  <input type="tel" value={profile.phone || ''} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} placeholder="+56 9 1234 5678" className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-muted">Empresa</label>
                  <input type="text" value={profile.company || ''} onChange={e => setProfile(p => ({ ...p, company: e.target.value }))} placeholder="Nombre de la empresa" className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3 border-t border-border pt-6">
                {saved && <span className="flex items-center gap-1 text-sm text-success"><Check size={14} /> Guardado</span>}
                <button onClick={saveProfile} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover shadow-lg shadow-primary/20 disabled:opacity-50">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  Guardar Cambios
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'notifications' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-2xl p-6">
              <h2 className="mb-6 font-display text-xl font-semibold text-white">Preferencias de Notificaciones</h2>
              <div className="space-y-6">
                {[
                  { key: 'email_incidents' as keyof NotifPrefs, label: 'Incidentes', desc: 'Recibir alertas por email cuando ocurra un incidente en tus sitios.' },
                  { key: 'email_updates' as keyof NotifPrefs, label: 'Actualizaciones', desc: 'Notificaciones cuando se apliquen actualizaciones a tus proyectos.' },
                  { key: 'email_reports' as keyof NotifPrefs, label: 'Reportes Mensuales', desc: 'Recibir informes de salud mensual por correo electrónico.' },
                ].map(item => (
                  <div key={item.key} className="flex items-start justify-between gap-4 border-b border-border pb-6 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-white">{item.label}</p>
                      <p className="text-xs text-text-muted mt-1">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => setNotifs(n => ({ ...n, [item.key]: !n[item.key] }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${notifs[item.key] ? 'bg-primary' : 'bg-surface-hover'}`}
                    >
                      <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${notifs[item.key] ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-end gap-3">
                {saved && <span className="flex items-center gap-1 text-sm text-success"><Check size={14} /> Guardado</span>}
                <button onClick={saveNotifs} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  Guardar
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'security' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-2xl p-6">
              <h2 className="mb-6 font-display text-xl font-semibold text-white">Cambiar Contraseña</h2>
              <div className="max-w-md space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-muted">Nueva Contraseña</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input type={showPass ? 'text' : 'password'} value={passwords.new1} onChange={e => setPasswords(p => ({ ...p, new1: e.target.value }))} className="w-full rounded-lg border border-border bg-surface pl-10 pr-10 py-2.5 text-sm text-white outline-none focus:border-primary" />
                    <button onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white">
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-muted">Confirmar Contraseña</label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input type={showPass ? 'text' : 'password'} value={passwords.new2} onChange={e => setPasswords(p => ({ ...p, new2: e.target.value }))} className="w-full rounded-lg border border-border bg-surface pl-10 py-2.5 text-sm text-white outline-none focus:border-primary" />
                  </div>
                </div>
                {passError && <p className="text-xs text-danger">{passError}</p>}
                {saved && <p className="flex items-center gap-1 text-sm text-success"><Check size={14} /> Contraseña actualizada</p>}
                <button onClick={changePassword} disabled={saving || !passwords.new1} className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  Actualizar Contraseña
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
