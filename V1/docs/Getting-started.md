# Getting Started – Ambiente local

Passo a passo para rodar o projeto localmente.

## 1. Pré-requisitos

- Node.js >= 18
- Docker + Docker Compose
- Git
- Chave da OpenAI (para testes de IA)

## 2. Clonar o repositório

`ash
git clone <repository-url>
cd Teste-3
` 

## 3. Instalar dependências

`ash
# Backend
cd core/services/backend && npm install && cd ../../..

# Frontend
cd core/services/frontend && npm install && cd ../../..
` 

## 4. Configurar envs locais

Use os templates em config/local/credentials/.env-examples/ para criar os .env reais em config/local/credentials/.env/:

`ash
# Backend
copy config\local\credentials\.env-examples\.env.backend.local.example config\local\credentials\.env\backend.local.env

# AI Worker
copy config\local\credentials\.env-examples\.env.ai-worker.local.example config\local\credentials\.env\ai-worker.local.env

# WhatsApp Service
copy config\local\credentials\.env-examples\.env.whatsapp-service.local.example config\local\credentials\.env\whatsapp-service.local.env

# Frontend (.env.development)
copy config\local\credentials\.env-examples\.env.frontend.local.example core\services\frontend\.env.development
` 

Depois disso, edite **pelo menos**:

- ackend.local.env: OPENAI_API_KEY_DEV, INTERNAL_API_KEY_DEV, DB_*_DEV, REDIS_*_DEV etc.
- i-worker.local.env: OPENAI_API_KEY, INTERNAL_API_KEY, RABBITMQ_URL, POSTGRES_URL etc.
- whatsapp-service.local.env: BACKEND_WEBHOOK_URL (normalmente http://localhost:3000/api/whatsapp/webhook).

Para detalhes de cada variável, veja ENVIRONMENT.md.

## 5. Subir infraestrutura Docker (Postgres, Redis, RabbitMQ, MinIO, Qdrant)

A partir do backend:

`ash
cd core/services/backend
npm run docker:up
` 

Isso usa config/local/dependencies/docker-compose.yml para subir:

- Postgres (5432)
- Redis (6379)
- RabbitMQ (5672, UI em 15672)
- MinIO (9000 / 9001)
- Qdrant (6333)

## 6. Rodar migrations e seeds

Ainda no backend:

`ash
npm run migration:run
npm run seed:run
` 

## 7. Subir backend e frontend

`ash
# Terminal 1 – Backend
cd core/services/backend
npm run dev

# Terminal 2 – Frontend
cd core/services/frontend
npm run dev
` 

- Backend: http://localhost:3000`r
- Frontend: http://localhost:5173`r
- Health: http://localhost:3000/health`r

## 8. (Opcional) Túnel Cloudflare para expor local

1. Configure config/local/dependencies/config.dev.yaml com seu tunnel ID/domínios.
2. Rode no Windows: config\local\scripts\windows\start-tunnel.bat.
3. Rode em Unix/macOS: config/local/scripts/unix/start-tunnel.sh.

Para mais detalhes, consulte a documentação específica de Cloudflare (a ser adicionada).
