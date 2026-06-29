# Redesign v6 — Preview Routes

Rotas isoladas pra visualizar os 13 mockups do redesign v6 renderizados como componentes React reais com fixtures.

## Como rodar local

```bash
cd app
npm run dev:next
# Abre http://localhost:3000/v6
```

## Estrutura

```
(preview)/v6/
├── layout.tsx              # Shell mínimo: FeedbackProvider + MissionInsightProvider + TopBar real + main
├── page.tsx                # Índice listando os 13 mockups
├── _fixtures/preview-data.ts   # User, billing, KPIs, activity (fixtures estáticos)
├── _components/ChatPromoHero.tsx  # Hero promo do mockup 08
└── topbar-promo/page.tsx   # Mockup 08: TopBar + hero + KPIs + activity table
```

## Como cada mockup corresponde ao componente real

Ver `~/Downloads/Redesign_Adscale 2/MAPPING.md` (mapa 1:1 mockup ↔ componente).

Cada rota preview serve o componente React migrado com fixtures. Quando o mockup mergeia pra produção (rotas reais), a rota preview é deletada (Fase 5).

## Como adicionar nova rota de preview

1. Criar `app/src/app/(preview)/v6/<slug>/page.tsx`
2. Importar fixtures de `_fixtures/preview-data.ts` (ou adicionar novas)
3. Renderizar o componente migrado com fixtures
4. Adicionar entrada no `mockupIndex` em `_fixtures/preview-data.ts` (marcar como `live`)
5. Rodar `npm run dev:next` e confirmar `/v6/<slug>` → 200

## Política de cleanup

As rotas preview são **descartáveis**. Depois que o mockup mergeia pra rota real (ex: `/v6/dashboard` vira `/`), a rota preview é deletada na Fase 5. Não manter rotas preview em produção a longo prazo.

## Tokens

Os componentes usam **tokens canônicos** de `globals.css` (`.dark { }`). Mockups v5 usavam nomes legacy (`--surface-2`, `--text-2`, etc.) — ver tabela de tradução no `globals.css` (bloco de comentário após `.dark`). Nunca aliasar nomes legacy em produção.

## Fixtures

- `previewUser`: Jhonatan Soares (DEV_ADMIN_EMAIL), 142 créditos
- `previewBilling`: Plano Piloto
- `previewKpis`: KPIs do mockup 08 (campanhas ativas, variações, taxa aprovação, créditos)
- `previewActivity`: 4 campanhas da activity table do mockup 08

Métricas são **fixtures do mockup**, não queries reais. Mapeamento pra queries reais acontece na Fase 2 (Wave 1 — Painel). Pendências marcadas com `{{ pendência: ... }}` inline.
