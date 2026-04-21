# Manual del Sistema — LuminaSupport

---

## Parte 1: Explicación General (No Técnica)

### ¿Qué es LuminaSupport?

Imagina que tienes varios sitios web de clientes y necesitas saber en todo momento si están funcionando bien, si se cayeron, si necesitan actualizaciones o si tienen algún problema de seguridad. **LuminaSupport** es como un "centro de control" que vigila todos esos sitios por ti, las 24 horas del día, los 7 días de la semana.

Es como tener un guardia de seguridad digital que:
- Revisa constantemente que tus sitios estén encendidos y funcionando
- Te avisa inmediatamente si algo se cae
- Te dice qué cosas necesitan actualización
- Te muestra reportes de cómo va todo

### ¿Cómo funciona en palabras simples?

#### El Panel de Administrador (tu vista)

Cuando entras al sistema como administrador, tienes acceso a todo:

**1. Dashboard (Panel Principal)**
Es la primera pantalla que ves. Te muestra un resumen rápido: cuántos proyectos tienes, el promedio de disponibilidad (uptime), cuántos incidentes hay activos y cuántas actualizaciones están pendientes. También hay un gráfico que muestra los tiempos de respuesta de los últimos días y una lista de actividad reciente. Es como el tablero de un auto que te dice de un vistazo si todo está bien.

**2. Proyectos**
Aquí ves la lista de todos los sitios web que estás monitoreando. Puedes agregar nuevos proyectos, editarlos o ver sus detalles. Cada proyecto tiene información como su URL, qué plataforma usa (WordPress, Shopify, etc.), quién es el dueño (cliente), y las credenciales necesarias para conectarse a su API.

Cuando creas un proyecto nuevo, el sistema te pide los datos en pasos:
- **Paso 1**: Datos básicos (nombre, URL, cliente, plataforma)
- **Paso 2**: Configuración de monitoreo (URL de admin, credenciales, keyword de verificación)
- **Paso 3**: Configuración de frontend (para proyectos headless), FTP, y notas

**3. Monitoreo**
Esta sección tiene varias sub-pantallas:

- **Uptime**: Muestra si cada sitio está "arriba" (funcionando) o "abajo" (caído). Te da el porcentaje de disponibilidad y un historial visual de los últimos días.

- **Performance**: Muestra qué tan rápido responden los sitios. Incluye gráficos de tiempo de respuesta, estadísticas como promedio, mediana, mínimo, máximo, y percentiles (P95, P99). También muestra la distribución de tiempos de respuesta.

- **Estado de Salud**: Una vista general de la "salud" de cada sitio. Combina varios factores: si está activo, el estado del certificado SSL, el tiempo de respuesta, y la fecha de la última revisión. Te da un puntaje de salud de 0 a 100.

- **SEO Performance**: Analiza el rendimiento SEO de un sitio usando la API de Google PageSpeed Insights. Te muestra puntuaciones de Performance, SEO, Accesibilidad y Mejores Prácticas, además de las Core Web Vitals (FCP, LCP, TBT, CLS, etc.).

- **Optimización de Imágenes**: Escanea las imágenes de un sitio web y te dice cuáles están en formatos antiguos (PNG, JPG) que deberían convertirse a WebP para mejor rendimiento. Funciona diferente según el tipo de proyecto:
  - **WordPress puro**: Consulta la biblioteca de medios de WordPress via API y también escanea el HTML del sitio
  - **Headless** (ej: backend en WordPress + frontend en Vercel): Consulta la biblioteca de medios del backend Y escanea las imágenes del frontend por separado
  - **Otros** (Shopify, NextJS, etc.): Escanea el HTML del sitio

**4. Incidentes**
Cuando un sitio se cae, el sistema crea automáticamente un "incidente" (como un ticket de problema). Aquí puedes ver todos los incidentes, su estado (investigando, identificado, monitoreando, resuelto), su prioridad, y una línea de tiempo con todo lo que ha pasado. Si el sitio se recupera solo, el incidente se cierra automáticamente.

**5. Actualizaciones**
Los sitios WordPress tienen plugins y temas que necesitan mantenerse actualizados. Esta pantalla te muestra qué plugins necesitan actualización en cada proyecto. Puedes aplicar actualizaciones individualmente o en bloque. El sistema se conecta directamente al WordPress del cliente para obtener la lista de plugins instalados.

**6. Informes**
Genera reportes mensuales por cliente con estadísticas de uptime, incidentes, actualizaciones aplicadas y un gráfico de rendimiento. Ideal para enviarle al cliente un resumen de cómo van sus sitios.

**7. Configuración**
Ajustes de tu cuenta: perfil, notificaciones, seguridad (cambio de contraseña), integraciones, apariencia y localización.

#### El Panel del Cliente (lo que ve tu cliente)

Los clientes tienen una versión simplificada:

**1. Mi Panel**: Un resumen con sus sitios, uptime promedio, incidentes activos y actividad reciente.

**2. Mis Sitios**: Solo ven sus propios proyectos (no los de otros clientes). Pueden ver el estado y las métricas básicas.

**3. Soporte**: Pueden crear tickets de soporte, buscar en sus tickets existentes y ver el estado de cada uno.

**4. Configuración**: Pueden editar su perfil, cambiar notificaciones y su contraseña.

#### El Monitoreo Automático (lo que pasa tras bambalinas)

El corazón del sistema es un proceso automático que corre cada 3-5 minutos y hace lo siguiente:

1. **Revisa cada sitio**: Hace una solicitud al sitio web y mide cuánto tarda en responder
2. **Verifica la API de WordPress**: Si es un sitio WordPress, también verifica que la API REST funcione
3. **Revisa el frontend**: Si es un proyecto headless, también verifica el frontend (ej: Vercel)
4. **Verifica keywords**: Si configuraste una palabra clave de verificación, la busca en el HTML para confirmar que el contenido correcto se está mostrando
5. **Revisa SSL**: Verifica cuándo expira el certificado de seguridad
6. **Sistema de doble verificación**: Si detecta que un sitio está caído, espera 30 segundos y vuelve a verificar antes de declarar una caída real (evita falsas alarmas)
7. **Crea incidentes automáticos**: Si confirma que un sitio está caído, crea un incidente con toda la información del problema
8. **Resuelve automáticamente**: Cuando detecta que un sitio que estaba caído volvió a funcionar, cierra el incidente
9. **Envía alertas por email**: Notifica a los administradores y al dueño del proyecto cuando hay caídas, recuperaciones o cuando el SSL está por vencer

#### Página de Estado Pública

Cada proyecto puede tener una página de estado pública (como las que usan GitHub o Slack para mostrar si sus servicios funcionan). Los clientes o sus usuarios finales pueden ver el historial de disponibilidad de los últimos 90 días, los tiempos de respuesta recientes, y los incidentes, todo sin necesidad de iniciar sesión.

---

## Parte 2: Documentación Técnica

### Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + Vite 6 |
| Estilos | TailwindCSS v4 (CSS-first @theme) |
| Animaciones | motion/react (Framer Motion) |
| Iconos | lucide-react |
| Gráficos | recharts (AreaChart, BarChart) |
| Routing | react-router-dom (BrowserRouter) |
| Backend/DB | Supabase (PostgreSQL + Auth + Edge Functions + RLS) |
| Auth | Supabase Auth (email/password) |
| Utilidades | clsx + tailwind-merge (cn() helper) |

### Arquitectura General

```
┌─────────────────────────────────────────────────┐
│                   FRONTEND                       │
│           React 19 + Vite 6 + TailwindCSS v4    │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ LoginView│  │MainLayout│  │ ClientLayout  │  │
│  │          │  │ (Admin)  │  │  (Cliente)    │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
│         │            │              │            │
│         └────────────┼──────────────┘            │
│                      │                           │
│              Supabase Client JS                  │
└──────────────────────┬──────────────────────────┘
                       │ HTTPS
┌──────────────────────┴──────────────────────────┐
│                   SUPABASE                       │
│                                                  │
│  ┌──────────────┐  ┌─────────────────────────┐  │
│  │  PostgreSQL   │  │    Edge Functions        │  │
│  │  + RLS        │  │  ┌─────────────────┐    │  │
│  │               │  │  │ monitor-sites    │    │  │
│  │  Tables:      │  │  │ fetch-plugins    │    │  │
│  │  - profiles   │  │  │ scan-images      │    │  │
│  │  - projects   │  │  │ public-status    │    │  │
│  │  - incidents  │  │  │ test-connection  │    │  │
│  │  - uptime_logs│  │  └─────────────────┘    │  │
│  │  - project_   │  │                         │  │
│  │    plugins    │  │  Supabase Cron           │  │
│  │  - alert_log  │  │  (invoca monitor-sites   │  │
│  │  - incident_  │  │   cada 3-5 min)          │  │
│  │    timeline   │  │                         │  │
│  └──────────────┘  └─────────────────────────┘  │
│                                                  │
│  Supabase Auth (JWT + email/password)            │
└──────────────────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
    ┌─────┴─────┐ ┌────┴────┐ ┌────┴─────┐
    │ Sitios WP │ │ Resend  │ │ Google   │
    │ (REST API)│ │ (Email) │ │ PageSpeed│
    └───────────┘ └─────────┘ └──────────┘
```

### Base de Datos — Tablas Principales

#### `profiles`
Extiende `auth.users` con datos de perfil. Campos: `id` (FK a auth.users), `full_name`, `email`, `company_name`, `phone`, `role` (admin/client), `avatar_url`, `notification_*`.
- RLS: Cada usuario solo lee/edita su propio perfil. Admins pueden leer todos.

#### `projects`
Proyectos monitoreados. Campos clave:
- `owner_id` → FK a auth.users (el cliente dueño)
- `url` → URL principal del sitio (backend en caso headless)
- `platform` → ENUM: wordpress, shopify, nextjs, jumpseller, headless, custom, other
- `status` → ENUM: up, down, warning, maintenance, paused
- `uptime_percent` → Calculado automáticamente por monitor-sites
- `response_time_ms` → Último tiempo de respuesta
- `ssl_expiry` → Fecha de expiración del certificado SSL
- `admin_url`, `admin_user`, `admin_password_encrypted` → Credenciales para WP REST API
- `frontend_url`, `frontend_provider`, `frontend_healthcheck` → Para proyectos headless
- `keyword_check` → Palabra clave que debe estar presente en el HTML
- `public_slug`, `status_page_enabled` → Página de estado pública

#### `uptime_logs`
Registro histórico de cada check. Campos: `project_id`, `status`, `response_time_ms`, `status_code`, `checked_at`.

#### `incidents`
Incidentes de caída. Campos: `project_id`, `title`, `description`, `status` (investigating/identified/monitoring/resolved), `priority` (low/medium/high/critical), `is_auto_detected`, `started_at`, `resolved_at`, `duration_minutes`, `resolution`, `incident_number`.

#### `incident_timeline`
Línea de tiempo de cada incidente. Campos: `incident_id`, `event_type` (alert/status_change/note/resolution), `message`, `created_at`.

#### `project_plugins`
Plugins/temas instalados por proyecto. Campos: `project_id`, `name`, `slug`, `current_version`, `latest_version`, `is_active`, `plugin_type` (plugin/theme/app), `author`.
- Unique constraint: (project_id, slug)
- Índice parcial para plugins desactualizados

#### `alert_log`
Registro de alertas enviadas. Previene envío duplicado (cooldown de 24h por tipo de alerta por proyecto).

### Edge Functions

#### `monitor-sites`
**Propósito**: Monitoreo automatizado de todos los sitios activos.
**Trigger**: Supabase Cron cada 3-5 minutos.
**Flujo**:
1. Obtiene todos los proyectos activos (no pausados ni en mantenimiento)
2. Para cada proyecto ejecuta `checkProject()`:
   - Fetch del sitio con timeout de 15s
   - Verificación de keyword si está configurado
   - Check SSL via API externa (ssl-checker.io)
   - Check WP REST API para plataformas WordPress
   - Check frontend para arquitecturas headless
3. `determineStatus()` calcula el nuevo estado (up/down/warning)
4. **Retry**: Si detecta DOWN y antes estaba UP, espera 30s y reintenta (doble verificación)
5. Registra log en `uptime_logs`
6. Actualiza `projects` con nuevo status, response_time, uptime_percent, ssl_expiry
7. **Alertas SSL**: Si el certificado expira en ≤30 días, envía email a admins + owner
8. **Incidentes automáticos**: Si confirma DOWN (post-retry), crea incidente con timeline
9. **Auto-resolución**: Si estaba DOWN y ahora está UP, cierra incidentes abiertos
10. **Cooldown**: No crea incidentes duplicados dentro de 15 minutos
11. **Emails**: Envía alertas via Resend API a admins y owner del proyecto

#### `fetch-plugins`
**Propósito**: Obtener la lista de plugins/temas instalados en un proyecto.
**Input**: `{ project_id: string }`
**Lógica según plataforma**:
- **WordPress puro**: Auth con Application Password → `/wp-json/wp/v2/plugins` + `/wp-json/wp/v2/themes`
- **WooCommerce**: Auth con Consumer Key/Secret → `/wp-json/wc/v3/system_status`
- **Shopify**: Shopify Admin API → `/admin/api/{ver}/themes.json`
- **Jumpseller**: Jumpseller API → `/v1/apps.json`
- Hace upsert en `project_plugins` (on conflict: project_id, slug)

#### `scan-images`
**Propósito**: Escanear imágenes de un proyecto para detectar PNG/JPG que necesitan conversión a WebP.
**Input**: `{ project_id: string }`
**Lógica según tipo de proyecto**:
- **WordPress/WooCommerce**: WP REST API `/wp-json/wp/v2/media` (paginado, hasta 500 imágenes) + scraping HTML del sitio
- **Headless**: WP Media API del backend + scraping HTML del frontend_url
- **Otros**: Solo scraping HTML de la URL principal
- Detecta formatos: PNG, JPG, GIF, BMP, TIFF → necesitan conversión. WebP, AVIF, SVG → optimizadas.
- Retorna: lista de imágenes con src, formato, fuente (wp-media/frontend/backend-html), dimensiones, si necesita conversión.

#### `public-status`
**Propósito**: Servir datos públicos de un proyecto para la página de estado pública (sin autenticación).
**Input**: `{ slug: string }`
**Retorna**: Uptime últimos 90 días, response time últimas 24h, incidentes recientes, info SSL.

#### `test-connection`
**Propósito**: Probar la conexión a un sitio web (usado durante la creación de proyectos).

### Componentes del Frontend

#### Panel Admin (MainLayout)
| Componente | Sección | Descripción |
|---|---|---|
| `Dashboard.tsx` | Dashboard | Stats agregados, gráfico respuesta 7 días, actividad reciente |
| `ProjectsView.tsx` | Proyectos | Lista de proyectos con búsqueda, filtros por plataforma y estado |
| `NewProjectView.tsx` | Nuevo Proyecto | Wizard de 3 pasos para crear proyecto |
| `EditProjectView.tsx` | Editar Proyecto | Edición de proyecto existente |
| `UptimeView.tsx` | Monitoreo > Uptime | Disponibilidad por cliente/proyecto con historial visual |
| `PerformanceView.tsx` | Monitoreo > Performance | Gráficos de tiempo de respuesta, estadísticas, distribución |
| `SiteHealthView.tsx` | Monitoreo > Estado de Salud | Puntaje de salud, SSL, response time, última revisión |
| `SeoPerformanceView.tsx` | Monitoreo > SEO Performance | Google PageSpeed Insights: scores + Core Web Vitals + auditorías |
| `ImageOptimizationView.tsx` | Monitoreo > Imágenes | Escaneo de imágenes PNG/JPG para conversión a WebP |
| `IncidentsView.tsx` | Incidentes | Lista con paginación, filtros, estados |
| `IncidentDetailsView.tsx` | Detalle Incidente | Timeline, cambio de estado, resolución |
| `UpdatesView.tsx` | Actualizaciones | Plugins por proyecto, apply individual/bulk, tabs por estado |
| `ReportsView.tsx` | Informes | Reportes mensuales por cliente |
| `SettingsView.tsx` | Configuración | 6 sub-secciones |

#### Panel Cliente (ClientLayout)
| Componente | Sección | Descripción |
|---|---|---|
| `ClientDashboard.tsx` | Mi Panel | Resumen personal: uptime, incidentes, actividad |
| `ClientProjectsView.tsx` | Mis Sitios | Solo proyectos del cliente autenticado |
| `ClientSupportView.tsx` | Soporte | Tickets con búsqueda, filtros, crear nuevo |
| `ClientSettingsView.tsx` | Configuración | Perfil, notificaciones, contraseña |

#### Otros
| Componente | Descripción |
|---|---|
| `LoginView.tsx` | Pantalla de login con email/password |
| `ForgotPasswordView.tsx` | Recuperación de contraseña |
| `PublicStatusPage.tsx` | Página de estado pública (sin auth) |
| `ClientPreviewSelector.tsx` | Selector para vista previa como cliente (admin only) |

### Flujos Principales

#### Flujo de Monitoreo
```
Cron (cada 3-5 min)
  → monitor-sites Edge Function
    → Para cada proyecto activo:
      → Fetch sitio (timeout 15s)
      → Check WP API (si aplica)
      → Check frontend (si headless)
      → Check keyword
      → Check SSL
      → Si DOWN y antes UP: retry (30s)
      → Registrar uptime_log
      → Actualizar proyecto (status, response_time, uptime_percent)
      → Si confirma DOWN: crear incidente + email
      → Si vuelve UP (estaba DOWN): resolver incidente + email
      → Si SSL ≤ 30 días: alerta email
```

#### Flujo de Autenticación
```
Usuario ingresa email + contraseña
  → Supabase Auth verifica credenciales
  → JWT token emitido
  → Frontend obtiene profile del usuario
  → Si role = 'admin' → MainLayout
  → Si role = 'client' → ClientLayout
  → RLS en PostgreSQL filtra datos según user_id
```

#### Flujo de Gestión de Plugins
```
Admin navega a Actualizaciones
  → Selecciona cliente → proyecto
  → Frontend invoca fetch-plugins Edge Function
  → Edge Function determina plataforma:
    → WP puro: Application Password auth → /wp-json/wp/v2/plugins + themes
    → WooCommerce: Consumer Key/Secret → /wp-json/wc/v3/system_status
    → Shopify: Access Token → /admin/api/themes.json
    → Jumpseller: API token → /v1/apps.json
  → Upsert resultados en project_plugins
  → Frontend muestra lista con versiones actuales vs últimas
```

#### Flujo de Incidentes Automáticos
```
monitor-sites detecta sitio DOWN
  → Retry tras 30s (evita falsos positivos)
  → Si sigue DOWN:
    → Verifica cooldown (no duplicar en 15 min)
    → Crea incident con priority según tipo de fallo
    → Agrega entry en incident_timeline
    → Envía email a admins + owner (via Resend)
  
Cuando monitor-sites detecta sitio UP (estaba DOWN):
  → Busca incidentes abiertos del proyecto
  → Los marca como resueltos
  → Calcula duración total
  → Agrega entry en incident_timeline
  → Envía email de recuperación
```

### Seguridad

- **Row Level Security (RLS)**: Todas las tablas tienen RLS habilitado. Los clientes solo acceden a sus propios datos.
- **Supabase Auth**: Autenticación via email/password con JWT tokens.
- **Service Role Key**: Las Edge Functions usan `SUPABASE_SERVICE_ROLE_KEY` (no expuesto al frontend) para acciones administrativas.
- **Application Passwords**: Las credenciales de WordPress se almacenan en `admin_password_encrypted` (en una fase futura se encriptarán con una clave maestra).
- **Alertas con cooldown**: El sistema evita spam de emails con un cooldown de 24h por tipo de alerta por proyecto.
- **Doble verificación de caídas**: Retry de 30s antes de confirmar una caída, evitando falsas alarmas.

### Variables de Entorno

| Variable | Descripción | Ubicación |
|---|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase | `.env` (frontend) |
| `VITE_SUPABASE_ANON_KEY` | Clave anónima de Supabase | `.env` (frontend) |
| `SUPABASE_URL` | URL de Supabase (auto-inyectada) | Edge Functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio (auto-inyectada) | Edge Functions |
| `RESEND_API_KEY` | API key de Resend para emails | Edge Functions (secret) |

---

## Parte 3: Glosario

| Término | Significado |
|---|---|
| **Uptime** | El porcentaje de tiempo que un sitio web ha estado funcionando correctamente. Un uptime de 99.9% significa que el sitio estuvo caído solo unos pocos minutos al mes. |
| **Downtime** | El tiempo en que un sitio web no está disponible o no funciona. Es lo opuesto al uptime. |
| **SSL / Certificado SSL** | Un "candado de seguridad" digital que protege la comunicación entre el navegador del visitante y el sitio web. Es lo que hace que aparezca el candadito verde en la barra de direcciones y que la URL empiece con "https". |
| **API** | Una "puerta de comunicación" entre dos sistemas. Por ejemplo, WordPress tiene una API que permite a LuminaSupport consultar información sobre plugins sin tener que entrar al panel de administración. |
| **REST API** | Un tipo específico de API que funciona a través de la web, usando las mismas tecnologías que un navegador. |
| **Edge Function** | Un programa pequeño que se ejecuta en los servidores de Supabase (en la "nube"). Es como un trabajador que hace tareas específicas: monitorear sitios, buscar plugins, escanear imágenes, etc. |
| **RLS (Row Level Security)** | Una regla de seguridad en la base de datos que controla quién puede ver qué datos. Gracias a RLS, un cliente solo puede ver sus propios proyectos. |
| **WordPress Headless** | Una configuración donde WordPress se usa solo como "backend" (para administrar contenido), pero el sitio que ven los visitantes se construye con otra tecnología (como Next.js en Vercel). El backend y el frontend están separados. |
| **Plugin** | Un programa adicional que se instala en WordPress para agregar funciones extras (ej: formularios de contacto, tienda online, SEO, etc.). |
| **Tema / Theme** | La "piel" visual de un sitio WordPress. Define cómo se ve el sitio. |
| **WooCommerce** | Un plugin de WordPress que convierte un sitio en una tienda online. |
| **Incidente** | Un evento donde algo salió mal con un sitio web (se cayó, la API no responde, etc.). El sistema los crea y resuelve automáticamente. |
| **Response Time (Tiempo de respuesta)** | Cuántos milisegundos tarda un sitio en responder cuando alguien lo visita. Menos es mejor. Un sitio rápido responde en menos de 500ms. |
| **Keyword Check** | Una verificación que busca una palabra específica en el HTML del sitio para confirmar que el contenido correcto se está mostrando. |
| **WebP** | Un formato de imagen moderno creado por Google que es más liviano que PNG y JPG, haciendo que los sitios carguen más rápido. |
| **Core Web Vitals** | Métricas de Google que miden la experiencia del usuario: qué tan rápido carga el contenido principal (LCP), qué tan rápido responde a interacciones (FID/INP), y qué tan estable es visualmente (CLS). |
| **SEO** | Search Engine Optimization. Técnicas para que un sitio aparezca más arriba en los resultados de Google. |
| **PageSpeed Insights** | Una herramienta gratuita de Google que analiza la velocidad y calidad de un sitio web. |
| **Supabase** | La plataforma que usamos como backend. Provee base de datos PostgreSQL, autenticación de usuarios, funciones en la nube (Edge Functions), y seguridad a nivel de filas (RLS). |
| **Cron** | Un sistema de programación de tareas automáticas. En nuestro caso, ejecuta el monitoreo cada 3-5 minutos. |
| **JWT (JSON Web Token)** | Un "pase de seguridad digital" que el sistema le da a cada usuario cuando inicia sesión. El frontend lo envía con cada solicitud para probar que está autenticado. |
| **Resend** | El servicio que usamos para enviar emails de alerta cuando un sitio se cae o su SSL está por vencer. |
| **Dashboard** | Panel principal o "tablero de mando" que muestra un resumen visual de toda la información importante. |
| **Webhook** | Una notificación automática que un sistema envía a otro cuando algo sucede. |
| **FTP** | Protocolo para transferir archivos a un servidor. Se usa para subir o modificar archivos de un sitio web directamente. |
| **P95 / P99 (Percentiles)** | Métricas estadísticas. P95 significa que el 95% de las solicitudes fueron más rápidas que ese valor. Si P95 es 800ms, solo el 5% de las visitas tardaron más de 800ms. |
| **Vercel** | Una plataforma para desplegar sitios web frontend (como Next.js). En proyectos headless, el frontend suele estar en Vercel. |
| **Cloudflare** | Un servicio que acelera y protege sitios web. Funciona como intermediario entre los visitantes y el servidor, cacheando contenido y bloqueando ataques. |
| **Cooldown** | Un período de espera obligatorio. Por ejemplo, el sistema espera 15 minutos antes de crear otro incidente para el mismo sitio, evitando duplicados. |
| **Retry** | Reintentar. Cuando el sistema detecta que un sitio podría estar caído, espera 30 segundos y vuelve a verificar antes de confirmar la caída. |
| **Application Password** | Una contraseña especial generada por WordPress que permite a aplicaciones externas (como LuminaSupport) conectarse a la API de WordPress de forma segura, sin usar la contraseña real del usuario. |
| **Consumer Key / Consumer Secret** | Credenciales específicas de WooCommerce para acceder a su API REST. Se generan desde WooCommerce > Ajustes > Avanzado > REST API. |
