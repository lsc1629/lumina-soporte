import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { supabase } from '@/lib/supabase';
import LoadingScreen from '../LoadingScreen';
import { CheckCircle2, Loader2, Mail, Bell, MessageSquare, Smartphone } from 'lucide-react';

interface NotifPrefs {
  email_incidents: boolean;
  email_updates: boolean;
  email_reports: boolean;
  email_security: boolean;
  push_incidents: boolean;
  push_updates: boolean;
  push_reports: boolean;
  sms_incidents: boolean;
  sms_critical_only: boolean;
  digest_frequency: string;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

const defaults: NotifPrefs = {
  email_incidents: true, email_updates: true, email_reports: true, email_security: false,
  push_incidents: true, push_updates: false, push_reports: false,
  sms_incidents: false, sms_critical_only: true,
  digest_frequency: 'daily', quiet_hours_enabled: false, quiet_hours_start: '22:00', quiet_hours_end: '08:00',
};

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${checked ? 'bg-primary' : 'bg-surface-hover'}`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

export default function NotificationsSection() {
  const [prefs, setPrefs] = useState<NotifPrefs>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('notification_preferences').select('*').eq('user_id', user.id).single();
    if (data) {
      const { id, user_id, created_at, updated_at, ...rest } = data;
      setPrefs(rest as NotifPrefs);
    }
    setLoading(false);
  };

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSaving(true); setSaved(false);
    await supabase.from('notification_preferences').upsert({ user_id: user.id, ...prefs }, { onConflict: 'user_id' });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const update = (key: keyof NotifPrefs, value: boolean | string) => setPrefs(p => ({ ...p, [key]: value }));

  if (loading) {
    return <div className="glass-panel rounded-2xl p-6"><LoadingScreen compact /></div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-2xl p-6 space-y-8">
      <h2 className="font-display text-xl font-semibold text-white">Notificaciones</h2>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <Mail size={18} className="text-primary" />
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Email</h3>
        </div>
        <div className="rounded-xl border border-border bg-surface/30 px-4">
          <Toggle checked={prefs.email_incidents} onChange={(v) => update('email_incidents', v)} label="Incidentes" description="Recibir alertas cuando se detecte un incidente" />
          <Toggle checked={prefs.email_updates} onChange={(v) => update('email_updates', v)} label="Actualizaciones" description="Notificar sobre actualizaciones pendientes y completadas" />
          <Toggle checked={prefs.email_reports} onChange={(v) => update('email_reports', v)} label="Informes Mensuales" description="Recibir informes de rendimiento por email" />
          <Toggle checked={prefs.email_security} onChange={(v) => update('email_security', v)} label="Alertas de Seguridad" description="Alertas sobre vulnerabilidades detectadas" />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <Bell size={18} className="text-secondary" />
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Push / Navegador</h3>
        </div>
        <div className="rounded-xl border border-border bg-surface/30 px-4">
          <Toggle checked={prefs.push_incidents} onChange={(v) => update('push_incidents', v)} label="Incidentes Críticos" description="Notificaciones push inmediatas" />
          <Toggle checked={prefs.push_updates} onChange={(v) => update('push_updates', v)} label="Actualizaciones" />
          <Toggle checked={prefs.push_reports} onChange={(v) => update('push_reports', v)} label="Informes" />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <Smartphone size={18} className="text-success" />
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">SMS</h3>
        </div>
        <div className="rounded-xl border border-border bg-surface/30 px-4">
          <Toggle checked={prefs.sms_incidents} onChange={(v) => update('sms_incidents', v)} label="Alertas por SMS" description="Solo para incidentes graves" />
          <Toggle checked={prefs.sms_critical_only} onChange={(v) => update('sms_critical_only', v)} label="Solo Críticos" description="Limitar SMS a incidentes de prioridad alta" />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare size={18} className="text-warning" />
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Resumen y Horario</h3>
        </div>
        <div className="rounded-xl border border-border bg-surface/30 p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-muted">Frecuencia del Resumen</label>
            <select value={prefs.digest_frequency} onChange={(e) => update('digest_frequency', e.target.value)} className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary">
              <option value="realtime">Tiempo real</option>
              <option value="hourly">Cada hora</option>
              <option value="daily">Diario</option>
              <option value="weekly">Semanal</option>
            </select>
          </div>
          <Toggle checked={prefs.quiet_hours_enabled} onChange={(v) => update('quiet_hours_enabled', v)} label="Horario Silencioso" description="No enviar notificaciones durante estas horas" />
          {prefs.quiet_hours_enabled && (
            <div className="grid grid-cols-2 gap-4 pl-4">
              <div className="space-y-1">
                <label className="text-xs text-text-muted">Inicio</label>
                <input type="time" value={prefs.quiet_hours_start} onChange={(e) => update('quiet_hours_start', e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-muted">Fin</label>
                <input type="time" value={prefs.quiet_hours_end} onChange={(e) => update('quiet_hours_end', e.target.value)} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-primary" />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
        {saved && <span className="flex items-center gap-1.5 text-sm text-success"><CheckCircle2 size={16} /> Preferencias guardadas</span>}
        <button onClick={load} className="rounded-lg px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-white">Restablecer</button>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover shadow-lg shadow-primary/20 disabled:opacity-70">
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          Guardar Cambios
        </button>
      </div>
    </motion.div>
  );
}
