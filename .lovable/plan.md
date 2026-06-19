## Diagnóstico

O bug intermitente ("retorna todas as capotas") tem duas causas prováveis no `src/routes/configurador.tsx`:

### Causa 1 — `flowQuestionKeys` vazio em race condition

```ts
const flowQuestionKeys = useMemo(() => new Set(
  orderedFlow.map(f => questions?.find(q => q.id === f.question_id)?.key).filter(Boolean)
), [orderedFlow, questions]);
```

Se `questions` ainda não carregou quando `findProducts()` roda, o Set fica **vazio**. Com `flowQuestionKeys` vazio, todo filtro de resposta vira "out-of-flow" e é ignorado — passa só o filtro de ano. Resultado: **todos os produtos do modelo no ano retornam**.

Hoje `findProducts` só checa `sel.model!.id` antes de consultar; não espera `questions`, `flow` e `options`.

### Causa 2 — `effectiveFlowKeys` strip demais quando há terminator

```ts
const effectiveFlowKeys = earlyFinish
  ? new Set([...flowQuestionKeys].filter(k => !!userAns[k]))
  : flowQuestionKeys;
```

Isso remove **todas** as chaves sem resposta — inclusive perguntas que vieram ANTES da pergunta terminadora e que o usuário deveria ter respondido (mas que por algum motivo não foram salvas, p.ex. terminator disparado na 1ª pergunta). O correto é remover apenas perguntas posteriores ao step que terminou o fluxo.

Além disso, `flowQuestionKeys` inclui chaves de TODOS os anos (ex.: `saveiro_1982_a_1985` para um cliente 2018), o que confunde a lógica. Deveria conter só as do ano atual.

## Correções

Em `src/routes/configurador.tsx`:

1. **Bloquear `findProducts` enquanto dados-base não carregaram.**
   No `useEffect` que dispara a busca (linha ~290), só chamar `findProducts()` quando `flow !== undefined && questions !== undefined && options !== undefined`. Mostrar estado "carregando" enquanto isso.

2. **Restringir `flowQuestionKeys` ao ano selecionado.**
   Filtrar `orderedFlow` por `year_from <= sel.year <= year_to` (com fallback amplo quando nulos) antes de extrair as keys. Isso elimina chaves de outros buckets de versão.

3. **Trocar a estratégia de `effectiveFlowKeys`.**
   Em vez de "manter apenas keys respondidas", manter as keys das perguntas **até o step terminador (inclusive)** + perguntas com `auto_answer`/`hidden`. Perguntas POSTERIORES ao terminador são removidas. Implementação: localizar o índice do step cuja resposta atual está em `terminator_values`/`terminates_flow` e cortar `dynamicSteps` ali.

4. **Guard final em `matchesCompatRecord` (defensa extra).**
   Se `flowQuestionKeys` estiver vazio E `userAnswers` tiver pelo menos 1 entrada, considerar essas keys como in-flow para evitar fallback silencioso. Pequena rede de segurança contra a Causa 1 caso volte a aparecer.

5. **Teste de regressão.**
   Adicionar em `src/lib/configurator-match.test.ts`:
   - Saveiro 2018 + Cabine Estendida + Cross_ deve retornar **apenas** os produtos Cross (Cabine Estendida) e produtos cuja regra de versão inclua `cross_`. NÃO deve retornar Pepper, Trendline, Robust, Simples, Dupla.
   - Caso `flowQuestionKeys` vazio com respostas presentes não pode retornar produto cuja `answers` exige valor diferente do recebido.

### Arquivos alterados

- `src/routes/configurador.tsx` — itens 1, 2, 3
- `src/lib/configurator-match.ts` — item 4 (guard pequeno em `matchesCompatRecord`)
- `src/lib/configurator-match.test.ts` — item 5

### Sem mudanças em

- Schema do banco
- Painel admin
- Lógica de outros modelos/fluxos que já funcionam (as mudanças só endurecem o match; não afrouxam)
