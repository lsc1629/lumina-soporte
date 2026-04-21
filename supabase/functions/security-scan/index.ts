// supabase/functions/security-scan/index.ts
// Edge Function que realiza un escaneo de seguridad no destructivo en sitios WordPress/WooCommerce.
// Solo ejecuta requests GET — no modifica nada en el sitio.
// Detecta: archivos expuestos, headers de seguridad, reCAPTCHA, enumeración de usuarios,
// plugins de seguridad, protección brute force, directory listing, versiones expuestas, etc.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// ── Helpers ──

async function safeFetch(url: string, timeoutMs = 10000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'LuminaSupport-SecurityScanner/1.0' },
      redirect: 'follow',
    });
    clearTimeout(t);
    return res;
  } catch {
    clearTimeout(t);
    return null;
  }
}

async function checkUrlExists(url: string): Promise<{ exists: boolean; status: number | null; headers: Headers | null; body: string | null }> {
  const res = await safeFetch(url);
  if (!res) return { exists: false, status: null, headers: null, body: null };
  const body = await res.text().catch(() => null);
  return { exists: res.ok, status: res.status, headers: res.headers, body: body?.substring(0, 100000) || null };
}

async function checkDirectoryListing(url: string): Promise<boolean> {
  const res = await checkUrlExists(url);
  if (!res.exists || !res.body) return false;
  // Apache/Nginx directory listing patterns
  return res.body.includes('Index of /') || res.body.includes('<title>Index of') || res.body.includes('Parent Directory');
}

// ── Security Checks ──

async function checkExposedFiles(siteUrl: string): Promise<ScanIssue[]> {
  const issues: ScanIssue[] = [];

  // wp-config.php accessible
  const wpConfig = await checkUrlExists(`${siteUrl}/wp-config.php`);
  if (wpConfig.exists && wpConfig.body && (wpConfig.body.includes('DB_NAME') || wpConfig.body.includes('DB_PASSWORD'))) {
    issues.push({
      id: 'exposed-wp-config',
      category: 'Archivos Expuestos',
      title: 'wp-config.php accesible públicamente',
      description: 'El archivo de configuración de WordPress está accesible desde el navegador, exponiendo credenciales de base de datos y claves secretas.',
      severity: 'critical',
      recommendation: 'Añadir regla en .htaccess o nginx para bloquear acceso a wp-config.php. Mover el archivo un nivel arriba del document root.',
    });
  } else {
    issues.push({
      id: 'exposed-wp-config',
      category: 'Archivos Expuestos',
      title: 'wp-config.php protegido',
      description: 'El archivo de configuración no es accesible públicamente.',
      severity: 'pass',
      recommendation: '',
    });
  }

  // .env file
  const envFile = await checkUrlExists(`${siteUrl}/.env`);
  if (envFile.exists && envFile.body && (envFile.body.includes('DB_') || envFile.body.includes('API_KEY') || envFile.body.includes('SECRET'))) {
    issues.push({
      id: 'exposed-env',
      category: 'Archivos Expuestos',
      title: 'Archivo .env accesible',
      description: 'El archivo .env está expuesto públicamente, puede contener credenciales sensibles.',
      severity: 'critical',
      recommendation: 'Bloquear acceso a archivos .env desde el servidor web. Añadir regla en .htaccess: <FilesMatch "^\\.env"> Deny from all </FilesMatch>',
    });
  }

  // debug.log
  const debugLog = await checkUrlExists(`${siteUrl}/wp-content/debug.log`);
  if (debugLog.exists && debugLog.body && debugLog.body.length > 100) {
    issues.push({
      id: 'exposed-debug-log',
      category: 'Archivos Expuestos',
      title: 'debug.log accesible públicamente',
      description: 'El log de debug de WordPress está expuesto, puede revelar rutas del servidor, errores y datos sensibles.',
      severity: 'high',
      recommendation: 'Eliminar o proteger wp-content/debug.log. Desactivar WP_DEBUG_LOG en producción o redirigir a una ubicación fuera del document root.',
      details: `Tamaño aproximado: ${Math.round((debugLog.body?.length || 0) / 1024)}KB`,
    });
  } else {
    issues.push({
      id: 'exposed-debug-log',
      category: 'Archivos Expuestos',
      title: 'debug.log no accesible',
      description: 'El log de debug no está expuesto públicamente.',
      severity: 'pass',
      recommendation: '',
    });
  }

  // readme.html (reveals WP version)
  const readme = await checkUrlExists(`${siteUrl}/readme.html`);
  if (readme.exists && readme.body?.includes('WordPress')) {
    const versionMatch = readme.body.match(/Version\s+([\d.]+)/i);
    issues.push({
      id: 'exposed-readme',
      category: 'Archivos Expuestos',
      title: 'readme.html revela versión de WordPress',
      description: `El archivo readme.html es accesible y revela información de la instalación.${versionMatch ? ` Versión detectada: ${versionMatch[1]}` : ''}`,
      severity: 'low',
      recommendation: 'Eliminar readme.html del directorio raíz o bloquear su acceso.',
      details: versionMatch ? `WordPress ${versionMatch[1]}` : undefined,
    });
  }

  // license.txt
  const license = await checkUrlExists(`${siteUrl}/license.txt`);
  if (license.exists) {
    issues.push({
      id: 'exposed-license',
      category: 'Archivos Expuestos',
      title: 'license.txt accesible',
      description: 'El archivo license.txt confirma que el sitio usa WordPress.',
      severity: 'info',
      recommendation: 'Eliminar o bloquear acceso a license.txt.',
    });
  }

  return issues;
}

async function checkDirectoryListings(siteUrl: string): Promise<ScanIssue[]> {
  const issues: ScanIssue[] = [];

  const dirs = [
    { path: '/wp-content/uploads/', name: 'Uploads' },
    { path: '/wp-content/plugins/', name: 'Plugins' },
    { path: '/wp-content/themes/', name: 'Themes' },
    { path: '/wp-includes/', name: 'WP Includes' },
  ];

  let anyListing = false;
  const exposedDirs: string[] = [];

  for (const dir of dirs) {
    const hasListing = await checkDirectoryListing(`${siteUrl}${dir.path}`);
    if (hasListing) {
      anyListing = true;
      exposedDirs.push(dir.name);
    }
  }

  if (anyListing) {
    issues.push({
      id: 'directory-listing',
      category: 'Directory Listing',
      title: 'Listado de directorios habilitado',
      description: `Los siguientes directorios permiten listar su contenido: ${exposedDirs.join(', ')}. Un atacante puede ver la estructura interna del sitio.`,
      severity: 'high',
      recommendation: 'Añadir "Options -Indexes" en .htaccess (Apache) o "autoindex off;" en nginx. Verificar que cada directorio tenga un archivo index.php.',
      details: exposedDirs.join(', '),
    });
  } else {
    issues.push({
      id: 'directory-listing',
      category: 'Directory Listing',
      title: 'Listado de directorios deshabilitado',
      description: 'Los directorios sensibles no permiten listar su contenido.',
      severity: 'pass',
      recommendation: '',
    });
  }

  return issues;
}

async function checkXmlRpc(siteUrl: string): Promise<ScanIssue[]> {
  const issues: ScanIssue[] = [];

  const xmlrpc = await checkUrlExists(`${siteUrl}/xmlrpc.php`);
  if (xmlrpc.exists && xmlrpc.body?.includes('XML-RPC server accepts POST requests only')) {
    issues.push({
      id: 'xmlrpc-enabled',
      category: 'Vectores de Ataque',
      title: 'XML-RPC habilitado',
      description: 'xmlrpc.php está activo. Este endpoint es usado para ataques de fuerza bruta amplificados (system.multicall) y DDoS (pingback).',
      severity: 'high',
      recommendation: 'Desactivar XML-RPC si no se usa (plugins como "Disable XML-RPC"). Si es necesario para Jetpack o la app móvil de WP, limitar con firewall o plugin de seguridad.',
    });
  } else {
    issues.push({
      id: 'xmlrpc-enabled',
      category: 'Vectores de Ataque',
      title: 'XML-RPC no accesible',
      description: 'xmlrpc.php no responde o está bloqueado.',
      severity: 'pass',
      recommendation: '',
    });
  }

  return issues;
}

async function checkUserEnumeration(siteUrl: string): Promise<ScanIssue[]> {
  const issues: ScanIssue[] = [];

  // Method 1: REST API
  const restUsers = await checkUrlExists(`${siteUrl}/wp-json/wp/v2/users`);
  let usersExposed = false;
  let usernames: string[] = [];

  if (restUsers.exists && restUsers.body) {
    try {
      const users = JSON.parse(restUsers.body);
      if (Array.isArray(users) && users.length > 0) {
        usersExposed = true;
        usernames = users.map((u: any) => u.slug || u.name).filter(Boolean).slice(0, 5);
      }
    } catch { /* not JSON */ }
  }

  // Method 2: Author enumeration (?author=1)
  if (!usersExposed) {
    const authorEnum = await safeFetch(`${siteUrl}/?author=1`);
    if (authorEnum) {
      const finalUrl = authorEnum.url;
      if (finalUrl.includes('/author/')) {
        usersExposed = true;
        const match = finalUrl.match(/\/author\/([^/]+)/);
        if (match) usernames = [match[1]];
      }
    }
  }

  if (usersExposed) {
    issues.push({
      id: 'user-enumeration',
      category: 'Enumeración de Usuarios',
      title: 'Nombres de usuario expuestos',
      description: `Se pueden obtener nombres de usuario del sitio${usernames.length > 0 ? `. Usuarios detectados: ${usernames.join(', ')}` : ''}. Esto facilita ataques de fuerza bruta.`,
      severity: 'high',
      recommendation: 'Desactivar la REST API de usuarios para usuarios no autenticados (plugin "Disable REST API" o filtro rest_authentication_errors). Bloquear enumeración por ?author=N.',
      details: usernames.length > 0 ? `Usuarios: ${usernames.join(', ')}` : undefined,
    });
  } else {
    issues.push({
      id: 'user-enumeration',
      category: 'Enumeración de Usuarios',
      title: 'Enumeración de usuarios protegida',
      description: 'No se pudieron enumerar usuarios del sitio.',
      severity: 'pass',
      recommendation: '',
    });
  }

  return issues;
}

async function checkSecurityHeaders(siteUrl: string): Promise<ScanIssue[]> {
  const issues: ScanIssue[] = [];
  const res = await safeFetch(siteUrl);
  if (!res) return issues;

  const headers = res.headers;
  const checks: { header: string; id: string; title: string; description: string; severity: Severity; recommendation: string }[] = [
    {
      header: 'x-frame-options',
      id: 'header-xfo',
      title: 'X-Frame-Options',
      description: 'Protege contra ataques de clickjacking impidiendo que el sitio se cargue en iframes.',
      severity: 'medium',
      recommendation: 'Añadir header: X-Frame-Options: SAMEORIGIN',
    },
    {
      header: 'x-content-type-options',
      id: 'header-xcto',
      title: 'X-Content-Type-Options',
      description: 'Previene que el navegador interprete archivos con un MIME type diferente al declarado (MIME sniffing).',
      severity: 'medium',
      recommendation: 'Añadir header: X-Content-Type-Options: nosniff',
    },
    {
      header: 'strict-transport-security',
      id: 'header-hsts',
      title: 'Strict-Transport-Security (HSTS)',
      description: 'Fuerza al navegador a usar siempre HTTPS, previniendo ataques de downgrade y man-in-the-middle.',
      severity: 'high',
      recommendation: 'Añadir header: Strict-Transport-Security: max-age=31536000; includeSubDomains',
    },
    {
      header: 'content-security-policy',
      id: 'header-csp',
      title: 'Content-Security-Policy',
      description: 'Define qué recursos puede cargar el navegador, mitigando ataques XSS e inyección de datos.',
      severity: 'medium',
      recommendation: 'Configurar una política CSP apropiada para el sitio. Empezar con Content-Security-Policy-Report-Only para testing.',
    },
    {
      header: 'referrer-policy',
      id: 'header-rp',
      title: 'Referrer-Policy',
      description: 'Controla qué información del referrer se envía en las peticiones.',
      severity: 'low',
      recommendation: 'Añadir header: Referrer-Policy: strict-origin-when-cross-origin',
    },
    {
      header: 'permissions-policy',
      id: 'header-pp',
      title: 'Permissions-Policy',
      description: 'Controla qué APIs del navegador puede usar el sitio (geolocation, camera, microphone, etc.).',
      severity: 'low',
      recommendation: 'Añadir header: Permissions-Policy: geolocation=(), camera=(), microphone=()',
    },
  ];

  for (const check of checks) {
    const value = headers.get(check.header);
    if (value) {
      issues.push({
        id: check.id,
        category: 'Headers de Seguridad',
        title: `${check.title}: Presente`,
        description: `Header configurado correctamente.`,
        severity: 'pass',
        recommendation: '',
        details: value,
      });
    } else {
      issues.push({
        id: check.id,
        category: 'Headers de Seguridad',
        title: `${check.title}: Ausente`,
        description: check.description,
        severity: check.severity,
        recommendation: check.recommendation,
      });
    }
  }

  // Check if server version is exposed
  const server = headers.get('server');
  const xPoweredBy = headers.get('x-powered-by');
  if (server && (server.toLowerCase().includes('apache/') || server.toLowerCase().includes('nginx/'))) {
    issues.push({
      id: 'server-version-exposed',
      category: 'Headers de Seguridad',
      title: 'Versión del servidor expuesta',
      description: `El header Server revela: "${server}". Esto facilita ataques dirigidos a versiones con vulnerabilidades conocidas.`,
      severity: 'low',
      recommendation: 'Configurar el servidor para no exponer la versión. Apache: ServerTokens Prod. Nginx: server_tokens off.',
      details: server,
    });
  }
  if (xPoweredBy) {
    issues.push({
      id: 'x-powered-by-exposed',
      category: 'Headers de Seguridad',
      title: 'X-Powered-By expuesto',
      description: `El header X-Powered-By revela: "${xPoweredBy}".`,
      severity: 'low',
      recommendation: 'Eliminar el header X-Powered-By en la configuración del servidor o PHP (expose_php = Off en php.ini).',
      details: xPoweredBy,
    });
  }

  return issues;
}

async function checkRecaptchaAndSpam(siteUrl: string): Promise<ScanIssue[]> {
  const issues: ScanIssue[] = [];

  // Check login page for reCAPTCHA / anti-bot
  const loginPage = await checkUrlExists(`${siteUrl}/wp-login.php`);
  if (loginPage.exists && loginPage.body) {
    const body = loginPage.body.toLowerCase();
    const hasRecaptcha = body.includes('recaptcha') || body.includes('hcaptcha') || body.includes('turnstile') || body.includes('captcha');
    const hasLimitLogin = body.includes('limit-login') || body.includes('login-lockdown') || body.includes('wordfence');

    if (!hasRecaptcha && !hasLimitLogin) {
      issues.push({
        id: 'login-no-captcha',
        category: 'Protección Anti-Spam',
        title: 'Login sin protección CAPTCHA',
        description: 'La página de login no tiene reCAPTCHA, hCaptcha ni ninguna protección anti-bot visible. Vulnerable a ataques de fuerza bruta automatizados.',
        severity: 'high',
        recommendation: 'Instalar un plugin de reCAPTCHA/hCaptcha para el login (ej: WP reCaptcha Integration, hCaptcha for WordPress). También considerar Limit Login Attempts.',
      });
    } else {
      issues.push({
        id: 'login-no-captcha',
        category: 'Protección Anti-Spam',
        title: 'Login tiene protección anti-bot',
        description: `Se detectó protección en la página de login.${hasRecaptcha ? ' CAPTCHA detectado.' : ''}${hasLimitLogin ? ' Plugin de limitación detectado.' : ''}`,
        severity: 'pass',
        recommendation: '',
      });
    }
  }

  // Check homepage for contact forms with captcha
  const homepage = await checkUrlExists(siteUrl);
  if (homepage.exists && homepage.body) {
    const body = homepage.body.toLowerCase();

    // Detect forms
    const hasContactForm = body.includes('wpcf7') || body.includes('contact-form') || body.includes('wpforms') || body.includes('gravityforms') || body.includes('formidable');
    const hasRecaptchaGlobal = body.includes('recaptcha') || body.includes('hcaptcha') || body.includes('turnstile');

    if (hasContactForm && !hasRecaptchaGlobal) {
      issues.push({
        id: 'forms-no-captcha',
        category: 'Protección Anti-Spam',
        title: 'Formularios sin protección CAPTCHA',
        description: 'Se detectaron formularios de contacto en el sitio pero no se encontró reCAPTCHA, hCaptcha ni Turnstile. Los formularios son vulnerables a spam automatizado.',
        severity: 'medium',
        recommendation: 'Activar reCAPTCHA v3 o hCaptcha en todos los formularios del sitio. La mayoría de plugins de formularios tienen integración nativa.',
      });
    } else if (hasContactForm && hasRecaptchaGlobal) {
      issues.push({
        id: 'forms-no-captcha',
        category: 'Protección Anti-Spam',
        title: 'Formularios protegidos con CAPTCHA',
        description: 'Se detectaron formularios y protección CAPTCHA en el sitio.',
        severity: 'pass',
        recommendation: '',
      });
    }

    // Detect WP version in meta generator
    const generatorMatch = body.match(/content="wordpress\s+([\d.]+)"/i);
    if (generatorMatch) {
      issues.push({
        id: 'wp-version-exposed',
        category: 'Información Expuesta',
        title: 'Versión de WordPress visible en código fuente',
        description: `La meta tag generator revela WordPress ${generatorMatch[1]}. Los atacantes pueden buscar vulnerabilidades específicas de esta versión.`,
        severity: 'medium',
        recommendation: 'Eliminar la meta tag generator añadiendo en functions.php: remove_action("wp_head", "wp_generator"); O usar un plugin de seguridad que lo oculte.',
        details: `WordPress ${generatorMatch[1]}`,
      });
    } else {
      issues.push({
        id: 'wp-version-exposed',
        category: 'Información Expuesta',
        title: 'Versión de WordPress no visible en meta tags',
        description: 'No se encontró la meta tag generator con la versión de WordPress.',
        severity: 'pass',
        recommendation: '',
      });
    }
  }

  // Check WooCommerce checkout page for captcha
  for (const path of ['/checkout/', '/cart/', '/my-account/']) {
    const page = await checkUrlExists(`${siteUrl}${path}`);
    if (page.exists && page.body) {
      const body = page.body.toLowerCase();
      const isWooPage = body.includes('woocommerce') || body.includes('wc-') || body.includes('checkout');
      if (isWooPage && path === '/my-account/') {
        const hasAuthCaptcha = body.includes('recaptcha') || body.includes('hcaptcha') || body.includes('turnstile');
        if (!hasAuthCaptcha) {
          issues.push({
            id: 'woo-account-no-captcha',
            category: 'Protección Anti-Spam',
            title: 'WooCommerce My Account sin CAPTCHA',
            description: 'La página de login/registro de WooCommerce no tiene protección CAPTCHA, permitiendo registro de cuentas falsas y spam.',
            severity: 'medium',
            recommendation: 'Instalar reCAPTCHA en la página My Account de WooCommerce para proteger login y registro.',
          });
        }
      }
      break; // Found WooCommerce, no need to check more
    }
  }

  // Check if comments are open without protection
  const commentsCheck = await checkUrlExists(`${siteUrl}/wp-comments-post.php`);
  if (commentsCheck.status === 405 || (commentsCheck.exists && commentsCheck.body?.includes('comment'))) {
    // Comments endpoint exists — check if Akismet or antispam is loaded
    const homebody = homepage?.body?.toLowerCase() || '';
    const hasAkismet = homebody.includes('akismet');
    if (!hasAkismet) {
      issues.push({
        id: 'comments-no-antispam',
        category: 'Protección Anti-Spam',
        title: 'Comentarios sin protección anti-spam visible',
        description: 'No se detectó Akismet u otra solución anti-spam en los comentarios. Si los comentarios están habilitados, podrían recibir spam masivo.',
        severity: 'low',
        recommendation: 'Activar Akismet (viene preinstalado) o usar Antispam Bee. Si no se usan comentarios, desactivarlos en Ajustes > Comentarios.',
      });
    }
  }

  return issues;
}

async function checkWpAdmin(siteUrl: string): Promise<ScanIssue[]> {
  const issues: ScanIssue[] = [];

  // Check if wp-admin redirects to login (expected) or is accessible
  const wpAdmin = await safeFetch(`${siteUrl}/wp-admin/`);
  if (wpAdmin) {
    const finalUrl = wpAdmin.url;
    const isRedirectToLogin = finalUrl.includes('wp-login.php');

    if (isRedirectToLogin) {
      issues.push({
        id: 'wp-admin-access',
        category: 'Acceso Admin',
        title: 'wp-admin redirige al login',
        description: 'El acceso a /wp-admin/ redirige correctamente al login.',
        severity: 'pass',
        recommendation: '',
      });
    }

    // Check if login URL is the default
    const loginCheck = await checkUrlExists(`${siteUrl}/wp-login.php`);
    if (loginCheck.exists) {
      issues.push({
        id: 'default-login-url',
        category: 'Acceso Admin',
        title: 'URL de login por defecto',
        description: '/wp-login.php es accesible en la URL estándar. Los bots y atacantes conocen esta ruta y la escanean automáticamente.',
        severity: 'medium',
        recommendation: 'Cambiar la URL de login con un plugin como WPS Hide Login o iThemes Security. Esto reduce drásticamente los intentos de fuerza bruta.',
      });
    }
  }

  return issues;
}

async function checkSecurityPlugins(siteUrl: string): Promise<ScanIssue[]> {
  const issues: ScanIssue[] = [];

  const homepage = await checkUrlExists(siteUrl);
  const body = (homepage.body || '').toLowerCase();

  const securityPlugins = [
    { keyword: 'wordfence', name: 'Wordfence' },
    { keyword: 'sucuri', name: 'Sucuri' },
    { keyword: 'ithemes-security', name: 'iThemes Security' },
    { keyword: 'all-in-one-wp-security', name: 'All In One WP Security' },
    { keyword: 'jetpack', name: 'Jetpack (protección básica)' },
    { keyword: 'wp-cerber', name: 'WP Cerber' },
    { keyword: 'bulletproof', name: 'BulletProof Security' },
    { keyword: 'shield-security', name: 'Shield Security' },
  ];

  const detected: string[] = [];
  for (const plugin of securityPlugins) {
    if (body.includes(plugin.keyword)) {
      detected.push(plugin.name);
    }
  }

  // Also check for security plugin paths
  for (const plugin of ['wordfence', 'sucuri-scanner', 'better-wp-security', 'all-in-one-wp-security-and-firewall']) {
    const pluginCheck = await safeFetch(`${siteUrl}/wp-content/plugins/${plugin}/readme.txt`);
    if (pluginCheck && pluginCheck.ok) {
      const name = securityPlugins.find(p => plugin.includes(p.keyword))?.name || plugin;
      if (!detected.includes(name)) detected.push(name);
    }
  }

  if (detected.length > 0) {
    issues.push({
      id: 'security-plugins',
      category: 'Plugins de Seguridad',
      title: `Plugin de seguridad detectado: ${detected.join(', ')}`,
      description: `Se detectaron los siguientes plugins de seguridad activos en el sitio.`,
      severity: 'pass',
      recommendation: '',
      details: detected.join(', '),
    });
  } else {
    issues.push({
      id: 'security-plugins',
      category: 'Plugins de Seguridad',
      title: 'Sin plugin de seguridad detectado',
      description: 'No se detectó ningún plugin de seguridad reconocido. El sitio podría carecer de firewall WAF, protección contra brute force, y monitoreo de malware.',
      severity: 'high',
      recommendation: 'Instalar un plugin de seguridad como Wordfence (gratuito) o Sucuri. Proporciona firewall, escaneo de malware, y protección contra fuerza bruta.',
    });
  }

  return issues;
}

async function checkHttpsRedirect(siteUrl: string): Promise<ScanIssue[]> {
  const issues: ScanIssue[] = [];

  if (siteUrl.startsWith('https://')) {
    const httpUrl = siteUrl.replace('https://', 'http://');
    const httpRes = await safeFetch(httpUrl);
    if (httpRes) {
      const redirectsToHttps = httpRes.url.startsWith('https://') || httpRes.redirected;
      if (redirectsToHttps) {
        issues.push({
          id: 'https-redirect',
          category: 'SSL/TLS',
          title: 'Redirección HTTP → HTTPS activa',
          description: 'El sitio redirige correctamente de HTTP a HTTPS.',
          severity: 'pass',
          recommendation: '',
        });
      } else {
        issues.push({
          id: 'https-redirect',
          category: 'SSL/TLS',
          title: 'Sin redirección HTTP → HTTPS',
          description: 'El sitio no redirige automáticamente de HTTP a HTTPS. Los usuarios podrían acceder por HTTP sin cifrar.',
          severity: 'high',
          recommendation: 'Configurar redirección 301 de HTTP a HTTPS en .htaccess o en la configuración del servidor/CDN.',
        });
      }
    }
  }

  return issues;
}

async function checkWpCron(siteUrl: string): Promise<ScanIssue[]> {
  const issues: ScanIssue[] = [];

  const cron = await checkUrlExists(`${siteUrl}/wp-cron.php`);
  if (cron.exists) {
    issues.push({
      id: 'wp-cron-exposed',
      category: 'Vectores de Ataque',
      title: 'wp-cron.php accesible públicamente',
      description: 'wp-cron.php es accesible y puede ser abusado para DDoS o para forzar ejecución de tareas programadas.',
      severity: 'low',
      recommendation: 'Desactivar wp-cron.php público y usar un cron real del servidor. Añadir en wp-config.php: define("DISABLE_WP_CRON", true); y configurar un cron job del sistema.',
    });
  }

  return issues;
}

// ── Calculate Score ──

function calculateScore(issues: ScanIssue[]): number {
  let score = 100;
  const penalties: Record<Severity, number> = {
    critical: 20,
    high: 12,
    medium: 6,
    low: 2,
    info: 0,
    pass: 0,
  };

  for (const issue of issues) {
    score -= penalties[issue.severity] || 0;
  }

  return Math.max(0, Math.min(100, score));
}

// ── Main Handler ──

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { projectId } = await req.json();
    if (!projectId) throw new Error('projectId is required');

    // Fetch project
    const { data: project, error: projErr } = await sb
      .from('projects')
      .select('id, name, url, platform, owner_id')
      .eq('id', projectId)
      .single();

    if (projErr || !project) throw new Error('Proyecto no encontrado');

    const siteUrl = project.url.startsWith('http') ? project.url : `https://${project.url}`;
    const cleanUrl = siteUrl.replace(/\/+$/, '');

    // Run all checks in parallel where possible
    const [
      exposedFiles,
      directoryListings,
      xmlRpc,
      userEnum,
      secHeaders,
      recaptchaSpam,
      wpAdmin,
      secPlugins,
      httpsRedirect,
      wpCron,
    ] = await Promise.all([
      checkExposedFiles(cleanUrl),
      checkDirectoryListings(cleanUrl),
      checkXmlRpc(cleanUrl),
      checkUserEnumeration(cleanUrl),
      checkSecurityHeaders(cleanUrl),
      checkRecaptchaAndSpam(cleanUrl),
      checkWpAdmin(cleanUrl),
      checkSecurityPlugins(cleanUrl),
      checkHttpsRedirect(cleanUrl),
      checkWpCron(cleanUrl),
    ]);

    const allIssues: ScanIssue[] = [
      ...exposedFiles,
      ...directoryListings,
      ...xmlRpc,
      ...userEnum,
      ...secHeaders,
      ...recaptchaSpam,
      ...wpAdmin,
      ...secPlugins,
      ...httpsRedirect,
      ...wpCron,
    ];

    const summary = {
      critical: allIssues.filter(i => i.severity === 'critical').length,
      high: allIssues.filter(i => i.severity === 'high').length,
      medium: allIssues.filter(i => i.severity === 'medium').length,
      low: allIssues.filter(i => i.severity === 'low').length,
      info: allIssues.filter(i => i.severity === 'info').length,
      pass: allIssues.filter(i => i.severity === 'pass').length,
      total: allIssues.length,
    };

    const score = calculateScore(allIssues);

    const result: ScanResult = {
      projectId: project.id,
      projectName: project.name,
      url: cleanUrl,
      scannedAt: new Date().toISOString(),
      score,
      issues: allIssues,
      summary,
    };

    // Save to database
    await sb.from('security_scans').insert({
      project_id: project.id,
      score,
      issues_count: summary.total - summary.pass,
      critical_count: summary.critical,
      high_count: summary.high,
      medium_count: summary.medium,
      results: result,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
