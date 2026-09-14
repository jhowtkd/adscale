# Direção de arte e refinamento com orçamento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar, criticar e refinar a composição, apresentando a melhor peça válida dentro de um orçamento explícito.

**Architecture:** Estender preparação e QA existentes com uma direção visual e uma crítica estruturada. Usar saídas descendentes e settlement já existentes para no máximo duas revisões automáticas por saída inicial; preservar cada versão e comparar antes de recomendar uma. A política interna de recuperação de cada saída permanece congelada.

**Tech Stack:** Next.js, React, TypeScript, Zod, PostgreSQL/Drizzle, Inngest, Vitest e Testing Library já instalados.

**Spec:** [Entrevista e decisões](../../plans/2026-09-13-treinamento-marca-entrevista.md), [ADR 0015](../../adr/0015-refinamento-criativo-com-orcamento.md), [ADR 0016](../../adr/0016-ativacao-treinamento-apos-calibracao.md).

## Global Constraints

- A nova versão do treinamento só entra em uso após a validação humana dos exemplos da calibração.
- O lote padrão de calibração é de quatro imagens por rodada, cobrindo aspectos diferentes do aprendizado.
- O teto inicial é de três rodadas por treinamento — uma inicial e duas de ajustes —, totalizando até 12 imagens.
- Há liberdade para criar novas poses, roupas e cenas a partir das referências de uma pessoa, desde que suas características anatômicas sejam preservadas.
- A crítica deve justificar a tentativa com um problema concreto e uma intervenção.
- Next.js 16.2.6, React 19.2.4, TypeScript 5, Zod 3, Drizzle 0.45.2, Vitest 4.1.5; nenhuma dependência nova.
- Reutilizar Creative Work, settlement, Inngest e o provedor canônico GPT Image 2. Nenhuma campanha artificial ou segundo gerador.
- Somente planejamento nesta entrega. APIs e armazenamento descritos são propostas concretas para aprovação de execução; nenhuma migração, geração paga ou publicação está autorizada por este documento.
- Preservar trabalhos e versões congeladas anteriores. Não alterar outras mudanças locais. Testes locais não comprovam geração real, fidelidade visual ou deploy.

---

Pré-requisitos: planos01–03. Este plano não aumenta tentativas de calibração: works ligados a trainingSessionId ficam fora do refinamento automático.

## Mapa de arquivos

Criar:
- `app/src/server/creative-work/art-refinement.ts` e `.test.ts`: crítica, decisão, comparação e orçamento puro.
- `app/src/server/application/refine-creative-work.ts` e `.test.ts`: reivindicar tentativa e chamar revisão canônica.
- `app/drizzle/0098_creative_work_refinement.sql`, `app/drizzle/meta/0098_snapshot.json`: estado limitado de refinamento e claims por tentativa.

Modificar:
- `app/src/server/creative-work/contracts.ts`, `app/src/server/application/prepare-creative-work.ts`: orçamento e intenção compositiva congelados.
- `app/src/server/generation/pipeline/post-generation.ts`, `app/src/server/ai/olhar/art-direction-verdict.ts`: crítica contextual com evidência e comparação.
- `app/src/server/jobs/creative-work.ts`, `creative-work-carousel.ts`: gatilho de refinamento apenas após saída terminal validada.
- `app/src/server/application/revise-creative-work-output.ts`, `revise-carousel.ts`: origem automática interna, nova composição ou edição preservando fatos/pessoas.
- `app/src/server/repositories/creative-work.ts`, `creative-work-carousel.ts`, `app/src/server/db/schema.ts`, journal Drizzle: claims atômicas, histórico e recomendação.
- `app/src/server/generation/settlement-adapters.ts`: usar a revisão canônica com chave determinística e origem interna; não criar sistema financeiro novo.
- `app/src/components/creative-work/CreativeResultCard.tsx`, `useComposerOutputActions.ts`, `CarouselDeckReview.tsx`: progresso, comparação, pendências e nova rodada explícita.
- `app/src/lib/creative-work-selection-policy.ts`, `app/messages/pt-BR.json`, `app/messages/en.json` e testes existentes: guarda e cópia.

0098 pressupõe 0097 do plano01 e nenhum novo índice concorrente; gerar no próximo índice livre na execução se necessário.

## Mapa exato dos testes

- Estender: `app/src/components/creative-work/CarouselDeckReview.test.tsx`.
- Estender: `app/src/components/creative-work/CreativeResultCard.test.tsx`.
- Estender: `app/src/lib/creative-work-selection-policy.test.ts`.
- Estender: `app/src/server/ai/olhar/art-direction-verdict.test.ts`.
- Estender: `app/src/server/application/prepare-creative-work.test.ts`.
- Criar: `app/src/server/application/refine-creative-work.test.ts`.
- Estender: `app/src/server/application/revise-carousel.test.ts`.
- Estender: `app/src/server/application/revise-creative-work-output.test.ts`.
- Criar: `app/src/server/creative-work/art-refinement.test.ts`.
- Estender: `app/src/server/creative-work/contracts.test.ts`.
- Estender: `app/src/server/generation/pipeline/post-generation.test.ts`.
- Estender: `app/src/server/generation/settlement-adapters.test.ts`.
- Estender: `app/src/server/jobs/creative-work-carousel.test.ts`.
- Estender: `app/src/server/jobs/creative-work.test.ts`.
- Estender: `app/src/server/repositories/creative-work-carousel.test.ts`.
- Estender: `app/src/server/repositories/creative-work.test.ts`.

### T1: Crítica que produz uma intervenção verificável

**Files:** Criar art-refinement/test; modificar post-generation, art-direction-verdict, contracts e prepare-creative-work/testes.

**Interfaces:** Exportar `ArtCritique`, `RefinementCandidate`, `shouldRefine`, `chooseBestCandidate`. Adicionar ao inputSnapshot campo opcional `artRefinement:{version:1;maxRevisionsPerRoot:2;acceptedCreditCeiling:number;acceptedBy:string;acceptedAt:string}`. Sem campo, comportamento legado. Calibração nunca recebe campo.

- [ ] Primeiro teste:

```ts
it("não gera outra imagem só porque uma nota foi baixa", () => {
  const critique:ArtCritique={verdict:"weak",problem:"",intervention:"",mode:"recompose",
    preserve:[],evidence:[],confidence:"high"};
  expect(shouldRefine({critique,usedRevisions:0,isCalibration:false,objective:"pass"})).toBe(false);
});
```

- [ ] Rodar `cd app && npm test -- src/server/creative-work/art-refinement.test.ts`; esperar FAIL.
- [ ] Implementar contratos e decisão:

```ts
export type ArtCritique = {
  verdict:"ready"|"weak"|"inconclusive";
  problem:string; intervention:string; mode:"edit"|"recompose";
  preserve:string[]; evidence:string[]; confidence:"low"|"medium"|"high";
};
export type RefinementCandidate = {
  id:string;objective:"pass"|"fail"|"inconclusive";
  humanReviewRequired:boolean;critique:ArtCritique;
};
export function shouldRefine(input:{critique:ArtCritique;usedRevisions:number;
  isCalibration:boolean;objective:"pass"|"fail"|"inconclusive"}):boolean {
  const c=input.critique;
  return !input.isCalibration && input.objective==="pass" && input.usedRevisions<2 &&
    c.verdict==="weak" && c.confidence==="high" && c.problem.trim().length>0 &&
    c.intervention.trim().length>0 && c.evidence.length>0;
}
export function chooseBestCandidate(candidates:readonly RefinementCandidate[],
  preferredId:string|null):RefinementCandidate|null {
  const valid=candidates.filter(c=>c.objective==="pass" && !c.humanReviewRequired);
  return valid.find(c=>c.id===preferredId) ??
    valid.find(c=>c.critique.verdict==="ready") ?? valid[0] ?? null;
}
```

Zod estrito para crítica: textos até1000, preserve/evidence até10 itens de300, regra weak exige problema/intervenção/evidência não vazios; resposta inválida vira inconclusive e não gera retries. `preferredId` só vem de comparação validada entre IDs apresentados e sem falha objetiva, não de cliente/modelo arbitrário.
- [ ] Estender QA existente com briefing factual, visualDirection, repertório aplicável, referências e imagem. Instrução literal:

```text
Avalie se a composição resolve a mensagem. Localize um problema concreto de
hierarquia, foco, integração da pessoa, tipografia, recorte, perspectiva,
iluminação ou acabamento. Cite evidência visível e proponha uma intervenção.
Se a estrutura inteira for fraca, proponha outra composição. Preserve os
fatos, a identidade, as características anatômicas e os invariantes aprovados.
Uma preferência estética genérica ou nota isolada não justifica nova imagem.
```

Reutilizar vereditos/códigos existentes, acrescentando estrutura em quality; não trocar schemaVersion1 de QA nem quebrar consumidores legados. Não aplicar critérios de uma linguagem a outra. Inconclusive não significa “ruim” nem autorização de repetição.
- [ ] Congelar orçamento após mostrar cotação máxima no preparo: para n saídas iniciais, até3*n unidades canônicas (inicial + duas revisões por raiz). Reserva só ocorre quando unidade é executada; limite aceito não é débito antecipado e créditos não usados não são cobrados. Aceitação não pode vir de valor default preenchido pelo servidor como se fosse consentimento do usuário. Quando opt-in desativado, preservar geração atual.
- [ ] Acrescentar testes: crítica ready, fraca com evidência, dúvida, teto2, calibração, objetiva fail, baixa confiança, invariantes e proibição de inventar fatos. Rodar testes focal + typecheck; esperar PASS. Commit allowlist de T1: `git commit -m "feat: produce actionable art direction critiques"`.


**Arquivos exatos para revisão e commit desta tarefa:** usar somente os caminhos efetivamente alterados desta lista. Se um arquivo contiver WIP prévio, separar os hunks com `git add -p -- caminho`; não stagear o arquivo inteiro. Este comando substitui a abreviação de commit acima.

```bash
git add -- \
  app/src/server/creative-work/art-refinement.ts \
  app/src/server/creative-work/contracts.ts \
  app/src/server/application/prepare-creative-work.ts \
  app/src/server/generation/pipeline/post-generation.ts \
  app/src/server/ai/olhar/art-direction-verdict.ts \
  app/src/server/creative-work/art-refinement.test.ts \
  app/src/server/creative-work/contracts.test.ts \
  app/src/server/application/prepare-creative-work.test.ts \
  app/src/server/generation/pipeline/post-generation.test.ts \
  app/src/server/ai/olhar/art-direction-verdict.test.ts
git commit -m "feat: brand training refinamento task 1"
```

### T2: Revisões automáticas limitadas e idempotentes

**Files:** Criar refine-creative-work/test; modificar schema, creative-work repo, revise-creative-work-output, settlement-adapters, job, migração/journal/testes.

**Interfaces:** `refineCreativeWork(input:{workspaceId:string;workItemId:string;rootOutputId:string;completedOutputId:string}):Promise<{kind:"started"|"stopped"|"replay";outputId:string|null;reason:string}>`. `claimArtRefinement(input:{workspaceId:string;workItemId:string;rootOutputId:string;parentOutputId:string;expectedParentHash:string;unitCredits:number}):Promise<{attempt:number;revisionKey:string}|null>` no repo. Autor e limite vêm do orçamento congelado, não do job/evento externo. Tentativa0 é raiz;1/2 são revisões.

- [ ] Primeiro teste:

```ts
it("nunca recomenda a versão objetivamente rejeitada", () => {
  const critique:ArtCritique={verdict:"ready",problem:"",intervention:"",mode:"edit",
    preserve:[],evidence:[],confidence:"high"};
  expect(chooseBestCandidate([
    {id:"valid",objective:"pass",humanReviewRequired:false,critique},
    {id:"bad",objective:"fail",humanReviewRequired:false,critique},
  ],"bad")?.id).toBe("valid");
});
```

Adicionar teste do serviço com mocks de settlement: entregar mesmo evento duas vezes retorna mesma revisionKey e apenas uma cobrança. Rodar; caso idempotência falha antes de existir coordenador.
- [ ] Adicionar tabela `creativeWorkRefinementAttempts`: UUIDid,workspaceId,workItemId,rootOutputId,parentOutputId,attempt integer1..2,revisionKey unique,status `claimed|dispatched|completed|failed`,unitCredits nonnegative,outputId nullable,createdAt/updatedAt. Índices únicos parciais `(workItemId,rootOutputId,attempt)` para outputs e `(workItemId,rootSlideId,attempt)` para slides; CHECK garante pares root/parent do mesmo tipo. T4 detalha os campos de slides, que entram nesta mesma migração. Estado de resumo em work `artRefinementState` JSON `{recommendedOutputIds:string[];status:"running"|"ready"|"budget_exhausted"|"needs_review";issues:string[]}`. Todo acesso escopado por workspace e work.
- [ ] Reivindicar antes da chamada financeira sob lock da work, verificando soma de unidades/custos já reivindicados e slots por raiz. Exemplo da guarda transacional a traduzir para o estilo Drizzle existente:

```sql
SELECT pg_advisory_xact_lock(hashtext($1));
SELECT count(*) AS used, coalesce(sum(unit_credits), 0) AS credits
FROM adscale_app.creative_work_refinement_attempts
WHERE workspace_id = $2 AND work_item_id = $3;
```

`$1` é `art-refinement:${workspaceId}:${workId}`, valores parametrizados. Conferir também contagem da raiz e limite total aceito, já descontado custo inicial. INSERT com índice único; conflito devolve a tentativa existente. Não manter lock durante provider/settlement. Tentativa falha consome oportunidade, mas créditos seguem reembolso canônico; não alocar terceira tentativa para compensar falha.
- [ ] `revisionKey = art-refinement:${workId}:${rootOutputId}:${attempt}`. Chamar `reviseCreativeWorkOutput` existente com autor congelado, parent válido, instruction contendo defeito/intervenção/preserve e revisionAssetId null. Acrescentar argumento interno `compositionMode?:"edit"|"recompose"`; nunca aceitá-lo como escape de segurança. Edit condiciona pelo parent; recompose retira parent como referência visual obrigatória e usa briefing/fotos/marca originais. Ambos mantêm fact-pack/identidade e protocolo, sem trocar modo para driblar preservação de original em format_adaptation/restyle. Nesses protocolos, recompose fica limitado aos elementos editáveis e deve parar se só violando a preservação resolveria a crítica.
- [ ] Ao completar saída no job, chamar coordenador via etapa durável Inngest depois de persistir qualidade. O coordenador sempre reconcilia tentativa claimed/dispatched pelo revisionKey e output; replay não se limita a “já existe, retornar” se a etapa de despacho não ocorreu. Falha antes/depois da reserva segue reconciliação de settlement existente. A política quality_recovery_v1 de cada output mantém duas chamadas máximas, incluindo retry/correção; raiz+duas revisões têm até6 chamadas por raiz. Calibração continua excluída.
- [ ] Testar duas conexões disputando segunda tentativa, crash após claim antes de settlement, crash após cobrança antes de retorno, crédito insuficiente, evento atrasado, output de outra work, parent stale, tentativa inválida e nenhuma terceira revisão. Teste simulado deve contar provider calls no máximo6; teste transacional comprova único claim, não qualidade de imagem.
- [ ] Gerar/revisar migração local sem aplicá-la em ambiente externo; rodar testes alterados + typecheck. Commit allowlist incluindo SQL/snapshot/journal: `git commit -m "feat: bound automatic creative revisions through settlement"`.


**Arquivos exatos para revisão e commit desta tarefa:** usar somente os caminhos efetivamente alterados desta lista. Se um arquivo contiver WIP prévio, separar os hunks com `git add -p -- caminho`; não stagear o arquivo inteiro. Este comando substitui a abreviação de commit acima.

```bash
git add -- \
  app/src/server/application/refine-creative-work.ts \
  app/src/server/db/schema.ts \
  app/src/server/repositories/creative-work.ts \
  app/src/server/application/revise-creative-work-output.ts \
  app/src/server/generation/settlement-adapters.ts \
  app/src/server/jobs/creative-work.ts \
  app/drizzle/0098_creative_work_refinement.sql \
  app/drizzle/meta/0098_snapshot.json \
  app/drizzle/meta/_journal.json \
  app/src/server/application/refine-creative-work.test.ts \
  app/src/server/repositories/creative-work.test.ts \
  app/src/server/application/revise-creative-work-output.test.ts \
  app/src/server/generation/settlement-adapters.test.ts \
  app/src/server/jobs/creative-work.test.ts
git commit -m "feat: brand training refinamento task 2"
```

### T3: Comparar, preservar a melhor versão e mostrar pendências

**Files:** Modificar art-refinement, post-generation, refine-creative-work, creative-work repo, ResultCard, output actions, selection-policy/testes e catálogos.

**Interfaces:** Comparação `ArtComparison={preferredId:string|null;reason:string;fixedIssues:string[];regressions:string[]}` definida em art-refinement.ts, validada com IDs das duas imagens. `compareArtCandidates(input:{before:RefinementCandidate;after:RefinementCandidate;brief:string;beforeImage:Buffer;afterImage:Buffer}):Promise<ArtComparison>` em post-generation.ts reutiliza cliente multimodal; no máximo uma chamada comparativa por revisão, sem retries de gosto.

- [ ] Primeiro teste:

```ts
it("mantém a versão anterior quando a revisão não produz uma candidata válida", () => {
  const critique:ArtCritique={verdict:"weak",problem:"Foco dividido",intervention:"Unificar foco",
    mode:"edit",preserve:[],evidence:["Dois títulos dominantes"],confidence:"high"};
  const before:RefinementCandidate={id:"a",objective:"pass",humanReviewRequired:false,critique};
  expect(chooseBestCandidate([before,{...before,id:"b",objective:"fail"}],"b")?.id).toBe("a");
});
```

- [ ] Rodar teste de integração do coordenador antes da comparação: esperar FAIL porque recomendação persistida ainda não reflete resultado comparativo.
- [ ] Comparar revisões válidas lado a lado com o mesmo briefing e invariantes. Pedir melhoria concreta, regressões e vencedor; empate/inconclusivo mantém a anterior. Se a nova tiver falha objetiva ou pessoa inconclusiva, não compará-la como candidata elegível. Usar chooseBestCandidate antes de persistir recommendedOutputIds. Nenhuma comparação muda fatos ou aprova brand training.
- [ ] Ao teto ou stop: persistir best válida e issues vindas da crítica. Se nenhuma válida, `needs_review` e recommendedOutputIds vazio, sem promover output rejeitado. Se todas prontas, ready. `recommendedOutputIds` é recomendação de apresentação, não `isSelected`: seleção/publicação/promoção de referência permanecem ações existentes com guardas e efeitos próprios.
- [ ] Exibir resultado e versões com estas mensagens, integradas às traduções:

```tsx
<p role="status">Ajustando a composição: {issue}</p>
<p>Melhor versão disponível. Ainda precisa de revisão: {issue}</p>
<button type="button" onClick={onRequestMore}>Revisar mais uma vez</button>
```

`issue:string` vem da crítica validada; `onRequestMore:()=>void` abre a revisão manual existente com cotação. Não retomar automaticamente o orçamento esgotado nem cobrar ao clicar para abrir formulário. Manter comparação entre versões e preview da melhor válida se revisão em curso falhar.
- [ ] Testar resultado pior, empate, erro do avaliador, orçamento esgotado, nenhuma válida, revisão manual explícita, seleção com mismatch e job atrasado que tentaria recomendar uma versão supersedida. Rodar suites + typecheck. Commit allowlist Files: `git commit -m "feat: present best valid artwork with explicit quality issues"`.


**Arquivos exatos para revisão e commit desta tarefa:** usar somente os caminhos efetivamente alterados desta lista. Se um arquivo contiver WIP prévio, separar os hunks com `git add -p -- caminho`; não stagear o arquivo inteiro. Este comando substitui a abreviação de commit acima.

```bash
git add -- \
  app/src/server/creative-work/art-refinement.ts \
  app/src/server/generation/pipeline/post-generation.ts \
  app/src/server/application/refine-creative-work.ts \
  app/src/server/repositories/creative-work.ts \
  app/src/components/creative-work/CreativeResultCard.tsx \
  app/src/components/creative-work/useComposerOutputActions.ts \
  app/src/lib/creative-work-selection-policy.ts \
  app/messages/pt-BR.json \
  app/messages/en.json \
  app/src/server/creative-work/art-refinement.test.ts \
  app/src/server/generation/pipeline/post-generation.test.ts \
  app/src/server/application/refine-creative-work.test.ts \
  app/src/server/repositories/creative-work.test.ts \
  app/src/components/creative-work/CreativeResultCard.test.tsx \
  app/src/lib/creative-work-selection-policy.test.ts
git commit -m "feat: brand training refinamento task 3"
```

### T4: Aplicar direção e refinamento ao carrossel sem quebrar o conjunto

**Files:** Modificar art-refinement, revise-carousel, creative-work-carousel repo/job, CarouselDeckReview e testes. Reutilizar tabela de tentativas de T2 para unidades de slide através de coluna `rootSlideId` nullable e CHECK exatamente um de rootOutputId/rootSlideId; incluir essa definição já na migração de T2, sem uma segunda migração de ajuste nesta sequência.

**Interfaces:** Consumir `reviseCarouselSlide(input:ReviseCarouselSlideCommandInput):Promise<ReviseCarouselSlideResult>` e `reviseCarouselDeck(input:ReviseCarouselDeckCommandInput):Promise<ReviseCarouselDeckResult>` exportados por revise-carousel.ts. Exportar `carouselRevisionUnits(input:{changesAnchor:boolean;dependentSlides:number}):number` de art-refinement.ts. Toda unidade descendente recebe claim de orçamento; rootOutputId/parentOutputId tornam-se nullable para slides e ganham rootSlideId/parentSlideId alternativos na tabela.

- [ ] Primeiro teste:

```ts
it("conta a reconstrução dependente do anchor no orçamento", () => {
  expect(carouselRevisionUnits({changesAnchor:true,dependentSlides:4})).toBe(5);
  expect(carouselRevisionUnits({changesAnchor:false,dependentSlides:4})).toBe(1);
});
```

- [ ] Rodar suite art-refinement; esperar FAIL. Implementar:

```ts
export function carouselRevisionUnits(input:{changesAnchor:boolean;dependentSlides:number}) {
  return 1 + (input.changesAnchor ? input.dependentSlides : 0);
}
```

Validar dependentSlides inteiro>=0 no caller a partir do plano congelado, nunca do navegador. Antes de revisar anchor, reservar orçamento de todos os slides dependentes na mesma transação; insuficiência pausa com pendência explícita. Não autorizar anchor barato e depois gerar dependentes fora do teto.
- [ ] Reutilizar revisão visual de slide e sua descendência existentes, sem sobrescrever versão anterior. Crítica considera função editorial, consistência da linguagem, pessoa e ritmo do conjunto; comparar a versão inteira do deck quando anchor muda. Uma alteração de texto ou ordem deve invalidar/recalcular aprovação editorial pelo contrato já existente, não ser escondida como revisão visual.
- [ ] Manter teto de duas revisões por raiz e limite global de créditos aceito. Cada slide usa seu settlement canônico de uma chamada por revisão; não transplantar teto de duas chamadas de single para carousel. Se não couber no orçamento ou exigir nova aprovação editorial, interromper automação e mostrar melhor deck válido anterior. Pessoas obrigatórias permanecem nas referências por slide como plano03.
- [ ] Testar reconstrução anchor com4dependentes, slot insuficiente em um dependente, falha parcial preservando deck anterior, revisão tardia/stale e nenhuma seleção de deck com slide objetivamente inválido. Rodar testes `revise-carousel.test.ts`, `creative-work-carousel.test.ts`, testes de repositório e CarouselDeckReview; typecheck e convergence gate. Commit allowlist Files: `git commit -m "feat: bound carousel art refinement across dependent slides"`.

## Fechamento da execução

- [ ] Registrar resultados reais dos testes e limitações; não marcar validação visual com base nos mocks.
- [ ] Executar `graphify update .` após alterações de código e revisar diff allowlist, sem incluir WIP alheio.
- [ ] Com autorização específica para geração paga, comparar uma composição fraca e sua revisão, incluindo pessoa nomeada, e solicitar avaliação visual humana. Evidenciar custo real, limites respeitados e preservação da versão ativa durante calibração.

**Arquivos exatos para revisão e commit desta tarefa:** usar somente os caminhos efetivamente alterados desta lista. Se um arquivo contiver WIP prévio, separar os hunks com `git add -p -- caminho`; não stagear o arquivo inteiro. Este comando substitui a abreviação de commit acima.

```bash
git add -- \
  app/src/server/creative-work/art-refinement.ts \
  app/src/server/application/revise-carousel.ts \
  app/src/server/repositories/creative-work-carousel.ts \
  app/src/server/jobs/creative-work-carousel.ts \
  app/src/components/creative-work/CarouselDeckReview.tsx \
  app/src/server/creative-work/art-refinement.test.ts \
  app/src/server/application/revise-carousel.test.ts \
  app/src/server/repositories/creative-work-carousel.test.ts \
  app/src/server/jobs/creative-work-carousel.test.ts \
  app/src/components/creative-work/CarouselDeckReview.test.tsx
git commit -m "feat: brand training refinamento task 4"
```

