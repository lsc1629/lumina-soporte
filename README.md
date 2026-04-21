# LuminaSupport

Plataforma de mantenimiento proactivo y reactivo para sitios web de clientes (WordPress, Shopify, Next.js, etc).

**por Luis Salas Cortés**

## Stack Tecnológico

- **Frontend**: React 19 + TypeScript + Vite 6
- **Estilos**: TailwindCSS v4 (CSS-first config)
- **Animaciones**: motion/react
- **Iconos**: Lucide React
- **Gráficos**: Recharts
- **Base de datos**: Supabase (PostgreSQL + Auth + RLS)
- **Deploy**: Cloudflare Pages

## Inicio Rápido

```bash
# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de Supabase

# Iniciar servidor de desarrollo
npm run dev
```

## Base de Datos (Supabase)

**Nombre de la base de datos a crear**: `lumina_support`

El SQL de las tablas se encuentra en:
- `supabase/migrations/00001_create_users_and_profiles.sql`

### Tablas principales:
- **profiles** - Perfiles de usuario vinculados a `auth.users` con roles (`admin` / `client`)

Para ejecutar la migración en Supabase:
1. Crear proyecto en [supabase.com](https://supabase.com) con nombre `lumina_support`
2. Ir a SQL Editor y ejecutar el contenido de la migración
3. Copiar `SUPABASE_URL` y `SUPABASE_ANON_KEY` a tu `.env`

## Variables de Entorno

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

## MCP Servers (UI)

Documentación de configuración en `.windsurf/mcp_servers.md`:
- **Stitch MCP** (Google) - Diseño de UI con IA
- **Lovable MCP** - Análisis de proyectos React/Supabase

## Estructura del Proyecto

```
├── src/
│   ├── components/     # Componentes React
│   ├── hooks/          # Custom hooks
│   ├── lib/            # Utilidades y cliente Supabase
│   ├── types/          # Tipos TypeScript
│   ├── App.tsx         # Componente raíz
│   ├── main.tsx        # Entry point
│   └── index.css       # Estilos globales + Tailwind
├── supabase/
│   └── migrations/     # SQL migrations
├── .windsurf/
│   └── mcp_servers.md  # Config MCP servers
└── public/             # Assets estáticos
```

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run preview` | Preview del build |
| `npm run lint` | Linting con ESLint |
