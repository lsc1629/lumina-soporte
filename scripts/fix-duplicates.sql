-- Encontrar proyectos duplicados por nombre y URL
SELECT 
  name, 
  url, 
  COUNT(*) as duplicates,
  array_agg(id ORDER BY created_at) as ids
FROM projects
GROUP BY name, url
HAVING COUNT(*) > 1;

-- Para eliminar duplicados (mantener el más antiguo):
-- DELETE FROM projects 
-- WHERE id IN (
--   SELECT id 
--   FROM (
--     SELECT id, ROW_NUMBER() OVER (PARTITION BY name, url ORDER BY created_at) as rn
--     FROM projects
--   ) t
--   WHERE rn > 1
-- );
