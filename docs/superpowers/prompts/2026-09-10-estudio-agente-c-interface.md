# Agente C — Interface contida e fluxos confiáveis

Copie este documento como prompt da sessão executora C depois de o coordenador preparar a base comum.

**Worktree:** `/Users/jhonatan/Repos/ADScale_2/.worktrees/estudio-interface`
**Branch:** `codex/estudio-interface`
**Objetivo:** integrar a caixa aprovada e corrigir os estados silenciosos, referências e escolhas no cliente.

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

1. Plano `2026-09-10-estudio-peca-na-caixa.md`: tarefas3–6; tarefa7 é de D. Sua UI usa o backend de B e o job de A.
2. Plano `2026-09-10-estudio-confiabilidade-creditos.md`: tarefas1–2; corrigir também o link sem origem em CreativeWorkResumeSurface para os trabalhos atendidos pela nova caixa.
3. Incorporar traduções financeiras fornecidas por D. Não executar alterações de billing em nome dele.

## Arquivos sob sua propriedade

- `app/src/components/creative-work/` tocados pelos planos: novos workspace/canvas/popover/geometria/useOutputReview; useCreativeComposer, useComposerActions, useCarouselComposer, CarouselComposer, composer-prepare/state/directions/outputs, useComposerDirectionSuggestions/Hydration/SessionState, CreativeComposer, CreativeResultCard, CreativeWorkResumeSurface e seus testes.
- `app/src/components/creative-work/layer-editor/LayerEditorDialog.tsx`, novo LayerEditorContent.tsx e testes da extração; não reimplementar useLayerEditor.
- `app/src/components/dashboard/DashboardHomeActions.tsx`/teste, `studio-stage/BrandStageHome.tsx`, `TalkBox.tsx`.
- `app/src/components/quick-tools/create-post/CreativeProposalGrid.tsx`/teste, apenas extração/reuso de linhagem e prevenção de montagem concorrente.
- `app/src/lib/hooks/use-creative-work.ts`/teste; `app/src/lib/creative-work-protocol-eligibility.ts` somente se a apresentação exigir tipo sem alterar regra do par.
- `app/src/app/(dashboard)/creative-work/[id]/page.tsx` e teste.
- `app/messages/pt-BR.json`, `app/messages/en.json` inteiros sob sua autoria, incluindo chaves solicitadas por D.
- Relatório `docs/evidence/2026-09-10-estudio-interface.md`.

Não editar API/server/schema, AppSidebar/BillingTab/CreditHistoryTab, use-billing, provider controlado ou specs E2E. Sidebar conserva composição existente; D só ajusta a apresentação do saldo.

## Ordem e contratos

Comece com geometria/pinos, popover ancorado e extração do conteúdo do editor, usando fixtures apenas nos testes. Aguarde/integre SHA B1 distribuído antes de conectar hooks aos schemas e GET novos. Não criar servidor falso ou segundo composer. B2 implementa reviewed_revision; seu hook envia exatamente o contrato documentado.

A imagem domina a caixa contida; miniaturas34px com alvo44px ficam junto da arte; selecionar miniatura não aprova. Proporções1:1/4:5/9:16 abrem no botão, sem faixa extra acima. Trocar/cancelar formato conserva texto/notas. Comentários salvos pertencem ao output, sobrevivem reload e entram no plano de confirmação. Camadas reutilizam editor e leases; abrir painel não chama Layerize. Manter alternativa de teclado.

Carrossel: expor flushAutosave/resolveCanonicalWorkRevision pelo useComposerActions existente e injetar em useCarouselComposer. Salvar→revisão→plan; mostrar erro/answers sem reset. Restyle: transportar status+usage; fonte analyzing não é fonte ausente; addInspiration já anexa, reutilize-o. Fila: queued só para output/slide persistido; botão usa composer.canGenerate. Direções: pool persistido e respostas de outra identidade não substituem escolhas humanas.

Cuidado com o link antigo de Nova variação: para single, deve retomar a nova caixa com a peça base, via revisão filha. Não trocar para fresh=1. Não redirecionar ou apagar Assistente/Create post nem páginas de protocolos que ainda não foram migrados.

## Aceite e comandos

Rodar em app/ os testes existentes/novos de cada tarefa; suíte final focada:
```bash
npm test -- src/components/creative-work/useOutputReview.test.tsx src/components/creative-work/StudioPieceWorkspace.test.tsx src/components/creative-work/PieceReviewCanvas.test.tsx src/components/creative-work/PieceFormatPopover.test.tsx src/components/creative-work/piece-review-geometry.test.ts src/components/creative-work/useCreativeComposer.test.tsx src/components/creative-work/useCarouselComposer.test.tsx src/components/creative-work/CarouselComposer.test.tsx src/components/creative-work/composer-state.test.ts src/components/dashboard/DashboardHomeActions.test.tsx src/components/creative-work/CreativeComposer.test.tsx src/components/creative-work/CreativeResultCard.test.tsx src/components/creative-work/CreativeWorkResumeSurface.test.tsx src/components/quick-tools/create-post/CreativeProposalGrid.test.tsx src/lib/hooks/use-creative-work.test.tsx src/components/creative-work/layer-editor/LayerEditorDialog.test.tsx 'src/app/(dashboard)/creative-work/[id]/page.test.tsx'
npm run typecheck
```

Inspecionar visualmente390×844,1045×586,1440×900 e comparar com protótipo. Não marcar aceite integrado enquanto usar fixtures/mocks em vez das APIs reais. D roda jornada E2E depois dos merges; responda aos achados dele e do coordenador na sua branch.
