# Altese Autope�as � Sistema de Atendimento H�brido

Sistema de atendimento via WhatsApp que combina IA (OpenAI) com atendimento humano supervisionado para a **Altese Autope�as**.

## Vis�o geral do projeto

- **Objetivo**: centralizar atendimentos de WhatsApp, automatizar parte das conversas com IA e dar ferramentas de opera��o para vendedores, supervisores e administradores.
- **Canais**: WhatsApp n�o-oficial (Baileys) e/ou API oficial Meta.
- **Recursos principais**:
  - Triagem e roteamento de atendimentos (fila, afinidade, supervisores).
  - Painel web para vendedores/supervisores/admin (frontend React).
  - Worker de IA para respostas autom�ticas, mem�ria e workflows.
  - Armazenamento de m�dias em MinIO/S3 e vetores em Qdrant.

## Stack t�cnica

- **Backend**: Node.js + TypeScript, Express, Socket.IO, TypeORM, PostgreSQL, Redis, RabbitMQ, MinIO/S3, Qdrant, OpenAI API.
- **Frontend**: React + Vite + TypeScript, Tailwind, Zustand, React Router, Socket.IO Client.
- **AI Worker**: Python 3.12, LangChain, LangGraph, OpenAI, Qdrant.
- **WhatsApp Service**: FastAPI, integra��o com Baileys/cliente n�o-oficial.
- **Infraestrutura**:
  - Docker Compose para ambiente local (config/local/dependencies/docker-compose.yml).
  - Docker Compose para server/EC2 (config/server/dependencies/docker-compose.yml).
  - Env files separados por servi�o em config/local|server/credentials/env/.

## Estrutura de pastas (alto n�vel)

`	ext
projeto/
+-- core/
�   +-- services/
�   �   +-- backend/
�   �   +-- frontend/
�   �   +-- ai-worker/
�   �   +-- whatsapp-service/
�   +-- shared/
�       +-- database/        # init.sql, migrations, seeds
+-- config/
�   +-- local/               # dev: docker-compose, scripts, envs
�   +-- server/              # prod: docker-compose, scripts EC2, envs
�   +-- dockerfiles/         # Dockerfiles centralizados
�   +-- deploy/              # scripts de deploy
+-- docs/                   # documenta��o do projeto
` 

## Pr�ximos passos

- Ler docs/ENVIRONMENT.md para entender o modelo de .env separados por servi�o.
- Seguir docs/GETTING_STARTED.md para subir o ambiente local.
- Para deploy em produ��o, ver docs/DEPLOY.md.
