# Calibração e ativação da marca Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calibrar cada treinamento com quatro exemplos por rodada e ativar somente a candidata validada.

**Architecture:** Guardar candidatas em sessões, sem sobrecarregar o status de versões publicadas. Vincular cada exemplo a um Creative Work privado da sessão; congelar identidade completa antes de gerar e publicar o mesmo hash aprovado.

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

## Mapa de arquivos

Criar:
- `app/src/server/brand-training/calibration.ts` e `.test.ts`: contratos, limites, hash e condição de ativação.
- `app/src/server/repositories/brand-training-sessions.ts` e `.test.ts`: sessões, CAS, associação de exemplos e autorização por perfil.
- `app/src/server/application/calibrate-brand-training.ts` e `.test.ts`: preparação e despacho dos quatro exemplos.
- `app/src/app/api/client-profiles/[id]/brand-knowledge/calibration/route.ts` e `.test.ts`: comandos e leitura da sessão.
- `app/src/components/brand-training/BrandCalibrationReview.tsx` e `.test.tsx`: quatro exemplos, feedback, custo e próxima ação.
- `app/drizzle/0097_brand_training_sessions.sql`, `app/drizzle/meta/0097_snapshot.json`: migração gerada na execução.

Modificar:
- `app/src/server/db/schema.ts`, `app/drizzle/meta/_journal.json`: sessões e vínculo de trabalhos, snapshot publicado v2.
- `app/src/server/brand-knowledge/version-compiler.ts`, `app/src/server/repositories/brand-knowledge.ts` e testes: publicar snapshot validado.
- `app/src/server/creative-work/identity.ts`, `identity-policy.ts`, `contracts.ts` e testes: leitura v1/v2 e identidade efetiva congelada.
- `app/src/server/application/prepare-creative-work.ts`, `generate-creative-work.ts` e testes: candidata confiável em preparação e reserva.
- `app/src/server/repositories/creative-work.ts` e testes: criação idempotente, privacidade das listagens e bloqueio de mutação de exemplos.
- `app/src/app/api/client-profiles/[id]/brand-knowledge/publish/route.ts`, `brand-knowledge/route.ts`, `training-status/route.ts` e testes: prova de calibração e estado real.
- `app/src/lib/hooks/use-brand-training.ts`, `app/src/components/brand-training/BrandKnowledgeReview.tsx` e testes: integração na superfície já montada.

As abreviações `brand-knowledge/route.ts` e `training-status/route.ts` acima referem-se a `app/src/app/api/client-profiles/[id]/brand-knowledge/route.ts` e `app/src/app/api/client-profiles/[id]/training-status/route.ts`. Migração 0097 é o próximo índice observado; se a base avançar, regenerar com próximo índice, nunca sobrescrever outra migração.

## Mapa exato dos testes

- Criar: `app/src/app/api/client-profiles/[id]/brand-knowledge/calibration/route.test.ts`.
- Estender: `app/src/app/api/client-profiles/[id]/brand-knowledge/publish/route.test.ts`.
- Estender: `app/src/app/api/client-profiles/[id]/brand-knowledge/route.test.ts`.
- Estender: `app/src/app/api/client-profiles/[id]/training-status/route.test.ts`.
- Criar: `app/src/components/brand-training/BrandCalibrationReview.test.tsx`.
- Estender: `app/src/components/brand-training/BrandKnowledgeReview.test.tsx`.
- Criar: `app/src/server/application/calibrate-brand-training.test.ts`.
- Estender: `app/src/server/application/generate-creative-work.test.ts`.
- Estender: `app/src/server/application/prepare-creative-work.test.ts`.
- Estender: `app/src/server/brand-knowledge/version-compiler.test.ts`.
- Criar: `app/src/server/brand-training/calibration.test.ts`.
- Estender: `app/src/server/creative-work/contracts.test.ts`.
- Estender: `app/src/server/creative-work/identity-policy.test.ts`.
- Estender: `app/src/server/creative-work/identity.test.ts`.
- Estender: `app/src/server/repositories/brand-knowledge.test.ts`.
- Criar: `app/src/server/repositories/brand-training-sessions.test.ts`.
- Estender: `app/src/server/repositories/creative-work.test.ts`.

### T1: Estado, congelamento e limites

**Files:** Criar `calibration.ts`, `calibration.test.ts`, `brand-training-sessions.ts`, `brand-training-sessions.test.ts`; modificar schema e artefatos Drizzle listados no mapa.

**Interfaces:** Exportar de `calibration.ts` os tipos e funções abaixo. `Candidate` usa `BrandKnowledgeVersionSnapshot` do compilador e `CreativeWorkIdentitySnapshot` de `creative-work/contracts.ts`. `freezeCandidate` recebe identidade já carregada pelo servidor; nunca JSON arbitrário de uma requisição.

- [ ] Escrever o primeiro teste em `calibration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canActivate, nextRoundNumber } from "./calibration";
it("não aprova hash diferente nem abre quarta rodada implicitamente", () => {
  const slots = Array.from({ length: 4 }, () => ({
    status: "completed" as const, objective: "pass" as const,
    rating: "good" as const, needsHumanReview: false,
  }));
  expect(canActivate("candidate-a", { candidateHash: "candidate-b", slots })).toBe(false);
  expect(nextRoundNumber(3, 0)).toBeNull();
  expect(nextRoundNumber(3, 1)).toBe(4);
});
```

- [ ] Rodar `cd app && npm test -- src/server/brand-training/calibration.test.ts`; esperar FAIL por módulo/exports ausentes.
- [ ] Implementar contratos puros e esquema Zod estrito equivalente, sem aceitar datas inválidas, arrays ilimitados ou hashes não hexadecimais na API:

```ts
export type Candidate = {
  hash: string;
  knowledge: BrandKnowledgeVersionSnapshot;
  identity: Omit<CreativeWorkIdentitySnapshot, "brandKnowledge">;
  evidenceHashes: Record<string, string>;
};
export type SlotAssessment = {
  status: "queued" | "processing" | "completed" | "failed";
  objective: "pass" | "fail" | "inconclusive";
  rating: "good" | "bad" | null;
  needsHumanReview: boolean;
};
export function nextRoundNumber(completedRounds: number, extensions: number): number | null {
  return completedRounds < 3 + extensions ? completedRounds + 1 : null;
}
export function canActivate(hash: string, round: {
  candidateHash: string; slots: SlotAssessment[];
}): boolean {
  return hash === round.candidateHash && round.slots.length === 4 &&
    round.slots.every(s => s.status === "completed" && s.objective !== "fail" &&
      s.rating === "good" && !s.needsHumanReview);
}
export function freezeCandidate(input: Omit<Candidate, "hash">): Candidate {
  return { ...input, hash: createHash("sha256")
    .update(canonicalJsonStringify(input)).digest("hex") };
}
```

Imports: `createHash` de `node:crypto`, `canonicalJsonStringify` existente. Antes de hash, estabilizar `compiledAt`/`confirmedAt` na criação da candidata; não regenerar datas na consulta/ativação. `evidenceHashes` inclui SHA de todos os assets e fontes usados, além das evidências das claims.

- [ ] Adicionar ao schema `brandTrainingSessions`: UUID id, workspaceId, clientProfileId, createdByUserId, baseVersionId nullable, revision integer default 0, status `review|calibrating|pending|activated|archived`, candidate JSON Candidate, rounds JSON `CalibrationRound[]` default [], extensionCount integer default 0, activatedVersionId nullable, createdAt/updatedAt. FK composta workspace/perfil validada no repositório; índices por workspace/perfil e único parcial para uma sessão não arquivada/não ativada por perfil. Não serializar bytes/URLs assinadas dentro do JSON.

`CalibrationRound` em `calibration.ts`: `{ number:number; candidate:Candidate; quoteCredits:number; confirmedBy:string; confirmedAt:string; coverage:string[]; slots: { index:0|1|2|3; workItemId:string; outputId:string|null; feedback:{rating:"good"|"bad";note:string;dimensions:string[];actorId:string;at:string}|null }[] }`. Limites de note 2000, dimensions 8 itens de 80, coverage 12 itens de 100; exatamente quatro slots. Estados/qualidade das saídas vêm do banco, não do navegador.

- [ ] Adicionar `trainingSessionId` nullable FK, `trainingRound` nullable integer e `trainingSlot` nullable integer a creativeWorkItems. CHECK todos nulos ou todos preenchidos, round>0, slot 0..3; índice único `(trainingSessionId,trainingRound,trainingSlot)`. Esses campos não entram no schema público de draft/autosave.
- [ ] Implementar em `brand-training-sessions.ts` as funções: `getTrainingSession(workspaceId:string, profileId:string):Promise<TrainingSession|null>`; `createTrainingSession(input:{workspaceId:string;profileId:string;userId:string;candidate:Candidate;baseVersionId:string|null}):Promise<TrainingSession>`; `mutateTrainingSession(input:{workspaceId:string;profileId:string;sessionId:string;expectedRevision:number;command:SessionCommand}):Promise<TrainingSession>`. Exportar `TrainingSession` inferido do schema; `SessionCommand` discriminado `feedback|replace_candidate|extend|archive`, com ator vindo da sessão autenticada. Retornar erros `not_found`, `stale_session`, `round_running`, `round_limit`, `invalid_feedback`. Lock transacional por workspace/perfil e `revision=expectedRevision` no UPDATE; incrementar revision. Não fazer chamadas de modelo dentro da transação.
- [ ] Gerar migração local com `cd app && npm run db:generate -- --name brand_training_sessions`, usando configuração local autorizada. Revisar SQL para nenhuma operação destrutiva e snapshots coerentes. Não executar `db:migrate` no ambiente configurado sem comprovar que é descartável.
- [ ] Acrescentar casos de contagem 0/2/3, extensão repetida com mesma revisão, hash alterado, três slots, falha objetiva e dúvida humana. Em teste transacional local, duas conexões tentam criar a mesma rodada: uma vence, outra retorna conflito; quatro vínculos únicos, nunca oito.
- [ ] Rodar testes focais e `npm run typecheck`; esperar PASS. Commit apenas os arquivos de T1: `git add app/src/server/brand-training/calibration.ts app/src/server/brand-training/calibration.test.ts app/src/server/repositories/brand-training-sessions.ts app/src/server/repositories/brand-training-sessions.test.ts app/src/server/db/schema.ts app/drizzle/0097_brand_training_sessions.sql app/drizzle/meta/0097_snapshot.json app/drizzle/meta/_journal.json` e `git commit -m "feat: model candidate brand calibration sessions"`.


**Arquivos exatos para revisão e commit desta tarefa:** usar somente os caminhos efetivamente alterados desta lista. Se um arquivo contiver WIP prévio, separar os hunks com `git add -p -- caminho`; não stagear o arquivo inteiro. Este comando substitui a abreviação de commit acima.

```bash
git add -- \
  app/src/server/brand-training/calibration.ts \
  app/src/server/repositories/brand-training-sessions.ts \
  app/src/server/db/schema.ts \
  app/drizzle/0097_brand_training_sessions.sql \
  app/drizzle/meta/0097_snapshot.json \
  app/drizzle/meta/_journal.json \
  app/src/server/brand-training/calibration.test.ts \
  app/src/server/repositories/brand-training-sessions.test.ts
git commit -m "feat: brand training calibracao task 1"
```

### T2: Quatro exemplos no gerador canônico

**Files:** Criar `calibrate-brand-training.ts` e teste; modificar `prepare-creative-work.ts`, `generate-creative-work.ts`, `repositories/creative-work.ts`, `creative-work/identity.ts`, `contracts.ts`, respectivos testes.

**Interfaces:** Produzir `startBrandCalibration(input:{workspaceId:string;profileId:string;sessionId:string;userId:string;expectedRevision:number;acceptedCredits:number}):Promise<{sessionId:string;round:number;workItemIds:string[]}>`; consumir `quoteCreativeWork`, `createCreativeWorkDraft`, `prepareCreativeWork`, `generateCreativeWork` existentes. Exportar `calibrationDraftKey(sessionId:string,round:number,slot:number):string` e `calibrationCredits(format:CreativeWorkFormat):number` em calibration.ts. Produzir no repositório de sessões `loadCalibrationCandidateForWork(workspaceId:string,workItemId:string):Promise<Candidate|null>` consultando vínculo persistido, perfil e slot.

- [ ] Primeiro teste:

```ts
it("cota quatro peças únicas e mantém a identidade da operação", () => {
  const one = quoteCreativeWork({intent:"single",format:"4:5",targetFormats:[]});
  expect(calibrationCredits("4:5")).toBe(4 * one.credits);
  expect(calibrationDraftKey("s", 1, 0)).toBe("brand-calibration:s:1:0");
});
```

- [ ] Rodar `cd app && npm test -- src/server/application/calibrate-brand-training.test.ts`; esperar FAIL nas funções novas.
- [ ] Implementar helpers:

```ts
export const calibrationDraftKey = (sessionId: string, round: number, slot: number) =>
  `brand-calibration:${sessionId}:${round}:${slot}`;
export const calibrationCredits = (format: CreativeWorkFormat) =>
  4 * quoteCreativeWork({ intent: "single", format, targetFormats: [] }).credits;
```

- [ ] Em `startBrandCalibration`, sob lock curto, validar revisão/estado/cotação, calcular próximo round, congelar candidata e quatro UUIDs de works, inserir todos os vínculos e a rodada na mesma transação. Use as colunas existentes de draft com intent `single`, formato `4:5`, settings `{targetFormats:[]}`, autor confirmado e draftKey determinístico. Repetição encontra os mesmos UUIDs; não aloca outra rodada. Depois da transação, preparar e gerar cada work pelos serviços existentes com `preparedRevision` retornada do work preparado. Reentrada retoma slots sem saída; os que já reservaram são reconciliados pela chave canônica existente. Uma falha de saldo pode deixar lote parcial, que a UI explicita; não iniciar rodada seguinte enquanto houver slot em processamento.
- [ ] Antes de `prepareCreativeWork` compor fact-pack/brand kit, carregar `loadCalibrationCandidateForWork`; usar seu brandKit/identidade congelados. Em `generateCreativeWork`, fazer a mesma resolução ao reservar para impedir que o reload de identidade ativa substitua a candidata. O navegador não pode fornecer candidata, hash, outputId, autoria de feedback ou campos de vínculo. Bloquear autosave, revisão manual e geração por rotas genéricas para works de calibração; o serviço de calibração é a entrada autorizada e passa contexto interno, sem boolean público de bypass.
- [ ] Usar quatro briefs factualmente neutros: apresentação institucional sem oferta; peça educativa sem afirmação técnica; convite sem data/preço; variação compositiva do primeiro briefing. Planos 02/03 substituem os contextos pelos IDs reais de linguagens/pessoas revisadas. Não inventar oferta, cargo ou qualificação da pessoa. Se não houver conteúdo factual, texto de teste explicitamente identificado como tal.
- [ ] Acrescentar teste com identidade ativa A e candidata B: os quatro works recebem B, um work normal recebe A; alterar o kit corrente após criar rodada não muda B. Testar reentrada após segundo despacho, falha de saldo e perfil alheio; no máximo quatro works e uma reserva por slot. Filtrar vínculos de calibração das listagens genéricas, inspiração, promoção de referência, galerias e métricas de produção; manter custos e telemetria operacional. Adicionar condição `isNull(creativeWorkItems.trainingSessionId)` nas consultas de descoberta, não em `getCreativeWork` usado pelo serviço.
- [ ] Rodar testes alterados e typecheck, esperar PASS. Commit allowlist dos seis módulos modificados, arquivos `.test.ts` correspondentes e novo serviço: `git commit -m "feat: generate isolated calibration examples through creative work"` após `git add` explícito de cada caminho do bloco Files; nunca diretórios inteiros.


**Arquivos exatos para revisão e commit desta tarefa:** usar somente os caminhos efetivamente alterados desta lista. Se um arquivo contiver WIP prévio, separar os hunks com `git add -p -- caminho`; não stagear o arquivo inteiro. Este comando substitui a abreviação de commit acima.

```bash
git add -- \
  app/src/server/application/calibrate-brand-training.ts \
  app/src/server/application/prepare-creative-work.ts \
  app/src/server/application/generate-creative-work.ts \
  app/src/server/repositories/creative-work.ts \
  app/src/server/creative-work/identity.ts \
  app/src/server/creative-work/contracts.ts \
  app/src/server/brand-training/calibration.ts \
  app/src/server/repositories/brand-training-sessions.ts \
  app/src/server/application/calibrate-brand-training.test.ts \
  app/src/server/application/prepare-creative-work.test.ts \
  app/src/server/application/generate-creative-work.test.ts \
  app/src/server/repositories/creative-work.test.ts \
  app/src/server/creative-work/identity.test.ts \
  app/src/server/creative-work/contracts.test.ts \
  app/src/server/brand-training/calibration.test.ts \
  app/src/server/repositories/brand-training-sessions.test.ts
git commit -m "feat: brand training calibracao task 2"
```

### T3: Revisão humana e feedback sem inferência inventada

**Files:** Criar rota calibration e BrandCalibrationReview com testes; modificar hooks, BrandKnowledgeReview, brand-knowledge GET e training-status.

**Interfaces:** GET calibration retorna `{session:TrainingSession|null, activeVersionId:string|null, quoteCredits:number, examples:{workItemId:string;outputId:string|null;previewUrl:string|null;assessment:SlotAssessment}[]}`. POST aceita união Zod `{action:"create",expectedActiveVersionId:string|null}`, `{action:"start",sessionId,expectedRevision,acceptedCredits}`, `{action:"feedback",sessionId,expectedRevision,round,slot,rating,note,dimensions}`, `{action:"extend",sessionId,expectedRevision}`, `{action:"archive",sessionId,expectedRevision}`. `sessionId` UUID; números inteiros não negativos; nota/dimensões usam limites de T1. `action:create` cria ou retoma sessão sob lock do perfil a partir das claims já revisadas e da identidade completa carregada no servidor; compara expectedActiveVersionId, devolve409 se mudou. Esse comando não gera imagens nem debita créditos. Confirmação do conjunto chama create antes de apresentar cotação/start.

- [ ] No teste da rota, reutilizar mocks de auth da rota brand-knowledge existente e adicionar:

```ts
it("rejeita a injeção de snapshot pelo cliente", () => {
  expect(calibrationCommandSchema.safeParse({
    action: "start", sessionId: "11111111-1111-4111-8111-111111111111",
    expectedRevision: 0, acceptedCredits: 4, candidate: { hash: "fake" },
  }).success).toBe(false);
});
```

Exportar `calibrationCommandSchema` de calibration.ts, não da rota Next. Rodar teste focal; esperar FAIL antes de criá-lo.
- [ ] Implementar união discriminada Zod com `.strict()` em cada variante; resolver usuário/workspace via `requireWorkspaceAccess` e perfil no servidor. Mapear invalid input400, not_found404, stale_session409, round_running409, round_limit409, quote_changed409, credit_blocked402. Todos os comandos usam expectedRevision; dupla submissão não abre extensão dupla. GET só entrega URLs assinadas para assets do perfil autenticado.
- [ ] No componente, usar estado controlado e o padrão de mutations do hook existente. Corpo mínimo da avaliação por exemplo:

```tsx
<fieldset>
  <legend>{`Exemplo ${slot + 1}`}</legend>
  <button type="button" onClick={() => onRate("good")}>Está bom</button>
  <button type="button" onClick={() => onRate("bad")}>Precisa melhorar</button>
  <label>O que precisa mudar?
    <textarea value={note} maxLength={2000}
      onChange={event => setNote(event.target.value)} />
  </label>
</fieldset>
```

`slot:number`, `note:string`, `setNote` e `onRate:(rating:"good"|"bad")=>void` são props/estado locais do item. Usar strings na infraestrutura de tradução já existente, preservando o texto PT-BR acima nos catálogos `app/messages/pt-BR.json` e `app/messages/en.json`, namespace `brandTraining.knowledge`.
- [ ] Mostrar quatro previews, versão ativa, candidata pendente, rodada n/3, custo antes de start, falhas e cobertura. Botão de ativação desabilitado por `canActivate` e estado da mutation; servidor revalida tudo. Ao teto: “Treinamento pendente” e ação “Abrir mais uma rodada”, seguida de cotação/geração explícita. Extensão não gera automaticamente.
- [ ] Gravar rating sem nota como preferência pelo output. Nota gera sugestão de alteração no plano 02; nunca aprovar regra automaticamente. Preservar aprovações anteriores como evidência, mas uma candidata nova precisa de quatro exemplos novos. A tela exibe “O que mudou” com valores antes/depois, não somente um score. Usuário pode marcar bom um QA inconclusivo genérico; identidade/anatomia inconclusiva exige confirmação específica no plano 03.
- [ ] Testar teclado, leitura dos rótulos, falha parcial, recarga de página com rodada em execução, conflito409 com refetch, teto e bloqueio de ativação. Substituir o botão antigo de publicar pelo fluxo de calibrar/ativar no BrandKnowledgeReview já montado; training-status distingue `pending_calibration` de treinamento ativo, sem inferir prontidão pela quantidade de assets.
- [ ] Rodar testes de rota e componentes modificados, esperar PASS. Commit com allowlist desses arquivos e catálogos de tradução efetivamente alterados; mensagem `feat: review brand calibration examples and feedback`.


**Arquivos exatos para revisão e commit desta tarefa:** usar somente os caminhos efetivamente alterados desta lista. Se um arquivo contiver WIP prévio, separar os hunks com `git add -p -- caminho`; não stagear o arquivo inteiro. Este comando substitui a abreviação de commit acima.

```bash
git add -- \
  'app/src/app/api/client-profiles/[id]/brand-knowledge/calibration/route.ts' \
  'app/src/app/api/client-profiles/[id]/brand-knowledge/route.ts' \
  'app/src/app/api/client-profiles/[id]/training-status/route.ts' \
  app/src/lib/hooks/use-brand-training.ts \
  app/src/components/brand-training/BrandCalibrationReview.tsx \
  app/src/components/brand-training/BrandKnowledgeReview.tsx \
  app/src/server/brand-training/calibration.ts \
  app/messages/pt-BR.json \
  app/messages/en.json \
  'app/src/app/api/client-profiles/[id]/brand-knowledge/calibration/route.test.ts' \
  'app/src/app/api/client-profiles/[id]/brand-knowledge/route.test.ts' \
  'app/src/app/api/client-profiles/[id]/training-status/route.test.ts' \
  app/src/components/brand-training/BrandCalibrationReview.test.tsx \
  app/src/components/brand-training/BrandKnowledgeReview.test.tsx \
  app/src/server/brand-training/calibration.test.ts
git commit -m "feat: brand training calibracao task 3"
```

### T4: Publicar o hash validado e impedir vazamento do rascunho

**Files:** Modificar version-compiler, repositories/brand-knowledge, publish route, identity/identity-policy/contracts e seus testes; schema do snapshot publicado.

**Interfaces:** `BrandKnowledgeVersionSnapshot` passa a união entre v1 existente e `BrandKnowledgeVersionSnapshotV2 = Omit<BrandKnowledgeVersionSnapshotV1,"schemaVersion"> & {schemaVersion:2;identity:Candidate["identity"];evidenceHashes:Record<string,string>;calibration:{sessionId:string;round:number;candidateHash:string}}`. Renomear o tipo atual para V1 sem mudar sua serialização. `publishBrandKnowledgeVersion` adiciona `sessionId:string;expectedRevision:number;candidateHash:string` ao input atual e exige prova em todos os callers.

- [ ] Estender teste do repositório:

```ts
it("não permite que uma aprovação valide outra candidata", () => {
  expect(canActivate("new", {candidateHash:"old",slots:[]})).toBe(false);
});
```

Além do teste puro, manter fixture de claims/versão existente e chamar publish sem prova: deve rejeitar `calibration_required` e manter a ativa. Rodar suite focal antes da mudança: esse caso deve falhar porque hoje publish aceita só claims aprovadas.
- [ ] Implementar na mesma transação/advisory lock já usado para publicação: carregar sessão por workspace/perfil/id, comparar revision e candidata, carregar quatro outputs persistidos, validar `canActivate`, revalidar hashes/escopo/disponibilidade das evidências e comparar baseVersionId com versão ativa. Retornar `calibration_stale` se outra sessão ativou uma versão; não sobrescrever silenciosamente. Inserir v2 a partir da candidata congelada, superseder a ativa e marcar sessão ativada atomicamente. Reentrada da mesma sessão retorna activatedVersionId. Não recompilar claims mutáveis para substituir conteúdo já validado. O campo hash da versão v2 é candidate.hash (conteúdo efetivo validado); os metadados de comprovação da calibração não alteram esse hash. Manter algoritmo v1 para versões anteriores.
- [ ] Mudar publish route para validar `{sessionId,expectedRevision,candidateHash}`; pedido antigo sem prova retorna409 `calibration_required`. Ajustar todos os callers encontrados por `rg 'publishBrandKnowledgeVersion|usePublishBrandKnowledge' app/src`. Claims continuam editáveis, mas edits não alteram ativa nem rodada congelada; construir nova candidata após revisão.
- [ ] Em identity.ts usar a identidade v2 congelada como base de seleção para works novos. v1 conserva fallback atual. Aplicar v2 em protocolos que usam marca ativa, incluindo variações; respeitar escolha explícita de identidade da fonte/restyle e preservação da arte em adaptation. A ausência de treinamento ativo no primeiro ciclo nunca deve consumir a candidata: kit legado pode continuar disponível, rotulado como não calibrado. Não atualizar snapshots de works já preparados.
- [ ] Testar concorrência real com duas ativações e uma barreira no banco local: somente uma ativa, perdedora409; testar fonte alterada, asset revogado, reentrada, primeira versão, versão anterior, mutations pós-ativação e flags single desligadas para v2. A seleção de referências de v2 usa assets congelados e valida acesso atual; não lê novos assets aprovados de sessões pendentes.
- [ ] Rodar testes de publicação, geração e identidade; typecheck; esperar PASS. Commit allowlist dos arquivos desta tarefa: `git commit -m "feat: require validated calibration for brand activation"`. Resultado aceito localmente: versão antiga durante calibração, nova somente após aprovação, sem chamadas pagas na verificação.

**Arquivos exatos para revisão e commit desta tarefa:** usar somente os caminhos efetivamente alterados desta lista. Se um arquivo contiver WIP prévio, separar os hunks com `git add -p -- caminho`; não stagear o arquivo inteiro. Este comando substitui a abreviação de commit acima.

```bash
git add -- \
  app/src/server/brand-knowledge/version-compiler.ts \
  app/src/server/repositories/brand-knowledge.ts \
  app/src/server/creative-work/identity.ts \
  app/src/server/creative-work/identity-policy.ts \
  app/src/server/creative-work/contracts.ts \
  app/src/server/db/schema.ts \
  'app/src/app/api/client-profiles/[id]/brand-knowledge/publish/route.ts' \
  app/src/lib/hooks/use-brand-training.ts \
  app/src/server/brand-knowledge/version-compiler.test.ts \
  app/src/server/repositories/brand-knowledge.test.ts \
  app/src/server/creative-work/identity.test.ts \
  app/src/server/creative-work/identity-policy.test.ts \
  app/src/server/creative-work/contracts.test.ts \
  'app/src/app/api/client-profiles/[id]/brand-knowledge/publish/route.test.ts'
git commit -m "feat: brand training calibracao task 4"
```

