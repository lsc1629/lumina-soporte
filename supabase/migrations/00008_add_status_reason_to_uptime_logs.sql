-- Add status_reason column to uptime_logs to explain WHY a site has warning/down status
ALTER TABLE public.uptime_logs ADD COLUMN IF NOT EXISTS status_reason TEXT;
