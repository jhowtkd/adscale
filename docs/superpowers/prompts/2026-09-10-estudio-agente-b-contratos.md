# Agente B — Contratos, persistência e reserva

Copie este documento como prompt da sessão executora B depois de o coordenador preparar a base comum.

**Worktree:** `/Users/jhonatan/Repos/ADScale_2/.worktrees/estudio-contratos`
**Branch:** `codex/estudio-contratos`
**Objetivo:** salvar comentários por output e confirmar revisões/adaptações no mesmo Trabalho com CAS, idempotência e settlement canônico.

## Regras comuns

Você é um dos quatro executores, não está sozinho no projeto. Trabalhe apenas no worktree atribuído e preserve todas as mudanças alheias. Não edite o checkout original nem worktrees vizinhos. Um dono por arquivo; necessidade fora do seu domínio deve ser enviada ao coordenador com símbolo, mudança e teste esperado.

Leia AGENTS.md da raiz, app/AGENTS.md e a documentação Next.js local relevante antes de mudar código. Use graphify query antes de explorar código quando houver graph.json. Reuse helpers/dependências/testes existentes. Use superpowers:executing-plans, com ciclo de teste vermelho → correção mínima → verde nas tarefas atribuídas. Não despache mais escritores sobre os mesmos arquivos.

Leia no bundle do seu worktree:
- `docs/superpowers/specs/2026-09-10-estudio-peca-na-caixa-design.md`.
- `docs/superpowers/plans/2026-09-10-estudio-fechamento-quatro-agentes.md` (precedência de escopo/ownership).
- Os planos técnicos citados na atribuição abaixo; execute só as partes atribuídas.

A referência é o protótipo contido aprovado: imagem principal, comentários na imagem, proporções junto ao botão, miniaturas pequenas e camadas acessíveis. Não voltar ao layout expandido. Os estudos são hipóteses/evidência; não apagar dados/rotas nem assumir configuração interna do ChatGPT.

Não adicionar dependências, mudar modelo/preços, acessar produção, gerar imagens/camadas pagas, publicar, enviar mensagens externas, alterar grants/entitlements reais ou aplicar migração em banco não isolado. Os contratos/schema propostos estão documentados para aprovação de execução; não inferir essa autorização da aprovação visual. Se o coordenador já registrar aprovação desses mesmos contratos, não pedir de novo.

Não rodar migrations/seeds com .env de produção. Unitários usam mocks; E2E exige provider controlado no app e worker e banco/storage isolados. Testes bloqueados não viram sucesso. Use o lockfile atual; não altere package.json/lockfile sem necessidade aprovada.

Não use git add -A, resets destrutivos, limpeza de untracked ou reescrita de história compartilhada. Commits pequenos com allowlist. Relatório final contém branch/worktree, BASE_COMUM, SHAs, arquivos, testes/comandos/resultados, limitações e pedidos entre agentes. Não mergear a própria branch na integração; o coordenador revisa e integra.

## Sua atribuição

1. Plano `2026-09-10-estudio-peca-na-caixa.md`: tarefas1–2 de backend. A possui jobs/creative-work e protocol; não os altere.
2. Plano de qualidade: extensão maxCalls do claim e testes de repositório/retry técnico da tarefa3.
3. Plano de confiabilidade: tarefa3, somente projeção das dimensões no repositório.

## Arquivos sob sua propriedade

- Novo `app/src/server/creative-work/output-review.ts` e teste.
- `app/src/server/db/schema.ts`, `app/drizzle/0095_output_review.sql` e journal; usar próximo número livre se base mudou.
- Novo `app/src/server/repositories/creative-work-output-review.ts`; todo `app/src/server/repositories/creative-work.ts` e teste.
- Novo `app/src/server/application/save-creative-work-output-review.ts` e teste; `revise-creative-work-output.ts` e teste; `retry-creative-work-output.test.ts`.
- `app/src/server/generation/settlement-adapters.ts` e teste.
- `app/src/app/api/creative-work/[id]/route.ts` e teste; `[id]/generate/route.ts` e teste.
- `CONTEXT.md`, decisão `docs/decisions/2026-09-10-estudio-peca-na-caixa.md`, relatório `docs/evidence/2026-09-10-estudio-contratos.md`.

Não editar contracts.ts/protocol/job/prepare do motor, hooks/UI, billing, traduções ou E2E. Não mudar regras financeiras de crédito; use o serviço existente.

## Primeiro marco: B1

Entregue primeiro a tarefa1 completa e testada: schemas puros, review_draft/revision_context nullable, saveOutputReview com CAS próprio, GET público e custo canônico. Inclua a assinatura compatível maxCalls e projeção width/height existentes de workspace_assets. Não aguarde a UI para publicar esse marco ao coordenador.

```ts
claimCreativeWorkOutputImageCall(workspaceId:string,workItemId:string,outputId:string,
  maxCalls:1|2=CREATIVE_WORK_MAX_IMAGE_CALLS):Promise<CreativeWorkOutput|null>
```

A e C precisam de um commit real com contratos/schema, não de uma descrição de tipos. Reporte SHA B1; coordenador revisa e distribui. Continue B2 na sua branch.

## Segundo marco: B2

POST reviewed_revision recebe somente outputId/reviewRevision/revisionKey/expectedCredits. Releia e congele contexto validado; repita CAS sob lock antes da reserva. Replay de operação existente antecede a rejeição por draft posteriormente editado. Mesmo comando retorna mesmo output; chave com outra base/contexto conflita sem cobrança.

Referência opcional pertence ao mesmo workspace. Pai permanece intacto; targetFormat da filha participa do lock, maxVersion, replay e insert. revisionInstruction contém compilação de texto/notas. Não alterar work.toolKind para produzir uma filha. A ligará revisionContext/action ao modo do job.

Save não modifica updatedAt operacional do output; usa revisão própria. Políticas antigas de revision continuam pelo mesmo serviço. Não resetar imageCallCount em retry técnico. Nada de segundo settlement.

## Aceite e comandos

Rodar em app/:
```bash
npm test -- src/server/creative-work/output-review.test.ts src/server/repositories/creative-work.test.ts src/server/application/save-creative-work-output-review.test.ts src/server/application/revise-creative-work-output.test.ts src/server/application/retry-creative-work-output.test.ts src/server/generation/settlement-adapters.test.ts 'src/app/api/creative-work/[id]/route.test.ts' 'src/app/api/creative-work/[id]/generate/route.test.ts'
npm run typecheck
```

Exigir CAS409 sem escrita/charge/dispatch, isolamento workspace, retomar draft, replay depois de editar draft, output único por chave, formato correto, crédito único e claim atômico1/2. Banco/migração real somente isolados e autorizados; D prova corridas E2E após integrar.

Entregue B1 e B2 com SHAs distintos e sua evidência. Não mexa nos testes monolíticos do job para consertar a branch de A.
