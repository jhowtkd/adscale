# Carousel Editorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar tema e materiais em três ganchos, roteiro revisável e carrossel cuja capa precisa ser aprovada antes dos interiores.

**Architecture:** Evoluir o Trabalho de carrossel existente com um envelope editorial versionado e decisões persistidas por revisão. Separar pesquisa e propostas demoradas das transações; manter confirmação, jobs, versões e liquidação existentes, impondo as aprovações no servidor.

**Tech Stack:** TypeScript, Next.js, React, Zod, OpenAI SDK instalado, Drizzle/PostgreSQL, Inngest, Vitest e Playwright existentes.

**Spec:** `docs/superpowers/specs/2026-09-10-carousel-editorial-design.md` — aprovada pelo usuário nesta conversa em 2026-09-10.

## Global Constraints

- Fluxo aprovado: tema e materiais → pesquisa → três ganchos → escolha → roteiro com intenção visual → aprovação → capa piloto → aprovação visual → demais slides → revisão final.
- Manter um único Trabalho com `toolKind: carousel`, rascunho persistido e controlador existente.
- Manter inicialmente os limites existentes de 5–8 slides e formatos suportados.
- Pesquisa e planejamento não cobram unidades de geração de imagem.
- Publicação não faz parte deste fluxo.
- Sem novo serviço, dependência, tarifa, migração ou chamada paga sem autorização correspondente. Este plano propõe contratos; a aprovação da especificação não aprova implicitamente cada alteração de API/storage.
- Um executor de escrita; preservar WIP. Criar branch/worktree isolado no início da execução. Não implementar este documento na branch atual só porque o plano está nela.
- Uma etapa não está concluída porque um mock passou. Distinguir fluxo local, verdade factual, qualidade criativa, geração real e produção.

## Descobertas e decisão de pesquisa

A inspeção encontrou o simulador que produz “Slide N do pedido” e fatia o texto, mas não confirmou a configuração do ambiente do print. Não desativar testes ou mudar configuração remota por suposição.

Não foi encontrado adaptador de pesquisa web no servidor nas buscas por web_search, searchWeb, tavily e perplexity. O SDK OpenAI instalado já tipa `web_search`, `max_tool_calls`, fontes e ações `open_page`. Isso comprova disponibilidade da interface local, não compatibilidade do modelo configurado, habilitação da conta ou preço.

**Proposta sujeita à aprovação antes de implementar a tarefa 3:** usar Responses com web search do provedor já integrado, sem pacote adicional. Fazer uma chamada de pesquisa, no máximo seis ações de ferramenta, sem retries automáticos; depois usar a chamada editorial existente. Não escolher outro modelo silenciosamente. Se o modelo configurado não suportar a ferramenta, retornar pesquisa indisponível e solicitar material/restrição da tese. A capacidade precisa ser verificada em documentação oficial e uma chamada real apenas quando autorizada. Essa limitação não constitui conclusão da pesquisa factual.

## Mapa de arquivos e contratos propostos

Reutilizar `carousel-editorial.ts` para proposta textual, `plan-carousel-work.ts` para aplicação e os módulos existentes de geração. Criar apenas `carousel-research.ts` (pesquisa/evidência), `carousel-editorial-state.ts` (contrato/decisões puras), seus testes e `CarouselHookChoices.tsx`/teste para a nova seleção. O restante evolui arquivos atuais; não criar framework de agentes.

Proposta de armazenamento: adicionar `settings.carouselEditorial` opcional, schema estrito com `version: 1`. Conservar `settings.carouselDraft` como único deck textual, evitando duas cópias de roteiro. O envelope novo guarda pesquisa, opções, storyboard e aprovações; não é um segundo planejador. Não exige coluna nova, mas é mudança de formato persistido e requer aprovação do plano.

```ts
// carousel-editorial-state.ts — nomes consumidos pelas tarefas seguintes.
export type ResearchSource = {
  id: string; url: string | null; sourceId: string | null; title: string;
  checkedOn: string | null; publicationDate: string | null;
  evidence: string; limitations: string[];
  access: 'opened' | 'provided' | 'discovered';
};
export type ResearchClaim = {
  id: string; text: string; sourceIds: string[];
  kind: 'fact' | 'interpretation' | 'opinion'; volatile: boolean;
};
export type CarouselResearch = {
  status: 'ready' | 'not_needed' | 'insufficient' | 'unavailable';
  question: string; thesis: string; sources: ResearchSource[];
  claims: ResearchClaim[]; gaps: string[];
};
export type CarouselHook = {
  id: string; headline: string; promise: string; narrative: string;
};
export type SlideDirection = {
  slideId: string; learning: string; representation: string;
  hierarchy: string; transition: string; claimIds: string[];
};
export type CarouselEditorialState = {
  version: 1; revision: string; contextHash: string;
  research: CarouselResearch;
  hooks: CarouselHook[]; recommendedHookId: string | null;
  recommendation: string | null; selectedHookId: string | null;
  storyboard: SlideDirection[]; caption: string | null;
  approvedScriptRevision: string | null;
  approvedCover: {
    slideId: string; scriptRevision: string; preparedRevision: string;
  } | null;
  confirmedInteriorsRevision: string | null;
};
export type CarouselEditorialCommand =
  | { kind: 'propose_hooks' }
  | { kind: 'select_hook'; hookId: string; headline?: string }
  | { kind: 'revise_script'; instruction: string }
  | { kind: 'approve_script'; scriptRevision: string }
  | { kind: 'approve_cover'; slideId: string; preparedRevision: string };
```

Schema: hooks pode ser vazio antes da proposta ou ter exatamente três IDs únicos; seleção/recomendação devem apontar para a lista. Fonte externa sustentadora exige URL HTTP(S), acesso `opened` e data atribuída pelo servidor; `discovered` não sustenta claim. Fonte fornecida exige `sourceId` autorizado. Texto limitado aos limites existentes; instruções ≤1000 caracteres, evidência ≤2000 por fonte, até 12 fontes e 32 claims. Storyboard deve cobrir exatamente os IDs do deck. Usar SHA-256/canonicalJsonStringify existente para revisão, incluindo contexto, gancho, deck, storyboard e legenda; não incluir as próprias aprovações no hash.

Proposta de API: adicionar `command` opcional ao POST `/api/creative-work/[id]/carousel/plan`, junto a `expectedUpdatedAt` e `answers` existentes. Ausência de command inicia `propose_hooks`; não mantém o planejador antigo como alternativa. Resposta acrescenta `editorial` ao DTO atual. Novo enum de erros: `research_unavailable`, `research_insufficient`, `invalid_editorial_transition`, além dos existentes. Gate de geração inválido retorna conflito, nunca dispatch.

Confirmação existente ganha escopo de carrossel `cover | interiors` no payload e no snapshot preparado. Sem escopo, carrossel legado não despacha e solicita preparação atualizada; outras modalidades não mudam. O escopo participa da revisão preparada e do orçamento mostrado. Não criar endpoint/controlador paralelo de geração.

## Task 1: Diagnóstico reproduzível e decisão canônica

**Files:** ler `app/src/server/ai/providers/e2e-controlled-provider.ts`, `app/src/server/creative-work/carousel-editorial.ts`; modificar o teste existente `app/src/server/creative-work/carousel-editorial.test.ts` apenas onde faltar regressão; criar `docs/adr/2026-09-10-carousel-editorial.md`.

**Interfaces:** consome `isE2EControlledProviderEnabled(environment)` e `proposeCarouselDraft(input)` existentes; produz evidência de origem do rascunho e ADR com o fluxo aprovado, sem novas interfaces de execução.

- [ ] Registrar branch/status e reproduzir em ambiente local autorizado com mocks. Inspecionar apenas flags relevantes, nunca despejar `.env` ou segredos. Sem acesso ao ambiente do print, registrar o diagnóstico como não confirmado.
- [ ] Acrescentar ao describe existente um teste que distingue a chamada real mockada do simulador; usar o setup já existente e conferir que flags de teste não habilitam domínio de produção:

```ts
expect(isE2EControlledProviderEnabled({
  E2E_CONTROLLED_PROVIDER: 'true', NODE_ENV: 'production',
  APP_URL: 'https://app.example.com', E2E_DISABLE_RATE_LIMIT: 'true',
  E2E_CONTROLLED_PROVIDER_PREVIEW: 'true',
})).toBe(false);
```

- [ ] Rodar `cd app && npm test -- src/server/creative-work/carousel-editorial.test.ts`. O cenário deve falhar se o guard regredir; não forçar alteração de código se já passa.
- [ ] Registrar ADR: aprovações de gancho/roteiro/capa são específicas deste Protocolo e não tornam briefing manual obrigatório para os demais. Corrigir a causa do simulador apenas se comprovada e dentro da autorização local.
- [ ] Revisar diff e commitar somente ADR/teste ou correção comprovada: `git commit -m "docs: record carousel editorial decisions and diagnosis"` após stage explícito dos arquivos tocados.

## Task 2: Estado editorial, revisão e invalidação

**Files:** criar `app/src/server/creative-work/carousel-editorial-state.ts` e `.test.ts`; modificar `app/src/server/creative-work/contracts.ts`, `app/src/lib/hooks/use-creative-work.ts` e `app/src/server/application/revise-carousel.ts` nos leitores/escritores de settings. Inspecionar também todo caller de `updateCreativeWorkDraftIfUnchanged` antes de centralizar invalidação no repositório `app/src/server/repositories/creative-work.ts`.

**Interfaces:** tipos definidos acima; produzir `invalidateCarouselApprovals(state: CarouselEditorialState): CarouselEditorialState` e `canDispatchCarouselInteriors(state: CarouselEditorialState, scriptRevision: string, preparedRevision: string, coverSlideId: string): boolean`.

- [ ] Escrever teste puro com estado construído no teste, aprovando uma revisão e alterando o roteiro:

```ts
const changed = invalidateCarouselApprovals(state);
expect(changed.approvedScriptRevision).toBeNull();
expect(changed.approvedCover).toBeNull();
expect(changed.confirmedInteriorsRevision).toBeNull();
expect(changed.research).toEqual(state.research);
expect(canDispatchCarouselInteriors(changed, 'script-2', 'prepared-2', 'cover-1')).toBe(false);
```

- [ ] Rodar `cd app && npm test -- src/server/creative-work/carousel-editorial-state.test.ts`; esperar falha por módulo ausente.
- [ ] Implementar schemas estritos, tipos e funções puras; retornar false se qualquer identidade/revisão não coincidir. Invalidar aprovações em toda mutação material de pedido, fontes, texto, ordem, gancho ou direção. Não invalidar em uma simples leitura/autosave sem mudança semântica.

```ts
return {
  ...state, approvedScriptRevision: null,
  approvedCover: null, confirmedInteriorsRevision: null,
};
```

- [ ] Proteger campos de aprovação no servidor: autosave genérico não aceita criar/alterar aprovações. Leituras legadas aceitam envelope ausente, mas geração nova exige gates. Mapear envelope para DTO público sem paths internos ou chaves de storage.
- [ ] Rodar teste novo e `npm run typecheck`; adicionar no teste de repositório existente caso de autosave tentando forjar aprovação. Commit explícito: `feat: persist versioned carousel editorial decisions`.

## Task 3: Pesquisa com proveniência e limite de execução

**Files:** criar `app/src/server/creative-work/carousel-research.ts` e `.test.ts`; reutilizar `app/src/server/ai/utils.ts` e `app/src/server/creative-work/fact-pack.ts` sem cliente alternativo.

**Interfaces:** `researchCarousel(input: { request: string; factualSources: Array<{ sourceId: string; content: string }>; needsExternalEvidence: boolean }): Promise<CarouselResearch>`; consumir tipos da tarefa 2. Conteúdo da marca permanece fora das consultas públicas quando não for necessário para a pergunta.

- [ ] Obter aprovação da integração proposta e verificar compatibilidade oficial do modelo antes de codificar sua chamada. Não executar a API real durante os testes.
- [ ] Escrever teste do adaptador com resposta mockada contendo busca sem abertura; a fonte deve continuar `discovered` e o resultado factual ser `insufficient`. Segundo caso abre fonte, mas retorna claim sem referência: rejeitar vínculo.

```ts
expect(result.sources.every(s => s.checkedOn === null)).toBe(true);
expect(result.status).toBe('insufficient');
```

- [ ] Rodar `cd app && npm test -- src/server/creative-work/carousel-research.test.ts`; esperar falha por módulo ausente.
- [ ] Implementar uma chamada pelo cliente existente, com timeout e zero retries, validando a resposta em Zod. Forma da chamada, sujeita à compatibilidade verificada:

```ts
const response = await getOpenAI().responses.create({
  model: env.OPENAI_TEXT_MODEL,
  tools: [{ type: 'web_search' }], max_tool_calls: 6,
  include: ['web_search_call.action.sources'],
  input: researchPrompt,
}, { timeout: 60_000, maxRetries: 0 });
```

`researchPrompt` é montado no próprio módulo: pergunta editorial, alegações a investigar, fontes primárias, contraponto, limites e JSON correspondente a CarouselResearch. Delimitar materiais como dados não confiáveis e proibir instruções neles contidas. Não enviar o briefing privado integral como consulta pública. Conferir URLs retornadas contra ações de ferramenta concluídas; atribuir checkedOn no servidor somente para abertura observada. Sem ação aberta verificável, não promover descoberta a evidência.

- [ ] Caso `needsExternalEvidence=false`, usar fontes fornecidas e status `not_needed`; classificar alegações verificáveis corretamente. Falha/timeout produz `unavailable` com lacuna legível; sem fallback pago. Vincular claims por IDs ao fact pack sem tratar texto bruto da pesquisa como uma única prova.
- [ ] Rodar testes, incluindo timeout, fonte fornecida de outro Trabalho e conteúdo com instrução maliciosa. Commit: `feat: research carousel claims with source provenance`.

## Task 4: Três ganchos e roteiro semântico

**Files:** modificar `app/src/server/creative-work/carousel-editorial.ts` e `.test.ts`; usar os contratos da tarefa 2. Manter lint existente, sem reescrever o arquivo inteiro.

**Interfaces:** exportar `proposeCarouselHooks(input: { request: string; research: CarouselResearch; toneOfVoice: string | null }): Promise<{ hooks: CarouselHook[]; recommendedHookId: string; recommendation: string }>`; estender o input de `proposeCarouselDraft` com `selectedHook`, `research`, `previousStoryboard` e `revisionInstruction` opcionais durante adaptação de callers, obrigatórios no novo caminho da aplicação. Resultado acrescenta `storyboard` e `caption` ao retorno da proposta, sem duplicar o deck armazenado.

- [ ] No teste existente, mockar proposta com três títulos iguais e esperar `CarouselEditorialPlanInvalidError`. Mockar uma proposta válida e verificar três IDs, recomendação existente e promessa compatível com a tese. Usar os fixtures atuais como base.

```ts
expect(new Set(result.hooks.map(h => h.headline.trim().toLowerCase())).size).toBe(3);
expect(result.hooks.some(h => h.id === result.recommendedHookId)).toBe(true);
```

- [ ] Rodar `cd app && npm test -- src/server/creative-work/carousel-editorial.test.ts` e conferir falha do caso novo.
- [ ] Criar schema de proposta de hooks com `.length(3)`. Prompt exige ângulos estruturalmente diferentes, promessa e percurso; não expõe scores ou arquivos. Distinção semântica é objeto de revisão editorial manual, não provada pela unicidade das strings.
- [ ] Prompt do roteiro recebe apenas o gancho escolhido e as evidências disponíveis, define objetivo por slide, representação, hierarquia, transição e referências. A copy de capa preserva o gancho editado pelo humano. Validar cobertura exata do storyboard e IDs de claims; resposta inválida não persiste.
- [ ] Trocar preservação de edição humana por posição para identidade estável. Na revisão, exigir slideId existente para slides mantidos; o servidor atribui IDs aos novos. Não mapear uma edição do slide 2 para outro assunto que passou à posição 2.
- [ ] Acrescentar teste de reordenação com edição humana e notas de bastidor em campo de contexto. Rodar teste focal e commit: `feat: propose carousel hooks and visual scripts`.

## Task 5: Comandos persistidos e API protegida

**Files:** modificar `app/src/server/application/plan-carousel-work.ts`/`.test.ts`, `app/src/app/api/creative-work/[id]/carousel/plan/route.ts`/`.test.ts`, `app/src/lib/hooks/use-creative-work.ts`; reutilizar repositório e rate limit atuais.

**Interfaces:** `planCarouselWork` recebe `command: CarouselEditorialCommand`; retorna DTO existente mais `editorial: CarouselEditorialState`. `select_hook` persiste a seleção antes da chamada de roteiro, permitindo retomada depois de falha. `approve_cover` apenas aprova; confirmar lote continua sendo geração.

- [ ] Escrever no teste atual cenário de resposta tardia: ler revisão A, editar para B durante a chamada mockada, devolver proposta A; esperar stale_input e nenhuma gravação de deck A.

```ts
expect(result).toMatchObject({ ok: false, error: { code: 'stale_input' } });
expect(persistedDraft.plan).toEqual(newerDraft.plan);
```

As variáveis são resultados e fixtures montados pelo setup existente, sem DB remoto.

- [ ] Rodar testes de aplicação e rota, esperando falha dos comandos ainda não suportados.
- [ ] Implementar validação → snapshot autorizado → chamada fora de transação → releitura/CAS. Para approve_script exigir revisão exata e lint factual sem bloqueios; para approve_cover exigir peça corrente, concluída, do Trabalho/workspace e revisão preparada vigente, sem reprovação objetiva.
- [ ] Mapear comando ausente para propose_hooks. Pesquisa indisponível preserva último roteiro e retorna erro/lacuna; nova seleção não é perdida por falha posterior. Adicionar tradução dos códigos sem mensagens brutas de provedor para o cliente.
- [ ] Testar 401/escopo existente, comando inválido, cover de outro Trabalho, dupla aprovação e reload. Rodar `npm test -- src/server/application/plan-carousel-work.test.ts 'src/app/api/creative-work/[id]/carousel/plan/route.test.ts'` em app. Commit: `feat: expose revision-safe carousel editorial commands`.

## Task 6: Gate real da capa e orçamento por etapa

**Files:** modificar `app/src/server/application/prepare-carousel-work.ts`, `generate-carousel-work.ts`, `advance-carousel-generation.ts`, seus testes existentes; `app/src/server/creative-work/carousel-contracts.ts`; `app/src/server/jobs/creative-work-carousel.ts`/`.test.ts`; `app/src/server/generation/settlement-adapters.ts` se necessário para guard atômico. Seguir os callers de confirmação em `app/src/lib/hooks/use-creative-work.ts` e a rota genérica de geração localizada por `rg -n 'generateCarouselWork' app/src`.

**Interfaces:** snapshot de carrossel acrescenta `generationScope: 'cover' | 'interiors'` e `scriptRevision`; `generateCarouselWork` usa o escopo congelado, nunca o valor do cliente para autorizar. `dispatchNextCarouselStage` mantém assinatura existente e retorna dispatched=0 enquanto faltar aprovação/confirmacão vigentes.

- [ ] No teste de avanço atual, concluir só a capa sem approvedCover; verificar nenhum settlement para meio/fechamento:

```ts
expect(result).toMatchObject({ ok: true, value: { dispatched: 0 } });
expect(startGenerationSettlement).not.toHaveBeenCalled();
```

- [ ] Rodar os testes de prepare/generate/advance; esperar falha do avanço atual que despacha o meio.
- [ ] Preparação cover exige roteiro aprovado e orça só uma imagem; preparação interiors exige capa aprovada vigente e orça apenas drafts elegíveis restantes. Preservar chaves de settlement existentes; nenhuma nova cobrança agregada. Aprovar capa não altera sozinho o escopo de geração.
- [ ] Gravar confirmedInteriorsRevision na confirmação do lote via CAS e conferir em todo dispatch de interior, inclusive âncoras, retries e worker. Guard de autorização e claim precisam observar atomicamente a revisão corrente; um check distante antes da cobrança não resolve a corrida. Reutilizar transação/claim de settlement para esse vínculo, sem manter locks durante provider calls.
- [ ] Callback da capa pausa. Após confirmação do lote, continuar a sequência de âncoras existente. Resultado atrasado pode concluir sua versão histórica, mas não dispara dependentes da revisão nova. Alteração durante job preserva resultado antigo como desatualizado.
- [ ] Testar dois confirms concorrentes, roteiro invalidado entre leitura e claim, falha da capa e saldo insuficiente para o lote. Rodar também `src/server/generation/settlement-adapters.test.ts` e testes do job. Commit: `feat: require cover approval before carousel interiors`.

## Task 7: Escolha, revisão e continuidade na interface

**Files:** criar `app/src/components/creative-work/CarouselHookChoices.tsx`/`.test.tsx`; modificar `CarouselComposer.tsx`, `CarouselSequenceBoard.tsx`, `CarouselSlideEditor.tsx`, `CarouselDeckReview.tsx`, `useCarouselComposer.ts` e testes correspondentes; `app/messages/pt-BR.json`, `app/messages/en.json`.

**Interfaces:** HookChoices recebe `{ hooks: CarouselHook[]; recommendedHookId: string | null; recommendation: string | null; busy: boolean; onSelect: (hookId: string, headline?: string) => void; onRegenerate: () => void }`. Controller deriva fases `entry | researching | hooks | sequence | ready_to_generate | generating | cover_review | review` de dados persistidos e mutations; não cria segundo cache de sessão.

- [ ] No teste de composer, apresentar hooks e clicar escolha; esperar comando select_hook, nenhuma confirmação de imagem. Na capa concluída, mostrar botão “Aprovar capa e gerar demais slides” e não chamar geração ao montar a tela.

```tsx
expect(screen.getAllByRole('button', { name: /Escolher gancho/ })).toHaveLength(3);
expect(confirmGeneration).not.toHaveBeenCalled();
```

- [ ] Rodar `cd app && npm test -- src/components/creative-work/CarouselComposer.test.tsx`; esperar falha dos elementos novos.
- [ ] Usar botões nativos e componentes existentes para escolhas e edição. Mostrar headline, promessa, percurso e recomendação; incluir ação de novas opções. Implementar roteiro como sequência com copy e direção visual juntas, fontes expansíveis e legenda, mantendo reorder/edição existentes.
- [ ] Aprovar roteiro persiste comando e oferece geração da capa com orçamento de uma imagem. Botão da capa executa aprovação → preparação interiors → confirmação existente, só prosseguindo se cada resposta for vigente. Não disparar por useEffect, Enter no textarea ou simples render.
- [ ] Preservar foco, labels, aria-live de progresso/erro, teclado e leitura mobile. Renderizar fontes como links HTTP(S) seguros; não usar HTML gerado pelo modelo. Traduzir mensagens nas duas línguas.
- [ ] Testar reload em hooks/roteiro/capa, falha recuperável, revisão invalidada e WIP de edição. Rodar testes dos componentes tocados. Commit: `feat: guide carousel review from hooks to pilot cover`.

## Task 8: Storyboard na produção e aceite integrado

**Files:** modificar `app/src/server/creative-work/prompt.ts`/`.test.ts`, `app/src/server/creative-work/carousel-visual.ts`/`.test.ts`, `app/src/server/application/export-carousel-work.ts`/`.test.ts`, `app/tests/e2e/creative-work-carousel.spec.ts`; criar `docs/evidence/2026-09-10-carousel-editorial-validation.md` com resultados efetivos.

**Interfaces:** snapshot congelado inclui storyboard e caption do envelope; `buildCarouselSlidePrompt` recebe a direção do slide por ID. Export existente inclui legenda/referências sem alterar nomes/ordem de PNGs ou duplicar manifest. Se manifest exigir nova versão, explicitar essa mudança de formato antes de executar.

- [ ] No teste de prompt existente, fornecer direção “Comparar duas rotinas com o mesmo critério”; esperar essa instrução no prompt e ausência das notas internas. Testar referência inexistente bloqueada na preparação.

```ts
expect(prompt).toContain('Comparar duas rotinas com o mesmo critério');
expect(prompt).not.toContain('drafts/angles-hooks.md');
```

- [ ] Rodar teste de prompt, conferir falha; conectar direção por slide ao prompt e preservar texto exato, assets protegidos e mecanismo de composição existentes. Não migrar engine de imagem nesta mudança. A capa orienta identidade; storyboard orienta cena e densidade.
- [ ] Estender E2E existente: input com bastidores → 3 ganchos → edição/escolha → roteiro → aprovação → uma capa → pausa confirmada → aprovação/lote → revisão/export. Usar provedor controlado explicitamente e verificar contagem de dispatch por etapa; incluir reload e sessão antiga tentando confirmar.
- [ ] Rodar checks focais de todas as tarefas, `npm run typecheck`, ESLint nos arquivos tocados e `git diff --check`. Executar Playwright somente com DB, storage e Inngest locais confirmados; não executar seed contra ambiente remoto.
- [ ] Registrar avaliação manual com dois briefings: factual sobre um tema com fontes fornecidas verificáveis e institucional de marca fictícia. Conferir três perspectivas, promessa entregue, evidências e progressão. Sem autorização de provider real, registrar avaliação visual real como pendente, sem declarar o carrossel validado em produção.
- [ ] Rodar `graphify update .` depois de alterações de código; separar atualizações geradas de WIP existente. Revisar diff allowlist e commit: `test: verify researched carousel flow and visual handoff`.

## Self-review e cobertura

| Requisito da especificação | Tarefas |
| --- | --- |
| Diagnóstico do simulador sem alegação de produção | 1 |
| Pesquisa, proveniência, limites e materiais não confiáveis | 3, 4, 8 |
| Três ganchos e escolha persistida | 2, 4, 5, 7 |
| Copy, storyboard, fontes, legenda e edição estável | 4, 5, 7, 8 |
| Aprovação de roteiro, capa e lote no backend | 2, 5, 6 |
| Concorrência, invalidação, custos e retomada | 2, 5, 6 |
| Legados e demais protocolos | 2, 6, 7, 8 |
| Qualidade factual/editorial/visual distinta de mocks | 3, 4, 8 |

A implementação depende da aprovação dos contratos/API e integração de pesquisa descritos neste plano. Nenhuma chamada externa paga, alteração de produção ou migração foi executada durante o planejamento. Ao concluir a revisão do plano, escolher execução inline ou por subagentes antes de iniciar código.
