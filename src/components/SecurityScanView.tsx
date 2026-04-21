import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Search,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Globe,
  Clock,
  FileWarning,
  Lock,
  Eye,
  Bug,
  Server,
  Zap,
} from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import LoadingScreen from './LoadingScreen';

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'pass';

interface ScanIssue {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: Severity;
  recommendation: string;
  details?: string;
}

interface ScanResult {
  projectId: string;
  projectName: string;
  url: string;
  scannedAt: string;
  score: number;
  issues: ScanIssue[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    pass: number;
    total: number;
  };
}

interface ScanHistory {
  id: string;
  project_id: string;
  score: number;
  issues_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
  url: string;
  platform: string;
}

const severityConfig: Record<Severity, { label: string; color: string; bg: string; border: string; icon: typeof AlertTriangle }> = {
  critical: { label: 'Crítico', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: ShieldX },
  high: { label: 'Alto', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', icon: ShieldAlert },
  medium: { label: 'Medio', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', icon: AlertTriangle },
  low: { label: 'Bajo', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: Info },
  info: { label: 'Info', color: 'text-text-muted', bg: 'bg-surface-hover', border: 'border-border', icon: Info },
  pass: { label: 'OK', color: 'text-success', bg: 'bg-success/10', border: 'border-success/20', icon: CheckCircle2 },
};

const categoryIcons: Record<string, typeof Shield> = {
  'Archivos Expuestos': FileWarning,
  'Directory Listing': Server,
  'Vectores de Ataque': Bug,
  'Enumeración de Usuarios': Eye,
  'Headers de Seguridad': Lock,
  'Protección Anti-Spam': Shield,
  'Información Expuesta': Info,
  'Acceso Admin': Lock,
  'Plugins de Seguridad': ShieldCheck,
  'SSL/TLS': Lock,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  return `Hace ${Math.floor(hrs / 24)}d`;
}

function getScoreColor(score: number): string {
  if (score >= 90) return 'text-success';
  if (score >= 70) return 'text-yellow-400';
  if (score >= 50) return 'text-orange-400';
  return 'text-red-400';
}

function getScoreLabel(score: number): string {
  if (score >= 90) return 'Excelente';
  if (score >= 70) return 'Bueno';
  if (score >= 50) return 'Mejorable';
  if (score >= 30) return 'Deficiente';
  return 'Crítico';
}

function getScoreBg(score: number): string {
  if (score >= 90) return 'from-success/20 to-success/5';
  if (score >= 70) return 'from-yellow-500/20 to-yellow-500/5';
  if (score >= 50) return 'from-orange-500/20 to-orange-500/5';
  return 'from-red-500/20 to-red-500/5';
}

export default function SecurityScanView() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanHistory[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showPassItems, setShowPassItems] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<Severity | 'all'>('all');
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => { loadProjects(); }, []);

  const loadProjects = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('id, name, url, platform')
      .eq('is_active', true)
      .order('name');
    if (data) {
      setProjects(data);
      if (data.length > 0) {
        setSelectedProject(data[0].id);
        loadHistory(data[0].id);
      }
    }
    setLoading(false);
  };

  const loadHistory = async (projectId: string) => {
    try {
      const { data } = await supabase
        .from('security_scans')
        .select('id, project_id, score, issues_count, critical_count, high_count, medium_count, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) setScanHistory(data);

      // Load latest scan result
      const { data: latest } = await supabase
        .from('security_scans')
        .select('results')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (latest?.results) {
        setScanResult(latest.results as unknown as ScanResult);
        const cats = new Set<string>();
        (latest.results as unknown as ScanResult).issues.forEach((i: ScanIssue) => {
          if (i.severity !== 'pass') cats.add(i.category);
        });
        setExpandedCategories(cats);
      } else {
        setScanResult(null);
      }
    } catch {
      // Table may not exist yet — ignore
      setScanHistory([]);
      setScanResult(null);
    }
  };

  const runScan = async () => {
    if (!selectedProject) return;
    setScanning(true);
    setScanResult(null);
    setScanError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`${SUPABASE_URL}/functions/v1/security-scan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ projectId: selectedProject }),
      });

      if (res.ok) {
        const result = await res.json() as ScanResult;
        setScanResult(result);
        loadHistory(selectedProject);
        const cats = new Set<string>();
        result.issues.forEach(i => { if (i.severity !== 'pass') cats.add(i.category); });
        setExpandedCategories(cats);
      } else {
        let errMsg = `Error del servidor (${res.status})`;
        try { const err = await res.json(); errMsg = err.error || errMsg; } catch { /* */ }
        setScanError(errMsg);
      }
    } catch (e) {
      setScanError(`Error de conexión: ${e instanceof Error ? e.message : 'No se pudo conectar con la Edge Function. Verifica que esté deployada.'}`);
    }

    setScanning(false);
  };

  const handleProjectChange = (projectId: string) => {
    setSelectedProject(projectId);
    setScanResult(null);
    loadHistory(projectId);
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  // Group issues by category
  const groupedIssues = scanResult ? scanResult.issues.reduce((acc, issue) => {
    if (!acc[issue.category]) acc[issue.category] = [];
    acc[issue.category].push(issue);
    return acc;
  }, {} as Record<string, ScanIssue[]>) : {};

  // Filter
  const filteredGroups = Object.entries(groupedIssues).map(([cat, issues]) => ({
    category: cat,
    issues: issues.filter(i => {
      if (!showPassItems && i.severity === 'pass') return false;
      if (filterSeverity !== 'all' && i.severity !== filterSeverity) return false;
      return true;
    }),
  })).filter(g => g.issues.length > 0);

  if (loading) return <LoadingScreen />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">Seguridad & Anti-Spam</h1>
          <p className="text-sm text-text-muted">Escaneo no destructivo de vulnerabilidades, headers, archivos expuestos y protección anti-spam.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedProject}
            onChange={e => handleProjectChange(e.target.value)}
            className="cursor-pointer rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-primary"
          >
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            onClick={runScan}
            disabled={scanning || !selectedProject}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover shadow-lg shadow-primary/20 disabled:opacity-50"
          >
            {scanning ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {scanning ? 'Escaneando...' : 'Escanear Sitio'}
          </button>
        </div>
      </div>

      {/* Scanning animation */}
      <AnimatePresence>
        {scanning && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass-panel rounded-2xl p-8 text-center"
          >
            <div className="flex flex-col items-center gap-4">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              >
                <Shield size={48} className="text-primary" />
              </motion.div>
              <div>
                <h3 className="font-display text-lg font-semibold text-white">Escaneando sitio...</h3>
                <p className="text-sm text-text-muted mt-1">Verificando archivos, headers, formularios, plugins de seguridad y más. Esto puede tomar hasta 30 segundos.</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                {['Archivos expuestos', 'Directory listing', 'XML-RPC', 'Usuarios', 'Headers HTTP', 'reCAPTCHA', 'Login', 'Plugins seguridad', 'SSL/HTTPS', 'wp-cron'].map((item, i) => (
                  <motion.span
                    key={item}
                    initial={{ opacity: 0.3 }}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.5, delay: i * 0.15, repeat: Infinity }}
                    className="rounded-full bg-surface px-3 py-1 text-[10px] text-text-muted border border-border"
                  >
                    {item}
                  </motion.span>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scan error */}
      {scanError && !scanning && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-2xl p-6 border border-danger/20 bg-danger/5">
          <div className="flex items-start gap-3">
            <ShieldX size={20} className="text-danger shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-danger">Error en el escaneo</h3>
              <p className="text-xs text-text-muted mt-1">{scanError}</p>
              <p className="text-[10px] text-text-muted mt-2">Asegúrate de que la Edge Function <code className="text-primary">security-scan</code> esté deployada y la migración <code className="text-primary">00012_security_scans.sql</code> esté ejecutada.</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Score + Summary */}
      {scanResult && !scanning && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
            {/* Score card */}
            <div className={`glass-panel rounded-2xl p-6 lg:col-span-1 relative overflow-hidden`}>
              <div className={`absolute inset-0 bg-gradient-to-br ${getScoreBg(scanResult.score)} pointer-events-none`} />
              <div className="relative">
                <div className="text-center">
                  <p className="text-xs uppercase tracking-wider text-text-muted mb-2">Puntuación de Seguridad</p>
                  <div className={`text-6xl font-bold font-display ${getScoreColor(scanResult.score)}`}>
                    {scanResult.score}
                  </div>
                  <p className={`text-sm font-medium mt-1 ${getScoreColor(scanResult.score)}`}>{getScoreLabel(scanResult.score)}</p>
                  <div className="mt-4 w-full bg-surface rounded-full h-2 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${scanResult.score}%` }}
                      transition={{ duration: 1, ease: 'easeOut' }}
                      className={`h-full rounded-full ${scanResult.score >= 90 ? 'bg-success' : scanResult.score >= 70 ? 'bg-yellow-400' : scanResult.score >= 50 ? 'bg-orange-400' : 'bg-red-400'}`}
                    />
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-center gap-1 text-[10px] text-text-muted">
                  <Clock size={10} />
                  {new Date(scanResult.scannedAt).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>

            {/* Summary cards */}
            <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {([
                { key: 'critical', label: 'Críticos', icon: ShieldX, color: 'text-red-400', bg: 'bg-red-500/10' },
                { key: 'high', label: 'Altos', icon: ShieldAlert, color: 'text-orange-400', bg: 'bg-orange-500/10' },
                { key: 'medium', label: 'Medios', icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
                { key: 'low', label: 'Bajos', icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                { key: 'pass', label: 'Aprobados', icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
              ] as const).map(item => {
                const Icon = item.icon;
                const count = scanResult.summary[item.key];
                return (
                  <motion.div
                    key={item.key}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-panel rounded-xl p-4 text-center"
                  >
                    <div className={`mx-auto flex h-10 w-10 items-center justify-center rounded-lg ${item.bg}`}>
                      <Icon size={18} className={item.color} />
                    </div>
                    <p className={`mt-2 text-2xl font-bold ${item.color}`}>{count}</p>
                    <p className="text-[10px] uppercase tracking-wider text-text-muted">{item.label}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* Issues detail + History */}
      {scanResult && !scanning && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Issues */}
          <div className="lg:col-span-2 space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={filterSeverity}
                onChange={e => setFilterSeverity(e.target.value as Severity | 'all')}
                className="cursor-pointer rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white outline-none focus:border-primary"
              >
                <option value="all">Todas las severidades</option>
                <option value="critical">Crítico</option>
                <option value="high">Alto</option>
                <option value="medium">Medio</option>
                <option value="low">Bajo</option>
                <option value="info">Info</option>
              </select>
              <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer">
                <input type="checkbox" checked={showPassItems} onChange={e => setShowPassItems(e.target.checked)} className="rounded" />
                Mostrar aprobados
              </label>
            </div>

            {/* Grouped issues */}
            {filteredGroups.length === 0 ? (
              <div className="glass-panel rounded-2xl p-8 text-center text-text-muted text-sm">
                {showPassItems ? 'No hay issues para los filtros seleccionados.' : 'No se encontraron problemas. Activa "Mostrar aprobados" para ver todos los checks.'}
              </div>
            ) : (
              filteredGroups.map(group => {
                const CatIcon = categoryIcons[group.category] || Shield;
                const isExpanded = expandedCategories.has(group.category);
                const hasProblems = group.issues.some(i => i.severity !== 'pass');

                return (
                  <motion.div
                    key={group.category}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-panel rounded-2xl overflow-hidden"
                  >
                    <button
                      onClick={() => toggleCategory(group.category)}
                      className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-hover/50"
                    >
                      <CatIcon size={18} className={hasProblems ? 'text-warning' : 'text-success'} />
                      <span className="flex-1 font-display text-sm font-semibold text-white">{group.category}</span>
                      <div className="flex items-center gap-2">
                        {group.issues.filter(i => i.severity !== 'pass').length > 0 && (
                          <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-bold text-danger">
                            {group.issues.filter(i => i.severity !== 'pass').length} issue{group.issues.filter(i => i.severity !== 'pass').length > 1 ? 's' : ''}
                          </span>
                        )}
                        {isExpanded ? <ChevronDown size={16} className="text-text-muted" /> : <ChevronRight size={16} className="text-text-muted" />}
                      </div>
                    </button>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="divide-y divide-border border-t border-border">
                            {group.issues.map(issue => {
                              const sev = severityConfig[issue.severity];
                              const SevIcon = sev.icon;
                              return (
                                <div key={issue.id} className="px-5 py-4">
                                  <div className="flex items-start gap-3">
                                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${sev.bg}`}>
                                      <SevIcon size={14} className={sev.color} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="text-sm font-medium text-white">{issue.title}</h4>
                                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${sev.bg} ${sev.color} border ${sev.border}`}>
                                          {sev.label}
                                        </span>
                                      </div>
                                      <p className="text-xs text-text-muted mt-1 leading-relaxed">{issue.description}</p>
                                      {issue.details && (
                                        <p className="text-[10px] font-mono text-text-muted mt-1 bg-surface/50 rounded px-2 py-1 inline-block">{issue.details}</p>
                                      )}
                                      {issue.recommendation && (
                                        <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                                          <p className="text-[11px] text-primary"><strong>Recomendación:</strong> {issue.recommendation}</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })
            )}
          </div>

          {/* History sidebar */}
          <div className="lg:col-span-1 space-y-4">
            <div className="glass-panel rounded-2xl p-5">
              <h3 className="font-display text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Clock size={14} className="text-text-muted" />
                Historial de Escaneos
              </h3>
              {scanHistory.length === 0 ? (
                <p className="text-xs text-text-muted">No hay escaneos previos.</p>
              ) : (
                <div className="space-y-2">
                  {scanHistory.map((scan, i) => (
                    <div key={scan.id} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${i === 0 ? 'bg-primary/5 border border-primary/20' : 'border border-border'}`}>
                      <div className={`text-lg font-bold font-display ${getScoreColor(scan.score)}`}>{scan.score}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-text-muted">{timeAgo(scan.created_at)}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {scan.critical_count > 0 && <span className="text-[9px] text-red-400 font-bold">{scan.critical_count} crit</span>}
                          {scan.high_count > 0 && <span className="text-[9px] text-orange-400 font-bold">{scan.high_count} high</span>}
                          {scan.medium_count > 0 && <span className="text-[9px] text-yellow-400 font-bold">{scan.medium_count} med</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick info */}
            <div className="glass-panel rounded-2xl p-5">
              <h3 className="font-display text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Zap size={14} className="text-primary" />
                ¿Qué escaneamos?
              </h3>
              <div className="space-y-2">
                {[
                  'Archivos sensibles expuestos (.env, wp-config, debug.log)',
                  'Directory listing en carpetas críticas',
                  'XML-RPC habilitado (brute force / DDoS)',
                  'Enumeración de usuarios (REST API + ?author)',
                  'Headers de seguridad HTTP (HSTS, CSP, XFO...)',
                  'reCAPTCHA en login, formularios y checkout',
                  'URL de admin por defecto',
                  'Plugins de seguridad instalados',
                  'Redirección HTTPS y versiones expuestas',
                  'wp-cron.php expuesto',
                ].map(item => (
                  <div key={item} className="flex items-start gap-2">
                    <CheckCircle2 size={10} className="text-primary mt-0.5 shrink-0" />
                    <p className="text-[10px] text-text-muted leading-relaxed">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty state — no scan yet */}
      {!scanResult && !scanning && (
        <div className="glass-panel rounded-2xl p-12 text-center">
          <Shield size={48} className="mx-auto text-text-muted mb-4 opacity-50" />
          <h3 className="font-display text-lg font-semibold text-white">Selecciona un proyecto y ejecuta un escaneo</h3>
          <p className="text-sm text-text-muted mt-2 max-w-md mx-auto">
            El escaneo analiza archivos expuestos, headers de seguridad, protección anti-spam, plugins de seguridad y más. Es completamente no destructivo — solo hace peticiones GET.
          </p>
        </div>
      )}
    </div>
  );
}
