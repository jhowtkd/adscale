# Estúdio — peça na caixa e qualidade da peça única

Data: 2026-09-10. Referência visual aprovada por Jhonatan nesta conversa. Especificação de implementação proposta; nenhuma alteração de aplicação, migração ou publicação foi executada nesta etapa.

## Resultado e recorte

Uma Peça única pode ser criada, revisada, comentada, refinada e adaptada sem sair do Trabalho e da caixa gradiente. As versões anteriores continuam disponíveis. A imagem é o elemento principal. “Gerar camadas” fica junto às ações da imagem e dentro do painel de camadas.

Esta é a primeira entrega vertical: **Peça única → resultado → comentário/refinamento → nova versão → adaptação de formato → retomada**. A partir de uma peça, “Criar variação” é uma revisão relacionada à base, não uma troca do protocolo do Trabalho. Os fluxos autônomos de Variações, Mudar estilo e Carrossel permanecem no comportamento existente; sua convergência visual integral é outro recorte. A ampliação de confiabilidade ao final desta spec acrescenta as correções críticas da auditoria, sem migrar todos os protocolos para o novo editor.

Planos executáveis, com esta mesma especificação:

1. [Experiência e persistência](../plans/2026-09-10-estudio-peca-na-caixa.md): funciona com o motor atual.
2. [Qualidade da peça única](../plans/2026-09-10-peca-unica-qualidade.md): funciona com a interface atual; a validação final combina os dois.

3. [Confiabilidade e créditos](../plans/2026-09-10-estudio-confiabilidade-creditos.md): fecha falhas operacionais e financeiras dos estudos adicionais.

A execução solicitada agora usa [quatro agentes em worktrees isolados](../plans/2026-09-10-estudio-fechamento-quatro-agentes.md). A matriz de ownership do coordenador substitui a recomendação anterior de um escritor sequencial; continua havendo um único dono por arquivo. O aceite final exige os três planos integrados.

## Fontes e precedência

- `CONTEXT.md`, ADR 0013 e `docs/agents/source-of-truth.md`: Trabalho canônico, isolamento de workspace, aprovação humana e veredito objetivo.
- Conversa: imagem principal, tudo no mesmo trabalho/caixa; comentários na imagem; camadas acessíveis; composição contida; proporções no botão; miniaturas discretas junto à arte; aprovação “show. aprovado”.
- Protótipo aprovado: `/Users/jhonatan/.codex/visualizations/2026/09/10/01a08b7d-0036-7ae3-b8a0-b4a709423d58/estudio-prototipo/`, servido em `http://127.0.0.1:8767/`.
- Diagnóstico histórico: `docs/findings/2026-09-10-diagnostico-geracoes-e-caixa-dinamica.md`; auditoria: `docs/evidence/2026-09-10-auditoria-cenbrap-geracoes.md`.
- Código inspecionado no checkout `feat/f03-commercial-offer-catalog`, HEAD `ac38a30e`. Planos anteriores de 08/09 não provam integração neste checkout.

O protótipo tem imagens e camadas simuladas, sem persistência após reload. Seus dados/JavaScript não serão copiados para a aplicação. O texto “aprovação final depende do usuário” no LEIA-ME antecede a aprovação nesta conversa.

Hashes SHA-256 da referência aprovada:

| Arquivo | SHA-256 |
| --- | --- |
| index.html | `937b90f627d600456681871f77dc81b4cac943a5ab6cfc24061f5f6a4491b769` |
| style.css | `863a7fd2e5a7fefa3fb7b2acb148978129ec60124436cacd38bc368936cc47bc` |
| app.mjs | `bb46074603f70225a5667cfa156f71c5a712dc2c6a98456f2226e534fd0e8816` |

## Restrições globais

- Preservar sidebar e composição contida; nenhuma expansão automática para ocupar a tela toda.
- Uma instância de `useCreativeComposer` por trabalho aberto; Postgres é a verdade operacional.
- Peça pronta imutável; cada alteração confirmada cria um output filho no mesmo `workItemId`. A geração inicial cria a raiz; retry técnico sem arte segue a operação canônica existente.
- Nenhuma geração, separação de camadas ou cobrança ao abrir, fechar, comentar, selecionar formato ou trocar miniatura.
- Revisar mostra base, pedido, comentários, formato e custo; somente confirmar dispara a operação.
- Não sobrescrever texto, formato ou direções escolhidos pelo usuário com sugestões da IA.
- PT-BR na superfície; mensagens novas têm tradução em `app/messages/pt-BR.json` e `app/messages/en.json`.
- Reusar dependências, hooks, autenticação, armazenamento, settlement e editor existentes; nenhuma dependência nova.
- Não alterar preços, entitlements ou provedores; custo exibido vem da constante/quote canônica do servidor.
- Migrações, contratos HTTP e formatos persistidos propostos exigem autorização explícita antes da execução; este pedido autoriza escrever o plano.
- Testes locais com mocks ou provider controlado; chamadas pagas e publicação dependem de autorização específica.

## Experiência aprovada

### Caixa e imagem

No desktop, caixa central contida: conteúdo principal com largura máxima de 1250 px incluindo margens, borda gradiente de 1 px, raio de aproximadamente 20 px, altura alvo `min(690px, 100dvh - 136px)`. Em janela baixa, permitir rolagem da página em vez de cortar controles. Sidebar existente determina a largura útil: não copiar o offset fixo do protótipo.

Cabeçalho com marca, título e Escolher/Baixar; ações leves acima da arte: Comentar, Comparar quando houver ancestral, Gerar camadas. Imagem com `object-fit: contain`, sem crop para simular proporção. Miniaturas de 34×34 px imediatamente ao lado esquerdo da imagem; alvo de toque de 44 px, seleção acessível. Sem faixa horizontal “Versões” ocupando uma linha inteira. Número exibido é a ordem visual na linhagem; não assumir que `versionNumber` é global entre formatos.

Campo de ajuste delimitado abaixo da arte. Adaptar formato abre painel ancorado ao próprio botão, com 1:1, 4:5, 9:16; Escape/clique fora fecha e devolve foco. Abrir/fechar não altera pedido. Escolher conserva texto livre e muda apenas a ação/formato. Cancelar adaptação volta ao formato da base e preserva texto/comentários. O modo de ampliação é explícito e opcional.

Até 700 px, caixa em fluxo normal, imagem em aproximadamente 48dvh com mínimo de 310 px; painel de camadas abaixo. Testar 390×844, 1045×586 e 1440×900. Todas as ações devem permanecer alcançáveis com teclado e sem scroll horizontal da página. Respeitar movimento reduzido.

### Estados e continuidade

Entrada, revisão do plano inicial, fila, pronta, revisão do ajuste, erro. O hook canônico permanece montado ao expandir/recolher. No primeiro recorte só há um trabalho ativo na caixa; não criar uma fila multitrabalho ou um segundo composer. É permitido escrever o próximo ajuste enquanto a geração atual termina, mas nunca enviá-lo implicitamente.

Status de outputs `queued|processing|completed|failed` vem do servidor. Durante envio ainda sem resposta, mostrar “Enviando”; em resultado de rede incerto, “Confirmando envio”. Nunca sumir com um trabalho aceito nem anunciar “pronta” por ausência de atividade local. Mostrar erro sem apagar a base ou o pedido. Retry respeita a operação e o settlement existentes.

Selecionar miniatura troca só a peça em inspeção, não marca aprovação. “Escolher” usa `getCreativeWorkSelectionPolicy`: `fail` bloqueia; `inconclusive`/legado requer confirmação; `pass` permite. Comparar apresenta a selecionada e seu ancestral, mantendo suas proporções reais.

### Comentários e revisões

Clique na imagem adiciona pino e comentário; coordenadas normalizadas contra a imagem realmente renderizada, sem incluir letterboxing. Alternativa por teclado: botão para adicionar comentário no centro, campos X/Y de 0 a 100 e texto. Pino tem nome acessível e pode ser editado/removido.

Rascunhos pertencem a um output, são salvos no servidor e sobrevivem a reload. Limites propostos: 8 comentários, 100 caracteres por comentário, 800 no pedido livre, total da instrução compilada até 2000. Exceder limite mostra erro, nunca trunca silenciosamente. Salvar comentário não gera imagem. Comentários direcionam a revisão, mas não são uma garantia de edição pixel a pixel ou de máscara de inpainting.

O plano congela base, ação, alvo, texto, notas e referência adicional antes da confirmação. Refinar/variação herda o formato da base; adaptar usa o formato explicitamente escolhido. Referência base é lida no servidor pelo output autorizado, sem baixar/reanexar manualmente. A versão filha guarda o contexto congelado usado para gerá-la. Mudança de aba, reload, concorrência ou erro de rede não pode gerar dupla cobrança.

### Camadas

O painel compacto abre dentro da caixa. Antes da separação, mostra a imagem e “Gerar camadas” com a quota real. Abrir o painel não chama Layerize. O clique explícito usa `composer.layerizeOutput` e conserva o `operationId` até a resposta ser reconciliada. Reutilizar `LayerScanner`, `LayerPanel`, `LayerCanvas`, `useLayerEditor` e os locks/leases existentes. Extrair apenas o conteúdo do diálogo para permitir a mesma sessão no painel; não criar outro editor.

Mobile conserva o modo de inspeção atual. Sem configuração/entitlement, explicar a indisponibilidade; não habilitar cobrança ou burlar quota. Publicar edição de camada continua produzindo filho por `publishCreativeWorkLayerEditor`; atualizar a mesma lista de versões. Toda alteração pendente no editor passa pelo mecanismo existente de salvar/conflito antes de mudar de output.

## Contrato proposto — experiência

Não há rascunho de comentários de Estúdio atualmente. As tabelas `assistant_artifact_annotations` e `piece_review_comments` exigem thread/goal ou share link: não criar vínculos fictícios para reutilizá-las.

Extensão mínima proposta em `creative_work_outputs`: `review_draft jsonb NULL` (rascunho mutável com CAS próprio) e `revision_context jsonb NULL` (entrada imutável da revisão). Sem nova tabela, novo destino ou novo serviço. Dados antigos com NULL continuam válidos. As duas colunas são usadas, e a migração aditiva não remove dados.

`PATCH /api/creative-work/:id`, ação `saveOutputReview`: outputId, expectedReviewRevision, draft. Retorna rascunho normalizado com revision/revisionKey e custo canônico. CAS 409 preserva texto local e oferece recarregar o rascunho do servidor, sem overwrite automático. Verificar output no mesmo workspace/trabalho, imagem disponível e revisionAssetId autorizado. Não editar `work.request`, `work.format` nem o snapshot original para salvar esse ajuste.

`POST /api/creative-work/:id/generate`, nova ação `reviewed_revision`: outputId, reviewRevision, revisionKey, expectedCredits. O servidor relê o rascunho, verifica preço/revisão, e entrega o contexto congelado ao settlement canônico. Mesmo revisionKey + mesmo comando junta a operação; chave com outro conteúdo é conflito, nunca nova cobrança. Resultado 202 conserva `{output}`. A ação `revision` existente continua atendendo clientes antigos pelo mesmo serviço, sem implementar uma segunda regra de geração.

GET de detalhe passa a projetar `reviewDraft`, `revisionContext` e `revisionCreditCost`, removendo chaves privadas de storage como já faz hoje. A instrução compilada continua em `revisionInstruction`; `targetFormat` continua sendo a coluna canônica de formato do output. O modo gerador/avaliador para action=format é `format_adaptation`; demais ações são `creative_revision`.

## Qualidade da peça única

Hipóteses sustentadas por código, não por comparação controlada: Peça única pode cair em composição de texto pelo aplicativo; executor não repassa qualidade e o provider tem default medium. Isso justifica testar composição generativa e high, mas não prova qual configuração o ChatGPT usa nem que a mudança ganhará dele.

Congelar `renderPolicy: "integrated_v1"` no input snapshot de novas peças únicas ao preparar o plano; ausência mantém a interpretação histórica de trabalhos já preparados. Não remover o compositor determinístico de trabalhos antigos ou de outros consumidores. Na política nova:

1. Modelo desenha tipografia, hierarquia, cena e CTA; assets marcados exact continuam no caminho de composição exata existente, incluindo logo.
2. Uma etapa de direção de arte gera brief visual curto a partir dos fatos, brand kit, referências e direção escolhida. Limite 120 palavras; sem introduzir fatos. Brief e metadados de fallback ficam em evidência persistida. Texto/copy factual completo permanece fora do limite, no contrato enviado à imagem.
3. Qualidade high explícita, no executor canônico, somente para este recorte. Não ativar Sunburst, mudar modelo, preço ou fallback global.
4. Uma chamada de imagem por tentativa confirmada na política nova. Sem correção automática por QA e sem replay automático ambíguo de imagem. Infraestrutura de refund, lease e settlement continua canônica. Depois de falha técnica sem imagem válida, a retentativa humana existente pode consumir a segunda e última chamada daquele output, com confirmação e compensação canônicas; não é uma chamada oculta. Uma peça já produzida só muda por novo output filho.
5. Verificação posterior reaproveita QA tri-state, referências e factualidade. Paleta/família tipográfica são orientação, não prova de fonte exata. Não criar “Marca ok” nem “Copy confirmada” sem evidência. Falha objetiva com imagem válida mantém preview e contexto para refinamento, mas bloqueia escolha; inconclusivo entrega com aviso. Erro técnico sem arte permanece failed.
6. Não regenerar ou reclassificar trabalhos históricos ao abrir a tela.

## Aceite e fronteiras

- E2E controlado prova: mesmo workId em criação/revisão/adaptação; base intacta; dimensões reais do alvo; comentário salvo após reload; seleção preservada; fila/erro visível; uma operação aceita por confirmação; abertura de camadas sem chamada paga.
- Testes de concorrência provam CAS e idempotência no repositório/settlement, não apenas no botão.
- Teste de job prova high, tipografia generativa, referência base e única chamada por tentativa confirmada; QA não dispara correção. Uma retentativa técnica explícita é testada separadamente. Avaliação indisponível não vira aprovação.
- Inspeção visual compara os três viewports com o protótipo aprovado; não recriar o layout expandido rejeitado.
- Gate humano posterior: 3 pedidos Cenbrap (institucional, promoção, evento), mesmos anexos/pedido por par, 1 resultado ADScale + 1 ChatGPT por pedido. Avaliação cega de legibilidade, hierarquia, marca, precisão e prontidão para uso. Empatar/ganhar em pelo menos 2/3 é sinal de avanço desta amostra, não prova universal. Registrar resultados inclusive os ruins, duração e custo. Executar somente após aprovação de orçamento/calls.
- Não incluídos: migração de modelo, redesign da sidebar/biblioteca/marca, catálogo novo, fila multitrabalho, correção de toda a auditoria, consolidação de Carrossel/Mudar estilo, publicação automática ou ajuste de tabela de preços.

## Decisões para registrar na implementação

O primeiro commit executável deve acrescentar uma nota canônica em `CONTEXT.md` e decisão em `docs/decisions/2026-09-10-estudio-peca-na-caixa.md`, sem reescrever a tese: revisão obrigatória aqui é a confirmação operacional de uma geração cobrada, não um wizard obrigatório para editar briefing; “versões” designa histórico de revisão e “Criar variação” mantém a base no mesmo Trabalho. A UI não muda o protocolo do rascunho para produzir um filho. Esta especificação substitui as propostas visuais anteriores de expansão e os trechos que mantinham a página de resultado separada, apenas neste recorte.


## Ampliação de confiabilidade — estudos adicionais e quatro agentes

O usuário solicitou avaliar dois estudos e preparar instruções para quatro agentes em paralelo, com integração posterior. O relatório coordenador registra diferenças entre evidência, hipóteses e decisões; os estudos não autorizam migração de modelo, preço ou exclusão de rotas.

Critérios adicionais desta entrega:

- Carrossel: Organizar conteúdo espera o autosave real e a revisão canônica; falha de salvar/planejar fica visível e conserva o pedido. Nenhum catch silencioso no caminho tocado; CAS do servidor continua válido.
- Preparação: fonte uploaded/analyzing bloqueia geração com mensagem de análise. Salvar/preparar não pode ser apresentado como fila. Fila existe quando output/slide foi persistido; reload restaura esse estado.
- Restyle: separar original ausente, estilo ausente, análise pendente e falha; reutilizar addInspiration para confirmar/materializar fonte de estilo. Input file vazio não determina a existência da fonte.
- Direções: pool persistido mantém escolhas humanas depois de reload; resposta atrasada de outro trabalho/protocolo não muda o atual. Uma seleção não vira três sem ação explícita.
- Formato auto: escolha manual vence; auto usa pedido de proporção inequívoco ou formato/dimensões da única fonte de conteúdo antes de descrições genéricas. Não usar referência apenas de estilo para redimensionar single. Dimensões inválidas/ausentes usam fallback existente; sem análise paga adicional.
- Billing: resumo e transações usam workspace/período/campanha iguais; saldo atual não depende do filtro histórico. Datas incluem o dia final inteiro. Labels traduzidos, média com denominador do mesmo recorte, vazio distinto de erro.
- Unlimited: usage_events já registra uso sem débito. Expor billing.access.unlimited por política canônica; exibir Ilimitado, sem sentinel999999 como saldo. Não criar débito/refund financeiro fictício nem backfill.
- Atomicidade: débito/refund e credit_transactions pertencem à mesma transação; falha do ledger reverte a operação. Preservar idempotência, locks e compensação canônica.
- QA: quatro branches só fecham depois de integradas, com regressões dos protocolos afetados, concorrência e rollback no banco isolado, e inspeção visual nos três tamanhos.

Fronteiras continuam explícitas: a caixa final é a versão contida aprovada; high global/reajuste de preço, fila multitrabalho, aposentadoria integral de Assistente/Create post, migração visual completa de Carrossel/Restyle, Sunburst e score subjetivo bloqueante não entram automaticamente. A comparação Cenbrap real e a publicação continuam gates separados da prova local.
