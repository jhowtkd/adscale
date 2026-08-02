# Primeira onda de microanimações

Data: 2026-08-02

Escopo: [#139](https://github.com/jhowtkd/adscale/issues/139)

Fontes: [baseline autenticado](./motion-baseline.md), [evidência bruta](./motion-baseline-evidence.json), [pesquisa da Animate UI](https://github.com/jhowtkd/adscale/issues/136) e [spec](https://github.com/jhowtkd/adscale/issues/138).

## Resultado

A primeira onda adota a política global de reduced motion e adapta quatro padrões de microfeedback. Ela não instala a Animate UI, não copia seus primitives e não adiciona outro runtime. Todo código novo deve entrar pelo `MotionBoundary`, usar os tokens locais e preservar o estado funcional já existente.

## Linguagem de movimento

| Intensidade | Uso | Timing canônico | Reduced motion |
|---|---|---|---|
| Contida | foco, seleção, toggle e confirmação frequente | `--duration-fast` / `--ease-product` | estado final imediato; cor, borda, texto e ícone continuam perceptíveis |
| Moderada | progresso, mudança de status e continuidade dentro da mesma tarefa | `--duration-default` / `--ease-emphasized` | sem deslocamento, contagem ou loop; valor final e status aparecem imediatamente |
| Expressiva | nenhum caso aprovado nesta onda | não aplicável | não aplicável |

Regras globais: sem bounce, sem atraso de conteúdo crítico, sem animar propriedades de layout, sem loop decorativo, sem significado comunicado apenas por movimento e sem `transition-all` novo.

## Matriz aprovada

### 1. Política global de reduced motion

- **Decisão:** `adotar` a política `reducedMotion="user"` no provider existente; não adotar outro provider.
- **Superfície/seam:** `app/src/components/animations/MotionBoundary.tsx` e seu teste; prova autenticada no Creative Composer.
- **Resultado:** transforms e layout motion são suprimidos pela preferência do sistema, enquanto opacity/cor e estado funcional permanecem disponíveis.
- **Intensidade:** contrato global, não uma animação visível.
- **Reduced motion:** a preferência `reduce` suprime movimento espacial/repetitivo na runtime; feedback funcional permanece visível.
- **Acessibilidade:** preferência do usuário governa a runtime; conteúdo, foco, live regions e nomes acessíveis não mudam.
- **Desempenho:** nenhum pacote e nenhum client boundary novo; reutiliza `LazyMotion(domAnimation)`.
- **Risco:** os dois hooks atuais podem divergir. O boundary vira seam canônico; migração de consumidores é incremental.
- **Aceite:** teste público do provider verifica a configuração e um fluxo autenticado termina com `no-preference` e `reduce`.
- **Entrega:** [#140](https://github.com/jhowtkd/adscale/issues/140).

### 2. Continuidade de seleção

- **Decisão:** `adaptar` a ideia de Highlight, sem copiar o componente upstream e sem exigir `domMax`/layout animation.
- **Superfícies:** seleção de linhas em `CampaignsV6View`; seleção/foco de cards em `LibraryV6View`.
- **Primitive local:** checkbox/estado selecionado existente, pseudo-elemento/CSS compositado e tokens locais.
- **Resultado:** fundo/borda de seleção responde de forma contida e a geometria do item não muda.
- **Intensidade:** contida.
- **Reduced motion:** seleção continua visível por cor, borda e atributo sem transição espacial.
- **Acessibilidade:** checkbox ou semântica pública existente continua sendo a fonte de verdade; `:focus-visible` não é removido.
- **Desempenho:** CSS em opacity/background/border; nenhum `layoutId`, medição de DOM ou runtime adicional.
- **Risco:** não confundir hover/foco com seleção persistida; biblioteca não ganha seleção persistente onde ela não existe.
- **Aceite:** testes acionam controles públicos, observam `checked`/estado selecionado e foco, sem assertar frames.
- **Entrega:** [#141](https://github.com/jhowtkd/adscale/issues/141).

### 3. Progresso e números

- **Decisão:** `adaptar` Counting Number/Progress como continuidade de valor, sem copiar o primitive upstream.
- **Superfícies:** `AdsScientistProgressCard`/`LaboratoryProgressPanel` no dashboard e estados de progresso já expostos pelo Trabalho Criativo.
- **Primitive local:** barra e texto de progresso existentes; helper pequeno somente se houver dois consumidores reais.
- **Resultado:** largura/valor responde sem bounce, layout shift ou atraso; loading, sucesso, falha e retry mantêm a semântica atual.
- **Intensidade:** moderada para progresso; contida para números auxiliares.
- **Reduced motion:** valor final e largura final são aplicados imediatamente; nenhuma contagem decorativa.
- **Acessibilidade:** `aria-valuenow`, label e live status refletem o valor real, não frames intermediários.
- **Desempenho:** CSS transform/scale ou width já existente quando seguro; zero timer por frame e nenhuma dependência.
- **Risco:** anunciar cada frame ou animar valor desconhecido. Leitor de tela recebe apenas estado significativo.
- **Aceite:** fixtures controladas cobrem loading, avanço, conclusão e falha sem geração paga.
- **Entrega:** [#142](https://github.com/jhowtkd/adscale/issues/142).

### 4. Confirmação por ícone e status

- **Decisão:** `adaptar` Icon Switch/Copy Button como troca de estado real, sem copiar o botão upstream.
- **Superfícies:** botão de salvar do `ProfileTab` como representante frequente e aprovação de output no componente de resultado do Trabalho Criativo como representante de supervisão.
- **Primitive local:** Button existente, ícones Lucide, texto e live status já presentes.
- **Resultado:** idle → pending → success/error fica legível e não permite dupla submissão ou falso sucesso.
- **Intensidade:** contida.
- **Reduced motion:** ícone/texto trocam imediatamente; confirmação sem rotação, escala ou deslocamento.
- **Acessibilidade:** nome acessível, `aria-busy`, disabled, foco e status textual continuam coerentes; ícone é decorativo.
- **Desempenho:** troca local de opacity/transform sob o boundary, sem pacote de ícones adicional.
- **Risco:** timer visual sobreviver a unmount ou sucesso aparecer antes da mutação. Estado de negócio continua sendo a fonte de verdade.
- **Aceite:** testes públicos cobrem pending/success/error/retry e foco.
- **Entrega:** [#143](https://github.com/jhowtkd/adscale/issues/143).

### 5. Feedback de toggles Base UI

- **Decisão:** `adaptar` o feedback visual dos toggles da Animate UI sobre os primitives locais; rejeitar os wrappers Base UI upstream.
- **Superfícies:** `Switch` compartilhado em configurações e a seleção de opções do onboarding/Brand Training que já usa estado controlado.
- **Primitive local:** `app/src/components/ui/switch.tsx` e controles existentes.
- **Resultado:** trilho/thumb e check respondem de forma contida sem alterar `checked`, `onCheckedChange`, formulário ou persistência.
- **Intensidade:** contida.
- **Reduced motion:** posição final e contraste aparecem imediatamente; sem spring.
- **Acessibilidade:** teclado, disabled, nome acessível, foco visível e semântica checked permanecem do Base UI.
- **Desempenho:** CSS e tokens locais; nenhuma cópia de `@base-ui-components/react` e nenhum runtime novo.
- **Risco:** wrapper quebrar refs/props controladas. A implementação deve tocar o primitive existente, não criar outro.
- **Aceite:** teste do primitive e uma superfície representativa verificam mouse/teclado, controlled, disabled e reduce.
- **Entrega:** [#144](https://github.com/jhowtkd/adscale/issues/144).

## Manter

| Componente/padrão | Decisão | Motivo |
|---|---|---|
| Button | `manter` | contrato local já cobre variants, foco, disabled e composição |
| Dialog | `manter` | overlay, trap e restauração de foco já pertencem ao primitive local |
| Sheet | `manter` | substituir duplicaria overlay e acessibilidade |
| Menu | `manter` | comportamento Base UI local é a fonte de verdade |
| Tooltip | `manter` | não há lacuna funcional demonstrada |
| FadeIn/Stagger/AdscaleLoader | `manter` | helpers já respeitam o contrato local; só recebem a política global do provider |

## Rejeitar ou adiar

| Candidata | Decisão | Motivo |
|---|---|---|
| instalação pelo CLI/catálogo | `rejeitar` | cria código e dependências sem necessidade |
| wrappers Radix/Headless/Base UI upstream | `rejeitar` | incompatíveis ou redundantes com `@base-ui/react` local |
| backgrounds, partículas, magnetic, tilt e texto ornamental | `rejeitar` | não comunicam estado funcional e ampliam distração/custo |
| ícones animados beta | `rejeitar` nesta onda | manutenção upstream incerta; Lucide e estado textual já resolvem o caso |
| AutoHeight | `adiar` | somente após salto de layout medido que CSS/layout nativo não resolva |
| `layoutId`/`domMax` para Highlight | `rejeitar` nesta onda | custo e medição de layout não se justificam para seleção estável |

## Ordem e gates

1. #140 estabelece o contrato global.
2. #141–#144 podem avançar em paralelo somente após #140.
3. #145 valida a linguagem integrada.

Cada slice deve passar testes focados, typecheck e o checker visual; #145 executa build, suíte completa, temas/viewports e mede o delta de bundle. Nenhum slice pode alterar geração, billing, créditos, persistência, permissões ou recuperação de erro. Nenhum teste usa geração paga.
