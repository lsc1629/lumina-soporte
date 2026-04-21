import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { supabase } from '@/lib/supabase';
import LoadingScreen from '../LoadingScreen';
import { CheckCircle2, Loader2, Globe, Calendar, Clock, DollarSign, Hash } from 'lucide-react';

interface LocaleSettings {
  language: string;
  date_format: string;
  time_format: string;
  currency: string;
  number_format: string;
}

const defaults: LocaleSettings = {
  language: 'es', date_format: 'DD/MM/YYYY', time_format: '24h', currency: 'CLP', number_format: '1.000,00',
};

export default function LocaleSection() {
  const [settings, setSettings] = useState<LocaleSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('locale_settings').select('*').eq('user_id', user.id).single();
    if (data) {
      const { id, user_id, created_at, updated_at, ...rest } = data;
      setSettings(rest as LocaleSettings);
    }
    setLoading(false);
  };

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSaving(true); setSaved(false);
    await supabase.from('locale_settings').upsert({ user_id: user.id, ...settings }, { onConflict: 'user_id' });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const update = (key: keyof LocaleSettings, value: string) => setSettings(p => ({ ...p, [key]: value }));

  if (loading) {
    return <div className="glass-panel rounded-2xl p-6"><LoadingScreen compact /></div>;
  }

  const now = new Date();
  const previewDate = settings.date_format === 'DD/MM/YYYY'
    ? `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`
    : settings.date_format === 'MM/DD/YYYY'
    ? `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}/${now.getFullYear()}`
    : `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;

  const previewTime = settings.time_format === '24h'
    ? `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    : `${(now.getHours() % 12 || 12)}:${now.getMinutes().toString().padStart(2, '0')} ${now.getHours() >= 12 ? 'PM' : 'AM'}`;

  const previewNumber = settings.number_format === '1.000,00' ? '1.234.567,89' : settings.number_format === '1,000.00' ? '1,234,567.89' : '1 234 567,89';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-2xl p-6 space-y-8">
      <h2 className="font-display text-xl font-semibold text-white">Idioma y Región</h2>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <Globe size={18} className="text-primary" />
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Idioma</h3>
        </div>
        <select value={settings.language} onChange={e => update('language', e.target.value)} className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary">
          <option value="es">Español</option>
          <option value="en">English</option>
          <option value="pt">Português</option>
        </select>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={18} className="text-secondary" />
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Formato de Fecha</h3>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: 'DD/MM/YYYY', label: 'DD/MM/AAAA', example: '13/03/2026' },
            { value: 'MM/DD/YYYY', label: 'MM/DD/AAAA', example: '03/13/2026' },
            { value: 'YYYY-MM-DD', label: 'AAAA-MM-DD', example: '2026-03-13' },
          ].map(f => (
            <button key={f.value} onClick={() => update('date_format', f.value)} className={`rounded-xl border-2 p-4 text-center transition-all ${settings.date_format === f.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
              <p className="text-sm font-medium text-white">{f.label}</p>
              <p className="text-xs text-text-muted mt-1">{f.example}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <Clock size={18} className="text-accent" />
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Formato de Hora</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: '24h', label: '24 horas', example: '14:30' },
            { value: '12h', label: '12 horas', example: '2:30 PM' },
          ].map(f => (
            <button key={f.value} onClick={() => update('time_format', f.value)} className={`rounded-xl border-2 p-4 text-center transition-all ${settings.time_format === f.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
              <p className="text-sm font-medium text-white">{f.label}</p>
              <p className="text-xs text-text-muted mt-1">{f.example}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <DollarSign size={18} className="text-success" />
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Moneda</h3>
        </div>
        <select value={settings.currency} onChange={e => update('currency', e.target.value)} className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary">
          <option value="CLP">CLP - Peso Chileno ($)</option>
          <option value="USD">USD - Dólar Estadounidense (US$)</option>
          <option value="EUR">EUR - Euro (€)</option>
          <option value="MXN">MXN - Peso Mexicano ($)</option>
          <option value="COP">COP - Peso Colombiano ($)</option>
          <option value="ARS">ARS - Peso Argentino ($)</option>
          <option value="BRL">BRL - Real Brasileño (R$)</option>
        </select>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-4">
          <Hash size={18} className="text-warning" />
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Formato de Números</h3>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: '1.000,00', label: '1.000,00', desc: 'Punto mil / Coma decimal' },
            { value: '1,000.00', label: '1,000.00', desc: 'Coma mil / Punto decimal' },
            { value: '1 000,00', label: '1 000,00', desc: 'Espacio mil / Coma decimal' },
          ].map(f => (
            <button key={f.value} onClick={() => update('number_format', f.value)} className={`rounded-xl border-2 p-4 text-center transition-all ${settings.number_format === f.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}>
              <p className="text-sm font-medium text-white font-mono">{f.label}</p>
              <p className="text-[11px] text-text-muted mt-1">{f.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface/30 p-4">
        <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Vista Previa</h4>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div><span className="text-text-muted text-xs">Fecha:</span><p className="text-white font-mono">{previewDate}</p></div>
          <div><span className="text-text-muted text-xs">Hora:</span><p className="text-white font-mono">{previewTime}</p></div>
          <div><span className="text-text-muted text-xs">Número:</span><p className="text-white font-mono">{previewNumber}</p></div>
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
