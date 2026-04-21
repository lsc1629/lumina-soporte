import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { supabase } from '@/lib/supabase';
import LoadingScreen from '../LoadingScreen';
import { CheckCircle2, Loader2, Palette, Type, LayoutDashboard, Sparkles } from 'lucide-react';

interface AppearanceSettings {
  theme: string;
  accent_color: string;
  font_size: string;
  compact_mode: boolean;
  animations_enabled: boolean;
  sidebar_collapsed: boolean;
}

const defaults: AppearanceSettings = {
  theme: 'dark', accent_color: '#8b5cf6', font_size: 'medium',
  compact_mode: false, animations_enabled: true, sidebar_collapsed: false,
};

const accentColors = [
  { value: '#8b5cf6', label: 'Violeta', class: 'bg-[#8b5cf6]' },
  { value: '#3b82f6', label: 'Azul', class: 'bg-[#3b82f6]' },
  { value: '#06b6d4', label: 'Cyan', class: 'bg-[#06b6d4]' },
  { value: '#10b981', label: 'Verde', class: 'bg-[#10b981]' },
  { value: '#f59e0b', label: 'Ámbar', class: 'bg-[#f59e0b]' },
  { value: '#ef4444', label: 'Rojo', class: 'bg-[#ef4444]' },
  { value: '#ec4899', label: 'Rosa', class: 'bg-[#ec4899]' },
  { value: '#f97316', label: 'Naranja', class: 'bg-[#f97316]' },
];

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

export default function AppearanceSection() {
  const [settings, setSettings] = useState<AppearanceSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('appearance_settings').select('*').eq('user_id', user.id).single();
    if (data) {
      const { id, user_id, created_at, updated_at, ...rest } = data;
      setSettings(rest as AppearanceSettings);
    }
    setLoading(false);
  };

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSaving(true); setSaved(false);
    await supabase.from('appearance_settings').upsert({ user_id: user.id, ...settings }, { onConflict: 'user_id' });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const update = (key: keyof AppearanceSettings, value: string | boolean) => setSettings(p => ({ ...p, [key]: value }));

  if (loading) {
    return <div className="glass-panel rounded-2xl p-6"><LoadingScreen compact /></div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-2xl p-6 space-y-8">
      <h2 className="font-display text-xl font-semibold text-white">Apariencia</h2>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <Palette size={18} className="text-primary" />
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Tema</h3>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { value: 'dark', label: 'Oscuro', preview: 'bg-[#050505] border-primary/50' },
            { value: 'light', label: 'Claro', preview: 'bg-[#f8fafc] border-border' },
            { value: 'system', label: 'Sistema', preview: 'bg-gradient-to-r from-[#050505] to-[#f8fafc] border-border' },
          ].map(t => (
            <button key={t.value} onClick={() => update('theme', t.value)} className={`group relative flex flex-col items-center gap-3 rounded-xl border-2 p-4 transition-all ${settings.theme === t.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
              <div className={`h-16 w-full rounded-lg border ${t.preview}`} />
              <span className="text-sm font-medium text-white">{t.label}</span>
              {settings.theme === t.value && <CheckCircle2 size={16} className="absolute top-2 right-2 text-primary" />}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={18} className="text-warning" />
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Color de Acento</h3>
        </div>
        <div className="flex flex-wrap gap-3">
          {accentColors.map(c => (
            <button key={c.value} onClick={() => update('accent_color', c.value)} className={`group relative flex h-12 w-12 items-center justify-center rounded-xl transition-all ${settings.accent_color === c.value ? 'ring-2 ring-white ring-offset-2 ring-offset-background scale-110' : 'hover:scale-105'}`} title={c.label}>
              <div className={`h-full w-full rounded-xl ${c.class}`} />
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <Type size={18} className="text-secondary" />
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Tamaño de Fuente</h3>
        </div>
        <div className="flex gap-3">
          {[
            { value: 'small', label: 'Pequeña', size: 'text-xs' },
            { value: 'medium', label: 'Mediana', size: 'text-sm' },
            { value: 'large', label: 'Grande', size: 'text-base' },
          ].map(f => (
            <button key={f.value} onClick={() => update('font_size', f.value)} className={`flex-1 rounded-xl border-2 py-3 text-center font-medium transition-all ${settings.font_size === f.value ? 'border-primary bg-primary/5 text-white' : 'border-border text-text-muted hover:border-primary/30'}`}>
              <span className={f.size}>{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <LayoutDashboard size={18} className="text-accent" />
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Interfaz</h3>
        </div>
        <div className="rounded-xl border border-border bg-surface/30 px-4">
          <Toggle checked={settings.compact_mode} onChange={v => update('compact_mode', v)} label="Modo Compacto" description="Reduce el espaciado para ver más contenido" />
          <Toggle checked={settings.animations_enabled} onChange={v => update('animations_enabled', v)} label="Animaciones" description="Habilitar transiciones y animaciones en la interfaz" />
          <Toggle checked={settings.sidebar_collapsed} onChange={v => update('sidebar_collapsed', v)} label="Barra Lateral Colapsada" description="Iniciar con la barra lateral minimizada" />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
        {saved && <span className="flex items-center gap-1.5 text-sm text-success"><CheckCircle2 size={16} /> Apariencia guardada</span>}
        <button onClick={load} className="rounded-lg px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-white">Restablecer</button>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover shadow-lg shadow-primary/20 disabled:opacity-70">
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          Guardar Cambios
        </button>
      </div>
    </motion.div>
  );
}
