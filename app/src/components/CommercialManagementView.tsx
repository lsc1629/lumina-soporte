import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  DollarSign,
  CreditCard,
  Users,
  Zap,
  Crown,
  Building2,
  Rocket,
  Check,
  Star,
  TrendingUp,
  Shield,
  Globe,
  ArrowRight,
  Edit3,
  Trash2,
  Plus,
  Save,
  X,
  AlertTriangle,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Banknote,
  Calculator,
  Database,
  HardDrive,
  Cpu,
  Wifi,
  Server,
  Gauge,
  Info,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_monthly: number;
  price_currency: string;
  max_projects: number;
  monitoring_interval_minutes: number;
  features: string[];
  is_active: boolean;
  sort_order: number;
}

interface Subscription {
  id: string;
  client_id: string;
  plan_id: string;
  status: string;
  payment_provider: string | null;
  current_period_start: string;
  current_period_end: string;
  created_at: string;
  client?: { full_name: string; email: string; company_name: string };
  plan?: { name: string; price_monthly: number };
}

interface Payment {
  id: string;
  subscription_id: string;
  client_id: string;
  amount: number;
  currency: string;
  status: string;
  payment_provider: string | null;
  description: string | null;
  paid_at: string | null;
  created_at: string;
  client?: { full_name: string; email: string };
}

type TabId = 'plans' | 'subscriptions' | 'payments' | 'providers' | 'calculator';

const planIcons = [Rocket, Zap, Crown, Building2];
const planColors = [
  'from-blue-500 to-blue-600',
  'from-violet-500 to-violet-600',
  'from-amber-500 to-amber-600',
  'from-emerald-500 to-emerald-600',
];

const statusColors: Record<string, string> = {
  active: 'bg-success/10 text-success',
  past_due: 'bg-warning/10 text-warning',
  cancelled: 'bg-danger/10 text-danger',
  trial: 'bg-blue-500/10 text-blue-400',
  suspended: 'bg-red-500/10 text-red-400',
};

const paymentStatusColors: Record<string, string> = {
  completed: 'bg-success/10 text-success',
  pending: 'bg-warning/10 text-warning',
  failed: 'bg-danger/10 text-danger',
  refunded: 'bg-blue-500/10 text-blue-400',
};

const providerInfo = [
  {
    name: 'MercadoPago',
    slug: 'mercadopago',
    description: 'La pasarela más popular de Latinoamérica. Presente en Chile, Argentina, Brasil, México, Colombia, Uruguay y Perú.',
    countries: 'Chile, Argentina, Brasil, México, Colombia, Uruguay, Perú',
    features: ['Suscripciones recurrentes', 'Tarjetas crédito/débito', 'Transferencia bancaria', 'Wallet MercadoPago', 'API completa con webhooks'],
    color: 'from-sky-400 to-blue-500',
    recommended: true,
    fees: '3.49% + IVA por transacción',
  },
  {
    name: 'Flow',
    slug: 'flow',
    description: 'Pasarela chilena líder. Integración directa con bancos locales y Webpay.',
    countries: 'Chile',
    features: ['Suscripciones recurrentes', 'Webpay Plus', 'Transferencia bancaria', 'Multicaja', 'Servipag'],
    color: 'from-emerald-400 to-green-500',
    recommended: false,
    fees: '2.49% + IVA por transacción',
  },
  {
    name: 'Khipu',
    slug: 'khipu',
    description: 'Pagos por transferencia bancaria simplificada en Chile y Argentina.',
    countries: 'Chile, Argentina',
    features: ['Transferencia bancaria directa', 'Sin tarjeta requerida', 'Verificación instantánea', 'Ideal para montos bajos'],
    color: 'from-purple-400 to-purple-600',
    recommended: false,
    fees: '1.2% + IVA por transacción',
  },
  {
    name: 'PayPal',
    slug: 'paypal',
    description: 'Plataforma global de pagos. Ideal para clientes internacionales.',
    countries: 'Global (200+ países)',
    features: ['Suscripciones recurrentes', 'Tarjetas internacionales', 'Wallet PayPal', 'Protección al comprador', 'API Subscriptions'],
    color: 'from-blue-500 to-indigo-600',
    recommended: false,
    fees: '5.4% + $0.30 USD por transacción',
  },
];

export default function CommercialManagementView() {
  const [activeTab, setActiveTab] = useState<TabId>('plans');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);

  // Calculator state
  const [calcSites, setCalcSites] = useState(10);
  const [calcInterval, setCalcInterval] = useState(5);
  const [calcSupabasePlan, setCalcSupabasePlan] = useState<'free' | 'pro' | 'team'>('pro');
  const [calcRetention, setCalcRetention] = useState(90);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [plansRes, subsRes, payRes] = await Promise.all([
      supabase.from('plans').select('*').order('sort_order'),
      supabase.from('subscriptions').select('*, client:profiles!subscriptions_client_id_fkey(full_name, email, company_name), plan:plans(name, price_monthly)').order('created_at', { ascending: false }),
      supabase.from('payments').select('*, client:profiles!payments_client_id_fkey(full_name, email)').order('created_at', { ascending: false }).limit(50),
    ]);

    if (plansRes.data) setPlans(plansRes.data.map(p => ({ ...p, features: typeof p.features === 'string' ? JSON.parse(p.features) : p.features })));
    if (subsRes.data) setSubscriptions(subsRes.data as any);
    if (payRes.data) setPayments(payRes.data as any);
    setLoading(false);
  };

  const savePlan = async () => {
    if (!editingPlan) return;
    setSavingPlan(true);
    const payload = {
      name: editingPlan.name,
      slug: editingPlan.slug,
      description: editingPlan.description,
      price_monthly: editingPlan.price_monthly,
      price_currency: editingPlan.price_currency,
      max_projects: editingPlan.max_projects,
      monitoring_interval_minutes: editingPlan.monitoring_interval_minutes,
      features: editingPlan.features,
      is_active: editingPlan.is_active,
      sort_order: editingPlan.sort_order,
      updated_at: new Date().toISOString(),
    };

    if (editingPlan.id === 'new') {
      await supabase.from('plans').insert(payload);
    } else {
      await supabase.from('plans').update(payload).eq('id', editingPlan.id);
    }
    setEditingPlan(null);
    setSavingPlan(false);
    loadData();
  };

  const deletePlan = async (id: string) => {
    if (!confirm('¿Eliminar este plan? Los clientes suscritos no serán afectados.')) return;
    await supabase.from('plans').update({ is_active: false }).eq('id', id);
    loadData();
  };

  const tabs = [
    { id: 'plans' as TabId, label: 'Planes', icon: Crown },
    { id: 'subscriptions' as TabId, label: 'Suscripciones', icon: RefreshCw },
    { id: 'payments' as TabId, label: 'Pagos', icon: DollarSign },
    { id: 'providers' as TabId, label: 'Pasarelas de Pago', icon: CreditCard },
    { id: 'calculator' as TabId, label: 'Calculadora Infra', icon: Calculator },
  ];

  const totalMRR = subscriptions.filter(s => s.status === 'active').reduce((sum, s) => sum + (s.plan?.price_monthly || 0), 0);
  const activeSubsCount = subscriptions.filter(s => s.status === 'active').length;
  const totalRevenue = payments.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">Gestión Comercial</h1>
        <p className="text-sm text-text-muted mt-1">Planes, suscripciones y facturación</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'MRR (Ingreso Recurrente)', value: `$${totalMRR.toFixed(2)}`, sub: 'mensual', icon: TrendingUp, color: 'text-success' },
          { label: 'Suscripciones Activas', value: activeSubsCount.toString(), sub: 'clientes', icon: Users, color: 'text-primary' },
          { label: 'Ingresos Totales', value: `$${totalRevenue.toFixed(2)}`, sub: 'acumulado', icon: Banknote, color: 'text-amber-400' },
        ].map((kpi, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-panel rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-text-muted">{kpi.label}</span>
              <kpi.icon size={16} className={kpi.color} />
            </div>
            <p className={`text-2xl font-bold font-display ${kpi.color}`}>{kpi.value}</p>
            <p className="text-[10px] text-text-muted mt-1">{kpi.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1.5 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'text-text-muted hover:text-white hover:bg-surface-hover'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Plans Tab */}
      {activeTab === 'plans' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-white">Planes Disponibles</h3>
            <button
              onClick={() => setEditingPlan({
                id: 'new', name: '', slug: '', description: '', price_monthly: 0,
                price_currency: 'USD', max_projects: 1, monitoring_interval_minutes: 5,
                features: [], is_active: true, sort_order: plans.length + 1,
              })}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/80 transition-colors"
            >
              <Plus size={16} /> Nuevo Plan
            </button>
          </div>

          {/* Plan Cards */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {plans.filter(p => p.is_active).map((plan, i) => {
              const Icon = planIcons[i % planIcons.length];
              const color = planColors[i % planColors.length];
              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`relative rounded-2xl border border-border bg-surface/50 overflow-hidden ${i === 1 ? 'ring-2 ring-primary' : ''}`}
                >
                  {i === 1 && (
                    <div className="absolute top-0 left-0 right-0 bg-primary py-1 text-center text-[10px] font-bold uppercase tracking-wider text-white">
                      Más Popular
                    </div>
                  )}
                  <div className={`p-6 ${i === 1 ? 'pt-8' : ''}`}>
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${color} text-white shadow-lg mb-4`}>
                      <Icon size={24} />
                    </div>
                    <h4 className="font-display text-lg font-bold text-white">{plan.name}</h4>
                    <p className="text-xs text-text-muted mt-1 mb-4">{plan.description}</p>
                    <div className="mb-4">
                      {plan.price_monthly > 0 ? (
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-bold font-display text-white">${plan.price_monthly}</span>
                          <span className="text-xs text-text-muted">/{plan.price_currency}/mes</span>
                        </div>
                      ) : (
                        <span className="text-lg font-bold text-white">Personalizado</span>
                      )}
                    </div>
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        <Globe size={12} className="text-primary" />
                        <span>Hasta <strong className="text-white">{plan.max_projects}</strong> sitios</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        <Clock size={12} className="text-primary" />
                        <span>Monitoreo cada <strong className="text-white">{plan.monitoring_interval_minutes} min</strong></span>
                      </div>
                    </div>
                    <div className="border-t border-border pt-4 space-y-1.5">
                      {(plan.features || []).map((feat, fi) => (
                        <div key={fi} className="flex items-start gap-2">
                          <Check size={12} className="shrink-0 text-success mt-0.5" />
                          <span className="text-[11px] text-text-muted">{feat}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={() => setEditingPlan(plan)}
                        className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-border py-2 text-xs text-text-muted hover:bg-surface-hover hover:text-white transition-colors"
                      >
                        <Edit3 size={12} /> Editar
                      </button>
                      <button
                        onClick={() => deletePlan(plan.id)}
                        className="flex items-center justify-center rounded-lg border border-border px-3 py-2 text-xs text-text-muted hover:bg-danger/10 hover:text-danger hover:border-danger/30 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Edit Plan Modal */}
          {editingPlan && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 max-h-[90vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-display text-lg font-bold text-white">
                    {editingPlan.id === 'new' ? 'Nuevo Plan' : 'Editar Plan'}
                  </h3>
                  <button onClick={() => setEditingPlan(null)} className="text-text-muted hover:text-white"><X size={20} /></button>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-text-muted mb-1 block">Nombre</label>
                      <input value={editingPlan.name} onChange={e => setEditingPlan({ ...editingPlan, name: e.target.value })} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-muted mb-1 block">Slug</label>
                      <input value={editingPlan.slug} onChange={e => setEditingPlan({ ...editingPlan, slug: e.target.value })} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-muted mb-1 block">Descripción</label>
                    <input value={editingPlan.description} onChange={e => setEditingPlan({ ...editingPlan, description: e.target.value })} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary" />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-medium text-text-muted mb-1 block">Precio Mensual</label>
                      <input type="number" step="0.01" value={editingPlan.price_monthly} onChange={e => setEditingPlan({ ...editingPlan, price_monthly: parseFloat(e.target.value) || 0 })} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-muted mb-1 block">Moneda</label>
                      <select value={editingPlan.price_currency} onChange={e => setEditingPlan({ ...editingPlan, price_currency: e.target.value })} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary">
                        <option value="USD">USD</option>
                        <option value="CLP">CLP</option>
                        <option value="EUR">EUR</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-muted mb-1 block">Orden</label>
                      <input type="number" value={editingPlan.sort_order} onChange={e => setEditingPlan({ ...editingPlan, sort_order: parseInt(e.target.value) || 0 })} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-text-muted mb-1 block">Máx. Proyectos</label>
                      <input type="number" value={editingPlan.max_projects} onChange={e => setEditingPlan({ ...editingPlan, max_projects: parseInt(e.target.value) || 1 })} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-text-muted mb-1 block">Intervalo Monitoreo (min)</label>
                      <input type="number" value={editingPlan.monitoring_interval_minutes} onChange={e => setEditingPlan({ ...editingPlan, monitoring_interval_minutes: parseInt(e.target.value) || 5 })} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-text-muted mb-1 block">Características (una por línea)</label>
                    <textarea
                      rows={5}
                      value={(editingPlan.features || []).join('\n')}
                      onChange={e => setEditingPlan({ ...editingPlan, features: e.target.value.split('\n').filter(Boolean) })}
                      className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary font-mono"
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button onClick={() => setEditingPlan(null)} className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted hover:bg-surface-hover">Cancelar</button>
                    <button onClick={savePlan} disabled={savingPlan} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/80 disabled:opacity-50">
                      <Save size={14} /> {savingPlan ? 'Guardando...' : 'Guardar'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </motion.div>
      )}

      {/* Subscriptions Tab */}
      {activeTab === 'subscriptions' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <h3 className="font-display text-lg font-bold text-white">Suscripciones</h3>
          {subscriptions.length === 0 ? (
            <div className="glass-panel rounded-2xl p-12 text-center">
              <Users size={40} className="mx-auto text-text-muted mb-3" />
              <p className="text-sm text-text-muted">No hay suscripciones registradas aún</p>
              <p className="text-xs text-text-muted mt-1">Cuando los clientes se registren y paguen, aparecerán aquí.</p>
            </div>
          ) : (
            <div className="glass-panel rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted">Cliente</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted">Plan</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted">Estado</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted">Proveedor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted">Período</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {subscriptions.map(sub => (
                    <tr key={sub.id} className="hover:bg-surface-hover/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{sub.client?.full_name || 'Sin nombre'}</p>
                        <p className="text-[11px] text-text-muted">{sub.client?.email}</p>
                      </td>
                      <td className="px-4 py-3 text-text-muted">{sub.plan?.name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusColors[sub.status] || 'bg-surface-hover text-text-muted'}`}>
                          {sub.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-muted capitalize">{sub.payment_provider || '—'}</td>
                      <td className="px-4 py-3 text-[11px] text-text-muted">
                        {new Date(sub.current_period_start).toLocaleDateString()} — {new Date(sub.current_period_end).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {/* Payments Tab */}
      {activeTab === 'payments' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <h3 className="font-display text-lg font-bold text-white">Historial de Pagos</h3>
          {payments.length === 0 ? (
            <div className="glass-panel rounded-2xl p-12 text-center">
              <DollarSign size={40} className="mx-auto text-text-muted mb-3" />
              <p className="text-sm text-text-muted">No hay pagos registrados aún</p>
            </div>
          ) : (
            <div className="glass-panel rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted">Cliente</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted">Monto</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted">Estado</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted">Proveedor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map(pay => (
                    <tr key={pay.id} className="hover:bg-surface-hover/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{pay.client?.full_name || 'Sin nombre'}</p>
                        <p className="text-[11px] text-text-muted">{pay.client?.email}</p>
                      </td>
                      <td className="px-4 py-3 font-bold text-white">${pay.amount.toFixed(2)} {pay.currency}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${paymentStatusColors[pay.status] || 'bg-surface-hover text-text-muted'}`}>
                          {pay.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-muted capitalize">{pay.payment_provider || '—'}</td>
                      <td className="px-4 py-3 text-[11px] text-text-muted">{new Date(pay.paid_at || pay.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      )}

      {/* Payment Providers Tab */}
      {activeTab === 'providers' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div>
            <h3 className="font-display text-lg font-bold text-white mb-1">Pasarelas de Pago Disponibles</h3>
            <p className="text-xs text-text-muted">Plataformas compatibles para cobros recurrentes. Stripe no opera en Chile, estas son las alternativas.</p>
          </div>

          {/* Flujo de cobro */}
          <div className="glass-panel rounded-2xl p-6">
            <h4 className="font-display text-base font-bold text-white mb-4">Flujo de Cobro Recurrente</h4>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-2">
              {[
                { step: '1', text: 'Cliente se registra', icon: Users },
                { step: '2', text: 'Elige plan y paga', icon: CreditCard },
                { step: '3', text: 'Suscripción activa', icon: CheckCircle2 },
                { step: '4', text: 'Cobro automático mensual', icon: RefreshCw },
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-2 flex-1">
                  <div className="flex items-center gap-2 rounded-xl bg-surface-hover/50 p-3 flex-1">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">{s.step}</div>
                    <s.icon size={14} className="text-primary shrink-0" />
                    <span className="text-xs text-text-muted">{s.text}</span>
                  </div>
                  {i < 3 && <ArrowRight size={14} className="text-text-muted hidden sm:block shrink-0" />}
                </div>
              ))}
            </div>
          </div>

          {/* Providers */}
          <div className="grid gap-4 sm:grid-cols-2">
            {providerInfo.map((provider, i) => (
              <motion.div
                key={provider.slug}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`rounded-2xl border border-border bg-surface/50 p-5 relative ${provider.recommended ? 'ring-2 ring-primary' : ''}`}
              >
                {provider.recommended && (
                  <div className="absolute -top-2.5 left-4">
                    <span className="flex items-center gap-1 rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold text-white shadow-lg">
                      <Star size={10} /> Recomendado
                    </span>
                  </div>
                )}
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${provider.color} text-white shadow-sm mb-3`}>
                  <CreditCard size={20} />
                </div>
                <h4 className="font-display text-base font-bold text-white">{provider.name}</h4>
                <p className="text-xs text-text-muted mt-1">{provider.description}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Globe size={11} className="text-text-muted" />
                  <span className="text-[10px] text-text-muted">{provider.countries}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <DollarSign size={11} className="text-amber-400" />
                  <span className="text-[10px] text-amber-400 font-medium">{provider.fees}</span>
                </div>
                <div className="mt-3 border-t border-border pt-3 space-y-1.5">
                  {provider.features.map((feat, fi) => (
                    <div key={fi} className="flex items-center gap-2">
                      <Check size={11} className="text-success shrink-0" />
                      <span className="text-[10px] text-text-muted">{feat}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Nota */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="shrink-0 text-amber-400 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-400">Integración pendiente</p>
              <p className="text-[11px] text-text-muted mt-1">
                La integración con pasarelas de pago requiere configurar las API keys del proveedor seleccionado.
                Se recomienda <strong className="text-white">MercadoPago</strong> para cobertura en toda Latinoamérica
                o <strong className="text-white">Flow</strong> si el mercado es exclusivamente Chile.
                El sistema está preparado para conectar webhooks de cobro recurrente.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Calculator Tab */}
      {activeTab === 'calculator' && (() => {
        const supabasePlans = {
          free: { label: 'Free', price: 0, db: 0.5, storage: 1, bandwidth: 5, edgeFnInvocations: 500000, edgeFnCompute: 500000, realtime: 200, fileUploads: 50 },
          pro: { label: 'Pro ($25/mes)', price: 25, db: 8, storage: 100, bandwidth: 250, edgeFnInvocations: 2000000, edgeFnCompute: 2000000, realtime: 500, fileUploads: 100 },
          team: { label: 'Team ($599/mes)', price: 599, db: 8, storage: 100, bandwidth: 250, edgeFnInvocations: 2000000, edgeFnCompute: 2000000, realtime: 500, fileUploads: 100 },
        };
        const sp = supabasePlans[calcSupabasePlan];

        // Cálculos
        const checksPerDay = Math.floor(1440 / calcInterval);
        const checksPerMonth = checksPerDay * 30;
        const totalInvocationsMonitor = calcSites * checksPerMonth;
        // Extra: scans, plugins, health ~ 10% del monitoreo
        const totalInvocations = Math.round(totalInvocationsMonitor * 1.15);
        const avgComputeSeconds = 2;
        const totalComputeSeconds = totalInvocations * avgComputeSeconds;

        // DB: cada check = 1 row en uptime_logs (~0.5KB)
        const rowsPerMonth = calcSites * checksPerMonth;
        const rowsRetained = rowsPerMonth * (calcRetention / 30);
        const dbSizeGB = (rowsRetained * 0.0005) / (1024 * 1024); // 0.5KB per row
        // Otras tablas (projects, incidents, plugins, etc) ~50MB base
        const totalDbGB = dbSizeGB + 0.05;

        // Bandwidth: ~1KB per API response avg
        const bandwidthGB = (totalInvocations * 1) / (1024 * 1024);

        // Costos extra
        const extraInvocations = Math.max(0, totalInvocations - sp.edgeFnInvocations);
        const extraInvocCost = Math.ceil(extraInvocations / 500000) * 2;
        const extraCompute = Math.max(0, totalComputeSeconds - sp.edgeFnCompute);
        const extraComputeCost = Math.ceil(extraCompute / 500000) * 2;
        const extraDb = Math.max(0, totalDbGB - sp.db);
        const extraDbCost = extraDb > 0 ? Math.ceil(extraDb) * 0.125 : 0;
        const totalExtraCost = extraInvocCost + extraComputeCost + extraDbCost;
        const totalMonthlyCost = sp.price + totalExtraCost;

        const pct = (used: number, limit: number) => Math.min((used / limit) * 100, 100);
        const statusColor = (pctVal: number) => pctVal >= 90 ? 'bg-danger' : pctVal >= 70 ? 'bg-warning' : 'bg-success';
        const statusLabel = (pctVal: number) => pctVal >= 90 ? '🔴 Excedido/Límite' : pctVal >= 70 ? '🟡 Ajustado' : '🟢 OK';

        const resources = [
          { name: 'Edge Fn Invocations', icon: Zap, used: totalInvocations, limit: sp.edgeFnInvocations, unit: '', format: (n: number) => n.toLocaleString() },
          { name: 'Edge Fn Compute', icon: Cpu, used: totalComputeSeconds, limit: sp.edgeFnCompute, unit: 's', format: (n: number) => n.toLocaleString() },
          { name: 'Database Size', icon: Database, used: totalDbGB, limit: sp.db, unit: 'GB', format: (n: number) => n.toFixed(2) },
          { name: 'Bandwidth', icon: Wifi, used: bandwidthGB, limit: sp.bandwidth, unit: 'GB', format: (n: number) => n.toFixed(2) },
        ];

        return (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div>
              <h3 className="font-display text-lg font-bold text-white mb-1">Calculadora de Infraestructura Supabase</h3>
              <p className="text-xs text-text-muted">Estima en tiempo real cuántos recursos necesitás según la cantidad de sitios y la frecuencia de monitoreo.</p>
            </div>

            {/* Controls */}
            <div className="glass-panel rounded-2xl p-6 space-y-6">
              <h4 className="font-display text-base font-bold text-white flex items-center gap-2"><Gauge size={16} className="text-primary" /> Parámetros</h4>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {/* Sites */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-text-muted">Sitios a monitorear</label>
                  <input type="range" min={1} max={500} value={calcSites} onChange={e => setCalcSites(Number(e.target.value))} className="w-full accent-primary" />
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted">1</span>
                    <span className="text-2xl font-bold font-display text-primary">{calcSites}</span>
                    <span className="text-text-muted">500</span>
                  </div>
                </div>

                {/* Interval */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-text-muted">Intervalo de monitoreo</label>
                  <select value={calcInterval} onChange={e => setCalcInterval(Number(e.target.value))} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary">
                    <option value={1}>Cada 1 min</option>
                    <option value={3}>Cada 3 min</option>
                    <option value={5}>Cada 5 min</option>
                    <option value={10}>Cada 10 min</option>
                    <option value={15}>Cada 15 min</option>
                    <option value={30}>Cada 30 min</option>
                    <option value={60}>Cada 60 min</option>
                  </select>
                  <p className="text-[10px] text-text-muted">{checksPerDay.toLocaleString()} checks/día/sitio</p>
                </div>

                {/* Retention */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-text-muted">Retención de logs</label>
                  <select value={calcRetention} onChange={e => setCalcRetention(Number(e.target.value))} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary">
                    <option value={30}>30 días</option>
                    <option value={60}>60 días</option>
                    <option value={90}>90 días</option>
                    <option value={180}>180 días</option>
                    <option value={365}>365 días</option>
                  </select>
                  <p className="text-[10px] text-text-muted">{rowsRetained.toLocaleString()} rows retenidos</p>
                </div>

                {/* Supabase Plan */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-text-muted">Plan Supabase</label>
                  <select value={calcSupabasePlan} onChange={e => setCalcSupabasePlan(e.target.value as any)} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary">
                    <option value="free">Free ($0/mes)</option>
                    <option value="pro">Pro ($25/mes)</option>
                    <option value="team">Team ($599/mes)</option>
                  </select>
                  <p className="text-[10px] text-text-muted">Tu plan actual determina los límites</p>
                </div>
              </div>
            </div>

            {/* Resource Usage Bars */}
            <div className="glass-panel rounded-2xl p-6 space-y-5">
              <h4 className="font-display text-base font-bold text-white flex items-center gap-2"><Server size={16} className="text-primary" /> Consumo Estimado Mensual</h4>

              {resources.map((r, i) => {
                const p = pct(r.used, r.limit);
                return (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <r.icon size={14} className="text-text-muted" />
                        <span className="text-xs font-medium text-white">{r.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-text-muted">
                          {r.format(r.used)} / {r.format(r.limit)} {r.unit}
                        </span>
                        <span className="text-[10px] font-bold">{statusLabel(p)}</span>
                      </div>
                    </div>
                    <div className="h-3 rounded-full bg-surface-hover overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(p, 100)}%` }}
                        transition={{ duration: 0.5 }}
                        className={`h-full rounded-full ${statusColor(p)}`}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-text-muted">
                      <span>{Math.round(p)}% del límite</span>
                      {p > 100 && <span className="text-danger font-bold">Excede en {r.format(r.used - r.limit)} {r.unit}</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Cost Breakdown */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className={`rounded-2xl p-5 border ${totalExtraCost > 0 ? 'border-warning/30 bg-warning/5' : 'border-success/30 bg-success/5'}`}>
                <p className="text-xs text-text-muted mb-1">Costo Base</p>
                <p className="text-2xl font-bold font-display text-white">${sp.price}<span className="text-xs text-text-muted font-normal">/mes</span></p>
              </div>
              <div className={`rounded-2xl p-5 border ${totalExtraCost > 0 ? 'border-danger/30 bg-danger/5' : 'border-border bg-surface/50'}`}>
                <p className="text-xs text-text-muted mb-1">Costo Extra Estimado</p>
                <p className={`text-2xl font-bold font-display ${totalExtraCost > 0 ? 'text-danger' : 'text-success'}`}>${totalExtraCost.toFixed(2)}<span className="text-xs text-text-muted font-normal">/mes</span></p>
                {extraInvocCost > 0 && <p className="text-[10px] text-text-muted mt-1">Edge invocations: +${extraInvocCost}</p>}
                {extraComputeCost > 0 && <p className="text-[10px] text-text-muted">Edge compute: +${extraComputeCost}</p>}
                {extraDbCost > 0 && <p className="text-[10px] text-text-muted">DB extra: +${extraDbCost.toFixed(2)}</p>}
              </div>
              <div className={`rounded-2xl p-5 border ${totalExtraCost > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-primary/30 bg-primary/5'}`}>
                <p className="text-xs text-text-muted mb-1">Costo Total Mensual</p>
                <p className="text-2xl font-bold font-display text-white">${totalMonthlyCost.toFixed(2)}<span className="text-xs text-text-muted font-normal">/mes</span></p>
                <p className="text-[10px] text-text-muted mt-1">${(totalMonthlyCost / Math.max(calcSites, 1)).toFixed(2)} por sitio</p>
              </div>
            </div>

            {/* Recommendations */}
            <div className="glass-panel rounded-2xl p-6 space-y-4">
              <h4 className="font-display text-base font-bold text-white flex items-center gap-2"><Info size={16} className="text-primary" /> Recomendaciones Automáticas</h4>
              <div className="space-y-2">
                {totalInvocations > sp.edgeFnInvocations * 0.8 && (
                  <div className="flex items-start gap-3 rounded-lg border border-warning/20 bg-warning/5 p-3">
                    <AlertTriangle size={14} className="shrink-0 text-warning mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-warning">Invocaciones Edge Functions al límite</p>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        Aumentá el intervalo de monitoreo a {calcInterval < 10 ? '10' : '15'} min para sitios no críticos.
                        Con intervalo de 10 min reducís ~50% las invocaciones.
                      </p>
                    </div>
                  </div>
                )}
                {totalComputeSeconds > sp.edgeFnCompute * 0.8 && (
                  <div className="flex items-start gap-3 rounded-lg border border-danger/20 bg-danger/5 p-3">
                    <Cpu size={14} className="shrink-0 text-danger mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-danger">Compute time cerca del límite</p>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        El compute time es el cuello de botella principal. Cada invocación usa ~2s promedio.
                        Con {calcSites} sitios cada {calcInterval} min, estás en {(totalComputeSeconds / sp.edgeFnCompute * 100).toFixed(0)}%.
                        Supabase cobra $2 por cada 500K segundos adicionales.
                      </p>
                    </div>
                  </div>
                )}
                {totalDbGB > sp.db * 0.6 && (
                  <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <Database size={14} className="shrink-0 text-amber-400 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-amber-400">Base de datos creciendo</p>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        Con {calcRetention} días de retención retenés {rowsRetained.toLocaleString()} rows.
                        Reducí la retención a {calcRetention > 60 ? '60' : '30'} días o habilitá purga automática.
                      </p>
                    </div>
                  </div>
                )}
                {totalInvocations <= sp.edgeFnInvocations * 0.8 && totalComputeSeconds <= sp.edgeFnCompute * 0.8 && totalDbGB <= sp.db * 0.6 && (
                  <div className="flex items-start gap-3 rounded-lg border border-success/20 bg-success/5 p-3">
                    <CheckCircle2 size={14} className="shrink-0 text-success mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-success">Infraestructura saludable</p>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        Con {calcSites} sitios cada {calcInterval} min, tu plan {sp.label} está cómodo.
                        Tenés margen para crecer sin costos adicionales.
                      </p>
                    </div>
                  </div>
                )}
                {calcSupabasePlan === 'free' && calcSites > 5 && (
                  <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <Crown size={14} className="shrink-0 text-primary mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-primary">Considera upgradear a Pro</p>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        El plan Free tiene límites muy ajustados para {calcSites} sitios.
                        Pro te da 4x más invocations, 16x más DB y 50x más bandwidth por solo $25/mes.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Plan Comparison Table */}
            <div className="glass-panel rounded-2xl p-6 space-y-4">
              <h4 className="font-display text-base font-bold text-white flex items-center gap-2"><HardDrive size={16} className="text-primary" /> Comparativa de Planes Supabase</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-text-muted">Recurso</th>
                      {(['free', 'pro', 'team'] as const).map(p => (
                        <th key={p} className={`px-3 py-2 text-center text-xs font-semibold ${p === calcSupabasePlan ? 'text-primary' : 'text-text-muted'}`}>
                          {supabasePlans[p].label}
                          {p === calcSupabasePlan && <span className="block text-[9px] text-primary">(tu plan)</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[
                      { name: 'Precio', free: '$0', pro: '$25/mes', team: '$599/mes' },
                      { name: 'Database', free: '500 MB', pro: '8 GB', team: '8 GB' },
                      { name: 'Storage', free: '1 GB', pro: '100 GB', team: '100 GB' },
                      { name: 'Bandwidth', free: '5 GB', pro: '250 GB', team: '250 GB' },
                      { name: 'Edge Fn Invocations', free: '500K', pro: '2M', team: '2M' },
                      { name: 'Edge Fn Compute', free: '500K s', pro: '2M s', team: '2M s' },
                      { name: 'Realtime Connections', free: '200', pro: '500', team: '500' },
                      { name: 'Extra DB', free: 'N/A', pro: '$0.125/GB', team: '$0.125/GB' },
                      { name: 'Extra Invocations', free: 'N/A', pro: '$2/500K', team: '$2/500K' },
                      { name: 'Extra Compute', free: 'N/A', pro: '$2/500K s', team: '$2/500K s' },
                      { name: 'Max sitios estimados*', free: '~5-10', pro: '~100-150', team: '~100-150+' },
                    ].map((row, i) => (
                      <tr key={i} className="hover:bg-surface-hover/30">
                        <td className="px-3 py-2 text-xs text-white font-medium">{row.name}</td>
                        <td className={`px-3 py-2 text-center text-xs ${calcSupabasePlan === 'free' ? 'text-primary font-bold' : 'text-text-muted'}`}>{row.free}</td>
                        <td className={`px-3 py-2 text-center text-xs ${calcSupabasePlan === 'pro' ? 'text-primary font-bold' : 'text-text-muted'}`}>{row.pro}</td>
                        <td className={`px-3 py-2 text-center text-xs ${calcSupabasePlan === 'team' ? 'text-primary font-bold' : 'text-text-muted'}`}>{row.team}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[10px] text-text-muted mt-2">* Estimación con intervalo 5 min, retención 90 días, ~2s compute/check. Varía según uso real.</p>
              </div>
            </div>
          </motion.div>
        );
      })()}
    </div>
  );
}
