import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Loader2,
  Search,
  ChevronRight,
  Globe,
  Building2,
  Gauge,
  Zap,
  Image,
  FileText,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  Eye,
  Smartphone,
  Monitor,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import LoadingScreen from './LoadingScreen';

interface ClientInfo {
  id: string;
  full_name: string;
  email: string;
  company_name: string;
  project_count: number;
}

interface ProjectInfo {
  id: string;
  name: string;
  url: string;
  platform: string;
}

interface AuditResult {
  id: string;
  title: string;
  description: string;
  score: number | null;
  displayValue?: string;
  category: 'performance' | 'seo' | 'accessibility' | 'best-practices';
}

interface SeoData {
  performance: number;
  seo: number;
  accessibility: number;
  bestPractices: number;
  fcp: string;
  lcp: string;
  tbt: string;
  cls: string;
  si: string;
  tti: string;
  audits: AuditResult[];
  fetchedAt: string;
}

type ViewMode = 'clients' | 'projects' | 'detail';
type DeviceMode = 'mobile' | 'desktop';

export default function SeoPerformanceView() {
  const [viewMode, setViewMode] = useState<ViewMode>('clients');
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [search, setSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [device, setDevice] = useState<DeviceMode>('mobile');

  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientInfo | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectInfo | null>(null);
  const [seoData, setSeoData] = useState<SeoData | null>(null);

  useEffect(() => { loadClients(); }, []);

  const loadClients = async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, company_name')
      .order('full_name');

    const { data: allProjects } = await supabase
      .from('projects')
      .select('id, owner_id')
      .eq('is_active', true);

    const projectsByOwner = new Map<string, number>();
    (allProjects || []).forEach(p => {
      projectsByOwner.set(p.owner_id, (projectsByOwner.get(p.owner_id) || 0) + 1);
    });

    setClients(
      (profiles || [])
        .filter(p => projectsByOwner.has(p.id))
        .map(p => ({
          id: p.id,
          full_name: p.full_name || 'Sin nombre',
          email: p.email || '',
          company_name: p.company_name || '',
          project_count: projectsByOwner.get(p.id) || 0,
        }))
    );
    setLoading(false);
  };

  const selectClient = async (client: ClientInfo) => {
    setSelectedClient(client);
    setLoading(true);
    setSearch('');
    const { data } = await supabase
      .from('projects')
      .select('id, name, url, platform')
      .eq('owner_id', client.id)
      .eq('is_active', true)
      .order('name');
    setProjects(data || []);
    setViewMode('projects');
    setLoading(false);
  };

  const selectProject = async (project: ProjectInfo) => {
    setSelectedProject(project);
    setViewMode('detail');
    setSeoData(null);
    setErrorMsg('');
    runAnalysis(project.url, device);
  };

  const runAnalysis = async (url: string, strategy: DeviceMode, retryCount = 0) => {
    setAnalyzing(true);
    setErrorMsg('');
    if (retryCount === 0) setSeoData(null);

    try {
      const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&category=seo&category=accessibility&category=best-practices`;

      const res = await fetch(apiUrl);
      if (!res.ok) {
        if (res.status === 429 && retryCount < 3) {
          const wait = (retryCount + 1) * 5000;
          setErrorMsg(`Límite de API alcanzado. Reintentando en ${wait / 1000}s... (intento ${retryCount + 1}/3)`);
          await new Promise(r => setTimeout(r, wait));
          return runAnalysis(url, strategy, retryCount + 1);
        }
        if (res.status === 429) {
          setErrorMsg('Se ha excedido el límite de la API de PageSpeed. Espera unos minutos e intenta de nuevo.');
          setAnalyzing(false);
          return;
        }
        const errText = await res.text();
        setErrorMsg(`Error de PageSpeed API (${res.status}): ${errText.slice(0, 200)}`);
        setAnalyzing(false);
        return;
      }

      const json = await res.json();
      const cats = json.lighthouseResult?.categories || {};
      const audits = json.lighthouseResult?.audits || {};

      const getMetric = (key: string) => audits[key]?.displayValue || 'N/A';

      const importantAudits: AuditResult[] = [];
      const auditKeys = [
        'render-blocking-resources',
        'uses-optimized-images',
        'uses-webp-images',
        'uses-text-compression',
        'uses-responsive-images',
        'unused-css-rules',
        'unused-javascript',
        'modern-image-formats',
        'meta-description',
        'document-title',
        'http-status-code',
        'is-crawlable',
        'robots-txt',
        'canonical',
        'hreflang',
        'structured-data',
        'font-display',
        'image-alt',
        'link-text',
        'tap-targets',
        'viewport',
        'uses-long-cache-ttl',
        'total-byte-weight',
        'dom-size',
        'redirects',
        'server-response-time',
      ];

      auditKeys.forEach(key => {
        const a = audits[key];
        if (a) {
          let category: AuditResult['category'] = 'performance';
          if (['meta-description', 'document-title', 'http-status-code', 'is-crawlable', 'robots-txt', 'canonical', 'hreflang', 'structured-data', 'link-text', 'tap-targets'].includes(key)) {
            category = 'seo';
          } else if (['image-alt', 'viewport'].includes(key)) {
            category = 'accessibility';
          }

          importantAudits.push({
            id: key,
            title: a.title || key,
            description: (a.description || '').replace(/\[.*?\]\(.*?\)/g, '').slice(0, 200),
            score: a.score,
            displayValue: a.displayValue || undefined,
            category,
          });
        }
      });

      setSeoData({
        performance: Math.round((cats.performance?.score || 0) * 100),
        seo: Math.round((cats.seo?.score || 0) * 100),
        accessibility: Math.round((cats.accessibility?.score || 0) * 100),
        bestPractices: Math.round((cats['best-practices']?.score || 0) * 100),
        fcp: getMetric('first-contentful-paint'),
        lcp: getMetric('largest-contentful-paint'),
        tbt: getMetric('total-blocking-time'),
        cls: getMetric('cumulative-layout-shift'),
        si: getMetric('speed-index'),
        tti: getMetric('interactive'),
        audits: importantAudits,
        fetchedAt: new Date().toLocaleTimeString('es-CL'),
      });
    } catch (err: any) {
      setErrorMsg(`Error al analizar: ${err.message}`);
    }

    setAnalyzing(false);
  };

  const goBack = () => {
    setSearch('');
    if (viewMode === 'detail') { setViewMode('projects'); setSelectedProject(null); setSeoData(null); }
    else if (viewMode === 'projects') { setViewMode('clients'); setSelectedClient(null); }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-success';
    if (score >= 50) return 'text-warning';
    return 'text-danger';
  };

  const getScoreBg = (score: number) => {
    if (score >= 90) return 'bg-success';
    if (score >= 50) return 'bg-warning';
    return 'bg-danger';
  };

  const getAuditIcon = (score: number | null) => {
    if (score === null) return <AlertTriangle size={14} className="text-text-muted" />;
    if (score >= 0.9) return <CheckCircle2 size={14} className="text-success" />;
    if (score >= 0.5) return <AlertTriangle size={14} className="text-warning" />;
    return <XCircle size={14} className="text-danger" />;
  };

  const filteredClients = clients.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {viewMode !== 'clients' && (
            <button onClick={goBack} className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-surface text-text-muted transition-colors hover:bg-surface-hover hover:text-white border border-border">
              <ChevronRight size={20} className="rotate-180" />
            </button>
          )}
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-white">SEO & Performance</h1>
            <p className="text-sm text-text-muted">
              {viewMode === 'clients' && 'Análisis SEO y rendimiento web con PageSpeed Insights.'}
              {viewMode === 'projects' && `Proyectos de ${selectedClient?.full_name}`}
              {viewMode === 'detail' && `Análisis: ${selectedProject?.name}`}
            </p>
          </div>
        </div>
        {viewMode !== 'detail' && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
            <Search size={16} className="text-text-muted" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="w-56 bg-transparent text-sm text-white placeholder-text-muted outline-none" />
          </div>
        )}
      </div>

      {/* Breadcrumb */}
      {viewMode !== 'clients' && (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <button onClick={() => { setViewMode('clients'); setSelectedClient(null); setSearch(''); }} className="cursor-pointer hover:text-primary transition-colors">Clientes</button>
          <ChevronRight size={14} />
          {selectedClient && (
            <>
              <button onClick={() => { if (viewMode === 'detail') goBack(); }} className={`${viewMode === 'detail' ? 'cursor-pointer hover:text-primary' : 'text-white font-medium'} transition-colors`}>
                {selectedClient.full_name}
              </button>
              {viewMode === 'detail' && selectedProject && (
                <><ChevronRight size={14} /><span className="text-white font-medium">{selectedProject.name}</span></>
              )}
            </>
          )}
        </div>
      )}

      {/* Error */}
      {errorMsg && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          <p>{errorMsg}</p>
        </div>
      )}

      {/* Clients */}
      {viewMode === 'clients' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel overflow-hidden rounded-2xl">
          {filteredClients.length === 0 ? (
            <div className="p-12 text-center text-text-muted text-sm">No hay clientes con proyectos.</div>
          ) : (
            <div className="divide-y divide-border">
              {filteredClients.map((client, i) => (
                <motion.button key={client.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  onClick={() => selectClient(client)}
                  className="flex w-full cursor-pointer items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-surface-hover"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">{client.full_name.charAt(0).toUpperCase()}</div>
                    <div>
                      <p className="font-medium text-white">{client.full_name}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-text-muted">{client.email}</span>
                        {client.company_name && <span className="flex items-center gap-1 text-xs text-text-muted"><Building2 size={10} /> {client.company_name}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-text-muted">{client.project_count} proyecto{client.project_count !== 1 ? 's' : ''}</span>
                    <ChevronRight size={18} className="text-text-muted" />
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Projects */}
      {viewMode === 'projects' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map((project, i) => (
              <motion.button key={project.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                onClick={() => selectProject(project)}
                className="glass-panel cursor-pointer rounded-2xl p-5 text-left transition-all hover:border-primary/50"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Globe size={20} /></div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display font-semibold text-white truncate">{project.name}</h3>
                    <p className="text-xs text-text-muted truncate">{project.url}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-xs text-primary"><TrendingUp size={12} /> Analizar SEO</span>
                  <ChevronRight size={16} className="text-text-muted" />
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      {/* SEO Detail */}
      {viewMode === 'detail' && selectedProject && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Controls */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Device toggle */}
            <div className="flex items-center rounded-lg border border-border bg-surface overflow-hidden">
              <button
                onClick={() => { setDevice('mobile'); runAnalysis(selectedProject.url, 'mobile'); }}
                className={`flex cursor-pointer items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${device === 'mobile' ? 'bg-primary text-white' : 'text-text-muted hover:text-white'}`}
              >
                <Smartphone size={14} />
                Mobile
              </button>
              <button
                onClick={() => { setDevice('desktop'); runAnalysis(selectedProject.url, 'desktop'); }}
                className={`flex cursor-pointer items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${device === 'desktop' ? 'bg-primary text-white' : 'text-text-muted hover:text-white'}`}
              >
                <Monitor size={14} />
                Desktop
              </button>
            </div>

            {!analyzing && seoData && (
              <button
                onClick={() => runAnalysis(selectedProject.url, device)}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text-muted hover:text-white hover:bg-surface-hover transition-colors"
              >
                <RefreshCw size={14} />
                Re-analizar
              </button>
            )}

            {seoData && (
              <span className="text-xs text-text-muted">Analizado a las {seoData.fetchedAt}</span>
            )}

            <a href={selectedProject.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline ml-auto">
              <ExternalLink size={12} /> Visitar sitio
            </a>
          </div>

          {/* Analyzing spinner */}
          {analyzing && (
            <div className="glass-panel rounded-2xl p-16 text-center">
              <Loader2 size={40} className="animate-spin text-primary mx-auto mb-4" />
              <h3 className="font-display text-lg font-semibold text-white mb-2">Analizando sitio...</h3>
              <p className="text-sm text-text-muted">Ejecutando PageSpeed Insights ({device}). Esto puede tardar 15-30 segundos.</p>
            </div>
          )}

          {/* Results */}
          {seoData && !analyzing && (
            <>
              {/* Score circles */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[
                  { label: 'Performance', score: seoData.performance, icon: Gauge },
                  { label: 'SEO', score: seoData.seo, icon: TrendingUp },
                  { label: 'Accesibilidad', score: seoData.accessibility, icon: Eye },
                  { label: 'Buenas Prácticas', score: seoData.bestPractices, icon: ShieldCheck },
                ].map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className="glass-panel rounded-2xl p-6 text-center"
                  >
                    <div className="relative mx-auto mb-3 h-24 w-24">
                      <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" className="text-border" />
                        <circle
                          cx="50" cy="50" r="42" fill="none"
                          strokeWidth="6"
                          strokeLinecap="round"
                          strokeDasharray={`${item.score * 2.64} 264`}
                          className={getScoreColor(item.score)}
                          stroke="currentColor"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`font-display text-2xl font-bold ${getScoreColor(item.score)}`}>{item.score}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <item.icon size={14} className="text-text-muted" />
                      <p className="text-sm font-medium text-white">{item.label}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Core Web Vitals */}
              <div className="glass-panel rounded-2xl p-6">
                <h3 className="font-display text-lg font-semibold text-white mb-4">Core Web Vitals</h3>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                  {[
                    { label: 'First Contentful Paint', value: seoData.fcp, icon: Zap, desc: 'Primer contenido visible' },
                    { label: 'Largest Contentful Paint', value: seoData.lcp, icon: Image, desc: 'Mayor elemento visible' },
                    { label: 'Total Blocking Time', value: seoData.tbt, icon: Clock, desc: 'Tiempo de bloqueo total' },
                    { label: 'Cumulative Layout Shift', value: seoData.cls, icon: FileText, desc: 'Cambio de diseño acumulado' },
                    { label: 'Speed Index', value: seoData.si, icon: Gauge, desc: 'Velocidad de carga visual' },
                    { label: 'Time to Interactive', value: seoData.tti, icon: Globe, desc: 'Tiempo hasta interactivo' },
                  ].map((metric, i) => (
                    <motion.div
                      key={metric.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="rounded-xl border border-border bg-surface/50 p-4"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <metric.icon size={14} className="text-primary" />
                        <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">{metric.label}</span>
                      </div>
                      <p className="font-display text-xl font-bold text-white">{metric.value}</p>
                      <p className="text-[10px] text-text-muted mt-0.5">{metric.desc}</p>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Audits */}
              <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="border-b border-border bg-surface/50 px-6 py-4">
                  <h3 className="font-display text-lg font-semibold text-white">Auditorías Detalladas</h3>
                  <p className="text-xs text-text-muted mt-0.5">{seoData.audits.length} auditorías analizadas</p>
                </div>

                {/* Group by pass/fail */}
                {(() => {
                  const failed = seoData.audits.filter(a => a.score !== null && a.score < 0.9);
                  const passed = seoData.audits.filter(a => a.score === null || a.score >= 0.9);

                  return (
                    <div className="divide-y divide-border">
                      {failed.length > 0 && (
                        <div>
                          <div className="px-6 py-3 bg-danger/5 border-b border-border">
                            <span className="text-xs font-bold text-danger uppercase tracking-wider">Necesitan mejora ({failed.length})</span>
                          </div>
                          {failed.map((audit, i) => (
                            <div key={audit.id} className="flex items-start gap-3 px-6 py-3 hover:bg-surface-hover transition-colors">
                              {getAuditIcon(audit.score)}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white">{audit.title}</p>
                                {audit.displayValue && <span className="text-xs text-warning font-mono">{audit.displayValue}</span>}
                                <p className="text-xs text-text-muted mt-0.5 line-clamp-2">{audit.description}</p>
                              </div>
                              <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                                audit.category === 'seo' ? 'bg-primary/10 text-primary border border-primary/20' :
                                audit.category === 'accessibility' ? 'bg-secondary/10 text-secondary border border-secondary/20' :
                                'bg-surface-hover text-text-muted border border-border'
                              }`}>
                                {audit.category === 'seo' ? 'SEO' : audit.category === 'accessibility' ? 'A11y' : 'Perf'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {passed.length > 0 && (
                        <div>
                          <div className="px-6 py-3 bg-success/5 border-b border-border">
                            <span className="text-xs font-bold text-success uppercase tracking-wider">Aprobadas ({passed.length})</span>
                          </div>
                          {passed.map((audit) => (
                            <div key={audit.id} className="flex items-start gap-3 px-6 py-3 hover:bg-surface-hover transition-colors">
                              {getAuditIcon(audit.score)}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white">{audit.title}</p>
                                {audit.displayValue && <span className="text-xs text-success font-mono">{audit.displayValue}</span>}
                              </div>
                              <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                                audit.category === 'seo' ? 'bg-primary/10 text-primary border border-primary/20' :
                                audit.category === 'accessibility' ? 'bg-secondary/10 text-secondary border border-secondary/20' :
                                'bg-surface-hover text-text-muted border border-border'
                              }`}>
                                {audit.category === 'seo' ? 'SEO' : audit.category === 'accessibility' ? 'A11y' : 'Perf'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </motion.div>
      )}
    </div>
  );
}
