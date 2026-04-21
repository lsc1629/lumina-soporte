import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, MessageSquare, Clock, CheckCircle2, Search, Activity, Loader2, Send, ArrowLeft, User, Shield } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import LoadingScreen from './LoadingScreen';
import { usePreviewClient } from '@/lib/PreviewContext';

interface Ticket {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

interface Message {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
  sender_name?: string;
  sender_role?: string;
}

const statusLabels: Record<string, string> = { open: 'Abierto', in_progress: 'En Progreso', waiting_client: 'Esperando Respuesta', resolved: 'Resuelto', closed: 'Cerrado' };
const priorityLabels: Record<string, string> = { high: 'Alta', medium: 'Media', low: 'Baja' };

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ClientSupportView() {
  const previewClientId = usePreviewClient();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showNew, setShowNew] = useState(false);
  const [newTicket, setNewTicket] = useState({ subject: '', message: '', priority: 'medium' });
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState('');

  // Detail view state
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [reply, setReply] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadTickets(); }, []);

  const loadTickets = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const userId = previewClientId || user?.id;
    if (!userId) { setLoading(false); return; }
    setCurrentUserId(userId);

    const { data } = await supabase
      .from('support_tickets')
      .select('id, ticket_number, subject, status, priority, created_at, updated_at')
      .eq('created_by', userId)
      .order('updated_at', { ascending: false });

    if (data) {
      const withCounts = await Promise.all(
        data.map(async (t) => {
          const { count } = await supabase.from('ticket_messages').select('*', { count: 'exact', head: true }).eq('ticket_id', t.id);
          return { ...t, message_count: count || 0 };
        })
      );
      setTickets(withCounts);
    }
    setLoading(false);
  };

  const openNewForm = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('projects').select('id, name').eq('owner_id', user.id).eq('is_active', true).order('name');
    if (data) setProjects(data);
    setShowNew(true);
  };

  const createTicket = async () => {
    if (!newTicket.subject.trim() || !newTicket.message.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .insert({
        created_by: user.id,
        project_id: selectedProject || null,
        subject: newTicket.subject.trim(),
        priority: newTicket.priority,
      })
      .select()
      .single();

    if (ticket && !error) {
      await supabase.from('ticket_messages').insert({
        ticket_id: ticket.id,
        user_id: user.id,
        message: newTicket.message.trim(),
      });
    }

    setSaving(false);
    setShowNew(false);
    setNewTicket({ subject: '', message: '', priority: 'medium' });
    setSelectedProject('');
    loadTickets();
  };

  const openTicketDetail = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setLoadingMessages(true);
    const { data } = await supabase
      .from('ticket_messages')
      .select('id, user_id, message, created_at')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true });

    const msgs = data || [];
    // Fetch sender profiles
    const userIds = [...new Set(msgs.map(m => m.user_id))];
    const { data: profiles } = userIds.length > 0
      ? await supabase.from('profiles').select('id, full_name, role').in('id', userIds)
      : { data: [] };
    const profileMap = new Map((profiles || []).map(p => [p.id, p]));

    setMessages(msgs.map(m => ({
      ...m,
      sender_name: profileMap.get(m.user_id)?.full_name || 'Usuario',
      sender_role: profileMap.get(m.user_id)?.role || 'client',
    })));
    setLoadingMessages(false);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const sendReply = async () => {
    if (!reply.trim() || !selectedTicket) return;
    setSendingReply(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSendingReply(false); return; }

    await supabase.from('ticket_messages').insert({
      ticket_id: selectedTicket.id,
      user_id: user.id,
      message: reply.trim(),
    });

    setReply('');
    setSendingReply(false);
    openTicketDetail(selectedTicket);
  };

  const filtered = tickets.filter(t => {
    if (filter !== 'all' && t.status !== filter) return false;
    if (search && !t.subject.toLowerCase().includes(search.toLowerCase()) && !t.ticket_number.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return <LoadingScreen />;
  }

  // Ticket detail view
  if (selectedTicket) {
    const isClosed = selectedTicket.status === 'closed' || selectedTicket.status === 'resolved';
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => { setSelectedTicket(null); loadTickets(); }} className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-muted hover:text-white transition-colors">
            <ArrowLeft size={16} /> Volver
          </button>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold text-white">{selectedTicket.subject}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs font-mono text-text-muted">{selectedTicket.ticket_number}</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${selectedTicket.status === 'open' ? 'bg-danger/10 text-danger border-danger/20' : selectedTicket.status === 'in_progress' ? 'bg-warning/10 text-warning border-warning/20' : selectedTicket.status === 'waiting_client' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-success/10 text-success border-success/20'}`}>
                {statusLabels[selectedTicket.status] || selectedTicket.status}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${selectedTicket.priority === 'high' ? 'bg-danger/10 text-danger' : selectedTicket.priority === 'medium' ? 'bg-warning/10 text-warning' : 'bg-surface-hover text-text-muted'}`}>
                Prioridad: {priorityLabels[selectedTicket.priority] || selectedTicket.priority}
              </span>
              <span className="text-[10px] text-text-muted">Creado {formatDate(selectedTicket.created_at)}</span>
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-2xl overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 240px)' }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {loadingMessages ? (
              <div className="flex items-center justify-center p-8"><Loader2 size={20} className="animate-spin text-primary" /></div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-8">No hay mensajes en este ticket.</p>
            ) : (
              messages.map(msg => {
                const isMe = msg.user_id === currentUserId;
                const isAdmin = msg.sender_role === 'admin';
                return (
                  <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${isMe ? 'bg-primary/10 border border-primary/20' : 'bg-surface border border-border'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`flex h-5 w-5 items-center justify-center rounded-full ${isAdmin ? 'bg-primary/20 text-primary' : 'bg-surface-hover text-text-muted'}`}>
                          {isAdmin ? <Shield size={10} /> : <User size={10} />}
                        </div>
                        <span className={`text-[11px] font-medium ${isAdmin ? 'text-primary' : 'text-text-muted'}`}>{msg.sender_name}{isAdmin ? ' (Soporte)' : ''}</span>
                        <span className="text-[10px] text-text-muted">{formatDate(msg.created_at)}</span>
                      </div>
                      <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                    </div>
                  </motion.div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply box */}
          {!isClosed ? (
            <div className="border-t border-border p-4">
              <div className="flex items-end gap-3">
                <textarea
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                  rows={2}
                  placeholder="Escribe tu respuesta... (Enter para enviar, Shift+Enter nueva línea)"
                  className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary resize-none"
                />
                <button onClick={sendReply} disabled={sendingReply || !reply.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50">
                  {sendingReply ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          ) : (
            <div className="border-t border-border px-4 py-3 text-center text-xs text-text-muted">
              Este ticket está {selectedTicket.status === 'resolved' ? 'resuelto' : 'cerrado'}. No se pueden enviar más mensajes.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">Soporte Técnico</h1>
          <p className="text-sm text-text-muted">Gestiona tus consultas y solicitudes de asistencia.</p>
        </div>
        <button onClick={openNewForm} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover shadow-lg shadow-primary/20">
          <Plus size={16} />
          Nuevo Ticket
        </button>
      </div>

      <AnimatePresence>
        {showNew && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="glass-panel rounded-2xl p-6 space-y-4">
            <h3 className="font-display text-lg font-semibold text-white">Nuevo Ticket de Soporte</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-muted">Asunto *</label>
                <input type="text" value={newTicket.subject} onChange={e => setNewTicket(n => ({ ...n, subject: e.target.value }))} placeholder="Describe brevemente tu solicitud" className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-muted">Proyecto</label>
                  <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary">
                    <option value="">General</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-muted">Prioridad</label>
                  <select value={newTicket.priority} onChange={e => setNewTicket(n => ({ ...n, priority: e.target.value }))} className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary">
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-muted">Mensaje *</label>
              <textarea value={newTicket.message} onChange={e => setNewTicket(n => ({ ...n, message: e.target.value }))} rows={4} placeholder="Describe tu problema o solicitud en detalle..." className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-white outline-none focus:border-primary resize-none" />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowNew(false)} className="rounded-lg px-4 py-2 text-sm text-text-muted hover:text-white">Cancelar</button>
              <button onClick={createTicket} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-70">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Enviar Ticket
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="border-b border-border p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 w-full sm:w-auto">
            <Search size={16} className="text-text-muted" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tickets..." className="w-full sm:w-64 bg-transparent text-sm text-white placeholder-text-muted outline-none" />
          </div>
          <div className="flex gap-2">
            <select value={filter} onChange={e => setFilter(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-primary">
              <option value="all">Todos los estados</option>
              <option value="open">Abiertos</option>
              <option value="in_progress">En Progreso</option>
              <option value="waiting_client">Esperando Respuesta</option>
              <option value="resolved">Resueltos</option>
              <option value="closed">Cerrados</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center text-text-muted text-sm">
            {search || filter !== 'all' ? 'No se encontraron tickets.' : 'No tienes tickets de soporte. ¡Crea uno si necesitas ayuda!'}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((ticket, index) => (
              <motion.div
                key={ticket.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => openTicketDetail(ticket)}
                className="flex items-center gap-4 px-6 py-4 cursor-pointer transition-colors hover:bg-surface-hover/50"
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ticket.status === 'open' ? 'bg-danger/10 text-danger' : ticket.status === 'in_progress' ? 'bg-warning/10 text-warning' : ticket.status === 'waiting_client' ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success'}`}>
                  {ticket.status === 'open' ? <Clock size={18} /> : ticket.status === 'in_progress' ? <Activity size={18} /> : <CheckCircle2 size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-white truncate">{ticket.subject}</h4>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${ticket.priority === 'high' ? 'bg-danger/10 text-danger' : ticket.priority === 'medium' ? 'bg-warning/10 text-warning' : 'bg-surface-hover text-text-muted'}`}>
                      {priorityLabels[ticket.priority] || ticket.priority}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[10px] font-mono text-text-muted">{ticket.ticket_number}</span>
                    <span className="flex items-center gap-1 text-[10px] text-text-muted"><MessageSquare size={10} /> {ticket.message_count}</span>
                    <span className="text-[10px] text-text-muted">{timeAgo(ticket.updated_at)}</span>
                  </div>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold border ${ticket.status === 'open' ? 'bg-danger/10 text-danger border-danger/20' : ticket.status === 'in_progress' ? 'bg-warning/10 text-warning border-warning/20' : ticket.status === 'waiting_client' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-success/10 text-success border-success/20'}`}>
                  {statusLabels[ticket.status] || ticket.status}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
