import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Loader2,
  Search,
  ChevronRight,
  Globe,
  Building2,
  Image,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  FileImage,
  ArrowRight,
  ChevronLeft,
} from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
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
  frontend_url: string;
}

interface ImageInfo {
  src: string;
  alt: string;
  format: string;
  filename: string;
  needsConversion: boolean;
  source: 'wp-media' | 'frontend' | 'backend-html' | 'shopify-products';
  width?: number;
  height?: number;
}

interface ProjectTypeInfo {
  platform: string;
  isHeadless: boolean;
  isWoo: boolean;
  backendUrl: string;
  frontendUrl: string | null;
}

type ViewMode = 'clients' | 'projects' | 'detail';

export default function ImageOptimizationView() {
  const [viewMode, setViewMode] = useState<ViewMode>('clients');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientInfo | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectInfo | null>(null);
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'needs-conversion' | 'optimized'>('all');
  const [projectTypeInfo, setProjectTypeInfo] = useState<ProjectTypeInfo | null>(null);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'wp-media' | 'frontend' | 'backend-html' | 'shopify-products'>('all');
  const [formatFilter, setFormatFilter] = useState<string | null>(null);
  const [imgPage, setImgPage] = useState(1);
  const IMAGES_PER_PAGE = 15;

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
      .select('id, name, url, platform, frontend_url')
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
    setImages([]);
    setErrorMsg('');
    setProjectTypeInfo(null);
    setSourceFilter('all');
    setFormatFilter(null);
    scanImages(project.id);
  };

  const scanImages = async (projectId: string) => {
    setScanning(true);
    setErrorMsg('');
    setImages([]);

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/scan-images`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ project_id: projectId }),
      });

      if (!res.ok) {
        setErrorMsg(`Error del servidor (${res.status}). Intenta de nuevo.`);
        setScanning(false);
        return;
      }

      const json = await res.json();

      if (json.error) {
        setErrorMsg(json.error);
      }

      if (json.projectType) {
        setProjectTypeInfo(json.projectType);
      }

      const imgList: ImageInfo[] = (json.images || []).map((img: any) => ({
        src: img.src,
        alt: img.alt || '',
        format: img.format || 'Desconocido',
        filename: img.filename || 'imagen',
        needsConversion: img.needsConversion ?? false,
        source: img.source || 'frontend',
        width: img.width,
        height: img.height,
      }));

      setImages(imgList);

      if (imgList.length === 0 && !json.error) {
        setErrorMsg('No se encontraron imágenes.');
      }
    } catch (err: any) {
      setErrorMsg(`Error al escanear: ${err.message}`);
    }

    setScanning(false);
  };

  const goBack = () => {
    setSearch('');
    if (viewMode === 'detail') { setViewMode('projects'); setSelectedProject(null); setImages([]); }
    else if (viewMode === 'projects') { setViewMode('clients'); setSelectedClient(null); }
  };

  const filteredClients = clients.filter(c =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  const filteredImages = images.filter(img => {
    if (filterType === 'needs-conversion' && !img.needsConversion) return false;
    if (filterType === 'optimized' && img.needsConversion) return false;
    if (sourceFilter !== 'all' && img.source !== sourceFilter) return false;
    if (formatFilter && img.format !== formatFilter) return false;
    return true;
  });

  const totalImgPages = Math.max(1, Math.ceil(filteredImages.length / IMAGES_PER_PAGE));
  const paginatedImages = filteredImages.slice((imgPage - 1) * IMAGES_PER_PAGE, imgPage * IMAGES_PER_PAGE);

  const needsConversionCount = images.filter(i => i.needsConversion).length;
  const optimizedCount = images.filter(i => !i.needsConversion).length;

  const getFormatColor = (format: string) => {
    if (format === 'WebP' || format === 'AVIF') return 'bg-success/10 text-success border-success/20';
    if (format === 'SVG') return 'bg-primary/10 text-primary border-primary/20';
    if (format === 'PNG') return 'bg-warning/10 text-warning border-warning/20';
    if (format === 'JPG') return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    if (format === 'GIF') return 'bg-danger/10 text-danger border-danger/20';
    return 'bg-surface-hover text-text-muted border-border';
  };

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
            <h1 className="font-display text-3xl font-bold tracking-tight text-white">Optimización de Imágenes</h1>
            <p className="text-sm text-text-muted">
              {viewMode === 'clients' && 'Detecta imágenes PNG/JPG que necesitan conversión a WebP.'}
              {viewMode === 'projects' && `Proyectos de ${selectedClient?.full_name}`}
              {viewMode === 'detail' && `Escaneo: ${selectedProject?.name}`}
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
                  <span className="flex items-center gap-1 text-xs text-primary"><FileImage size={12} /> Escanear imágenes</span>
                  <ChevronRight size={16} className="text-text-muted" />
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Image Scan Detail */}
      {viewMode === 'detail' && selectedProject && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Project type info */}
          {projectTypeInfo && (
            <div className="glass-panel rounded-2xl p-4">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="rounded-md bg-primary/10 border border-primary/20 px-3 py-1 font-bold text-primary uppercase">{projectTypeInfo.platform}</span>
                {projectTypeInfo.isHeadless && <span className="rounded-md bg-accent/10 border border-accent/20 px-3 py-1 font-bold text-accent">Headless</span>}
                {projectTypeInfo.isWoo && <span className="rounded-md bg-purple-500/10 border border-purple-500/20 px-3 py-1 font-bold text-purple-400">WooCommerce</span>}
                <span className="text-text-muted">Backend: <span className="text-white">{projectTypeInfo.backendUrl}</span></span>
                {projectTypeInfo.frontendUrl && <span className="text-text-muted">Frontend: <span className="text-white">{projectTypeInfo.frontendUrl}</span></span>}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center gap-4 flex-wrap">
            {!scanning && images.length > 0 && (
              <button
                onClick={() => scanImages(selectedProject.id)}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text-muted hover:text-white hover:bg-surface-hover transition-colors"
              >
                <RefreshCw size={14} />
                Re-escanear
              </button>
            )}
            <a href={selectedProject.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline ml-auto">
              <ExternalLink size={12} /> Visitar sitio
            </a>
          </div>

          {/* Scanning spinner */}
          {scanning && (
            <div className="glass-panel rounded-2xl p-16 text-center">
              <Loader2 size={40} className="animate-spin text-primary mx-auto mb-4" />
              <h3 className="font-display text-lg font-semibold text-white mb-2">Escaneando imágenes...</h3>
              <p className="text-sm text-text-muted">
                {['wordpress', 'headless'].includes(selectedProject.platform)
                  ? 'Consultando biblioteca de medios de WordPress y escaneando el sitio...'
                  : 'Analizando la página principal del sitio para detectar imágenes...'}
              </p>
            </div>
          )}

          {/* Results */}
          {!scanning && images.length > 0 && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="glass-panel rounded-2xl p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                      <Image size={24} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-text-muted">Total imágenes</p>
                      <p className="font-display text-2xl font-bold text-white">{images.length}</p>
                    </div>
                  </div>
                </div>
                <div className="glass-panel rounded-2xl p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10">
                      <AlertTriangle size={24} className="text-warning" />
                    </div>
                    <div>
                      <p className="text-sm text-text-muted">Necesitan conversión</p>
                      <p className="font-display text-2xl font-bold text-warning">{needsConversionCount}</p>
                    </div>
                  </div>
                </div>
                <div className="glass-panel rounded-2xl p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/10">
                      <CheckCircle2 size={24} className="text-success" />
                    </div>
                    <div>
                      <p className="text-sm text-text-muted">Ya optimizadas</p>
                      <p className="font-display text-2xl font-bold text-success">{optimizedCount}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Format distribution — clickeable to filter */}
              <div className="glass-panel rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-lg font-semibold text-white">Distribución por formato</h3>
                  {formatFilter && (
                    <button
                      onClick={() => { setFormatFilter(null); setImgPage(1); }}
                      className="cursor-pointer text-xs text-primary hover:underline"
                    >
                      Limpiar filtro
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  {(() => {
                    const counts = new Map<string, number>();
                    images.forEach(img => counts.set(img.format, (counts.get(img.format) || 0) + 1));
                    return Array.from(counts.entries())
                      .sort((a, b) => b[1] - a[1])
                      .map(([format, count]) => (
                        <button
                          key={format}
                          onClick={() => { setFormatFilter(formatFilter === format ? null : format); setImgPage(1); }}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 transition-all hover:scale-[1.03] ${getFormatColor(format)} ${
                            formatFilter === format ? 'ring-2 ring-white/30 scale-[1.03]' : formatFilter && formatFilter !== format ? 'opacity-40' : ''
                          }`}
                        >
                          <span className="font-bold text-sm">{format}</span>
                          <span className="text-xs opacity-70">{count} imagen{count !== 1 ? 'es' : ''}</span>
                          {['PNG', 'JPG', 'GIF', 'BMP', 'TIFF'].includes(format) && (
                            <span className="flex items-center gap-1 text-[10px]"><ArrowRight size={10} /> WebP</span>
                          )}
                        </button>
                      ));
                  })()}
                </div>
              </div>

              {/* Filter tabs */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
                  {[
                    { key: 'all' as const, label: `Todas (${images.length})` },
                    { key: 'needs-conversion' as const, label: `Conversión (${needsConversionCount})` },
                    { key: 'optimized' as const, label: `Optimizadas (${optimizedCount})` },
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => { setFilterType(tab.key); setImgPage(1); }}
                      className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                        filterType === tab.key ? 'bg-primary text-white' : 'text-text-muted hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                {/* Source filter */}
                {(() => {
                  const wpCount = images.filter(i => i.source === 'wp-media').length;
                  const feCount = images.filter(i => i.source === 'frontend').length;
                  const beCount = images.filter(i => i.source === 'backend-html').length;
                  const spCount = images.filter(i => i.source === 'shopify-products').length;
                  const sources = [
                    { key: 'all' as const, label: 'Todas las fuentes' },
                    ...(wpCount > 0 ? [{ key: 'wp-media' as const, label: `WP Media (${wpCount})` }] : []),
                    ...(spCount > 0 ? [{ key: 'shopify-products' as const, label: `Shopify (${spCount})` }] : []),
                    ...(feCount > 0 ? [{ key: 'frontend' as const, label: `Frontend (${feCount})` }] : []),
                    ...(beCount > 0 ? [{ key: 'backend-html' as const, label: `HTML (${beCount})` }] : []),
                  ];
                  if (sources.length <= 2) return null;
                  return (
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
                      {sources.map(s => (
                        <button
                          key={s.key}
                          onClick={() => { setSourceFilter(s.key); setImgPage(1); }}
                          className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                            sourceFilter === s.key ? 'bg-secondary text-white' : 'text-text-muted hover:text-white'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Image list */}
              <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="divide-y divide-border">
                  {paginatedImages.map((img, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="flex items-center gap-4 p-4 hover:bg-surface-hover transition-colors"
                    >
                      {/* Thumbnail */}
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-hover border border-border overflow-hidden">
                        <img
                          src={img.src}
                          alt={img.alt}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white truncate">{img.filename}</p>
                          {img.width && img.height && (
                            <span className="shrink-0 text-[10px] text-text-muted">{img.width}×{img.height}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {img.alt && img.alt !== '(background)' && img.alt !== '(srcset)' && (
                            <span className="text-xs text-text-muted truncate">alt: {img.alt}</span>
                          )}
                          {(img.alt === '(background)' || img.alt === '(srcset)') && (
                            <span className="text-xs text-text-muted">{img.alt === '(background)' ? 'CSS background' : 'srcset'}</span>
                          )}
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            img.source === 'wp-media' ? 'bg-blue-500/10 text-blue-400' :
                            img.source === 'frontend' ? 'bg-green-500/10 text-green-400' :
                            img.source === 'shopify-products' ? 'bg-lime-500/10 text-lime-400' :
                            'bg-gray-500/10 text-gray-400'
                          }`}>
                            {img.source === 'wp-media' ? 'WP Media' : img.source === 'frontend' ? 'Frontend' : img.source === 'shopify-products' ? 'Shopify' : 'HTML'}
                          </span>
                        </div>
                      </div>

                      {/* Format badge */}
                      <span className={`shrink-0 rounded-md border px-3 py-1 text-xs font-bold ${getFormatColor(img.format)}`}>
                        {img.format}
                      </span>

                      {/* Status */}
                      {img.needsConversion ? (
                        <div className="flex shrink-0 items-center gap-2 rounded-lg bg-warning/10 border border-warning/20 px-3 py-1.5">
                          <AlertTriangle size={12} className="text-warning" />
                          <span className="text-xs font-medium text-warning">Convertir a WebP</span>
                        </div>
                      ) : (
                        <div className="flex shrink-0 items-center gap-2 rounded-lg bg-success/10 border border-success/20 px-3 py-1.5">
                          <CheckCircle2 size={12} className="text-success" />
                          <span className="text-xs font-medium text-success">Optimizada</span>
                        </div>
                      )}

                      {/* Link */}
                      <a href={img.src} target="_blank" rel="noopener noreferrer" className="shrink-0 text-text-muted hover:text-primary transition-colors">
                        <ExternalLink size={14} />
                      </a>
                    </motion.div>
                  ))}
                </div>

                {/* Pagination */}
                {totalImgPages > 1 && (
                  <div className="flex items-center justify-between border-t border-border px-5 py-3">
                    <p className="text-xs text-text-muted">
                      Mostrando {(imgPage - 1) * IMAGES_PER_PAGE + 1}–{Math.min(imgPage * IMAGES_PER_PAGE, filteredImages.length)} de {filteredImages.length}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setImgPage(p => Math.max(1, p - 1))}
                        disabled={imgPage === 1}
                        className="flex cursor-pointer items-center justify-center h-8 w-8 rounded-lg border border-border bg-surface text-text-muted hover:text-white hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:cursor-default"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      {Array.from({ length: totalImgPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalImgPages || Math.abs(p - imgPage) <= 1)
                        .reduce<(number | string)[]>((acc, p, idx, arr) => {
                          if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((p, idx) =>
                          typeof p === 'string' ? (
                            <span key={`dot-${idx}`} className="px-1 text-xs text-text-muted">…</span>
                          ) : (
                            <button
                              key={p}
                              onClick={() => setImgPage(p)}
                              className={`flex cursor-pointer items-center justify-center h-8 w-8 rounded-lg text-xs font-medium transition-colors ${
                                imgPage === p
                                  ? 'bg-primary text-white'
                                  : 'border border-border bg-surface text-text-muted hover:text-white hover:bg-surface-hover'
                              }`}
                            >
                              {p}
                            </button>
                          )
                        )}
                      <button
                        onClick={() => setImgPage(p => Math.min(totalImgPages, p + 1))}
                        disabled={imgPage === totalImgPages}
                        className="flex cursor-pointer items-center justify-center h-8 w-8 rounded-lg border border-border bg-surface text-text-muted hover:text-white hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:cursor-default"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      )}
    </div>
  );
}
