import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Globe, Activity, Server, ExternalLink, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import LoadingScreen from './LoadingScreen';
import { usePreviewClient } from '@/lib/PreviewContext';

interface Project {
  id: string;
  name: string;
  url: string;
  platform: string;
  status: string;
  uptime_percent: number;
  response_time_ms: number | null;
  hosting_provider: string;
  last_check_at: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

const platformLabels: Record<string, string> = { wordpress: 'WordPress', shopify: 'Shopify', nextjs: 'Next.js', jumpseller: 'Jumpseller', headless: 'Headless', custom: 'Custom', other: 'Otro' };

export default function ClientProjectsView() {
  const previewClientId = usePreviewClient();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const userId = previewClientId || user?.id;
    if (!userId) { setLoading(false); return; }

    const { data } = await supabase
      .from('projects')
      .select('id, name, url, platform, status, uptime_percent, response_time_ms, hosting_provider, last_check_at')
      .eq('owner_id', userId)
      .eq('is_active', true)
      .order('name');

    if (data) setProjects(data);
    setLoading(false);
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">Mis Sitios</h1>
          <p className="text-sm text-text-muted">Gestiona y monitorea tus proyectos web activos.</p>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center text-text-muted text-sm">No tienes proyectos activos.</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {projects.map((project, index) => {
            const isDown = project.status === 'down';
            const isMaintenance = project.status === 'maintenance';
            const statusLabel = isDown ? 'Caído' : isMaintenance ? 'Mantenimiento' : 'En línea';
            const statusStyle = isDown ? 'bg-danger/10 text-danger border-danger/20' : isMaintenance ? 'bg-warning/10 text-warning border-warning/20' : 'bg-success/10 text-success border-success/20';
            const statusIcon = isDown ? <AlertTriangle size={12} /> : <Activity size={12} />;
            return (
              <motion.div 
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="glass-panel rounded-2xl p-6 flex flex-col h-full"
              >
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Globe size={24} />
                    </div>
                    <div>
                      <h2 className="font-display text-xl font-bold text-white">{project.name}</h2>
                      <a href={`https://${project.url}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-text-muted hover:text-primary transition-colors">
                        {project.url}
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                  <span className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border ${statusStyle}`}>
                    {statusIcon}
                    {statusLabel}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="rounded-xl border border-border bg-surface/30 p-4">
                    <div className="flex items-center gap-2 text-text-muted mb-1">
                      <Activity size={16} />
                      <span className="text-xs font-medium uppercase tracking-wider">Uptime</span>
                    </div>
                    <span className="text-2xl font-bold text-white">{project.uptime_percent}%</span>
                  </div>
                  <div className="rounded-xl border border-border bg-surface/30 p-4">
                    <div className="flex items-center gap-2 text-text-muted mb-1">
                      <Server size={16} />
                      <span className="text-xs font-medium uppercase tracking-wider">Respuesta</span>
                    </div>
                    <span className="text-lg font-bold text-white">{project.response_time_ms ? `${project.response_time_ms}ms` : '—'}</span>
                  </div>
                </div>

                <div className="mt-auto pt-6 border-t border-border flex items-center justify-between">
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-muted">Plataforma:</span>
                      <span className="text-xs font-medium text-white">{platformLabels[project.platform] || project.platform}</span>
                    </div>
                    {project.hosting_provider && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">Hosting:</span>
                        <span className="text-xs font-medium text-white">{project.hosting_provider}</span>
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-text-muted">{project.last_check_at ? `Check: ${timeAgo(project.last_check_at)}` : ''}</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
