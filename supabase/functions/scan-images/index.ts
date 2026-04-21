// supabase/functions/scan-images/index.ts
// Edge Function — escanea imágenes de un proyecto para detectar PNG/JPG que necesitan conversión a WebP.
// Usa WP REST API para WordPress/headless, y scraping HTML para frontends.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { decrypt } from '../_shared/crypto.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status: 200, headers: cors });
}

function encodeBasic(user: string, pass: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${user}:${pass}`);
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary);
}

interface ImageResult {
  src: string;
  filename: string;
  format: string;
  alt: string;
  source: 'wp-media' | 'frontend' | 'backend-html' | 'shopify-products';
  needsConversion: boolean;
  width?: number;
  height?: number;
  mimeType?: string;
}

function getFormat(url: string): string {
  const clean = url.split('?')[0].split('#')[0].toLowerCase();
  if (clean.endsWith('.png')) return 'PNG';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'JPG';
  if (clean.endsWith('.gif')) return 'GIF';
  if (clean.endsWith('.webp')) return 'WebP';
  if (clean.endsWith('.avif')) return 'AVIF';
  if (clean.endsWith('.svg')) return 'SVG';
  if (clean.endsWith('.ico')) return 'ICO';
  if (clean.endsWith('.bmp')) return 'BMP';
  if (clean.endsWith('.tiff') || clean.endsWith('.tif')) return 'TIFF';
  if (clean.includes('.png')) return 'PNG';
  if (clean.includes('.jpg') || clean.includes('.jpeg')) return 'JPG';
  if (clean.includes('.webp')) return 'WebP';
  return 'Desconocido';
}

function formatFromMime(mime: string): string {
  if (mime.includes('png')) return 'PNG';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'JPG';
  if (mime.includes('gif')) return 'GIF';
  if (mime.includes('webp')) return 'WebP';
  if (mime.includes('avif')) return 'AVIF';
  if (mime.includes('svg')) return 'SVG';
  if (mime.includes('bmp')) return 'BMP';
  if (mime.includes('tiff')) return 'TIFF';
  if (mime.includes('ico')) return 'ICO';
  return 'Desconocido';
}

const NEEDS_CONVERSION = ['PNG', 'JPG', 'BMP', 'TIFF', 'GIF'];

// Fetch WP media library via REST API (paginado)
async function fetchWpMedia(baseUrl: string, auth: string, maxPages = 5): Promise<ImageResult[]> {
  const images: ImageResult[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page++) {
    try {
      const res = await fetch(`${baseUrl}/wp-json/wp/v2/media?per_page=100&page=${page}&media_type=image`, {
        headers: { 'Authorization': auth, 'Accept': 'application/json' },
      });

      if (!res.ok) {
        console.log(`[scan-images] WP media page ${page} status: ${res.status}`);
        break;
      }

      const items = await res.json() as Array<{
        source_url: string;
        mime_type: string;
        alt_text: string;
        title: { rendered: string };
        media_details?: {
          width?: number;
          height?: number;
          sizes?: Record<string, { source_url: string; mime_type: string; width: number; height: number }>;
        };
      }>;

      if (!items || items.length === 0) break;

      for (const item of items) {
        const src = item.source_url || '';
        if (!src || seen.has(src)) continue;
        seen.add(src);

        const format = item.mime_type ? formatFromMime(item.mime_type) : getFormat(src);
        const filename = src.split('/').pop()?.split('?')[0] || 'imagen';

        images.push({
          src,
          filename,
          format,
          alt: item.alt_text || item.title?.rendered || '',
          source: 'wp-media',
          needsConversion: NEEDS_CONVERSION.includes(format),
          width: item.media_details?.width,
          height: item.media_details?.height,
          mimeType: item.mime_type,
        });
      }

      // Check if there are more pages
      const totalPages = parseInt(res.headers.get('x-wp-totalpages') || '1');
      if (page >= totalPages) break;
    } catch (e) {
      console.log(`[scan-images] WP media fetch error page ${page}:`, e);
      break;
    }
  }

  return images;
}

// Fetch Shopify product images via Admin API
async function fetchShopifyProductImages(domain: string, token: string, apiVersion = '2024-01', maxPages = 5): Promise<ImageResult[]> {
  const images: ImageResult[] = [];
  const seen = new Set<string>();
  let nextPageUrl: string | null = `https://${domain}/admin/api/${apiVersion}/products.json?limit=250&fields=id,title,images`;

  for (let page = 0; page < maxPages && nextPageUrl; page++) {
    try {
      const res = await fetch(nextPageUrl, {
        headers: { 'X-Shopify-Access-Token': token, 'Accept': 'application/json' },
      });

      if (!res.ok) {
        console.log(`[scan-images] Shopify products page ${page} status: ${res.status}`);
        break;
      }

      const data = await res.json() as { products: Array<{ id: number; title: string; images: Array<{ src: string; width?: number; height?: number; alt?: string }> }> };

      for (const product of (data.products || [])) {
        for (const img of (product.images || [])) {
          const src = img.src || '';
          if (!src || seen.has(src)) continue;
          seen.add(src);

          const format = getFormat(src);
          images.push({
            src,
            filename: src.split('/').pop()?.split('?')[0] || 'imagen',
            format,
            alt: img.alt || product.title || '',
            source: 'shopify-products',
            needsConversion: NEEDS_CONVERSION.includes(format),
            width: img.width,
            height: img.height,
          });
        }
      }

      // Pagination via Link header
      const linkHeader = res.headers.get('link') || '';
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      nextPageUrl = nextMatch ? nextMatch[1] : null;
    } catch (e) {
      console.log(`[scan-images] Shopify products fetch error page ${page}:`, e);
      break;
    }
  }

  return images;
}

// Scrape images from HTML page (server-side, no CORS)
async function scrapeHtmlImages(pageUrl: string): Promise<ImageResult[]> {
  const images: ImageResult[] = [];
  const seen = new Set<string>();

  try {
    const res = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LuminaSupport/1.0)',
        'Accept': 'text/html',
      },
    });

    if (!res.ok) {
      console.log(`[scan-images] HTML scrape ${pageUrl} status: ${res.status}`);
      return images;
    }

    const html = await res.text();

    const resolveUrl = (src: string): string => {
      if (src.startsWith('//')) return 'https:' + src;
      if (src.startsWith('/')) {
        try { return new URL(src, pageUrl).href; } catch { return src; }
      }
      if (!src.startsWith('http')) {
        try { return new URL(src, pageUrl).href; } catch { return src; }
      }
      return src;
    };

    // <img src="...">
    const imgRegex = /<img[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      const fullSrc = resolveUrl(match[1]);
      if (seen.has(fullSrc) || fullSrc.startsWith('data:')) continue;
      seen.add(fullSrc);

      const altMatch = match[0].match(/alt=["']([^"']*)["']/);
      const format = getFormat(fullSrc);
      images.push({
        src: fullSrc,
        filename: fullSrc.split('/').pop()?.split('?')[0] || 'imagen',
        format,
        alt: altMatch ? altMatch[1] : '',
        source: 'frontend',
        needsConversion: NEEDS_CONVERSION.includes(format),
      });
    }

    // background-image: url(...)
    const bgRegex = /background(?:-image)?\s*:\s*url\(["']?([^"')]+)["']?\)/gi;
    while ((match = bgRegex.exec(html)) !== null) {
      const fullSrc = resolveUrl(match[1]);
      if (seen.has(fullSrc) || fullSrc.startsWith('data:')) continue;
      seen.add(fullSrc);

      const format = getFormat(fullSrc);
      images.push({
        src: fullSrc,
        filename: fullSrc.split('/').pop()?.split('?')[0] || 'imagen',
        format,
        alt: '(background)',
        source: 'frontend',
        needsConversion: NEEDS_CONVERSION.includes(format),
      });
    }

    // srcset
    const srcsetRegex = /srcset=["']([^"']+)["']/gi;
    while ((match = srcsetRegex.exec(html)) !== null) {
      const entries = match[1].split(',').map(s => s.trim().split(/\s+/)[0]);
      for (const src of entries) {
        const fullSrc = resolveUrl(src);
        if (seen.has(fullSrc) || fullSrc.startsWith('data:')) continue;
        seen.add(fullSrc);

        const format = getFormat(fullSrc);
        images.push({
          src: fullSrc,
          filename: fullSrc.split('/').pop()?.split('?')[0] || 'imagen',
          format,
          alt: '(srcset)',
          source: 'frontend',
          needsConversion: NEEDS_CONVERSION.includes(format),
        });
      }
    }
  } catch (e) {
    console.log(`[scan-images] scrape error ${pageUrl}:`, e);
  }

  return images;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const body = await req.json();
    const projectId = body?.project_id;
    console.log('[scan-images] start, project_id:', projectId);

    if (!projectId) return ok({ images: [], error: 'project_id requerido' });

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: project, error: pErr } = await sb
      .from('projects')
      .select('id, name, url, platform, admin_url, admin_user, admin_password_encrypted, frontend_url')
      .eq('id', projectId)
      .single();

    if (project?.admin_password_encrypted) {
      project.admin_password_encrypted = await decrypt(project.admin_password_encrypted);
    }

    if (pErr || !project) {
      return ok({ images: [], error: `Proyecto no encontrado: ${pErr?.message || ''}` });
    }

    console.log('[scan-images] project:', project.name, 'platform:', project.platform, 'url:', project.url, 'frontend_url:', project.frontend_url);

    const platform = project.platform;
    const isWp = ['wordpress', 'headless'].includes(platform);
    const isWoo = isWp && project.admin_user?.startsWith('ck_');
    const isShopify = platform === 'shopify';
    const isShopifyHeadless = isShopify && project.frontend_url && project.frontend_url.trim() !== '';
    const isHeadless = platform === 'headless' || (isWp && project.frontend_url && project.frontend_url.trim() !== '') || isShopifyHeadless;
    const allImages: ImageResult[] = [];
    let error: string | null = null;

    // ── WordPress / WooCommerce / Headless: WP REST API ──
    if (isWp) {
      let base = (project.admin_url || project.url || '').replace(/\/wp-admin\/?$/, '').replace(/\/+$/, '');
      if (!base.startsWith('http')) base = `https://${base}`;

      let auth = '';
      if (isWoo) {
        // WooCommerce: no necesita auth especial para media endpoint público
        // Pero si tiene Application Password, usarla
        // Intentamos sin auth primero ya que wp/v2/media suele ser público
        auth = '';
      } else {
        if (project.admin_user && project.admin_password_encrypted) {
          auth = `Basic ${encodeBasic(project.admin_user, project.admin_password_encrypted)}`;
        }
      }

      console.log('[scan-images] fetching WP media from:', base);

      // WP Media API - primero intentar sin auth (suele ser público)
      let wpImages = await fetchWpMedia(base, '');
      
      // Si no devuelve nada y tenemos auth, intentar con auth
      if (wpImages.length === 0 && auth) {
        console.log('[scan-images] retrying WP media with auth');
        wpImages = await fetchWpMedia(base, auth);
      }

      if (wpImages.length === 0 && isWoo && project.admin_user && project.admin_password_encrypted) {
        // Intentar con WooCommerce auth como query params
        console.log('[scan-images] trying WP media with WooCommerce auth');
        const authBase = `Basic ${encodeBasic(project.admin_user, project.admin_password_encrypted)}`;
        wpImages = await fetchWpMedia(base, authBase);
      }

      console.log('[scan-images] WP media found:', wpImages.length);
      allImages.push(...wpImages);

      if (wpImages.length === 0) {
        error = 'No se pudieron obtener imágenes de la biblioteca de medios de WordPress. Verifica que la REST API esté habilitada.';
      }
    }

    // ── Headless: también escanear el frontend ──
    if (isHeadless && project.frontend_url && project.frontend_url.trim() !== '') {
      let frontUrl = project.frontend_url.trim();
      if (!frontUrl.startsWith('http')) frontUrl = `https://${frontUrl}`;
      console.log('[scan-images] scraping headless frontend:', frontUrl);
      
      const frontendImages = await scrapeHtmlImages(frontUrl);
      // Marcar como frontend
      frontendImages.forEach(img => { img.source = 'frontend'; });
      console.log('[scan-images] frontend images found:', frontendImages.length);
      allImages.push(...frontendImages);
    }

    // ── WordPress puro (sin headless): escanear su propia URL como frontend también ──
    if (isWp && !isHeadless) {
      let siteUrl = (project.url || '').replace(/\/+$/, '');
      if (!siteUrl.startsWith('http')) siteUrl = `https://${siteUrl}`;
      console.log('[scan-images] scraping WP frontend HTML:', siteUrl);
      
      const htmlImages = await scrapeHtmlImages(siteUrl);
      htmlImages.forEach(img => { img.source = 'backend-html'; });
      
      // Merge: solo agregar las que no estén ya desde WP Media
      const existingSrcs = new Set(allImages.map(i => i.src));
      const newHtmlImages = htmlImages.filter(i => !existingSrcs.has(i.src));
      console.log('[scan-images] HTML-only images:', newHtmlImages.length);
      allImages.push(...newHtmlImages);
    }

    // ── Shopify: Product images via Admin API ──
    if (isShopify && project.admin_url && project.admin_password_encrypted) {
      const domain = (project.admin_url || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
      const apiVer = project.admin_user || '2024-01';
      console.log('[scan-images] fetching Shopify product images from:', domain);

      const shopifyImages = await fetchShopifyProductImages(domain, project.admin_password_encrypted, apiVer);
      console.log('[scan-images] Shopify product images found:', shopifyImages.length);
      allImages.push(...shopifyImages);

      if (shopifyImages.length === 0) {
        error = 'No se pudieron obtener imágenes de productos de Shopify. Verifica el Access Token y los permisos (read_products).';
      }
    }

    // ── Shopify Headless: also scrape the frontend ──
    if (isShopifyHeadless && project.frontend_url && project.frontend_url.trim() !== '') {
      let frontUrl = project.frontend_url.trim();
      if (!frontUrl.startsWith('http')) frontUrl = `https://${frontUrl}`;
      console.log('[scan-images] scraping Shopify headless frontend:', frontUrl);

      const frontendImages = await scrapeHtmlImages(frontUrl);
      frontendImages.forEach(img => { img.source = 'frontend'; });
      console.log('[scan-images] Shopify frontend images found:', frontendImages.length);

      const existingSrcs = new Set(allImages.map(i => i.src));
      const newFrontendImages = frontendImages.filter(i => !existingSrcs.has(i.src));
      allImages.push(...newFrontendImages);
    }

    // ── Shopify puro (sin headless): scrape storefront ──
    if (isShopify && !isShopifyHeadless) {
      let siteUrl = (project.url || '').replace(/\/+$/, '');
      if (!siteUrl.startsWith('http')) siteUrl = `https://${siteUrl}`;
      console.log('[scan-images] scraping Shopify storefront:', siteUrl);

      const htmlImages = await scrapeHtmlImages(siteUrl);
      htmlImages.forEach(img => { img.source = 'frontend'; });

      const existingSrcs = new Set(allImages.map(i => i.src));
      const newHtmlImages = htmlImages.filter(i => !existingSrcs.has(i.src));
      allImages.push(...newHtmlImages);
    }

    // ── No-WP, no-Shopify platforms: solo scraping ──
    if (!isWp && !isShopify) {
      let siteUrl = (project.url || '').replace(/\/+$/, '');
      if (!siteUrl.startsWith('http')) siteUrl = `https://${siteUrl}`;
      console.log('[scan-images] scraping non-WP/non-Shopify site:', siteUrl);
      
      const htmlImages = await scrapeHtmlImages(siteUrl);
      allImages.push(...htmlImages);

      if (htmlImages.length === 0) {
        error = 'No se encontraron imágenes en la página principal del sitio.';
      }
    }

    // Sort: needs conversion first, then by source
    allImages.sort((a, b) => {
      if (a.needsConversion !== b.needsConversion) return b.needsConversion ? 1 : -1;
      if (a.source !== b.source) return a.source === 'wp-media' ? -1 : 1;
      return 0;
    });

    console.log('[scan-images] total images:', allImages.length);

    return ok({
      images: allImages,
      summary: {
        total: allImages.length,
        needsConversion: allImages.filter(i => i.needsConversion).length,
        optimized: allImages.filter(i => !i.needsConversion).length,
        fromWpMedia: allImages.filter(i => i.source === 'wp-media').length,
        fromFrontend: allImages.filter(i => i.source === 'frontend').length,
        fromBackendHtml: allImages.filter(i => i.source === 'backend-html').length,
        fromShopifyProducts: allImages.filter(i => i.source === 'shopify-products').length,
      },
      projectType: {
        platform,
        isHeadless,
        isWoo,
        isShopify,
        backendUrl: project.url,
        frontendUrl: project.frontend_url || null,
      },
      error,
    });

  } catch (e) {
    console.error('[scan-images] FATAL:', e);
    return ok({ images: [], error: `Error interno: ${e instanceof Error ? e.message : String(e)}` });
  }
});
