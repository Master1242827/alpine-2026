# Deploy completo na VPS Hostinger — passo a passo

Guia para copiar e colar. O caminho mais rápido é usar o script `scripts/setup-external-server.sh` (veja o atalho no final deste arquivo). Se preferir fazer manualmente, siga os passos abaixo.

Substitua **apenas** estes 3 valores onde aparecerem:

- `SEU_IP` → IP público da VPS (painel Hostinger → VPS → Visão geral)
- `seudominio.com.br` → seu domínio
- `seu@email.com` → seu e-mail (usado pelo Certbot)

E o repositório Git do projeto (passo 4).

---

## 1. Conectar na VPS via SSH

No seu computador (PowerShell, Terminal ou Git Bash):

```bash
ssh root@SEU_IP
```

Digite a senha definida no painel da Hostinger. Todos os comandos abaixo são executados **dentro da VPS**.

---

## 2. Atualizar o sistema e instalar dependências base

```bash
apt update && apt upgrade -y
apt install -y curl git build-essential ufw
```

---

## 3. Instalar Node.js 20, PM2, Nginx e Certbot

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs nginx certbot python3-certbot-nginx
npm install -g pm2
node -v && npm -v && nginx -v
```

Você deve ver as versões impressas sem erro.

---

## 4. Configurar o firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status
```

---

## 5. Clonar o projeto

Substitua a URL pelo seu repositório real (GitHub conectado à Lovable, por exemplo):

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/SEU_USUARIO/SEU_REPO.git alpine
cd alpine
```

> Se o repositório for privado, gere um token de acesso pessoal no GitHub e use:
> `git clone https://USUARIO:TOKEN@github.com/SEU_USUARIO/SEU_REPO.git alpine`

---

## 6. Instalar as dependências do projeto

```bash
npm install
```

---

## 7. Criar o arquivo `.env` com as variáveis de ambiente

```bash
nano /var/www/alpine/.env
```

Cole o bloco abaixo, **substituindo cada `COLE_AQUI_...` pelo valor real**.

> **Modo espelhado (recomendado para servidores fora do Lovable):** você não precisa da `SUPABASE_SERVICE_ROLE_KEY` nem do `MERCADO_PAGO_ACCESS_TOKEN` na VPS. O servidor externo usa a API pública do Lovable para pagamentos, frete e admin. Copie `CHECKOUT_API_BASE_URL` e `CHECKOUT_API_TOKEN` em **Admin → Pagamentos → Conexão do servidor externo**.

```env
# Públicas (frontend)
VITE_SUPABASE_URL=https://dxrfmfozqdgvtianmjcu.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=COLE_AQUI_PUBLISHABLE_KEY
VITE_SUPABASE_PROJECT_ID=dxrfmfozqdgvtianmjcu

# Servidor (NUNCA expor publicamente)
SUPABASE_URL=https://dxrfmfozqdgvtianmjcu.supabase.co
SUPABASE_PUBLISHABLE_KEY=COLE_AQUI_PUBLISHABLE_KEY

# Opcional — só se este servidor for acessar o banco diretamente
# SUPABASE_SERVICE_ROLE_KEY=COLE_AQUI_SERVICE_ROLE_KEY

# Conexão com a instalação principal (modo espelhado)
CHECKOUT_API_BASE_URL=https://project--b370b26e-0ef1-41ec-ae73-c00c6755b5d3.lovable.app/api/public/checkout
CHECKOUT_API_TOKEN=COLE_AQUI_CHECKOUT_API_TOKEN
ADMIN_API_BASE_URL=https://project--b370b26e-0ef1-41ec-ae73-c00c6755b5d3.lovable.app/api/public/admin
ADMIN_API_TOKEN=COLE_AQUI_ADMIN_API_TOKEN

# Mercado Pago — só necessário se este servidor processar pagamentos sozinho
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_PUBLIC_KEY=COLE_AQUI_MP_PUBLIC_KEY
MERCADO_PAGO_WEBHOOK_SECRET=
MELHOR_ENVIO_TOKEN=

# Frete (fallback local, opcional)
FRENET_TOKEN=
ORIGIN_CEP=

# Segurança da sessão administrativa
ADMIN_SESSION_SECRET=COLE_AQUI_UMA_STRING_FORTE
SESSION_SECRET=COLE_AQUI_UMA_STRING_FORTE

# Outros
ADMIN_BOOTSTRAP_CODE=COLE_AQUI_ADMIN_CODE
LOVABLE_API_KEY=COLE_AQUI_LOVABLE_API_KEY

# Servidor Node
PORT=3000
NODE_ENV=production
```

Salvar e sair do nano: **Ctrl + O**, **Enter**, **Ctrl + X**.

Proteja o arquivo:

```bash
chmod 600 /var/www/alpine/.env
```

---

## 8. Gerar o build de produção (Node)

```bash
cd /var/www/alpine
npm run build:node
```

Ao final você terá:
- `dist/client/` → assets estáticos
- `dist/server/index.mjs` → servidor Node SSR + APIs + webhook MP

---

## 9. Iniciar o servidor com PM2

```bash
cd /var/www/alpine
pm2 start dist/server/index.mjs --name alpine --update-env
pm2 save
pm2 startup systemd -u root --hp /root
```

O último comando imprime uma linha que começa com `sudo env PATH=...`. **Copie e execute essa linha exata** — é ela que registra o PM2 para subir sozinho após reboot.

Depois confirme:

```bash
pm2 save
pm2 status
curl -I http://127.0.0.1:3000
```

Você deve ver `HTTP/1.1 200 OK` (ou 3xx).

---

## 10. Configurar o DNS do domínio

No painel onde você comprou o domínio (Hostinger, Registro.br, etc.), crie/edite os registros:

| Tipo | Nome | Valor      | TTL    |
|------|------|------------|--------|
| A    | @    | SEU_IP     | 3600   |
| A    | www  | SEU_IP     | 3600   |

A propagação leva de minutos a algumas horas. Confirme com:

```bash
dig +short seudominio.com.br
dig +short www.seudominio.com.br
```

Ambos devem retornar `SEU_IP`. **Não prossiga para o SSL antes disso.**

---

## 11. Configurar o Nginx como proxy reverso

```bash
cat > /etc/nginx/sites-available/alpine <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name seudominio.com.br www.seudominio.com.br;

    client_max_body_size 25M;

    # Cache para assets estáticos com hash (Vite)
    location /assets/ {
        alias /var/www/alpine/dist/client/assets/;
        expires 1y;
        access_log off;
        add_header Cache-Control "public, immutable";
    }

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
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
    }
}
NGINX

# Substitui o placeholder pelo seu domínio
sed -i 's/seudominio.com.br/seudominio.com.br/g' /etc/nginx/sites-available/alpine

# Ativa o site e desativa o default
ln -sf /etc/nginx/sites-available/alpine /etc/nginx/sites-enabled/alpine
rm -f /etc/nginx/sites-enabled/default

# Testa e recarrega
nginx -t && systemctl reload nginx
```

> Antes de colar, edite o bloco e troque `seudominio.com.br` nas duas ocorrências da linha `server_name` pelo seu domínio real.

Teste pelo navegador: `http://seudominio.com.br` deve abrir o site.

---

## 12. Instalar SSL grátis com Certbot (HTTPS)

```bash
certbot --nginx \
  -d seudominio.com.br \
  -d www.seudominio.com.br \
  --non-interactive --agree-tos -m seu@email.com --redirect
```

O Certbot edita o Nginx automaticamente para forçar HTTPS. Teste a renovação automática:

```bash
certbot renew --dry-run
```

A renovação roda sozinha via systemd timer. Confirme:

```bash
systemctl list-timers | grep certbot
```

---

## 13. Atualizar a URL do webhook no Mercado Pago

No painel do Mercado Pago (Suas integrações → sua aplicação → Webhooks), troque a URL para:

```
https://seudominio.com.br/api/public/webhooks/mercadopago
```

---

## 14. Verificação final

```bash
pm2 status
systemctl status nginx --no-pager
curl -I https://seudominio.com.br
```

Esperado: PM2 mostra `alpine` como `online`, nginx `active (running)`, e o curl retorna `HTTP/2 200`.

Abra no navegador: **https://seudominio.com.br** 🎉

---

## Inicialização automática após reboot

Já configurado nos passos 9 (PM2 + systemd) e 11 (nginx é serviço systemd). Para testar:

```bash
reboot
```

Aguarde ~1 min, reconecte via SSH e rode:

```bash
pm2 status
systemctl status nginx --no-pager
```

Ambos devem estar rodando sem precisar de comando manual.

---

## Atualizações futuras (deploy de novas versões)

Sempre que houver mudanças no código:

```bash
cd /var/www/alpine
git pull
npm install
npm run build:node
pm2 restart alpine --update-env
```

Pronto — sem downtime perceptível.

---

## Comandos úteis do dia a dia

| Ação                          | Comando                                  |
|-------------------------------|------------------------------------------|
| Ver logs do app em tempo real | `pm2 logs alpine`                        |
| Ver últimas 200 linhas        | `pm2 logs alpine --lines 200 --nostream` |
| Reiniciar o app               | `pm2 restart alpine --update-env`        |
| Parar o app                   | `pm2 stop alpine`                        |
| Status geral                  | `pm2 status`                             |
| Recarregar nginx              | `systemctl reload nginx`                 |
| Ver erros do nginx            | `tail -f /var/log/nginx/error.log`       |
| Editar `.env`                 | `nano /var/www/alpine/.env` → `pm2 restart alpine --update-env` |

---

## Troubleshooting rápido

- **403 Forbidden** → normalmente é permissão/dono de pasta ou Nginx apontando para a pasta errada. Rode:
  `cd /var/www/alpine && sudo bash scripts/fix-hostinger-403.sh /var/www/alpine seudominio.com.br 3000`
- **502 Bad Gateway no navegador** → o app não está rodando. `pm2 logs alpine` para ver o erro.
- **SSL falhou no Certbot** → DNS ainda não propagou. Aguarde e rode o comando do passo 12 novamente.
- **Pedidos travados em "pendente"** → URL do webhook do Mercado Pago não foi atualizada (passo 13).
- **Mudou variável no `.env`** → `pm2 restart alpine --update-env` (sem `--update-env` o PM2 não recarrega o env).
- **Build estourou memória em VPS pequena** → `NODE_OPTIONS=--max-old-space-size=1024 npm run build:node`.

---

## Atalho: configuração completa automática em `alpine.nextuz.com.br`

Use o script `scripts/setup-external-server.sh` para fazer tudo de uma vez: instalar dependências,
configurar Nginx, SSL, PM2 e ativar o deploy automático. É idempotente — pode rodar várias vezes.

**Pré-requisitos:**
1. VPS acessível via SSH.
2. Repositório clonado em `/var/www/alpine`.
3. Arquivo `/var/www/alpine/.env` criado com pelo menos:
   - `CHECKOUT_API_BASE_URL`
   - `CHECKOUT_API_TOKEN`
   
   Pegue esses dois valores em **Admin → Pagamentos → Conexão do servidor externo** no painel da loja.
4. DNS de `nextuz.com.br` com registro `A` `alpine` → IP da VPS.

**Rode na VPS:**

```bash
cd /var/www/alpine
git pull
bash scripts/setup-external-server.sh
```

O script:
- instala Node.js 20, Nginx, Certbot, PM2, UFW e dnsutils se faltarem;
- roda `npm install` + `npm run build:node`;
- sobe/reinicia o app no PM2;
- configura o Nginx como proxy reverso;
- emite o certificado HTTPS (quando o DNS já estiver propagado);
- ativa o deploy automático a cada 3 minutos via cron.

**Mercado Pago** — cadastre a URL do webhook:

```
https://alpine.nextuz.com.br/api/public/webhooks/mercadopago
```

**Atualizações futuras:**

O site na VPS atualiza sozinho quando você publicar no Lovable. Acompanhe em:

```bash
tail -f /var/log/alpine-auto-deploy.log
```

Se quiser forçar uma atualização manual:

```bash
cd /var/www/alpine && git pull && bash scripts/setup-external-server.sh
```
