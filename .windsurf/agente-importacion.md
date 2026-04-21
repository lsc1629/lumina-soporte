---
description: Migrar Supabase Cloud a self-hosted + desplegar Next.js en Coolify (separarse de Vercel)
---

# Migración Supabase Cloud → Self-hosted + Deploy en Coolify

## PASO 0: Preguntas iniciales (OBLIGATORIO)

Antes de comenzar, hacer las siguientes dos preguntas al usuario:

---

### Pregunta 1 — ¿Qué tipo de proyecto es?

> "¿Qué tipo de proyecto es el que vamos a migrar?"
>
> A) **Next.js alojado en Vercel**
> B) **React alojado en Cloudflare Pages**
> C) **Next.js exportado como HTML estático alojado en Cloudflare Pages**

Guardar la respuesta como `TIPO_PROYECTO`.

---

### Pregunta 2 — ¿Qué quieres hacer?

> "¿Qué deseas hacer con este proyecto?"
>
> 1) **Migrar a Coolify + migrar Supabase Cloud a Supabase self-hosted** (proceso completo)
> 2) **Solo migrar Supabase Cloud a Supabase self-hosted** (sin cambiar el hosting de la app)

Guardar la respuesta como `ACCION`.

---

### Rutas según combinación de respuestas

| `TIPO_PROYECTO` | `ACCION` | Fases a ejecutar |
|---|---|---|
| A — Next.js en Vercel | 1 — Coolify + Supabase | FASE 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 |
| A — Next.js en Vercel | 2 — Solo Supabase | FASE 1 → actualizar `.env.local` y variables en Vercel |
| B — React en Cloudflare | 1 — Coolify + Supabase | FASE 1 → 2 → 3 → 4B → 5 → 6B → 7 → 8 |
| B — React en Cloudflare | 2 — Solo Supabase | FASE 1 → actualizar variables en Cloudflare Pages |
| C — Next.js estático en Cloudflare | 1 — Coolify + Supabase | FASE 1 → 2 → 3 → 4C → 5 → 6C → 7 → 8 |
| C — Next.js estático en Cloudflare | 2 — Solo Supabase | FASE 1 → actualizar variables en Cloudflare Pages |

---

### Datos a recopilar según el tipo

**Si TIPO = A (Next.js en Vercel):**
- URL del proyecto Vercel
- Variables de entorno actuales (pedir `.env.local` o leerlo del workspace)

**Si TIPO = B (React en Cloudflare):**
- URL del proyecto en Cloudflare Pages
- Puerto interno de la app (por defecto 3000 en Vite, o confirmar)
- Variables de entorno actuales

**Si TIPO = C (Next.js estático en Cloudflare):**
- URL del proyecto en Cloudflare Pages
- Confirmar que usa `output: 'export'` en `next.config.js`
- Variables de entorno actuales

---

## FASE 1: Exportar datos de Supabase Cloud

### 1.1 Identificar tablas a migrar
Busca en el código todas las tablas que usa el proyecto:
```bash
grep -r "\.from(" src/ app/ --include="*.ts" --include="*.tsx" | grep -oP "from\(['\"]([^'\"]+)['\"]" | sort -u
```

### 1.2 Exportar schema + data con pg_dump
Desde el droplet (NO desde local por restricciones de red):
```bash
# Conectar al droplet
ssh root@<IP_DROPLET>

# Exportar tablas específicas (ajusta --table según tu proyecto)
pg_dump "postgresql://postgres:<PASSWORD>@db.<PROJECT_ID>.supabase.co:5432/postgres" \
  --table=public.tabla1 \
  --table=public.tabla2 \
  --no-owner --no-acl \
  -f /root/backup.sql
```

> **Nota:** Si hay errores con caracteres especiales, usa CSV para tablas problemáticas:
```bash
# Exportar tabla como CSV desde Supabase Cloud (via psql)
psql "postgresql://postgres:<PASSWORD>@db.<PROJECT_ID>.supabase.co:5432/postgres" \
  -c "\COPY public.tabla1 TO '/root/tabla1.csv' WITH CSV HEADER"
```

### 1.3 Importar en Supabase self-hosted
```bash
# Importar SQL en el container de postgres
docker exec -i supabase-db psql -U postgres -d postgres < /root/backup.sql

# Importar CSV (para tablas con problemas de encoding)
docker exec -i supabase-db psql -U postgres -d postgres \
  -c "\COPY public.tabla1 FROM '/tmp/tabla1.csv' WITH CSV HEADER"
```

> **Si el CSV está en el host (no en el container)**, copia primero:
```bash
docker cp /root/tabla1.csv supabase-db:/tmp/tabla1.csv
```

### 1.4 Verificar conteos
```bash
docker exec -i supabase-db psql -U postgres -d postgres \
  -c "SELECT 'tabla1' as t, count(*) FROM public.tabla1
      UNION ALL SELECT 'tabla2', count(*) FROM public.tabla2;"
```

---

## FASE 2: Preparar el Droplet

### 2.1 Recursos mínimos recomendados
- **Para Supabase + Coolify en el mismo droplet:** 4 vCPUs / 8GB RAM / 160GB Disk
- DigitalOcean: Ubuntu 24.04 LTS

### 2.2 Agregar swap (previene OOM durante builds)
```bash
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

---

## FASE 3: Instalar Coolify

### 3.1 Instalar Docker Compose v2 (requerido por Coolify)
Si el sistema no tiene `docker compose` (solo `docker-compose` v1):
```bash
mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version  # Verificar
```

### 3.2 Instalar Coolify
```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

### 3.3 Resolver conflicto de puertos con Supabase Kong (puerto 8000)
Coolify por defecto usa el puerto 8000, igual que Supabase Kong. Cambiar el puerto de Coolify:
```bash
echo "APP_PORT=8888" >> /data/coolify/source/.env

# Eliminar container anterior y recrear con el nuevo puerto
docker rm -f coolify
docker compose \
  -f /data/coolify/source/docker-compose.yml \
  -f /data/coolify/source/docker-compose.prod.yml \
  up -d coolify
```

Coolify estará en: `http://<IP>:8888`

### 3.4 Conectar container coolify a la red
Si el container coolify no tiene red asignada:
```bash
docker network connect coolify coolify
docker restart coolify
```

---

## FASE 4: Configurar Caddy como proxy único

> Supabase self-hosted ya instala Caddy en el sistema (systemd). Coolify también quiere instalar Traefik en puerto 80/443. La solución es usar el Caddy existente para todo.

### 4.1 Verificar Caddyfile actual
```bash
cat /etc/caddy/Caddyfile
```

### 4.2 Obtener IP interna del container Next.js en Coolify
```bash
# Buscar el container de la app (nombre largo generado por Coolify)
docker ps --format "table {{.Names}}\t{{.Ports}}" | grep -v coolify | grep -v supabase

# Obtener su IP interna
docker inspect <NOMBRE_CONTAINER> --format '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}'
```

### 4.3 Actualizar Caddyfile
```bash
cat > /etc/caddy/Caddyfile << 'EOF'
# Supabase API
bd.tudominio.com {
    reverse_proxy localhost:8000
}

# App Next.js
tudominio.com {
    reverse_proxy <IP_CONTAINER_NEXTJS>:3000
}

# Redirect www
www.tudominio.com {
    redir https://tudominio.com{uri} permanent
}
EOF

systemctl reload caddy
```

> **Importante:** La IP del container cambia al reiniciar. Para hacerlo permanente, asigna una IP estática en el docker-compose de Coolify o usa el hostname del container si está en la misma red que Caddy.

---

## FASE 5: Configurar DNS en Cloudflare

En **DNS → Registros**:

| Tipo | Nombre | Valor | Proxy |
|------|--------|-------|-------|
| A | `@` | `<IP_DROPLET>` | ☁️ Solo DNS (gris) |
| A | `www` | `<IP_DROPLET>` | ☁️ Solo DNS (gris) |
| A | `bd` | `<IP_DROPLET>` | ☁️ Solo DNS (gris) |

> ⚠️ **Desactivar proxy de Cloudflare** (nube naranja → gris) para los registros de la app y Supabase. Caddy maneja SSL con Let's Encrypt directamente.

---

## FASE 6: Configurar app en Coolify

### 6.1 Variables de entorno críticas
En Coolify → tu proyecto → Environment Variables, añadir:

```
NEXT_PUBLIC_SUPABASE_URL=https://bd.tudominio.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY del ~/supabase/docker/.env>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY del ~/supabase/docker/.env>
NIXPACKS_NODE_VERSION=22
```

Para obtener las keys del Supabase self-hosted:
```bash
grep -E "ANON_KEY|SERVICE_ROLE_KEY" ~/supabase/docker/.env
```

### 6.2 Dominio en Coolify
En Configuration → Domains: `https://tudominio.com`

---

## FASE 7: Crear usuario admin en Supabase self-hosted

La tabla `auth.users` del Supabase self-hosted está vacía por defecto (no se migra con el backup).

```bash
# Obtener SERVICE_ROLE_KEY
SERVICE_KEY=$(grep "^SERVICE_ROLE_KEY=" ~/supabase/docker/.env | cut -d= -f2)

# Crear usuario admin
curl -X POST 'http://localhost:8000/auth/v1/admin/users' \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "apikey: $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@tudominio.com",
    "password": "TuPasswordSegura123!",
    "email_confirm": true
  }'
```

---

## FASE 8: Fixes comunes

### supabase-auth en Restarting (password mismatch)
```bash
# Ver error
docker logs supabase-auth 2>&1 | tail -5

# Resetear contraseña del usuario interno
docker exec -i supabase-db psql -U supabase_admin -d postgres \
  -c "ALTER USER supabase_auth_admin WITH PASSWORD '<POSTGRES_PASSWORD>';"

docker restart supabase-auth
```

### supabase-kong no resuelve 'auth' después de reinicio
```bash
docker restart supabase-kong
```

### Container coolify "unhealthy" al iniciar
```bash
# Verificar si está en la red correcta
docker inspect coolify --format '{{json .NetworkSettings.Networks}}'

# Si está vacío {}:
docker network connect coolify coolify
docker restart coolify
```

### IP del container Next.js cambia tras redeploy
Actualizar Caddyfile con la nueva IP:
```bash
NEW_IP=$(docker inspect <NOMBRE_CONTAINER> --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
sed -i "s|reverse_proxy [0-9.]*:3000|reverse_proxy $NEW_IP:3000|" /etc/caddy/Caddyfile
systemctl reload caddy
```

---

## FASE 4B: Configurar Caddy para React (Cloudflare → Coolify)
> Aplica cuando TIPO = B (React/Vite)

Igual que FASE 4 pero el puerto interno del container puede ser **4173** (preview) o **3000** (dev server). Confirmar con:
```bash
docker ps --format "table {{.Names}}\t{{.Ports}}" | grep -v coolify | grep -v supabase
```

El Caddyfile queda igual pero ajustar el puerto:
```
tudominio.com {
    reverse_proxy <IP_CONTAINER>:<PUERTO_REACT>
}
```

### Nota Cloudflare Pages → Coolify
Si el proyecto tenía Workers/Functions en Cloudflare Pages, estas **no migran automáticamente** a Coolify. Deben convertirse a API Routes de la app o a un servicio separado.

---

## FASE 4C: Configurar Caddy para Next.js estático (Cloudflare → Coolify)
> Aplica cuando TIPO = C (Next.js con `output: 'export'`)

Una app con `output: 'export'` genera HTML estático. En Coolify se sirve como sitio estático, no necesita Node en producción.

### Verificar configuración
```bash
# En el proyecto local, confirmar en next.config.js:
grep "output" next.config.js
# Debe mostrar: output: 'export'
```

### Caddyfile para sitio estático
Si Coolify lo sirve como container (con un servidor estático interno en puerto 80):
```
tudominio.com {
    reverse_proxy <IP_CONTAINER>:80
}
```

Si se prefiere servir los archivos directamente con Caddy (sin container):
```
tudominio.com {
    root * /var/www/tudominio
    file_server
}
```

---

## FASE 6B: Variables de entorno para React en Coolify
> Aplica cuando TIPO = B

En React/Vite las variables de entorno públicas usan el prefijo `VITE_` (no `NEXT_PUBLIC_`):
```
VITE_SUPABASE_URL=https://bd.tudominio.com
VITE_SUPABASE_ANON_KEY=<ANON_KEY>
NIXPACKS_NODE_VERSION=22
```

> ⚠️ Si el proyecto usaba `REACT_APP_` (Create React App) o `VITE_`, mantener el mismo prefijo.

---

## FASE 6C: Variables de entorno para Next.js estático en Coolify
> Aplica cuando TIPO = C

Igual que Next.js normal pero las variables `NEXT_PUBLIC_*` se embeben en el build:
```
NEXT_PUBLIC_SUPABASE_URL=https://bd.tudominio.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>
NIXPACKS_NODE_VERSION=22
```

> ⚠️ Con `output: 'export'`, **no hay Server Components ni API Routes**. Asegurarse que el código no use `SUPABASE_SERVICE_ROLE_KEY` en el cliente (solo variables `NEXT_PUBLIC_*`).

---

## PATH ALTERNATIVO: Solo migrar Supabase (sin cambiar hosting)
> Aplica cuando ACCION = 2

Después de completar **FASE 1** (exportar e importar datos), actualizar las variables de entorno de la app para apuntar al Supabase self-hosted:

### Si la app está en Vercel (TIPO = A)
1. En Vercel → Settings → Environment Variables, cambiar:
   ```
   NEXT_PUBLIC_SUPABASE_URL  →  https://bd.tudominio.com
   NEXT_PUBLIC_SUPABASE_ANON_KEY  →  <nueva ANON_KEY del self-hosted>
   SUPABASE_SERVICE_ROLE_KEY  →  <nueva SERVICE_ROLE_KEY del self-hosted>
   ```
2. Actualizar `.env.local` en el proyecto:
   ```bash
   # En el proyecto local
   NEXT_PUBLIC_SUPABASE_URL=https://bd.tudominio.com
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<nueva key>
   SUPABASE_SERVICE_ROLE_KEY=<nueva key>
   ```
3. Hacer redeploy en Vercel para aplicar los cambios.
4. Verificar que la app funciona con el nuevo Supabase.
5. Una vez verificado, deshabilitar el proyecto en Supabase Cloud.

### Si la app está en Cloudflare Pages (TIPO = B o C)
1. En Cloudflare → Pages → tu proyecto → Settings → Environment Variables, cambiar:
   ```
   VITE_SUPABASE_URL  →  https://bd.tudominio.com      (si es React/Vite)
   NEXT_PUBLIC_SUPABASE_URL  →  https://bd.tudominio.com  (si es Next.js)
   ```
2. Hacer un nuevo deploy desde Cloudflare (o trigger manual).
3. Verificar que la app funciona.
4. Deshabilitar proyecto en Supabase Cloud.

---

## Checklist final

- [ ] Todas las tablas tienen el conteo correcto en self-hosted
- [ ] `supabase-auth` en estado Healthy
- [ ] `supabase-kong` en estado Healthy
- [ ] Caddy sirviendo `https://tudominio.com` con SSL válido
- [ ] App Next.js responde correctamente
- [ ] Login de admin funciona
- [ ] Variables de entorno apuntan al Supabase self-hosted
- [ ] DNS actualizado en Cloudflare
- [ ] Vercel desactivado / proyecto eliminado
