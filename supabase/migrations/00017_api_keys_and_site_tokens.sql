-- 00017_api_keys_and_site_tokens.sql
-- Fase D: Sistema de API Keys estilo WP Umbrella + site_token para comunicación bidireccional

-- Tabla de API Keys (una por usuario/cuenta)
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,          -- SHA-256 hash de la API Key (nunca guardamos la key en texto plano)
  key_prefix VARCHAR(8) NOT NULL,  -- Primeros 8 chars para identificación visual (ej: "lmn_a1b2")
  label VARCHAR(100) DEFAULT 'Default',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(key_hash)
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);

-- RLS para api_keys
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own api_keys"
  ON api_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own api_keys"
  ON api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own api_keys"
  ON api_keys FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own api_keys"
  ON api_keys FOR DELETE
  USING (auth.uid() = user_id);

-- Columna site_token en projects: token único que el plugin WP almacena
-- para que Lumina pueda autenticarse contra el plugin (reemplaza wp_app_user/wp_app_password)
-- DEFAULT NULL: solo se asigna cuando el plugin v3 registra el sitio
ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_token UUID DEFAULT NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS agent_version VARCHAR(20);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS agent_connected_at TIMESTAMPTZ;

-- Índice único parcial (solo site_tokens no nulos)
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_site_token ON projects(site_token) WHERE site_token IS NOT NULL;
