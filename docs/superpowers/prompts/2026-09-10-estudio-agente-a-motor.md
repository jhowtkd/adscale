# Agente A — Motor, qualidade e formato

Copie este documento como prompt da sessão executora A depois de o coordenador preparar a base comum.

**Worktree:** `/Users/jhonatan/Repos/ADScale_2/.worktrees/estudio-motor`
**Branch:** `codex/estudio-motor`
**Objetivo:** melhorar a composição da Peça única no gerador canônico e garantir que revisão/adaptação respeite base, formato, qualidade e limite de chamadas.

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

1. Plano `2026-09-10-peca-unica-qualidade.md`: tarefas1–3, exceto as mudanças de repositório/retry test pertencentes a B. D possui a tarefa4 e a evidência do provider controlado.
2. Plano `2026-09-10-estudio-peca-na-caixa.md`: tarefa2, somente integração do job/protocolo com revisionContext/revisionAction e testes do job.
3. Plano `2026-09-10-estudio-confiabilidade-creditos.md`: tarefa3, somente helper e serviço de preparação; B entrega a projeção width/height.

## Arquivos sob sua propriedade

Em `app/src/server/creative-work/`: `contracts.ts`, `render-policy.ts` novo, `art-direction.ts` novo, `prompt.ts`, `protocol.ts`, `prepare.ts`, `brand-fidelity.ts` e respectivos testes.
Em `app/src/server/application/`: `prepare-creative-work.ts` e teste.
Em `app/src/server/jobs/`: `creative-work.ts` e teste inteiro.
Em `app/src/server/generation/pipeline/`: `execute.ts` e teste.
Em `app/src/server/ai/`: `creative-qa.ts` e teste.
Relatório: `docs/evidence/2026-09-10-estudio-motor.md`.

Não editar repositories/creative-work, schema/migrações, output-review, rotas HTTP, billing, componentes UI, provider E2E ou specs E2E. `creative-work-selection-policy.ts` conserva as regras existentes.

## Ordem e sincronização

Comece por render-policy, opções de qualidade, builders de direção/prompt e QA com mocks. Não precisa esperar B para essas unidades.

Solicite/aguarde o SHA **B1** revisado antes de conectar o job aos campos novos. O coordenador distribui esse mesmo commit por merge; não copie interfaces nem crie casts/stubs temporários. Contratos recebidos de B:

```ts
claimCreativeWorkOutputImageCall(workspaceId:string,workItemId:string,outputId:string,
  maxCalls?:1|2):Promise<CreativeWorkOutput|null>
// CreativeWorkOutput já inclui reviewDraft/revisionContext inferidos do schema.
// getCreativeWorkSourceAssetDetails inclui width/height number|null.
```

Você fornece `renderPolicy?: "integrated_v1"` no snapshot, `quality?: "medium"|"high"` nas opções do executor e `revisionAction?: "refine"|"variation"|"format"` no protocolo. O job passa `output.revisionContext?.action`, output.targetFormat e pai como primeira referência. Não altere o formato do trabalho para gerar uma filha.

High e tipografia generativa valem para novos snapshots single e seus filhos. Histórico sem marker conserva comportamento. Uma chamada por tentativa confirmada; sem autocorreção QA/requeue automático. Retry técnico sem imagem válida admite segunda chamada somente se manualRetryAttempt já foi reservado pelo backend; nunca terceira. QA fail com imagem preserva preview, bloqueia escolha e usa compensação canônica; só declare estorno após resultado confirmado.

Formato automático usa dimensões de fonte de conteúdo antes de palavras genéricas; manual vence. Brief de até120palavras organiza a composição; copy/fatos/refs não são truncados. Não enviar snapshots inteiros com storage keys ao modelo de texto.

## Aceite e comandos

Rodar em app/:
```bash
npm test -- src/server/creative-work/render-policy.test.ts src/server/creative-work/art-direction.test.ts src/server/creative-work/contracts.test.ts src/server/creative-work/prompt.test.ts src/server/creative-work/protocol.test.ts src/server/creative-work/prepare.test.ts src/server/creative-work/brand-fidelity.test.ts src/server/application/prepare-creative-work.test.ts src/server/generation/pipeline/execute.test.ts src/server/jobs/creative-work.test.ts src/server/ai/creative-qa.test.ts
npm run typecheck
```

Exigir: high chega à imagem, single nova não pede fundo sem texto, histórico estável, pai intacto,9:16 real, auto1080×1350→4:5, fallback textual explícito, uma chamada inicial, retry humano máximo2, fail não selecionável e QA indisponível inconclusive. Lint dos arquivos tocados e diff check.

Entregue a branch para revisão com SHAs e testes. Não declare vitória sobre ChatGPT a partir de provider controlado.
