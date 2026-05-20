## Objetivo

Transformar o configurador num fluxo profissional (Marca → Modelo → Ano → Cabine → Produto) e dar ao admin controle visual completo, sem mexer em código. Este plano foca no configurador + admin. O e-commerce (carrinho/checkout/frete) já está implementado e funcional — proponho uma auditoria separada depois deste deploy para não inflar este ciclo.

## Escopo desta entrega

### 1. Banco (migration)
- `vehicle_models`: adicionar `year_from int`, `year_to int`, `active bool default true`.
- `vehicle_makes`, `cabin_types`: adicionar `active bool default true`.
- `vehicle_product_map`: já tem `year_from`/`year_to`; adicionar `active bool default true` e índice composto (model_id, cabin_type_id, year_from, year_to).
- Manter RLS atual (admin write, public read).

### 2. Configurador (`src/routes/configurador.tsx`)
Novo fluxo em 4 etapas com barra de progresso, transições suaves e mobile-first:

```text
[1 Marca] → [2 Modelo] → [3 Ano] → [4 Cabine] → Produto
```

- Etapa **Ano**: gera lista de anos a partir do `year_from`/`year_to` do modelo selecionado (ou range manual).
- Filtragem do produto na etapa final usa `vehicle_product_map` cruzando `model_id`, `cabin_type_id` e ano dentro do `year_from..year_to`.
- Botão "voltar" em cada etapa, breadcrumb das escolhas, animação fade/slide entre etapas.
- Só lista marcas/modelos/cabines com `active = true`.

### 3. Painel Admin (`src/routes/admin.tsx`)
Reescrever a aba **Veículos** como CRUD completo com sub-abas:

- **Marcas**: nome, imagem (upload), ordem, ativo. Editar/excluir/toggle.
- **Modelos**: marca, nome, faixa de anos (from/to), imagem, ordem, ativo.
- **Cabines**: nome, descrição, imagem, ordem, ativo.
- **Compatibilidades** (nova aba — o coração do configurador):
  - Tabela com filtros por marca/modelo.
  - Cada linha: Modelo + Cabine + Faixa de anos → Produto vinculado.
  - Botão "+ Nova compatibilidade" com selects em cascata (marca→modelo→cabine→produto).
  - Editar / excluir / ativar.

Sem categorias de configurador separadas (a categoria já existe em `products`); se quiser depois, vira aba própria. "Opcionais" hoje = tipo de cabine; se precisar de opcionais extras (ex.: 4x4, gasolina/diesel), abre escopo novo e fica para uma segunda fase.

### 4. UX
- Cards com hover/elevação, focus states acessíveis.
- Etapas com `motion`-like CSS transitions (sem dep nova; usa Tailwind + animate-in já presente).
- Toda a UI mobile-first, grid 2 cols no celular, 3-4 no desktop.
- Toasts de sucesso/erro em todas as ações admin.

## Fora de escopo (proposta para próximo ciclo)

- Auditoria/refino do checkout, carrinho, frete e variações de produto.
- Sistema de "opcionais" genéricos (motor, tração, combustível).
- Categorias de produto editáveis no admin (hoje existem no schema mas sem UI).

Confirma este escopo? Se quiser que eu inclua a auditoria do e-commerce no mesmo ciclo eu faço, só fica uma entrega maior.