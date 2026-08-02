# Auditoria de movimento do produto autenticado

Data: 2026-08-02

Escopo: [#137](https://github.com/jhowtkd/adscale/issues/137)

Pesquisa da biblioteca: [#136](https://github.com/jhowtkd/adscale/issues/136)

Evidência bruta: [`motion-baseline-evidence.json`](./motion-baseline-evidence.json)

## Resultado

O ADScale já tem a infraestrutura necessária para microanimações: um único boundary de Motion, tokens de duração/easing, helpers compartilhados, hook de preferência reduzida e um harness visual. O ganho principal não vem de instalar outra runtime, mas de tornar o contrato existente consistente e adaptar poucas ideias do Animate UI aos componentes locais.

O maior risco antes da primeira microanimação é de aceitação: o fixture visual autenticado está defasado em relação às rotas e ao schema local, e hoje desliga animações nas capturas. Assim, ele comprova estados finais, mas não comprova comportamento de movimento.

## Como a auditoria foi feita

- leitura do grafo e do código de providers, helpers, tokens, primitives e consumidores;
- walkthrough local autenticado com o fixture sintético `visual-foundations@example.test`;
- comparação de movimento normal e `prefers-reduced-motion: reduce`;
- nenhuma geração paga, upload, deploy ou alteração de dados de produção;
- acesso de tester concedido apenas no banco local durante a inspeção e revogado ao final.

Limitação observada: `/api/creative-work` responde `500` no ambiente local porque a coluna `generation_correlation_id` ainda não existe em `adscale_app.creative_work_items`. Não foi executada migração fora do escopo deste ticket. Isso impediu validar estados populados de Creative Work e campanhas, mas não o shell autenticado, o dashboard, os estados de carregamento nem o contrato de reduced motion.

### Evidência reproduzível

- referência estática: commit `cf9a6090d796cfacb2fe17ff74c2161e5a596155`;
- o walkthrough usou Chromium/Playwright em `1440×900`, após `800ms` de estabilização, com `no-preference` e `reduce` explícitos;
- havia WIP do usuário em `package.json`, `package-lock.json` e `CreativeComposer{,.test}.tsx`, preservado e excluído do commit; fingerprint do diff inspecionado: `sha256:56ceea60fd49d5411e2b0b9c4d6f94957e52c66fea7c1bfca9d2c420854c8e16`;
- contagens estáticas podem ser repetidas com:

```bash
git grep -l -E "MotionBoundary|useReducedMotion|components/animations|from ['\"]framer-motion['\"]" \
  cf9a6090d796cfacb2fe17ff74c2161e5a596155 -- 'app/src/*' | wc -l
git grep -n "transition-all" cf9a6090d796cfacb2fe17ff74c2161e5a596155 -- \
  'app/src/*.ts' 'app/src/*.tsx' 'app/src/*.css' | wc -l
```

No walkthrough, “visível” significa bounding box não vazia e `visibility != hidden`; “movimento” significa `animation-name != none` ou alguma `transition-duration > 0`; “transição ampla” significa `transition-property: all`. A coleta navegou por `/`, `/dashboard` e `/campaigns`, aguardou `800ms` e leu `getComputedStyle`. O teste de foco clicou `getByRole('button', { name: /Peça única/i })` sob `reduce` e verificou `document.activeElement`.

O setup reproduzível é `NODE_OPTIONS='--conditions=react-server' npx tsx scripts/seed-visual-foundations.ts`, seguido de `grantTesterEntitlement` para o workspace sintético registrado no JSON. O cleanup chama `revokeTesterEntitlement(workspaceId)` e exige que `getActiveTesterEntitlementByWorkspace(workspaceId)` retorne `null`; essa pós-condição foi verificada nas duas execuções.

## Arquitetura atual

| Área | Evidência atual | Consequência |
|---|---|---|
| Runtime | `app/src/components/animations/MotionBoundary.tsx:3-22` usa `LazyMotion` com `domAnimation`; o provider o monta na raiz | Manter uma única runtime; código copiado do Animate UI deve importar do boundary local, não de `motion/react` |
| Tokens | `app/src/app/globals.css:144-148` define `120/180/280ms` e duas curvas; `app/src/lib/animations/easings.ts:2-24` mantém presets paralelos de `150/200/300/400ms` e dois springs | Consolidar nos tokens CSS; springs não são padrão permitido para esta iniciativa |
| Reduced motion | `app/src/app/globals.css:1003-1010` reduz CSS para `0.01ms`; há dois hooks JS concorrentes | CSS cobre estilos declarativos; movimento JS ainda depende de cada consumidor respeitar um dos hooks |
| Helpers | `FadeIn`, `StaggerContainer`, `StaggerItem`, `AdscaleLoader` e variants compartilhadas | Reusar antes de introduzir novos wrappers |
| Primitives | Button, Dialog, Sheet, Menu e Tooltip locais já estão maduros sobre Base UI | Não substituir por equivalentes do Animate UI |
| Testes | testes focados do boundary/loader/fundações e Playwright visual | Bons seams para regressão; falta uma asserção com animações habilitadas |

O levantamento estático encontrou 39 arquivos consumidores de Motion/boundaries/helpers e 87 usos de `transition-all`. A concentração de `transition-all` torna duração e propriedade animada difíceis de auditar; a limpeza deve ser incremental nas superfícies tocadas, não uma reescrita global.

Há dois caminhos JS para reduced motion: `app/src/components/animations/MotionBoundary.tsx:3-14` reexporta o hook do Framer Motion e sete componentes o consomem; `app/src/lib/hooks/use-reduced-motion.ts:3-30` implementa `matchMedia` com `useSyncExternalStore` e outros sete componentes o consomem. O seam canônico da runtime deve continuar sendo `MotionBoundary`; o hook local pode permanecer temporariamente nos helpers/CSS-only até o ticket de consolidação migrar consumidores com teste.

Também existe um segundo vocabulário de movimento em `app/src/lib/animations/easings.ts`, incluindo `spring` e `gentleSpring`. Ele diverge das durações CSS e permite comportamento elástico que o contrato visual proíbe como padrão. Não foi removido neste inventário; o ticket de consolidação deve parar de expandi-lo e mapear consumidores antes de trocar presets.

## Walkthrough autenticado

| Superfície | Evidência local | Oportunidade de feedback |
|---|---|---|
| `/` — Creative Composer | 19 elementos visíveis com animação/transição em movimento normal; 6 transições amplas; loading com `pulse` | Seleção de protocolo, upload/análise, troca de modo e geração precisam de estado perceptível sem coreografia de entrada |
| `/dashboard` | 37 elementos visíveis com animação/transição; 28 transições amplas; cards e loading com `pulse` | Contadores/progresso e atualização de status têm alto valor; evitar animar o grid inteiro |
| `/campaigns` | 21 elementos visíveis com animação/transição; 11 transições amplas; conteúdo ficou em loading por causa do erro local de schema | Destacar item recém-criado/atualizado e mudança de estado quando o fixture voltar a carregar dados |
| Biblioteca/receitas | Inspeção de código e primitives compartilhados | Highlight discreto para novo item, favorito e confirmação de ação |
| Brand Kit/settings | Inspeção de código e primitives compartilhados | Switch, checkbox, toggle e confirmação de salvamento são candidatos de baixo risco |

Com `prefers-reduced-motion: reduce`, `/` e `/dashboard` mantiveram o conteúdo e foco, sem transforms computados; todas as durações observadas caíram para `0.01ms` e nenhuma permaneceu acima de `20ms`. O foco continuou no botão de protocolo depois da interação (`BUTTON`, texto iniciado por “Peça única”). Isso comprova o fallback CSS dos estados inspecionados, não uma garantia global para animações JS futuras.

## Lacunas de acessibilidade e aceitação

1. `MotionBoundary` ainda não configura `MotionConfig reducedMotion="user"`; uma animação JS copiada diretamente pode ignorar o contrato local.
2. O manifesto visual chama `/` de dashboard, mas a rota agora renderiza o Creative Composer; o dashboard real está em `/dashboard`.
3. O fixture sintético não recebe acesso autenticado suficiente por padrão e o banco local está atrás das migrações esperadas pelo código.
4. As capturas Playwright usam `animations: "disabled"`; elas validam layout final, não duração, deslocamento ou resposta à preferência reduzida.
5. O console apontou landmarks/nomes acessíveis inválidos em superfícies inspecionadas. São débitos adjacentes; qualquer componente animado deve preservar nome, foco e semântica existentes.

## Prioridades para os tickets seguintes

### P0 — tornar a aceitação confiável

- alinhar o fixture com `/dashboard` e com o schema atual;
- fornecer acesso local determinístico ao usuário sintético;
- manter screenshots com animação desligada para estabilidade e adicionar uma asserção funcional curta com animação habilitada e reduced motion.

### P1 — consolidar o contrato compartilhado

- fazer o provider aplicar a preferência do usuário à runtime de Motion;
- consolidar gradualmente os dois hooks e os presets JS divergentes no boundary/tokens canônicos;
- exigir que adaptações do Animate UI usem os tokens e o boundary locais;
- cobrir o provider com um teste focado, sem criar outro sistema de animação.

### P1 — primeira onda seletiva

- highlight de item novo/atualizado em campanhas e biblioteca;
- progresso e números em dashboard e fluxos criativos;
- troca de ícone/status em confirmação, sucesso e erro;
- feedback interno de Switch/Checkbox/Toggle sobre os primitives Base UI locais.

### Manter ou rejeitar

- manter Button, Dialog, Sheet, Menu e Tooltip locais;
- não trazer efeitos ornamentais, backgrounds animados ou entradas amplas de página;
- considerar AutoHeight somente onde houver salto de layout medido e impossível de resolver com CSS/layout nativo.

## Seams executáveis

Validação focada do contrato existente:

```bash
cd app
npx vitest run --config config/vitest.config.ts \
  src/components/animations/MotionBoundary.test.tsx \
  src/components/animations/AdscaleLoader.test.tsx \
  src/components/ui/visual-foundations.test.tsx
npm run typecheck -- --pretty false
```

Aceitação local a preservar/estender:

```bash
cd app
NODE_OPTIONS='--conditions=react-server' npx tsx scripts/seed-visual-foundations.ts
npx playwright test --config playwright.visual.config.ts
```

Critério mínimo para cada microanimação posterior: o estado final precisa continuar compreensível com animações desabilitadas, `prefers-reduced-motion` não pode esconder nem deslocar conteúdo crítico, e o foco/teclado deve permanecer funcional.
