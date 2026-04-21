-- 00011: Agregar columna plugin_file a project_plugins
-- Almacena el path completo del plugin en WP (ej: "cf7-google-sheets-connector/google-sheet-connector.php")
-- Necesario para poder actualizar plugins cuyo archivo principal no coincide con el slug.

ALTER TABLE public.project_plugins ADD COLUMN IF NOT EXISTS plugin_file TEXT DEFAULT '';
