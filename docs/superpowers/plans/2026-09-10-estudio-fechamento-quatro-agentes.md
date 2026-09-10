# Estúdio — Fechamento com Quatro Agentes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para executar as tarefas atribuídas. Quatro executores trabalham em worktrees isolados; o coordenador revisa cada entrega e a integração. A divisão de propriedade deste documento prevalece sobre a ordem sequencial dos planos anteriores.

**Goal:** Entregar em um pacote integrado a caixa aprovada, a qualidade da Peça única e as correções de confiabilidade e créditos identificadas na auditoria.

**Architecture:** Quatro frentes com um dono por arquivo, sobre uma base comum. Backend entrega cedo os contratos reais; motor e interface desenvolvem unidades independentes enquanto isso. Créditos começa independente e seu agente assume a prova E2E depois da integração.

**Tech Stack:** A stack existente do ADScale: Next.js, React, TypeScript, Zod, Drizzle/Postgres, Inngest, Vitest e Playwright; git worktrees para isolamento.

**Spec:** [Especificação consolidada](../specs/2026-09-10-estudio-peca-na-caixa-design.md), incluindo a ampliação de confiabilidade ao final. Planos técnicos: [experiência](2026-09-10-estudio-peca-na-caixa.md), [qualidade](2026-09-10-peca-unica-qualidade.md), [confiabilidade e créditos](2026-09-10-estudio-confiabilidade-creditos.md).

## Global Constraints

- Preservar sidebar e composição contida; nenhuma expansão automática para ocupar a tela toda.
- Uma instância de `useCreativeComposer` por trabalho aberto; Postgres é a verdade operacional.
- Peça pronta imutável; cada alteração confirmada cria um output filho no mesmo `workItemId`. A geração inicial cria a raiz; retry técnico sem arte segue a operação canônica existente.
- Nenhuma geração, separação de camadas ou cobrança ao abrir, fechar, comentar, selecionar formato ou trocar miniatura.
- Revisar mostra base, pedido, comentários, formato e custo; somente confirmar dispara a operação.
- Não sobrescrever texto, formato ou direções escolhidos pelo usuário com sugestões da IA.
- PT-BR na superfície; mensagens novas têm tradução em `app/messages/pt-BR.json` e `app/messages/en.json`.
- Reusar dependências, hooks, autenticação, armazenamento, settlement e editor existentes; nenhuma dependência nova.
- Não alterar preços, entitlements ou provedores; custo exibido vem da constante/quote canônica do servidor.
- A elaboração inicial autorizou este plano. Para executar migrações, contratos HTTP e formatos persistidos, registrar o pedido de implementação que cobre as mudanças nomeadas; a aprovação visual sozinha não basta. Uma atribuição explícita de execução que já inclui esses contratos não exige nova confirmação dos mesmos itens. Aplicação em banco real, chamadas pagas e publicação continuam separadas.
- Testes locais com mocks ou provider controlado; chamadas pagas e publicação dependem de autorização específica.
- Um dono por arquivo em todas as branches. Worktrees não são licença para escrever quatro versões do mesmo módulo.

---

## O que os dois estudos acrescentaram

Estudos lidos: `docs/findings/2026-09-10-diagnostico-geracoes-e-caixa-dinamica.md` e o texto anexado nesta conversa em `/Users/jhonatan/.codex/attachments/9c9834ee-af84-4673-8bba-cabacf15dbaf/pasted-text.txt`. Os estudos são evidência e propostas, não substituem as decisões posteriores do usuário.

Base verificada em 10/09: `ac38a30e4611ee62d534b34a2b80579dbfe893d3`, checkout `feat/f03-commercial-offer-catalog`. Não houve execução de código ou produção nesta revisão.

| Tema | Cobertura anterior | Fechamento neste pacote |
| --- | --- | --- |
| Caixa contida, imagem principal, comentários, miniaturas, proporções e camadas | Coberto | Preservar a aprovação mais recente; agente C |
| Revisão filha no mesmo Trabalho, base automática, confirmação/custo/CAS | Coberto | B implementa backend, A consome no job, C integra a UI |
| Tipografia generativa, high, direção de arte e QA posterior | Coberto para novas Peças únicas | A; qualidade humana permanece dependente da comparação real |
| Organizar conteúdo silencioso | Fora dos dois planos | C: salvar antes de planejar, bloquear análise pendente e mostrar erro; D prova E2E |
| “Na fila” durante salvar/preparar | Parcial | C: só output/slide persistido representa fila; estados de preparação têm nomes próprios |
| Restyle com fonte em análise apresentada como ausente | Fora | C: estados/papéis reais, reaproveitar addInspiration e gate existente |
| Direções humanas após reload/resposta tardia | Só regra de preservação, sem tarefa do bug | C: proteção do pool persistido e identidade da requisição |
| Formato automático da fonte | Coberto para filha de peça; incompleto para upload | B projeta dimensões existentes; A usa geometria antes de descrição genérica |
| Nova variação no resultado antigo | Nova caixa coberta; link antigo não | C remove a derivação sem origem para os trabalhos atendidos, conservando compatibilidade dos demais |
| Histórico/saldo/créditos | Fora | D: recorte consistente, datas, ilimitado explícito e atomicidade do ledger |
| Chaves técnicas, plural e erro em inglês nas superfícies tocadas | Parcial | C e D corrigem nas superfícies desta entrega; C é dono dos dois JSONs de tradução |
| Rotas Assistente/Create post órfãs | Fora | Inventário e decisão explícita abaixo; não apagar funcionalidades por ausência de sidebar |

### Correções ao diagnóstico

- O código configura um modelo no ADScale. Isso não comprova modelo, qualidade ou prompt internos do ChatGPT. `medium` por omissão e ausência de repasse no executor foram confirmados localmente.
- Peça única tem composição determinística quando o plano escolhe fonte elegível/selecionada. Nem toda Peça única percorre esse caminho. A influência na peça auditada é hipótese até comparar evidência do output.
- Unlimited já grava `usage_events` com zero de débito e custo nominal em metadados. Não criar cobranças fictícias. O problema financeiro confirmado é a divergência de filtros/saldo e a escrita do histórico separada da transação de débito/refund.
- `addInspiration` já materializa e anexa fonte de estilo. Input file vazio não prova falta de anexo. O cliente mistura análise pendente com fonte ausente.
- O botão que mostrava “Na fila” não prova aceitação pelo backend: o mesmo texto era usado para salvar/preparar. A execução deve provar reserva/dispatch/output, sem diagnosticar job perdido pela aparência.

### Decisões de escopo que não podem ficar implícitas

1. **Layout:** vale o protótipo contido aprovado por último. Não retomar tela expandida, blur obrigatório ou reorganização da sidebar descritos no estudo anterior.
2. **Qualidade:** high fica em novas Peças únicas e filhos, com política congelada; não há reajuste de preços neste pacote. High em todos os protocolos exige avaliação de custo e decisão comercial própria.
3. **Fila:** corrigir a verdade do estado do trabalho ativo. Uma fila multitrabalho com novo pedido enquanto outro trabalho gera é uma expansão separada; não está implicitamente aprovada pelo estudo.
4. **Demais protocolos:** corrigir Carrossel/Mudar estilo/Variações nas superfícies atuais. A primeira convergência visual completa continua sendo Peça única e suas derivações; não declarar todos os protocolos migrados para o novo editor.
5. **Rotas:** Estúdio é a entrada principal. `/creative-work/:id` redireciona apenas para os tipos já atendidos. Assistente é adapter canônico documentado na ADR 0013, não código para apagar. `/assistant` e `/quick-tools/create-post` ficam como compatibilidade nesta entrega; não criar mais botões de entrada nem remover rotas sem cobrir seus consumidores. A consolidação total é residual identificado, não bug resolvido.
6. **Avaliação:** não adicionar score subjetivo bloqueante, novo enum `brand_visual_drift` ou benchmark de 20 briefs. Usar QA objetivo existente e comparação humana de 3 pares; paleta/fonte aproximadas nunca viram prova exata.
7. **Prompt:** direção visual curta não justifica eliminar fatos, regras publicadas ou restrições reais. O brief organiza estilo; o contrato factual e as referências continuam íntegros.

Assim, este pacote fecha o recorte de produto e as falhas críticas mapeadas, mas não equivale a implementar literalmente toda proposta dos dois estudos. Nenhuma limitação acima deve desaparecer do relatório final.

## Quatro agentes e propriedade dos arquivos

| Agente | Branch / worktree propostos | Instrução pronta |
| --- | --- | --- |
| A — Motor e formato | `codex/estudio-motor` / `.worktrees/estudio-motor` | [Prompt A](../prompts/2026-09-10-estudio-agente-a-motor.md) |
| B — Contratos, persistência e reserva | `codex/estudio-contratos` / `.worktrees/estudio-contratos` | [Prompt B](../prompts/2026-09-10-estudio-agente-b-contratos.md) |
| C — Interface e fluxo | `codex/estudio-interface` / `.worktrees/estudio-interface` | [Prompt C](../prompts/2026-09-10-estudio-agente-c-interface.md) |
| D — Créditos e prova integrada | `codex/estudio-creditos-qa` / `.worktrees/estudio-creditos-qa` | [Prompt D](../prompts/2026-09-10-estudio-agente-d-creditos-qa.md) |

Coordenador: `codex/estudio-integracao`, `.worktrees/estudio-integracao`. Esses caminhos são propostas de execução; ainda não foram criados por esta etapa de planejamento. Os quatro prompts servem para quatro sessões executoras separadas. Não anunciar quatro executores ativos se a ferramenta disponível só admitir três filhos mais o coordenador.

| Arquivo compartilhado pelos planos antigos | Dono único agora |
| --- | --- |
| `app/src/server/jobs/creative-work.ts` e teste | A, incluindo consumo de revisionContext do plano de experiência |
| `app/src/server/creative-work/contracts.ts`, `protocol.ts` e testes | A |
| `app/src/server/creative-work/reference-plan.ts` e teste | A, apenas original de adaptação a partir do pai de revisão |
| `app/src/server/application/prepare-creative-work.ts`, `creative-work/prepare.ts` e testes | A, incluindo formato automático |
| `app/src/server/repositories/creative-work.ts` e teste | B, incluindo limite maxCalls do plano de qualidade e dimensões das fontes |
| `app/src/server/db/schema.ts`, `app/drizzle/*` | B; sem migração financeira |
| `app/src/components/creative-work/*`, dashboard/studio-stage e hooks criativos | C |
| `app/messages/pt-BR.json`, `app/messages/en.json` | C; D envia nomes/valores de chaves financeiras no seu relatório |
| `app/src/components/layout/AppSidebar.tsx` e teste | D, exclusivamente apresentação do saldo; C preserva layout da sidebar |
| `app/tests/e2e/*` tocados por estes planos | D |
| `app/src/server/ai/providers/e2e-controlled-provider.ts` e teste | D |
| `app/src/lib/creative-work-selection-policy.ts` | Sem mudança prevista; já impede fail e confirma inconclusive |
| Planos/spec principal e relatório de integração | Coordenador; agentes escrevem só seu relatório de entrega |

Os demais arquivos são definidos nos prompts. Necessidade de tocar arquivo alheio vira pedido ao dono com símbolo, comportamento e teste esperado. Não enviar patch concorrente nem resolver conflito aceitando um lado inteiro.

## Contratos de sincronização

**B1 — primeiro commit útil do Backend:** tarefa 1 de experiência, incluindo schemas puros, colunas, save com CAS, GET e testes; mais extensão compatível de `claimCreativeWorkOutputImageCall` e metadados width/height abaixo. É código real testado, não tipos temporários ou APIs falsas.

```ts
claimCreativeWorkOutputImageCall(
  workspaceId: string, workItemId: string, outputId: string,
  maxCalls: 1 | 2 = CREATIVE_WORK_MAX_IMAGE_CALLS,
): Promise<CreativeWorkOutput | null>

// Retorno por sourceId; campos antigos preservados.
type SourceAssetDetails = {
  assetKey: string; mimeType: string; source: string; name: string;
  width: number | null; height: number | null;
};
```

`getCreativeWorkSourceAssetDetails` acrescenta apenas as colunas existentes de workspace_assets. Não envia assetKey ao browser por conta desta extensão. OutputReviewInput/Draft/Context, PATCH saveOutputReview e POST reviewed_revision mantêm os nomes definidos no plano de experiência.

**B2 — revisão completa:** serviço, adapter, reserva e rota reviewed_revision, replay e testes. A liga o job ao contexto; não edita o backend de B.

**A1 — política e geração:** `renderPolicy?: "integrated_v1"`, `quality?: "medium"|"high"`, `revisionAction?: "refine"|"variation"|"format"`. A entrega o job com teto inicial 1, retry humano até 2 e formato real do output.

**D1 — apresentação financeira:** extensão aditiva `billing.access.unlimited: boolean` em `/api/billing/status`, calculada por `workspaceHasUnlimitedBillingAccess`. C só consome se precisar mostrar acesso; não recalcula a política. D entrega o conjunto exato de traduções financeiras para C incorporar antes do aceite visual.

Enquanto B1 não chega: A desenvolve política/prompt/QA e testes puros; C desenvolve geometria, popover e componentes com fixtures de teste; D corrige billing. Nenhum deles cria um stub de produção para substituir B1. A/C recebem o commit B1 por merge, preservando o mesmo SHA na ancestry.

### R1 — Preview reprovado e compensação recuperável

A pré-revisão do motor confirmou uma lacuna da tarefa3 de qualidade: completion limpa failureCode; a recuperação consulta somente failed; replay e onFailure não compensam completed. Esta seção corrige aquela instrução, sem nova coluna, enum de status, scheduler ou regra de preço.

| Dono | Entrega e limite de propriedade |
| --- | --- |
| B | Em repositories/creative-work e teste: opção interna estreita de completion para marcar `objective_quality_failed_refund_pending` no mesmo CAS que outputKey/quality/completed. Seleção e limpeza de pendentes com predicados exatos abaixo. Na GET e teste: consumir o helper de D e recuperar o caso novo. |
| D | Extrair a função privada `refundCreativeWorkOutputCompensatory` da GET para `app/src/server/application/refund-creative-work-output.ts`, com teste junto. Exportar o mesmo nome e Promise<boolean>; preservar input atual, acrescentando userId opcional quando disponível. Não editar a GET de B nem o job de A. Entregar cedo o SHA do helper real. |
| A | Job e teste: completion vencedora antes do refund; replay de completed e onFailure recuperam a pendência sem geração adicional ou rebaixamento para failed. Usar o helper real de D; manter preview apenas após vencer CAS. |
| C | `use-creative-work.ts` e teste mantêm polling para completed com esse marcador. UI distingue reprovação objetiva e compensação pendente, mantém preview e bloqueia escolha. Sem afirmar estorno financeiro em bypass. |

O helper compartilhado conserva `resolveCreativeWorkOutputReactivationOutcome`, inclusive already_refunded, e `settleTerminalRefund`; no caso novo todos os callers usam failurePhase terminal. Não colapsar already_refunded para null nem cair depois na chave original. Passar work.createdByUserId quando disponível para a movimentação autenticada. Somente resultado confirmado permite limpar a pendência; nenhuma inferência por tentativa ou timeout. O boolean confirma liquidação da operação, não implica que houve débito financeiro em bypass.

`listCreativeWorkOutputsNeedingRefund` preserva a regra antiga failed + código pending e acrescenta um OR restrito a **completed + código exato + objectiveVerdict fail + outputKey presente**. O marcador novo só nasce em completion integrated com imagem válida e QA objetiva fail. A limpeza condiciona workspaceId, workItemId, outputId, completed, marcador, QA fail e outputKey esperado; altera somente failureCode/updatedAt. Nunca apagar quality/outputKey/terminalAt nem compensar todos os completed históricos.

Se o refund falhar, o marcador permanece. Se aplicar e a limpeza falhar, nova tentativa reconhece a mesma chave liquidada e limpa o marcador. Recuperação acontece no job, onFailure e GET; a consulta continua enquanto a tela estiver aberta e retoma ao reabrir. Não foi adicionado reconciliador autônomo em background.

Testes nas suítes dos donos: CAS perdedor→zero refund; crash entre completion/refund; falha de refund preserva preview; replay após ledger antes da limpeza; reactivation already_refunded não compensa a reserva original; onFailure não rebaixa completed; consulta de pendentes/limpeza só aceita o caso exato; polling termina após liquidação. D cobre concorrência/idempotência financeira na infraestrutura de teste existente.

R1 é marco adicional antes da integração do job; não atrasar política/prompt/componentes independentes. B1 continua sendo a entrega inicial de contratos definida acima. Distribuir os SHAs reais de R1 depois de revisados, sem interfaces falsas ou segundo escritor nos arquivos compartilhados.

### Pai como original de adaptação

`planCreativeWorkReferences` deve aceitar o pai válido em revisionReferences[0] como original obrigatório e primeira referência de format_adaptation, inclusive se a Peça única inicial não tinha upload em sources. A é dono de reference-plan.ts/teste para essa correção necessária ao contrato já aprovado de filha9:16. Referências adicionais ficam depois; adaptação autônoma sem pai continua exigindo original. Não fabricar source/cast no job. Testar planejamento com sources vazio e pai presente, ausência de ambos rejeitada e job filha9:16 com pai intacto.

## Task 1: Preparar a base e distribuir as quatro frentes

**Files:** bundle desta spec/planos/prompts; arquivos da aplicação ainda não são alterados nesta tarefa.

**Interfaces:** entrada HEAD inspecionado; saída BASE_COMUM com os documentos e quatro worktrees independentes.

- [ ] **Step 1:** Confirmar base, status e worktrees. Ler `superpowers:using-git-worktrees`; preservar todos os WIP e verificar os destinos antes de criar. Se a branch de destino mudou, registrar novo HEAD e revalidar o delta; não atualizar a base silenciosamente.

```bash
git status --short
git worktree list --porcelain
git show --no-patch --format=fuller ac38a30e4611ee62d534b34a2b80579dbfe893d3
git check-ignore .worktrees
```

- [ ] **Step 2:** Criar worktree de integração na base inspecionada. Copiar somente esta spec, os três planos técnicos, este coordenador e os quatro prompts, mantendo paths relativos. Commitar esse bundle com allowlist explícita; não incluir estudos históricos, anexos privados ou outras pastas untracked. O SHA desse commit é BASE_COMUM.

```bash
git worktree add -b codex/estudio-integracao .worktrees/estudio-integracao ac38a30e4611ee62d534b34a2b80579dbfe893d3
```

- [ ] **Step 3:** A partir da raiz original, criar quatro branches da integração já contendo os documentos. Não reutilizar worktrees de tarefas anteriores.

```bash
git worktree add -b codex/estudio-motor .worktrees/estudio-motor codex/estudio-integracao
git worktree add -b codex/estudio-contratos .worktrees/estudio-contratos codex/estudio-integracao
git worktree add -b codex/estudio-interface .worktrees/estudio-interface codex/estudio-integracao
git worktree add -b codex/estudio-creditos-qa .worktrees/estudio-creditos-qa codex/estudio-integracao
```

- [ ] **Step 4:** Iniciar os quatro executores com seus prompts. Reportar BASE_COMUM e nomes reais das branches. Cada executor instala/reutiliza dependências pelo lockfile, sem alterar package.json/lockfile; portas e banco de teste não são compartilhados para escrita concorrente.

## Task 2: Revisar marcos e integrar preservando autoria

**Files:** relatório novo `docs/evidence/2026-09-10-estudio-integracao.md` e somente mudanças necessárias para integrar os contratos.

**Interfaces:** commits B1/B2/A/C/D; saída branch integrada com testes de cada frente preservados.

- [ ] **Step 1:** Revisar B1 contra a spec e o diff: CAS, isolamento, serializers, migração, maxCalls e dimensões. Devolver achados a B. Depois de verde, integrar o SHA revisado na integração e distribuir esse mesmo SHA a A/C. D recebe quando iniciar E2E.
- [ ] **Step 2:** Revisar entregas B2 e A; integrar Backend, Motor, Interface e Créditos nessa ordem lógica. Usar SHA reportado e conferido, não branch em movimento. Quem integra resolve só costuras; falhas de implementação voltam ao autor.

```bash
git status --short
git log --oneline codex/estudio-integracao..codex/estudio-contratos
git diff --stat codex/estudio-integracao...codex/estudio-contratos
git merge --no-ff codex/estudio-contratos
```

O exemplo de merge é usado após conferir que a ponta da branch é o SHA revisado. Repetir a mesma verificação para A/C/D. Não mergear branches sem revisão nem encerrar conflitos com `--ours`/`--theirs` indiscriminado.

- [ ] **Step 3:** C incorpora as traduções financeiras de D. A confirma que o job usa context/action/targetFormat de B e o mesmo contador. D confirma que billing conserva idempotência do settlement. Repetir só testes afetados pelas costuras, depois typecheck/lint.
- [ ] **Step 4:** D atualiza sua branch com a integração e executa a matriz E2E controlada. Fixes de produto retornam ao dono; D escreve testes/evidências e não corrige módulos de A/B/C por conta própria.

## Task 3: Fechar o pacote com evidência, depois decidir publicação

**Files:** relatório de integração, evidências dos quatro agentes e screenshots de QA.

**Interfaces:** aplicação integrada local; saída aceite técnico, visual e lista explícita de gates restantes.

- [ ] **Step 1:** Executar os comandos focados dos três planos; `npm run typecheck`, lint dos arquivos tocados, `git diff --check`. Rodar Graphify uma vez na integração após código; não misturar dumps de quatro branches no diff.
- [ ] **Step 2:** Provar pelo browser e banco isolado: Peça única→revisão→variação→adaptação no mesmo work; carrossel planeja ou mostra erro; restyle mostra análise/pares; direções humanas sobrevivem; fila persiste depois de aceita; camada não inicia ao abrir; créditos/filtros/refund conciliam.
- [ ] **Step 3:** Inspecionar 390×844, 1045×586 e 1440×900 com a referência aprovada. Review independente do diff integrado pelo coordenador. Todos os achados relevantes resolvidos pelo autor antes de declarar pronto localmente.
- [ ] **Step 4:** Apresentar os 3 pares Cenbrap e orçamento concreto para a comparação real. Aguardar autorização das chamadas pagas. Testes controlados não provam superioridade criativa.
- [ ] **Step 5:** Só depois de aprovação aplicável, publicar. Validar CI, deploy, saúde e fluxo autenticado separadamente. Não excluir worktrees, reescrever histórico nem apagar evidência reprovada automaticamente.

## Entrega padrão de cada agente

```text
Agente / branch / worktree:
BASE_COMUM / commits entregues:
Tarefas concluídas e critérios atendidos:
Arquivos alterados (somente seu ownership):
Comandos + resultados (incluindo falhas ou testes bloqueados):
Contratos consumidos/produzidos:
Pedido concreto para outro dono, se houver:
Evidência local e limitações:
Produção/chamadas pagas: não executadas, salvo autorização registrada.
```

Status “pronto para integrar” exige diff e evidência; “DONE” sozinho não encerra uma frente. Quatro branches verdes não substituem o teste da aplicação combinada.
