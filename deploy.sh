#!/usr/bin/env bash
# deploy.sh — Push a GitHub + dispara CI en Cloudflare Pages
# Uso:  ./deploy.sh "mensaje de commit"
#       ./deploy.sh               (usa mensaje por defecto)

set -euo pipefail

REPO="https://github.com/lsc1629/lumina-soporte.git"
BRANCH="main"
COMMIT_MSG="${1:-deploy: $(date '+%Y-%m-%d %H:%M')}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 1. Verificar que git está inicializado ─────────────────────────────────
cd "$ROOT_DIR"

if [ ! -d ".git" ]; then
  echo "▶ Inicializando repositorio git..."
  git init
  git branch -M "$BRANCH"
fi

# ── 2. Configurar remote si no existe ────────────────────────────────────
if ! git remote get-url origin &>/dev/null; then
  echo "▶ Agregando remote origin → $REPO"
  git remote add origin "$REPO"
else
  echo "✓ Remote origin ya configurado"
fi

# ── 3. Verificar .gitignore tiene .env ───────────────────────────────────
if ! grep -q "^\.env$" .gitignore 2>/dev/null; then
  echo ".env" >> .gitignore
  echo "▶ Agregado .env a .gitignore"
fi
if ! grep -q "app/\.env$" .gitignore 2>/dev/null; then
  echo "app/.env" >> .gitignore
fi

# ── 4. Stage, commit y push ───────────────────────────────────────────────
echo "▶ Staging cambios..."
git add -A

if git diff --cached --quiet; then
  echo "✓ Sin cambios para commitear. Nada que hacer."
  exit 0
fi

echo "▶ Commiteando: $COMMIT_MSG"
git commit -m "$COMMIT_MSG"

echo "▶ Pusheando a $BRANCH..."
git push -u origin "$BRANCH"

echo ""
echo "✅ Push completado. Cloudflare Pages iniciará el build automáticamente."
echo "   → app:     https://dash.cloudflare.com (lumina-support-app)"
echo "   → landing: https://dash.cloudflare.com (lumina-landing)"
