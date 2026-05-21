# Páginas de retorno do Mercado Pago

Criar três páginas distintas para os status de retorno do Mercado Pago, cada uma com URL própria e comportamento visual adequado. Atualizar as `back_urls` da preferência para apontar para as rotas corretas.

## Rotas

| Status MP | URL | Arquivo |
|-----------|-----|---------|
| Aprovado (`success` / `approved`) | `/checkout/aprovado?order=<id>` | `src/routes/checkout.aprovado.tsx` |
| Pendente (`pending` / `in_process`) | `/checkout/pendente?order=<id>` | `src/routes/checkout.pendente.tsx` |
| Recusado/Cancelado (`failure` / `rejected`) | `/checkout/recusado?order=<id>` | `src/routes/checkout.recusado.tsx` |

A rota antiga `/checkout/sucesso` permanece como redirecionamento (compat) para `/checkout/aprovado`, e `/checkout/falha` redireciona para `/checkout/recusado`, para não quebrar pagamentos em curso.

## Comportamento de cada página

Todas:
- Lêem `?order=<orderId>` via `validateSearch`.
- Chamam `getOrderPaymentStatus` com polling (3s, até 10x) enquanto status for `pending` — confirmação automática quando o webhook chegar.
- Mostram número do pedido, valor total, status legível, método de pagamento, e ID do pagamento quando disponível.
- Botões: "Voltar para a loja" e "Falar no WhatsApp" (suporte).
- Mobile responsivo, usando os tokens do design system existente (`Card`, `Button`).

Específicas:
- **Aprovado** — ícone `CheckCircle2`, cor primária, mensagem de confirmação e próximos passos (acompanhar por e-mail/WhatsApp).
- **Pendente** — ícone `Clock`, mensagem explicando que o Mercado Pago ainda está confirmando (boleto/PIX); continua o polling.
- **Recusado** — ícone `XCircle`, cor destructive, mensagem clara, CTA para tentar novamente (`/carrinho`) e link para suporte.

## Integração com a preferência

Em `src/lib/checkout.functions.ts`, atualizar `back_urls`:

```ts
back_urls: {
  success: `${origin}/checkout/aprovado?order=${order.id}`,
  pending: `${origin}/checkout/pendente?order=${order.id}`,
  failure: `${origin}/checkout/recusado?order=${order.id}`,
},
auto_return: "approved",
```

Nenhuma mudança no webhook — ele continua atualizando o status do pedido independentemente da URL de retorno.

## Detalhes técnicos

- Extrair a lógica de polling+exibição compartilhada para um helper local em cada arquivo (sem novo componente global, mantendo o escopo da mudança).
- Adicionar as 3 novas rotas; o `routeTree.gen.ts` é regenerado automaticamente.
- Manter `checkout.sucesso.tsx` e `checkout.falha.tsx` como rotas que fazem `<Navigate>` para as novas URLs, preservando o parâmetro `order`.

## Arquivos

- novo: `src/routes/checkout.aprovado.tsx`
- novo: `src/routes/checkout.pendente.tsx`
- novo: `src/routes/checkout.recusado.tsx`
- editado: `src/routes/checkout.sucesso.tsx` (redirect compat)
- editado: `src/routes/checkout.falha.tsx` (redirect compat)
- editado: `src/lib/checkout.functions.ts` (back_urls)
