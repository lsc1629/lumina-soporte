import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { supabase } from '@/lib/supabase';
import LoadingScreen from '../LoadingScreen';
import { CheckCircle2, Loader2 } from 'lucide-react';

interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  company_name: string;
  avatar_url: string;
  timezone: string;
  job_title: string;
}

export default function ProfileSection() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', job_title: '', timezone: '', company_name: '' });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (data) {
      setProfile(data);
      setForm({
        full_name: data.full_name || '',
        email: data.email || '',
        phone: data.phone || '',
        job_title: data.job_title || '',
        timezone: data.timezone || 'America/Santiago',
        company_name: data.company_name || '',
      });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setSaved(false);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name,
        phone: form.phone,
        job_title: form.job_title,
        timezone: form.timezone,
        company_name: form.company_name,
      })
      .eq('id', profile.id);

    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  if (loading) {
    return <div className="glass-panel rounded-2xl p-6"><LoadingScreen compact /></div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-2xl p-6">
      <h2 className="mb-6 font-display text-xl font-semibold text-white">Perfil de Usuario</h2>

      <div className="mb-8 flex items-center gap-6">
        <div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-border">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="Profile" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary/20 text-2xl font-bold text-primary">
              {form.full_name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
          )}
        </div>
        <div>
          <h3 className="text-lg font-medium text-white">{form.full_name}</h3>
          <p className="text-sm text-text-muted">{form.email}</p>
          <p className="mt-1 text-xs text-text-muted">ID: {profile?.id?.slice(0, 8)}...</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-muted">Nombre Completo</label>
          <input type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-muted">Correo Electrónico</label>
          <input type="email" value={form.email} disabled className="w-full rounded-lg border border-border bg-surface/50 px-4 py-2.5 text-sm text-text-muted outline-none cursor-not-allowed" />
          <p className="text-[11px] text-text-muted">El correo no se puede cambiar desde aquí.</p>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-muted">Cargo / Rol</label>
          <input type="text" value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-muted">Zona Horaria</label>
          <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary">
            <option value="America/Santiago">America/Santiago (GMT-4)</option>
            <option value="America/Bogota">America/Bogota (GMT-5)</option>
            <option value="America/Mexico_City">America/Mexico_City (GMT-6)</option>
            <option value="America/New_York">America/New_York (GMT-4)</option>
            <option value="America/Los_Angeles">America/Los_Angeles (GMT-7)</option>
            <option value="Europe/Madrid">Europe/Madrid (GMT+2)</option>
            <option value="Europe/London">Europe/London (GMT+1)</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-muted">Teléfono</label>
          <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+56 9 1234 5678" className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-muted">Empresa</label>
          <input type="text" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} placeholder="Mi Empresa S.A." className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
        </div>
      </div>

      <div className="mt-8 flex items-center justify-end gap-3 border-t border-border pt-6">
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-success">
            <CheckCircle2 size={16} /> Cambios guardados
          </span>
        )}
        <button onClick={() => loadProfile()} className="rounded-lg px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-white">
          Cancelar
        </button>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover shadow-lg shadow-primary/20 disabled:opacity-70">
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          Guardar Cambios
        </button>
      </div>
    </motion.div>
  );
}
