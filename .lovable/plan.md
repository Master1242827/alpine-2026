# Configurador Dinâmico (Form Builder por veículo)

## Objetivo

Transformar o configurador num **fluxo dinâmico por veículo**. Cada combinação Marca → Modelo → Ano pode ter o seu próprio conjunto de perguntas (cabine, versão, grade, ganchos, estepe, etc.), criadas e ordenadas pelo admin sem programar. No final, o sistema direciona para o produto compatível (ou lista os produtos compatíveis).

## Como o cliente vai sentir

```text
[1 Marca] → [2 Modelo] → [3 Ano] → [perguntas dinâmicas do veículo…] → Produto(s)
```

- As 3 primeiras etapas continuam fixas (Marca, Modelo, Ano).
- A partir do Ano, o sistema busca o **fluxo de perguntas** configurado pelo admin para aquele modelo (ou modelo+ano) e mostra só o que faz sentido:
  - Toro 2024 → pula cabine/grade/ganchos, pede só Versão.
  - Strada 2010 → pede Cabine, Versão, Grade, Ganchos, Estepe.
- Barra de progresso, transições suaves, mobile-first, breadcrumb das escolhas, botão voltar em cada etapa.

## Banco (migration)

Três tabelas novas + uma de respostas no mapeamento de produto:

1. **`configurator_questions`** — perguntas reutilizáveis
   - `key` (slug ex.: `cabine`, `versao`, `grade`, `ganchos`, `estepe`)
   - `label`, `help_text`, `type` (single_choice por enquanto)
   - `active`

2. **`configurator_options`** — opções de cada pergunta
   - `question_id`, `value`, `label`, `image_url`, `display_order`, `active`

3. **`vehicle_question_flow`** — qual pergunta aparece para qual veículo
   - `model_id` (obrigatório), `year_from`/`year_to` (opcional, p/ variar por geração)
   - `question_id`, `display_order`, `required` (default true), `active`
   - índice (model_id, year_from, year_to, display_order)

4. **`vehicle_product_map`** — adicionar coluna `answers jsonb` (`{ cabine: "dupla", versao: "adventure", grade: "sim" }`)
   - Match no final: model_id + ano dentro do range + todas as respostas do cliente baterem com `answers` (chaves ausentes = curinga).
   - Mantém RLS atual (admin write, public read).

## Configurador (`src/routes/configurador.tsx`)

- Etapas 1-3 (Marca/Modelo/Ano) já existem — manter.
- Após o Ano, buscar `vehicle_question_flow` do modelo (filtrando por `year_from..year_to`), e renderizar uma etapa por pergunta, em ordem, carregando as `configurator_options` correspondentes.
- Stepper passa a ser dinâmico (3 fixas + N do fluxo).
- Tela final cruza model_id + ano + objeto de respostas com `vehicle_product_map`:
  - 1 match → redireciona para `/produto/$slug`.
  - 2+ matches → lista os produtos compatíveis.
  - 0 → mensagem "não encontramos" + CTA p/ ver todos.

## Painel Admin (`src/components/admin/vehicles-admin.tsx`)

Adicionar **2 novas sub-abas** ao painel de veículos já existente:

- **Perguntas**: CRUD de `configurator_questions` + suas `configurator_options` (com upload de imagem, ordem, ativo).
- **Fluxos por veículo**: para cada Modelo (com faixa de ano opcional), montar a lista ordenada de perguntas — drag para reordenar, toggle ativo, toggle obrigatório.

E **estender a aba Compatibilidades**: ao criar/editar uma compatibilidade, mostrar dinamicamente as perguntas do fluxo do modelo selecionado e deixar o admin escolher o valor de cada uma (ou deixar "qualquer"). Isso vai gravar o `answers jsonb`.

## UX/UI

- Cards grandes, imagem opcional por opção, hover/elevação, focus acessível.
- Mobile-first: grid 2 cols celular, 3-4 desktop.
- Animações `animate-in fade-in slide-in-from-bottom-2` entre etapas (sem dep nova).
- Toasts em todas as ações admin.

## Fora de escopo desta entrega

- Tipos de pergunta além de "escolha única" (multi-escolha, texto livre, número) — fica para fase 2 se precisar.
- Lógica condicional avançada do tipo "se A=x então mostrar B" além do filtro por modelo/ano — hoje resolvemos no nível do fluxo por veículo, que já cobre os exemplos (Toro vs Strada).
- Reescrita do checkout/carrinho/frete.

Confirma o escopo? Posso seguir com a migration + UI assim que aprovar.
