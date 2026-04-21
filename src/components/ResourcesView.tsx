import { motion } from 'motion/react';
import { Package, Download, Plug, FileText, ExternalLink, Bot, Key } from 'lucide-react';

const resources = [
  {
    id: 'lumina-agent',
    name: 'Lumina Agent',
    description: 'Plugin de WordPress que conecta tu sitio con LuminaSupport usando una API Key. Permite monitoreo, actualizaciones remotas de plugins/temas/core y registro automático del sitio. Solo necesitas pegar tu API Key.',
    version: '3.0.0',
    icon: Bot,
    file: '/lumina-agent.zip',
    instructions: [
      'Genera una API Key en Configuración → Integraciones de este panel',
      'Descarga el archivo .zip de abajo',
      'En WordPress: Plugins → Añadir nuevo → Subir plugin → sube el .zip',
      'Activa el plugin y ve a WP Admin → Ajustes → Lumina Agent',
      'Pega tu API Key y guarda — el sitio se conectará automáticamente',
    ],
  },
  {
    id: 'lumina-updater-legacy',
    name: 'Lumina Updater (Legacy)',
    description: 'Versión anterior del plugin que usa Application Passwords. Si ya lo tienes instalado, sigue funcionando. Para nuevas instalaciones, usa Lumina Agent v3.',
    version: '2.0.0',
    icon: Plug,
    file: '/lumina-updater.zip',
    instructions: [
      'Descarga el archivo .zip',
      'En WordPress: Plugins → Añadir nuevo → Subir plugin',
      'Sube el .zip, instala y activa',
      'Configura la URL de Lumina y el Token del proyecto en Herramientas → Lumina Agent',
    ],
  },
];

export default function ResourcesView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">Recursos</h1>
        <p className="text-sm text-text-muted">Herramientas y plugins para gestionar tus proyectos.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {resources.map((res, i) => (
          <motion.div
            key={res.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass-panel rounded-2xl p-6"
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <res.icon size={24} />
              </div>
              <div className="flex-1">
                <h2 className="font-display text-xl font-bold text-white">{res.name}</h2>
                <span className="text-xs text-text-muted">v{res.version}</span>
              </div>
            </div>

            <p className="text-sm text-text-muted leading-relaxed mb-4">{res.description}</p>

            <div className="rounded-xl border border-border bg-surface/30 p-4 mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3 flex items-center gap-2">
                <FileText size={12} /> Instrucciones
              </h3>
              <ol className="space-y-2">
                {res.instructions.map((step, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-text-muted">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">{j + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            <a
              href={res.file}
              download
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-primary-hover shadow-lg shadow-primary/20"
            >
              <Download size={16} />
              Descargar {res.name}
            </a>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
