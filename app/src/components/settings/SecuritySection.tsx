import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { supabase } from '@/lib/supabase';
import LoadingScreen from '../LoadingScreen';
import { CheckCircle2, Loader2, Shield, Key, Monitor, Clock, Trash2 } from 'lucide-react';

interface SecuritySettings {
  two_factor_enabled: boolean;
  two_factor_method: string;
  session_timeout_minutes: number;
  ip_whitelist_enabled: boolean;
  ip_whitelist: string[];
  login_notifications: boolean;
  last_password_change: string;
}

interface Session {
  id: string;
  device: string;
  browser: string;
  ip_address: string;
  location: string;
  is_current: boolean;
  last_active: string;
}

const defaults: SecuritySettings = {
  two_factor_enabled: false, two_factor_method: 'app', session_timeout_minutes: 480,
  ip_whitelist_enabled: false, ip_whitelist: [], login_notifications: true, last_password_change: '',
};

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
      </div>
      <button type="button" onClick={() => onChange(!checked)} className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${checked ? 'bg-primary' : 'bg-surface-hover'}`}>
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

export default function SecuritySection() {
  const [settings, setSettings] = useState<SecuritySettings>(defaults);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [passwordMsg, setPasswordMsg] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: sec }, { data: sess }] = await Promise.all([
      supabase.from('security_settings').select('*').eq('user_id', user.id).single(),
      supabase.from('active_sessions').select('*').eq('user_id', user.id).order('last_active', { ascending: false }),
    ]);
    if (sec) {
      const { id, user_id, created_at, updated_at, ...rest } = sec;
      setSettings(rest as SecuritySettings);
    }
    if (sess) setSessions(sess as Session[]);
    setLoading(false);
  };

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSaving(true); setSaved(false);
    const { two_factor_enabled, two_factor_method, session_timeout_minutes, ip_whitelist_enabled, ip_whitelist, login_notifications } = settings;
    await supabase.from('security_settings').upsert({
      user_id: user.id, two_factor_enabled, two_factor_method, session_timeout_minutes, ip_whitelist_enabled, ip_whitelist, login_notifications,
    }, { onConflict: 'user_id' });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleChangePassword = async () => {
    setPasswordMsg('');
    if (passwords.new !== passwords.confirm) { setPasswordMsg('Las contraseñas no coinciden.'); return; }
    if (passwords.new.length < 8) { setPasswordMsg('La contraseña debe tener al menos 8 caracteres.'); return; }
    const { error } = await supabase.auth.updateUser({ password: passwords.new });
    if (error) { setPasswordMsg(error.message); return; }
    setPasswordMsg('Contraseña actualizada correctamente.');
    setPasswords({ current: '', new: '', confirm: '' });
    setChangingPassword(false);
    await supabase.from('security_settings').update({ last_password_change: new Date().toISOString() }).eq('user_id', (await supabase.auth.getUser()).data.user?.id);
  };

  const revokeSession = async (sessionId: string) => {
    await supabase.from('active_sessions').delete().eq('id', sessionId);
    setSessions(s => s.filter(x => x.id !== sessionId));
  };

  const update = (key: keyof SecuritySettings, value: boolean | number | string | string[]) => setSettings(p => ({ ...p, [key]: value }));

  if (loading) {
    return <div className="glass-panel rounded-2xl p-6"><LoadingScreen compact /></div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="glass-panel rounded-2xl p-6 space-y-6">
        <h2 className="font-display text-xl font-semibold text-white">Seguridad</h2>

        <div>
          <div className="flex items-center gap-2 mb-4">
            <Key size={18} className="text-warning" />
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Contraseña</h3>
          </div>
          {settings.last_password_change && (
            <p className="text-xs text-text-muted mb-3">Último cambio: {new Date(settings.last_password_change).toLocaleDateString('es-CL')}</p>
          )}
          {!changingPassword ? (
            <button onClick={() => setChangingPassword(true)} className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-white hover:bg-surface-hover transition-colors">
              Cambiar Contraseña
            </button>
          ) : (
            <div className="space-y-3 rounded-xl border border-border bg-surface/30 p-4">
              <input type="password" placeholder="Contraseña actual" value={passwords.current} onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))} className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary" />
              <input type="password" placeholder="Nueva contraseña" value={passwords.new} onChange={e => setPasswords(p => ({ ...p, new: e.target.value }))} className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary" />
              <input type="password" placeholder="Confirmar nueva contraseña" value={passwords.confirm} onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))} className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary" />
              {passwordMsg && <p className={`text-sm ${passwordMsg.includes('correctamente') ? 'text-success' : 'text-danger'}`}>{passwordMsg}</p>}
              <div className="flex gap-2">
                <button onClick={handleChangePassword} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover">Actualizar</button>
                <button onClick={() => { setChangingPassword(false); setPasswordMsg(''); }} className="rounded-lg px-4 py-2 text-sm text-text-muted hover:text-white">Cancelar</button>
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center gap-2 mb-4">
            <Shield size={18} className="text-primary" />
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Autenticación</h3>
          </div>
          <div className="rounded-xl border border-border bg-surface/30 px-4">
            <Toggle checked={settings.two_factor_enabled} onChange={v => update('two_factor_enabled', v)} label="Autenticación de Dos Factores (2FA)" description="Añade una capa extra de seguridad a tu cuenta" />
            {settings.two_factor_enabled && (
              <div className="py-3 border-b border-border">
                <label className="text-xs text-text-muted mb-1 block">Método 2FA</label>
                <select value={settings.two_factor_method} onChange={e => update('two_factor_method', e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-primary">
                  <option value="app">Aplicación Autenticadora</option>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                </select>
              </div>
            )}
            <Toggle checked={settings.login_notifications} onChange={v => update('login_notifications', v)} label="Notificaciones de Inicio de Sesión" description="Recibir alerta cuando alguien inicie sesión en tu cuenta" />
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-4">
            <Clock size={18} className="text-accent" />
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Sesión</h3>
          </div>
          <div className="rounded-xl border border-border bg-surface/30 p-4 space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-muted">Tiempo de Expiración de Sesión</label>
              <select value={settings.session_timeout_minutes} onChange={e => update('session_timeout_minutes', Number(e.target.value))} className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary">
                <option value={60}>1 hora</option>
                <option value={240}>4 horas</option>
                <option value={480}>8 horas</option>
                <option value={1440}>24 horas</option>
                <option value={10080}>7 días</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
          {saved && <span className="flex items-center gap-1.5 text-sm text-success"><CheckCircle2 size={16} /> Configuración guardada</span>}
          <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover shadow-lg shadow-primary/20 disabled:opacity-70">
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            Guardar Cambios
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Monitor size={18} className="text-secondary" />
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Sesiones Activas</h3>
        </div>
        {sessions.length === 0 ? (
          <p className="text-sm text-text-muted">No hay sesiones registradas.</p>
        ) : (
          <div className="space-y-3">
            {sessions.map(s => (
              <div key={s.id} className={`flex items-center justify-between rounded-xl border p-4 ${s.is_current ? 'border-primary/30 bg-primary/5' : 'border-border bg-surface/30'}`}>
                <div className="flex items-center gap-3">
                  <Monitor size={18} className={s.is_current ? 'text-primary' : 'text-text-muted'} />
                  <div>
                    <p className="text-sm font-medium text-white">{s.device} — {s.browser}</p>
                    <p className="text-xs text-text-muted">{s.ip_address} · {s.location} {s.is_current && <span className="text-primary font-medium">· Sesión actual</span>}</p>
                  </div>
                </div>
                {!s.is_current && (
                  <button onClick={() => revokeSession(s.id)} className="rounded-lg p-2 text-text-muted hover:bg-danger/10 hover:text-danger transition-colors">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
