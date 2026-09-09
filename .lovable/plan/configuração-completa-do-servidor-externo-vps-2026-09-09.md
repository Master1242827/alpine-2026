# Configuração completa do servidor externo (VPS)

## Objetivo
Fazer o site publicado no Lovable espelhar automaticamente para o servidor da Hostinger (VPS), com pagamento, frete e domínio próprio funcionando sem depender da chave de serviço do Supabase.

## Passos

1. **Publicar a versão atual no Lovable**
   - Garantir que todos os fallbacks (checkout, frete, admin) estejam no ar.

2. **Gerar/confirmar token de API de checkout**
   - Criar `CHECKOUT_API_TOKEN` no projeto (ou reusar `ADMIN_API_TOKEN`).
   - Expor o token apenas no Admin → Pagamentos para cópia segura.

3. **Criar script de setup da VPS**
   - `scripts/vps-setup.sh`: instala dependências, configura `.env`, Nginx, PM2 e auto-deploy.
   - Variáveis necessárias: `CHECKOUT_API_BASE_URL`, `CHECKOUT_API_TOKEN`, `ADMIN_API_BASE_URL`, `ADMIN_API_TOKEN`, `MERCADO_PAGO_PUBLIC_KEY`, `FRENET_TOKEN`, `ORIGIN_CEP`, `SESSION_SECRET`, `ADMIN_SESSION_SECRET`, `PORT`.

4. **Ajustar Nginx para servir o app Node na porta 3000**
   - Proxy reverso para `localhost:3000`.
   - SSL com Certbot para `alpine.nextuz.com.br`.

5. **Configurar PM2**
   - Processo `alpine` apontando para `dist/server/index.mjs`.
   - Auto-restart e `--update-env`.

6. **Ativar auto-deploy via cron**
   - `scripts/auto-deploy.sh` já existe; garantir que funcione com `git reset --hard` e remoção de arquivos não rastreados.

7. **Cadastrar webhook do Mercado Pago**
   - URL: `https://alpine.nextuz.com.br/api/public/webhooks/mercadopago`.
   - Evento `payments`.
   - Configurar `MERCADO_PAGO_WEBHOOK_SECRET` e `MERCADO_PAGO_ACCESS_TOKEN`.

8. **Testar ponta a ponta no domínio real**
   - Home carrega.
   - Frete calcula para CEP de teste.
   - Checkout gera PIX/boleto/cartão.
   - Webhook confirma pagamento.

## Resultado esperado
O domínio `alpine.nextuz.com.br` fica idêntico ao publicado no Lovable, atualiza sozinho a cada publicação e processa pagamentos/frete sem precisar de chave de serviço na VPS.
