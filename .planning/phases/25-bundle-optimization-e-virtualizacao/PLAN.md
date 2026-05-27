# Plan: Phase 25 — Bundle Optimization e Virtualização

## Requirements
- PERF-10: Remover dead code e dependências não utilizadas
- PERF-11: Implementar virtualização para listas grandes (campanhas, derivations)
- PERF-12: Melhorar First Contentful Paint para < 1.5s

## Tasks

### PERF-10: Remover dead code e dependências não utilizadas
- [ ] Remover dependências não utilizadas do package.json:
  - @ai-sdk/openai
  - @upstash/ratelimit
  - ai
  - pino
  - pino-pretty
  - shadcn
  - tw-animate-css
- [ ] Manter tailwindcss e @tailwindcss/postcss (necessários para build)
- [ ] Rodar `npm install` para atualizar lockfile
- [ ] Verificar build ainda funciona
- [ ] Remover imports não utilizados detectados pelo ESLint

### PERF-11: Virtualização para listas grandes
- [ ] Aplicar VirtualList em DerivationsStep quando filteredDerivations.length > 20
- [ ] Aplicar VirtualList em AssetLibraryModal quando assets.length > 20
- [ ] Aplicar VirtualList em CampaignList (dashboard) quando campaigns.length > 20
- [ ] Garantir que grid layout funciona com virtualização
- [ ] Testar com dados grandes

### PERF-12: Melhorar FCP
- [ ] Adicionar `preload` para fontes críticas no layout
- [ ] Adicionar `priority` em imagens críticas (logo, thumbnail principal)
- [ ] Otimizar carregamento de CSS crítico
- [ ] Verificar Lighthouse Performance score

## Verification
- [ ] `npm run build` passa
- [ ] `npm run test` passa (448 tests)
- [ ] Bundle analyzer mostra redução
- [ ] Listas com >20 itens usam virtualização
- [ ] FCP melhorado

## Decisions
- Manter tailwindcss devDependencies (necessário para build)
- Virtualização ativada apenas quando lista >20 itens (evita overhead)
- Usar VirtualList existente com @tanstack/react-virtual