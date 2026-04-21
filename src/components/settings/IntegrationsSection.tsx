import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import LoadingScreen from '../LoadingScreen';
import { Loader2, CheckCircle2, Link2, Unlink, ExternalLink, Activity, MessageSquare, Code2, Cloud, Mail, Key, Copy, Eye, EyeOff, Trash2, Plus, Bot, AlertTriangle } from 'lucide-react';

interface Integration {
  id: string;
  service_name: string;
  service_type: string;
  is_enabled: boolean;
  api_key_masked: string;
  webhook_url: string;
  config: Record<string, unknown>;
  last_sync: string | null;
}

const serviceIcons: Record<string, typeof Activity> = {
  UptimeRobot: Activity,
  Slack: MessageSquare,
  Discord: MessageSquare,
  GitHub: Code2,
  Cloudflare: Cloud,
  SendGrid: Mail,
};

const serviceColors: Record<string, string> = {
  UptimeRobot: 'text-success',
  Slack: 'text-[#E01E5A]',
  Discord: 'text-[#5865F2]',
  GitHub: 'text-white',
  Cloudflare: 'text-[#F6821F]',
  SendGrid: 'text-[#1A82E2]',
};

interface ApiKeyRow {
  id: string;
  key_prefix: string;
  label: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

export default function IntegrationsSection() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [webhookInput, setWebhookInput] = useState('');

  // API Key state
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
  const [showNewKey, setShowNewKey] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [revokingKey, setRevokingKey] = useState<string | null>(null);

  useEffect(() => { load(); loadApiKeys(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('integrations').select('*').eq('user_id', user.id).order('service_name');
    if (data) setIntegrations(data as Integration[]);
    setLoading(false);
  };

  const loadApiKeys = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('api_keys').select('id, key_prefix, label, is_active, created_at, last_used_at').eq('user_id', user.id).order('created_at', { ascending: false });
    if (data) setApiKeys(data as ApiKeyRow[]);
  };

  const handleGenerateKey = async () => {
    setGeneratingKey(true);
    setNewlyGeneratedKey(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-api-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ label: newKeyLabel || 'Default' }),
      });
      const text = await res.text();
      console.error('[generate-api-key] status:', res.status, 'body:', text);
      let result: Record<string, unknown>;
      try { result = JSON.parse(text); } catch { result = { error: text }; }
      if (result.success && result.api_key) {
        setNewlyGeneratedKey(result.api_key as string);
        setShowNewKey(true);
        setNewKeyLabel('');
        await loadApiKeys();
      } else {
        alert(`Error al generar API Key (HTTP ${res.status}): ${result.error || result.message || text.slice(0, 200)}`);
      }
    } catch (e) {
      console.error('[generate-api-key] fetch error:', e);
      alert(`Error de conexión: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (!confirm('¿Revocar esta API Key? Los sitios que la usen se desconectarán.')) return;
    setRevokingKey(id);
    await supabase.from('api_keys').update({ is_active: false }).eq('id', id);
    await loadApiKeys();
    setRevokingKey(null);
  };

  const copyKey = (text: string) => {
    navigator.clipboard.writeText(text);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const toggleIntegration = async (id: string, enabled: boolean) => {
    setSaving(id);
    await supabase.from('integrations').update({ is_enabled: enabled }).eq('id', id);
    setIntegrations(prev => prev.map(i => i.id === id ? { ...i, is_enabled: enabled } : i));
    setSaving(null);
  };

  const saveApiKey = async (id: string) => {
    setSaving(id);
    const masked = keyInput ? `${keyInput.slice(0, 4)}${'•'.repeat(Math.max(0, keyInput.length - 8))}${keyInput.slice(-4)}` : '';
    await supabase.from('integrations').update({ api_key_masked: masked, webhook_url: webhookInput }).eq('id', id);
    setIntegrations(prev => prev.map(i => i.id === id ? { ...i, api_key_masked: masked, webhook_url: webhookInput } : i));
    setEditingKey(null);
    setKeyInput('');
    setWebhookInput('');
    setSaving(null);
  };

  if (loading) {
    return <div className="glass-panel rounded-2xl p-6"><LoadingScreen compact /></div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

      {/* ═══ Lumina Agent API Key ═══ */}
      <div className="glass-panel rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20">
            <Key size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="font-display text-xl font-semibold text-white">API Key — Lumina Agent</h2>
            <p className="text-sm text-text-muted">Usa tu API Key para conectar sitios WordPress con una sola configuración.</p>
          </div>
        </div>

        {/* Newly generated key banner */}
        {newlyGeneratedKey && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-warning shrink-0" />
              <p className="text-sm font-semibold text-warning">Guarda esta API Key — no podrás verla de nuevo</p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-surface px-3 py-2 text-sm font-mono text-white break-all">
                {showNewKey ? newlyGeneratedKey : newlyGeneratedKey.slice(0, 12) + '•'.repeat(30)}
              </code>
              <button onClick={() => setShowNewKey(!showNewKey)} className="rounded-lg border border-border p-2 text-text-muted hover:text-white transition-colors" title={showNewKey ? 'Ocultar' : 'Mostrar'}>
                {showNewKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button onClick={() => copyKey(newlyGeneratedKey)} className="rounded-lg border border-border p-2 text-text-muted hover:text-white transition-colors" title="Copiar">
                {keyCopied ? <CheckCircle2 size={16} className="text-success" /> : <Copy size={16} />}
              </button>
            </div>
            <p className="text-xs text-text-muted">Pega esta key en tu plugin WordPress: <strong className="text-white">WP Admin → Ajustes → Lumina Agent</strong></p>
          </div>
        )}

        {/* Generate new key */}
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-text-muted">Etiqueta (opcional)</label>
            <input
              type="text"
              value={newKeyLabel}
              onChange={e => setNewKeyLabel(e.target.value)}
              placeholder="Ej: Producción, Staging..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-primary"
            />
          </div>
          <button
            onClick={handleGenerateKey}
            disabled={generatingKey}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover transition-colors disabled:opacity-50 shrink-0"
          >
            {generatingKey ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Generar API Key
          </button>
        </div>

        {/* Existing keys list */}
        {apiKeys.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Tus API Keys</h4>
            {apiKeys.map(k => (
              <div key={k.id} className={`flex items-center justify-between rounded-lg border p-3 ${k.is_active ? 'border-border bg-surface/30' : 'border-border/50 bg-surface/10 opacity-50'}`}>
                <div className="flex items-center gap-3">
                  <Bot size={16} className={k.is_active ? 'text-primary' : 'text-text-muted'} />
                  <div>
                    <div className="flex items-center gap-2">
                      <code className="text-sm text-white">{k.key_prefix}••••••••</code>
                      <span className="text-xs text-text-muted">— {k.label}</span>
                      {!k.is_active && <span className="rounded bg-error/20 px-1.5 py-0.5 text-[10px] font-semibold text-error">Revocada</span>}
                    </div>
                    <div className="flex gap-3 text-[11px] text-text-muted mt-0.5">
                      <span>Creada: {new Date(k.created_at).toLocaleDateString('es-CL')}</span>
                      {k.last_used_at && <span>Último uso: {new Date(k.last_used_at).toLocaleDateString('es-CL')}</span>}
                    </div>
                  </div>
                </div>
                {k.is_active && (
                  <button
                    onClick={() => handleRevokeKey(k.id)}
                    disabled={revokingKey === k.id}
                    className="flex items-center gap-1 rounded-lg border border-error/30 px-3 py-1.5 text-xs font-medium text-error hover:bg-error/10 transition-colors disabled:opacity-50"
                  >
                    {revokingKey === k.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    Revocar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {apiKeys.length === 0 && !newlyGeneratedKey && (
          <div className="text-center py-6 text-text-muted">
            <Key size={28} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No tienes API Keys. Genera una para conectar sitios WordPress.</p>
          </div>
        )}
      </div>

      {/* ═══ Integraciones externas ═══ */}
      <div className="glass-panel rounded-2xl p-6 space-y-6">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">Integraciones</h2>
          <p className="text-sm text-text-muted mt-1">Conecta servicios externos para monitoreo, notificaciones y despliegue.</p>
        </div>

        <div className="space-y-4">
        {integrations.map(integration => {
          const Icon = serviceIcons[integration.service_name] || Link2;
          const color = serviceColors[integration.service_name] || 'text-primary';
          const isEditing = editingKey === integration.id;

          return (
            <div key={integration.id} className={`rounded-xl border p-5 transition-colors ${integration.is_enabled ? 'border-primary/30 bg-primary/5' : 'border-border bg-surface/30'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${integration.is_enabled ? 'bg-primary/10' : 'bg-surface-hover'}`}>
                    <Icon size={20} className={integration.is_enabled ? color : 'text-text-muted'} />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">{integration.service_name}</h4>
                    <p className="text-xs text-text-muted capitalize">{integration.service_type}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {integration.is_enabled && integration.api_key_masked && (
                    <span className="flex items-center gap-1 text-xs text-success"><CheckCircle2 size={12} /> Conectado</span>
                  )}
                  <button
                    onClick={() => toggleIntegration(integration.id, !integration.is_enabled)}
                    disabled={saving === integration.id}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${integration.is_enabled ? 'bg-primary' : 'bg-surface-hover'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition duration-200 ${integration.is_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

              {integration.is_enabled && (
                <div className="mt-3 pt-3 border-t border-border space-y-3">
                  {!isEditing ? (
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-text-muted">
                        {integration.api_key_masked ? (
                          <span>API Key: <code className="text-white">{integration.api_key_masked}</code></span>
                        ) : (
                          <span className="text-warning">Sin API Key configurada</span>
                        )}
                      </div>
                      <button onClick={() => { setEditingKey(integration.id); setWebhookInput(integration.webhook_url || ''); }} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-white hover:bg-surface-hover transition-colors">
                        Configurar
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs text-text-muted">API Key</label>
                        <input type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="Pegar API Key..." className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-primary" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-text-muted">Webhook URL (opcional)</label>
                        <input type="url" value={webhookInput} onChange={e => setWebhookInput(e.target.value)} placeholder="https://..." className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-primary" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => saveApiKey(integration.id)} disabled={saving === integration.id} className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover">
                          {saving === integration.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Guardar
                        </button>
                        <button onClick={() => { setEditingKey(null); setKeyInput(''); }} className="rounded-lg px-3 py-1.5 text-xs text-text-muted hover:text-white">Cancelar</button>
                      </div>
                    </div>
                  )}

                  {integration.last_sync && (
                    <p className="text-[11px] text-text-muted">Última sincronización: {new Date(integration.last_sync).toLocaleString('es-CL')}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

        {integrations.length === 0 && (
          <div className="text-center py-12 text-text-muted">
            <Unlink size={32} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">No hay integraciones configuradas.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
