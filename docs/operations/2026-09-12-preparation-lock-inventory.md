# Inventário classificado dos chamadores do lock de preparação

**SHA de execução consultado:** `b2ee6511a6739e92bb074874078fe0acd88b608f`
**`origin/main` no momento da leitura:** `b774999480d050ca98fdd33fe422135fb2bc0a05` (avançou — **não** usada; todas as referências abaixo são do SHA de execução, lidas via `git show`/`git grep` contra `b2ee6511` no próprio worktree).
**Branch/worktree:** `reliability/task-07-lock-inventory`, HEAD `485a7f57` limpo.
**Protocolo do lock:** `withCreativeWorkPreparationLock` (`app/src/server/repositories/creative-work.ts:808-818` em `b2ee6511`) abre `db.transaction` e só então executa `pg_advisory_xact_lock`; o callback roda dentro da transação. Uma chamada externa dentro do callback segura uma conexão do pool (`max: 10` por processo) durante a espera.

## Comandos executados

```bash
git cat-file -t b2ee6511a6739e92bb074874078fe0acd88b608f   # -> commit (objetos disponíveis no worktree)
git rev-parse origin/main                                  # -> b7749994 (avançou; não usada)
git grep -n 'withCreativeWorkPreparationLock' b2ee6511 -- app/src
git grep -n -E 'fetch\(|openai|OpenAI|requestPlannerResponse|generateSocialPostCopy|reviewInferredBriefingOnce|objectStorage\.' b2ee6511 -- app/src/server/creative-work app/src/server/application
git grep -n -E 'fetch\(|objectStorage|getOpenAI|chat\.completions|requestPlannerResponse|axios|node-fetch|undici' b2ee6511 -- <14 arquivos transitivos>
git grep -n -E 'import\(|require\(' b2ee6511 -- <14 arquivos transitivos>   # só posições de tipo; ver nota
```

Para cada um dos 3 arquivos de aplicação, todos os `await` foram enumerados e cada alvo foi lido até a fonte de I/O. `app/src/server/repositories/creative-work.ts` difere entre `b2ee6511` e o HEAD do worktree (mudanças PR-01 já aplicadas no worktree); os demais arquivos citados são byte-idênticos nas duas revisões — as linhas citadas são sempre as de `b2ee6511`.

**Nota metodológica:** zero resultados de grep não prova ausência de import dinâmico. A única ocorrência do padrão `import(` nos arquivos transitivos são posições de tipo (`contracts.ts:303,315,320,579,604`), apagadas em compilação — nenhum `import()` dinâmico em tempo de execução foi encontrado nos caminhos lidos.

## Tabela definitiva — chamador → classificação

| # | Chamador | Arquivo:linha da chamada | Chamada externa direta | Chamada externa transitiva (função, arquivo:linha) | Escrita curta | Reserva | Decisão |
|---|---|---|---|---|---|---|---|
| 1 | `mutateCreativeWorkPieceReference` (def. 671) | `repositories/creative-work.ts:680` | nenhuma | nenhuma — `editableCreativeWork` (`:508`, `tx.select` + CAS) e `tx.update/delete` são só banco | sim (mutação de fonte + invalidação) | não | **conserva transação curta** |
| 2 | `mutateCreativeWorkDraftSource` (def. 1029) | `repositories/creative-work.ts:1038` | nenhuma | nenhuma — `editableCreativeWork` (`:508`) e `tx.update/delete` são só banco | sim (mutação de fonte draft + invalidação) | não | **conserva transação curta** |
| 3 | `reservePreparedCreativeWorkOutputsIfCurrent` (def. 1447) | `repositories/creative-work.ts:1453` | nenhuma | nenhuma — `getCreativeWork` (`:832`, 3× `select`) e `createPlannedCreativeWorkOutputs` (`:1398`, `select`/`insert`) são só banco | não (só reserva condicional) | sim | **conserva transação curta** |
| 4 | `reserveCreativeWorkGenerationOutputs` (def. 1474) | `repositories/creative-work.ts:1482` | nenhuma | nenhuma — `getCreativeWork` (`:832`), `tx.update` CAS e `createPlannedCreativeWorkOutputs` (`:1398`) são só banco | não (confirmação + reserva) | sim | **conserva transação curta** |
| 5 | `planCarouselWork` — ramo `approve_script`/`approve_cover` | `application/plan-carousel-work.ts:95` | nenhuma | nenhuma — `authorizeSnapshot` (`:127`: `getCreativeWork` `:137` + `getBrandKit` `:164` + fact-pack puro) e `approveScript` (`:312`) / `approveCover` (`:347`, lê `listCurrentCarouselSlides` `creative-work-carousel.ts:41`, só banco) persistem via `writeSettings` → CAS `updateCreativeWorkIfUnchanged` (`creative-work.ts:788`) | sim (aprovação editorial) | não | **conserva transação curta** |
| 6 | `planCarouselWork` — ramo `select_hook` | `application/plan-carousel-work.ts:105` | nenhuma | nenhuma — `authorizeSnapshot` (`:127`, só banco, ver #5) + `persistHookSelection` (`:237` → `writeSettings` `:250` → CAS draft `creative-work.ts:766`); `proposeSelectedScript` → `proposeCarouselDraft` (`:289`) roda **fora** do lock | sim (seleção de hook) | não | **conserva transação curta** |
| 7 | `planCarouselWork` — `authorizeSnapshot` dos demais ramos | `application/plan-carousel-work.ts:114` | nenhuma | nenhuma — `getCreativeWork` (`:137`), `getBrandKit` (`brand-kit.ts:119`, só `select`) e `buildCreativeWorkFactPack` (puro, síncrono); `researchCarousel` (`:192`), `proposeCarouselHooks` (`:218`), `proposeCarouselDraft` (`:289`) rodam **fora** do lock | não | não | **conserva transação curta** (leitura curta) |
| 8 | `prepareCarouselWork` | `application/prepare-carousel-work.ts:109` | nenhuma | nenhuma — `getCreativeWork` (`:110`), CAS `:245`/`:407`, `getBrandKit` (`:275`), `getCreativeWorkSourceAssetDetails` (`:323` → `creative-work.ts:872`, só `select`), `buildCarouselVisualContract` (`:316` → `carousel-visual.ts:217`, síncrona e pura) e `createIdentitySnapshot` (`:305` → `identity.ts:427`: só leituras banco — `getApprovedTrainingReferences`/`getRejectedTrainingReferences` `client-reference.ts:394/428`, `workspaceAssets` via `db` `identity.ts:197`, `getActiveBrandKnowledgeVersion` `brand-knowledge.ts:216`, `getBrandKit` `identity.ts:499` — mais ranking/formatação puros) | sim (snapshot + contrato + deck) | não | **conserva transação curta** |
| 9 | `prepareCreativeWork` | `application/prepare-creative-work.ts:136` | **sim ×2** — `reviewInferredBriefingOnce` (`:364`) e `generateSocialPostCopy` (`:466`) | `reviewInferredBriefingOnce` → `getOpenAI().chat.completions.create` (`creative-work/briefing-review.ts:101`); `generateSocialPostCopy` → `requestCopy` → `getOpenAI().chat.completions.create` (`creative-work/copy.ts:158`); persistência via `updateCreativeWorkDraftIfUnchanged` (`:486` → `creative-work.ts:766`) | sim, mas **após** espera externa | não | **migra para tentativa** (Task 15) |

## Conclusões para as Tasks 13, 15 e 16

- **8 dos 9 chamadores conservam a transação curta**: nenhum I/O externo direto ou transitivo; apenas `select`/`insert`/`update`/`delete` via executor (ou `db` global nas leituras de `createIdentitySnapshot`, ainda assim só Postgres) e computação pura síncrona. Não transformar nenhum deles em job.
- **Somente `prepareCreativeWork` migra para o protocolo de tentativa persistida** (Task 15): duas chamadas de modelo dentro da transação (`:364`, `:466`).
- **Task 16 (carrossel):** `planCarouselWork` já roda pesquisa/planejador fora do lock (linhas 192/218/289, após liberar em 95/105/114); `prepareCarouselWork` não faz I/O externo. O guard atual contra resultado velho é o CAS de `expectedUpdatedAt`, não tentativa persistida — é só isso que a Task 16 avalia.
- `objectStorage` (que conta como externa) aparece apenas em arquivos fora dos callbacks do lock (`advance-carousel-generation.ts`, `manage/publish-creative-work-layer-editor.ts`, `export-carousel-work.ts`, `ensure-creative-work-output-library.ts`, `analyze-creative-work-source.ts`, entre outros) — nenhum caminho sob o lock a alcança.

## Decisões da Task 16 (PR-05), registradas em 12/09/2026

**`prepareCarouselWork` conserva a transação curta — nada mudou.** A releitura confirmou o que a tabela já dizia: todos os `await` do callback do lock são de banco. Pelo critério do plano, um caller sem I/O externo não vira tentativa.

**`planCarouselWork` ganhou deduplicação, não proteção contra resultado velho.** A proteção já existia e é de duas camadas: `persistEditorial` relê o Trabalho e recusa, e `writeSettings` persiste por `updateCreativeWork*IfUnchanged` com CAS em `snapshot.work.updatedAt` — o parâmetro `cas: "draft" | "any"` só escolhe se o status precisa ser `draft`, **nunca desliga a comparação de revisão**.

O que faltava era o gasto, não a escrita. Medido: duas requisições iguais concorrentes faziam **2** chamadas de pesquisa ao provedor; com `claimPreparationAttempt` devolvendo `joined`, passaram a fazer **1**. `persistEditorial`, `writeSettings` e as três transações curtas ficaram intocadas.


**Revisão de 13/09/2026:** o wrapper finaliza também quando `run()` lança, usando
`finally`, estado `failed` e propagação da exceção após o cleanup. O finalize e
seu log de recusa são compartilhados com o caminho normal. `currentRevision`
continua sendo o snapshot: a tentativa é dedupe + lifecycle/auditoria; a
revalidação da escrita permanece em `persistEditorial` e no CAS do repositório.
O controle negativo confirmou que retirar apenas a releitura mantém o teste
verde; retirar também o predicado de revisão de
`updateCreativeWorkDraftIfUnchanged` torna o teste vermelho. `cas: "any"` não
servia como bypass. Fixture de bump cru e guards originais preservados.

## Divergências registradas

- O aceite da Task 7 no plano diz "sete chamadores", mas a reconfirmação no SHA de execução encontra **9 call sites em produção** — exatamente os 9 da tabela "Corrigido" das Descobertas do plano, sem deslocamento de linha. A contagem 9 é a correta; o "sete" é texto desatualizado do aceite.
- Nenhuma outra divergência: todas as classificações das Descobertas foram confirmadas pela leitura direta, incluindo as três funções antes não resolvidas (`createIdentitySnapshot`, `buildCarouselVisualContract`, `getCreativeWorkSourceAssetDetails` — todas sem I/O externo).
