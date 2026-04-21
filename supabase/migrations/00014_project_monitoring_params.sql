-- ============================================================
-- Parámetros de monitoreo por proyecto
-- Intervalo de chequeo + retención de logs
-- ============================================================

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS monitoring_interval_minutes INTEGER NOT NULL DEFAULT 5;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS log_retention_days INTEGER NOT NULL DEFAULT 90;

-- Índice para purga eficiente de logs antiguos
CREATE INDEX IF NOT EXISTS idx_uptime_logs_checked_at ON public.uptime_logs(checked_at);
