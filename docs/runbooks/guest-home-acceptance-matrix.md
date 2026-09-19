# Matriz de aceite — home pública (#446)

Parent: #436. Gates ponta a ponta da ilha pública provados contra o build
verdadeiro (`next build` + `next start`), nunca dev server nem prévia.

## Ambiente (todas as pernas)

- Branch: `feat/446-e2e-gates` (empilhada sobre #445)
- SHA base: `bccafdb0` (+ diff #446 não commitado no worktree)
- Node: v26.7.0 · Playwright 1.63.0 · macOS arm64
- Servidor: build verdadeiro em `http://localhost:3000` (jornada B)
- Banco e2e isolado: `postgres://test@localhost:5543/adscale_test` (semeado
  com `scripts/seed-dev-admin.ts --email=dev-admin@adscale.local`)
- Provedor IA: `E2E_CONTROLLED_PROVIDER=true` (sem chamadas externas)
- Identidade: `dev-admin@adscale.local` (sintética; nenhum dado privado em
  evidência — URLs, snapshots e logs contêm apenas UUIDs de teste)
- Coleta provada antes da execução:
  `npx playwright test --project=guest-home-chromium --list` →
  38 testes em 4 arquivos

## Ativação B — ilha + importação + anexos ligados

`PUBLIC_STUDIO_HOME_ENABLED=true PUBLIC_STUDIO_IMPORT_ENABLED=true
PUBLIC_STUDIO_ATTACHMENTS_ENABLED=true`

| Navegador | Projeto | Resultado | Evidência |
|---|---|---|---|
| Chromium (Desktop Chrome) | guest-home-chromium | 37 passaram, 1 pulou (exit 0, 20.5s) | `/tmp/wt446-chromium-b3.log` |
| WebKit (Desktop Safari) | guest-home-webkit | 24 passaram, 1 pulou (exit 0, 14.0s) | `/tmp/wt446-webkit-b2.log` |

## Ativação A — tudo desligado (Studio normal)

`PUBLIC_STUDIO_HOME_ENABLED=false PUBLIC_STUDIO_IMPORT_ENABLED=false
PUBLIC_STUDIO_ATTACHMENTS_ENABLED=false`

| Navegador | Projeto | Resultado | Evidência |
|---|---|---|---|
| Chromium (Desktop Chrome) | guest-home-chromium | 9 passaram, 29 pularam com motivo (exit 0, 9.1s) | `/tmp/wt446-chromium-a2.log` |
| WebKit (Desktop Safari) | guest-home-webkit | — (fallback/recovery idênticos; coberto em B/webkit + A/chromium) | — |

Notas:

- Com as flags desligadas os specs detectam o fallback/Studio normal e
  pulam com motivo (`test.skip`) em vez de falhar; pular sem motivo falha.
- Cenários pendentes bloqueiam a ativação correspondente.

## Portões estáticos (escopo #446, saída real)

| Portão | Comando | Resultado |
|---|---|---|
| typecheck | `npm run typecheck` | PASSOU (exit 0) |
| lint (tocados) | `npx eslint src/app/login/LoginContent.tsx tests/e2e/guest-home-auth.spec.ts` | PASSOU (exit 0) |
| build | `npm run build` (env `.env.local` p/ validação) | PASSOU (exit 0) |
| ativos | `node scripts/check-public-home-assets.mjs` | PASSOU (6 avisos: registros ilustrativos sem aprovação — warn-only em prévia) |
| unidade guest-home | `npm run test:guest-home` | 131/131 PASSOU |
| unidade login | `vitest run src/app/login/LoginContent.test.tsx` | 2/2 PASSOU |
| unidade ilha | `vitest run guest-store.test.ts guest-controller.test.ts` | 26/26 PASSOU |

## Manifesto de ativos

`app/public/adscale-guest/asset-manifest.json`: 6 arquivos, todos
`kind: "illustrative"` com proveniência declarada; aprovação humana
pendente (`approvedBy`/`approvedAt` vazios) — bloqueia ativação pública
real, não a prévia (#447 decide).
