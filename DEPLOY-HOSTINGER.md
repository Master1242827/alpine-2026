# Deploy na Hostinger VPS

Este projeto roda **Node.js** em produção. Não use plano "Hospedagem Compartilhada" — apenas **VPS**.

## 1. Pré-requisitos na VPS

Conecte via SSH (`ssh root@SEU_IP`) e instale:

```bash
# Node 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git nginx certbot python3-certbot-nginx
npm i -g pm2
```

## 2. Subir o código

```bash
cd /var/www
git clone SEU_REPO alpine
cd alpine
npm install
```

## 3. Variáveis de ambiente (`.env` na raiz da VPS)

Crie `/var/www/alpine/.env` com:

```
# Públicas (frontend)
VITE_SUPABASE_URL=https://dxrfmfozqdgvtianmjcu.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_SUPABASE_PROJECT_ID=dxrfmfozqdgvtianmjcu

# Servidor (NUNCA exponha)
SUPABASE_URL=https://dxrfmfozqdgvtianmjcu.supabase.co
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...           # do painel Supabase
MERCADO_PAGO_ACCESS_TOKEN=...
MERCADO_PAGO_WEBHOOK_SECRET=...
MELHOR_ENVIO_TOKEN=...
ADMIN_BOOTSTRAP_CODE=...
LOVABLE_API_KEY=...
PORT=3000
```

Pegue os valores atuais em **Lovable Cloud → Secrets** (são os mesmos usados aqui).

## 4. Build de produção

```bash
npm run build:node
```

Gera:
- `dist/client/` — assets estáticos (servidos pelo nginx)
- `dist/server/index.mjs` — servidor Node SSR + server functions + webhook MP

## 5. Rodar com PM2

```bash
pm2 start dist/server/index.mjs --name alpine --env production
pm2 save
pm2 startup        # cole o comando que ele imprimir
```

Logs: `pm2 logs alpine` · Reiniciar: `pm2 restart alpine`

## 6. Nginx (reverse proxy + domínio)

Crie `/etc/nginx/sites-available/alpine`:

```nginx
server {
    listen 80;
    server_name seudominio.com.br www.seudominio.com.br;

    client_max_body_size 25M;

    # Assets estáticos com cache longo
    location /_build/ {
        alias /var/www/alpine/dist/client/_build/;
        expires 1y;
        access_log off;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Ative e teste:

```bash
ln -s /etc/nginx/sites-available/alpine /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

## 7. SSL grátis (Let's Encrypt)

```bash
certbot --nginx -d seudominio.com.br -d www.seudominio.com.br
```

Renova sozinho. SSL Hostinger não é necessário — Certbot resolve.

## 8. DNS no painel Hostinger

Aponte os registros A do domínio para o IP da VPS:

```
A   @     IP_DA_VPS
A   www   IP_DA_VPS
```

## 9. Webhook do Mercado Pago

Atualize a URL no painel do Mercado Pago para:
```
https://seudominio.com.br/api/public/webhooks/mercadopago
```

## 10. Atualizações futuras

```bash
cd /var/www/alpine
git pull
npm install
npm run build:node
pm2 restart alpine
```

---

## O que NÃO foi alterado

- Nenhuma lógica de negócio (checkout, frete, busca, admin, autenticação)
- Nenhuma tabela do banco
- Nenhuma integração (Supabase, Mercado Pago, Melhor Envio)
- Build padrão da Lovable (preview e publish na Lovable continuam funcionando normalmente)

## O que mudou

| Arquivo | Mudança |
|---|---|
| `vite.config.ts` | Aceita `BUILD_TARGET=node` para gerar build Node nativo via Nitro |
| `package.json` | Adicionou scripts `build:node` e `start:node`; devDep `cross-env` |
| `DEPLOY-HOSTINGER.md` | Este guia |

Nenhum arquivo de aplicação, rota ou server function foi tocado.
