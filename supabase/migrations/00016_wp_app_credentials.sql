-- ============================================================
-- Añadir campos Application Password para sitios WooCommerce
-- Permite usar credenciales WP (usuario + App Password) separadas
-- de las credenciales WooCommerce (Consumer Key / Consumer Secret)
-- ============================================================

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS wp_app_user TEXT DEFAULT '';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS wp_app_password_encrypted TEXT DEFAULT '';
