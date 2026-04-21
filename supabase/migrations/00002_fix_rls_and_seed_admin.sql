-- ============================================================
-- FIX: Corregir recursión infinita en políticas RLS
-- y crear perfil admin para el usuario existente
-- ============================================================

-- 1. Eliminar las políticas problemáticas
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- 2. Crear función helper para verificar rol admin sin recursión
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. Recrear políticas usando la función SECURITY DEFINER (evita RLS check recursivo)
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can update all profiles"
  ON public.profiles
  FOR UPDATE
  USING (public.is_admin());

-- 4. Política INSERT para el trigger de auth (SECURITY DEFINER ya la maneja,
--    pero por seguridad agregamos una para inserts directos)
CREATE POLICY "Allow insert for auth trigger"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 5. Insertar perfil admin para el usuario existente
INSERT INTO public.profiles (id, email, full_name, role, job_title, timezone)
VALUES (
  '9588ac16-5de9-4580-8bc0-923de40e4fe4',
  'donluissalascortes@gmail.com',
  'Luis Salas Cortés',
  'admin',
  'Administrador de Sistemas',
  'America/Santiago'
)
ON CONFLICT (id) DO UPDATE SET role = 'admin';
