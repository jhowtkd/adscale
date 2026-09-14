> Execução local concluída em 2026-09-08, commit `bcbbfdb5`. [Evidência de implementação e validação](/Users/jhonatan/.cursor/worktrees/adscale_2/studio-caixa-unificada/docs/evidence/2026-09-08-studio-caixa-unificada.md). Sem publicação. A validação mobile usou viewport em navegador desktop; teclado virtual em aparelho real não foi verificado.

# Studio Caixa Unificada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a proposta aprovada do Estúdio: mesa de cartazes preservada, controles dentro da caixa expansível e alternância entre inspirações e produção real da campanha ou marca.

**Architecture:** Evoluir `TalkBox` e `BrandStageHome`, mantendo uma instância de `useCreativeComposer` e os componentes de configuração existentes. Renderizar resultados fora do dock por um destino DOM estável, sem desmontar o carrossel. Acrescentar uma consulta paginada e autenticada de produção sobre as tabelas existentes, sem outro motor de geração ou persistência.

**Tech Stack:** Next.js 16, React, TypeScript, Tailwind/CSS Modules, next-intl, TanStack Query, Drizzle/PostgreSQL, Vitest/Testing Library e Playwright já instalados.

**Spec:** `docs/plans/2026-09-08-studio-caixa-unificada.md`. Referência visual aprovada: `/Users/jhonatan/.codex/visualizations/2026/09/08/01a07ffe-2d5e-7950-ac67-5007ed4601ce/proposta/index.html`, com capturas no mesmo diretório. Ler ambos antes de executar.

## Global Constraints

- “Preservar a mesa cheia de cartazes e a caixa com borda colorida animada.”
- “Campanha continua opcional.”
- “Recolher preserva pedido, anexos, escolhas e fase do fluxo.”
- “Reutilizar `ShineBorder` e CSS; nenhuma dependência nova.”
- “Respeitar `prefers-reduced-motion`.”
- “Preservar limite de três anexos e suas restrições atuais, inclusive no arrastar e soltar.”
- “Não criar tabelas, migrar dados ou fazer uma chamada de detalhes por cartaz.”
- “Não executar E2E contra produção nem provedores pagos para validar esta alteração.”
- “Aprovação visual final e publicação são etapas posteriores e distintas.”
- “O escopo não inclui redesenhar sidebar, biblioteca, marca ou editor de resultados.”
- A consulta de produção proposta na Task 4 altera contrato HTTP. Antes de implementá-la, registrar aprovação específica dessa extensão, conforme `AGENTS.md`. A solicitação deste documento autoriza planejamento, não execução ou deploy.
- Preservar `expectedUpdatedAt`, conflitos 409, aprovação de planos, revisão do carrossel e todos os bloqueios existentes de geração. Não modificar handlers de cobrança, jobs ou providers.
- Ler `app/AGENTS.md`, os guias pertinentes em `app/node_modules/next/dist/docs/`, `CONTEXT.md`, `docs/agents/source-of-truth.md` e ADR 0013 antes de editar código. Se executar em worktree, usar `superpowers:using-git-worktrees` no início da execução.

---

## Precisões em relação ao primeiro plano

1. O modelo público atual usa `CreativeSourceUsage = "content" | "style" | "both"`; os nomes `content_art` e `style_reference` do primeiro plano eram descrições conceituais. Não renomear o contrato.
2. `useCreativeInspirations` atualmente lê o catálogo curado. Manter esse comportamento; esta tarefa não modifica a curadoria.
3. Produção inclui outputs de `creative_work`, slides atuais e derivations de campanhas históricas. Excluir anexos, previews de geração e itens sem resultado concluído. Não esconder peças históricas de campanhas existentes.
4. A seleção de um cartaz de produção abre a revisão existente do trabalho. Não criar neste escopo uma nova operação de converter qualquer output em referência; os fluxos existentes de reutilização continuam disponíveis na revisão.
5. A revisão do carrossel deve conservar seu componente atual e sair visualmente do dock; um portal para um elemento estável resolve isso sem uma segunda instância de `CarouselComposer`.
6. Não adicionar feature flag ou rota paralela. Os dois valores existentes de `rolloutVariant` devem funcionar; a alteração é de apresentação.

## File structure e responsabilidades

Caminhos abaixo relativos à raiz do repositório. Comandos `npm` executados em `app/`; comandos `git` na raiz. Números de linha são âncoras do snapshot de 08/09/2026, não limites rígidos.

| Arquivo | Ação e responsabilidade |
| --- | --- |
| `app/src/components/dashboard/studio-stage/TalkBox.tsx:26` | Modificar: expansão, conteúdo contextual, resumo, foco e visibilidade dos controles pertencentes ao host. |
| `app/src/components/dashboard/studio-stage/TalkBox.test.tsx` | Criar: ciclo de expansão, preservação de DOM/estado e validações de entrada. |
| `app/src/components/dashboard/studio-stage/BrandStageHome.tsx:113` | Modificar: posição estável da caixa, fundo desfocado/inert, resultados e mesa paginada. |
| `app/src/components/dashboard/studio-stage/BrandStageHome.test.tsx` | Criar: nenhuma remontagem entre ocupações; cartazes sem repetição artificial. |
| `app/src/components/dashboard/studio-stage/StudioStage.module.css` | Criar: geometria do dock, expansão, desfoque e movimento reduzido. |
| `app/src/components/dashboard/DashboardHomeActions.tsx:223` | Modificar: conectar apresentação ao único controlador existente; escolher fonte da mesa. |
| `app/src/components/dashboard/DashboardHomeActions.test.tsx` | Modificar: integração do switcher, escopo e callbacks canônicos. |
| `app/src/components/creative-work/CreativeComposer.tsx:22` | Modificar: destino externo de resultados, pedido externo do carrossel e recuperação de foco. |
| `app/src/components/creative-work/CreativeComposer.test.tsx` | Modificar: composição real com TalkBox, sem mocks dos dois componentes. |
| `app/src/components/creative-work/CarouselComposer.tsx:54` | Modificar: pedido externo opcional e portal de resultados; manter fases e estado local. |
| `app/src/components/creative-work/CarouselComposer.test.tsx` | Modificar: fases, preservação de respostas e revisão fora do dock. |
| `app/messages/pt-BR.json`, `app/messages/en.json` | Modificar: novas mensagens de caixa/mesa nos dois idiomas existentes. |
| `app/src/lib/creative-production.ts` | Criar: tipos públicos da consulta, compartilhados por hook e servidor. |
| `app/src/server/repositories/creative-production.ts` | Criar: leitura SQL por workspace/marca/campanha e paginação. |
| `app/src/server/repositories/creative-production.test.ts` | Criar: parâmetros, cursor e execução isolada contra PostgreSQL de teste. |
| `app/src/server/application/list-creative-production.ts` | Criar: projeção de linhas em URLs autorizadas, sem vazar campos privados. |
| `app/src/server/application/list-creative-production.test.ts` | Criar: projeção, página e origens. |
| `app/src/app/api/creative-work/route.ts:65`, `route.test.ts` no mesmo diretório | Modificar: branch `view=production`; manter retorno padrão e demais views. |
| `app/src/lib/hooks/use-creative-production.ts`, `use-creative-production.test.tsx` | Criar: InfiniteQuery com chave de escopo, cancelamento e paginação. |
| `app/tests/e2e/frictionless-home.spec.ts`, `creative-work-carousel.spec.ts` | Modificar: validar caixa/switcher e regressões com provider controlado. |

Não é necessário extrair todos os controles de `CreativeComposer` para arquivos novos. O componente atual já tem `chrome="stage"`; movê-lo para dentro de TalkBox evita duplicar sua implementação. Não modificar `CreativeWorkResumeSurface.tsx`: a compatibilidade será verificada com seus testes existentes.

## Task 1: Caixa expansível com montagem estável

**Files:**
- Modify: `app/src/components/dashboard/studio-stage/TalkBox.tsx:26-284`
- Modify: `app/src/components/dashboard/studio-stage/BrandStageHome.tsx:113-218`
- Create: `app/src/components/dashboard/studio-stage/StudioStage.module.css`
- Create/Test: `app/src/components/dashboard/studio-stage/TalkBox.test.tsx`
- Create/Test: `app/src/components/dashboard/studio-stage/BrandStageHome.test.tsx`
- Modify: `app/messages/pt-BR.json`, `app/messages/en.json`

**Interfaces:**
- Consumes: props atuais de TalkBox, incluindo `request`, `intent`, `sources`, `onGenerate`, `onRequestFocusChange`.
- Produces: props opcionais de TalkBox definidas abaixo; props novas de BrandStageHome `expanded?: boolean`, `onCollapse?: () => void`, `results?: ReactNode`, `deskControls?: ReactNode`. Todos os defaults preservam os callers antigos.

- [ ] **Step 1: Escrever o teste da transição sem remontagem.**

Em `TalkBox.test.tsx`, usar componentes reais e tradução por chave. Importar React `useState`, Testing Library `render`, `screen`, `fireEvent`, e Vitest `vi`, `it`, `expect`. Mockar somente `next-intl` com `useTranslations: () => (key: string) => key` e `useLocale: () => "pt-BR"`.

```tsx
import { TalkBox } from "./TalkBox";

it("recolhe sem perder o pedido e o controle contextual", () => {
  const generate = vi.fn();
  function Harness() {
    const [expanded, setExpanded] = useState(false);
    const [request, setRequest] = useState("Campanha de setembro");
    return <TalkBox placement="dock" request={request}
      onRequestChange={setRequest} intent="single" onSelectIntent={vi.fn()}
      sources={[]} onAddFiles={vi.fn()} error={null}
      onGenerate={generate} generateLabel="Gerar"
      expanded={expanded} onExpandedChange={setExpanded}>
      <input aria-label="Detalhe local" defaultValue="preservado" />
    </TalkBox>;
  }
  render(<Harness />);
  const request = document.querySelector("#creative-composer-request")!;
  fireEvent.focus(request);
  const detail = screen.getByLabelText("Detalhe local");
  fireEvent.change(detail, { target: { value: "edição local" } });
  fireEvent.click(screen.getByRole("button", { name: "studioDesk.collapse" }));
  expect(screen.getByTestId("studio-talk-box")).toHaveAttribute("data-expanded", "false");
  fireEvent.click(screen.getByRole("button", { name: "studioDesk.expand" }));
  expect(screen.getByLabelText("Detalhe local")).toBe(detail);
  expect(detail).toHaveValue("edição local");
  expect(request).toHaveValue("Campanha de setembro");
  expect(generate).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Rodar o teste vermelho.**

Run: `npm test -- src/components/dashboard/studio-stage/TalkBox.test.tsx`

Expected: FAIL porque faltam expansão e botão de recolher. Falha de import/ambiente não conta como prova do comportamento.

- [ ] **Step 3: Adicionar o contrato de apresentação a TalkBox.**

Acrescentar estes campos ao tipo atual; importar `ReactNode`, `RefObject`, `useId`. Os defaults são `expanded=false`, `showRequest=true`, `showAttachments=true`, `showGenerate=true`. Não copiar seu código de validação: continuar chamando `generate` atual.

```ts
expanded?: boolean;
onExpandedChange?: (expanded: boolean) => void;
children?: ReactNode;
summary?: ReactNode;
requestRef?: RefObject<HTMLTextAreaElement | null>;
primaryActionRef?: RefObject<HTMLButtonElement | null>;
expansionButtonRef?: RefObject<HTMLButtonElement | null>;
showRequest?: boolean;
showAttachments?: boolean;
showGenerate?: boolean;
```

Adicionar um botão que permanece no DOM e recebe o foco ao recolher. Colocar o conteúdo contextual em grid animado, sem `{expanded && children}`. Conservar o pedido e o rodapé fora desse grid. Não atribuir `role="dialog"` ou `aria-modal`: a caixa é uma região expansível; a sidebar continua disponível.

```tsx
const internalToggleRef = useRef<HTMLButtonElement>(null);
const toggleRef = expansionButtonRef ?? internalToggleRef;
const controlsId = useId();
const collapse = () => {
  toggleRef.current?.focus();
  onExpandedChange?.(false);
};
// No div studio-talk-box:
// data-expanded={expanded ? "true" : "false"}
// onKeyDown={handleKeyDown}
const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
  if (event.key !== "Escape" || event.defaultPrevented || !expanded) return;
  if (!event.currentTarget.contains(event.target as Node)) return;
  if (event.target instanceof HTMLSelectElement) return;
  if (document.querySelector('[data-slot="tooltip-content"][data-open], [role="dialog"][data-open], [role="listbox"][data-open], [role="menu"][data-open]')) return;
  event.preventDefault();
  collapse();
};

<button ref={toggleRef} type="button" aria-expanded={expanded}
  aria-controls={controlsId}
  onClick={() => expanded ? collapse() : onExpandedChange?.(true)}>
  {t(expanded ? "studioDesk.collapse" : "studioDesk.expand")}
</button>
{!expanded ? summary : null}
<div id={controlsId} className={styles.controls}
  data-expanded={expanded ? "true" : "false"}
  inert={!expanded} aria-hidden={!expanded}>
  <div className={styles.controlsInner}>{children}</div>
</div>
```

No textarea existente, usar `ref={requestRef}` e, no `onFocus`, chamar `onExpandedChange?.(true)` e `onRequestFocusChange?.(true)`. Manter o `onBlur` atual. Envolver o bloco label/textarea em `showRequest`; a área de anexos em `showAttachments`; o botão Gerar em `showGenerate && !hideGenerateWhileInterviewOwnsEntry`. Usar `ref={primaryActionRef}` no botão. Desabilitá-lo enquanto `queued`; não substituir as regras de elegibilidade por uma validação genérica de texto obrigatório.

- [ ] **Step 4: Fixar uma única posição React para o dock.**

Em BrandStageHome, retirar `{talkBox}` dos dois braços de `empty ? ... : ...`. Renderizar uma única vez depois da área da mesa, com classe derivada de `empty`. Manter o mesmo pai e sem `key` baseada em ocupação/modo. Passar `expanded` como data attribute ao workspace.

Estrutura de destino (reutilizar WorkMosaic, EdgeField, ImageCursorTrail e a barra atual):

```tsx
<div className={styles.workspace} data-empty={empty ? "true" : "false"}
  data-expanded={expanded ? "true" : "false"}>
  <div data-testid="studio-desk" className={styles.desk} inert={expanded}>
    {deskControls}
    {empty ? <EdgeField items={mosaicItems} onSelect={onSelectMosaic} />
      : <WorkMosaic items={mosaicItems} onSelect={onSelectMosaic} />}
  </div>
  {expanded ? <button type="button" tabIndex={-1} aria-hidden="true"
    className={styles.backdrop} onClick={onCollapse} /> : null}
  <div data-testid="studio-dock" className={styles.dock}>{talkBox}</div>
</div>
<div data-testid="studio-results-surface">{results}{children}</div>
```

Preservar título/subtítulo de entrada e continueWork como irmãos da mesa sob o mesmo tratamento de desfoque/inert. Não deixar botões invisíveis acessíveis; remover o slot `BrandInspirations` em `sr-only` na integração da Task 2, pois o catálogo visível já oferece a ação. Posicionar ImageCursorTrail somente na área vazia da mesa, sem interceptar o dock.

```css
.workspace { position: relative; min-height: calc(100dvh - 11rem); }
.desk { position: absolute; inset: 0; transition: filter 320ms ease, opacity 320ms ease; }
.workspace[data-expanded="true"] .desk { filter: blur(8px); opacity: .34; }
.backdrop { position: absolute; inset: 0; z-index: 7; background: rgb(0 0 0 / .16); }
.dock { position: absolute; inset-inline: 0; bottom: max(.75rem, env(safe-area-inset-bottom)); z-index: 10; }
.workspace[data-empty="true"][data-expanded="false"] .dock { max-width: 42rem; margin-inline: auto; bottom: 22%; }
.controls { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 320ms ease; }
.controls[data-expanded="true"] { grid-template-rows: 1fr; }
.controlsInner { overflow: hidden; min-height: 0; }
.controls[data-expanded="true"] .controlsInner { max-height: max(8rem, calc(100dvh - 23rem)); overflow-y: auto; overscroll-behavior: contain; }
.talkBox { max-height: calc(100dvh - 6rem); overflow-y: auto; overscroll-behavior: contain; }
.footer { position: sticky; bottom: 0; background: var(--surface-base); }
@media (prefers-reduced-motion: reduce) {
  .desk, .controls { transition: none; }
}
```

Importar o módulo como `styles` nos dois arquivos. Aplicar `styles.talkBox` ao div studio-talk-box e `styles.footer` ao rodapé de anexos/ação. Fundo da caixa expandida: `bg-[var(--surface-base)]`, mantendo `ShineBorder` com raio 28, espessura 1, duração 28 e cores atuais. O CSS acima estabelece a geometria; ajustar o limite vertical na Task 6 com teclado móvel, sem reduzir tamanho de texto para esconder overflow. O guard de Escape usa os atributos `data-open` dos popups Base UI já instalados e deixa seus handlers processarem primeiro o fechamento.

- [ ] **Step 5: Acrescentar teste de ocupação e mensagens.**

Em BrandStageHome.test.tsx, renderizar um input não controlado como `talkBox`; usar `rerender` de occupancy empty para work e verificar identidade do nó e valor. Usar os mesmos props obrigatórios em ambos os renders:

```tsx
const props = { brandName: "Marca A", headline: "Criar", subtitle: "Pedido",
  eyebrow: "Estúdio", mosaicItems: [], topBar: null, onDropFiles: vi.fn(),
  dropLabel: "Soltar imagens", talkBox: <input aria-label="Rascunho" /> };
const view = render(<BrandStageHome {...props} occupancy="empty" />);
const input = screen.getByLabelText("Rascunho");
fireEvent.change(input, { target: { value: "não remontar" } });
view.rerender(<BrandStageHome {...props} occupancy="work" />);
expect(screen.getByLabelText("Rascunho")).toBe(input);
expect(input).toHaveValue("não remontar");
```

Adicionar `dashboard.home.studioDesk` aos JSONs, sem alterar outras chaves:

```json
{
  "expand": "Abrir controles", "collapse": "Recolher controles",
  "inspirations": "Inspirações", "production": "Produção",
  "views": "Conteúdo da mesa", "loading": "Carregando produção…",
  "empty": "Nenhuma peça produzida neste contexto.",
  "error": "Não foi possível carregar a produção.",
  "retry": "Tentar novamente", "create": "Criar uma peça",
  "next": "Próximas peças", "previous": "Peças anteriores",
  "brandScope": "Produção de {name}", "campaignScope": "Campanha: {name}",
  "slide": "Tela {position}", "unnamedCampaign": "Campanha selecionada"
}
```

Valores em inglês, na mesma ordem: `Open controls`, `Collapse controls`, `Inspirations`, `Production`, `Desk content`, `Loading production…`, `No pieces produced in this context.`, `Could not load production.`, `Try again`, `Create a piece`, `Next pieces`, `Previous pieces`, `Production for {name}`, `Campaign: {name}`, `Slide {position}`, `Selected campaign`.

- [ ] **Step 6: Rodar verde e commitar o comportamento isolado.**

Run: `npm test -- src/components/dashboard/studio-stage/TalkBox.test.tsx src/components/dashboard/studio-stage/BrandStageHome.test.tsx src/components/dashboard/DashboardHomeActions.test.tsx`

Expected: PASS; callers antigos continuam compilando porque as props são opcionais.

```bash
git add app/src/components/dashboard/studio-stage/TalkBox.tsx app/src/components/dashboard/studio-stage/TalkBox.test.tsx app/src/components/dashboard/studio-stage/BrandStageHome.tsx app/src/components/dashboard/studio-stage/BrandStageHome.test.tsx app/src/components/dashboard/studio-stage/StudioStage.module.css app/messages/pt-BR.json app/messages/en.json
git commit -m "feat(studio): add expandable creation box without remounting"
```

## Task 2: Colocar os controles canônicos dentro da caixa

**Files:**
- Modify: `app/src/components/dashboard/DashboardHomeActions.tsx:266-476`
- Modify: `app/src/components/creative-work/CreativeComposer.tsx:22-340`
- Test: `app/src/components/creative-work/CreativeComposer.test.tsx`
- Test: `app/src/components/dashboard/DashboardHomeActions.test.tsx`

**Interfaces:**
- Consumes: novas props de TalkBox e BrandStageHome da Task 1; `CreativeComposerViewModel`, callbacks e `composerRef` existentes.
- Produces: props opcionais de CreativeComposer `resultsContainer?: HTMLElement | null`, `primaryActionRef?: RefObject<HTMLButtonElement | null>`. O primeiro define o destino visual dos resultados; o segundo restaura foco depois de resolver conflito de marca.

- [ ] **Step 1: Escrever regressão com TalkBox e CreativeComposer reais.**

Adicionar ao teste existente de CreativeComposer, usando sua factory `composer()` e imports de `TalkBox` e `useState`. Não mockar nenhum dos dois componentes:

```tsx
it("coloca configurações na caixa sem duplicar o pedido", () => {
  const model = composer({ intent: "single" });
  function Harness() {
    const [expanded, setExpanded] = useState(true);
    return <TalkBox placement="dock" request={model.request}
      onRequestChange={model.setRequest} intent="single" onSelectIntent={model.selectIntent}
      sources={[]} onAddFiles={model.addFiles} error={null}
      onGenerate={model.preparePlan} generateLabel="Gerar"
      expanded={expanded} onExpandedChange={setExpanded}>
      <CreativeComposer composer={model as CreativeComposerViewModel}
        composerRef={model.composerRef} chrome="stage" />
    </TalkBox>;
  }
  render(<Harness />);
  const box = screen.getByTestId("studio-talk-box");
  expect(document.querySelectorAll("#creative-composer-request")).toHaveLength(1);
  expect(box).toContainElement(screen.getByTestId("creative-optional-settings"));
  expect(screen.getAllByRole("button", { name: "Gerar", exact: true })).toHaveLength(1);
});
```

Esse teste prova a combinação dos componentes; acrescentar ao teste de Dashboard uma asserção `within(studio-talk-box).getByTestId("creative-composer")` para provar que o host usa essa combinação. O teste do host deve falhar antes da mudança, pois hoje CreativeComposer fica fora da caixa.

- [ ] **Step 2: Rodar a regressão vermelha do host.**

Run: `npm test -- src/components/dashboard/DashboardHomeActions.test.tsx`

Expected: FAIL na contenção de `creative-composer` dentro de `studio-talk-box`.

- [ ] **Step 3: Mover a composição preservando um único controlador.**

Em DashboardHomeActions, manter a chamada existente de `useCreativeComposer`; adicionar somente estado de apresentação e destino de resultados:

```tsx
const [boxExpanded, setBoxExpanded] = useState(false);
const [resultsContainer, setResultsContainer] = useState<HTMLDivElement | null>(null);
const primaryActionRef = useRef<HTMLButtonElement>(null);
const expansionButtonRef = useRef<HTMLButtonElement>(null);
const isCarouselWorkflow = composer.intent === "carousel";
```

Mover para o `children` de TalkBox, nesta ordem: `protocolSwitchControls`, aviso de saldo do plano, `CreativePlanReview` editável e `CreativeComposer chrome="stage"`. Manter CreativeComposer montado durante a revisão do plano: usar wrapper `hidden={showPlan}` para suas configurações em vez de `showComposer ? ... : null`. Não modificar os handlers existentes de edição/confirmGeneration.

```tsx
<div hidden={showPlan}>
  <CreativeComposer composer={composer} composerRef={composerRef}
    workflowVariant={rolloutVariant === "progressive" ? "progressive" : "control"}
    resultsOnly={resultStage} chrome="stage"
    resultsContainer={resultsContainer} primaryActionRef={primaryActionRef} />
</div>
```

Passar para TalkBox `requestRef={composerRef}`, `primaryActionRef`, `expansionButtonRef`, `expanded={boxExpanded}`, `onExpandedChange={setBoxExpanded}` e `showGenerate={!showPlan && !resultStage && !isCarouselWorkflow}`. O CTA do plano permanece o do componente CreativePlanReview. A Task 3 dará ao carrossel seu pedido externo; até lá, o teste de carrossel deve permanecer destacado como dependência, sem declarar a feature finalizada.

Adicionar resumo compacto somente com valores existentes, sem informação inventada:

```tsx
summary={<span className="text-xs text-[var(--text-secondary)]">
  {[composer.brandName, composer.format, sources.length ? `${sources.length}/3` : null]
    .filter(Boolean).join(" · ")}
</span>}
```

Na escolha de protocolo, referência e drop: abrir a caixa e chamar exatamente o handler canônico atual. Não substituir o protocolo sugerido por um default do protótipo. Usar `setBoxExpanded(true)` também quando surgir `pendingProtocolSwitch`, `brandConflict` ou `showPlan`. Fechar visualmente a caixa quando `resultStage` começar; não limpar o pedido.

```tsx
useEffect(() => {
  if (composer.pendingProtocolSwitch || composer.brandConflict || showPlan) setBoxExpanded(true);
}, [composer.pendingProtocolSwitch, composer.brandConflict, showPlan]);
useEffect(() => { if (resultStage) setBoxExpanded(false); }, [resultStage]);
```

Passar ao BrandStageHome `expanded={boxExpanded}`, `onCollapse={() => { expansionButtonRef.current?.focus(); setBoxExpanded(false); }}` e `results={<div ref={setResultsContainer} />}`. Remover o antigo `stageBody` de configuração sobre a mesa. Conservar resumo de resultados, plano somente leitura e associação de campanha no bloco de resultados, usando as condições existentes. Remover a cópia de BrandInspirations escondida em `sr-only` e seu import: não há motivo para dois catálogos interativos.

- [ ] **Step 4: Renderizar resultados pelo destino estável.**

Importar `createPortal` de `react-dom` em CreativeComposer. Renomear o JSX atual `const results` para `const resultsContent`, sem alterar suas callbacks, e definir:

```tsx
const results = resultsContainer && stageChrome && resultsContent
  ? createPortal(resultsContent, resultsContainer)
  : resultsContent;
```

Todas as ocorrências atuais de `results` continuam usando essa variável. Não mover o controlador para o portal. No effect de conflito de marca, substituir o foco de retorno por:

```ts
(primaryActionRef?.current ?? generateButtonRef.current)?.focus();
```

O callback ref `setResultsContainer` deve ficar no mesmo elemento durante toda a sessão. Não dar key de modo/ocupação ao destino. Os callers de revisão não passam `resultsContainer`, mantendo o render inline original.

- [ ] **Step 5: Testar e commitar a integração dos quatro modos comuns.**

Run: `npm test -- src/components/creative-work/CreativeComposer.test.tsx src/components/dashboard/DashboardHomeActions.test.tsx src/components/creative-work/CreativeWorkResumeSurface.test.tsx`

No teste de CreativeComposer existente, continuar verificando `readySource`, chamadas `addFiles(files, "content")` e `addFiles(files, "style")`, direções e formatos. Acrescentar teste de portal: `const target=document.createElement("div")`, anexar ao body, renderizar um modelo com outputs usando as fixtures existentes e verificar que resultados estão no target; remover target ao finalizar.

```bash
git add app/src/components/dashboard/DashboardHomeActions.tsx app/src/components/dashboard/DashboardHomeActions.test.tsx app/src/components/creative-work/CreativeComposer.tsx app/src/components/creative-work/CreativeComposer.test.tsx
git commit -m "refactor(studio): place canonical creation controls inside talk box"
```

## Task 3: Integrar carrossel sem pedido duplicado ou perda de fase

**Files:**
- Modify: `app/src/components/creative-work/CarouselComposer.tsx:54-412`
- Modify: `app/src/components/creative-work/CreativeComposer.tsx:362`
- Modify: `app/src/components/dashboard/DashboardHomeActions.tsx`
- Test: `app/src/components/creative-work/CarouselComposer.test.tsx`
- Test: `app/src/components/creative-work/CreativeComposer.test.tsx`

**Interfaces:**
- Consumes: `CarouselComposerController` existente (`askForPlan`, `answerQuestions`, `prepareCarousel`, `generateCarousel`, `phase`, `isBusy`, `canPrepare`, `canGenerate`) e destino DOM da Task 2.
- Produces: props opcionais de CarouselComposer `requestOwner?: "self" | "host"` (default `self`), `resultsContainer?: HTMLElement | null`, `active?: boolean` (default true). `active` controla apenas foco automático, nunca dados ou execução.

- [ ] **Step 1: Escrever testes usando as factories existentes `controller` e `renderCarousel`.**

```tsx
it("usa pedido externo e mantém a ação de organizar", () => {
  const state = controller();
  renderCarousel(state, { requestOwner: "host" });
  expect(document.querySelector("#creative-composer-request")).toBeNull();
  fireEvent.click(screen.getByTestId("carousel-organize"));
  expect(state.askForPlan).toHaveBeenCalledTimes(1);
  expect(state.generateCarousel).not.toHaveBeenCalled();
});

it("preserva respostas ao ocultar e reabrir o conteúdo", () => {
  const state = controller({ phase: "questions",
    draft: carouselDraft({ blockingQuestions }) });
  const content = <CarouselComposer carousel={state} request="Campanha"
    onRequestChange={vi.fn()} onAddStyleFiles={vi.fn()} requestOwner="host" />;
  const view = render(<div hidden={false}>{content}</div>);
  const input = screen.getByRole("textbox", { name: "Qual é a oferta?" });
  fireEvent.change(input, { target: { value: "Inscrição antecipada" } });
  view.rerender(<div hidden>{content}</div>);
  view.rerender(<div hidden={false}>{content}</div>);
  fireEvent.click(screen.getByTestId("carousel-answer-submit"));
  expect(state.answerQuestions).toHaveBeenCalledWith({ "q-1": "Inscrição antecipada" });
});
```

- [ ] **Step 2: Rodar vermelho.**

Run: `npm test -- src/components/creative-work/CarouselComposer.test.tsx`

Expected: primeiro teste FAIL porque o textarea ainda é renderizado; segundo estabelece a regressão que não pode ser introduzida.

- [ ] **Step 3: Adaptar propriedade do pedido e ações.**

Envolver somente label/textarea da entrada em `requestOwner === "self"`. Preservar botão de referência de estilo, `styleSource`, retries e `carousel.askForPlan()` na mesma instância.

Em CreativeComposer, passar `requestOwner={stageChrome ? "host" : "self"}` e `resultsContainer`. Propagar `active` a partir de nova prop opcional `controlsActive?: boolean` de CreativeComposer; Dashboard passa `controlsActive={boxExpanded}`.

Em DashboardHomeActions, derivar visibilidade do prompt e anexos:

```tsx
const carouselPhase = composer.carousel?.phase;
const carouselTalkBoxProps = {
  showRequest: !isCarouselWorkflow || carouselPhase === "entry",
  showAttachments: !isCarouselWorkflow && composer.intent !== "restyle",
  showGenerate: !isCarouselWorkflow && !showPlan && !resultStage,
};
```

Passar `{...carouselTalkBoxProps}` a TalkBox, substituindo suas props de visibilidade anteriores. Em restyle os dois slots especializados já fazem anexação com papéis explícitos. No carrossel o botão de estilo existente é o único upload. Não manter um upload genérico que envie a imagem com outro papel.

Na fase `sequence`, mostrar apenas `carousel-prepare`. Na fase `ready_to_generate`, mostrar apenas `carousel-generate`; preservar o guard de Enter e o `disabled` existente. Usar o JSX atual com estas condições, sem mudar handlers:

```tsx
{phase === "sequence" ? (
  <button type="button" data-testid="carousel-prepare" disabled={!carousel.canPrepare}
    onClick={() => void carousel.prepareCarousel()}
    className="inline-flex min-h-[var(--control-touch)] items-center rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-inset)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">
    {t("prepareAction")}
  </button>
) : null}
{phase === "ready_to_generate" ? (
  <button type="button" data-testid="carousel-generate" disabled={!carousel.canGenerate || isBusy}
    onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }}
    onClick={() => void carousel.generateCarousel()}
    className="inline-flex min-h-[var(--control-touch)] items-center rounded-[var(--radius-control)] bg-[var(--action-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--action-primary-text)] hover:bg-[var(--action-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">
    {t("generateAction")}
  </button>
) : null}
```

Substituir os dois botões atuais pelo bloco acima; não criar outra função de geração.

- [ ] **Step 4: Mover apenas apresentação de geração/revisão para o portal.**

Extrair os blocos JSX existentes de sequência/editor e progresso/revisão para variáveis locais `sequenceContent` e `reviewContent`. Cada variável contém integralmente os nós atuais (CarouselSequenceBoard, CarouselSlideEditor, CarouselVisualSummary e CarouselDeckReview) com as mesmas props e callbacks. O root `CarouselComposer` continua único e montado:

```tsx
const hasResults = phase === "generating" || phase === "review";
const resultContent = <>{sequenceContent}{reviewContent}</>;
const renderedResults = hasResults && resultsContainer
  ? createPortal(resultContent, resultsContainer)
  : hasResults ? resultContent : null;
// Depois dos blocos entry e questions:
{!hasResults ? sequenceContent : null}
{renderedResults}
```

Importar createPortal. No effect de foco, manter revisão focável no destino externo, mas não focar controles ocultos:

```ts
useEffect(() => {
  if (phase === "entry") { previousPhaseRef.current = phase; return; }
  if (previousPhaseRef.current === phase) return;
  const target = phase === "review" ? reviewHeadingRef.current
    : active && phase === "questions" ? firstQuestionRef.current
    : active && (phase === "sequence" || phase === "ready_to_generate")
      ? sequenceHeadingRef.current : null;
  if (!target || target.closest("[inert]")) return;
  target.focus();
  previousPhaseRef.current = phase;
}, [phase, active, resultsContainer]);
```

Na chegada a uma fase nova de preparação, abrir a caixa pelo host antes do foco; na chegada a `generating`/`review`, recolher pelo host sem chamar o handler que devolve foco ao toggle. Adicionar em Dashboard, depois da declaração de carouselPhase:

```ts
useEffect(() => {
  if (!isCarouselWorkflow) return;
  if (carouselPhase === "questions" || carouselPhase === "sequence" || carouselPhase === "ready_to_generate")
    setBoxExpanded(true);
  else if (carouselPhase === "generating" || carouselPhase === "review") setBoxExpanded(false);
}, [isCarouselWorkflow,carouselPhase]);
```

- [ ] **Step 5: Provar um prompt, uma ação e compatibilidade da revisão.**

No harness real da Task 2, usar `composer({ intent: "carousel" })`, `showAttachments={false}`, `showGenerate={false}`. Assert: um `#creative-composer-request`, um `carousel-organize`, nenhum Gerar genérico. Em CarouselComposer.test, usar `controller({phase:"sequence", draft:carouselDraft(), canPrepare:true})` para exigir ausência de `carousel-generate`; em ready_to_generate exigir ausência de `carousel-prepare`. Usar `publicSlide(1)` e destino DOM para testar review fora de `carousel-composer` com mesma callback approveDeck.

Run: `npm test -- src/components/creative-work/CarouselComposer.test.tsx src/components/creative-work/CreativeComposer.test.tsx src/components/creative-work/useCarouselComposer.test.tsx src/components/creative-work/CreativeWorkResumeSurface.test.tsx`

Expected: PASS; nenhum teste financeiro/de revisão removido para adequar a UI.

```bash
git add app/src/components/creative-work/CarouselComposer.tsx app/src/components/creative-work/CarouselComposer.test.tsx app/src/components/creative-work/CreativeComposer.tsx app/src/components/creative-work/CreativeComposer.test.tsx app/src/components/dashboard/DashboardHomeActions.tsx
git commit -m "fix(studio): preserve carousel lifecycle in unified composer"
```

## Task 4: Catálogo de produção com escopo real e paginação

**Files:**
- Create: `app/src/lib/creative-production.ts`
- Create: `app/src/server/repositories/creative-production.ts`
- Create/Test: `app/src/server/repositories/creative-production.test.ts`
- Create: `app/src/server/application/list-creative-production.ts`
- Create/Test: `app/src/server/application/list-creative-production.test.ts`
- Modify: `app/src/app/api/creative-work/route.ts:65-129`
- Test: `app/src/app/api/creative-work/route.test.ts`

**Interfaces:**
- Consumes: `requireWorkspaceAccess(request)`, `getClientProfile(workspaceId, id)`, `getCampaignById(id, workspaceId)`, `db`, `objectStorage.signedDownloadUrl(key)` e tabelas existentes.
- Produces: `GET /api/creative-work?view=production&clientProfileId=<uuid>&campaignId=<uuid opcional>&limit=24&cursor=<opaco opcional>` → `{ production: CreativeProductionItem[], nextCursor: string | null }`.
- Errors: 400 para UUID/limit/cursor inválido; 404 para marca/campanha fora do workspace ou campanha de outra marca; 200 vazio para escopo válido sem peças; demais falhas passam por handleApiError.
- **Execution gate:** implementar esta task somente após aprovação do contrato HTTP acima. Tasks 1–3 não dependem da nova rota. Não criar mocks permanentes na aplicação para contornar o gate.

- [ ] **Step 1: Fixar tipos públicos e teste vermelho da rota.**

Contrato completo em `app/src/lib/creative-production.ts`:

```ts
export type CreativeProductionKind = "output" | "slide" | "derivation";
export type CreativeProductionItem = {
  id: string;
  kind: CreativeProductionKind;
  workId: string | null;
  campaignId: string | null;
  title: string;
  format: string | null;
  previewUrl: string;
  reviewHref: string;
  createdAt: string;
  deckId: string | null;
  position: number | null;
};
export type CreativeProductionPage = {
  production: CreativeProductionItem[];
  nextCursor: string | null;
};
```

No teste da rota, adicionar `listProductionMock = vi.hoisted(() => vi.fn())`, mock de `@/server/application/list-creative-production`, `getClientProfile` e `getCampaignById`. Usar os mocks de workspace e `profileId` já existentes. Os mocks de acesso retornam `{id:profileId,workspaceId:"workspace-1"}` e campanha com esse clientProfileId; `listProductionMock` retorna `{production:[],nextCursor:null}`. Acrescentar:

```ts
it("separa produção da listagem canônica e não despacha geração", async () => {
  const response = await GET(new Request(
    `http://localhost/api/creative-work?view=production&clientProfileId=${profileId}`));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ production: [], nextCursor: null });
  expect(listProductionMock).toHaveBeenCalledWith(expect.objectContaining({
    workspaceId: "workspace-1", clientProfileId: profileId, campaignId: null, limit: 24,
  }));
  expect(listMock).not.toHaveBeenCalled();
  expect(inngestSendMock).not.toHaveBeenCalled();
});
```

Run: `npm test -- src/app/api/creative-work/route.test.ts`

Expected: FAIL porque view=production atualmente retorna `{works}`.

- [ ] **Step 2: Implementar parser e SQL da leitura.**

Criar `creative-production.ts` no repositório com os tipos e funções abaixo. O cursor próprio é necessário: `catalog-page.ts` aceita somente UUID, enquanto aqui a chave inclui a origem. Não alterar o cursor dos catálogos existentes.

```ts
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { creativeWorkItems as w, creativeWorkOutputs as o,
  creativeWorkCarouselSlides as s, derivations as d,
  campaigns as c } from "@/server/db/schema";
import type { CreativeProductionKind } from "@/lib/creative-production";

const cursorSchema = z.object({
  at: z.string().datetime({ precision: 6 }),
  id: z.string().regex(/^(output|slide|derivation):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
});
const querySchema = z.object({
  clientProfileId: z.string().uuid(), campaignId: z.string().uuid().nullable(),
  limit: z.number().int().min(1).max(48), cursor: cursorSchema.nullable(),
});
export type ProductionCursor = z.infer<typeof cursorSchema>;
export type ProductionQuery = z.infer<typeof querySchema> & { workspaceId: string };
export type ProductionRow = {
  id: string; kind: CreativeProductionKind; sourceId: string;
  workId: string | null; campaignId: string | null; title: string;
  format: string | null; outputKey: string; createdAt: Date;
  sortAt: string; position: number | null;
};
export function parseProductionSearchParams(params: URLSearchParams) {
  let cursor: unknown = null;
  try {
    const value = params.get("cursor");
    if (value) cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch { return null; }
  const parsed = querySchema.safeParse({
    clientProfileId: params.get("clientProfileId"), campaignId: params.get("campaignId"),
    limit: params.has("limit") ? Number(params.get("limit")) : 24, cursor,
  });
  return parsed.success ? parsed.data : null;
}
export function encodeProductionCursor(row: Pick<ProductionRow, "sortAt" | "id">) {
  return Buffer.from(JSON.stringify({ at: row.sortAt, id: row.id })).toString("base64url");
}
export function productionPageSql(input: ProductionQuery): SQL {
  const workScope = sql`${w.workspaceId} = ${input.workspaceId}
    and ${w.clientProfileId} = ${input.clientProfileId}
    ${input.campaignId ? sql`and ${w.campaignId} = ${input.campaignId}` : sql``}`;
  const campaignScope = sql`${c.workspaceId} = ${input.workspaceId}
    and ${c.clientProfileId} = ${input.clientProfileId}
    ${input.campaignId ? sql`and ${c.id} = ${input.campaignId}` : sql``}`;
  const after = input.cursor
    ? sql`where (created_at, id) < (${input.cursor.at}::timestamp, ${input.cursor.id})`
    : sql``;
  return sql`
    with produced as (
      select 'output:' || ${o.id}::text as id, 'output'::text as kind,
        ${o.id}::text as source_id, ${w.id}::text as work_id,
        ${w.campaignId}::text as campaign_id, ${w.title} as title,
        ${o.targetFormat} as format, ${o.outputKey} as output_key,
        ${o.createdAt} as created_at, null::integer as position
      from ${o} inner join ${w} on ${w.id} = ${o.workItemId}
      where ${workScope} and ${o.workspaceId} = ${input.workspaceId}
        and ${w.toolKind} <> 'carousel'
        and ${o.status} = 'completed' and ${o.outputKey} is not null
      union all
      select 'slide:' || ${s.id}::text, 'slide'::text, ${s.id}::text,
        ${w.id}::text, ${w.campaignId}::text, ${w.title}, ${w.format},
        ${s.outputKey}, ${s.createdAt}, ${s.position}
      from ${s} inner join ${w} on ${w.id} = ${s.workItemId}
      where ${workScope} and ${s.workspaceId} = ${input.workspaceId}
        and ${w.toolKind} = 'carousel' and ${s.isCurrent} = true
        and ${s.status} = 'completed' and ${s.outputKey} is not null
      union all
      select 'derivation:' || ${d.id}::text, 'derivation'::text, ${d.id}::text,
        null::text, ${c.id}::text, ${c.name}, ${d.format}, ${d.outputKey},
        ${d.createdAt}, null::integer
      from ${d} inner join ${c} on ${c.id} = ${d.campaignId}
      where ${campaignScope} and ${d.workspaceId} = ${input.workspaceId}
        and ${d.status} = 'completed' and ${d.isPreview} = false
        and ${d.outputKey} is not null
    )
    select id, kind, source_id as "sourceId", work_id as "workId",
      campaign_id as "campaignId", title, format, output_key as "outputKey",
      created_at as "createdAt", position,
      to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "sortAt"
    from produced ${after} order by created_at desc, id desc limit ${input.limit + 1}
  `;
}
export async function readCreativeProductionPage(input: ProductionQuery) {
  const result = await db.execute<ProductionRow>(productionPageSql(input));
  const production = result.rows.slice(0, input.limit);
  const last = production.at(-1);
  return { rows: production, nextCursor: result.rows.length > input.limit && last
    ? encodeProductionCursor(last) : null };
}
```

`sortAt` é uma representação opaca do timestamp sem timezone armazenado no banco, com seus seis dígitos de precisão. Não convertê-lo via `Date.toISOString()` antes de montar o cursor, pois perderia microssegundos e poderia pular itens. O cast de comparação é `timestamp`, o mesmo tipo da coluna. `createdAt` público continua sendo serializado pelo driver conforme o padrão atual.

Nenhuma chave de ordenação usa updatedAt: uma edição não deve deslocar o mesmo item entre páginas. Slides obsoletos saem pelo filtro isCurrent; a atualização do catálogo reinicia sua paginação na Task 5.

- [ ] **Step 3: Testar SQL e escopo no banco local isolado.**

Em `creative-production.test.ts`, importar PgDialect, Pool de `pg`, `readFileSync`, `randomUUID` e Vitest. Mockar `@/server/db` como `{db:{execute:vi.fn()}}` para os testes puros não abrirem conexão. O teste de integração usa sua própria conexão e rollback; só roda com TEST_DATABASE_URL local explicitamente definido.

```ts
it("recusa filtros e cursor inválidos", () => {
  expect(parseProductionSearchParams(new URLSearchParams("clientProfileId=abc"))).toBeNull();
  const id = "00000000-0000-4000-8000-000000000001";
  for (const suffix of ["limit=0", "limit=49", "cursor=invalido", "campaignId=abc"]) {
    expect(parseProductionSearchParams(new URLSearchParams(`clientProfileId=${id}&${suffix}`))).toBeNull();
  }
});

it.skipIf(!process.env.TEST_DATABASE_URL)("isola campanhas e pagina sem misturar origens", async () => {
  const url = new URL(process.env.TEST_DATABASE_URL!);
  expect(["localhost", "127.0.0.1"]).toContain(url.hostname);
  expect(url.port).toBe("5433");
  expect(url.pathname).toBe("/adscale_test");
  const fixture = JSON.parse(readFileSync("tests/fixtures/create-post-e2e.json", "utf8"));
  const pool = new Pool({ connectionString: url.toString(), max: 1 });
  const client = await pool.connect();
  const campaignA = randomUUID(), campaignB = randomUUID(), work = randomUUID();
  const deck = randomUUID(), output = randomUUID(), slide = randomUUID();
  const oldSlide = randomUUID(), derivation = randomUUID(), foreignDerivation = randomUUID();
  try {
    await client.query("begin");
    await client.query(`insert into adscale_app.campaigns (id,workspace_id,client_profile_id,name)
      values ($1,$3,$4,'Mesa A'),($2,$3,$4,'Mesa B')`,
      [campaignA,campaignB,fixture.workspaceId,fixture.primaryClientProfileId]);
    await client.query(`insert into adscale_app.creative_work_items
      (id,workspace_id,client_profile_id,created_by_user_id,title,request,campaign_id,tool_kind,settings)
      values ($1,$3,$4,$5,'Peça','Pedido',$6,'single','{}'),
             ($2,$3,$4,$5,'Deck','Pedido',$6,'carousel','{}')`,
      [work,deck,fixture.workspaceId,fixture.primaryClientProfileId,fixture.userId,campaignA]);
    await client.query(`insert into adscale_app.creative_work_outputs
      (id,workspace_id,work_item_id,creative_level,target_format,operation_key,status,output_key)
      values ($1,$2,$3,'balanced','4:5',$1::text,'completed','test/output.png')`,
      [output,fixture.workspaceId,work]);
    for (const [id,current] of [[slide,true],[oldSlide,false]] as const) {
      await client.query(`insert into adscale_app.creative_work_carousel_slides
        (id,workspace_id,work_item_id,lineage_id,version_number,deck_revision,position,role,
         primary_text,copy_authority,layout_family,status,output_key,visual_contract_hash,
         generation_operation_key,is_current)
        values ($1,$2,$3,$1,1,'deck-r1',1,'hook','Capa','user_input','impact','completed',
          'test/slide.png','hash',$1::text,$4)`, [id,fixture.workspaceId,deck,current]);
    }
    await client.query(`insert into adscale_app.derivations
      (id,workspace_id,campaign_id,status,output_key,is_preview)
      values ($1,$3,$4,'completed','test/derivation.png',false),
             ($2,$3,$5,'completed','test/foreign.png',false)`,
      [derivation,foreignDerivation,fixture.workspaceId,campaignA,campaignB]);
    const input: ProductionQuery = {workspaceId:fixture.workspaceId,
      clientProfileId:fixture.primaryClientProfileId,campaignId:campaignA,limit:2,cursor:null};
    const run = async (query: ProductionQuery) => {
      const compiled = new PgDialect().sqlToQuery(productionPageSql(query));
      return (await client.query(compiled.sql, compiled.params)).rows as ProductionRow[];
    };
    const first = await run(input);
    expect(first).toHaveLength(3); // limit + 1
    const cursor = {at:first[1].sortAt,id:first[1].id};
    const second = await run({...input,cursor});
    expect(second).toHaveLength(1);
    expect(new Set([...first.slice(0,2),...second].map(row=>row.id))).toEqual(new Set([
      `output:${output}`,`slide:${slide}`,`derivation:${derivation}`]));
    expect(await run({...input,workspaceId:fixture.insufficientBalance.workspaceId})).toEqual([]);
    expect(await run({...input,clientProfileId:fixture.insufficientBalance.clientProfileId})).toEqual([]);
  } finally { await client.query("rollback"); client.release(); await pool.end(); }
});
```

Acrescentar à mesma transação, antes da primeira consulta, as linhas abaixo; o assert de conjunto continua exatamente com os três IDs esperados. Isso verifica exclusão real no SQL, não apenas texto de query.

```ts
await client.query(`insert into adscale_app.derivations
  (id,workspace_id,campaign_id,status,output_key,is_preview)
  values ($1,$2,$3,'completed','test/preview.png',true)`,
  [randomUUID(),fixture.workspaceId,campaignA]);
const failedOutput = randomUUID();
await client.query(`insert into adscale_app.creative_work_outputs
  (id,workspace_id,work_item_id,creative_level,target_format,operation_key,status,output_key,version_number)
  values ($1,$2,$3,'balanced','4:5',$1::text,'failed','test/failed.png',2)`,
  [failedOutput,fixture.workspaceId,work]);
```

Run sem banco: `npm test -- src/server/repositories/creative-production.test.ts`. Expected: testes puros PASS; integração SKIP declarado.

Run obrigatório com fixture local sem chamadas pagas: `TEST_DATABASE_URL=postgres://test:test@localhost:5433/adscale_test npm test -- src/server/repositories/creative-production.test.ts`. Expected: todos PASS, sem SKIP. Não apontar para banco remoto para contornar falta de ambiente.

- [ ] **Step 4: Projetar somente os campos públicos.**

Código de `list-creative-production.ts`:

```ts
import type { CreativeProductionItem, CreativeProductionPage } from "@/lib/creative-production";
import { readCreativeProductionPage, type ProductionQuery, type ProductionRow } from "@/server/repositories/creative-production";
import { objectStorage } from "@/server/storage";

export async function productionItem(row: ProductionRow): Promise<CreativeProductionItem> {
  const reviewHref = row.workId
    ? row.campaignId ? `/campaigns/${row.campaignId}?creativeWork=${row.workId}` : `/creative-work/${row.workId}`
    : `/campaigns/${row.campaignId}`;
  const previewUrl = row.kind === "output"
    ? `/api/creative-work/${row.workId}/outputs/${row.sourceId}/download`
    : row.kind === "slide"
      ? `/api/creative-work/${row.workId}/carousel/slides/${row.sourceId}/download`
      : await objectStorage.signedDownloadUrl(row.outputKey);
  return {id:row.id,kind:row.kind,workId:row.workId,campaignId:row.campaignId,
    title:row.title,format:row.format,previewUrl,reviewHref,
    createdAt:row.createdAt.toISOString(),deckId:row.kind === "slide" ? row.workId : null,
    position:row.position};
}
export async function listCreativeProduction(input: ProductionQuery): Promise<CreativeProductionPage> {
  const page = await readCreativeProductionPage(input);
  return {production:await Promise.all(page.rows.map(productionItem)),nextCursor:page.nextCursor};
}
```

Testar com mocks de repository/storage e linha concreta:

```ts
const row: ProductionRow = {id:"slide:s1",kind:"slide",sourceId:"s1",workId:"w1",
  campaignId:"c1",title:"Deck",format:"4:5",outputKey:"private/output.png",
  createdAt:new Date("2026-09-08T12:00:00Z"),sortAt:"2026-09-08T12:00:00.000000Z",position:2};
it("projeta slide atual sem chave privada", async () => {
  const item = await productionItem(row);
  expect(item.previewUrl).toBe("/api/creative-work/w1/carousel/slides/s1/download");
  expect(item.reviewHref).toBe("/campaigns/c1?creativeWork=w1");
  expect(item).toMatchObject({deckId:"w1",position:2});
  expect(item).not.toHaveProperty("outputKey");
  expect(item).not.toHaveProperty("sortAt");
});
```

Acrescentar teste de output sem campanha (reviewHref `/creative-work/w1`) e derivation (signedDownloadUrl chamado uma vez depois da consulta autorizada). Não retornar os campos privados via spread de row.

- [ ] **Step 5: Conectar a view sem mudar o retorno padrão.**

No GET, imediatamente depois de `searchParams`, inserir a branch abaixo e importar as quatro funções utilizadas. Se o import de getClientProfile já existir, reaproveitá-lo.

```ts
if (searchParams.get("view") === "production") {
  const query = parseProductionSearchParams(searchParams);
  if (!query) return apiError("invalidInput", 400);
  const profile = await getClientProfile(workspace.id, query.clientProfileId);
  if (!profile) return apiError("clientProfileNotFound", 404);
  if (query.campaignId) {
    const campaign = await getCampaignById(query.campaignId, workspace.id);
    if (!campaign || campaign.clientProfileId !== query.clientProfileId)
      return apiError("campaignNotFound", 404);
  }
  return NextResponse.json(await listCreativeProduction({...query,workspaceId:workspace.id}));
}
```

No teste da rota, acrescentar tabela de URL inválida, profile ausente, campaign ausente e campaign com outra marca. Em cada caso exigir que `listProductionMock` não seja chamado. Manter os testes de inspirations, recipes e listagem padrão. A marca/campanha estrangeira não deve virar fallback para dados do workspace inteiro.

- [ ] **Step 6: Rodar verde e commitar o catálogo.**

Run: `npm test -- src/server/repositories/creative-production.test.ts src/server/application/list-creative-production.test.ts src/app/api/creative-work/route.test.ts` e `npm run typecheck`.

Executar também o teste de PostgreSQL com TEST_DATABASE_URL da Step 3. Expected: PASS. Se o ambiente local estiver ausente, registrar a integração como pendente; não tratá-la como validada por mocks.

```bash
git add app/src/lib/creative-production.ts app/src/server/repositories/creative-production.ts app/src/server/repositories/creative-production.test.ts app/src/server/application/list-creative-production.ts app/src/server/application/list-creative-production.test.ts app/src/app/api/creative-work/route.ts app/src/app/api/creative-work/route.test.ts
git commit -m "feat(studio): expose scoped production catalog"
```

## Task 5: Switcher e navegação da mesa com dados reais

**Files:**
- Create: `app/src/lib/hooks/use-creative-production.ts`
- Create/Test: `app/src/lib/hooks/use-creative-production.test.tsx`
- Modify: `app/src/components/dashboard/DashboardHomeActions.tsx:303-476`
- Modify: `app/src/components/dashboard/studio-stage/BrandStageHome.tsx:8-111`
- Test: `app/src/components/dashboard/DashboardHomeActions.test.tsx`
- Test: `app/src/components/dashboard/studio-stage/BrandStageHome.test.tsx`

**Interfaces:**
- Consumes: endpoint e `CreativeProductionPage` da Task 4; labels `studioDesk` da Task 1; `composer.campaignId`, `composer.clientProfileId`, `composer.campaigns`, `workspaceId` e resultados atuais.
- Produces: `useCreativeProduction(input)` abaixo, estado local `deskView: "inspirations" | "production"`; `StageMosaicItem` ganha `format?: string | null`, `detail?: string`; BrandStageHome ganha `repeatItems?: boolean` (default true para manter a inspiração atual).

- [ ] **Step 1: Escrever teste do hook trocando escopo.**

Em `use-creative-production.test.tsx`, importar `QueryClient`, `QueryClientProvider`, `renderHook`, `waitFor`, Vitest e mockar `apiFetch`. Usar o corpo completo abaixo; a resposta vazia serve para verificar URL/cache sem qualquer geração:

```tsx
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-client", () => ({ apiFetch: fetchMock }));
it("consulta uma nova campanha sem reaproveitar a chave anterior", async () => {
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({production:[],nextCursor:null})));
  const queryClient = new QueryClient({defaultOptions:{queries:{retry:false}}});
  const wrapper = ({children}: {children: React.ReactNode}) =>
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const view = renderHook(({campaignId}) => useCreativeProduction({
    workspaceId:"ws",clientProfileId:"brand",campaignId,enabled:true,isProducing:false,
  }), {wrapper,initialProps:{campaignId:"campaign-a"}});
  await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
  view.rerender({campaignId:"campaign-b"});
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) =>
    String(url).includes("campaignId=campaign-b"))).toBe(true));
  expect(creativeProductionKey("ws","brand","campaign-a"))
    .not.toEqual(creativeProductionKey("ws","brand","campaign-b"));
  expect(fetchMock.mock.calls.every(([,init]) => init.signal instanceof AbortSignal)).toBe(true);
  view.unmount(); queryClient.clear();
});
```

Run: `npm test -- src/lib/hooks/use-creative-production.test.tsx`. Expected: FAIL por hook inexistente. Acrescentar o teste de resposta atrasada na Step 4 para comprovar comportamento, além da diferença de chaves.

- [ ] **Step 2: Implementar o hook com cancelamento e atualização.**

```ts
"use client";
import { useEffect } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { CreativeProductionPage } from "@/lib/creative-production";

export const creativeProductionKey = (workspaceId: string | null,
  clientProfileId: string | null, campaignId: string | null) =>
  ["creative-work","production",workspaceId,clientProfileId,campaignId] as const;

export function useCreativeProduction(input: {
  workspaceId: string | null; clientProfileId: string | null;
  campaignId: string | null; enabled: boolean; isProducing: boolean;
}) {
  const {workspaceId,clientProfileId,campaignId,isProducing} = input;
  const enabled = input.enabled && Boolean(workspaceId && clientProfileId);
  const query = useInfiniteQuery({
    queryKey:creativeProductionKey(workspaceId,clientProfileId,campaignId),
    enabled, staleTime:30_000, initialPageParam:null as string | null,
    queryFn:async ({pageParam,signal}): Promise<CreativeProductionPage> => {
      const params = new URLSearchParams({view:"production",clientProfileId:clientProfileId!,limit:"24"});
      if (campaignId) params.set("campaignId",campaignId);
      if (pageParam) params.set("cursor",pageParam);
      const response = await apiFetch(`/api/creative-work?${params}`,{signal});
      if (!response.ok) throw new Error("Falha ao carregar produção");
      return response.json();
    },
    getNextPageParam:page=>page.nextCursor ?? undefined,
    refetchInterval:enabled && isProducing ? 5_000 : false,
    refetchIntervalInBackground:false,
  });
  const {refetch} = query;
  useEffect(() => {
    if (enabled) void refetch();
  }, [enabled,workspaceId,clientProfileId,campaignId,isProducing,refetch]);
  return {...query,items:query.data?.pages.flatMap(page=>page.production) ?? []};
}
```

Não usar `placeholderData: keepPreviousData`: o usuário não pode ver peças da campanha anterior sob o novo rótulo. O efeito garante leitura no ingresso da aba e na transição de geração para concluído; TanStack Query coordena cancelamento. Reutilizar o prefixo `creative-work`, já invalidado por várias mutações, sem modificar todos os handlers existentes.

- [ ] **Step 3: Conectar escopo, switcher e estados explícitos.**

Adicionar `useCreativeProduction`, `useRouter` e `useMemo` aos imports do host, usando os imports React existentes. Não criar estado global. `workspaceId` já vem do server component da home; normalizar `undefined` para null.

```tsx
const router = useRouter();
const [deskView,setDeskView] = useState<"inspirations" | "production">("inspirations");
const [deskPage,setDeskPage] = useState(0);
const productionCampaignId = composer.campaignId ?? null;
const isProducing = composer.stage === "generation"
  || composer.carousel?.phase === "generating"
  || works.some(work=>work.state === "generating");
const production = useCreativeProduction({workspaceId:workspaceId ?? null,
  clientProfileId:composer.clientProfileId, campaignId:productionCampaignId,
  enabled:deskView === "production",isProducing});
useEffect(() => { setDeskPage(0); },
  [workspaceId,composer.clientProfileId,productionCampaignId,deskView]);
```

Derivar o agrupamento, sem outra estrutura persistida:

```tsx
const productionItems = useMemo(() => {
  const groups = new Map<string, typeof production.items>();
  for (const item of production.items) {
    const group = item.deckId ? `deck:${item.deckId}` : item.id;
    const values = groups.get(group) ?? [];
    if (!values.some(value=>value.id === item.id)) values.push(item);
    groups.set(group,values);
  }
  return [...groups.values()].flatMap(values=>values.sort((a,b)=>(a.position ?? 0)-(b.position ?? 0)));
},[production.items]);
const allMosaicItems = deskView === "inspirations"
  ? inspirations.filter(item=>item.previewUrl).map(item=>({id:item.id,title:item.title,src:item.previewUrl!}))
  : productionItems.map(item=>({id:item.id,title:item.title,src:item.previewUrl,
      format:item.format,detail:item.position ? t("studioDesk.slide",{position:item.position}) : undefined}));
const mosaicItems = allMosaicItems.slice(deskPage * 6,deskPage * 6 + 6);
useEffect(() => {
  setDeskPage(page=>Math.min(page,Math.max(0,Math.ceil(allMosaicItems.length / 6)-1)));
},[allMosaicItems.length]);
```

O agrupamento é dos slides carregados, sem apresentar contagem parcial como total do deck. O servidor preserva ordenação para paginação; não reenviar cursor após ordenar no cliente. Derivar nextCursor sempre da resposta. Se o primeiro ID da produção mudar após uma atualização, voltar à primeira página com `useEffect(() => { setDeskPage(0); }, [production.items[0]?.id])`; isso evita continuar numa fatia deslocada por novas peças.

Construir `deskControls` com botões de seleção `aria-pressed` dentro de `role="group"` rotulado por `studioDesk.views`. Não usar tabs ARIA sem implementar suas teclas. Em cada seleção, apenas setDeskView; não chamar selectIntent, linkCampaign, addInspiration ou qualquer mutação.

```tsx
<div role="group" aria-label={t("studioDesk.views")}>
  {(["inspirations","production"] as const).map(view=><button key={view}
    type="button" aria-pressed={deskView === view} onClick={()=>setDeskView(view)}>
    {t(`studioDesk.${view}`)}
  </button>)}
</div>
```

Logo abaixo, mostrar campanha pelo nome em `composer.campaigns.find(c=>c.id===productionCampaignId)?.name`, com fallback traduzido `unnamedCampaign`; sem campanha, mostrar nome da marca. Nunca usar a URL para deduzir a campanha.

Estados de produção: `isPending` → status loading; erro sem dados → mensagem + refetch; vazio com sucesso → mensagem + botão que abre a caixa e foca composerRef; erro ao buscar página seguinte → preservar peças existentes e oferecer tentar novamente. Sem marca, manter o seletor de marca existente como entrada, sem consultar escopo amplo.

Na seleção de cartaz, manter inspiração com o handler atual; produção usa seu reviewHref:

```tsx
onSelectMosaic={(item) => {
  if (deskView === "production") {
    const piece = productionItems.find(value=>value.id === item.id);
    if (piece) router.push(piece.reviewHref);
    return;
  }
  const inspiration = inspirations.find(value=>value.id === item.id);
  if (inspiration) { setBoxExpanded(true); void composer.addInspiration(inspiration); }
}}
```

Navegar entre conjuntos de seis com Previous/Next. Se os próximos seis não estiverem carregados, chamar fetchNextPage da fonte ativa e só avançar se vier pelo menos um item novo; capturar a rejeição e manter a página atual. Desabilitar Next durante isFetchingNextPage. O estado de erro descrito acima exibe a falha.

```tsx
const nextDeskPage = async () => {
  const nextStart = (deskPage + 1) * 6;
  if (nextStart < allMosaicItems.length) { setDeskPage(page=>page+1); return; }
  if (deskView === "production") {
    if (!production.hasNextPage || production.isFetchingNextPage) return;
    const result = await production.fetchNextPage();
    const total = result.data?.pages.reduce((n,page)=>n+page.production.length,0) ?? 0;
    if (!result.isError && total > nextStart) setDeskPage(page=>page+1);
  } else {
    if (!inspirationsQuery.hasNextPage || inspirationsQuery.isFetchingNextPage) return;
    const result = await inspirationsQuery.fetchNextPage();
    const total = result.data?.pages.reduce((n,page)=>n+page.inspirations.filter(item=>item.previewUrl).length,0) ?? 0;
    if (!result.isError && total > nextStart) setDeskPage(page=>page+1);
  }
};
```

Para esse trecho, conservar o objeto retornado por `useCreativeInspirations` em `inspirationsQuery` e derivar `inspirations = inspirationsQuery.data ?? []`. O método fetchNextPage do Query Observer retorna a estrutura paginada original mesmo quando o hook expõe uma lista derivada. Usar o comportamento padrão de erro no resultado; se a implementação optar por throwOnError, capturar e manter deskPage.

- [ ] **Step 4: Eliminar cartazes duplicados e provar troca segura.**

Em WorkMosaic, adicionar `repeatItems:boolean` à função e propagá-lo do BrandStageHome. Substituir só a escolha do item:

```ts
const image = repeatItems ? items[tile.srcIndex % Math.max(items.length,1)] : items[tile.srcIndex];
```

Em produção, `repeatItems={false}`; com uma peça há um único botão. Na imagem, usar `object-contain` e aspectRatio derivado de `format` somente se for `1:1`, `4:5` ou `9:16`; a inspiração mantém o crop atual. Renderizar `detail` em pequena legenda para identificar a posição do slide. O estado sem trabalho não deve forçar EdgeField ao selecionar produção: usar WorkMosaic para a aba de produção mesmo com occupancy empty, sem mudar a identidade do dock.

Adicionar em BrandStageHome.test:

```tsx
it("não inventa seis cópias de uma peça produzida", () => {
  render(<BrandStageHome occupancy="work" brandName="Marca" headline="Criar"
    subtitle="Pedido" eyebrow="Estúdio" topBar={null} talkBox={null}
    onDropFiles={vi.fn()} dropLabel="Soltar" repeatItems={false}
    mosaicItems={[{id:"output:1",title:"Peça única",src:"/piece.png"}]} />);
  expect(screen.getAllByRole("button",{name:"Peça única"})).toHaveLength(1);
});
```

No teste do hook, importar também `act` de Testing Library e usar duas promises controladas: a resposta A resolve depois da B, e a A ignora AbortSignal propositalmente para provar isolamento da chave. Colocar o código abaixo em um segundo `it` assíncrono; o wrapper e o QueryClient são locais a esse caso:

```tsx
const queryClient = new QueryClient({defaultOptions:{queries:{retry:false}}});
const wrapper = ({children}: {children: React.ReactNode}) =>
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
let finishA!: (response: Response)=>void;
fetchMock.mockImplementation((url:string)=>url.includes("campaignId=A")
  ? new Promise<Response>(resolve=>{finishA=resolve;})
  : Promise.resolve(new Response(JSON.stringify({production:[{id:"B"}],nextCursor:null}))));
const view = renderHook(({campaignId})=>useCreativeProduction({workspaceId:"ws",
  clientProfileId:"brand",campaignId,enabled:true,isProducing:false}),
  {wrapper,initialProps:{campaignId:"A"}});
await waitFor(()=>expect(finishA).toBeTypeOf("function"));
view.rerender({campaignId:"B"});
await waitFor(()=>expect(view.result.current.items.map(item=>item.id)).toEqual(["B"]));
await act(async () => {
  finishA(new Response(JSON.stringify({production:[{id:"A"}],nextCursor:null})));
});
await waitFor(()=>expect(view.result.current.items.map(item=>item.id)).toEqual(["B"]));
view.unmount(); queryClient.clear();
```

Adicionar mock do hook de produção ao teste de Dashboard. Com callbacks canônicos spies, clicar em Produção e exigir zero chamadas a generateLegacy, preparePlan, selectIntent e linkCampaign; exigir escopo igual a composer.campaignId. Clicar em item produzido deve chamar router.push(reviewHref), nunca addInspiration. Usar render com `workspaceId="ws"` nesses novos casos.

- [ ] **Step 5: Rodar verde e commitar a mesa.**

Run: `npm test -- src/lib/hooks/use-creative-production.test.tsx src/components/dashboard/DashboardHomeActions.test.tsx src/components/dashboard/studio-stage/BrandStageHome.test.tsx` e `npm run typecheck`.

Expected: PASS com erro/vazio/paginação e troca de escopo cobertos; nenhuma nova dependência.

```bash
git add app/src/lib/hooks/use-creative-production.ts app/src/lib/hooks/use-creative-production.test.tsx app/src/components/dashboard/DashboardHomeActions.tsx app/src/components/dashboard/DashboardHomeActions.test.tsx app/src/components/dashboard/studio-stage/BrandStageHome.tsx app/src/components/dashboard/studio-stage/BrandStageHome.test.tsx
git commit -m "feat(studio): switch between inspirations and scoped production"
```

## Task 6: Verificação do fluxo completo e acabamento visual

**Files:**
- Modify/Test: `app/tests/e2e/frictionless-home.spec.ts`
- Modify/Test: `app/tests/e2e/creative-work-carousel.spec.ts`
- Modify if required by findings: `app/src/components/dashboard/studio-stage/StudioStage.module.css`, `TalkBox.tsx`, `BrandStageHome.tsx`
- Create: `docs/evidence/2026-09-08-studio-caixa-unificada.md`

**Interfaces:**
- Consumes: hooks/componentes das Tasks 1–5, fixtures e funções `login`, `fixture`, `tabTo` já presentes no E2E.
- Produces: evidência de aceite visual e operacional, sem publicar nem acionar providers reais.

- [ ] **Step 1: Adicionar cenário E2E que falha se a caixa perder o pedido.**

Dentro do describe já autenticado de frictionless-home, adicionar o caso abaixo. `beforeEach` existente faz login. Não reaproveitar seletores antigos que apontam para painéis removidos.

```ts
test("mesa alterna e caixa recolhe sem gerar ou perder o pedido", async ({page})=>{
  const generation: string[] = [];
  page.on("request",request=>{
    if (request.method()==="POST" && /\/(generate|prepare|plan)$/.test(new URL(request.url()).pathname))
      generation.push(request.url());
  });
  await page.goto("/");
  await assertSingleActiveBrand(page);
  const request = page.locator("#creative-composer-request");
  await expect(request).toHaveCount(1);
  await request.fill("Campanha de setembro, manter identidade da marca");
  const box = page.getByTestId("studio-talk-box");
  await expect(box).toHaveAttribute("data-expanded","true");
  await box.getByRole("button",{name:"Recolher controles"}).click();
  await expect(box).toHaveAttribute("data-expanded","false");
  await page.getByRole("button",{name:"Produção",exact:true}).click();
  await page.getByRole("button",{name:"Inspirações",exact:true}).click();
  await box.getByRole("button",{name:"Abrir controles"}).click();
  await expect(request).toHaveValue("Campanha de setembro, manter identidade da marca");
  await expect(page.getByTestId("studio-desk")).toHaveAttribute("inert","");
  await request.press("Escape");
  await expect(box).toHaveAttribute("data-expanded","false");
  expect(generation).toEqual([]);
});
```

No cenário de carrossel já existente, depois de preencher a resposta à pergunta controlada, recolher/reabrir a caixa e exigir que o mesmo input conserve valor. Antes de organizar, exigir count 1 de `#creative-composer-request`. Na revisão, exigir `carousel-composer` ainda montado e `carousel-progress` dentro de `studio-results-surface`. Preservar todas as asserções atuais de confirmação, cópia, retry, aprovação e exportação.

- [ ] **Step 2: Preparar somente o ambiente de teste existente.**

Confirmar banco local em localhost:5433/adscale_test e fixture existente. Não reinstalar dependências ou criar infraestrutura. Caso precise semear, usar o script existente somente nesse banco. Em terminais separados, a partir de `app/`:

```bash
DATABASE_URL=postgres://test:test@localhost:5433/adscale_test E2E_DISABLE_RATE_LIMIT=true E2E_CONTROLLED_PROVIDER=true CREATIVE_WORK_QUALITY_RECOVERY_ENABLED=true STUDIO_PROGRESSIVE_ROLLOUT_PERCENT=100 STUDIO_CAROUSEL_ROLLOUT_PERCENT=100 npm run dev:next
```

```bash
DATABASE_URL=postgres://test:test@localhost:5433/adscale_test E2E_CONTROLLED_PROVIDER=true npm run inngest:dev
```

```bash
DATABASE_URL=postgres://test:test@localhost:5433/adscale_test E2E_CONTROLLED_PROVIDER=true npm run seed:create-post-e2e
E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/frictionless-home.spec.ts tests/e2e/creative-work-carousel.spec.ts
```

Expected: PASS, incluindo as asserções de provider controlado já existentes. Se o teste depender de selector da UI antiga, atualizar para a função equivalente e manter sua asserção de negócio; não apagar o caso inteiro. Se o banco local estiver indisponível, concluir unitários/typecheck e registrar exatamente o E2E não executado.

- [ ] **Step 3: Inspecionar visualmente os estados aprovados.**

Abrir o ambiente local com Computer Use. Comparar com as capturas do protótipo em desktop 1440×900 e 1280×800, e viewport 390×844. Cobrir: mesa, caixa expandida nos cinco modos, direções manuais, upload/erro, carrossel com perguntas e sequência longa, produção vazia/preenchida e revisão.

Critérios observáveis:
- nenhuma configuração flutua fora da caixa;
- base da caixa de trabalho varia no máximo 2 px entre recolhida/expandida na mesma viewport, sem scroll do usuário;
- um único campo de pedido acessível na entrada e nenhum duplicado no carrossel;
- último controle e ação principal alcançáveis com teclado e rolagem;
- abrir ajuda/select não recolhe a caixa acidentalmente; Escape fecha ajuda antes da caixa;
- não há foco em mesa inert ou controles recolhidos;
- teclado móvel não cobre a ação principal; sem scroll horizontal;
- movimento reduzido remove a transição; borda mantém sua implementação motion-safe atual;
- estilos/layout de cartazes mantêm a intenção da proposta aprovada.

Capturas em `docs/screenshots/studio-caixa-unificada/` com nomes `mesa-desktop.png`, `caixa-variacoes.png`, `caixa-restyle.png`, `caixa-carrossel.png`, `producao.png`, `caixa-mobile.png`. Usar dados de teste. Se houver correção, rerodar só a verificação afetada.

- [ ] **Step 4: Executar checks finais e documentar o resultado real.**

Executar os arquivos Vitest listados nas Tasks 1–5 em uma chamada, mais `useCreativeComposer.test.tsx`, `useCarouselComposer.test.tsx` e `CreativeWorkResumeSurface.test.tsx`; depois `npm run typecheck`. ESLint apenas nos TS/TSX alterados, com caminhos explícitos. Na raiz: `git diff --check` e `graphify update .` (AST-only).

O documento de evidência deve registrar: commit verificado, comandos/resultados, ambiente local e isolamento do provider, capturas, diferenças aprovadas do protótipo, falhas remanescentes e verificações não executadas. Não usar resultados antigos como prova desta implementação. Não adicionar arquivos graphify ou WIP alheio ao commit por acidente.

- [ ] **Step 5: Commit de validação e entrega para aprovação visual.**

```bash
git add app/tests/e2e/frictionless-home.spec.ts app/tests/e2e/creative-work-carousel.spec.ts docs/evidence/2026-09-08-studio-caixa-unificada.md
git commit -m "test(studio): verify unified composer and production desk"
```

Acrescentar ao staging somente capturas e correções efetivamente produzidas nesta task, por caminho explícito. Revisar diff de cada arquivo antes do commit. Entregar o resultado local para aprovação visual; merge/deploy/chamadas pagas continuam dependendo de autorização própria.

## Dependências e revisão do plano

Ordem: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6. Task 4 é um entregável de leitura testável por si só, mas pertence ao mesmo objetivo do switcher; não justifica outro projeto. Pode aguardar a decisão de contrato enquanto a caixa é implementada. Não criar branches ou executar código nesta etapa de planejamento.

| Requisito da spec | Entrega/teste |
| --- | --- |
| Mesa cheia de cartazes preservada | Tasks 1 e 5; comparação visual Task 6 |
| Controles na caixa, expansão e desfoque | Tasks 1–2; teste de DOM/ocupação e E2E |
| Um pedido/ação, cinco modos | Tasks 2–3; harness real e E2E de carrossel |
| Rascunho, anexos, confirmação e estado preservados | Tasks 1–3; testes existentes de controlador mantidos |
| Inspirações e produção com escopo real | Tasks 4–5; teste SQL isolado, rota e troca de cache |
| Campanha opcional e histórico real | Task 4; filtro null e branch derivation |
| Carrosséis atuais, ordem e revisão | Tasks 3–5; isCurrent, posição e portal |
| Erro/vazio/paginação | Tasks 4–5; parser, query e navegação |
| Teclado, foco, contraste, mobile e movimento reduzido | Tasks 1 e 6 |
| Sem geração incidental, mudança de schema ou dependência | Tasks 2–6; spies, E2E controlado e revisão de diff |

Status deste documento: plano de execução; nenhum código de aplicação alterado, nenhum teste da aplicação executado e nenhuma publicação realizada na elaboração. Os snippets são instruções a implementar e verificar, não alegação de código já validado.

Revisão do plano realizada: cobertura da spec mapeada na tabela acima, interfaces entre tarefas conferidas, 6 tarefas e 32 passos marcáveis, delimitadores Markdown balanceados e nenhum marcador de implementação pendente. Os quatro blocos autônomos de tipos/repositório/projeção/hook passaram por verificação sintática com o TypeScript instalado; isso não substitui typecheck, testes ou execução dos snippets durante a implementação.
