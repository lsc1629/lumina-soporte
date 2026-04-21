import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft,
  ArrowRight,
  Globe, 
  Server, 
  Key, 
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  User,
  Building2,
  Mail,
  Phone,
  Search,
  Plus,
  UserCheck,
  Wifi,
  WifiOff,
  Info,
  ShoppingCart,
  Code2,
  Store,
  Layout,
  Boxes,
  ExternalLink,
  Save,
  Trash2,
  Activity,
  Bot
} from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';

interface NewProjectViewProps {
  onCancel: () => void;
}

interface ClientProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  company_name: string;
  role: string;
}

interface PlatformConfig {
  key: string;
  label: string;
  dbValue: string;
  icon: React.ElementType;
  color: string;
  isHeadless?: boolean;
  guide: {
    title: string;
    steps: string[];
    docsUrl?: string;
    fields: { key: string; label: string; placeholder: string; type?: string }[];
  };
  frontendGuide?: {
    title: string;
    steps: string[];
    fields: { key: string; label: string; placeholder: string; type?: string }[];
  };
}

const platforms: PlatformConfig[] = [
  {
    key: 'wordpress', label: 'WordPress', dbValue: 'wordpress', icon: Globe, color: 'text-blue-400',
    guide: {
      title: 'Conexión vía WP REST API',
      steps: [
        'Asegúrate de que el sitio tenga WordPress 5.6+ con REST API habilitada.',
        'Ve a Usuarios → tu perfil → "Contraseñas de Aplicación" y genera una nueva.',
        'Ingresa tu usuario de WordPress y la contraseña de aplicación generada.',
        'La URL del admin suele ser: tusitio.com/wp-admin',
      ],
      docsUrl: 'https://developer.wordpress.org/rest-api/',
      fields: [
        { key: 'admin_url', label: 'URL Admin (wp-admin)', placeholder: 'https://ejemplo.com/wp-admin' },
        { key: 'admin_user', label: 'Usuario WordPress', placeholder: 'admin' },
        { key: 'admin_password', label: 'Contraseña de Aplicación', placeholder: 'xxxx xxxx xxxx xxxx xxxx xxxx', type: 'password' },
      ],
    },
  },
  {
    key: 'woocommerce', label: 'WooCommerce', dbValue: 'wordpress', icon: ShoppingCart, color: 'text-purple-400',
    guide: {
      title: 'Conexión vía WooCommerce REST API',
      steps: [
        'Requiere WordPress + WooCommerce 3.5+ instalado.',
        'Ve a WooCommerce → Ajustes → Avanzado → REST API.',
        'Crea una nueva clave API con permisos de Lectura/Escritura.',
        'Copia la Consumer Key y Consumer Secret generados.',
      ],
      docsUrl: 'https://woocommerce.github.io/woocommerce-rest-api-docs/',
      fields: [
        { key: 'admin_url', label: 'URL del Sitio', placeholder: 'https://ejemplo.com' },
        { key: 'admin_user', label: 'Consumer Key (ck_...)', placeholder: 'ck_xxxxxxxxxxxxxxxxxxxxxxxx' },
        { key: 'admin_password', label: 'Consumer Secret (cs_...)', placeholder: 'cs_xxxxxxxxxxxxxxxxxxxxxxxx', type: 'password' },
      ],
    },
  },
  {
    key: 'shopify', label: 'Shopify', dbValue: 'shopify', icon: Store, color: 'text-green-400',
    guide: {
      title: 'Conexión vía Shopify Admin API',
      steps: [
        'Ve a tu admin de Shopify → Configuración → Apps y canales de venta.',
        'Haz clic en "Desarrollar apps" → "Crear una app".',
        'En la app, configura los alcances de Admin API que necesites.',
        'Instala la app y copia el Admin API Access Token.',
      ],
      docsUrl: 'https://shopify.dev/docs/api/admin-rest',
      fields: [
        { key: 'admin_url', label: 'Dominio Shopify', placeholder: 'mi-tienda.myshopify.com' },
        { key: 'admin_user', label: 'API Version', placeholder: '2024-01' },
        { key: 'admin_password', label: 'Admin API Access Token', placeholder: 'shpat_xxxxxxxxxxxxxxxxxxxxxxxx', type: 'password' },
      ],
    },
  },
  {
    key: 'wordpress-headless', label: 'WP Headless', dbValue: 'headless', icon: Code2, color: 'text-emerald-400',
    isHeadless: true,
    guide: {
      title: 'Backend — WordPress (REST API / WPGraphQL)',
      steps: [
        'El sitio WordPress funciona como backend API, el frontend es una app separada.',
        'Asegúrate de tener WordPress 5.6+ con REST API habilitada o WPGraphQL instalado.',
        'Indica la URL exacta del REST API (ej: tusitio.com/wp-json). Puedes probarla en tu navegador.',
        'Ve a Usuarios → tu perfil → "Contraseñas de Aplicación" y genera una nueva.',
      ],
      docsUrl: 'https://developer.wordpress.org/rest-api/',
      fields: [
        { key: 'admin_url', label: 'URL del REST API', placeholder: 'https://cms.ejemplo.com/wp-json' },
        { key: 'admin_user', label: 'Usuario WordPress', placeholder: 'admin' },
        { key: 'admin_password', label: 'Contraseña de Aplicación / API Key', placeholder: 'xxxx xxxx xxxx xxxx xxxx xxxx', type: 'password' },
      ],
    },
    frontendGuide: {
      title: 'Frontend — Aplicación Web (Next.js, Nuxt, Gatsby, etc.)',
      steps: [
        'Ingresa la URL pública del frontend donde los usuarios acceden al sitio.',
        'Indica el proveedor de hosting del frontend (Vercel, Netlify, Cloudflare Pages, etc.).',
        'Opcionalmente, crea un endpoint /api/health para monitoreo avanzado.',
      ],
      fields: [
        { key: 'frontend_url', label: 'URL del Frontend', placeholder: 'https://www.ejemplo.com' },
        { key: 'frontend_provider', label: 'Proveedor Frontend (Vercel, Netlify...)', placeholder: 'Vercel' },
        { key: 'frontend_healthcheck', label: 'URL Healthcheck (opcional)', placeholder: 'https://www.ejemplo.com/api/health' },
      ],
    },
  },
  {
    key: 'woo-headless', label: 'Woo Headless', dbValue: 'headless', icon: ShoppingCart, color: 'text-fuchsia-400',
    isHeadless: true,
    guide: {
      title: 'Backend — WooCommerce (REST API)',
      steps: [
        'El backend es WordPress + WooCommerce, el frontend es una app separada.',
        'Indica la URL exacta del REST API (ej: tusitio.com/wp-json). Puedes verificarla en tu navegador.',
        'Ve a WooCommerce → Ajustes → Avanzado → REST API y crea claves.',
        'Genera Consumer Key y Consumer Secret con permisos de Lectura/Escritura.',
      ],
      docsUrl: 'https://woocommerce.github.io/woocommerce-rest-api-docs/',
      fields: [
        { key: 'admin_url', label: 'URL del REST API', placeholder: 'https://api.ejemplo.com/wp-json' },
        { key: 'admin_user', label: 'Consumer Key (ck_...)', placeholder: 'ck_xxxxxxxxxxxxxxxxxxxxxxxx' },
        { key: 'admin_password', label: 'Consumer Secret (cs_...)', placeholder: 'cs_xxxxxxxxxxxxxxxxxxxxxxxx', type: 'password' },
      ],
    },
    frontendGuide: {
      title: 'Frontend — Tienda Headless (Next.js, Nuxt, React, etc.)',
      steps: [
        'Ingresa la URL pública de la tienda donde los clientes compran.',
        'Indica el proveedor de hosting del frontend (Vercel, Netlify, etc.).',
        'Opcionalmente, agrega un endpoint de healthcheck para verificar disponibilidad.',
      ],
      fields: [
        { key: 'frontend_url', label: 'URL de la Tienda (Frontend)', placeholder: 'https://tienda.ejemplo.com' },
        { key: 'frontend_provider', label: 'Proveedor Frontend (Vercel, Netlify...)', placeholder: 'Vercel' },
        { key: 'frontend_healthcheck', label: 'URL Healthcheck (opcional)', placeholder: 'https://tienda.ejemplo.com/api/health' },
      ],
    },
  },
  {
    key: 'shopify-headless', label: 'Shopify Headless', dbValue: 'shopify', icon: Store, color: 'text-lime-400',
    isHeadless: true,
    guide: {
      title: 'Backend — Shopify Admin API',
      steps: [
        'Tu tienda Shopify funciona como backend (productos, órdenes, inventario) y el frontend es una app Next.js separada.',
        'Ve a tu admin de Shopify → Configuración → Apps y canales de venta → Desarrollar apps.',
        'Crea una app personalizada y configura los alcances de Admin API (read_products, read_themes, etc.).',
        'Instala la app y copia el Admin API Access Token generado.',
      ],
      docsUrl: 'https://shopify.dev/docs/api/admin-rest',
      fields: [
        { key: 'admin_url', label: 'Dominio Shopify', placeholder: 'mi-tienda.myshopify.com' },
        { key: 'admin_user', label: 'API Version', placeholder: '2024-01' },
        { key: 'admin_password', label: 'Admin API Access Token', placeholder: 'shpat_xxxxxxxxxxxxxxxxxxxxxxxx', type: 'password' },
      ],
    },
    frontendGuide: {
      title: 'Frontend — Storefront Next.js (Hydrogen / Custom)',
      steps: [
        'Ingresa la URL pública donde los clientes acceden a tu tienda (ej: www.mitienda.com).',
        'Indica el proveedor de hosting del frontend (Vercel, Netlify, Oxygen, etc.).',
        'Si usas Hydrogen, la URL de Oxygen será tu frontend. Si usas un Next.js custom, será la URL de Vercel/Netlify.',
        'Opcionalmente, crea un endpoint /api/health para monitoreo avanzado del storefront.',
      ],
      fields: [
        { key: 'frontend_url', label: 'URL del Storefront (Frontend)', placeholder: 'https://www.mitienda.com' },
        { key: 'frontend_provider', label: 'Proveedor Frontend (Vercel, Oxygen...)', placeholder: 'Vercel' },
        { key: 'frontend_healthcheck', label: 'URL Healthcheck (opcional)', placeholder: 'https://www.mitienda.com/api/health' },
      ],
    },
  },
  {
    key: 'jumpseller', label: 'Jumpseller', dbValue: 'jumpseller', icon: Layout, color: 'text-orange-400',
    guide: {
      title: 'Conexión vía Jumpseller API',
      steps: [
        'Ingresa a tu panel de Jumpseller → Configuración → API.',
        'Genera credenciales de API (Login y Auth Token).',
        'El Login es tu identificador y el Token es tu contraseña de API.',
        'La API base es: https://api.jumpseller.com/v1/',
      ],
      docsUrl: 'https://jumpseller.com/support/api/',
      fields: [
        { key: 'admin_url', label: 'URL de la Tienda', placeholder: 'https://mi-tienda.jumpseller.com' },
        { key: 'admin_user', label: 'API Login', placeholder: 'xxxxxxxx' },
        { key: 'admin_password', label: 'API Auth Token', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxx', type: 'password' },
      ],
    },
  },
  {
    key: 'nextjs', label: 'Next.js', dbValue: 'nextjs', icon: Boxes, color: 'text-sky-400',
    guide: {
      title: 'Conexión HTTP / Healthcheck',
      steps: [
        'Para proyectos Next.js monitoreamos la URL del sitio directamente.',
        'Opcionalmente, puedes crear un endpoint /api/health que retorne { status: "ok" }.',
        'Si usas Vercel, puedes agregar el API Token de Vercel para deploy info.',
        'No se requieren credenciales especiales para el monitoreo básico.',
      ],
      docsUrl: 'https://nextjs.org/docs',
      fields: [
        { key: 'admin_url', label: 'URL Healthcheck (opcional)', placeholder: 'https://ejemplo.com/api/health' },
        { key: 'admin_user', label: 'Deploy Provider Token (opcional)', placeholder: 'Vercel / Netlify token' },
      ],
    },
  },
  {
    key: 'headless', label: 'Headless CMS', dbValue: 'headless', icon: Server, color: 'text-indigo-400',
    guide: {
      title: 'Conexión a Headless CMS',
      steps: [
        'Ingresa la URL base de tu CMS (Strapi, Contentful, Sanity, etc.).',
        'Proporciona el API Token o clave de acceso de tu CMS.',
        'Monitoreamos el endpoint principal para verificar disponibilidad.',
      ],
      fields: [
        { key: 'admin_url', label: 'URL Base del CMS', placeholder: 'https://api.ejemplo.com' },
        { key: 'admin_user', label: 'API Key / Bearer Token', placeholder: 'Bearer xxxxxxxxxxxx' },
      ],
    },
  },
  {
    key: 'custom', label: 'Custom / Otro', dbValue: 'custom', icon: Globe, color: 'text-gray-400',
    guide: {
      title: 'Conexión Personalizada',
      steps: [
        'Ingresa la URL principal del sitio que deseas monitorear.',
        'Si tiene una API o panel admin, proporciona las credenciales de acceso.',
        'Monitoreamos la disponibilidad HTTP del sitio.',
      ],
      fields: [
        { key: 'admin_url', label: 'URL Admin / API (opcional)', placeholder: 'https://ejemplo.com/admin' },
        { key: 'admin_user', label: 'Usuario / API Key', placeholder: 'usuario o clave' },
        { key: 'admin_password', label: 'Contraseña / Secret', placeholder: '••••••••', type: 'password' },
      ],
    },
  },
];

type ConnStatus = 'idle' | 'testing' | 'success' | 'error';
interface ConnResult { status: ConnStatus; message: string; details?: string[]; }

const DRAFT_KEY = 'lumina_new_project_draft';

export default function NewProjectView({ onCancel }: NewProjectViewProps) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Step 1 - Client selection
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientProfile | null>(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ full_name: '', email: '', phone: '', company_name: '' });
  const [creatingClient, setCreatingClient] = useState(false);

  // Step 2 - Site details
  const [form, setForm] = useState({
    name: '',
    url: '',
    platform: '',
    hosting_provider: '',
    admin_url: '',
    admin_user: '',
    admin_password: '',
    notes: '',
    frontend_url: '',
    frontend_provider: '',
    frontend_healthcheck: '',
    public_slug: '',
    status_page_enabled: false,
    monitoring_interval_minutes: '5',
    log_retention_days: '90',
  });

  // Connection test
  const [connResult, setConnResult] = useState<ConnResult>({ status: 'idle', message: '' });

  // Draft
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);

  const selectedPlatform = platforms.find(p => p.key === form.platform) || null;

  const saveDraft = () => {
    const draft = {
      step,
      selectedClient,
      form,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 3000);
  };

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setDraftLoaded(false);
  };

  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.form) setForm(draft.form);
        if (draft.selectedClient) setSelectedClient(draft.selectedClient);
        if (draft.step) setStep(draft.step);
      }
    } catch { /* ignore corrupted draft */ }
  };

  useEffect(() => {
    loadClients();
    // Auto-restore draft if it exists
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.form) setForm(draft.form);
        if (draft.selectedClient) setSelectedClient(draft.selectedClient);
        if (draft.step) setStep(draft.step);
        setDraftLoaded(true);
      }
    } catch { /* ignore corrupted draft */ }
  }, []);

  // Auto-save draft when form, step, or selectedClient changes
  useEffect(() => {
    if (!selectedClient && step === 1 && !form.name && !form.url && !form.platform) return;
    const draft = { step, selectedClient, form, savedAt: new Date().toISOString() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [step, selectedClient, form]);

  const loadClients = async () => {
    setLoadingClients(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, company_name, role')
      .order('full_name');
    if (data) setClients(data);
    setLoadingClients(false);
  };

  const filteredClients = clients.filter(c => {
    if (!clientSearch) return true;
    const q = clientSearch.toLowerCase();
    return c.full_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || (c.company_name || '').toLowerCase().includes(q);
  });

  const createClient = async () => {
    if (!newClient.full_name.trim() || !newClient.email.trim()) { setError('Nombre y email son obligatorios para crear un cliente.'); return; }
    setCreatingClient(true);
    setError('');

    // Check if profile already exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone, company_name, role')
      .eq('email', newClient.email.trim())
      .single();

    if (existingProfile) {
      await supabase.from('profiles').update({
        full_name: newClient.full_name.trim(),
        phone: newClient.phone,
        company_name: newClient.company_name,
      }).eq('id', existingProfile.id);

      const updated: ClientProfile = {
        id: existingProfile.id,
        full_name: newClient.full_name.trim(),
        email: newClient.email.trim(),
        phone: newClient.phone,
        company_name: newClient.company_name,
        role: existingProfile.role,
      };
      setSelectedClient(updated);
      setClients(prev => [...prev.filter(c => c.id !== existingProfile.id), updated]);
      setShowNewClient(false);
      setNewClient({ full_name: '', email: '', phone: '', company_name: '' });
      setCreatingClient(false);
      return;
    }

    // Create new user via signUp (works with anon key)
    const tempPassword = crypto.randomUUID().slice(0, 16);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: newClient.email.trim(),
      password: tempPassword,
      options: {
        data: { full_name: newClient.full_name.trim(), role: 'client' },
      },
    });

    if (signUpError) {
      setError(`No se pudo crear el cliente: ${signUpError.message}`);
      setCreatingClient(false);
      return;
    }

    if (data?.user) {
      // Wait briefly for the profile trigger to create the profile
      await new Promise(r => setTimeout(r, 1000));

      await supabase.from('profiles').update({
        phone: newClient.phone,
        company_name: newClient.company_name,
      }).eq('id', data.user.id);

      const created: ClientProfile = {
        id: data.user.id,
        full_name: newClient.full_name.trim(),
        email: newClient.email.trim(),
        phone: newClient.phone,
        company_name: newClient.company_name,
        role: 'client',
      };
      setSelectedClient(created);
      setClients(prev => [...prev, created]);
      setShowNewClient(false);
      setNewClient({ full_name: '', email: '', phone: '', company_name: '' });
    }
    setCreatingClient(false);
  };

  const update = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const selectPlatform = (key: string) => {
    setForm(f => ({ ...f, platform: key, admin_url: '', admin_user: '', admin_password: '', frontend_url: '', frontend_provider: '', frontend_healthcheck: '' }));
    setConnResult({ status: 'idle', message: '' });
  };

  const testConnection = async () => {
    if (!form.url.trim()) { setConnResult({ status: 'error', message: 'Ingresa la URL del sitio primero.' }); return; }
    setConnResult({ status: 'testing', message: 'Probando conexión...' });

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/test-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          url: form.url,
          platform: form.platform,
          admin_url: form.admin_url,
          admin_user: form.admin_user,
          admin_password: form.admin_password,
          frontend_url: form.frontend_url,
          frontend_healthcheck: form.frontend_healthcheck,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        setConnResult({ status: 'error', message: 'ERROR AL INVOCAR LA FUNCIÓN', details: [`✗ HTTP ${res.status}: ${text.substring(0, 200)}`] });
        return;
      }

      const data = await res.json();

      const details = (data.details || []).map((d: { text: string; type: string }) => {
        if (d.type === 'success') return `✓ ${d.text}`;
        if (d.type === 'error') return `✗ ${d.text}`;
        if (d.type === 'warning') return `⚠ ${d.text}`;
        if (d.type === 'info') return d.text;
        if (d.type === 'separator') return d.text;
        return d.text;
      });

      setConnResult({
        status: data.ok ? 'success' : 'error',
        message: data.message || 'Test completado',
        details,
      });
    } catch (err) {
      setConnResult({
        status: 'error',
        message: 'Error de red',
        details: [`✗ No se pudo conectar con el servicio de prueba: ${err instanceof Error ? err.message : 'Error desconocido'}`],
      });
    }
  };

  const goToStep2 = () => {
    setError('');
    if (!selectedClient) { setError('Selecciona un cliente para continuar.'); return; }
    setStep(2);
  };

  const goToStep3 = () => {
    setError('');
    if (!form.name.trim() || !form.url.trim() || !form.platform) {
      setError('Completa los campos obligatorios: nombre, URL y plataforma.');
      return;
    }
    setStep(3);
  };

  const handleSubmit = async () => {
    setError('');
    if (!selectedClient || !selectedPlatform) return;

    setSaving(true);
    const cleanUrl = form.url.replace(/^https?:\/\//, '').replace(/\/$/, '');

    const projectData: Record<string, unknown> = {
      owner_id: selectedClient.id,
      name: form.name.trim(),
      url: cleanUrl,
      platform: selectedPlatform.dbValue,
      hosting_provider: form.hosting_provider,
      admin_url: form.admin_url,
      admin_user: form.admin_user,
      admin_password: form.admin_password,
      notes: form.notes,
      public_slug: form.public_slug.trim() || null,
      status_page_enabled: form.status_page_enabled,
      monitoring_interval_minutes: parseInt(form.monitoring_interval_minutes) || 5,
      log_retention_days: parseInt(form.log_retention_days) || 90,
    };

    if (selectedPlatform.isHeadless) {
      projectData.frontend_url = form.frontend_url;
      projectData.frontend_provider = form.frontend_provider;
      projectData.frontend_healthcheck = form.frontend_healthcheck;
    }

    // Use save-project Edge Function to encrypt credentials before saving
    const { data: { session } } = await supabase.auth.getSession();
    const saveRes = await fetch(`${SUPABASE_URL}/functions/v1/save-project`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ data: projectData }),
    });
    const saveResult = await saveRes.json();

    setSaving(false);
    if (!saveResult.success) { setError(saveResult.error || 'Error al guardar proyecto'); return; }
    clearDraft();
    onCancel();
  };

  const steps = [
    { num: 1, label: 'Información del Cliente', icon: User },
    { num: 2, label: 'Detalles del Sitio', icon: Globe },
    { num: 3, label: 'Confirmación', icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button 
          onClick={step > 1 ? () => { setStep(step - 1); setError(''); } : onCancel}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-text-muted transition-colors hover:bg-surface-hover hover:text-white border border-border"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">Nuevo Proyecto</h1>
          <p className="text-sm text-text-muted">Añade un nuevo sitio para monitoreo y mantenimiento.</p>
        </div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel rounded-2xl p-6 lg:p-8 max-w-4xl mx-auto"
      >
        {/* Draft restored banner */}
        {draftLoaded && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-5 py-3">
            <div className="flex items-center gap-3">
              <Save size={16} className="text-primary" />
              <p className="text-sm text-white">Se restauró un borrador guardado anteriormente.</p>
            </div>
            <button onClick={() => { clearDraft(); setStep(1); setSelectedClient(null); setForm({ name: '', url: '', platform: '', hosting_provider: '', admin_url: '', admin_user: '', admin_password: '', notes: '', frontend_url: '', frontend_provider: '', frontend_healthcheck: '', public_slug: '', status_page_enabled: false, monitoring_interval_minutes: '5', log_retention_days: '90' }); }} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-muted hover:text-danger hover:border-danger/30 transition-colors">
              <Trash2 size={12} /> Descartar
            </button>
          </motion.div>
        )}

        {/* Draft saved toast */}
        <AnimatePresence>
          {draftSaved && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mb-6 flex items-center gap-3 rounded-xl border border-success/20 bg-success/5 px-5 py-3">
              <CheckCircle2 size={16} className="text-success" />
              <p className="text-sm text-success font-medium">Progreso guardado correctamente</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stepper */}
        <div className="mb-10 flex items-center justify-between border-b border-border pb-6">
          {steps.map((s, i) => (
            <div key={s.num} className="flex items-center">
              <div className="flex items-center gap-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all ${step >= s.num ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'border border-border bg-surface text-text-muted'}`}>
                  {step > s.num ? <CheckCircle2 size={16} /> : s.num}
                </div>
                <span className={`hidden sm:inline text-sm font-medium ${step >= s.num ? 'text-white' : 'text-text-muted'}`}>{s.label}</span>
              </div>
              {i < steps.length - 1 && <div className="h-px w-8 sm:w-16 lg:w-24 bg-border mx-3 sm:mx-4"></div>}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* ===== STEP 1: Cliente ===== */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-6">
              <h2 className="font-display text-xl font-semibold text-white flex items-center gap-2">
                <User size={20} className="text-primary" />
                Información del Cliente
              </h2>
              <p className="text-sm text-text-muted">Selecciona el cliente al que pertenece este proyecto o crea uno nuevo.</p>

              {/* Search + New button */}
              <div className="flex gap-3">
                <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5">
                  <Search size={16} className="text-text-muted" />
                  <input type="text" value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="Buscar por nombre, email o empresa..." className="w-full bg-transparent text-sm text-white placeholder-text-muted outline-none" />
                </div>
                <button onClick={() => { setShowNewClient(!showNewClient); setError(''); }} className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors">
                  <Plus size={16} />
                  Nuevo Cliente
                </button>
              </div>

              {/* New client form */}
              {showNewClient && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Plus size={14} /> Registrar Nuevo Cliente</h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-text-muted">Nombre Completo <span className="text-danger">*</span></label>
                      <input type="text" value={newClient.full_name} onChange={e => setNewClient(n => ({ ...n, full_name: e.target.value }))} placeholder="Juan Pérez" className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-white outline-none focus:border-primary" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-text-muted">Email <span className="text-danger">*</span></label>
                      <input type="email" value={newClient.email} onChange={e => setNewClient(n => ({ ...n, email: e.target.value }))} placeholder="cliente@empresa.com" className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-white outline-none focus:border-primary" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-text-muted">Teléfono</label>
                      <input type="tel" value={newClient.phone} onChange={e => setNewClient(n => ({ ...n, phone: e.target.value }))} placeholder="+56 9 1234 5678" className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-white outline-none focus:border-primary" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-text-muted">Empresa</label>
                      <input type="text" value={newClient.company_name} onChange={e => setNewClient(n => ({ ...n, company_name: e.target.value }))} placeholder="Empresa S.A." className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-white outline-none focus:border-primary" />
                    </div>
                  </div>
                  <div className="flex gap-3 justify-end">
                    <button onClick={() => setShowNewClient(false)} className="text-sm text-text-muted hover:text-white">Cancelar</button>
                    <button onClick={createClient} disabled={creatingClient} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-70">
                      {creatingClient ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                      Crear y Seleccionar
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Client list */}
              {loadingClients ? (
                <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-primary" /></div>
              ) : filteredClients.length === 0 ? (
                <div className="py-8 text-center text-sm text-text-muted">No se encontraron clientes.</div>
              ) : (
                <div className="grid grid-cols-1 gap-3 max-h-[340px] overflow-y-auto pr-1">
                  {filteredClients.map(client => (
                    <button
                      key={client.id}
                      onClick={() => { setSelectedClient(client); setError(''); }}
                      className={`flex items-center gap-4 rounded-xl border p-4 text-left transition-all ${selectedClient?.id === client.id ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border bg-surface/30 hover:border-primary/40 hover:bg-surface-hover'}`}
                    >
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold ${selectedClient?.id === client.id ? 'bg-primary/20 text-primary' : 'bg-surface-hover text-text-muted'}`}>
                        {client.full_name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white truncate">{client.full_name || 'Sin nombre'}</span>
                          {client.role === 'admin' && <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold text-primary uppercase">Admin</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="flex items-center gap-1 text-xs text-text-muted truncate"><Mail size={10} /> {client.email}</span>
                          {client.company_name && <span className="flex items-center gap-1 text-xs text-text-muted truncate"><Building2 size={10} /> {client.company_name}</span>}
                          {client.phone && <span className="hidden lg:flex items-center gap-1 text-xs text-text-muted"><Phone size={10} /> {client.phone}</span>}
                        </div>
                      </div>
                      {selectedClient?.id === client.id && <CheckCircle2 size={20} className="text-primary shrink-0" />}
                    </button>
                  ))}
                </div>
              )}

              {/* Selected client summary */}
              {selectedClient && (
                <div className="rounded-xl border border-success/20 bg-success/5 p-4">
                  <div className="flex items-center gap-3">
                    <UserCheck size={18} className="text-success" />
                    <div>
                      <p className="text-sm font-medium text-white">Cliente seleccionado: <span className="text-success">{selectedClient.full_name}</span></p>
                      <p className="text-xs text-text-muted">{selectedClient.email}{selectedClient.company_name ? ` • ${selectedClient.company_name}` : ''}</p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ===== STEP 2: Detalles del Sitio ===== */}
          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-8">
              {/* Basic info */}
              <div className="space-y-6">
                <h2 className="font-display text-xl font-semibold text-white flex items-center gap-2">
                  <Globe size={20} className="text-primary" />
                  Detalles del Sitio
                </h2>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-muted">Nombre del Proyecto <span className="text-danger">*</span></label>
                    <input type="text" value={form.name} onChange={e => update('name', e.target.value)} placeholder="Ej: Tienda Online Principal" className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-muted">URL del Sitio <span className="text-danger">*</span></label>
                    <input type="url" value={form.url} onChange={e => update('url', e.target.value)} placeholder="https://www.ejemplo.com" className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
                  </div>
                </div>

                {/* Platform selector */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-text-muted">Plataforma / CMS <span className="text-danger">*</span></label>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {platforms.map((p) => {
                      const Icon = p.icon;
                      return (
                        <button key={p.key} type="button" onClick={() => selectPlatform(p.key)} className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${form.platform === p.key ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-border bg-surface text-text-muted hover:border-primary/50 hover:bg-surface-hover'}`}>
                          <Icon size={18} className={form.platform === p.key ? 'text-primary' : p.color} />
                          <span className={`text-sm font-medium ${form.platform === p.key ? 'text-primary' : 'text-white'}`}>{p.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-muted">Proveedor de Hosting</label>
                    <input type="text" value={form.hosting_provider} onChange={e => update('hosting_provider', e.target.value)} placeholder="Ej: Cloudways, Vercel, WP Engine" className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-muted">Notas</label>
                    <input type="text" value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="Información adicional..." className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
                  </div>
                </div>
              </div>

              {/* Monitoring & Status Page */}
              <div className="space-y-6 border-t border-border pt-6">
                <h2 className="font-display text-xl font-semibold text-white flex items-center gap-2">
                  <Activity size={20} className="text-accent" />
                  Monitoreo y Página de Estado
                </h2>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-muted">Intervalo de Monitoreo</label>
                    <select value={form.monitoring_interval_minutes} onChange={e => update('monitoring_interval_minutes', e.target.value)} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all">
                      <option value="1">Cada 1 minuto</option>
                      <option value="3">Cada 3 minutos</option>
                      <option value="5">Cada 5 minutos</option>
                      <option value="10">Cada 10 minutos</option>
                      <option value="15">Cada 15 minutos</option>
                      <option value="30">Cada 30 minutos</option>
                      <option value="60">Cada 60 minutos</option>
                    </select>
                    <p className="text-[11px] text-text-muted">Frecuencia de chequeo del sitio. Menor intervalo = más invocaciones.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-muted">Retención de Logs</label>
                    <select value={form.log_retention_days} onChange={e => update('log_retention_days', e.target.value)} className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all">
                      <option value="30">30 días</option>
                      <option value="60">60 días</option>
                      <option value="90">90 días</option>
                      <option value="180">180 días</option>
                      <option value="365">365 días</option>
                    </select>
                    <p className="text-[11px] text-text-muted">Logs más antiguos se purgan automáticamente para controlar el tamaño de la BD.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-text-muted">Slug Página de Estado</label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted whitespace-nowrap">/status/</span>
                      <input type="text" value={form.public_slug} onChange={e => update('public_slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="mi-tienda" className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
                    </div>
                    <p className="text-[11px] text-text-muted">URL pública del estado. Deja vacío para desactivar.</p>
                  </div>
                </div>
                {form.public_slug && (
                  <div className="flex items-center gap-3 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3">
                    <input type="checkbox" id="status_page_enabled" checked={form.status_page_enabled} onChange={e => setForm(f => ({ ...f, status_page_enabled: e.target.checked }))} className="h-4 w-4 rounded border-border accent-primary" />
                    <label htmlFor="status_page_enabled" className="text-sm text-white cursor-pointer">
                      Habilitar página de estado pública en <span className="font-mono text-primary">/status/{form.public_slug}</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Platform guide + credentials */}
              {selectedPlatform && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 border-t border-border pt-8">
                  {/* Connection guide */}
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-surface border border-border`}>
                          <selectedPlatform.icon size={20} className={selectedPlatform.color} />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-white">{selectedPlatform.guide.title}</h3>
                          <p className="text-xs text-text-muted">Sigue estos pasos para conectar tu sitio</p>
                        </div>
                      </div>
                      {selectedPlatform.guide.docsUrl && (
                        <a href={selectedPlatform.guide.docsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-muted hover:text-white hover:border-primary/50 transition-colors">
                          <ExternalLink size={12} /> Docs
                        </a>
                      )}
                    </div>
                    <ol className="space-y-2 ml-1">
                      {selectedPlatform.guide.steps.map((s, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary mt-0.5">{i + 1}</span>
                          <span className="text-text-muted">{s}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Lumina Agent recommendation for WordPress platforms */}
                  {['wordpress', 'wordpress-headless', 'woocommerce', 'woo-headless'].includes(form.platform) && (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                          <Bot size={20} className="text-primary" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-primary">Recomendado: Lumina Agent + API Key</h4>
                          <p className="text-xs text-text-muted">Conecta tu sitio automáticamente — sin credenciales manuales</p>
                        </div>
                      </div>
                      <p className="text-sm text-white/80 leading-relaxed">
                        Instala el plugin <strong className="text-white">Lumina Agent</strong> y pega tu <strong className="text-white">API Key</strong>.
                        El sitio se registrará y conectará automáticamente. <strong className="text-white">No necesitas configurar credenciales aquí.</strong>
                      </p>
                      <p className="text-xs text-text-muted">
                        Genera tu API Key en <strong className="text-white">Configuración → Integraciones</strong>. Puedes dejar los campos de credenciales vacíos y conectar el Agent después.
                      </p>
                    </div>
                  )}

                  {/* IMPORTANT: WordPress Application Password warning (manual fallback) */}
                  {['wordpress', 'wordpress-headless'].includes(form.platform) && (
                    <div className="rounded-xl border border-warning/30 bg-warning/5 p-5 space-y-3">
                      <div className="flex items-center gap-3">
                        <AlertTriangle size={20} className="text-warning shrink-0" />
                        <h4 className="text-sm font-bold text-warning">Método Alternativo: Contraseña de Aplicación</h4>
                      </div>
                      <p className="text-sm text-white/80 leading-relaxed">
                        Si prefieres no usar el plugin, genera una <strong className="text-white">Contraseña de Aplicación</strong> manualmente:
                      </p>
                      <ol className="space-y-1.5 ml-1 text-sm text-text-muted">
                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warning/20 text-[10px] font-bold text-warning mt-0.5">1</span>
                          Ve a <strong className="text-white">WordPress → Usuarios → Tu Perfil</strong> (debe ser Administrador)
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warning/20 text-[10px] font-bold text-warning mt-0.5">2</span>
                          Busca la sección <strong className="text-white">"Contraseñas de aplicación"</strong> (al final de la página)
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warning/20 text-[10px] font-bold text-warning mt-0.5">3</span>
                          Escribe un nombre (ej: "LuminaSupport") y haz click en <strong className="text-white">"Añadir nueva contraseña de aplicación"</strong>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warning/20 text-[10px] font-bold text-warning mt-0.5">4</span>
                          Copia la contraseña generada (formato: <code className="text-primary bg-surface px-1.5 py-0.5 rounded text-xs">aBcD eFgH iJkL mNoP qRsT uVwX</code>) y pégala abajo
                        </li>
                      </ol>
                      <p className="text-xs text-warning/70 italic">* La contraseña de aplicación solo se muestra una vez. Si la pierdes, genera una nueva.</p>
                    </div>
                  )}

                  {/* Dynamic credential fields */}
                  <div className="space-y-4">
                    <h2 className="font-display text-xl font-semibold text-white flex items-center gap-2">
                      <Key size={20} className="text-secondary" />
                      Credenciales de {selectedPlatform.label}
                    </h2>
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      {selectedPlatform.guide.fields.map((field) => (
                        <div key={field.key} className={`space-y-2 ${selectedPlatform.guide.fields.length % 2 !== 0 && field === selectedPlatform.guide.fields[selectedPlatform.guide.fields.length - 1] ? 'md:col-span-2' : ''}`}>
                          <label className="text-sm font-medium text-text-muted">{field.label}</label>
                          <div className="relative">
                            <input
                              type={field.type || 'text'}
                              value={String(form[field.key as keyof typeof form] || '')}
                              onChange={e => update(field.key, e.target.value)}
                              placeholder={field.placeholder}
                              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                            />
                            {field.type === 'password' && <Key size={14} className="absolute right-4 top-3.5 text-text-muted" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Frontend section for headless */}
                  {selectedPlatform.isHeadless && selectedPlatform.frontendGuide && (
                    <div className="space-y-6 border-t border-border pt-8">
                      <div className="rounded-xl border border-secondary/20 bg-secondary/5 p-5 space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface border border-border">
                            <Boxes size={20} className="text-secondary" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-white">{selectedPlatform.frontendGuide.title}</h3>
                            <p className="text-xs text-text-muted">Configuración del frontend para monitoreo dual</p>
                          </div>
                        </div>
                        <ol className="space-y-2 ml-1">
                          {selectedPlatform.frontendGuide.steps.map((s, i) => (
                            <li key={i} className="flex items-start gap-3 text-sm">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary/20 text-[10px] font-bold text-secondary mt-0.5">{i + 1}</span>
                              <span className="text-text-muted">{s}</span>
                            </li>
                          ))}
                        </ol>
                      </div>

                      <div className="space-y-4">
                        <h2 className="font-display text-xl font-semibold text-white flex items-center gap-2">
                          <Boxes size={20} className="text-secondary" />
                          Conexión Frontend
                        </h2>
                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                          {selectedPlatform.frontendGuide.fields.map((field) => (
                            <div key={field.key} className={`space-y-2 ${selectedPlatform.frontendGuide!.fields.length % 2 !== 0 && field === selectedPlatform.frontendGuide!.fields[selectedPlatform.frontendGuide!.fields.length - 1] ? 'md:col-span-2' : ''}`}>
                              <label className="text-sm font-medium text-text-muted">{field.label}</label>
                              <input
                                type={field.type || 'text'}
                                value={String(form[field.key as keyof typeof form] || '')}
                                onChange={e => update(field.key, e.target.value)}
                                placeholder={field.placeholder}
                                className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm text-white outline-none focus:border-secondary focus:ring-1 focus:ring-secondary transition-all"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Test connection */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={testConnection}
                        disabled={connResult.status === 'testing' || !form.url.trim()}
                        className={`flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium transition-all disabled:opacity-50 ${
                          connResult.status === 'success'
                            ? 'bg-success/10 border border-success/30 text-success hover:bg-success/20'
                            : connResult.status === 'error'
                              ? 'bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20'
                              : 'bg-surface border border-border text-white hover:bg-surface-hover hover:border-primary/50'
                        }`}
                      >
                        {connResult.status === 'testing' ? <Loader2 size={16} className="animate-spin" /> :
                         connResult.status === 'success' ? <Wifi size={16} /> :
                         connResult.status === 'error' ? <WifiOff size={16} /> :
                         <Wifi size={16} />}
                        {connResult.status === 'testing' ? 'Probando...' :
                         connResult.status === 'success' ? 'Conexión Verificada' :
                         connResult.status === 'error' ? 'Reintentar Conexión' :
                         'Probar Conexión'}
                      </button>
                      {connResult.status === 'idle' && (
                        <span className="text-xs text-text-muted flex items-center gap-1.5">
                          <Info size={12} /> Verifica que el sitio sea accesible antes de continuar
                        </span>
                      )}
                    </div>

                    {/* Connection result details */}
                    {connResult.details && connResult.details.length > 0 && (
                      <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className={`rounded-xl border p-4 space-y-1.5 ${connResult.status === 'success' ? 'border-success/20 bg-success/5' : 'border-danger/20 bg-danger/5'}`}>
                        <p className={`text-xs font-semibold uppercase tracking-wider ${connResult.status === 'success' ? 'text-success' : 'text-danger'}`}>
                          {connResult.message}
                        </p>
                        {connResult.details.map((d, i) => (
                          <p key={i} className={`text-sm ${d.startsWith('✓') ? 'text-success' : d.startsWith('✗') ? 'text-danger' : d.startsWith('⚠') ? 'text-warning' : d.startsWith('ℹ') ? 'text-primary' : 'text-text-muted'}`}>
                            {d}
                          </p>
                        ))}
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* ===== STEP 3: Confirmación ===== */}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-6">
              <h2 className="font-display text-xl font-semibold text-white flex items-center gap-2">
                <CheckCircle2 size={20} className="text-success" />
                Confirmar Nuevo Proyecto
              </h2>
              <p className="text-sm text-text-muted">Revisa los datos antes de crear el proyecto.</p>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Client card */}
                <div className="rounded-xl border border-border bg-surface/30 p-5 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-2"><User size={14} className="text-primary" /> Cliente</h3>
                  <div className="space-y-1.5">
                    <p className="text-base font-semibold text-white">{selectedClient?.full_name}</p>
                    <p className="text-sm text-text-muted">{selectedClient?.email}</p>
                    {selectedClient?.company_name && <p className="flex items-center gap-1.5 text-sm text-text-muted"><Building2 size={12} /> {selectedClient.company_name}</p>}
                    {selectedClient?.phone && <p className="flex items-center gap-1.5 text-sm text-text-muted"><Phone size={12} /> {selectedClient.phone}</p>}
                  </div>
                </div>

                {/* Project card */}
                <div className="rounded-xl border border-border bg-surface/30 p-5 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-2"><Globe size={14} className="text-primary" /> Proyecto</h3>
                  <div className="space-y-1.5">
                    <p className="text-base font-semibold text-white">{form.name}</p>
                    <p className="text-sm text-text-muted">{form.url}</p>
                    <div className="flex items-center gap-3 pt-1">
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{selectedPlatform?.label || form.platform}</span>
                      {form.hosting_provider && <span className="rounded bg-surface px-2 py-0.5 text-xs font-medium text-text-muted border border-border">{form.hosting_provider}</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Backend credentials summary */}
              {(form.admin_url || form.admin_user) && (
                <div className="rounded-xl border border-border bg-surface/30 p-5 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-2">
                    <Key size={14} className="text-secondary" />
                    {selectedPlatform?.isHeadless ? 'Credenciales Backend' : 'Credenciales'}
                  </h3>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 text-sm">
                    {form.admin_url && <p className="text-text-muted">Admin URL: <span className="text-white">{form.admin_url}</span></p>}
                    {form.admin_user && <p className="text-text-muted">Usuario/Key: <span className="text-white">{form.admin_user}</span></p>}
                    {form.admin_password && <p className="text-text-muted">Secret: <span className="text-white">••••••••</span></p>}
                  </div>
                </div>
              )}

              {/* Frontend summary for headless */}
              {selectedPlatform?.isHeadless && form.frontend_url && (
                <div className="rounded-xl border border-secondary/20 bg-secondary/5 p-5 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-2">
                    <Boxes size={14} className="text-secondary" /> Conexión Frontend
                  </h3>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 text-sm">
                    <p className="text-text-muted">URL Frontend: <span className="text-white">{form.frontend_url}</span></p>
                    {form.frontend_provider && <p className="text-text-muted">Proveedor: <span className="text-white">{form.frontend_provider}</span></p>}
                    {form.frontend_healthcheck && <p className="text-text-muted">Healthcheck: <span className="text-white">{form.frontend_healthcheck}</span></p>}
                  </div>
                </div>
              )}

              {/* Monitoring params & status page summary */}
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-5 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-2">
                  <Activity size={14} className="text-accent" /> Monitoreo y Página de Estado
                </h3>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3 text-sm">
                  <p className="text-text-muted">Intervalo: <span className="text-white font-semibold">cada {form.monitoring_interval_minutes} min</span></p>
                  <p className="text-text-muted">Retención: <span className="text-white font-semibold">{form.log_retention_days} días</span></p>
                  {form.public_slug ? (
                    <p className="text-text-muted">Status Page: <span className="font-mono text-primary">/status/{form.public_slug}</span> {form.status_page_enabled ? <span className="text-success">(habilitada)</span> : <span className="text-text-muted">(deshabilitada)</span>}</p>
                  ) : (
                    <p className="text-text-muted">Status Page: <span className="text-text-muted">no configurada</span></p>
                  )}
                </div>
              </div>

              {form.notes && (
                <div className="rounded-xl border border-border bg-surface/30 p-5 space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Notas</h3>
                  <p className="text-sm text-white">{form.notes}</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {error && (
          <div className="mt-6 rounded-lg bg-danger/10 border border-danger/20 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border pt-8 mt-8">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <AlertCircle size={16} className="text-warning" />
              Paso {step} de 3
            </div>
            <button type="button" onClick={saveDraft} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-xs font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-white hover:border-primary/50">
              <Save size={14} /> Guardar Progreso
            </button>
          </div>
          <div className="flex gap-4">
            {step > 1 && (
              <button type="button" onClick={() => { setStep(step - 1); setError(''); }} className="flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-white">
                <ArrowLeft size={16} /> Atrás
              </button>
            )}
            {step === 1 && (
              <button type="button" onClick={onCancel} className="rounded-lg px-6 py-3 text-sm font-medium text-text-muted transition-colors hover:bg-surface-hover hover:text-white">
                Cancelar
              </button>
            )}
            {step < 3 && (
              <button type="button" onClick={step === 1 ? goToStep2 : goToStep3} className="flex items-center gap-2 rounded-lg bg-primary px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-primary-hover shadow-lg shadow-primary/20">
                Siguiente <ArrowRight size={16} />
              </button>
            )}
            {step === 3 && (
              <button type="button" onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-primary-hover shadow-lg shadow-primary/20 disabled:opacity-70">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                Crear Proyecto
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
