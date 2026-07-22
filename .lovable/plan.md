# Plano de ajustes

## 1. Erro ao alterar status do pedido
Não consegui ver o print/erro exato — o texto do erro não veio. Vou:
- Abrir o painel admin em modo debug via Playwright, reproduzir o clique de mudança de status e capturar a mensagem real (console + rede).
- Corrigir com base no erro identificado. Suspeitas mais prováveis: RLS no `orders` bloqueando `UPDATE` do admin, ou o campo `mp_payment_id`/enum de status não aceitando o valor. Se for RLS, adiciono policy de `UPDATE` para admins (via `has_role`).

## 2. CPF obrigatório no checkout
- Marcar CPF como **required** no formulário (`src/routes/checkout.tsx`).
- Validar formato (11 dígitos + dígito verificador) antes de submeter.
- Bloquear submit sem CPF válido, com mensagem clara.

## 3. Checkout transparente de cartão (SDK Mercado Pago)
- Nova rota `/checkout/cartao` que carrega o SDK v2 do MP (`https://sdk.mercadopago.com/js/v2`).
- Formulário com campos: número, nome, validade, CVV, parcelas, CPF do titular.
- Tokeniza o cartão no browser (`mp.createCardToken`) — dados do cartão nunca passam pelo servidor.
- Nova server function `createCardPayment` que recebe apenas o `token`, `installments`, `payment_method_id` e cria o pagamento via API `/v1/payments`.
- Tela de status conforme resposta (approved/in_process/rejected) reusando `CheckoutStatusCard`.

## 4. Tela de confirmação + email
- Após pagamento aprovado (PIX/Boleto/Cartão) a tela `/checkout/aprovado` já existe — vou reforçar visual (badge de sucesso, resumo do pedido, próximos passos).
- **Emails**: configurar Lovable Emails. Ao ativar, você precisará configurar DNS no seu registrador (subdomínio tipo `notify.alpinecapotas.com.br`).
- Templates a criar: `pedido-confirmado`, `pedido-pago`, `pedido-enviado`.
- Trigger de envio: server function `getOrderPaymentStatus` dispara email quando status muda para `paid`; webhook do MP também dispara.

## 5. Vídeo nas observações do checkout
- Adicionar upload de vídeo (mp4/mov, até 50MB) ao lado das imagens em "Observações".
- Novo campo `notes_video_url` em `orders`.
- Preview do vídeo antes do envio; validação de tamanho/tipo.

## 6. Taxas de parcelamento personalizadas por parcela
- Nova tabela `installment_fees` com colunas: `installments` (int), `fee_percent` (numeric), `active` (bool).
- Em **Admin → Configurações**, tabela editável: para cada nº de parcelas (1x, 2x, 3x…12x) você define o % repassado (pode ser 0 para "eu absorvo").
- Checkout carrega essa tabela e mostra as parcelas com o valor final calculado usando **suas** taxas, não as do MP.
- Remove o campo atual "taxa mensal fixa" (ou mantém como fallback quando não há linha na tabela).

## 7. Manter carrinho ao voltar do pagamento
- Remover `clear()` do carrinho no momento em que o usuário vai para o checkout do MP.
- Só limpar o carrinho quando o pagamento for **efetivamente aprovado** (`status === 'paid'` na tela de sucesso), via `useEffect` na `/checkout/aprovado` após confirmar via `getOrderPaymentStatus`.
- Assim, se o cliente voltar/cancelar, o carrinho permanece intacto.

---

## Ordem de execução
1. Reproduzir erro do ponto 1 e corrigir (bloqueador).
2. Migração DB: `installment_fees`, `notes_video_url`, policy admin UPDATE orders (se necessário).
3. Ponto 7 (rápido, evita perda de carrinho durante teste dos outros pontos).
4. Ponto 2 (CPF obrigatório).
5. Ponto 6 (tabela de taxas).
6. Ponto 5 (vídeo obs).
7. Ponto 3 (checkout transparente cartão) — o mais complexo.
8. Ponto 4 (setup email + templates + trigger).

## Notas técnicas
- Checkout transparente exige que a Public Key do MP esteja disponível no client. Vou usar `VITE_MERCADO_PAGO_PUBLIC_KEY`. Se você ainda não tem, preciso que me passe (é pública, começa com `APP_USR-` ou `TEST-`).
- Setup Lovable Emails abre um diálogo pedindo o domínio; NS records precisam ser adicionados no seu registrador (Hostinger). Emails começam a sair após verificação DNS (até 72h, normalmente minutos).

Preciso que você:
1. Cole a **mensagem exata do erro** ao alterar status do pedido (F12 → Console → linha vermelha) — sem isso vou por tentativa e provavelmente demora mais.
2. Confirme a **Public Key** do Mercado Pago (ou me diga para buscar na sua conta MP).
