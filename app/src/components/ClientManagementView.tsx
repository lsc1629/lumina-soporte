import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Users,
  Search,
  Plus,
  Edit3,
  Mail,
  Phone,
  Building2,
  Globe,
  Clock,
  CheckCircle2,
  XCircle,
  Shield,
  Crown,
  Filter,
  ChevronDown,
  ChevronUp,
  Tag,
  FileText,
  DollarSign,
  Activity,
  Save,
  X,
  Trash2,
  UserPlus,
  Eye,
  EyeOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Client {
  id: string;
  full_name: string;
  email: string;
  company_name: string | null;
  phone: string | null;
  role: string;
  avatar_url: string | null;
  plan_id: string | null;
  subscription_status: string | null;
  notes: string | null;
  tags: string[] | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  plan?: { name: string; slug: string } | null;
  projects_count?: number;
}

interface Plan {
  id: string;
  name: string;
  slug: string;
  price_monthly: number;
}

export default function ClientManagementView() {
  const [clients, setClients] = useState<Client[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'client' | 'admin'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [savingClient, setSavingClient] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newClient, setNewClient] = useState({ email: '', password: '', full_name: '', company_name: '', phone: '', role: 'client', plan_id: '' });
  const [creatingClient, setCreatingClient] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [clientsRes, plansRes] = await Promise.all([
      supabase.from('profiles').select('*, plan:plans(name, slug)').order('created_at', { ascending: false }),
      supabase.from('plans').select('id, name, slug, price_monthly').eq('is_active', true).order('sort_order'),
    ]);

    if (clientsRes.data) {
      // Get project counts per client
      const { data: projectCounts } = await supabase
        .from('projects')
        .select('owner_id')
        .eq('is_active', true);

      const countMap: Record<string, number> = {};
      (projectCounts || []).forEach(p => {
        countMap[p.owner_id] = (countMap[p.owner_id] || 0) + 1;
      });

      setClients(clientsRes.data.map(c => ({
        ...c,
        projects_count: countMap[c.id] || 0,
      })));
    }
    if (plansRes.data) setPlans(plansRes.data);
    setLoading(false);
  };

  const filteredClients = clients.filter(c => {
    if (filterRole !== 'all' && c.role !== filterRole) return false;
    if (filterStatus === 'active' && !c.is_active) return false;
    if (filterStatus === 'inactive' && c.is_active) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        (c.full_name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.company_name || '').toLowerCase().includes(q) ||
        (c.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const saveClient = async () => {
    if (!editingClient) return;
    setSavingClient(true);
    await supabase.from('profiles').update({
      full_name: editingClient.full_name,
      company_name: editingClient.company_name,
      phone: editingClient.phone,
      role: editingClient.role,
      plan_id: editingClient.plan_id || null,
      subscription_status: editingClient.subscription_status,
      notes: editingClient.notes,
      tags: editingClient.tags || [],
      is_active: editingClient.is_active,
    }).eq('id', editingClient.id);
    setSavingClient(false);
    setEditingClient(null);
    loadData();
  };

  const createClient = async () => {
    if (!newClient.email || !newClient.password || !newClient.full_name) {
      setCreateError('Email, contraseña y nombre son requeridos');
      return;
    }
    setCreatingClient(true);
    setCreateError('');

    // Create user via Supabase Auth admin (requires service role — we use Edge Function or direct)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: newClient.email,
      password: newClient.password,
    });

    if (authError) {
      setCreateError(authError.message);
      setCreatingClient(false);
      return;
    }

    if (authData.user) {
      // Update profile
      await supabase.from('profiles').update({
        full_name: newClient.full_name,
        company_name: newClient.company_name || null,
        phone: newClient.phone || null,
        role: newClient.role,
        plan_id: newClient.plan_id || null,
        is_active: true,
      }).eq('id', authData.user.id);
    }

    setCreatingClient(false);
    setShowCreateModal(false);
    setNewClient({ email: '', password: '', full_name: '', company_name: '', phone: '', role: 'client', plan_id: '' });
    loadData();
  };

  const toggleClientActive = async (clientId: string, isActive: boolean) => {
    await supabase.from('profiles').update({ is_active: !isActive }).eq('id', clientId);
    loadData();
  };

  const totalClients = clients.filter(c => c.role === 'client').length;
  const activeClients = clients.filter(c => c.role === 'client' && c.is_active).length;
  const totalProjects = clients.reduce((sum, c) => sum + (c.projects_count || 0), 0);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">Gestión de Clientes</h1>
          <p className="text-sm text-text-muted mt-1">Administra clientes, planes asignados y estado de cuentas</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/80 transition-colors"
        >
          <UserPlus size={16} /> Nuevo Cliente
        </button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Clientes', value: totalClients, icon: Users, color: 'text-primary' },
          { label: 'Clientes Activos', value: activeClients, icon: CheckCircle2, color: 'text-success' },
          { label: 'Proyectos Totales', value: totalProjects, icon: Globe, color: 'text-violet-400' },
          { label: 'Admins', value: clients.filter(c => c.role === 'admin').length, icon: Shield, color: 'text-amber-400' },
        ].map((kpi, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-panel rounded-2xl p-4"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-text-muted">{kpi.label}</span>
              <kpi.icon size={14} className={kpi.color} />
            </div>
            <p className={`text-2xl font-bold font-display ${kpi.color}`}>{kpi.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 w-full sm:w-auto">
          <Search size={16} className="text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre, email, empresa o tag..."
            className="flex-1 bg-transparent text-sm text-white placeholder-text-muted outline-none"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value as any)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white outline-none"
          >
            <option value="all">Todos los roles</option>
            <option value="client">Clientes</option>
            <option value="admin">Admins</option>
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as any)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white outline-none"
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>
      </div>

      {/* Client List */}
      <div className="space-y-3">
        {filteredClients.length === 0 ? (
          <div className="glass-panel rounded-2xl p-12 text-center">
            <Users size={40} className="mx-auto text-text-muted mb-3" />
            <p className="text-sm text-text-muted">No se encontraron clientes</p>
          </div>
        ) : (
          filteredClients.map((client, i) => (
            <motion.div
              key={client.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className="glass-panel rounded-2xl overflow-hidden"
            >
              {/* Client Row */}
              <div
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-surface-hover/30 transition-colors"
                onClick={() => setExpandedClient(expandedClient === client.id ? null : client.id)}
              >
                {/* Avatar */}
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  client.role === 'admin' ? 'bg-amber-500/10 text-amber-400' : 'bg-primary/10 text-primary'
                }`}>
                  {client.full_name ? client.full_name.charAt(0).toUpperCase() : '?'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white truncate">{client.full_name || 'Sin nombre'}</p>
                    {client.role === 'admin' && (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-400">Admin</span>
                    )}
                    {!client.is_active && (
                      <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[9px] font-bold uppercase text-danger">Inactivo</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[11px] text-text-muted">{client.email}</span>
                    {client.company_name && (
                      <span className="text-[11px] text-text-muted flex items-center gap-1"><Building2 size={10} />{client.company_name}</span>
                    )}
                  </div>
                </div>

                {/* Plan badge */}
                <div className="hidden sm:flex items-center gap-3">
                  {client.plan?.name ? (
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold text-primary flex items-center gap-1">
                      <Crown size={10} /> {client.plan.name}
                    </span>
                  ) : (
                    <span className="rounded-full bg-surface-hover px-3 py-1 text-[10px] text-text-muted">Sin plan</span>
                  )}
                  <div className="flex items-center gap-1 text-[11px] text-text-muted">
                    <Globe size={11} /> {client.projects_count || 0}
                  </div>
                </div>

                {/* Expand icon */}
                {expandedClient === client.id ? <ChevronUp size={16} className="text-text-muted" /> : <ChevronDown size={16} className="text-text-muted" />}
              </div>

              {/* Expanded Details */}
              {expandedClient === client.id && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="border-t border-border p-4 bg-surface-hover/10"
                >
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold">Contacto</p>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-xs text-text-muted">
                          <Mail size={12} className="text-primary" /> {client.email}
                        </div>
                        {client.phone && (
                          <div className="flex items-center gap-2 text-xs text-text-muted">
                            <Phone size={12} className="text-primary" /> {client.phone}
                          </div>
                        )}
                        {client.company_name && (
                          <div className="flex items-center gap-2 text-xs text-text-muted">
                            <Building2 size={12} className="text-primary" /> {client.company_name}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold">Cuenta</p>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-xs text-text-muted">
                          <Crown size={12} className="text-primary" /> Plan: <strong className="text-white">{client.plan?.name || 'Ninguno'}</strong>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-text-muted">
                          <Globe size={12} className="text-primary" /> Proyectos: <strong className="text-white">{client.projects_count || 0}</strong>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-text-muted">
                          <Clock size={12} className="text-primary" /> Registro: {new Date(client.created_at).toLocaleDateString()}
                        </div>
                        {client.last_login_at && (
                          <div className="flex items-center gap-2 text-xs text-text-muted">
                            <Activity size={12} className="text-primary" /> Último login: {new Date(client.last_login_at).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold">Notas & Tags</p>
                      {client.notes && <p className="text-xs text-text-muted bg-surface-hover/50 rounded-lg p-2">{client.notes}</p>}
                      {client.tags && client.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {client.tags.map((tag, ti) => (
                            <span key={ti} className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] text-primary font-medium">{tag}</span>
                          ))}
                        </div>
                      )}
                      {!client.notes && (!client.tags || client.tags.length === 0) && (
                        <p className="text-[11px] text-text-muted italic">Sin notas ni tags</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4 pt-3 border-t border-border">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingClient(client); }}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted hover:bg-surface-hover hover:text-white transition-colors"
                    >
                      <Edit3 size={12} /> Editar
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleClientActive(client.id, client.is_active); }}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                        client.is_active
                          ? 'border-border text-text-muted hover:bg-danger/10 hover:text-danger hover:border-danger/30'
                          : 'border-border text-text-muted hover:bg-success/10 hover:text-success hover:border-success/30'
                      }`}
                    >
                      {client.is_active ? <><EyeOff size={12} /> Desactivar</> : <><Eye size={12} /> Activar</>}
                    </button>
                  </div>
                </motion.div>
              )}
            </motion.div>
          ))
        )}
      </div>

      {/* Edit Client Modal */}
      {editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-display text-lg font-bold text-white">Editar Cliente</h3>
              <button onClick={() => setEditingClient(null)} className="text-text-muted hover:text-white"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1 block">Nombre</label>
                  <input value={editingClient.full_name || ''} onChange={e => setEditingClient({ ...editingClient, full_name: e.target.value })} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1 block">Empresa</label>
                  <input value={editingClient.company_name || ''} onChange={e => setEditingClient({ ...editingClient, company_name: e.target.value })} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1 block">Teléfono</label>
                  <input value={editingClient.phone || ''} onChange={e => setEditingClient({ ...editingClient, phone: e.target.value })} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1 block">Rol</label>
                  <select value={editingClient.role} onChange={e => setEditingClient({ ...editingClient, role: e.target.value })} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary">
                    <option value="client">Cliente</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1 block">Plan</label>
                  <select value={editingClient.plan_id || ''} onChange={e => setEditingClient({ ...editingClient, plan_id: e.target.value || null })} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary">
                    <option value="">Sin plan</option>
                    {plans.map(p => <option key={p.id} value={p.id}>{p.name} — ${p.price_monthly}/mes</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1 block">Estado suscripción</label>
                  <select value={editingClient.subscription_status || 'none'} onChange={e => setEditingClient({ ...editingClient, subscription_status: e.target.value })} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary">
                    <option value="none">Sin suscripción</option>
                    <option value="active">Activa</option>
                    <option value="past_due">Pago pendiente</option>
                    <option value="cancelled">Cancelada</option>
                    <option value="trial">Trial</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-text-muted mb-1 block">Notas internas</label>
                <textarea rows={3} value={editingClient.notes || ''} onChange={e => setEditingClient({ ...editingClient, notes: e.target.value })} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs font-medium text-text-muted mb-1 block">Tags (separados por coma)</label>
                <input
                  value={(editingClient.tags || []).join(', ')}
                  onChange={e => setEditingClient({ ...editingClient, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                  placeholder="vip, ecommerce, wordpress"
                  className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editingClient.is_active} onChange={e => setEditingClient({ ...editingClient, is_active: e.target.checked })} className="rounded" />
                  <span className="text-sm text-white">Cliente activo</span>
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setEditingClient(null)} className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted hover:bg-surface-hover">Cancelar</button>
                <button onClick={saveClient} disabled={savingClient} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/80 disabled:opacity-50">
                  <Save size={14} /> {savingClient ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Create Client Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-display text-lg font-bold text-white">Nuevo Cliente</h3>
              <button onClick={() => { setShowCreateModal(false); setCreateError(''); }} className="text-text-muted hover:text-white"><X size={20} /></button>
            </div>
            {createError && (
              <div className="mb-4 rounded-lg bg-danger/10 border border-danger/20 p-3 text-xs text-danger">{createError}</div>
            )}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-text-muted mb-1 block">Email *</label>
                <input type="email" value={newClient.email} onChange={e => setNewClient({ ...newClient, email: e.target.value })} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs font-medium text-text-muted mb-1 block">Contraseña *</label>
                <input type="password" value={newClient.password} onChange={e => setNewClient({ ...newClient, password: e.target.value })} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1 block">Nombre completo *</label>
                  <input value={newClient.full_name} onChange={e => setNewClient({ ...newClient, full_name: e.target.value })} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1 block">Empresa</label>
                  <input value={newClient.company_name} onChange={e => setNewClient({ ...newClient, company_name: e.target.value })} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1 block">Teléfono</label>
                  <input value={newClient.phone} onChange={e => setNewClient({ ...newClient, phone: e.target.value })} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-xs font-medium text-text-muted mb-1 block">Plan</label>
                  <select value={newClient.plan_id} onChange={e => setNewClient({ ...newClient, plan_id: e.target.value })} className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-white outline-none focus:border-primary">
                    <option value="">Sin plan</option>
                    {plans.map(p => <option key={p.id} value={p.id}>{p.name} — ${p.price_monthly}/mes</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => { setShowCreateModal(false); setCreateError(''); }} className="rounded-lg border border-border px-4 py-2 text-sm text-text-muted hover:bg-surface-hover">Cancelar</button>
                <button onClick={createClient} disabled={creatingClient} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/80 disabled:opacity-50">
                  <UserPlus size={14} /> {creatingClient ? 'Creando...' : 'Crear Cliente'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
