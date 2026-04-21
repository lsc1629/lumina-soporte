# MCP Servers para LuminaSupport

## 1. Stitch MCP (Google Stitch - UI Design)

Conecta agentes IA con tus diseños de UI. Permite extraer contexto de diseño, generar pantallas y mantener consistencia visual.

### Configuración en Windsurf/Cursor

```json
{
  "mcpServers": {
    "stitch": {
      "command": "npx",
      "args": ["-y", "stitch-mcp"],
      "env": {
        "GOOGLE_CLOUD_PROJECT": "TU_PROJECT_ID"
      }
    }
  }
}
```

### Requisitos previos
1. Google Cloud Project con Stitch API habilitada
2. Ejecutar:
   ```bash
   gcloud auth login
   gcloud config set project TU_PROJECT_ID
   gcloud auth application-default set-quota-project TU_PROJECT_ID
   gcloud beta services mcp enable stitch.googleapis.com
   gcloud auth application-default login
   ```

### Herramientas disponibles
- `extract_design_context` - Extraer contexto de diseño de una pantalla
- `fetch_screen_code` - Obtener código de una pantalla
- `fetch_screen_image` - Obtener imagen de una pantalla
- `generate_screen_from_text` - Generar pantalla desde texto
- `create_project` / `list_projects` / `get_project`
- `list_screens` / `get_screen`

### Flujo recomendado
1. **Extraer**: "Obtener contexto de diseño de la pantalla Home..."
2. **Generar**: "Usando ese contexto, generar una pantalla de Chat..."

---

## 2. Lovable MCP Server (Análisis de proyectos)

Servidor MCP no oficial para analizar proyectos generados con Lovable. Herramientas de análisis de componentes, esquemas de base de datos y estructura de proyectos.

### Configuración en Windsurf/Cursor

```json
{
  "mcpServers": {
    "lovable-mcp": {
      "command": "lovable-mcp-server",
      "args": ["--project-path", "/ruta/a/tu/proyecto"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### Instalación
```bash
npm install -g lovable-mcp-server
```

### Herramientas disponibles
- 8 herramientas de análisis (estructura, componentes, DB schema)
- 4 recursos en vivo
- 3 prompts inteligentes
- Seguridad empresarial

### Repositorio
- GitHub: https://github.com/hiromima/lovable-mcp-server
