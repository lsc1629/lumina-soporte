import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Save,
  Loader2,
  Globe,
  Key,
  Activity,
  Trash2,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Copy,
  Download,
  Wifi,
  WifiOff,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import LoadingScreen from './LoadingScreen';

interface EditProjectViewProps {
  projectId: string | null;
  onCancel: () => void;
}

export default function EditProjectView({ projectId, onCancel }: EditProjectViewProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [copied, setCopied] = useState('');

  const [form, setForm] = useState({
    name: '',
    url: '',
    platform: '',
    hosting_provider: '',
    admin_url: '',
    admin_user: '',
    admin_password: '',
    wp_app_user: '',
    wp_app_password: '',
    site_token: '',
    notes: '',
    frontend_url: '',
    frontend_provider: '',
    frontend_healthcheck: '',
    public_slug: '',
    status_page_enabled: false,
    monitoring_interval_minutes: '5',
    log_retention_days: '90',
  });
  const [originalPasswords, setOriginalPasswords] = useState({ admin_password: '', wp_app_password: '' });

  useEffect(() => {
    if (projectId) loadProject();
  }, [projectId]);

  const loadProject = async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (err || !data) {
      setError('No se pudo cargar el proyecto.');
      setLoading(false);
      return;
    }

    setOriginalPasswords({
      admin_password: data.admin_password_encrypted || '',
      wp_app_password: data.wp_app_password_encrypted || '',
    });
    setForm({
      name: data.name || '',
      url: data.url || '',
      platform: data.platform || '',
      hosting_provider: data.hosting_provider || '',
      admin_url: data.admin_url || '',
      admin_user: data.admin_user || '',
      admin_password: '',
      wp_app_user: data.wp_app_user || '',
      wp_app_password: '',
      site_token: data.site_token || '',
      notes: data.notes || '',
      frontend_url: data.frontend_url || '',
      frontend_provider: data.frontend_provider || '',
      frontend_healthcheck: data.frontend_healthcheck || '',
      public_slug: data.public_slug || '',
      status_page_enabled: data.status_page_enabled || false,
      monitoring_interval_minutes: String(data.monitoring_interval_minutes || 5),
      log_retention_days: String(data.log_retention_days || 90),
    });
    setLoading(false);
  };

  const update = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      setError('Nombre y URL son obligatorios.');
      return;
    }
    setError('');
    setSaving(true);

    const cleanUrl = form.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const updateData: Record<string, unknown> = {
      name: form.name.trim(),
      url: cleanUrl,
      platform: form.platform,
      hosting_provider: form.hosting_provider,
      admin_url: form.admin_url,
      admin_user: form.admin_user,
      admin_password: form.admin_password.trim() || originalPasswords.admin_password,
      wp_app_user: form.wp_app_user,
      wp_app_password: form.wp_app_password.trim() || originalPasswords.wp_app_password,
      notes: form.notes,
      frontend_url: form.frontend_url,
      frontend_provider: form.frontend_provider,
      frontend_healthcheck: form.frontend_healthcheck,
      public_slug: form.public_slug.trim() || null,
      status_page_enabled: form.status_page_enabled,
      monitoring_interval_minutes: parseInt(form.monitoring_interval_minutes) || 5,
      log_retention_days: parseInt(form.log_retention_days) || 90,
    };

    // Use save-project Edge Function to encrypt credentials before saving
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const { data: { session } } = await supabase.auth.getSession();
    const saveRes = await fetch(`${supabaseUrl}/functions/v1/save-project`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || anonKey}`,
        'apikey': anonKey,
      },
      body: JSON.stringify({ project_id: projectId, data: updateData }),
    });
    const saveResult = await saveRes.json();

    setSaving(false);
    if (!saveResult.success) {
      setError(saveResult.error || 'Error al guardar proyecto');
      return;
    }
    setSuccess(true);
    setTimeout(() => onCancel(), 1200);
  };

  const handleDelete = async () => {
    if (!confirm('¿Estás seguro de que deseas eliminar este proyecto?')) return;
    await supabase.from('projects').update({ is_active: false }).eq('id', projectId);
    onCancel();
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${supabaseUrl}/functions/v1/test-agent-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || anonKey}`,
          'apikey': anonKey,
        },
        body: JSON.stringify({ project_id: projectId }),
      });
      const result = await res.json();
      setTestResult(result);
    } catch (e) {
      setTestResult({ success: false, connected: false, error: `Error: ${e instanceof Error ? e.message : String(e)}` });
    }
    setTesting(false);
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onCancel}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-surface text-text-muted transition-colors hover:bg-surface-hover hover:text-white border border-border"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">Editar Proyecto</h1>
          <p className="text-sm text-text-muted">Modifica los datos de tu sitio.</p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel rounded-2xl p-6 lg:p-8 max-w-4xl mx-auto space-y-8"
      >
        {success && (
          <div className="rounded-xl border border-success/20 bg-success/5 px-5 py-3 text-sm font-medium text-success">
            Proyecto actualizado correctamente. Redirigiendo...
          </div>
        )}

        {/* Basic Info */}
        <div className="space-y-6">
          <h2 className="font-display text-xl font-semibold text-white flex items-center gap-2">
            <Globe size={20} className="text-primary" />
            Datos del Sitio
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-muted">Nombre <span className="text-danger">*</span></label>
              <input type="text" value={form.name} onChange={e => update('name', e.target.value)} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-muted">URL <span className="text-danger">*</span></label>
              <input type="text" value={form.url} onChange={e => update('url', e.target.value)} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-muted">Plataforma</label>
              <input type="text" value={form.platform} onChange={e => update('platform', e.target.value)} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary transition-all" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-muted">Hosting</label>
              <input type="text" value={form.hosting_provider} onChange={e => update('hosting_provider', e.target.value)} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary transition-all" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-muted">Notas</label>
            <textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={2} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary transition-all resize-none" />
          </div>
        </div>

        {/* Credentials */}
        <div className="space-y-6 border-t border-border pt-6">
          <h2 className="font-display text-xl font-semibold text-white flex items-center gap-2">
            <Key size={20} className="text-secondary" />
            Credenciales
          </h2>

          {/* Detect credential type: WooCommerce (ck_) vs WordPress vs other */}
          {(() => {
            const isWoo = ['wordpress', 'headless'].includes(form.platform) && form.admin_user.startsWith('ck_');
            const isWpPure = ['wordpress', 'headless'].includes(form.platform) && !isWoo;
            const hasAgent = !!form.wp_app_user;

            return (
              <>
                {/* WooCommerce info banner */}
                {isWoo && (
                  <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-4 space-y-2">
                    <div className="flex items-center gap-3">
                      <AlertTriangle size={18} className="text-purple-400 shrink-0" />
                      <h4 className="text-sm font-bold text-purple-400">Proyecto WooCommerce — Consumer Key / Secret</h4>
                    </div>
                    <p className="text-xs text-text-muted">Se usan las claves de WooCommerce REST API para sincronizar plugins. Si necesitas regenerarlas: <strong className="text-white">WooCommerce → Ajustes → Avanzado → REST API</strong>.</p>
                  </div>
                )}

                {isWoo && (
                  <div className="rounded-xl border-2 border-warning/40 bg-warning/10 p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <Key size={20} className="text-warning shrink-0" />
                      <h4 className="text-sm font-bold text-warning">Application Password — Requerido para actualizar plugins</h4>
                    </div>
                    <p className="text-sm text-white/80">
                      Para actualizar plugins/core remotamente se necesita una <strong className="text-white">Contraseña de Aplicación de WordPress</strong> (diferente a la Consumer Key de WooCommerce).
                    </p>
                    <p className="text-xs text-warning/70">Ve a: <strong className="text-white">WordPress → Usuarios → Tu Perfil → Contraseñas de aplicación</strong> y genera una nueva.</p>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mt-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-text-muted">Usuario WordPress</label>
                        <input type="text" value={form.wp_app_user} onChange={e => update('wp_app_user', e.target.value)} placeholder="admin" className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary transition-all" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-text-muted">Contraseña de Aplicación</label>
                        <input type="password" value={form.wp_app_password} onChange={e => update('wp_app_password', e.target.value)} placeholder={originalPasswords.wp_app_password ? '(sin cambios — dejar vacío para mantener)' : 'aBcD eFgH iJkL mNoP qRsT uVwX'} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary transition-all" />
                      </div>
                    </div>
                  </div>
                )}

                {/* WordPress Application Password warning */}
                {isWpPure && (
                  <div className="rounded-xl border-2 border-warning/40 bg-warning/10 p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <AlertTriangle size={20} className="text-warning shrink-0" />
                      <h4 className="text-sm font-bold text-warning">IMPORTANTE: Se requiere Contraseña de Aplicación</h4>
                    </div>
                    <p className="text-sm text-white/80">
                      WordPress <strong className="text-white">NO permite usar tu contraseña normal</strong> para la REST API.
                      Genera una en: <strong className="text-white">WordPress → Usuarios → Tu Perfil → Contraseñas de aplicación</strong>.
                    </p>
                    <p className="text-xs text-warning/70 italic">Formato: <code className="text-primary bg-surface px-1.5 py-0.5 rounded text-xs">aBcD eFgH iJkL mNoP qRsT uVwX</code></p>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-muted">
                      {isWoo ? 'URL del Sitio' : isWpPure ? 'URL Admin (wp-admin)' : 'Admin URL'}
                    </label>
                    <input type="text" value={form.admin_url} onChange={e => update('admin_url', e.target.value)} placeholder={isWoo ? 'https://ejemplo.com' : isWpPure ? 'https://ejemplo.com/wp-admin' : ''} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-muted">
                      {isWoo ? 'Consumer Key (ck_...)' : isWpPure ? 'Usuario WordPress' : 'Usuario / API Key'}
                    </label>
                    <input type="text" value={form.admin_user} onChange={e => update('admin_user', e.target.value)} placeholder={isWoo ? 'ck_xxxxxxxxxxxxxxxx' : ''} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary transition-all" />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium text-text-muted">
                      {isWoo ? 'Consumer Secret (cs_...)' : isWpPure ? 'Contraseña de Aplicación (NO la contraseña normal)' : 'Contraseña / Secret'}
                    </label>
                    <input type="password" value={form.admin_password} onChange={e => update('admin_password', e.target.value)} placeholder={originalPasswords.admin_password ? '(sin cambios — dejar vacío para mantener)' : isWoo ? 'cs_xxxxxxxxxxxxxxxx' : isWpPure ? 'aBcD eFgH iJkL mNoP qRsT uVwX' : ''} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary transition-all" />
                  </div>
                </div>
              </>
            );
          })()}
        </div>

        {/* Frontend (headless) */}
        {(form.platform === 'headless' || form.frontend_url) && (
          <div className="space-y-6 border-t border-border pt-6">
            <h2 className="font-display text-xl font-semibold text-white">Frontend (Headless)</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-muted">URL Frontend</label>
                <input type="text" value={form.frontend_url} onChange={e => update('frontend_url', e.target.value)} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-muted">Proveedor</label>
                <input type="text" value={form.frontend_provider} onChange={e => update('frontend_provider', e.target.value)} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary transition-all" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-text-muted">Healthcheck URL</label>
                <input type="text" value={form.frontend_healthcheck} onChange={e => update('frontend_healthcheck', e.target.value)} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary transition-all" />
              </div>
            </div>
          </div>
        )}

        {/* Monitoring & Status Page */}
        <div className="space-y-6 border-t border-border pt-6">
          <h2 className="font-display text-xl font-semibold text-white flex items-center gap-2">
            <Activity size={20} className="text-accent" />
            Monitoreo y Página de Estado
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-muted">Intervalo de Monitoreo</label>
              <select value={form.monitoring_interval_minutes} onChange={e => update('monitoring_interval_minutes', e.target.value)} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary transition-all">
                <option value="1">Cada 1 minuto</option>
                <option value="3">Cada 3 minutos</option>
                <option value="5">Cada 5 minutos</option>
                <option value="10">Cada 10 minutos</option>
                <option value="15">Cada 15 minutos</option>
                <option value="30">Cada 30 minutos</option>
                <option value="60">Cada 60 minutos</option>
              </select>
              <p className="text-[11px] text-text-muted">Menor intervalo = más invocaciones Edge Functions.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-muted">Retención de Logs</label>
              <select value={form.log_retention_days} onChange={e => update('log_retention_days', e.target.value)} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary transition-all">
                <option value="30">30 días</option>
                <option value="60">60 días</option>
                <option value="90">90 días</option>
                <option value="180">180 días</option>
                <option value="365">365 días</option>
              </select>
              <p className="text-[11px] text-text-muted">Logs más antiguos se purgan automáticamente.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-muted">Slug Página de Estado</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-muted whitespace-nowrap">/status/</span>
                <input type="text" value={form.public_slug} onChange={e => update('public_slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="mi-tienda" className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary transition-all" />
              </div>
            </div>
          </div>
          {form.public_slug && (
            <div className="flex items-center gap-3 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3">
              <input type="checkbox" id="edit_status_page_enabled" checked={form.status_page_enabled} onChange={e => setForm(f => ({ ...f, status_page_enabled: e.target.checked }))} className="h-4 w-4 rounded border-border accent-primary cursor-pointer" />
              <label htmlFor="edit_status_page_enabled" className="text-sm text-white cursor-pointer">
                Habilitar página pública en <span className="font-mono text-primary">/status/{form.public_slug}</span>
              </label>
            </div>
          )}
        </div>

        {/* Lumina Agent Setup — only for WordPress/Headless projects */}
        {['wordpress', 'headless'].includes(form.platform) && projectId && (
          <div className="space-y-6 border-t border-border pt-6">
            <h2 className="font-display text-xl font-semibold text-white flex items-center gap-2">
              <Bot size={20} className="text-primary" />
              Lumina Agent
            </h2>

            {/* Status: Connected (site_token v3 or wp_app_user v2) or Not */}
            {(form.site_token || form.wp_app_user) ? (
              <div className="rounded-xl border border-success/30 bg-success/10 p-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/20">
                  <Wifi size={20} className="text-success" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-success">Agent Conectado</h4>
                    <CheckCircle2 size={14} className="text-success" />
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">
                    {form.site_token
                      ? 'Conectado vía API Key — el sitio se registró automáticamente.'
                      : <>Usuario legacy: <code className="text-primary bg-surface px-1 rounded text-[11px]">{form.wp_app_user}</code></>
                    }
                  </p>
                </div>
                <button
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs font-medium text-success hover:bg-success/20 transition-colors disabled:opacity-50"
                >
                  {testing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Verificar
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/20">
                  <WifiOff size={20} className="text-warning" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-warning">Agent No Conectado</h4>
                  <p className="text-xs text-text-muted mt-0.5">Instala el plugin y pega tu API Key. El sitio se conectará automáticamente.</p>
                </div>
              </div>
            )}

            {/* Test Connection Result */}
            {testResult && (
              <div className={`rounded-xl border p-4 space-y-2 ${
                testResult.connected
                  ? 'border-success/30 bg-success/5'
                  : 'border-danger/30 bg-danger/5'
              }`}>
                {testResult.connected ? (
                  <>
                    <h4 className="text-sm font-bold text-success flex items-center gap-2">
                      <CheckCircle2 size={16} /> Conexión Exitosa
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                      <div className="rounded-lg bg-surface p-2.5 text-center">
                        <p className="text-[10px] text-text-muted uppercase">Agent</p>
                        <p className="text-sm font-mono font-semibold text-white">v{String(testResult.agent_version || '?')}</p>
                      </div>
                      <div className="rounded-lg bg-surface p-2.5 text-center">
                        <p className="text-[10px] text-text-muted uppercase">WordPress</p>
                        <p className="text-sm font-mono font-semibold text-white">{String(testResult.wp_version || '?')}</p>
                      </div>
                      <div className="rounded-lg bg-surface p-2.5 text-center">
                        <p className="text-[10px] text-text-muted uppercase">PHP</p>
                        <p className="text-sm font-mono font-semibold text-white">{String(testResult.php_version || '?')}</p>
                      </div>
                      <div className="rounded-lg bg-surface p-2.5 text-center">
                        <p className="text-[10px] text-text-muted uppercase">Plugins</p>
                        <p className="text-sm font-mono font-semibold text-white">{String(testResult.plugins_total || 0)}</p>
                      </div>
                    </div>
                    {testResult.woocommerce && (
                      <p className="text-xs text-text-muted mt-1">WooCommerce detectado en el sitio.</p>
                    )}
                  </>
                ) : (
                  <>
                    <h4 className="text-sm font-bold text-danger flex items-center gap-2">
                      <WifiOff size={16} /> Conexión Fallida
                    </h4>
                    <p className="text-xs text-text-muted">{String(testResult.error || 'Error desconocido')}</p>
                  </>
                )}
              </div>
            )}

            {/* Simplified Setup Instructions (v3 API Key flow) */}
            <div className="rounded-xl border border-border bg-surface/50 p-5 space-y-4">
              <h4 className="text-sm font-bold text-white">Configuración Rápida</h4>
              <ol className="space-y-3 text-sm text-text-muted">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">1</span>
                  <div>
                    <p className="text-white font-medium">Descarga e instala el plugin</p>
                    <p className="text-xs mb-2">Sube el ZIP en <strong className="text-white">Plugins → Añadir nuevo → Subir plugin</strong></p>
                    <a
                      href="/lumina-agent.zip"
                      download
                      className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                    >
                      <Download size={14} /> lumina-agent.zip
                    </a>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">2</span>
                  <div>
                    <p className="text-white font-medium">Pega tu API Key</p>
                    <p className="text-xs">Ve a <strong className="text-white">WP Admin → Ajustes → Lumina Agent</strong> y pega tu API Key.</p>
                    <p className="text-xs mt-1">¿No tienes API Key? Genérala en <strong className="text-white">Configuración → Integraciones</strong> de este panel.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">3</span>
                  <div>
                    <p className="text-white font-medium">Listo</p>
                    <p className="text-xs">El plugin validará la key y registrará el sitio automáticamente. Haz clic en <strong className="text-white">Verificar</strong> para confirmar.</p>
                  </div>
                </li>
              </ol>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-danger/10 border border-danger/20 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-border pt-6">
          <button onClick={handleDelete} className="flex cursor-pointer items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm font-medium text-danger hover:bg-danger/20 transition-colors">
            <Trash2 size={16} /> Eliminar Proyecto
          </button>
          <div className="flex gap-3">
            <button onClick={onCancel} className="cursor-pointer rounded-lg px-6 py-2.5 text-sm font-medium text-text-muted hover:bg-surface-hover hover:text-white transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving} className="flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-8 py-2.5 text-sm font-medium text-white hover:bg-primary-hover shadow-lg shadow-primary/20 disabled:opacity-70 transition-colors">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Guardar Cambios
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
