-- Agrega columnas de routing de notificaciones: qué tipos llegan al admin y al cliente
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS admin_notify_incidents      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS admin_notify_updates        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS admin_notify_reports        BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS client_notify_incidents     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS client_notify_updates       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS client_notify_reports       BOOLEAN NOT NULL DEFAULT TRUE;
