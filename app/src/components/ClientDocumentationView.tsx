import { useState } from 'react';
import { motion } from 'motion/react';
import {
  BookOpen,
  BookA,
  Shield,
  Activity,
  Globe,
  AlertTriangle,
  LifeBuoy,
  Settings,
  LayoutDashboard,
  Bell,
  Lock,
  CheckCircle2,
  Clock,
  Search,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

type TabId = 'guide' | 'glossary';

interface GlossaryItem {
  term: string;
  definition: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

const glossaryItems: GlossaryItem[] = [
  { term: 'Sitio web', definition: 'Tu página en internet (ej: www.tuempresa.cl). Es lo que ven tus clientes cuando te buscan en Google.' },
  { term: 'Disponibilidad (Uptime)', definition: 'El porcentaje de tiempo que tu sitio ha estado funcionando. 100% = nunca se cayó. 99.9% = apenas unos minutos de problema en todo el mes.' },
  { term: 'Caída (Downtime)', definition: 'Cuando tu sitio no funciona y los visitantes no pueden acceder a él. Es como si tu tienda estuviera cerrada.' },
  { term: 'Incidente', definition: 'Un registro de un problema detectado en tu sitio. Se crea automáticamente cuando algo falla y se cierra cuando se resuelve.' },
  { term: 'SSL / Certificado de seguridad', definition: 'El "candadito verde" que aparece en el navegador. Protege la información que tus visitantes envían (datos personales, pagos). Sin SSL, los navegadores muestran una advertencia de "sitio no seguro".' },
  { term: 'Ticket de soporte', definition: 'Una solicitud de ayuda que envías al equipo técnico. Puedes crear tickets para reportar problemas o pedir cambios.' },
  { term: 'Monitoreo', definition: 'La vigilancia constante que el sistema hace sobre tu sitio, revisándolo cada pocos minutos para asegurarse de que todo funcione.' },
  { term: 'Tiempo de respuesta', definition: 'Qué tan rápido responde tu sitio cuando alguien lo visita. Se mide en milisegundos (ms). Menos = más rápido = mejor experiencia para tus visitantes.' },
  { term: 'Plugin', definition: 'Un programa adicional instalado en tu sitio web que agrega funciones extras. Por ejemplo: formularios de contacto, tienda online, chat en vivo, etc.' },
  { term: 'Actualización', definition: 'Una nueva versión de un programa de tu sitio que incluye mejoras o correcciones de seguridad. Es como actualizar una app en tu teléfono.' },
  { term: 'WordPress', definition: 'El programa con el que puede estar construido tu sitio web. Es el "motor" que hace funcionar tu página. Es el más popular del mundo.' },
  { term: 'WooCommerce', definition: 'Un agregado de WordPress que convierte tu sitio en una tienda online donde puedes vender productos.' },
  { term: 'Dashboard / Panel', definition: 'La pantalla principal donde ves el resumen de toda tu información de un vistazo.' },
  { term: 'Notificación', definition: 'Un aviso que recibes (generalmente por email) cuando algo importante pasa con tu sitio, como una caída o recuperación.' },
  { term: 'Hosting / Servidor', definition: 'El computador donde "vive" tu sitio web. Es el que lo mantiene encendido y disponible las 24 horas para que tus visitantes puedan acceder.' },
  { term: 'WebP', definition: 'Un formato de imagen más moderno y liviano. Hace que las fotos de tu sitio se carguen más rápido sin perder calidad.' },
  { term: 'SEO', definition: 'Las técnicas que ayudan a que tu sitio aparezca más arriba en Google cuando alguien busca algo relacionado con tu negocio.' },
  { term: 'Caché', definition: 'Una copia temporal de tu sitio guardada más cerca del visitante para que cargue más rápido. Como tener una sucursal cerca de casa.' },
  { term: 'DNS', definition: 'El sistema que traduce el nombre de tu sitio (tuempresa.cl) a la dirección del servidor. Es como la guía telefónica de internet.' },
  { term: 'FTP', definition: 'Una forma técnica de subir o modificar archivos en tu servidor. Los técnicos lo usan para hacer cambios directos en tu sitio.' },
  { term: 'Lumina Agent', definition: 'Un plugin que se instala en tu sitio WordPress para conectarlo automáticamente con LuminaSupport. Solo necesitas pegar una API Key y el sitio queda vinculado.' },
  { term: 'API Key', definition: 'Una "contraseña especial" que identifica tu cuenta. Se genera desde el panel de LuminaSupport y se pega en el plugin Lumina Agent de tu WordPress para conectar el sitio.' },
];

const faqItems: FaqItem[] = [
  {
    question: '¿Con qué frecuencia se revisa mi sitio?',
    answer: 'Cada 3 a 5 minutos, las 24 horas del día, los 7 días de la semana. Esto significa que si tu sitio tiene un problema, lo detectaremos en máximo 5 minutos.',
  },
  {
    question: '¿Me avisarán si mi sitio se cae?',
    answer: 'Sí. El sistema envía una alerta por email inmediatamente cuando confirma un problema. También recibirás un aviso cuando tu sitio se recupere, para que sepas que todo volvió a la normalidad.',
  },
  {
    question: '¿Qué pasa si hay una falsa alarma?',
    answer: 'El sistema tiene un mecanismo de doble verificación. Si detecta un posible problema, espera 30 segundos y vuelve a revisar antes de crear una alerta. Esto elimina prácticamente todas las falsas alarmas.',
  },
  {
    question: '¿Puedo ver el historial de mi sitio?',
    answer: 'Sí. En la sección "Mis Sitios" puedes ver el historial de disponibilidad, los tiempos de respuesta y los incidentes pasados de cada uno de tus sitios.',
  },
  {
    question: '¿Cómo creo un ticket de soporte?',
    answer: 'Ve a la sección "Soporte" en el menú lateral, haz clic en "Nuevo Ticket", describe tu problema o solicitud con el mayor detalle posible, y envíalo. El equipo técnico lo recibirá inmediatamente.',
  },
  {
    question: '¿Mi información está segura?',
    answer: 'Completamente. El sistema usa encriptación y controles de acceso estrictos. Solo puedes ver tus propios sitios y datos. Nadie más (ni siquiera otros clientes) puede acceder a tu información.',
  },
  {
    question: '¿Qué es el plugin Lumina Agent?',
    answer: 'Es un plugin que se instala en tu sitio WordPress para que LuminaSupport pueda monitorearlo, actualizar plugins y detectar problemas. Solo necesitas pegar una API Key que te da tu administrador. No requiere configuración manual compleja.',
  },
  {
    question: '¿Qué es una API Key?',
    answer: 'Es una clave única que conecta tu sitio con LuminaSupport. Tu administrador la genera desde el panel y te la envía. Solo tienes que pegarla en el plugin Lumina Agent dentro de tu WordPress (Ajustes → Lumina Agent) y guardar.',
  },
  {
    question: '¿Qué significan los colores verde, amarillo y rojo?',
    answer: 'Verde = todo funciona correctamente. Amarillo = hay una advertencia menor (ej: sitio un poco lento o certificado de seguridad por vencer). Rojo = hay un problema serio que requiere atención.',
  },
  {
    question: '¿Qué es el certificado SSL y por qué es importante?',
    answer: 'Es el "candadito verde" que aparece en el navegador. Protege los datos de tus visitantes, mejora tu posición en Google, y evita que los navegadores muestren una advertencia de "sitio no seguro". El sistema monitorea su vencimiento y avisa con anticipación.',
  },
];

export default function ClientDocumentationView() {
  const [activeTab, setActiveTab] = useState<TabId>('guide');
  const [glossarySearch, setGlossarySearch] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const tabs = [
    { id: 'guide' as TabId, label: 'Guía de Uso', icon: BookOpen },
    { id: 'glossary' as TabId, label: 'Glosario', icon: BookA },
  ];

  const filteredGlossary = glossaryItems.filter(item =>
    item.term.toLowerCase().includes(glossarySearch.toLowerCase()) ||
    item.definition.toLowerCase().includes(glossarySearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">Documentación</h1>
        <p className="text-sm text-text-muted mt-1">Aprende cómo funciona tu panel y saca el máximo provecho del monitoreo de tus sitios</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-xl border border-border bg-surface p-1.5">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all ${
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

      {/* Guide Tab */}
      {activeTab === 'guide' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* What is LuminaSupport */}
          <div className="glass-panel rounded-2xl p-8">
            <div className="flex items-start gap-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-white shadow-lg">
                <Shield size={28} />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold text-white mb-3">¿Qué es LuminaSupport?</h2>
                <p className="text-text-muted leading-relaxed">
                  LuminaSupport es un sistema que <strong className="text-white">vigila tu sitio web las 24 horas del día, los 7 días de la semana</strong>. 
                  Piensa en él como un guardia de seguridad digital que está siempre pendiente de que tu página funcione correctamente.
                </p>
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    { icon: CheckCircle2, text: 'Verifica que tu sitio esté encendido y funcionando', color: 'text-success' },
                    { icon: Activity, text: 'Mide qué tan rápido carga para tus visitantes', color: 'text-cyan-400' },
                    { icon: Lock, text: 'Revisa que tu certificado de seguridad esté vigente', color: 'text-amber-400' },
                    { icon: Bell, text: 'Te avisa inmediatamente si algo sale mal', color: 'text-red-400' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl bg-surface-hover/40 p-4">
                      <item.icon size={18} className={`shrink-0 ${item.color}`} />
                      <span className="text-sm text-text-muted">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Your sections */}
          <div className="glass-panel rounded-2xl p-6">
            <h3 className="font-display text-xl font-bold text-white mb-2">Tu Panel — ¿Qué puedes hacer?</h3>
            <p className="text-sm text-text-muted mb-6">Cuando inicias sesión, estas son las secciones disponibles para ti:</p>
            <div className="space-y-4">
              {[
                {
                  icon: LayoutDashboard, title: 'Mi Panel (Dashboard)', color: 'from-blue-500 to-blue-600',
                  items: [
                    'Cuántos sitios web tienes bajo monitoreo',
                    'El promedio de disponibilidad de tus sitios (qué tan seguido están funcionando)',
                    'Si hay algún incidente activo en alguno de tus sitios',
                    'Un gráfico visual de cómo ha sido la disponibilidad en los últimos días',
                    'Las últimas actividades: actualizaciones, incidentes resueltos, etc.',
                  ],
                },
                {
                  icon: Globe, title: 'Mis Sitios', color: 'from-emerald-500 to-emerald-600',
                  items: [
                    'Lista de todos tus sitios web monitoreados',
                    'Estado actual de cada sitio: funcionando (verde), con advertencia (amarillo), o caído (rojo)',
                    'Porcentaje de disponibilidad de cada sitio',
                    'Cuándo fue la última vez que el sistema revisó cada sitio',
                  ],
                },
                {
                  icon: LifeBuoy, title: 'Soporte', color: 'from-violet-500 to-violet-600',
                  items: [
                    'Crear un ticket de soporte describiendo tu problema o solicitud',
                    'Ver tus tickets anteriores y su estado',
                    'Buscar rápidamente un ticket específico',
                    'Cada ticket puede estar: pendiente, en proceso o resuelto',
                  ],
                },
                {
                  icon: Settings, title: 'Configuración', color: 'from-gray-500 to-gray-600',
                  items: [
                    'Editar tu perfil: nombre, empresa, teléfono',
                    'Elegir qué notificaciones quieres recibir por email',
                    'Cambiar tu contraseña cuando lo necesites',
                  ],
                },
              ].map((section, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="rounded-xl border border-border bg-surface/50 p-5"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${section.color} text-white`}>
                      <section.icon size={20} />
                    </div>
                    <h4 className="font-display text-lg font-semibold text-white">{section.title}</h4>
                  </div>
                  <ul className="space-y-2 ml-13">
                    {section.items.map((item, j) => (
                      <li key={j} className="flex items-start gap-2.5 text-sm text-text-muted">
                        <ChevronDown size={12} className="shrink-0 mt-1 text-primary rotate-[-90deg]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
          </div>

          {/* What happens when site has a problem */}
          <div className="glass-panel rounded-2xl p-6">
            <h3 className="font-display text-xl font-bold text-white mb-4">¿Qué pasa cuando tu sitio tiene un problema?</h3>
            <p className="text-sm text-text-muted mb-6">Todo es automático, no tienes que hacer nada:</p>
            <div className="space-y-0">
              {[
                { step: '1', title: 'Detección', desc: 'El sistema visita tu sitio y nota que algo no funciona', color: 'bg-blue-500' },
                { step: '2', title: 'Verificación', desc: 'Espera 30 segundos y vuelve a verificar (para evitar falsas alarmas)', color: 'bg-cyan-500' },
                { step: '3', title: 'Registro', desc: 'Si confirma el problema, crea un "incidente" — un registro detallado', color: 'bg-amber-500' },
                { step: '4', title: 'Notificación', desc: 'Se envía un aviso por email al equipo técnico (y a ti si tienes alertas activadas)', color: 'bg-red-500' },
                { step: '5', title: 'Seguimiento', desc: 'El sistema sigue revisando tu sitio cada pocos minutos', color: 'bg-violet-500' },
                { step: '6', title: 'Resolución', desc: 'Cuando tu sitio vuelve a funcionar, el incidente se cierra y recibes una notificación', color: 'bg-emerald-500' },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="flex items-start gap-4 py-4 border-l-2 border-border pl-6 ml-4 relative"
                >
                  <div className={`absolute left-[-7px] top-5 h-3 w-3 rounded-full ${item.color}`} />
                  <div>
                    <h4 className="text-sm font-bold text-white">{item.step}. {item.title}</h4>
                    <p className="mt-0.5 text-xs text-text-muted">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Colors meaning */}
          <div className="glass-panel rounded-2xl p-6">
            <h3 className="font-display text-xl font-bold text-white mb-4">¿Qué significan los colores?</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { color: 'bg-success', border: 'border-success/30', text: 'text-success', label: 'Verde', desc: 'Todo funciona correctamente. Tu sitio está en línea y respondiendo bien.' },
                { color: 'bg-warning', border: 'border-warning/30', text: 'text-warning', label: 'Amarillo', desc: 'Hay una advertencia menor. Ej: sitio un poco lento o certificado de seguridad por vencer pronto.' },
                { color: 'bg-danger', border: 'border-danger/30', text: 'text-danger', label: 'Rojo', desc: 'Hay un problema serio. Tu sitio está caído o no responde. El equipo técnico ya fue notificado.' },
              ].map((item, i) => (
                <div key={i} className={`rounded-xl border ${item.border} bg-surface/50 p-5`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`h-4 w-4 rounded-full ${item.color}`} />
                    <span className={`font-bold text-sm ${item.text}`}>{item.label}</span>
                  </div>
                  <p className="text-xs text-text-muted leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* SSL */}
          <div className="glass-panel rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
                <Lock size={24} className="text-amber-400" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-white mb-2">¿Qué es el certificado SSL?</h3>
                <p className="text-sm text-text-muted leading-relaxed mb-4">
                  Es lo que hace que tu sitio tenga el <strong className="text-white">candadito verde</strong> en el navegador y que la dirección empiece con <strong className="text-white">https://</strong>. Es importante porque:
                </p>
                <div className="space-y-2">
                  {[
                    'Protege la información que tus visitantes envían (datos personales, pagos)',
                    'Google prefiere sitios con SSL y los posiciona mejor en sus resultados',
                    'Los navegadores muestran una advertencia de "sitio no seguro" sin SSL',
                  ].map((text, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <CheckCircle2 size={14} className="shrink-0 text-success" />
                      <span className="text-sm text-text-muted">{text}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-text-muted bg-surface-hover/50 rounded-lg p-3">
                  <Clock size={12} className="inline mr-1 text-primary" />
                  LuminaSupport revisa automáticamente cuándo vence tu certificado y te avisa con anticipación para que se renueve a tiempo.
                </p>
              </div>
            </div>
          </div>

          {/* FAQ */}
          <div className="glass-panel rounded-2xl p-6">
            <h3 className="font-display text-xl font-bold text-white mb-4">Preguntas Frecuentes</h3>
            <div className="space-y-2">
              {faqItems.map((faq, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="rounded-xl border border-border bg-surface/50 overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                    className="flex w-full cursor-pointer items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-surface-hover/30"
                  >
                    <div className="flex items-center gap-3">
                      <HelpCircle size={16} className="shrink-0 text-primary" />
                      <span className="text-sm font-medium text-white">{faq.question}</span>
                    </div>
                    {expandedFaq === i ? <ChevronUp size={16} className="shrink-0 text-text-muted" /> : <ChevronDown size={16} className="shrink-0 text-text-muted" />}
                  </button>
                  {expandedFaq === i && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-t border-border px-4 py-3 bg-surface-hover/20"
                    >
                      <p className="text-sm text-text-muted leading-relaxed pl-7">{faq.answer}</p>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Glossary Tab */}
      {activeTab === 'glossary' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Search */}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5">
            <Search size={16} className="text-text-muted" />
            <input
              type="text"
              value={glossarySearch}
              onChange={e => setGlossarySearch(e.target.value)}
              placeholder="Buscar término..."
              className="w-full bg-transparent text-sm text-white placeholder-text-muted outline-none"
            />
            {glossarySearch && (
              <span className="shrink-0 text-xs text-text-muted">{filteredGlossary.length} resultado{filteredGlossary.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          {/* Info banner */}
          <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <BookA size={16} className="shrink-0 text-primary" />
            <p className="text-xs text-text-muted">
              Este glosario explica los términos técnicos que puedes encontrar en tu panel. Si tienes dudas sobre algo que no está aquí, crea un ticket de soporte.
            </p>
          </div>

          {/* Glossary items */}
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="divide-y divide-border">
              {filteredGlossary.map((item, i) => (
                <motion.div
                  key={item.term}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="flex gap-4 p-4 hover:bg-surface-hover/30 transition-colors"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary/10 text-secondary font-bold text-xs">
                    {item.term.charAt(0)}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">{item.term}</h4>
                    <p className="mt-0.5 text-xs text-text-muted leading-relaxed">{item.definition}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
