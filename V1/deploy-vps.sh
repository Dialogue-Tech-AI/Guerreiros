#!/bin/bash
# Deploy na VPS - executar da pasta V1
# Uso: ./deploy-vps.sh   ou   bash deploy-vps.sh

set -e
cd "$(dirname "$0")"

echo "=== Deploy Plataforma Guerreiros ==="
echo "Diretorio: $(pwd)"
echo ""

docker compose -f docker-compose.vps.yml up -d --build

echo ""
echo "=== Deploy concluido ==="
echo "Acesse: http://$(hostname -I | awk '{print $1}')"
