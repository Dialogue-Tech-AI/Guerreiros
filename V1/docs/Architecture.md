# Arquitetura – Altese Autopeças

## Visão geral

Sistema de atendimento via WhatsApp combinando IA (OpenAI) com atendimento humano supervisionado.

## Estrutura de pastas

`	ext
projeto/
+-- core/
¦   +-- services/
¦   ¦   +-- backend/          # Node.js, Express, TypeORM
¦   ¦   +-- frontend/         # React, Vite, Tailwind
¦   ¦   +-- ai-worker/        # Python, LangChain, LangGraph
¦   ¦   +-- whatsapp-service/ # FastAPI
¦   +-- shared/
¦       +-- database/         # init.sql, migrations, seeds
+-- config/
¦   +-- local/                # Dev: docker-compose, Cloudflare, scripts, envs
¦   +-- server/               # Prod: docker-compose, scripts EC2, envs
¦   +-- dockerfiles/          # Dockerfiles centralizados
¦   +-- deploy/               # Scripts de deploy
+-- docs/                     # Documentação do projeto
`

## Componentes principais

| Componente        | Tecnologia                         | Porta | Descrição                                      |
|-------------------|------------------------------------|-------|------------------------------------------------|
| Backend           | Node.js, Express, TypeORM          | 3000  | API REST, Socket.IO, orquestração              |
| Frontend          | React, Vite, Tailwind              | 5173  | Dashboard vendedor/supervisor/admin            |
| AI Worker         | Python, LangChain, LangGraph       | -     | Processamento de mensagens com IA              |
| WhatsApp Service  | FastAPI                            | 5000  | Conexão WhatsApp (Baileys/Oficial)             |
| PostgreSQL        | Postgres                           | 5432  | Banco de dados relacional                      |
| Redis             | Redis                              | 6379  | Cache e pub/sub                                |
| RabbitMQ / SQS    | RabbitMQ (dev) / SQS (prod)        | 5672  | Filas de mensagens                             |
| MinIO / S3        | MinIO (dev) / S3 (prod)            | 9000  | Armazenamento de mídias/anexos/logs            |
| Qdrant            | Qdrant                             | 6333  | Banco vetorial para memória de IA              |

## Fluxo de mensagens (alto nível)

1. Cliente envia mensagem via WhatsApp.
2. whatsapp-service (ou webhook oficial Meta) recebe e envia a mensagem para o **backend**.
3. Backend cria/atualiza o **atendimento**, persiste a mensagem e notifica o frontend via **Socket.IO**.
4. Backend publica uma mensagem em fila (RabbitMQ em dev, SQS em prod).
5. **AI Worker** consome da fila, usa OpenAI + Qdrant + contexto do atendimento para gerar a resposta.
6. Worker envia a resposta de volta para o backend (via API interna autenticada).
7. Backend salva a resposta, envia para o cliente via whatsapp-service e notifica o frontend em tempo real.

## Módulos principais do backend (core/services/backend/src/modules)

- **attendance** – Atendimentos, triagem, roteamento e estados.
- **auth** – Autenticação JWT e perfis de usuário.
- **message** – Mensagens, mídias, integração com storage.
- **ai** – Configurações de IA, workflows, biblioteca, roteamento de intents.
- **whatsapp** – Integração com WhatsApp (oficial + não-oficial).
- **notification** – Notificações em tempo real para o frontend.

## Ambientes

- **Desenvolvimento (local)**:
  - Infra Docker em config/local/dependencies/docker-compose.yml.
  - Env files em config/local/credentials/.env/*.local.env.
  - Backend e frontend rodando em 
pm run dev.

- **Produção (server/EC2)**:
  - Imagens Docker no ECR (script config/server/scripts/ec2/build-push-ecr.sh).
  - Docker Compose em config/server/dependencies/docker-compose.yml.
  - Env files em config/server/credentials/env/*.prod.env.
  - Serviços externos gerenciados pela AWS (RDS, ElastiCache, SQS, S3).

Para detalhes de configuração de ambiente, veja ENVIRONMENT.md. Para subir o projeto localmente, siga GETTING_STARTED.md.
