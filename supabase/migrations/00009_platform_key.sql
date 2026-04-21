-- Add platform_key to store the original platform selection (wordpress, woocommerce, shopify, etc.)
-- This is needed because both WordPress and WooCommerce projects store platform='wordpress' as dbValue
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS platform_key TEXT;

-- Backfill: if admin_user starts with 'ck_', it was WooCommerce
UPDATE public.projects
SET platform_key = CASE
  WHEN admin_user LIKE 'ck_%' THEN 'woocommerce'
  ELSE platform
END
WHERE platform_key IS NULL;
