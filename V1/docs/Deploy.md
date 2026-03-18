# Deploy em produção (AWS/EC2 + Docker)

Guia resumido para fazer o deploy da stack em produção usando imagens no ECR e Docker Compose em uma instância EC2.

## 1. Pré-requisitos

- Conta AWS com acesso a:
  - **ECR** (Elastic Container Registry)
  - **RDS PostgreSQL**
  - **ElastiCache Redis**
  - **SQS**
  - **S3** (buckets de mídia/anexos/logs)
- Instância **EC2** com Docker + docker-compose-plugin instalados
- Domínio / DNS configurado (opcional, recomendado)

## 2. Build e push das imagens para o ECR

Do seu ambiente local (ou de uma máquina de CI):

`ash
# 1) Criar repositórios (uma vez)
aws ecr create-repository --repository-name altese-app
aws ecr create-repository --repository-name altese-ai-worker
aws ecr create-repository --repository-name altese-whatsapp
aws ecr create-repository --repository-name altese-frontend

# 2) Login no ECR
aws ecr get-login-password --region <REGION> \
  | docker login --username AWS --password-stdin <ACCOUNT>.dkr.ecr.<REGION>.amazonaws.com

# 3) Definir ECR_REGISTRY e rodar script de build/push
export ECR_REGISTRY=<ACCOUNT>.dkr.ecr.<REGION>.amazonaws.com
./config/server/scripts/ec2/build-push-ecr.sh
`

O script uild-push-ecr.sh faz build das 4 imagens (ltese-app, ltese-ai-worker, ltese-frontend, ltese-whatsapp) usando os Dockerfiles em config/dockerfiles/ e faz push para o ECR.

## 3. Configurar envs de produção na EC2

Na EC2, dentro da pasta do projeto (ex.: /home/ec2-user/altese), crie os envs a partir dos exemplos:

`ash
# Backend
copy config/server/credentials/env.examples/.env.backend.prod.example config/server/credentials/env/backend.prod.env

# AI Worker
copy config/server/credentials/env.examples/.env.ai-worker.prod.example config/server/credentials/env/ai-worker.prod.env

# WhatsApp Service
copy config/server/credentials/env.examples/.env.whatsapp-service.prod.example config/server/credentials/env/whatsapp-service.prod.env

# Frontend (build)
copy config/server/credentials/env.examples/.env.frontend.prod.example config/server/credentials/env/frontend.prod.env
`

Depois, edite **cada** arquivo e preencha:

- Dados de **RDS** (DB_*_PROD, POSTGRES_URL).
- Dados de **ElastiCache Redis** (REDIS_*_PROD).
- URLs das filas **SQS** (SQS_QUEUE_*_PROD).
- Buckets **S3** (S3_BUCKET_*_PROD).
- Segredos de segurança: JWT_SECRET_PROD, OPENAI_API_KEY_PROD, INTERNAL_API_KEY_PROD, etc.

Para mais detalhes de cada variável, veja ENVIRONMENT.md.

## 4. Subir stack na EC2 com Docker Compose

Na EC2, a partir da raiz do projeto:

`ash
export ECR_REGISTRY=<ACCOUNT>.dkr.ecr.<REGION>.amazonaws.com

docker compose -f config/server/dependencies/docker-compose.yml \
  --env-file config/server/credentials/env/backend.prod.env \
  --env-file config/server/credentials/env/ai-worker.prod.env up -d
`

O docker-compose server sobe:

- **app** (backend Node.js)
- **ai-worker** (worker de IA)
- **whatsapp-service** (serviço WhatsApp)
- **qdrant** (DB vetorial)
- **frontend** (container Nginx com build do React)

Postgres, Redis, RabbitMQ e MinIO não rodam na EC2 nesse compose – são externos (RDS, ElastiCache, SQS, S3).

## 5. Scripts de deploy remoto

Você pode usar os scripts em config/deploy/ para rodar o deploy via SSH:

- config/deploy/deploy-staging.sh
- config/deploy/deploy-prod.sh

Eles fazem, de forma resumida:

1. **SSH** na EC2 (SSH_HOST / SSH_USER).
2. git pull na branch correta.
3. Login no ECR com AWS_REGION e ECR_REGISTRY.
4. docker compose ... up -d com os envs corretos.

Ajuste SSH_HOST, variáveis de ambiente e secrets do GitHub conforme o ambiente (staging/prod).

