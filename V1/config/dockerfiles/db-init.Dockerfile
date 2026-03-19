# DB Init - Roda migrations e seed (usa contexto core/)
FROM node:20-alpine

WORKDIR /app

# Copiar backend
COPY services/backend/package*.json ./
RUN npm ci

# Copiar codigo
COPY services/backend/ ./
COPY shared/ ./shared/

# Variaveis para migrations/seed (sobrescritas pelo env_file no compose)
ENV NODE_ENV=development
ENV PYTHONUNBUFFERED=1

# Rodar migrations e seed
CMD ["sh", "-c", "npx ts-node scripts/db/run-migrations.ts && npx ts-node --project tsconfig.seed.json scripts/seed/index.ts"]
