# Ambiente e variáveis – Altese Autopeças

Este projeto usa **envs separados por serviço** e por ambiente (**local** e **server/prod**). Nada de .env solto na raiz.

## 1. Estrutura de arquivos de ambiente

`	ext
config/
  local/
    credentials/
      .env-examples/
        .env.backend.local.example
        .env.ai-worker.local.example
        .env.frontend.local.example
        .env.whatsapp-service.local.example
      .env/
        backend.local.env
        ai-worker.local.env
        frontend.local.env
        whatsapp-service.local.env
  server/
    credentials/
      env.examples/
        .env.backend.prod.example
        .env.ai-worker.prod.example
        .env.frontend.prod.example
        .env.whatsapp-service.prod.example
      env/
        backend.prod.env
        ai-worker.prod.env
        frontend.prod.env
        whatsapp-service.prod.env
` 

- **.env-*.example**: modelos versionados, seguros para ficar no Git.
- ***.local.env / *.prod.env**: arquivos reais, **NÃO versionados** (ignorados pelo .gitignore).

## 2. Backend (Node.js)

### Local – ackend.local.env`r

Principais variáveis (todas com sufixo _DEV):

- **APP_PORT_DEV**: porta HTTP do backend (padrão 3000).
- **DB_*_DEV**: host, porta, usuário, senha e nome do banco PostgreSQL.
- **REDIS_*_DEV**: host, porta, db e senha do Redis.
- **RABBITMQ_*_DEV**: conexão com RabbitMQ local.
- **MINIO_*_DEV / MINIO_BUCKET_*_DEV**: endpoint, porta e buckets do MinIO.
- **JWT_SECRET_DEV**: segredo JWT (apenas para desenvolvimento).
- **OPENAI_API_KEY_DEV**: chave da OpenAI usada pelo backend.
- **INTERNAL_API_KEY_DEV**: chave interna para chamadas autenticadas entre serviços.
- **CORS_ORIGIN_DEV**: origens permitidas (ex.: http://localhost:5173).

O load-env.ts converte essas variáveis com _DEV em variáveis efetivas (DB_HOST, REDIS_HOST, etc.) usando IS_PRODUCTION=false.

### Server/Prod – ackend.prod.env`r

Segue o mesmo padrão com sufixo _PROD:

- **DB_*_PROD**: apontando para RDS.
- **REDIS_*_PROD**: apontando para ElastiCache.
- **S3_BUCKET_*_PROD**: buckets S3 para mídia, anexos e logs.
- **SQS_QUEUE_*_PROD**: filas SQS usadas no lugar de RabbitMQ.
- **JWT_SECRET_PROD**, **OPENAI_API_KEY_PROD**, **INTERNAL_API_KEY_PROD**, etc.

Em produção, o docker-compose server lê ackend.prod.env via --env-file e o backend roda com IS_PRODUCTION=true/NODE_ENV=production.

## 3. AI Worker (Python)

### Local – i-worker.local.env`r

- **RABBITMQ_URL**: URL do RabbitMQ local.
- **POSTGRES_URL**: URL do PostgreSQL local.
- **REDIS_HOST / REDIS_PORT / REDIS_DB**: conexão com Redis.
- **QDRANT_HOST / QDRANT_PORT**: conexão com Qdrant.
- **OPENAI_API_KEY**: chave da OpenAI usada pelo worker.
- **NODE_API_URL**: URL do backend (ex.: http://localhost:3000).
- **INTERNAL_API_KEY**: deve bater com o backend.

O settings.py procura primeiro config/local/credentials/.env/ai-worker.local.env e, em produção, config/server/credentials/env/ai-worker.prod.env.

### Server/Prod – i-worker.prod.env`r

- **USE_SQS=true** e URLs das filas SQS (SQS_QUEUE_AI_MESSAGES_URL, etc.).
- **POSTGRES_URL** apontando para RDS.
- **REDIS_HOST** apontando para ElastiCache.
- **QDRANT_HOST=qdrant** (nome do serviço no docker-compose server).
- **NODE_API_URL=http://app:3000**.

## 4. WhatsApp Service (Python/FastAPI)

### Local – whatsapp-service.local.env`r

- **BACKEND_WEBHOOK_URL**: URL HTTP para webhook no backend, ex.: http://localhost:3000/api/whatsapp/webhook.

### Server/Prod – whatsapp-service.prod.env`r

- **BACKEND_WEBHOOK_URL=http://app:3000/api/whatsapp/webhook** (hostname interno do serviço pp no Compose).

## 5. Frontend (Vite/React)

### Local – rontend.local.env`r

- **VITE_API_URL**: URL base da API usada pelo frontend em dev.
  - Ex.: http://localhost:3000/api ou simplesmente /api quando o Vite faz proxy.

Este arquivo é copiado para core/services/frontend/.env.development.

### Server/Prod – rontend.prod.env`r

- Em produção atrás de Nginx o mais comum é usar VITE_API_URL=/api (mesma origem, apenas caminho).

## 6. Resumo rápido – passos para configurar envs

### Dev

`ash
# Backend
copy config\local\credentials\.env-examples\.env.backend.local.example config\local\credentials\.env\backend.local.env

# AI Worker
copy config\local\credentials\.env-examples\.env.ai-worker.local.example config\local\credentials\.env\ai-worker.local.env

# WhatsApp Service
copy config\local\credentials\.env-examples\.env.whatsapp-service.local.example config\local\credentials\.env\whatsapp-service.local.env

# Frontend
copy config\local\credentials\.env-examples\.env.frontend.local.example config\local\credentials\.env\frontend.local.env
` 

### Prod/Server

`ash
# Backend
copy config\server\credentials\env.examples\.env.backend.prod.example config\server\credentials\env\backend.prod.env

# AI Worker
copy config\server\credentials\env.examples\.env.ai-worker.prod.example config\server\credentials\env\ai-worker.prod.env

# WhatsApp Service
copy config\server\credentials\env.examples\.env.whatsapp-service.prod.example config\server\credentials\env\whatsapp-service.prod.env

# Frontend (build)
copy config\server\credentials\env.examples\.env.frontend.prod.example config\server\credentials\env\frontend.prod.env
` 

Depois de copiar, edite cada arquivo e preencha os valores reais (NUNCA commitar esses .env).
