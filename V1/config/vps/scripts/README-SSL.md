# SSL na VPS (Cloudflare Full/Full Strict)

Para usar **Full** ou **Full (Strict)** no Cloudflare (sem Flexible), o servidor precisa de HTTPS.

## 1. Obter Origin CA Key

1. Cloudflare Dashboard → **Profile** (ícone) → **API Tokens**
2. Em **API Keys**, clique em **Origin CA Key** → **View**
3. Copie a chave (começa com `v1.0-`)

## 2. Rodar o script na VPS

```bash
cd ~/Guerreiros/V1
git pull origin master

# Exportar a chave (substitua pela sua)
export CLOUDFLARE_ORIGIN_CA_KEY="v1.0-SUA_CHAVE_AQUI"

# Rodar o script (cria /root/Guerreiros/ssl/origin.pem e origin.key)
chmod +x config/vps/scripts/create-origin-cert.sh
./config/vps/scripts/create-origin-cert.sh
```

**Alternativa com API Token:** crie um token com permissão Zone > SSL and Certificates > Edit e use:
```bash
export CLOUDFLARE_API_TOKEN="seu_token"
./config/vps/scripts/create-origin-cert.sh
```

## 3. Subir os containers

```bash
cd ~/Guerreiros/V1
docker compose -f docker-compose.vps.yml down
docker compose -f docker-compose.vps.yml up -d --build
```

## 4. Cloudflare

- SSL/TLS → Overview → **Full** ou **Full (Strict)**
