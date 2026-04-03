# Deploy VPS Ubuntu

Compose unificado para subir a Plataforma Guerreiros na VPS com todas as dependências.

## Pré-requisitos

- Ubuntu 22.04+ com Docker e Docker Compose instalados
- Use `setup-vps.sh` para instalar: `bash setup-vps.sh`

## Configuração

1. **Crie a pasta credentials e copie os exemplos:**
   ```bash
   mkdir -p config/vps/credentials
   cp config/vps/credentials-examples/*.env-example config/vps/credentials/
   cd config/vps/credentials
   mv backend.vps.env-example backend.vps.env
   mv ai-worker.vps.env-example ai-worker.vps.env
   mv whatsapp-service.vps.env-example whatsapp-service.vps.env
   ```

2. **Edite os arquivos e preencha as chaves:**
   - `backend.vps.env` - OPENAI_API_KEY_DEV, JWT_SECRET_DEV, CORS_ORIGIN_DEV, WHATSAPP tokens
   - `ai-worker.vps.env` - OPENAI_API_KEY

## Deploy

**Importante:** Execute sempre da pasta `V1` (onde estao `config/` e `core/`).

### Atualizar e subir
```bash
cd ~/Guerreiros/V1
git pull origin master
docker compose -f docker-compose.vps.yml -f config/vps/compose.override.public-ports.yml down --remove-orphans
for c in guerreiros-minio-init guerreiros-db-init; do docker rm -f $c 2>/dev/null || true; done
docker compose -f docker-compose.vps.yml -f config/vps/compose.override.public-ports.yml up -d --build
```

Ou use o script:
```bash
cd ~/Guerreiros/V1
git pull origin master
bash config/vps/deploy-vps.sh
```

Migrations e seed rodam automaticamente via o servico `db-init` antes do app subir.

**Portas do frontend:** o `docker-compose.vps.yml` já não define `ports` no serviço `frontend`. É obrigatório usar **`compose.override.public-ports.yml`** (VPS com Docker nas portas 80/443) **ou** **`compose.override.host-nginx.yml`** (nginx no host). Não mistures os dois.

## Cloudflare

1. Configure o DNS A record apontando para o IP da VPS
2. Ative o proxy (nuvem laranja) para SSL automático
3. **SSL/TLS**: para **Full** ou **Full (Strict)**, configure certificado de origem. **Obrigatório** - veja `config/vps/ssl/README.md` para instruções detalhadas.

## VPS com nginx no host e outra app (ex.: João em 8081)

Se **80/443 já estão no nginx do host** (e não no Docker), o serviço `frontend` do compose **não pode** mapear `80:80` / `443:443` — o container nem subirá ou ficará em conflito.

1. Suba o Guerreiros com o override de portas (frontend em **8082** no host):

   ```bash
   cd ~/Guerreiros/V1
   docker compose -f docker-compose.vps.yml -f config/vps/compose.override.host-nginx.yml up -d --build
   ```

   Ou use `bash config/vps/deploy-vps-host-nginx.sh`.

2. No **nginx do host**, crie um `server` por domínio: um `proxy_pass` para `127.0.0.1:8081` (João) e outro para `127.0.0.1:8082` (Fabio/Guerreiros). Veja o exemplo em `config/vps/nginx-host-multi-app.example.conf`.

Sem isso, o domínio do Fabio pode cair no mesmo upstream do João e mostrar a UI errada.
