# Plano de execução — feedback do Agentation no Estúdio

Status em 14/09/2026: seis itens resolvidos e sete pendentes, confirmado pela leitura da sessão no Agentation.
Fonte: sessão Agentation `mu0ehicc-klt5g5`, 13 anotações pendentes em 13/09/2026.
Contexto: home e Variações do trabalho `9154eefb-8dd0-4252-9e0a-604d75ea9624`.
Resolvidos, conforme confirmação do usuário e estado no Agentation: **1, 3, 4, 5, 8 e 13**.
Pendentes: **2, 6, 7, 9, 10, 11 e 12**.
O fechamento registra o aceite informado pelo usuário; não representa nova validação de código ou deploy nesta rodada. Prioridades abaixo são propostas, não severidades fornecidas pelo usuário.

## Evidência e limites da análise original (13/09/2026)

- Foram lidos comentários, seletores, textos próximos, dimensões e caminhos completos do DOM, além dos componentes relevantes.
- As duas imagens enviadas pelo usuário foram inspecionadas: a primeira contém um retângulo tracejado na região do logo e assinatura desalinhada; a segunda apresenta duas assinaturas CENBRAP sobrepostas. Ambas repetem a oferta em vários blocos de texto. Esses defeitos estão visíveis na arte; a etapa que os introduziu ainda não foi comprovada.
- Referências na conversa: imagem 1, `codex-clipboard-a5c42c2a-f18b-4879-b414-13d38c130893.png`; imagem 2, `codex-clipboard-299a4bce-4a41-40f9-8d86-8a377fe27f35.png`. Preservar os arquivos como evidência antes da execução, pois os caminhos fornecidos são temporários. Não presumir que são um par antes/depois nem atribuir cada imagem a uma execução sem conferir sua origem.
- Há 35 arquivos rastreados com alterações locais em andamento, incluindo preparação, prompts, referências, identidade, qualidade, treinamento de marca e schema. Preservar esse trabalho e reconciliar a frente de qualidade com seu responsável antes de editar.
- `DashboardHomeActions.tsx` mantém `deskView` e altera a vista por clique. O handler de geração consultado não muda a vista.
- `CreativeComposer.tsx` usa duas colunas iguais em Variações, mas com `items-start` e conteúdo de alturas diferentes.
- `CreativeVariationBrief.tsx` já exporta funções de resumo de conteúdo e estilo; reaproveitar os dados da análise sem outra chamada de IA.
- `SidebarRecentWorks.tsx` agrupa por marca, usa marcador genérico W e não identifica explicitamente o trabalho atual com `aria-current`.
- Não foi encontrado suporte a favoritos no schema, APIs, repositórios e componentes consultados. A biblioteca atual filtra por tipo de ativo.

## Classificação e cobertura

A tabela preserva o escopo original. Itens marcados como resolvidos não devem ser reimplementados.

P1: qualidade do resultado ou compreensão/continuidade do fluxo principal. P2: consistência visual e descoberta. P3: capacidade nova, após estabilização do fluxo.

| Item | Anotação Agentation | Classificação | Prioridade | Execução proposta e aceite |
|---|---|---|---|---|
| 1 — resolvido | `mu0ehxxs-tbj6m8` — barra de outra cor | Correção visual | P2 | Identificar a camada que cria a faixa no rodapé e integrá-la ao fundo da caixa. Preservar Anexar/Gerar, contraste e estados de foco; conferir caixa recolhida e expandida. |
| 2 | `mu0ejmsh-m46x23` — favoritar peças | Funcionalidade nova | P3 | Favoritar/desfavoritar a peça existente e oferecer seção/filtro Favoritos na biblioteca. Não copiar arquivos nem confundir favorito com aprovação. Favoritos pessoais por usuário, sempre respeitando o acesso ao workspace. |
| 3 — resolvido | `mu0ejztc-covsrg` — switcher | Redesenho de controle | P1 | Substituir botões soltos por controle segmentado Inspirações/Produção, com seleção inequívoca e teclado acessível. Preservar filtros, paginação e escopo da marca. |
| 4 — resolvido | `mu0en9gv-3xxqy6` — CORTEX | Hierarquia visual | P2 | Destacar o acesso à marca com label CORTEX no gradiente existente, mantendo nome da marca e estado do treinamento legíveis. Validar estados pronta, pendente, carregando e indisponível. |
| 5 — resolvido | `mu0enqq5-jjoqzq` — seletores de recentes | Usabilidade da navegação | P1 | Diferenciar expansão do grupo e abertura do trabalho, explicitar seleção e melhorar identificação. O usuário confirmou os três problemas: seleção, identificação e navegação. |
| 6 | `mu0epds9-a8lt6j` — boxes iguais | Correção de layout | P2 | Alinhar dimensões visuais dos painéis de referência e orientação no desktop; preservar proporção da arte e conteúdo. No mobile, empilhar sem impor altura vazia. |
| 7 | `mu0eprdw-d78fos` — design antigo | Redesenho localizado | P2 | Propor nova apresentação das direções de variação usando o sistema visual atual. Preservar multisseleção, limite de direções, instrução manual, carregamento e retry. Validar proposta antes de implementar. |
| 8 — resolvido | `mu0eqn13-qthsjq` — retirar bolas | Simplificação visual | P2 | Remover os botões circulares de ajuda da região de formato; incorporar orientação necessária em texto curto/contextual acessível. Verificar os demais consumidores antes de alterar componente compartilhado. |
| 9 | `mu0erf5h-tww31d` — resumo da leitura | Clareza de informação | P1 | Exibir síntese de 1–2 linhas com a análise recolhida e manter detalhes editáveis. Reutilizar dados existentes; não inventar conteúdo ausente nem fazer nova chamada de IA. |
| 10 | `mu0exvaa-fo2q7g` — âncora ao gerar | Continuidade do fluxo | P1 | Junto do item 11, apresentar destino e progresso do trabalho iniciado; rolar uma vez quando necessário, sem repetir a cada polling. Respeitar movimento reduzido e não deslocar foco enquanto a pessoa edita. |
| 11 | `mu0ez93m-ybe14x` — mudar para Produção | Continuidade do fluxo | P1 | Ao confirmar início da geração, abrir Produção no escopo correto. Falha de validação ou mera preparação não deve fingir que há geração. Recarregar a página e retomar trabalho existente não devem criar saltos contínuos. |
| 12 | `mu0f1023-5qn2j3` — placeholder na arte | Qualidade criativa / diagnóstico | P1, primeiro diagnóstico | Inspecionar a arte original do trabalho anotado, referência, pedido e dados da execução. O problema está na imagem gerada, conforme confirmação do usuário; localizar a causa antes de tocar no harness. Não considerar testes técnicos como prova de qualidade visual. |
| 13 — resolvido | `mu0f2fuz-uaqoed` — controles confusos | Arquitetura das ações | P1 | Explicitar o que Aprovar, Baixar, Compartilhar para revisão e Refinar fazem; diferenciar ação principal e secundárias e separar metadados. Preservar consequências atuais até revisá-las. Propor rótulos conforme comportamento real, não só trocar nomes. |

## Ordem de execução

Escopo restante em 14/09: Etapa 1 (12), Etapa 2 (9, 10 e 11), Etapa 3 (6 e 7), Etapa 4 (2) e validação dos itens pendentes. As etapas abaixo preservam a descrição original como referência.

### Etapa 0 — registrar decisões e preservar o trabalho existente

1. Adotar as decisões confirmadas ao final deste plano.
2. Capturar o estado visual de referência e a arte anotada, sem disparar novas gerações.
3. Comparar o código que gerou a peça com as mudanças locais em andamento. Definir uma frente de escrita por arquivo; não implementar outro harness em paralelo.

Saída: escopo confirmado, evidência de antes e separação entre problema observado e hipótese de causa.

### Etapa 1 — corrigir integridade de marca e edição da copy (12)

1. Relacionar cada amostra à sua execução e rastrear pedido → fonte → análise → direção → plano de referências → prompt → imagem bruta do provedor → eventuais composições posteriores → arquivo final.
2. Localizar onde surgem o retângulo tracejado e a assinatura duplicada. Conferir também os próprios arquivos de referência e logo. A hipótese de logo desenhado pelo gerador somado a outro aplicado posteriormente deve ser testada, não tomada como causa confirmada.
3. Identificar a responsabilidade pela assinatura na execução real e corrigir sua duplicação na origem. Não impor uma nova arquitetura de aplicação de logo antes dessa evidência.
4. Rastrear como o briefing vira texto visível: separar contexto/instruções de copy final, eliminar redundância entre blocos e preservar percentuais, condições e sentido da oferta. Repetição intencional entre chamada e CTA é aceitável; despejar a descrição do briefing na arte não é.
5. Comparar esses pontos com as alterações locais em andamento. Propor a menor correção, incorporando as duas amostras à avaliação de regressão, sem duplicar o harness.

Áreas candidatas: `prepare-creative-work.ts`, `creative-work/prompt.ts`, `reference-plan.ts`, `identity.ts`, jobs, composição posterior caso exista no caminho e `creative-quality-gate.ts`; somente após localizar a causa.
Aceite: uma única assinatura de marca, íntegra e bem posicionada; nenhum placeholder ou guia de construção visível; copy editada sem redundância desnecessária e sem alterar os fatos da oferta. Comparar imagem bruta e final para provar onde ocorreu a correção. Validar visualmente as regressões; checks de integridade existentes devem tratar os defeitos quando tecnicamente verificáveis, sem prometer detecção automática infalível. Novas chamadas pagas dependem de autorização específica de lote.

### Etapa 2 — tornar o fluxo de produção compreensível (3, 9, 10, 11, 13)

1. Fechar o controle segmentado e o destino de acompanhamento; não criar uma terceira superfície de resultados.
2. Ligar a troca de vista e a âncora à transição real de início da geração, cobrindo todos os pontos de entrada pertinentes.
3. Expor síntese da leitura existente.
4. Redesenhar a hierarquia de ações após mapear suas consequências.

Áreas principais: `DashboardHomeActions.tsx`, `CreativeComposer.tsx`, `CreativeVariationBrief.tsx`, `CreativeProposalGrid.tsx`, `CreativeResultCard.tsx` e handlers existentes.
Aceite: uma geração aceita leva ao acompanhamento correto; rejeição permanece no formulário com erro; polling não rouba a navegação; as ações são compreensíveis e continuam funcionando.

### Etapa 3 — unificar a apresentação (1, 4, 5, 6, 7, 8)

1. Preparar proposta visual da região de Variações, recentes e resultados com componentes/tokens existentes.
2. Revisar visualmente a proposta com o usuário antes do redesenho.
3. Corrigir a faixa, equilibrar os painéis, renovar direções, remover ajudas circulares e destacar CORTEX.
4. Conferir estados de hover/foco/seleção, desktop e mobile; não aplicar alturas rígidas que cortem conteúdo.

Áreas principais: `studio-stage/StudioStage.module.css`, `TalkBox.tsx`, `CreativeComposer.tsx`, `SidebarRecentWorks.tsx` e `SidebarBrandKitFeature.tsx`.
Aceite: todas as seis anotações comparadas visualmente com o antes; nenhuma funcionalidade perdida.

### Etapa 4 — favoritos (2)

1. Usar favoritos pessoais por usuário. A unidade proposta é a peça/versão escolhida, não o trabalho inteiro por consequência implícita.
2. Preparar persistência mínima ligada ao identificador existente; definir autorização por workspace e comportamento quando o ativo for removido.
3. Adicionar ação de favorito nos resultados e acesso na biblioteca, reutilizando listagem e download.
4. Testar persistência após recarga, remoção de favorito, isolamento de favoritos entre usuários e controle de acesso ao workspace e estado vazio.

Aceite: o mesmo ativo aparece em Favoritos sem duplicação e sem alterar aprovação. API/schema novos deverão ser apresentados concretamente para aprovação antes de execução.

### Etapa 5 — validação e fechamento

- Executar testes existentes pertinentes às transições, seleção, ações e autorização; adicionar apenas regressões não cobertas.
- Validar no navegador as rotas anotadas, desktop/mobile, teclado e movimento reduzido.
- Para qualidade criativa, exigir inspeção da imagem final; não substituir esse aceite por teste unitário ou sucesso de geração.
- Relacionar cada anotação ao resultado verificado. Resolver no Agentation somente após aceite do usuário.
- Este pedido é de classificação e plano. Implementação e novo deploy ficam fora desta rodada.

## Decisões confirmadas pelo usuário

1. “Placeholder perdido”: o defeito está dentro da imagem gerada.
2. Favoritos: pessoais por usuário.
3. Recentes: corrigir os três aspectos — seleção ativa, identificação de títulos/miniaturas e navegação/expansão.

Não restam dúvidas bloqueantes para o planejamento. A aprovação das propostas visuais e a validação da causa do defeito da arte continuam sendo etapas de execução.

Premissas propostas para os demais itens: switcher significa controle segmentado; boxes iguais significa alinhamento visual no desktop; resumo usa a análise existente; CORTEX identifica o acesso sem apagar a marca ativa. Essas premissas podem ser corrigidas antes da implementação.

## Implementação local — 14/09/2026

O pedido posterior “implementar” autoriza esta rodada local. A base `7208e24a` já continha a implementação inicial dos sete itens; esta rodada revisou essa base e corrigiu as lacunas abaixo, preservando as demais alterações em andamento.

| Anotação | Estado do código e complemento desta rodada |
| --- | --- |
| 2 — favoritos | Persistência pessoal existente mantida. Cache isolado por usuário; inclusão idempotente pelo índice único; erros visíveis e nova tentativa; busca, download e remoção pela Biblioteca. |
| 6 e 7 — boxes/direções | Implementação existente verificada pelos testes do compositor: regiões responsivas, painéis alinhados e instruções das direções visíveis. Aceite visual desktop/mobile pendente. |
| 9 — resumo | Resumo existente visível mesmo com a análise recolhida; testes do componente aprovados. |
| 10 e 11 — geração | Corrigida a âncora para a superfície de resultados. Rolagem após atualização da interface, somente na confirmação aceita; preserva edição em andamento e respeita movimento reduzido. Carrossel usa o mesmo comando de confirmação. |
| 12 — arte | Regras existentes proíbem guias/placeholders e logo desenhado pelo provedor; QA avalia a imagem final composta e sinaliza artefatos e segunda marca. Testes de prompt, copy, QA e job aprovados. As duas imagens fornecidas ainda exigem comparação com uma nova saída real. |

Verificação: 521 testes distintos aprovados nas suítes focadas, typecheck aprovado e lint sem erros (um aviso preexistente de dependência de hook em DashboardHomeActions). O teste de inclusão concorrente usa mocks da camada SQL; não comprova uma corrida em PostgreSQL real. Nenhuma geração paga, migração de produção ou novo deploy foi executado nesta rodada. A migração de favoritos `0098_piece_favorites.sql` já existia na base; sua aplicação no ambiente alvo não foi verificada aqui. As sete anotações permanecem abertas até o aceite no produto.
