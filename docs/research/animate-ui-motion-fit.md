# Compatibilidade da Animate UI com o ADScale

**Data da pesquisa:** 2026-08-02

**Escopo:** compatibilidade técnica e adequação para microfeedback funcional; sem instalação, protótipo ou alteração do app

**Snapshot da Animate UI:** `efeb96ffd7a3b7a4868667e4ac3c346620fb3044` (`main`, 2025-12-31)

**Status:** decisão de pesquisa para o mapa [Polir a interface com uma linguagem de microanimações](https://github.com/jhowtkd/adscale/issues/135)

## Resumo executivo

**Decisão:** a Animate UI é **compatível como fonte de padrões e código a adaptar**, mas **não deve ser instalada ou adotada como uma segunda camada de componentes**. O ADScale já tem as partes caras e sensíveis do sistema: React 19/Next 16, Tailwind 4, shadcn configurado para RSC, primitives acessíveis de Base UI, `framer-motion`, um `LazyMotion` global, tokens de duração/easing e suporte próprio a `prefers-reduced-motion`.

O valor incremental está em poucos padrões de microfeedback — indicador selecionado com `layoutId`, altura automática, progresso/número que transiciona, troca de ícone após uma ação e ícones animados para marcos raros. Diálogos, sheets, menus, tooltips, botões e estados básicos já existem e substituí-los duplicaria contratos de acessibilidade, estilo e dependências.

Não é uma adoção direta por quatro motivos:

1. o código distribuído importa `motion`/`motion/react` e normalmente usa o componente completo `motion`, enquanto o ADScale usa `framer-motion` via `m` + `LazyMotion`; copiar sem adaptação anula a economia do boundary atual;
2. os componentes da trilha Base UI da Animate UI ainda importam `@base-ui-components/react`, pacote oficialmente renomeado/depreciado, enquanto o ADScale já está em `@base-ui/react@1.4.1`;
3. a política oficial da Animate UI para reduced motion depende de um `MotionConfig reducedMotion="user"`, ausente no provider atual do ADScale; o CSS global sozinho não desliga animações JavaScript;
4. a licença do arquivo canônico não é MIT simples: é **MIT + Commons Clause**, permitindo uso no produto, mas proibindo vender ou redistribuir os componentes em sua forma original.

## Método e grau de certeza

- **Confirmado** significa observado em fonte primária: repositório, documentação/site oficial, metadata do registry npm ou código local.
- **Inferência** significa conclusão técnica derivada dessas fontes; ainda precisa de compilação, teste de acessibilidade ou medição de bundle no app antes de virar aceite de implementação.
- O catálogo e a manutenção são um snapshot de 2026-08-02. A Animate UI não publica pacote npm próprio para os componentes: o código é copiado pelo registry shadcn, portanto a versão efetiva é o conteúdo servido no momento da instalação.

## Stack local e sobreposição

### Fatos confirmados

| Área | ADScale atual | Animate UI atual | Consequência |
|---|---|---|---|
| Framework | Next `16.2.6`, React/React DOM `19.2.4` | workspace do projeto usa React `^19.1.2`; Motion aceita React 18/19 | Compatibilidade de versões de React confirmada |
| Movimento | `framer-motion` declarado em `^12.38.0` e resolvido em `12.42.2`; `MotionBoundary` fornece `m`, `AnimatePresence`, `animate`, `useReducedMotion` e `LazyMotion(domAnimation)` | itens do registry declaram `motion` e importam `motion/react`; o workspace fixa `motion ^12.23.12` | Mesmo motor subjacente, mas outra entrada de pacote e outra estratégia de bundle |
| Primitives | `@base-ui/react@1.4.1` em Button, Dialog, Menu, Select, Sheet e Tooltip | famílias separadas para Radix, Base UI e Headless UI; a família Base importa `@base-ui-components/react` | Não usar variantes Radix/Headless; portar comportamento, não o primitive |
| shadcn | `components.json` existe, `style: base-nova`, `rsc: true`, Tailwind 4 e aliases locais | distribuição copy-first via shadcn CLI v3 | A infraestrutura de registry existe, mas o CLI escreveria arquivos e dependências que precisam de revisão |
| Sistema visual | tokens locais de `120/180/280ms`, easings de produto, motion-reduce CSS e primitives já animados | componentes trazem seus próprios springs/durações e classes shadcn | Valores devem ser remapeados para a linguagem do ADScale, não copiados literalmente |

Fontes locais: [`app/package.json`](../../app/package.json), [`app/package-lock.json`](../../app/package-lock.json), [`app/components.json`](../../app/components.json), [`MotionBoundary.tsx`](../../app/src/components/animations/MotionBoundary.tsx), [`MotionProvider.tsx`](../../app/src/components/providers/MotionProvider.tsx), [`button.tsx`](../../app/src/components/ui/button.tsx), [`dialog.tsx`](../../app/src/components/ui/dialog.tsx), [`globals.css`](../../app/src/app/globals.css).

Fontes externas: [introdução da Animate UI](https://animate-ui.com/docs), [instalação oficial](https://animate-ui.com/docs/installation), [package do workspace upstream](https://github.com/imskyleen/animate-ui/blob/efeb96ffd7a3b7a4868667e4ac3c346620fb3044/packages/ui/package.json), [metadata oficial de `motion@12.43.0`](https://registry.npmjs.org/motion/12.43.0), [metadata oficial de `@base-ui-components/react`](https://registry.npmjs.org/@base-ui-components%2freact/latest).

### Inferências

- Executar o CLI da Animate UI sem curadoria tende a criar uma segunda convenção de paths (`components/animate-ui/...`), imports `motion/react` e, em alguns componentes, dependências de Radix ou do nome antigo de Base UI. Isso aumenta manutenção sem benefício funcional equivalente.
- A maioria dos padrões pode ser portada em cima dos primitives locais com menos código do que uma substituição integral. Para efeitos simples de hover/tap, CSS e o Button existente continuam sendo a primeira escolha.
- Adicionar o pacote `motion` pode ser deduplicado com `framer-motion` pelo npm, porque `motion` depende de `framer-motion`, mas ainda cria uma nova entrada de pacote/import e pode alterar a resolução do lockfile. Não há ganho claro enquanto o app já expõe a API necessária.

## Catálogo relevante a microfeedback funcional

O catálogo oficial lista 11 primitives Animate UI, 18 Radix, 17 Base UI, 6 Headless UI, 4 botões, 11 textos e 14 efeitos. A tabela abaixo filtra apenas o que pode comunicar estado, causalidade ou continuidade de uma tarefa; backgrounds, partículas decorativas e componentes community não entram na recomendação. [Catálogo oficial](https://animate-ui.com/docs/primitives)

| Padrão do catálogo | Microfeedback útil | Fit | Decisão de pesquisa |
|---|---|---:|---|
| `Highlight` / indicador com `layoutId` | Mantém continuidade visual ao trocar filtro, tab ou item selecionado | Alto | **Adaptar o padrão** em controles compartilhados quando o inventário mostrar mudança de seleção abrupta. Preservar semântica/foco do Base UI local. |
| `AutoHeight` | Evita salto quando conteúdo de painel, erro ou etapa cresce/encolhe | Médio | **Exceção, não default**: a [spec publicada](https://github.com/jhowtkd/adscale/issues/138) rejeita animação de propriedades de layout salvo necessidade documentada. Preferir composição/opacity; só prototipar height quando a continuidade não puder ser obtida com segurança de outro modo. |
| `Progress` + `CountingNumber`/`SlidingNumber` | Comunica avanço de upload, análise ou tarefa longa | Alto | **Adaptar a apresentação**, mantendo o primitive/ARIA local. Números animados não devem ser usados como única fonte de verdade nem em saldos/créditos que exijam leitura imediata. |
| troca animada de ícone no `CopyButton` | Confirma a ação de copiar no próprio ponto de interação | Alto | **Reusar o padrão, não o componente**: o app já tem Button, clipboard e toast/copy feedback; basta uma troca curta de ícone/texto com anúncio acessível. |
| ícones animados Lucide (`check`, `loader`, `upload`, `refresh`, etc.) | Reforça sucesso, processamento ou reversão rara | Médio | **Piloto pequeno e controlado**. A própria documentação classifica os ícones como beta; portar só 2–3 ícones, sem loop por padrão. |
| `Checkbox`, `Switch`, `Toggle`, `ToggleGroup` animados | Confirma alteração binária/multiseleção | Médio | **Portar apenas thumb/check/indicador animado** para o Base UI atual. Não copiar o wrapper upstream antigo. |
| `Tabs` animadas | Indicador contínuo e transição curta entre contextos | Médio | **Adaptar após inventário**. O padrão usa layout/auto-height e precisa de estratégia de bundle mais forte que `domAnimation` se convertido para `m`. |
| `Dialog`, `Sheet`, `DropdownMenu`, `Tooltip`, `Popover` | Entrada/saída de contexto | Baixo | **Rejeitar substituição**. Os primitives locais já têm foco/teclado/portal e animações CSS; só ajustar tokens ou keyframes se a auditoria achar uma falha concreta. |
| `Button`, `Ripple`, `Click` | Resposta ao acionamento | Baixo | **Rejeitar como padrão global**. O Button local já tem `active:scale`/deslocamento e reduced motion CSS. O `Click` upstream adiciona listener de `pointerup`, portal global e itens temporizados; é complexidade desnecessária para feedback básico. |
| textos de marketing (`Morphing`, `Typing`, `Shimmering`, `Rotating`) e efeitos (`Magnetic`, `Tilt`, `Particles`, `Shine`) | Ênfase ornamental | Baixo | **Fora da adoção funcional inicial**. Só reabrir para um marco raro e específico aprovado pelo design. |

Fontes: [Auto Height](https://animate-ui.com/docs/primitives/effects/auto-height), [Highlight](https://animate-ui.com/docs/primitives/effects/highlight), [Counting Number](https://animate-ui.com/docs/primitives/texts/counting-number), [Base UI Progress](https://animate-ui.com/docs/primitives/base/progress), [registry do Click](https://github.com/imskyleen/animate-ui/blob/efeb96ffd7a3b7a4868667e4ac3c346620fb3044/apps/www/registry/primitives/effects/click/index.tsx), [registry do Copy Button](https://github.com/imskyleen/animate-ui/blob/efeb96ffd7a3b7a4868667e4ac3c346620fb3044/apps/www/registry/components/buttons/copy/index.tsx).

## Instalação e dependências

### Confirmado

- Animate UI se define como distribuição aberta, não biblioteca npm: o shadcn CLI copia arquivos para o repositório e instala as dependências declaradas por cada item. [Introdução](https://animate-ui.com/docs)
- Um item simples como `primitives-effects-click` declara apenas `motion`; `sliding-number` acrescenta `react-use-measure`; `animate-tooltip` acrescenta `@floating-ui/react`; variantes Radix acrescentam `radix-ui`; variantes Base acrescentam `@base-ui-components/react`. [Registry do Click](https://github.com/imskyleen/animate-ui/blob/efeb96ffd7a3b7a4868667e4ac3c346620fb3044/apps/www/registry/primitives/effects/click/registry-item.json), [Sliding Number](https://github.com/imskyleen/animate-ui/blob/efeb96ffd7a3b7a4868667e4ac3c346620fb3044/apps/www/registry/primitives/texts/sliding-number/registry-item.json), [Tooltip](https://github.com/imskyleen/animate-ui/blob/efeb96ffd7a3b7a4868667e4ac3c346620fb3044/apps/www/registry/primitives/animate/tooltip/registry-item.json), [Base Switch](https://github.com/imskyleen/animate-ui/blob/efeb96ffd7a3b7a4868667e4ac3c346620fb3044/apps/www/registry/primitives/base/switch/registry-item.json).
- O pacote `motion@12.43.0` depende de `framer-motion ^12.43.0`; o ADScale já resolve `framer-motion@12.42.2`. [Metadata npm](https://registry.npmjs.org/motion/12.43.0)
- `@base-ui-components/react` publica na própria metadata a mensagem “Package was renamed to @base-ui/react”. [Metadata npm](https://registry.npmjs.org/@base-ui-components%2freact/latest)

### Inferência e orientação

Não rodar `shadcn add` diretamente na primeira onda. Para cada padrão aprovado, abrir o JSON/source upstream, copiar somente a lógica necessária e:

1. manter o primitive local `@base-ui/react` e seus contratos de teclado/foco;
2. trocar imports e caminhos internos pela infraestrutura local;
3. mapear spring/duração aos tokens e intensidades definidos na especificação;
4. incluir notice/licença no arquivo ou inventário de third-party code;
5. medir o chunk antes/depois.

## Next.js, SSR e React Server Components

### Confirmado

- Motion suporta Next.js Page e App Router. Para App Router, a documentação oferece duas rotas: marcar o arquivo com `"use client"` ao importar `motion/react`, ou usar `motion/react-client` para componentes renderizáveis a partir de RSC. [Instalação do Motion](https://motion.dev/docs/react-installation)
- Os sources relevantes examinados da Animate UI (`AutoHeight`, `Highlight`, `CountingNumber`, `Base Tabs`, `Base Switch`, `CopyButton` e ícones) começam com `"use client"` e importam `motion/react`; não usam `motion/react-client`. [AutoHeight source](https://github.com/imskyleen/animate-ui/blob/efeb96ffd7a3b7a4868667e4ac3c346620fb3044/apps/www/registry/primitives/effects/auto-height/index.tsx), [Base Tabs source](https://github.com/imskyleen/animate-ui/blob/efeb96ffd7a3b7a4868667e4ac3c346620fb3044/apps/www/registry/primitives/base/tabs/index.tsx)
- O `components.json` do ADScale declara `rsc: true`, mas o app já aceita client boundaries específicos para movimento.

### Inferência

- Não há incompatibilidade estrutural com SSR/Next 16, mas os componentes do registry **não são RSC-native**: cada adoção amplia ou introduz um client boundary. Props precisam continuar serializáveis quando atravessarem uma fronteira server→client.
- Browser APIs observadas estão em effects ou handlers (`document`/`window` no `Click`, `navigator.clipboard` no `CopyButton`), o que evita acesso durante render nos casos examinados. Isso não substitui um build/hydration test no app.
- Preferir manter animação nas folhas da árvore. Não mover páginas ou layouts server para client apenas para usar um efeito.

## Acessibilidade e reduced motion

### Confirmado

- A recomendação oficial da Animate UI é envolver a aplicação em `MotionConfig reducedMotion="user"`. Motion então desliga animações de transform e layout, mas preserva opacity/background color. [Acessibilidade da Animate UI](https://animate-ui.com/docs/accessibility), [MotionConfig](https://motion.dev/docs/react-motion-config)
- O ADScale tem três proteções existentes: media query CSS global, hook próprio `useReducedMotion` e usos locais do hook; porém seu `MotionProvider` atual só instala `LazyMotion` e **não** `MotionConfig`.
- Os itens examinados não chamam `useReducedMotion` individualmente, exceto o `Click`, que consulta `matchMedia` antes de gerar o efeito. O `CopyButton` troca apenas o ícone visual; o source não inclui live region ou texto “copiado”. [Click source](https://github.com/imskyleen/animate-ui/blob/efeb96ffd7a3b7a4868667e4ac3c346620fb3044/apps/www/registry/primitives/effects/click/index.tsx), [Copy Button source](https://github.com/imskyleen/animate-ui/blob/efeb96ffd7a3b7a4868667e4ac3c346620fb3044/apps/www/registry/components/buttons/copy/index.tsx)
- Ícones animados estão explicitamente em beta e o projeto recomenda atualizar o wrapper com frequência. [Guia de ícones](https://animate-ui.com/docs/icons/get-started)

### Inferência e gates obrigatórios

- O CSS global do ADScale reduz CSS animations/transitions, mas não governa transforms produzidos por Motion. Qualquer código Animate UI copiado precisa entrar sob uma política Motion compatível ou decidir reduced motion no próprio componente.
- `MotionConfig reducedMotion="user"` é um bom baseline, não aceite completo: opacity ainda anima e loops, contadores, timers ou mudanças de conteúdo podem exigir alternativa estática explícita.
- Feedback funcional nunca deve existir só como movimento. Manter `aria-busy`, `role=status`/live region quando necessário, texto/label estável, contraste, foco e navegação por teclado. Ícone decorativo deve ser oculto de tecnologia assistiva; ícone informativo precisa de nome acessível no controle.
- Antes de aprovar um primitive portado: teste por teclado, foco de entrada/retorno, leitor de tela nos estados inicial/final, `prefers-reduced-motion: reduce` e ausência de auto-loop.

## Bundle e desempenho

### Confirmado

- Motion documenta aproximadamente **34 kB** para o componente completo `motion`. Com `m` + `LazyMotion`, o render inicial pode ficar em **4,6 kB**; `domAnimation` adiciona cerca de 15 kB e `domMax`, 25 kB. Os números são de Rollup; a própria documentação alerta que Webpack tende a gerar bundles um pouco maiores. [Guia de bundle](https://motion.dev/docs/react-reduce-bundle-size)
- O ADScale compila com Next/Webpack e já usa `m` + `LazyMotion(domAnimation)` no provider global.
- A documentação do Motion afirma que importar/renderizar o componente completo `motion` dentro de `LazyMotion` elimina o benefício dessa estratégia; a Animate UI usa `motion`, não `m`, nos sources examinados. [LazyMotion](https://motion.dev/docs/react-lazy-motion)
- `domAnimation` cobre animações, variants, exit e gestures de tap/hover/focus; `domMax` acrescenta pan/drag e layout animations. Padrões Animate UI como Highlight, Tabs e Switch usam `layout`/`layoutId`.

### Inferência e orçamento

- Copiar um componente sem adaptar `motion`→`m` provavelmente aumenta o JS do chunk que o importa, mesmo que o motor base já exista. O delta real não foi medido nesta pesquisa e não deve ser estimado apenas pelo tamanho descompactado do npm.
- Converter cegamente tudo para `m` também não é correto: componentes que dependem de layout animation podem exigir `domMax`, import assíncrono ou uma versão CSS/WAAPI mais simples. A decisão deve ser por padrão, não global.
- Gate sugerido por oportunidade: bundle analyzer antes/depois na rota afetada, ausência de novo pacote primitivo, nenhum Long Task perceptível durante interação e teste em hardware/viewport móvel. O limite numérico final pertence à especificação de rollout, depois do baseline.

## Licença e manutenção

### Confirmado

- O README chama a licença de MIT, mas o arquivo canônico `LICENSE.md` diz **“MIT + Commons Clause License Condition”**. Ele permite uso comercial dentro de aplicação/site/produto, mas proíbe vender ou redistribuir os componentes em sua forma original, isolados ou em bundle. A classificação da API do GitHub é `NOASSERTION`, coerente com uma licença customizada. [Licença canônica](https://github.com/imskyleen/animate-ui/blob/efeb96ffd7a3b7a4868667e4ac3c346620fb3044/LICENSE.md), [repositório](https://github.com/imskyleen/animate-ui)
- O repositório não possui releases nem tags publicados. O último push/commit da branch `main` foi em 2025-12-31; o changelog público termina em `1.0.27` de 2025-12-15. [Último commit](https://github.com/imskyleen/animate-ui/commit/efeb96ffd7a3b7a4868667e4ac3c346620fb3044), [releases](https://github.com/imskyleen/animate-ui/releases), [tags](https://github.com/imskyleen/animate-ui/tags), [changelog](https://animate-ui.com/docs/changelog)
- O snapshot upstream ainda referencia o nome depreciado de Base UI e declara os ícones como beta.

### Inferência

- A licença é compatível com usar código adaptado dentro do SaaS ADScale, mas não deve ser registrada internamente como “MIT puro”. Preservar copyright/notice e evitar republicar um catálogo copiável sem revisão jurídica.
- A cadência parada por sete meses, ausência de releases/tags e dependência renomeada significam que o ADScale deve assumir ownership do código copiado. Não basear primitives críticos em atualizações automáticas do registry.

## Recomendação final para o mapa

### Adotar

- A linguagem e os padrões, não a distribuição inteira.
- Uma política Motion global coerente com reduced motion **dentro do provider existente**, depois de verificar o impacto nos componentes atuais; a [spec](https://github.com/jhowtkd/adscale/issues/138) não autoriza um segundo provider/runtime.
- Microfeedback controlado por estado real da aplicação, com começo/fim determinísticos e sem loop por padrão.

### Adaptar

- `Highlight`, progresso/número, troca de ícone e poucos ícones de status. `AutoHeight` fica como exceção condicionada à regra de layout da [spec](https://github.com/jhowtkd/adscale/issues/138), não como candidata preaprovada.
- Composição sobre `@base-ui/react`, Button e tokens locais.
- Imports através do boundary atual; `domMax` ou import direto apenas quando uma necessidade de layout comprovada justificar o custo.

### Rejeitar na primeira especificação

- Instalação indiscriminada pelo CLI.
- Variantes Radix/Headless e wrappers Base UI upstream.
- Substituição de Dialog, Sheet, Menu, Tooltip e Button.
- Backgrounds, partículas, magnetic/tilt, texto ornamental e componentes community.

## O que ainda precisa ser provado antes da implementação

1. inventário das superfícies reais onde o estado muda sem feedback suficiente;
2. matriz oportunidade→primitive local→padrão Animate UI→intensidade;
3. protótipo apenas para padrões de layout/altura cuja sensação não possa ser decidida em código estático;
4. baseline e diff de bundle por rota;
5. testes de teclado, foco, leitor de tela e reduced motion;
6. revisão de notice/licença no processo de third-party code.

Esses itens são gates da futura especificação, não bloqueios para concluir esta decisão: **a adoção seletiva é tecnicamente viável, desde que seja um port sobre o sistema existente e não uma segunda biblioteca de UI.**
