# Certificados SSL - Cloudflare Full (Strict)

Para usar Cloudflare em modo **Full** ou **Full (Strict)**, coloque aqui o **Cloudflare Origin Certificate**.

**IMPORTANTE:** Sem `origin.pem` e `origin.key`, o nginx não ativa HTTPS. O domínio não funcionará com Cloudflare Full.

## Como obter e instalar

### 1. Criar certificado no Cloudflare
- Cloudflare Dashboard → seu domínio → **SSL/TLS** → **Origin Server**
- Clique em **Create Certificate**
- Deixe os valores padrão (RSA, 15 anos) e confirme

### 2. Salvar na VPS (dentro desta pasta)

```bash
cd ~/Guerreiros/V1/config/vps/ssl
```

**Criar origin.pem** – cole o **Origin Certificate** completo (inclui BEGIN/END):
```bash
nano origin.pem
# Cole o certificado, salve (Ctrl+O, Enter) e saia (Ctrl+X)
```

**Criar origin.key** – cole o **Private Key** completo (inclui BEGIN/END):
```bash
nano origin.key
# Cole a chave privada, salve e saia
```

### 3. Verificar se os arquivos existem
```bash
ls -la ~/Guerreiros/V1/config/vps/ssl/
# Deve mostrar: origin.pem  origin.key  README.md
```

### 4. Reiniciar o frontend
```bash
cd ~/Guerreiros/V1
docker compose -f docker-compose.vps.yml up -d --force-recreate frontend
```

### 5. Confirmar que SSL está ativo
```bash
docker exec guerreiros-frontend ls -la /etc/nginx/conf.d/
# Deve existir nginx-ssl.conf (SEM .disabled)
```
