# Pessoas nomeadas e preservação de identidade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir citar pessoas reais pelo nome, gerar poses e cenas novas e impedir uso silencioso de identidade incerta.

**Architecture:** Guardar catálogo de pessoas como claim versionada com fotos verificadas, sem tabela biométrica. Resolver menções contra o catálogo congelado e inserir referências obrigatórias no plano de imagens existente. Comparar pessoa gerada com suas referências, separando falha confirmada e dúvida.

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

Pré-requisitos: planos01/02. Pessoa é cadastro atribuído pelo operador; o sistema não identifica desconhecidos, não infere nomes e não mistura pessoas parecidas.

## Mapa de arquivos

Criar:
- `app/src/server/brand-training/people.ts` e `.test.ts`: catálogo, homônimos, aliases e qualidade de referência declarada pelo operador.
- `app/src/components/brand-training/BrandPeopleReview.tsx` e `.test.tsx`: nomes, fotos, agrupamento e referência principal.
- `app/src/server/creative-work/person-fidelity.ts` e `.test.ts`: contrato da comparação visual e decisão de revisão.

Modificar:
- `app/src/server/brand-training/contracts.ts`, `app/src/server/jobs/brand-training.ts`, `app/src/components/brand-training/BrandTrainingAssetReview.tsx`: categoria `person` e análise sem identificação inferida.
- `app/src/server/brand-knowledge/contracts.ts`, `candidate-compiler.ts`, `app/src/server/repositories/brand-knowledge.ts`: claim `people.catalog`, evidência e substituição de catálogo.
- `app/src/components/brand-training/BrandKnowledgeReview.tsx`, hooks e rota brand-knowledge: revisão consolidada.
- `app/src/server/creative-work/contracts.ts`, `identity.ts`, `reference-plan.ts`, `prompt.ts`, `app/src/server/application/prepare-creative-work.ts`: nomes, IDs, fotos e contexto congelados.
- `app/src/server/generation/pipeline/post-generation.ts`, `app/src/server/jobs/creative-work.ts`, `app/src/lib/creative-work-selection-policy.ts`: comparação visual e bloqueio de seleção.
- `app/src/server/repositories/creative-work.ts`, `app/src/server/brand-training/calibration.ts`, `app/src/components/creative-work/CreativeResultCard.tsx`, `BrandCalibrationReview.tsx`: revisão humana específica e guarda central.
- `app/src/server/application/select-creative-work-output.ts`, `app/src/app/api/creative-work/[id]/outputs/[outputId]/select/route.ts` e testes: autoria e confirmação específica, sem efeito de seleção.
- `app/messages/pt-BR.json`, `app/messages/en.json` e testes dos módulos alterados.

## Mapa exato dos testes

- Estender: `app/src/app/api/client-profiles/[id]/brand-knowledge/route.test.ts`.
- Estender: `app/src/app/api/creative-work/[id]/outputs/[outputId]/select/route.test.ts`.
- Criar: `app/src/components/brand-training/BrandCalibrationReview.test.tsx`.
- Estender: `app/src/components/brand-training/BrandKnowledgeReview.test.tsx`.
- Criar: `app/src/components/brand-training/BrandPeopleReview.test.tsx`.
- Estender: `app/src/components/creative-work/CreativeResultCard.test.tsx`.
- Estender: `app/src/lib/creative-work-selection-policy.test.ts`.
- Estender: `app/src/server/application/prepare-creative-work.test.ts`.
- Estender: `app/src/server/application/select-creative-work-output.test.ts`.
- Estender: `app/src/server/brand-knowledge/candidate-compiler.test.ts`.
- Estender: `app/src/server/brand-knowledge/contracts.test.ts`.
- Criar: `app/src/server/brand-training/calibration.test.ts`.
- Estender: `app/src/server/brand-training/contracts.test.ts`.
- Criar: `app/src/server/brand-training/people.test.ts`.
- Estender: `app/src/server/creative-work/carousel-visual.test.ts`.
- Estender: `app/src/server/creative-work/contracts.test.ts`.
- Estender: `app/src/server/creative-work/identity.test.ts`.
- Criar: `app/src/server/creative-work/person-fidelity.test.ts`.
- Estender: `app/src/server/creative-work/prompt.test.ts`.
- Estender: `app/src/server/creative-work/reference-plan.test.ts`.
- Estender: `app/src/server/generation/pipeline/post-generation.test.ts`.
- Estender: `app/src/server/jobs/brand-training.test.ts`.
- Estender: `app/src/server/jobs/creative-work.test.ts`.
- Estender: `app/src/server/repositories/brand-knowledge.test.ts`.
- Estender: `app/src/server/repositories/creative-work.test.ts`.

### T1: Cadastro nominal com múltiplas fotos

**Files:** Criar people.ts/test e BrandPeopleReview/test; modificar categorias, claims, job, revisores e rota.

**Interfaces:** Exportar `BrandPerson`, `peopleCatalogSchema`, `resolvePersonMention(name:string,people:readonly BrandPerson[]):{kind:"resolved";person:BrandPerson}|{kind:"ambiguous";ids:string[]}|{kind:"missing"}`. Catálogo: `{version:1;people:BrandPerson[]}`. Componente `{value:BrandPerson[];onChange:(people:BrandPerson[])=>void;previewByReferenceId:Record<string,string>}`.

- [ ] Primeiro teste:

```ts
it("não escolhe silenciosamente entre homônimos", () => {
  const people = ["p1","p2"].map(id => ({id,name:"Ana",aliases:[],referenceIds:["r"],
    primaryReferenceId:"r",preserve:["características anatômicas"],referenceAdequacy:"confirmed" as const}));
  expect(resolvePersonMention("ana",people)).toEqual({kind:"ambiguous",ids:["p1","p2"]});
});
```

- [ ] Rodar `cd app && npm test -- src/server/brand-training/people.test.ts`; esperar FAIL.
- [ ] Implementar:

```ts
export type BrandPerson = {
  id:string; name:string; aliases:string[]; referenceIds:string[];
  primaryReferenceId:string; preserve:string[];
  referenceAdequacy:"confirmed"|"needs_more_photos";
};
export function resolvePersonMention(name:string, people:readonly BrandPerson[]) {
  const normalize = (s:string) => s.normalize("NFKC").trim().toLocaleLowerCase("pt-BR");
  const matches = people.filter(p => [p.name,...p.aliases].some(n => normalize(n) === normalize(name)));
  if (!matches.length) return {kind:"missing" as const};
  if (matches.length > 1) return {kind:"ambiguous" as const,ids:matches.map(p=>p.id)};
  return {kind:"resolved" as const,person:matches[0]!};
}
```

Zod estrito: UUIDs para id/refs, name1..100, até10aliases100chars, 1..12referenceIds únicos, primary incluída, até12preserve240chars, até50pessoas por catálogo. IDs atribuídos no servidor. Mesma foto não pode pertencer a duas pessoas sem confirmação explícita do recorte/pessoa alvo; nesta entrega exigir fotografia/recorte individual, não identificar automaticamente faces em foto de grupo.
- [ ] Acrescentar categoria `person` com usageMode `reference`, placement null; não usar compositing exact de logos. Preservar categoria `character` existente para dados antigos e não renomear mascotes para pessoas automaticamente. Atualizar todos os switches exaustivos localizados por `rg 'visual_reference|character' app/src/server/brand-training app/src/server/creative-work app/src/components/brand-training`.
- [ ] Na revisão visual, operador agrupa referências, dá nome/aliases, escolhe foto principal e confirma suficiência. Uma referência pode ser suficiente para geração simples, mas enquadramento/cena que exija características não visíveis dispara `needs_more_photos`; sem reconstrução “garantida” de corpo desconhecido. O catálogo registra somente identificadores, referência e orientações fornecidas; não inferir características sensíveis ou cargo/profissão.
- [ ] Criar claim `people.catalog` usando contratos acima; validar refs aprovadas, mesma workspace/perfil, hashes acessíveis; aprovação substitui catálogo antigo atomicamente. Editar nome/foto após validação cria candidata diferente e exige calibração. Nova pessoa não aparece em trabalho normal antes de ativação.
- [ ] Testar aliases, homônimos, referências externas, foto principal fora do conjunto, pessoa sem foto, edição pós-ativação e categoria antiga. Rodar testes + typecheck. Commit explícito Files: `git commit -m "feat: review named brand people with verified photo references"`.


**Arquivos exatos para revisão e commit desta tarefa:** usar somente os caminhos efetivamente alterados desta lista. Se um arquivo contiver WIP prévio, separar os hunks com `git add -p -- caminho`; não stagear o arquivo inteiro. Este comando substitui a abreviação de commit acima.

```bash
git add -- \
  app/src/server/brand-training/people.ts \
  app/src/server/brand-training/contracts.ts \
  app/src/server/jobs/brand-training.ts \
  app/src/server/brand-knowledge/contracts.ts \
  app/src/server/brand-knowledge/candidate-compiler.ts \
  app/src/server/repositories/brand-knowledge.ts \
  app/src/components/brand-training/BrandPeopleReview.tsx \
  app/src/components/brand-training/BrandTrainingAssetReview.tsx \
  app/src/components/brand-training/BrandKnowledgeReview.tsx \
  app/src/lib/hooks/use-brand-training.ts \
  'app/src/app/api/client-profiles/[id]/brand-knowledge/route.ts' \
  app/messages/pt-BR.json \
  app/messages/en.json \
  app/src/server/brand-training/people.test.ts \
  app/src/server/brand-training/contracts.test.ts \
  app/src/server/jobs/brand-training.test.ts \
  app/src/server/brand-knowledge/contracts.test.ts \
  app/src/server/brand-knowledge/candidate-compiler.test.ts \
  app/src/server/repositories/brand-knowledge.test.ts \
  app/src/components/brand-training/BrandPeopleReview.test.tsx \
  app/src/components/brand-training/BrandKnowledgeReview.test.tsx \
  'app/src/app/api/client-profiles/[id]/brand-knowledge/route.test.ts'
git commit -m "feat: brand training pessoas task 1"
```

### T2: Nome no briefing vira referência obrigatória

**Files:** Modificar people, prepare-creative-work, contracts, identity, reference-plan, prompt e testes.

**Interfaces:** Settings novo `personIds?:string[]` até3; snapshot `people?:Array<{personId:string;name:string;referenceIds:string[];primaryReferenceId:string;preserve:string[]}>`. Exportar de people.ts a assinatura `personReferenceSlots(people:readonly BrandPerson[],assetsByReferenceId:ReadonlyMap<string,CreativeWorkReferencePlanAsset>):CreativeWorkReferenceSlot[]`.

- [ ] Primeiro teste em reference-plan.test.ts:

```ts
it("mantém pessoa como presença obrigatória, não inspiração opcional", () => {
  const p:BrandPerson = {id:"p",name:"Ana",aliases:[],referenceIds:["r"],
    primaryReferenceId:"r",preserve:[],referenceAdequacy:"confirmed"};
  const slots=personReferenceSlots([p],new Map([["r",{assetKey:"photo",mimeType:"image/jpeg",label:"Ana"}]]));
  expect(slots[0]).toMatchObject({role:"piece_required",required:true,
    pieceReference:{category:"person_or_character",treatment:"identity_preservation"}});
});
```

- [ ] Rodar teste focal; esperar FAIL por helper ausente.
- [ ] Reutilizar papel obrigatório já existente, sem novo enum de role:

```ts
export function personReferenceSlots(people:readonly BrandPerson[],
  assetsByReferenceId:ReadonlyMap<string,CreativeWorkReferencePlanAsset>):CreativeWorkReferenceSlot[] {
  return people.map(person => {
    const asset=assetsByReferenceId.get(person.primaryReferenceId);
    if (!asset || person.referenceAdequacy !== "confirmed") throw new Error("person_reference_required");
    return {...asset,role:"piece_required" as const,required:true,pieceReference:{
      category:"person_or_character" as const,treatment:"identity_preservation" as const,
      userInstruction:`Pessoa ${person.name}. Preservar identidade e anatomia. ${person.preserve.join("; ")}`,
    }};
  });
}
```

- [ ] No preparo, tratar nomes extraídos do briefing como menções a resolver, não como identidade identificada visualmente. ID explícito vence nome; unknown/ambiguous interrompe preparo antes de cobrar e retorna campo de esclarecimento com opções do catálogo. Se nome for apenas conteúdo textual, permitir escolha “somente mencionar no texto” no briefing, sem obrigar inserir retrato. Guardar decisão e IDs no snapshot.
- [ ] Reservar primeiro todas as referências obrigatórias (pessoa principal, original/style do protocolo e parent quando necessário). Limite atual do reference-plan é4; excesso retorna reference_failure antes de provider. Fotos secundárias de uma mesma pessoa entram somente no espaço livre, por ordem explícita do catálogo. Não excluir obrigatória para caber estilo. Deduplicar assetKey sem perder associação de pessoas; usar labels distintas para evitar fusão de identidades.
- [ ] Para carrossel, manter personId e foto principal em cada slide onde a pessoa deve aparecer, junto do anchor board; se slots obrigatórios excederem4, solicitar redução de pessoas/elementos, sem novo provedor. Nas revisões, carregar a referência original da pessoa novamente; a imagem gerada anterior nunca vira única prova de identidade.
- [ ] Acrescentar no prompt regra explícita de liberdade de pose, roupa e cenário, preservando estrutura facial, proporções corporais observáveis e marcas que o operador pediu preservar. Não transferir anatomia da referência de estilo. Não copiar textos/cargos da foto. Testar que instrução está presente, pessoa errada não substitui homônimo e snapshots antigos continuam aceitos.
- [ ] Rodar testes referência/prompt/preparo/carrossel e typecheck; esperar PASS. Commit allowlist: `git commit -m "feat: bind named people to mandatory generation references"`.


**Arquivos exatos para revisão e commit desta tarefa:** usar somente os caminhos efetivamente alterados desta lista. Se um arquivo contiver WIP prévio, separar os hunks com `git add -p -- caminho`; não stagear o arquivo inteiro. Este comando substitui a abreviação de commit acima.

```bash
git add -- \
  app/src/server/brand-training/people.ts \
  app/src/server/application/prepare-creative-work.ts \
  app/src/server/creative-work/contracts.ts \
  app/src/server/creative-work/identity.ts \
  app/src/server/creative-work/reference-plan.ts \
  app/src/server/creative-work/prompt.ts \
  app/src/server/creative-work/carousel-visual.ts \
  app/src/server/brand-training/people.test.ts \
  app/src/server/application/prepare-creative-work.test.ts \
  app/src/server/creative-work/contracts.test.ts \
  app/src/server/creative-work/identity.test.ts \
  app/src/server/creative-work/reference-plan.test.ts \
  app/src/server/creative-work/prompt.test.ts \
  app/src/server/creative-work/carousel-visual.test.ts
git commit -m "feat: brand training pessoas task 2"
```

### T3: Fidelidade visual e revisão de incerteza

**Files:** Criar person-fidelity/test; modificar post-generation, job, selection-policy, repositório, ResultCard, CalibrationReview/calibration e testes.

**Interfaces:** Exportar `PersonFidelityFinding={personId:string;status:"consistent"|"mismatch"|"inconclusive";evidence:string[];issue:string|null}` e `personFidelityGate(findings:readonly PersonFidelityFinding[]):"pass"|"fail"|"human_review"`. Persistir em output.quality `personFidelity:{findings;review?:{actorId;at;outputId;referenceHash;accepted:boolean}}`. O review vincula output e hash; revisão de outra imagem não vale.

- [ ] Primeiro teste:

```ts
it("incerteza de anatomia não vira aprovação automática", () => {
  expect(personFidelityGate([{personId:"p",status:"inconclusive",evidence:[],issue:"Rosto ocluído"}]))
    .toBe("human_review");
});
```

- [ ] Rodar suite; esperar FAIL. Implementar:

```ts
export function personFidelityGate(findings:readonly PersonFidelityFinding[]) {
  if (findings.some(f=>f.status === "mismatch")) return "fail" as const;
  if (findings.some(f=>f.status === "inconclusive")) return "human_review" as const;
  return "pass" as const;
}
```

Não chamar gate com array vazio quando snapshot exige pessoa: criar finding inconclusive por pessoa ausente ou comparação indisponível. Zod exige evidence não vazia para mismatch, com descrição localizada da divergência. Nenhum score de “semelhança 99%”.
- [ ] Estender avaliação multimodal existente no post-generation com fotos reais e output para cada pessoa. Pedir comparação de características observáveis, sem confundir roupa/pose/luz com anatomia. Se resolução/oclusão impedir comparação, inconclusive. Ferramenta avalia referência, não identifica desconhecido. Distinguir pessoa omitida, fundida ou trocada; todas bloqueiam seleção quando confirmadas.
- [ ] Integrar falha confirmada aos findings objetivos do job e correção já limitada a duas chamadas da saída. Dúvida não dispara laço automático. No selection-policy compartilhado, `mismatch` sempre impede seleção; inconclusive impede aprovação até revisão humana específica registrada no servidor. Aplicar mesma guarda no publish de calibração e na seleção de output; não confiar só em botão desabilitado.
- [ ] Adicionar PATCH em `app/src/app/api/creative-work/[id]/outputs/[outputId]/select/route.ts`, delegando ao novo `reviewCreativeWorkPersonFidelity(input:{workspaceId:string;workItemId:string;outputId:string;userId:string;referenceHash:string;accepted:boolean}):Promise<void>` em `app/src/server/application/select-creative-work-output.ts`, para comando autenticado `{action:"review_person_fidelity",outputId,referenceHash,accepted}`. Conferir ws/perfil/output/hash. UI mostra referências ao lado do output, evidência e escolha “Confirmo que é a pessoa e a anatomia foi preservada” / “Há divergência”. O aceite específico resolve apenas inconclusive; mismatch confirmado continua bloqueado e exige uma nova imagem. Guardar sinal original e decisão humana separadamente. Esta rota registra revisão sem executar seleção nem seus efeitos de biblioteca/receita.
- [ ] Testar missing pessoa, anatomia inconclusive, mismatch, revisão de outro output, hash stale, cross-workspace e comparação indisponível. Em revisão humana negativa, invalidar seleção existente e manter a candidata pendente. Rodar testes + typecheck, esperar PASS. Commit allowlist: `git commit -m "feat: gate person fidelity with evidence and human review"`.

Aceitação visual depende de rodada real com fotos autorizadas e avaliação humana; testes simulados não demonstram fidelidade anatômica do gerador.

**Arquivos exatos para revisão e commit desta tarefa:** usar somente os caminhos efetivamente alterados desta lista. Se um arquivo contiver WIP prévio, separar os hunks com `git add -p -- caminho`; não stagear o arquivo inteiro. Este comando substitui a abreviação de commit acima.

```bash
git add -- \
  app/src/server/creative-work/person-fidelity.ts \
  app/src/server/generation/pipeline/post-generation.ts \
  app/src/server/jobs/creative-work.ts \
  app/src/server/repositories/creative-work.ts \
  app/src/server/brand-training/calibration.ts \
  app/src/server/application/select-creative-work-output.ts \
  app/src/lib/creative-work-selection-policy.ts \
  'app/src/app/api/creative-work/[id]/outputs/[outputId]/select/route.ts' \
  app/src/components/creative-work/CreativeResultCard.tsx \
  app/src/components/brand-training/BrandCalibrationReview.tsx \
  app/messages/pt-BR.json \
  app/messages/en.json \
  app/src/server/creative-work/person-fidelity.test.ts \
  app/src/server/generation/pipeline/post-generation.test.ts \
  app/src/server/jobs/creative-work.test.ts \
  app/src/server/repositories/creative-work.test.ts \
  app/src/server/brand-training/calibration.test.ts \
  app/src/server/application/select-creative-work-output.test.ts \
  app/src/lib/creative-work-selection-policy.test.ts \
  'app/src/app/api/creative-work/[id]/outputs/[outputId]/select/route.test.ts' \
  app/src/components/creative-work/CreativeResultCard.test.tsx \
  app/src/components/brand-training/BrandCalibrationReview.test.tsx
git commit -m "feat: brand training pessoas task 3"
```

