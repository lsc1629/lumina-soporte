import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Users, Search, Loader2, Globe } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import LoadingScreen from './LoadingScreen';

interface ClientInfo {
  id: string;
  full_name: string;
  email: string;
  project_count: number;
}

interface ClientPreviewSelectorProps {
  onSelect: (clientId: string) => void;
  onBack: () => void;
}

export default function ClientPreviewSelector({ onSelect, onBack }: ClientPreviewSelectorProps) {
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { loadClients(); }, []);

  const loadClients = async () => {
    setLoading(true);

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'client')
      .order('full_name');

    if (!profiles) { setLoading(false); return; }

    // Get project counts per client in batch
    const clientIds = profiles.map(p => p.id);
    const { data: projects } = await supabase
      .from('projects')
      .select('owner_id')
      .in('owner_id', clientIds)
      .eq('is_active', true);

    const countMap = new Map<string, number>();
    for (const proj of (projects || [])) {
      countMap.set(proj.owner_id, (countMap.get(proj.owner_id) || 0) + 1);
    }

    setClients(profiles.map(p => ({
      id: p.id,
      full_name: p.full_name || 'Sin nombre',
      email: p.email || '',
      project_count: countMap.get(p.id) || 0,
    })));
    setLoading(false);
  };

  const filtered = clients.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg space-y-6"
      >
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-text-muted transition-colors hover:bg-surface-hover hover:text-white border border-border"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Vista Previa de Cliente</h1>
            <p className="text-sm text-text-muted">Selecciona un cliente para ver su panel</p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface/50 px-4 py-3 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50">
          <Search size={16} className="text-text-muted" />
          <input
            type="text"
            placeholder="Buscar cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-white placeholder-text-muted outline-none"
          />
        </div>

        <div className="glass-panel rounded-2xl overflow-hidden max-h-[60vh] overflow-y-auto">
          {loading ? (
            <LoadingScreen compact />
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-text-muted">
              <Users size={32} className="mx-auto mb-3 opacity-30" />
              No hay clientes registrados.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(client => (
                <button
                  key={client.id}
                  onClick={() => onSelect(client.id)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-hover"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {client.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{client.full_name}</p>
                    <p className="text-xs text-text-muted truncate">{client.email}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-text-muted">
                    <Globe size={12} />
                    <span>{client.project_count} {client.project_count === 1 ? 'sitio' : 'sitios'}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
