// supabase/functions/monitor-sites/index.ts
// Edge Function que monitorea la disponibilidad de todos los sitios activos.
// Diseñada para ejecutarse via cron cada 3-5 minutos.
// Detecta caídas de: WordPress REST API, WooCommerce, Next.js frontend, sitios genéricos.
// Crea incidentes automáticos cuando un sitio cae y los resuelve cuando vuelve.
//
// Fase 1 — Mejoras:
// - Retry: Si un check falla, espera 30s y reintenta. Solo marca DOWN si 2 checks consecutivos fallan.
// - Cooldown: No crea un nuevo incidente si ya existe uno abierto para el mismo proyecto en los últimos 15 min.
// - Preparado para intervalo configurable por proyecto (fase futura).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decrypt } from '../_shared/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Project {
  id: string;
  name: string;
  url: string;
  platform: string;
  status: string;
  admin_url: string;
  admin_user: string;
  admin_password_encrypted: string;
  wp_app_user: string;
  wp_app_password_encrypted: string;
  site_token: string;
  frontend_url: string;
  frontend_healthcheck: string;
  owner_id: string;
}

interface CheckResult {
  reachable: boolean;
  statusCode: number | null;
  responseTimeMs: number;
  sslValid: boolean;
  sslExpiry: string | null;
  error: string | null;
  // WP/Woo specific
  wpApiOk: boolean;
  wpName: string | null;
  wooOk: boolean;
  // Shopify specific
  shopifyApiOk: boolean;
  shopifyName: string | null;
  // Frontend specific
  frontendOk: boolean;
  frontendError: string | null;
}

// ── Fetch with timeout ──
async function safeFetch(url: string, timeoutMs = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'LuminaSupport-Monitor/1.0' },
      redirect: 'follow',
    });
    clearTimeout(t);
    return res;
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

// ── SSL certificate expiry check ──
async function checkSslExpiry(hostname: string): Promise<{ valid: boolean; expiry: string | null; daysLeft: number | null }> {
  // Deno Edge Functions can't access raw TLS info, so we use a public API
  try {
    const cleanHost = hostname.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:.*$/, '');
    const res = await safeFetch(`https://ssl-checker.io/api/v1/check/${cleanHost}`, 10000);
    if (res.ok) {
      const data = await res.json() as Record<string, any>;
      if (data.result === 'success' || data.valid) {
        const expiry = data.valid_till || data.expires || null;
        let daysLeft: number | null = null;
        if (expiry) {
          daysLeft = Math.floor((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        }
        return { valid: true, expiry, daysLeft };
      }
    }
  } catch { /* fallback below */ }

  // Fallback: try another endpoint
  try {
    const cleanHost = hostname.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:.*$/, '');
    const res = await safeFetch(`https://networkcalc.com/api/dns/lookup/${cleanHost}`, 8000);
    if (res.ok) {
      // Basic check — at least the domain resolves
      return { valid: true, expiry: null, daysLeft: null };
    }
  } catch { /* ignore */ }

  return { valid: false, expiry: null, daysLeft: null };
}

// ── Check a single project ──
async function checkProject(project: Project): Promise<CheckResult> {
  const result: CheckResult = {
    reachable: false,
    statusCode: null,
    responseTimeMs: 0,
    sslValid: false,
    sslExpiry: null,
    error: null,
    wpApiOk: false,
    wpName: null,
    wooOk: false,
    shopifyApiOk: false,
    shopifyName: null,
    frontendOk: false,
    frontendError: null,
  };

  const siteUrl = project.url.startsWith('http') ? project.url : `https://${project.url}`;

  // 1. Basic reachability + capture HTML body for keyword check
  try {
    const start = Date.now();
    const res = await safeFetch(siteUrl);
    result.responseTimeMs = Date.now() - start;
    result.statusCode = res.status;
    result.reachable = res.ok;
    result.sslValid = siteUrl.startsWith('https');

  } catch (e) {
    result.error = e instanceof Error ? e.message : 'Connection failed';
    return result;
  }

  // 2. SSL certificate expiry check
  if (siteUrl.startsWith('https')) {
    const ssl = await checkSslExpiry(siteUrl);
    result.sslValid = ssl.valid;
    result.sslExpiry = ssl.expiry;
  }

  // 4. Shopify Admin API check
  const isShopify = project.platform === 'shopify';
  if (isShopify && project.admin_url?.trim()) {
    try {
      const domain = project.admin_url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
      const ver = project.frontend_healthcheck ? '2024-01' : '2024-01'; // default version
      const res = await safeFetch(`https://${domain}/admin/api/${ver}/shop.json`, 10000);
      if (res.ok) {
        const data = await res.json() as Record<string, any>;
        result.shopifyApiOk = true;
        result.shopifyName = data.shop?.name || null;
      }
    } catch { /* Shopify API not available */ }
  }

  // 5. WordPress / WooCommerce REST API check
  const isWp = ['wordpress', 'woocommerce', 'wordpress-headless', 'woo-headless', 'headless'].includes(project.platform);
  const isWooCredentials = isWp && project.admin_user?.startsWith('ck_');
  const hasAgent = isWp && (!!project.site_token || (!!project.wp_app_user && !!project.wp_app_password_encrypted));

  if (isWp && hasAgent) {
    // ── Lumina Agent: prefer site_token (v3), fallback to Basic Auth (v2 legacy) ──
    let agentBase = (project.admin_url || project.url || '').replace(/\/wp-admin\/?$/, '').replace(/\/+$/, '');
    if (!agentBase.startsWith('http')) agentBase = `https://${agentBase}`;
    try {
      const agentHeaders: Record<string, string> = { 'Accept': 'application/json' };
      if (project.site_token) {
        agentHeaders['X-Lumina-Token'] = project.site_token;
      } else {
        let decPass = project.wp_app_password_encrypted;
        try { decPass = await decrypt(decPass); } catch { /* use raw */ }
        const enc = new TextEncoder();
        const raw = enc.encode(`${project.wp_app_user}:${decPass}`);
        let b64 = '';
        for (const byte of raw) b64 += String.fromCharCode(byte);
        b64 = btoa(b64);
        agentHeaders['Authorization'] = `Basic ${b64}`;
      }
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const agentRes = await fetch(`${agentBase}/wp-json/lumina/v1/status`, {
        headers: agentHeaders,
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (agentRes.ok) {
        const agentData = await agentRes.json() as Record<string, any>;
        result.wpApiOk = true;
        result.wpName = agentData.site_url || null;
        result.wooOk = !!agentData.woocommerce;
      }
    } catch { /* agent check failed */ }

    // Fallback: /wp-json root if agent didn't respond
    if (!result.wpApiOk) {
      try {
        const rootRes = await safeFetch(`${agentBase}/wp-json`, 10000);
        const ct = rootRes.headers.get('content-type') || '';
        if (rootRes.ok && ct.includes('application/json')) {
          const rootData = await rootRes.json() as Record<string, any>;
          result.wpApiOk = true;
          result.wpName = rootData.name || null;
        }
      } catch { /* fallback optional */ }
    }
  } else if (isWp && isWooCredentials) {
    // ── WooCommerce LEGACY: validate using WC REST API with Consumer Key/Secret ──
    let wcBase = (project.admin_url || project.url || '').replace(/\/wp-admin\/?$/, '').replace(/\/+$/, '');
    if (!wcBase.startsWith('http')) wcBase = `https://${wcBase}`;
    try {
      const ck = project.admin_user;
      const cs = project.admin_password_encrypted;
      const wcRes = await safeFetch(
        `${wcBase}/wp-json/wc/v3/system_status?consumer_key=${encodeURIComponent(ck)}&consumer_secret=${encodeURIComponent(cs)}`,
        10000
      );
      if (wcRes.ok) {
        result.wpApiOk = true;
        result.wooOk = true;
        try {
          const wcData = await wcRes.json() as Record<string, any>;
          result.wpName = wcData.environment?.site_url || null;
        } catch { /* json parse optional */ }
      }
    } catch { /* WC API check failed */ }

    // Fallback: also check /wp-json root (unauthenticated) for site name
    if (!result.wpApiOk) {
      try {
        const rootRes = await safeFetch(`${wcBase}/wp-json`, 10000);
        const ct = rootRes.headers.get('content-type') || '';
        if (rootRes.ok && ct.includes('application/json')) {
          const rootData = await rootRes.json() as Record<string, any>;
          result.wpApiOk = true;
          result.wpName = rootData.name || null;
          const hasWc = rootData.namespaces?.some((ns: string) => ns.startsWith('wc/'));
          result.wooOk = !!hasWc;
        }
      } catch { /* fallback optional */ }
    }
  } else if (isWp) {
    // ── WordPress puro: check /wp-json (public endpoint) ──
    const apiCandidates: string[] = [];
    if (project.admin_url?.trim()) {
      const base = project.admin_url.replace(/\/$/, '');
      const normalized = base.startsWith('http') ? base : `https://${base}`;
      if (normalized.endsWith('/wp-json') || normalized.includes('rest_route')) {
        apiCandidates.push(normalized);
      } else {
        apiCandidates.push(`${normalized}/wp-json`);
      }
    }
    apiCandidates.push(`${siteUrl}/wp-json`);

    for (const apiUrl of apiCandidates) {
      try {
        const res = await safeFetch(apiUrl, 10000);
        const ct = res.headers.get('content-type') || '';
        if (res.ok && ct.includes('application/json')) {
          const data = await res.json() as Record<string, any>;
          result.wpApiOk = true;
          result.wpName = data.name || null;
          break;
        }
      } catch { /* try next */ }
    }
  }

  // 6. Frontend check (headless architectures — including Shopify Headless)
  const isHeadless = ['wordpress-headless', 'woo-headless', 'headless'].includes(project.platform) || (isShopify && !!project.frontend_url?.trim());
  if (isHeadless && project.frontend_url?.trim()) {
    const frontUrl = project.frontend_url.startsWith('http') ? project.frontend_url : `https://${project.frontend_url}`;
    try {
      if (project.frontend_healthcheck?.trim()) {
        const hcUrl = project.frontend_healthcheck.startsWith('http') ? project.frontend_healthcheck : `https://${project.frontend_healthcheck}`;
        const hcRes = await safeFetch(hcUrl, 8000);
        result.frontendOk = hcRes.ok;
        if (!hcRes.ok) result.frontendError = `Healthcheck HTTP ${hcRes.status}`;
      } else {
        const fRes = await safeFetch(frontUrl, 10000);
        result.frontendOk = fRes.ok;
        if (!fRes.ok) result.frontendError = `Frontend HTTP ${fRes.status}`;
      }
    } catch (e) {
      result.frontendOk = false;
      result.frontendError = e instanceof Error ? e.message : 'Frontend unreachable';
    }
  } else if (!isHeadless) {
    result.frontendOk = result.reachable;
  } else {
    result.frontendOk = true;
  }

  return result;
}

// ── Determine new status from check result ──
function determineStatus(project: Project, result: CheckResult): { status: 'up' | 'down' | 'warning'; reason: string | null } {
  if (!result.reachable) return { status: 'down', reason: result.error || `HTTP ${result.statusCode} — sitio no alcanzable` };

  if (!result.frontendOk) return { status: 'down', reason: `Frontend no respondió correctamente (HTTP ${result.statusCode})` };

  // Shopify Admin API failure is a warning
  if (project.platform === 'shopify' && project.admin_url?.trim() && !result.shopifyApiOk) return { status: 'warning', reason: 'Shopify Admin API no responde' };

  // WP API failure is a warning, NOT down — the site itself is reachable
  const isWp = ['wordpress', 'woocommerce', 'wordpress-headless', 'woo-headless', 'headless'].includes(project.platform);
  if (isWp && !result.wpApiOk) return { status: 'warning', reason: 'WP REST API no responde — el sitio está activo pero la API de WordPress falla' };

  // Slow response = warning
  if (result.responseTimeMs > 5000) return { status: 'warning', reason: `Respuesta lenta (${Math.round(result.responseTimeMs)}ms) — superior a 5 segundos` };

  // WooCommerce expected but not found
  if (['woocommerce', 'woo-headless'].includes(project.platform) && !result.wooOk) return { status: 'warning', reason: 'WooCommerce no detectado — el sitio funciona pero WooCommerce no responde' };

  return { status: 'up', reason: null };
}

// ── Build incident title based on what failed ──
function buildIncidentTitle(project: Project, result: CheckResult): string {
  if (!result.reachable) {
    return `Sitio caído — ${project.name} (${result.error || `HTTP ${result.statusCode}`})`;
  }

  if (project.platform === 'shopify' && !result.shopifyApiOk && project.admin_url?.trim()) {
    return `Shopify Admin API no responde — ${project.name}`;
  }

  const isWp = ['wordpress', 'woocommerce', 'wordpress-headless', 'woo-headless', 'headless'].includes(project.platform);
  if (isWp && !result.wpApiOk) {
    return `WordPress REST API no responde — ${project.name}`;
  }

  if (!result.frontendOk) {
    return `Frontend caído — ${project.name} (${result.frontendError || 'no responde'})`;
  }

  return `Problema detectado — ${project.name}`;
}

function buildIncidentDescription(project: Project, result: CheckResult): string {
  const lines: string[] = [];
  lines.push(`Proyecto: ${project.name}`);
  lines.push(`URL: ${project.url}`);
  lines.push(`Plataforma: ${project.platform}`);
  lines.push(`---`);

  if (!result.reachable) {
    lines.push(`Estado: Sitio no alcanzable`);
    lines.push(`Error: ${result.error || 'Sin respuesta'}`);
  } else {
    lines.push(`HTTP Status: ${result.statusCode}`);
    lines.push(`Response Time: ${result.responseTimeMs}ms`);
  }

  if (project.platform === 'shopify') {
    lines.push(`Shopify Admin API: ${result.shopifyApiOk ? `✓ OK${result.shopifyName ? ` (${result.shopifyName})` : ''}` : '✗ No disponible'}`);
  }

  if (['wordpress', 'woocommerce', 'wordpress-headless', 'woo-headless', 'headless'].includes(project.platform)) {
    lines.push(`WP REST API: ${result.wpApiOk ? '✓ OK' : '✗ No disponible'}`);
  }

  if (['woocommerce', 'woo-headless'].includes(project.platform)) {
    lines.push(`WooCommerce API: ${result.wooOk ? '✓ OK' : '✗ No detectada'}`);
  }

  if (project.frontend_url) {
    lines.push(`Frontend: ${result.frontendOk ? '✓ OK' : `✗ ${result.frontendError || 'No disponible'}`}`);
  }

  if (result.sslExpiry) {
    lines.push(`SSL Expiry: ${result.sslExpiry}`);
  }

  lines.push(`---`);
  lines.push(`Detectado automáticamente por LuminaSupport Monitor`);
  lines.push(`Fecha: ${new Date().toISOString()}`);

  return lines.join('\n');
}

// ── Send email alert via Resend API ──
async function sendAlertEmail(
  sb: any,
  to: string,
  subject: string,
  body: string,
  projectId: string,
  alertType: string,
): Promise<boolean> {
  // Check if we already sent this alert type for this project in the last 24h
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await sb
    .from('alert_log')
    .select('id')
    .eq('project_id', projectId)
    .eq('alert_type', alertType)
    .gte('sent_at', cutoff)
    .limit(1);

  if (existing && existing.length > 0) return false; // Already sent

  // Send email via Resend API
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  let emailSent = false;

  if (resendApiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'LuminaSupport <onboarding@resend.dev>',
          to: [to],
          subject,
          text: body,
        }),
      });

      if (res.ok) {
        emailSent = true;
      } else {
        const errData = await res.text();
        console.error(`Resend API error (${res.status}):`, errData);
      }
    } catch (e) {
      console.error('Resend fetch error:', e instanceof Error ? e.message : e);
    }
  }

  // Log the alert regardless of email send status
  await sb.from('alert_log').insert({
    project_id: projectId,
    alert_type: alertType,
    recipient_email: to,
    subject,
  });

  return emailSent;
}

// ── Get admin emails for notifications ──
async function getAdminEmails(sb: any): Promise<string[]> {
  const { data: admins } = await sb
    .from('profiles')
    .select('id')
    .eq('role', 'admin');

  if (!admins || admins.length === 0) return [];

  const emails: string[] = [];
  for (const admin of admins) {
    const { data: user } = await sb.auth.admin.getUserById(admin.id);
    if (user?.user?.email) emails.push(user.user.email);
  }
  return emails;
}

// ── Get project owner email ──
async function getOwnerEmail(sb: any, ownerId: string): Promise<string | null> {
  const { data: user } = await sb.auth.admin.getUserById(ownerId);
  return user?.user?.email || null;
}

// ── Helpers ──
const RETRY_DELAY_MS = 30_000; // 30 seconds between first failure and retry
const INCIDENT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes — don't create duplicate incidents

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Main handler ──
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(supabaseUrl, serviceRoleKey);

  try {
    // 1. Get all active projects
    const { data: projects, error: projErr } = await sb
      .from('projects')
      .select('id, name, url, platform, status, admin_url, admin_user, admin_password_encrypted, wp_app_user, wp_app_password_encrypted, site_token, frontend_url, frontend_healthcheck, owner_id')
      .eq('is_active', true)
      .neq('status', 'paused')
      .neq('status', 'maintenance');

    if (projErr) throw projErr;
    if (!projects || projects.length === 0) {
      return new Response(JSON.stringify({ message: 'No active projects to monitor', checked: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Decrypt credentials for all projects
    for (const p of projects) {
      if (p.admin_password_encrypted) {
        p.admin_password_encrypted = await decrypt(p.admin_password_encrypted);
      }
      if (p.wp_app_password_encrypted) {
        p.wp_app_password_encrypted = await decrypt(p.wp_app_password_encrypted);
      }
    }

    const results: { project: string; oldStatus: string; newStatus: string; retried: boolean; incident?: string; reason?: string }[] = [];

    // 2. Check each project
    for (const project of projects as Project[]) {
      let checkResult = await checkProject(project);
      let statusResult = determineStatus(project, checkResult);
      let newStatus = statusResult.status;
      let statusReason = statusResult.reason;
      const oldStatus = project.status;
      let retried = false;

      // ── FASE 1: Retry — Si detecta DOWN, esperar 30s y reintentar ──
      // Solo si el proyecto NO estaba ya caído (evita retry innecesario en caídas confirmadas)
      if (newStatus === 'down' && oldStatus !== 'down') {
        await sleep(RETRY_DELAY_MS);
        checkResult = await checkProject(project);
        statusResult = determineStatus(project, checkResult);
        newStatus = statusResult.status;
        statusReason = statusResult.reason;
        retried = true;
      }

      // 3. Log the check (se registra el resultado final, post-retry)
      await sb.from('uptime_logs').insert({
        project_id: project.id,
        status: newStatus,
        response_time_ms: checkResult.responseTimeMs || null,
        status_code: checkResult.statusCode,
        ...(statusReason ? { status_reason: statusReason } : {}),
      });

      // 4. Update project status & response time
      const projectUpdate: Record<string, unknown> = {
        status: newStatus,
        response_time_ms: checkResult.responseTimeMs || null,
        last_check_at: new Date().toISOString(),
      };

      // Calculate uptime from last 24h logs
      const { count: totalChecks } = await sb
        .from('uptime_logs')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .gte('checked_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      // Count 'up' AND 'warning' as operational — warning means site is reachable but has minor issues
      const { count: upChecks } = await sb
        .from('uptime_logs')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .in('status', ['up', 'warning'])
        .gte('checked_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (totalChecks && totalChecks > 0) {
        projectUpdate.uptime_percent = parseFloat(((upChecks || 0) / totalChecks * 100).toFixed(2));
      }

      // Update SSL expiry in DB if we got it
      if (checkResult.sslExpiry) {
        projectUpdate.ssl_expiry = checkResult.sslExpiry;
      }

      await sb.from('projects').update(projectUpdate).eq('id', project.id);

      const entry: typeof results[0] = { project: project.name, oldStatus, newStatus, retried, ...(statusReason ? { reason: statusReason } : {}) };

      // ── FASE 2: SSL certificate expiry alerts ──
      if (checkResult.sslExpiry) {
        const daysLeft = Math.floor((new Date(checkResult.sslExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        let sslAlertType: string | null = null;
        if (daysLeft <= 0) sslAlertType = 'ssl_expired';
        else if (daysLeft <= 7) sslAlertType = 'ssl_7d';
        else if (daysLeft <= 14) sslAlertType = 'ssl_14d';
        else if (daysLeft <= 30) sslAlertType = 'ssl_30d';

        if (sslAlertType) {
          const adminEmails = await getAdminEmails(sb);
          const ownerEmail = await getOwnerEmail(sb, project.owner_id);
          const recipients = [...new Set([...adminEmails, ...(ownerEmail ? [ownerEmail] : [])])];
          const sslSubject = daysLeft <= 0
            ? `⛔ SSL EXPIRADO — ${project.name} (${project.url})`
            : `⚠️ SSL expira en ${daysLeft} días — ${project.name} (${project.url})`;

          for (const email of recipients) {
            await sendAlertEmail(sb, email, sslSubject, `El certificado SSL de ${project.url} ${daysLeft <= 0 ? 'ha expirado' : `expira el ${checkResult.sslExpiry} (${daysLeft} días)`}. Renuévalo cuanto antes.`, project.id, sslAlertType);
          }
        }
      }

      // 5. Create incident if site confirmed DOWN after retry
      if (newStatus === 'down' && oldStatus !== 'down') {

        // ── FASE 1: Cooldown — Verificar que no exista un incidente reciente ──
        const cooldownCutoff = new Date(Date.now() - INCIDENT_COOLDOWN_MS).toISOString();
        const { data: recentIncidents } = await sb
          .from('incidents')
          .select('id, incident_number')
          .eq('project_id', project.id)
          .eq('is_auto_detected', true)
          .gte('created_at', cooldownCutoff)
          .limit(1);

        if (recentIncidents && recentIncidents.length > 0) {
          entry.incident = `${recentIncidents[0].incident_number} (cooldown, no duplicado)`;
        } else {
          const title = buildIncidentTitle(project, checkResult);
          const description = buildIncidentDescription(project, checkResult);
          const priority = checkResult.reachable ? 'high' : 'critical';

          const { data: incident } = await sb.from('incidents').insert({
            project_id: project.id,
            title,
            description,
            priority,
            is_auto_detected: true,
          }).select('id, incident_number').single();

          if (incident) {
            entry.incident = incident.incident_number;

            await sb.from('incident_timeline').insert({
              incident_id: incident.id,
              event_type: 'alert',
              message: `Caída confirmada (2 checks consecutivos fallidos, retry tras ${RETRY_DELAY_MS / 1000}s). ${description.split('---')[1]?.trim() || ''}`,
            });

            // ── FASE 2: Email alert on downtime ──
            const adminEmails = await getAdminEmails(sb);
            const ownerEmail = await getOwnerEmail(sb, project.owner_id);
            const recipients = [...new Set([...adminEmails, ...(ownerEmail ? [ownerEmail] : [])])];
            for (const email of recipients) {
              await sendAlertEmail(
                sb, email,
                `🔴 Sitio caído — ${project.name} (${incident.incident_number})`,
                `${title}\n\n${description}`,
                project.id, 'downtime',
              );
            }
          }
        }
      }

      // 6. Auto-resolve if site came back UP (was down before)
      if (newStatus === 'up' && oldStatus === 'down') {
        const { data: openIncidents } = await sb
          .from('incidents')
          .select('id, incident_number, started_at')
          .eq('project_id', project.id)
          .eq('is_auto_detected', true)
          .in('status', ['investigating', 'identified', 'monitoring']);

        if (openIncidents) {
          for (const inc of openIncidents) {
            const durationMins = Math.floor((Date.now() - new Date(inc.started_at).getTime()) / 60000);
            await sb.from('incidents').update({
              status: 'resolved',
              resolved_at: new Date().toISOString(),
              duration_minutes: durationMins,
              resolution: 'El sitio se recuperó automáticamente.',
            }).eq('id', inc.id);

            await sb.from('incident_timeline').insert({
              incident_id: inc.id,
              event_type: 'status_change',
              message: `Sitio recuperado automáticamente. Duración total: ${durationMins < 60 ? `${durationMins}m` : `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`}.`,
            });

            entry.incident = `${inc.incident_number} (resuelto)`;

            // ── FASE 2: Email alert on recovery ──
            const durationStr = durationMins < 60 ? `${durationMins} minutos` : `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`;
            const adminEmails = await getAdminEmails(sb);
            const ownerEmail = await getOwnerEmail(sb, project.owner_id);
            const recipients = [...new Set([...adminEmails, ...(ownerEmail ? [ownerEmail] : [])])];
            for (const email of recipients) {
              await sendAlertEmail(
                sb, email,
                `🟢 Sitio recuperado — ${project.name} (${inc.incident_number})`,
                `El sitio ${project.name} (${project.url}) se ha recuperado automáticamente.\nDuración de la caída: ${durationStr}.\nIncidente: ${inc.incident_number}`,
                project.id, 'recovery',
              );
            }
          }
        }
      }

      results.push(entry);
    }

    // ── 7. Inline plugin refresh + check for outdated plugins ──
    // For each WP project: fetch real plugin slugs from WP/Agent API, delete stale entries from DB,
    // then evaluate outdated. This avoids calling fetch-plugins via HTTP (which causes timeout).
    const wpProjects = (projects as Project[]).filter(p =>
      ['wordpress', 'headless'].includes(p.platform) && p.admin_url &&
      ((p.wp_app_user && p.wp_app_password_encrypted) || (p.admin_user && p.admin_password_encrypted))
    );

    for (const wp of wpProjects) {
      try {
        let baseUrl = wp.admin_url.replace(/\/wp-admin\/?$/, '').replace(/\/+$/, '');
        if (!baseUrl.startsWith('http')) baseUrl = `https://${baseUrl}`;
        const wpHasAgent = !!wp.site_token || (!!wp.wp_app_user && !!wp.wp_app_password_encrypted);
        const isWoo = wp.admin_user?.startsWith('ck_');
        let liveSlugs: string[] = [];

        if (wpHasAgent) {
          // ── Lumina Agent: prefer site_token (v3), fallback Basic Auth (v2) ──
          const agentHdrs: Record<string, string> = { 'Accept': 'application/json' };
          if (wp.site_token) {
            agentHdrs['X-Lumina-Token'] = wp.site_token;
          } else {
            let decPass = wp.wp_app_password_encrypted;
            try { decPass = await decrypt(decPass); } catch { /* use raw */ }
            const enc = new TextEncoder();
            const raw = enc.encode(`${wp.wp_app_user}:${decPass}`);
            let b64 = '';
            for (const byte of raw) b64 += String.fromCharCode(byte);
            b64 = btoa(b64);
            agentHdrs['Authorization'] = `Basic ${b64}`;
          }
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 15000);
          const res = await fetch(`${baseUrl}/wp-json/lumina/v1/plugins`, {
            headers: agentHdrs,
            signal: ctrl.signal,
          });
          clearTimeout(t);
          if (res.ok) {
            const data = await res.json() as { plugins?: Array<{ slug: string; plugin_file: string; current_version: string; latest_version: string; is_active: boolean; auto_update: boolean; name: string; author: string }> };
            liveSlugs = (data.plugins || []).map(p => p.slug).filter(Boolean);
            if (data.plugins && data.plugins.length > 0) {
              await sb.from('project_plugins').upsert(
                data.plugins.map(p => ({
                  project_id: wp.id,
                  name: (p.name || '').replace(/<[^>]*>/g, ''),
                  slug: p.slug,
                  current_version: p.current_version || '',
                  latest_version: p.latest_version || '',
                  is_active: p.is_active ?? false,
                  plugin_type: 'plugin',
                  author: (p.author || '').replace(/<[^>]*>/g, ''),
                  plugin_file: p.plugin_file || '',
                  auto_update: p.auto_update ?? false,
                  last_checked_at: new Date().toISOString(),
                })),
                { onConflict: 'project_id,slug', ignoreDuplicates: false },
              );
            }
            console.log(`[monitor] Agent returned ${data.plugins?.length || 0} plugins for ${wp.name}`);
          }
          // Also fetch themes from agent
          try {
            const ctrl2 = new AbortController();
            const t2 = setTimeout(() => ctrl2.abort(), 10000);
            const thRes = await fetch(`${baseUrl}/wp-json/lumina/v1/themes`, {
              headers: agentHdrs,
              signal: ctrl2.signal,
            });
            clearTimeout(t2);
            if (thRes.ok) {
              const thData = await thRes.json() as { themes?: Array<{ slug: string; name: string; current_version: string; latest_version: string; is_active: boolean; auto_update: boolean; author: string }> };
              const themeSlugs = (thData.themes || []).map(th => th.slug).filter(Boolean);
              liveSlugs = [...liveSlugs, ...themeSlugs];
              if (thData.themes && thData.themes.length > 0) {
                await sb.from('project_plugins').upsert(
                  thData.themes.map(th => ({
                    project_id: wp.id,
                    name: (th.name || '').replace(/<[^>]*>/g, ''),
                    slug: th.slug,
                    current_version: th.current_version || '',
                    latest_version: th.latest_version || '',
                    is_active: th.is_active ?? false,
                    plugin_type: 'theme',
                    author: (th.author || '').replace(/<[^>]*>/g, ''),
                    plugin_file: '',
                    auto_update: th.auto_update ?? false,
                    last_checked_at: new Date().toISOString(),
                  })),
                  { onConflict: 'project_id,slug', ignoreDuplicates: false },
                );
              }
            }
          } catch { /* themes optional */ }
        } else if (isWoo) {
          // ── WooCommerce LEGACY ──
          const wooUrl = `${baseUrl}/wp-json/wc/v3/system_status?consumer_key=${encodeURIComponent(wp.admin_user)}&consumer_secret=${encodeURIComponent(wp.admin_password_encrypted)}`;
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 15000);
          const res = await fetch(wooUrl, { signal: ctrl.signal });
          clearTimeout(t);
          if (res.ok) {
            const ss = await res.json() as any;
            const active = (ss.active_plugins || []).map((p: any) => (p.plugin || '').split('/')[0]).filter(Boolean);
            const inactive = (ss.inactive_plugins || []).map((p: any) => (p.plugin || '').split('/')[0]).filter(Boolean);
            liveSlugs = [...active, ...inactive];
            if (ss.theme?.stylesheet) liveSlugs.push(ss.theme.stylesheet);
          }
        } else {
          // ── WordPress LEGACY ──
          const enc = new TextEncoder();
          const raw = enc.encode(`${wp.admin_user}:${wp.admin_password_encrypted}`);
          let b64 = '';
          for (const byte of raw) b64 += String.fromCharCode(byte);
          b64 = btoa(b64);
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 15000);
          const res = await fetch(`${baseUrl}/wp-json/wp/v2/plugins`, {
            headers: { 'Authorization': `Basic ${b64}` },
            signal: ctrl.signal,
          });
          clearTimeout(t);
          if (res.ok) {
            const plugins = await res.json();
            liveSlugs = (plugins as any[]).map(p => (p.plugin || '').split('/')[0]).filter(Boolean);
          }
        }

        if (liveSlugs.length > 0) {
          const { data: dbPlugins } = await sb
            .from('project_plugins')
            .select('id, slug')
            .eq('project_id', wp.id);
          if (dbPlugins) {
            const toDelete = dbPlugins.filter(d => !liveSlugs.includes(d.slug)).map(d => d.id);
            if (toDelete.length > 0) {
              await sb.from('project_plugins').delete().in('id', toDelete);
              console.log(`[monitor] cleaned ${toDelete.length} stale plugins for ${wp.name}`);
            }
          }
        }
      } catch (e) {
        console.log(`[monitor] inline plugin refresh failed for ${wp.name}:`, e instanceof Error ? e.message : e);
      }
    }

    // Read plugin data from DB (after cleanup) and refresh latest_version via wp.org
    const { data: allPlugins } = await sb
      .from('project_plugins')
      .select('id, project_id, name, slug, current_version, latest_version, plugin_type, auto_update')
      .in('project_id', projects.map((p: Project) => p.id));

    // ── Update latest_version from wp.org for plugins/themes that need it ──
    if (allPlugins && allPlugins.length > 0) {
      const BATCH = 5;
      const toCheck = allPlugins.filter(p =>
        p.plugin_type !== 'core' &&
        p.slug &&
        (!p.latest_version || p.latest_version === '' || p.latest_version === 'unknown' || p.latest_version === p.current_version)
      );
      for (let i = 0; i < toCheck.length; i += BATCH) {
        const batch = toCheck.slice(i, i + BATCH);
        await Promise.all(batch.map(async (p) => {
          try {
            const isTheme = p.plugin_type === 'theme';
            const apiUrl = isTheme
              ? `https://api.wordpress.org/themes/info/1.2/?action=theme_information&request[slug]=${encodeURIComponent(p.slug)}&request[fields][version]=1`
              : `https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]=${encodeURIComponent(p.slug)}&request[fields][version]=1`;
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 5000);
            const res = await fetch(apiUrl, { signal: ctrl.signal, headers: { 'Accept': 'application/json' } });
            clearTimeout(t);
            if (res.ok) {
              const d = await res.json() as any;
              if (d.version && !d.error) {
                await sb.from('project_plugins').update({ latest_version: d.version, last_checked_at: new Date().toISOString() }).eq('id', p.id);
                p.latest_version = d.version; // Update in-memory for outdated eval below
              }
            }
          } catch { /* wp.org lookup optional */ }
        }));
      }

      // Also check WP core version for each WP project
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const coreRes = await fetch('https://api.wordpress.org/core/version-check/1.7/', { signal: ctrl.signal });
        clearTimeout(t);
        if (coreRes.ok) {
          const coreData = await coreRes.json() as any;
          const latest = coreData.offers?.find((o: any) => o.response === 'upgrade' || o.response === 'latest');
          if (latest?.version) {
            const corePlugins = allPlugins.filter(p => p.slug === 'wordpress-core');
            for (const cp of corePlugins) {
              if (cp.current_version !== latest.version) {
                await sb.from('project_plugins').update({ latest_version: latest.version, last_checked_at: new Date().toISOString() }).eq('id', cp.id);
                cp.latest_version = latest.version;
              }
            }
          }
        }
      } catch { /* core check optional */ }
    }

    // Group outdated plugins by project — exclude 'unknown' (premium) AND plugins with auto_update enabled
    const outdatedByProject = new Map<string, Array<{ id: string; project_id: string; name: string; current_version: string; latest_version: string }>>();
    if (allPlugins && allPlugins.length > 0) {
      for (const plugin of allPlugins) {
        // Skip plugins with auto-update enabled — WordPress will handle them automatically
        if ((plugin as any).auto_update === true) continue;
        if (plugin.latest_version && plugin.latest_version !== '' && plugin.latest_version !== 'unknown' && plugin.latest_version !== plugin.current_version) {
          const list = outdatedByProject.get(plugin.project_id) || [];
          list.push(plugin);
          outdatedByProject.set(plugin.project_id, list);
        }
      }
    }

    // ── AUTO-RESOLVE: Close open plugin-outdated incidents for projects that no longer have outdated plugins ──
    for (const project of (projects as Project[])) {
      if (outdatedByProject.has(project.id)) continue; // Still has outdated plugins, skip

      const { data: openPluginIncidents } = await sb
        .from('incidents')
        .select('id, incident_number')
        .eq('project_id', project.id)
        .eq('is_auto_detected', true)
        .ilike('title', '%plugin%desactualizado%')
        .in('status', ['investigating', 'identified', 'monitoring']);

      for (const inc of (openPluginIncidents || [])) {
        await sb.from('incidents').update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolution: 'Todos los plugins están actualizados. Incidente cerrado automáticamente por el monitor.',
        }).eq('id', inc.id);

        await sb.from('incident_timeline').insert({
          incident_id: inc.id,
          event_type: 'status_change',
          message: 'Resuelto automáticamente: ya no se detectan plugins desactualizados tras verificación en el sitio.',
        });

        console.log(`[monitor] auto-resolved plugin incident ${inc.incident_number} for ${project.name}`);
      }
    }

    // ── CREATE: New incidents for projects WITH outdated plugins ──
    for (const [projectId, outdated] of outdatedByProject.entries()) {
      const project = (projects as Project[]).find(p => p.id === projectId);
      if (!project) continue;

      // Check if there's already an open plugin-outdated incident for this project
      const { data: existingPluginIncidents } = await sb
        .from('incidents')
        .select('id')
        .eq('project_id', projectId)
        .eq('is_auto_detected', true)
        .ilike('title', '%plugin%desactualizado%')
        .in('status', ['investigating', 'identified', 'monitoring'])
        .limit(1);

      if (existingPluginIncidents && existingPluginIncidents.length > 0) continue; // Already has open incident

      // Create incident for outdated plugins
      const pluginNames = outdated.slice(0, 5).map(p => `${p.name} (${p.current_version} → ${p.latest_version})`).join(', ');
      const title = `${outdated.length} plugin${outdated.length > 1 ? 's' : ''} desactualizado${outdated.length > 1 ? 's' : ''} — ${project.name}`;
      const description = `Se detectaron plugins con actualizaciones pendientes en ${project.name}:\n\n${pluginNames}${outdated.length > 5 ? `\n...y ${outdated.length - 5} más` : ''}\n\nEstas actualizaciones pueden incluir parches de seguridad y mejoras de rendimiento. Se está trabajando en ello.`;

      const { data: incident } = await sb.from('incidents').insert({
        project_id: projectId,
        title,
        description,
        priority: 'medium',
        is_auto_detected: true,
      }).select('id, incident_number').single();

      if (incident) {
        await sb.from('incident_timeline').insert({
          incident_id: incident.id,
          event_type: 'alert',
          message: `Detectados ${outdated.length} plugins con actualizaciones pendientes.`,
        });

        // Notify admin + client
        const adminEmails = await getAdminEmails(sb);
        const ownerEmail = await getOwnerEmail(sb, project.owner_id);
        const recipients = [...new Set([...adminEmails, ...(ownerEmail ? [ownerEmail] : [])])];
        for (const email of recipients) {
          await sendAlertEmail(
            sb, email,
            `⚠️ Plugins desactualizados — ${project.name} (${incident.incident_number})`,
            `${title}\n\n${description}`,
            projectId, 'plugins_outdated',
          );
        }
      }
    }

    return new Response(JSON.stringify({
      message: 'Monitor completed',
      checked: projects.length,
      results,
      timestamp: new Date().toISOString(),
    }), {
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
