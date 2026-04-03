#!/bin/bash
# ============================================================
# Deploy VPS quando o HOST já usa nginx em 80/443 (multi-app).
# Frontend Guerreiros exposto em 127.0.0.1:8082 → container :80
# ============================================================

set -e

PROJECT_DIR="${GUERREIROS_DIR:-/root/Guerreiros}"
cd "$PROJECT_DIR/V1" || { echo "Erro: pasta $PROJECT_DIR/V1 não encontrada"; exit 1; }

COMPOSE_FILES="-f docker-compose.vps.yml -f config/vps/compose.override.host-nginx.yml"

echo "=== Deploy Plataforma Guerreiros (host nginx / porta 8082) ==="
echo "Diretório: $(pwd)"

echo ""
echo "=== 1. Atualizando código (git pull) ==="
git fetch origin
git pull origin master

echo ""
echo "=== 2. Parando e removendo containers ==="
docker compose $COMPOSE_FILES down --remove-orphans
for c in guerreiros-minio-init guerreiros-db-init; do docker rm -f $c 2>/dev/null || true; done

echo ""
echo "=== 3. Subindo aplicação (build + up) ==="
docker compose $COMPOSE_FILES up -d --build

echo ""
echo "=== 4. Deploy concluído! ==="
docker compose $COMPOSE_FILES ps
echo ""
echo "Frontend Guerreiros deve responder em http://127.0.0.1:8082"
echo "Configure o nginx do host para proxy HTTPS → 127.0.0.1:8082 (ver nginx-host-multi-app.example.conf)."
