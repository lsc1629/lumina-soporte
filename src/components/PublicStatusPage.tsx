import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import LoadingScreen from './LoadingScreen';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Wrench,
  Clock,
  Globe,
  Shield,
  Activity,
  Headset,
  Loader2,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface StatusPageData {
  project: {
    name: string;
    url: string;
    platform: string;
    status: string;
    statusLabel: string;
    uptimePercent: number;
    responseTimeMs: number;
    lastCheckAt: string;
    sslExpiry: string | null;
  };
  uptime: Record<string, number>;
  uptimeDays: { date: string; uptime: number; avgResponseMs: number | null; checks: number }[];
  responseTimeLogs: { time: string; ms: number }[];
  incidents: {
    id: string;
    incident_number: string;
    title: string;
    status: string;
    priority: string;
    started_at: string;
    resolved_at: string | null;
    duration_minutes: number | null;
  }[];
}

interface PublicStatusPageProps {
  slug: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const statusConfig: Record<string, { color: string; bg: string; icon: typeof CheckCircle2; label: string }> = {
  up: { color: 'text-success', bg: 'bg-success/10', icon: CheckCircle2, label: 'Operativo' },
  warning: { color: 'text-warning', bg: 'bg-warning/10', icon: AlertTriangle, label: 'Degradado' },
  down: { color: 'text-danger', bg: 'bg-danger/10', icon: XCircle, label: 'Caído' },
  maintenance: { color: 'text-secondary', bg: 'bg-secondary/10', icon: Wrench, label: 'Mantenimiento' },
};

function getUptimeBarColor(uptime: number): string {
  if (uptime >= 99.5) return 'bg-success';
  if (uptime >= 95) return 'bg-warning';
  if (uptime > 0) return 'bg-danger';
  return 'bg-border';
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

function formatDuration(mins: number | null): string {
  if (!mins) return '< 1m';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function PublicStatusPage({ slug, supabaseUrl, supabaseAnonKey }: PublicStatusPageProps) {
  const [data, setData] = useState<StatusPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStatusData();
    const interval = setInterval(fetchStatusData, 60000);
    return () => clearInterval(interval);
  }, [slug]);

  const fetchStatusData = async () => {
    try {
      const res = await fetch(
        `${supabaseUrl}/functions/v1/public-status?slug=${encodeURIComponent(slug)}`,
        {
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!res.ok) {
        const errData = await res.json() as Record<string, any>;
        setError(errData.error || 'Página de estado no encontrada');
        setLoading(false);
        return;
      }

      const result = await res.json() as StatusPageData;
      setData(result);
      setError(null);
    } catch {
      setError('Error al cargar los datos de estado');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoadingScreen />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/10 mb-4">
          <XCircle size={32} className="text-danger" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Página no encontrada</h1>
        <p className="text-text-muted text-center">{error || 'Esta página de estado no existe o no está habilitada.'}</p>
      </div>
    );
  }

  const { project, uptime, uptimeDays, responseTimeLogs, incidents } = data;
  const config = statusConfig[project.status] || statusConfig.up;
  const StatusIcon = config.icon;

  // Fill missing days in uptimeDays for a complete 90-day bar
  const allDays: typeof uptimeDays = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().substring(0, 10);
    const existing = uptimeDays.find(day => day.date === dateStr);
    allDays.push(existing || { date: dateStr, uptime: -1, avgResponseMs: null, checks: 0 });
  }

  return (
    <div className="min-h-screen bg-background text-text-main">
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-white shadow-lg">
              <Headset size={20} />
            </div>
            <h1 className="font-display text-2xl font-bold text-white">
              {project.name}
            </h1>
          </div>

          {/* Current Status Banner */}
          <div className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 ${config.bg}`}>
            <StatusIcon size={20} className={config.color} />
            <span className={`font-semibold ${config.color}`}>{project.statusLabel}</span>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 gap-3 mb-8 md:grid-cols-4"
        >
          {[
            { label: 'Uptime 24h', value: `${uptime['24h'] ?? 100}%`, icon: Activity },
            { label: 'Uptime 7d', value: `${uptime['7d'] ?? 100}%`, icon: Activity },
            { label: 'Uptime 30d', value: `${uptime['30d'] ?? 100}%`, icon: Activity },
            { label: 'Resp. Actual', value: project.responseTimeMs ? `${project.responseTimeMs}ms` : '—', icon: Clock },
          ].map((stat, i) => (
            <div key={i} className="rounded-xl border border-border bg-surface/50 p-4 text-center">
              <stat.icon size={16} className="mx-auto mb-1.5 text-text-muted" />
              <p className="text-lg font-bold text-white">{stat.value}</p>
              <p className="text-xs text-text-muted">{stat.label}</p>
            </div>
          ))}
        </motion.div>

        {/* 90-Day Uptime Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-8 rounded-xl border border-border bg-surface/50 p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-sm font-semibold text-white">Uptime — últimos 90 días</h2>
            <span className="text-xs text-text-muted">{uptime['90d'] ?? 100}% promedio</span>
          </div>

          <div className="flex gap-[2px] h-8 items-end" title="Cada barra = 1 día">
            {allDays.map((day, i) => {
              const color = day.checks === 0 ? 'bg-border/40' : getUptimeBarColor(day.uptime);
              const tooltipText = day.checks === 0
                ? `${day.date}: Sin datos`
                : `${day.date}: ${day.uptime}% (${day.checks} checks)`;
              return (
                <div
                  key={i}
                  className={`flex-1 rounded-[2px] transition-all hover:opacity-80 cursor-default ${color}`}
                  style={{ height: day.checks === 0 ? '30%' : `${Math.max(30, day.uptime)}%` }}
                  title={tooltipText}
                />
              );
            })}
          </div>

          <div className="flex justify-between mt-2">
            <span className="text-[10px] text-text-muted">90 días atrás</span>
            <span className="text-[10px] text-text-muted">Hoy</span>
          </div>
        </motion.div>

        {/* Response Time Chart */}
        {responseTimeLogs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mb-8 rounded-xl border border-border bg-surface/50 p-5"
          >
            <h2 className="font-display text-sm font-semibold text-white mb-4">Tiempo de respuesta — últimas 24h</h2>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={responseTimeLogs}>
                <defs>
                  <linearGradient id="responseGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="time"
                  tickFormatter={(val: string) => {
                    const d = new Date(val);
                    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                  }}
                  stroke="#a1a1aa"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#a1a1aa"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val: number) => `${val}ms`}
                />
                <Tooltip
                  contentStyle={{
                    background: '#121212',
                    border: '1px solid #27272a',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                  labelFormatter={(val: string) => new Date(val).toLocaleString('es-CL')}
                  formatter={(val: number) => [`${val}ms`, 'Respuesta']}
                />
                <Area
                  type="monotone"
                  dataKey="ms"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  fill="url(#responseGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </motion.div>
        )}

        {/* Incidents Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-8 rounded-xl border border-border bg-surface/50 p-5"
        >
          <h2 className="font-display text-sm font-semibold text-white mb-4">Incidentes recientes</h2>

          {incidents.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-text-muted">
              <CheckCircle2 size={32} className="text-success mb-2" />
              <p className="text-sm">Sin incidentes en los últimos 90 días</p>
            </div>
          ) : (
            <div className="space-y-3">
              {incidents.map((inc) => {
                const isResolved = inc.status === 'resolved';
                const IncIcon = isResolved ? CheckCircle2 : inc.status === 'investigating' ? AlertTriangle : XCircle;
                const iconColor = isResolved ? 'text-success' : 'text-danger';
                return (
                  <div key={inc.id} className="flex items-start gap-3 rounded-lg border border-border/50 bg-background/50 p-3">
                    <IncIcon size={18} className={`mt-0.5 shrink-0 ${iconColor}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-text-muted">{inc.incident_number}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                          isResolved ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                        }`}>
                          {isResolved ? 'Resuelto' : inc.status}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-white mt-0.5 truncate">{inc.title}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                        <span>{new Date(inc.started_at).toLocaleDateString('es-CL')}</span>
                        {inc.duration_minutes !== null && (
                          <span>Duración: {formatDuration(inc.duration_minutes)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* SSL Info */}
        {project.sslExpiry && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mb-8 flex items-center gap-3 rounded-xl border border-border bg-surface/50 p-4"
          >
            <Shield size={18} className="text-success shrink-0" />
            <div>
              <p className="text-sm font-medium text-white">Certificado SSL activo</p>
              <p className="text-xs text-text-muted">Expira: {new Date(project.sslExpiry).toLocaleDateString('es-CL')}</p>
            </div>
          </motion.div>
        )}

        {/* Footer */}
        <div className="text-center pt-4 pb-8 border-t border-border/50">
          <p className="text-xs text-text-muted">
            Última verificación: {project.lastCheckAt ? formatRelativeTime(project.lastCheckAt) : '—'}
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <Globe size={12} className="text-text-muted" />
            <a href={project.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
              {project.url}
            </a>
          </div>
          <p className="text-[10px] text-text-muted mt-3">
            Monitoreado por <span className="font-semibold text-primary">LuminaSupport</span>
          </p>
        </div>
      </div>
    </div>
  );
}
