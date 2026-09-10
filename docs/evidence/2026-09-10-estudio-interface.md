# Estúdio — Entrega C (interface contida e fluxos confiáveis)

Data: 2026-09-10. Branch `codex/estudio-interface`, worktree `.worktrees/estudio-interface`. Este relatório cobre a entrega local do Agente C; a aplicação integrada, o runtime compartilhado e a validação visual final pertencem ao coordenador.

## Base e SHAs

- **BASE_COMUM oficial:** `3063ff4a8c8bad1091d2876a070314e7653c922a` (incorporada por merge, na ancestry; cópias untracked do bundle foram conferidas byte a byte e movidas para `.worktrees/bundle-backup-estudio-interface/` antes do merge — nenhma divergiu do conteúdo da base; as divergências pós-merge em `fechamento-quatro-agentes.md` e `peca-unica-qualidade.md` são o delta de coordenação esperado).
- Base de código original: `ac38a30e`.
- **SHA final entregue: `31cd293a2e55dc09220841ffd0c3d3505a9f9a1d`.**
- Merges de contratos/hooks aprovados, preservando ancestry: `67b1547d` (candidato B e38b5307+be4451bc, depois supersedido), `61720be8` em `f7ac3933` (B1/B2/R1 liberados + helper de D), `96da1a89` em `6717e888` (hooks carrossel/restyle/direções aprovados).
- Commits principais próprios: `a986aa8a` (geometria/popover/canvas), `1b5be14d` (extração LayerEditorContent), `3f88c3c0` (useOutputReview + mutações), `bfd0db72` (caixa contida), `494f0a38` (chaves financeiras de D), `b149b5eb` (resíduos rodada 1), `66a0d53d` (flush gates/seleção estável), `b14faea6` (sessões de save por operação), `8395e4fa` (debounce entre peças + R1 cliente), `0610aa35` (caixa no palco), `e97a042f` (flush antes de trocas + contexto do filho falho), `4b194627` (guard de navegação + seed legado), `0129ef9e` (single sempre prepara + borda + rotas), `dd9554ef` (hints por fonte + exitRef), `31cd293a` (guard de download de fila + hideAttach + handle só-registro).

## Tarefas concluídas e critérios

- **Plano de experiência, tarefas 3–6** (tarefa 7 é de D): controlador `useOutputReview` com autosave com CAS próprio, revisão congelada, confirmação idempotente, reconciliação de envio incerto (segue a filha pelo `revisionContext`, mesma `revisionKey` em retry), 402 preserva plano, falha terminal exige rascunho novo; caixa contida aprovada (`StudioPieceWorkspace`: imagem protagonista, miniaturas 34px/alvo 44px junto à arte, seleção por `aria-pressed` que não aprova, comparação com ancestral, fila/falha com base visível, pinos de comentário sobre a arte renderizada, popover nativo de proporções ancorado ao botão, retry técnico com confirmação de custo, camadas inline via `LayerEditorContent` sem chamar Layerize ao abrir); rota `/creative-work/[id]` redireciona Peça única para `/?workId=…&compose=1`, demais intents permanecem na superfície antiga.
- **Plano de confiabilidade, tarefas 1–2 (partes que permaneceram com C)**: `canGenerate` real no TalkBox (preparação/saving nunca aparece como "Na fila"; fila vem só de output/slide do servidor), estados de restyle por fonte (original/style ausente/analyzing/failed com retry na fonte correta), proteção de escolhas e guardas de flush antes de trocar peça. Carrossel (`useCarouselComposer`), direções (`useComposerDirectionSuggestions`) e `useComposerActions`/`PlanActions` seguiram para o agente de hooks conforme divisão final — não alterados após a divisão.
- **Link sem origem**: `CreativeWorkResumeSurface` aponta "Nova variação" de Peça única para `/?workId=<id>&compose=1` (retomada da base na caixa, sem `fresh=1`); demais intents conservam o link antigo.
- **R1 (parte C)**: polling continua para output `completed` com `failureCode = objective_quality_failed_refund_pending` e para após a liquidação; preview permanece, escolha segue bloqueada pela política de QA, nota "compensação pendente" sem afirmar estorno (chaves exatas de D incorporadas: `creditHistory.unlimited/unlimitedHint/movementsNote`, `billing.account.financial.unlimited`, `navigation.unlimited`, mais as chaves de interface novas).

## Arquivos alterados (somente ownership C)

`app/src/components/creative-work/`: `useOutputReview.ts(x)`, `StudioPieceWorkspace.tsx(x)`, `studio-piece-workspace.module.css`, `PieceReviewCanvas.tsx(x)`, `PieceFormatPopover.tsx(x)`, `piece-review-geometry.ts(x)`, `composer-outputs.ts(x)`, `CreativeResultCard.tsx(x)`, `CreativeComposer.tsx`, `CreativeWorkResumeSurface.tsx`, `layer-editor/LayerEditorContent.tsx`, `layer-editor/LayerEditorDialog.tsx(x)`, `useCreativeComposer.ts` (apenas `revisionCreditCost`), `use-creative-work` em `app/src/lib/hooks/` (mutações novas, projeções reviewDraft/revisionContext/revisionCreditCost, polling R1). `app/src/components/dashboard/DashboardHomeActions.tsx(x)`, `studio-stage/BrandStageHome.tsx`, `studio-stage/TalkBox.tsx`, `quick-tools/create-post/CreativeProposalGrid.tsx` (helpers de linhagem extraídos), `app/messages/pt-BR.json`, `app/messages/en.json`, `app/src/app/(dashboard)/creative-work/[id]/page.tsx` + `page.test.tsx` novos.

## Comandos e resultados

- `npx vitest run --maxWorkers=2 --config config/vitest.config.ts src/components/creative-work/ src/components/dashboard/ src/lib/hooks/use-creative-work.test.tsx 'src/app/(dashboard)/creative-work/[id]/page.test.tsx'` → **46 arquivos, 654 testes passando**.
- `npm run typecheck` → exit 0.
- ESLint dos arquivos tocados → 0 erros (avisos `no-img-element` com disables existentes e avisos pré-existentes em arquivos de outros donos).
- Histórico de revisões incorporadas: 4 devolutivas de C (hooks/geometria, resíduos 5, sessões de save, entradas) — cada uma com testes de regressão novos (fresh mount, save adiado entre peças com CAS por sessão, falha de autosave antes de trocar, debounce consumido na chave nova, seed/retomada do contexto do filho falho incl. legado por `revisionInstruction`/`revisionAssetId`, scanner fecha sem flush inexistente, readOnly inerte, `exitRef` espiado no evento, guard de download 409 para fila).

## Contratos consumidos

B: PATCH `saveOutputReview` (draft/revisionKey/revisionCreditCost), POST `reviewed_revision` (202 `{output}`), GET com `reviewDraft`/`revisionContext`/`revisionCreditCost`; R1: marcador `objective_quality_failed_refund_pending` (mesma string canônica de B), helper/liquidação de B e D; A: contexto de revisão no job. Nenhum contrato novo foi criado no cliente além do documentado.

## Pedidos e limitações

- Runtime validado pelo root (retry/direções 2/2 passaram com `dd9554ef` integrado); a UI final no browser depende da integração — os screenshots de login feitos localmente foram descartados e **não** constituem evidência da caixa.
- Teste flaky pré-existente, fora do meu escopo de origem: `LayerEditorDialog.test "generic heartbeat failure"` (corrida de foco do diálogo Base UI sob carga) — falha intermitente em execução de arquivo cheio, passa isolado; reproduz também no código anterior às minhas mudanças.
- Inspeção visual comparativa com o protótipo aprovado fica para o root com a conta sintética; os três viewports alvo continuam 390×844, 1045×586, 1440×900.
- `graphify update .` não foi rodado neste worktree (coordenador roda uma vez na integração, evitando dumps de quatro branches no diff).
- **Produção/chamadas pagas: não executadas. Nenhum servidor, banco, seed ou navegador usado após a instrução; o pkill global anterior derrubou o Next do root (71874) além dos meus processos — registrado como incidente, root já foi avisado e restaurou.**
