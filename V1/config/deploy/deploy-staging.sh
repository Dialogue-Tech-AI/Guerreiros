#!/usr/bin/env bash
# Deploy to staging (EC2).
# Usage: ./config/deploy/deploy-staging.sh
# Requires: SSH_HOST, SSH_USER (or use defaults)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SSH_HOST="${SSH_HOST:-}"
SSH_USER="${SSH_USER:-ec2-user}"

if [[ -z "$SSH_HOST" ]]; then
  echo "Set SSH_HOST (e.g. ec2-xx-xx-xx-xx.compute.amazonaws.com)"
  exit 1
fi

echo "Deploying to staging at $SSH_HOST..."
ssh "${SSH_USER}@${SSH_HOST}" "
  cd altese 2>/dev/null || cd /home/ec2-user/altese 2>/dev/null || { echo 'Project dir not found'; exit 1; }
  git pull
  aws ecr get-login-password --region \${AWS_REGION} | docker login --username AWS --password-stdin \${ECR_REGISTRY}
  docker compose -f config/server/dependencies/docker-compose.yml \
    --env-file config/server/credentials/.env/backend.env \
    --env-file config/server/credentials/.env/ai-worker.env pull
  docker compose -f config/server/dependencies/docker-compose.yml \
    --env-file config/server/credentials/.env/backend.env \
    --env-file config/server/credentials/.env/ai-worker.env up -d
"
echo "Deploy staging done."
