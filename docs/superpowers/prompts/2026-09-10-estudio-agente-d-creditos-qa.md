# Agente D — Créditos e QA da integração

Copie este documento como prompt da sessão executora D depois de o coordenador preparar a base comum.

**Worktree:** `/Users/jhonatan/Repos/ADScale_2/.worktrees/estudio-creditos-qa`
**Branch:** `codex/estudio-creditos-qa`
**Objetivo:** tornar créditos auditáveis e produzir a prova da aplicação combinada, sem chamadas pagas.

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

1. Plano `2026-09-10-estudio-confiabilidade-creditos.md`: tarefas4–6.
2. Plano `2026-09-10-peca-unica-qualidade.md`: tarefa4, incluindo qualidade nos logs do provider E2E e protocolo da comparação humana.
3. Plano `2026-09-10-estudio-peca-na-caixa.md`: tarefa7 e testes E2E das tarefas anteriores.

## Arquivos sob sua propriedade

- `app/src/server/repositories/credit-transactions.ts`.
- `app/src/server/billing/credits.ts` e teste; não mudar política/entitlements/preços.
- `app/src/app/api/billing/history/route.ts`/teste e `status/route.ts`/teste.
- `app/src/lib/hooks/use-billing.ts`/teste.
- `app/src/components/settings/CreditHistoryTab.tsx`, novo teste; BillingTab.tsx/teste.
- `app/src/components/layout/AppSidebar.tsx`/teste, exclusivamente saldo/ilimitado.
- `app/src/server/ai/providers/e2e-controlled-provider.ts`/teste.
- `app/tests/e2e/create-post.spec.ts`, first-studio-piece.spec.ts, layer-editor.spec.ts, creative-work-carousel.spec.ts; cenários financeiros no create-post.spec.ts e helpers withDb existentes.
- Evidências `docs/evidence/2026-09-10-estudio-creditos-qa.md`, `2026-09-10-estudio-peca-na-caixa.md`, `2026-09-10-peca-unica-qualidade.md`.

Não editar módulos de motor/revisão/hooks criativos/caixa, schema/migrações ou messagesJSON. C é dono das traduções; envie bloco com caminho de chave e valores exatos PT/EN ao coordenador/C. Não corrigir a implementação de outro agente durante QA: entregue repro/teste e devolva ao autor.

## Primeiro marco independente: créditos

Faça resumo e tabela usarem o mesmo filtro; média usa campanhas distintas no mesmo recorte; saldo atual usa autoridade canônica. Datas ISO completas, allTime sem corte2020 e últimos3meses incluindo atual+2. Labels humanos em SelectValue; não mexer no Select global.

Status ganha `billing.access.unlimited:boolean` calculado por workspaceHasUnlimitedBillingAccess, sem inferir por sentinel/label/role. Sidebar e configurações exibem Ilimitado quando aplicável. Uso ilimitado já está em usage_events com amount0; não inventar débito/refund financeiro. Esclarecer que a tabela é movimentação de créditos.

Mover insert de credit_transactions para a mesma transação do débito/refund, mantendo replay/locks e sem backfill. Falha de ledger deve rejeitar e reverter, não desaparecer em catch. Executar créditos unitários/route/hook/componentes antes de integrar.

## Segundo marco: QA após base combinada

Você pode preparar fixtures/casos e a extensão quality da evidence enquanto A/B/C trabalham. Para E2E real, aguarde SHA integrado fornecido pelo coordenador e incorpore esse commit. Não rodar contra branch parcial chamando a geração de produção como fallback.

Matrix obrigatória: peça→plano→fila→pronta→nota→revisão→variação→adaptação→reload no mesmo work; pai intacto; replay e duas abas; sem cobrança ao abrir camadas; carrossel salva e mostra erro; restyle não confunde análise com falta; seleção manual1→1; formato auto4:5; ledger/saldo/datas/ilimitado/rollback. Snapshot antigo conserva comportamento. Provider integrado: qualityhigh,1 chamada inicial, nenhuma autocorreção, retry técnico confirmado no máximo2.

## Comandos e entrega

Em app/:
```bash
npm test -- src/server/billing/credits.test.ts src/app/api/billing/history/route.test.ts src/app/api/billing/status/route.test.ts src/lib/hooks/use-billing.test.tsx src/components/settings/CreditHistoryTab.test.tsx src/components/settings/BillingTab.test.tsx src/components/layout/AppSidebar.test.tsx src/server/ai/providers/e2e-controlled-provider.test.ts
npm run typecheck
npx playwright test tests/e2e/first-studio-piece.spec.ts tests/e2e/create-post.spec.ts tests/e2e/creative-work-carousel.spec.ts tests/e2e/layer-editor.spec.ts --project=serial-flows
```

Execute os casos financeiros incluídos em create-post.spec.ts. Verifique app+worker+DB+storage controlados antes dos E2E, fixtures de workspace isoladas e rollback real. Capturar screenshots dos três viewports. Relatar número de testes efetivamente executados, skips e bloqueios; “comando verde” com nenhum caso não vale.

Prepare3briefsCenbrap reais com anexos iguais por par, hash,latência/custo a registrar e avaliação cega. Deixar status not_run até autorização concreta de6gerações; não declarar qualidade humana a partir do PNG determinístico.

Entregue primeiro commit de créditos para merge. Depois entregue commits de QA e evidência após integração. O coordenador faz o aceite final, decide publicação com o usuário e preserva limitações de escopo.
