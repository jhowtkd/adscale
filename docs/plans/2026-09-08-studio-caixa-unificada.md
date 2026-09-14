> Execução local concluída em 2026-09-08, commit `bcbbfdb5`. [Evidência de implementação e validação](/Users/jhonatan/.cursor/worktrees/adscale_2/studio-caixa-unificada/docs/evidence/2026-09-08-studio-caixa-unificada.md). Sem publicação. A validação mobile usou viewport em navegador desktop; teclado virtual em aparelho real não foi verificado.

# Estúdio ADScale — plano de implementação da caixa unificada

Data: 08/09/2026. Status: proposta visual aprovada; implementação não iniciada.

Este documento conserva o escopo e os critérios de aceite. O plano executável com tarefas, interfaces, testes e commits está em [Studio Caixa Unificada Implementation Plan](../superpowers/plans/2026-09-08-studio-caixa-unificada.md).

## Resultado esperado

Preservar a mesa cheia de cartazes e a caixa com borda colorida animada. Reunir nela os controles de criação hoje espalhados sobre a mesa. Acrescentar a alternância entre inspirações e peças produzidas, com identificação correta da campanha ou marca.

Referência aprovada: [protótipo local](http://127.0.0.1:8766/). Arquivos e capturas em `/Users/jhonatan/.codex/visualizations/2026/09/08/01a07ffe-2d5e-7950-ac67-5007ed4601ce/proposta/`. O protótipo orienta apresentação e interação; suas simulações não substituem validações e fluxos reais.

## Diagnóstico confirmado no código

| Ponto atual | Consequência para a implementação |
| --- | --- |
| `DashboardHomeActions.tsx` cria um único `useCreativeComposer`, mas envia `stageBody` e `talkBox` separadamente para `BrandStageHome`. | Reorganizar a apresentação mantendo esse controlador como autoridade. |
| `BrandStageHome.tsx` posiciona `children` sobre o mosaico e a caixa em um dock separado. | Retirar as configurações dessa sobreposição e incorporá-las à caixa expansível. |
| `TalkBox.tsx` já possui prompt, anexos, protocolos, validação, entrevista e `ShineBorder`. | Evoluir o componente existente; preservar aparência e comportamento real. |
| `CreativeComposer.tsx` também atende `CreativeWorkResumeSurface` com layout de peça. | Compartilhar apenas a apresentação necessária dos controles sem alterar a revisão de trabalhos. |
| `CarouselComposer.tsx` possui prompt, ações e fases próprias. | Integrar prompt e ações por fase; não deixar dois campos de pedido ou dois botões de geração. |
| `mosaicItems` concatena inspirações e outputs do trabalho aberto. | Separar fontes de dados, não apenas trocar o título da mesa. |
| `useCanonicalWorks` fornece um resumo com uma prévia por trabalho, sem `campaignId` público. `GET /api/creative-work` não oferece filtro de produção por campanha. | Acrescentar uma leitura adequada para o catálogo de produção. |
| Slides de carrossel são retornados separadamente dos outputs comuns. | Incluí-los explicitamente na produção, preservando a ordem e a ligação com o trabalho. |

Os caminhos de componentes acima ficam em `app/src/components/dashboard/`, `dashboard/studio-stage/` e `creative-work/`. Hooks ficam em `app/src/lib/hooks/`.

## Comportamento fechado para implementação

- **Mesa em repouso:** cartazes nítidos, switcher `Inspirações | Produção`, caixa compacta na base. Nenhum painel de configuração solto sobre os cartazes.
- **Caixa em foco:** expande para cima mantendo a base ancorada. A mesa recebe desfoque e escurecimento; os controles ficam sobre fundo suficientemente opaco para leitura. Preservar o desenho e o movimento da borda atual.
- **Entrada em foco:** edição do pedido, seleção de referência ou abertura de configurações. Trocar a visualização da mesa não inicia geração nem altera o vínculo da campanha.
- **Saída do foco:** botão visível de recolher, clique no fundo ou Escape. Se um menu/diálogo interno estiver aberto, Escape fecha esse elemento primeiro. Recolher preserva pedido, anexos, escolhas e fase do fluxo.
- **Conteúdo progressivo:** mostrar apenas controles do modo ativo. Marca aplicada, formato e referências aparecem resumidos quando recolhidos; ajustes detalhados ficam dentro da caixa.
- **Um pedido e uma ação principal:** a ação acompanha o fluxo real, inclusive organizar conteúdo, revisar plano e confirmar geração. Nenhuma cobrança ou geração nova é disparada apenas ao expandir, recolher ou alternar a mesa.
- **Escopo da produção:** com campanha selecionada/vinculada, mostrar suas peças; sem campanha, mostrar produção da marca ativa e explicitar esse escopo. Campanha continua opcional.
- **Seleção de peça produzida:** abrir a revisão existente. Reutilizar como referência é uma ação explícita e respeita o modo atual; não trocar automaticamente o protocolo.
- **Estados vazios:** informar ausência de produção e oferecer criação. Nunca preencher produção com inspirações ou trabalhos de outra campanha para ocupar espaço.

## Etapa 1 — reunir a interface dentro da caixa

Arquivos principais: `DashboardHomeActions.tsx`, `BrandStageHome.tsx`, `TalkBox.tsx`, `CreativeComposer.tsx`.

1. Manter uma única instância de `useCreativeComposer` e o fluxo atual de persistência, hidratação, revisão e geração.
2. Acrescentar estado local de apresentação para caixa expandida. Ele deve ser separado de `requestFocused`, usado pela entrevista de entrada; foco na caixa não equivale a foco no textarea.
3. Permitir que `TalkBox` receba a área contextual de controles e a ação correspondente ao fluxo, sem criar um sistema genérico de formulários.
4. Mover identidade aplicada, direções, formatos, anexos contextuais e ajustes opcionais para essa área. Extrair um componente de controles somente se necessário para compartilhar com a superfície de revisão existente.
5. Manter resultados e revisão de peças na superfície já existente. A caixa reúne a criação e seus ajustes, não toda a aplicação.
6. Preservar o estado inicial sem trabalho, continuar de onde parou, seleção de marca, associação de campanha e a entrevista progressiva.

**Aceite:** a mesa fica livre dos painéis superiores; há apenas um campo de pedido acessível; expandir/recolher não perde estado nem remonta o controlador de negócio; a revisão de trabalhos continua funcionando.

## Etapa 2 — integrar os cinco modos reais

| Modo | Conteúdo da caixa | Regra de preservação |
| --- | --- | --- |
| Variações | Referência, direções e ajustes | Reutilizar seleção, limites e validações existentes; não exigir texto quando o protocolo permite referência suficiente. |
| Peça única | Pedido, identidade aplicada e ajustes | Preservar seleção de versão da marca, origem e uso dos assets. |
| Adaptar formatos | Arte original e seleção visual de proporções | Manter formatos e referência ao recolher ou alternar visualização. |
| Mudar estilo | Arte original e referência de estilo, claramente identificadas | Preservar os papéis `content_art` e `style_reference`; não tratar os dois anexos como equivalentes. |
| Criar carrossel | Pedido e controles da fase atual | Reutilizar `CarouselComposer` e seu controlador, inclusive perguntas, sequência, aprovação e revisão. |

No carrossel, adaptar a apresentação do campo de entrada e do rodapé para aproveitar a caixa. Fases de perguntas e organização podem usar rolagem interna; a revisão final continua na superfície própria. Não desmontar o componente ao recolher e perder suas respostas locais. Uma sequência editada deve continuar exigindo a revisão/aprovação prevista no fluxo real.

Preservar confirmação de mudança de protocolo e avisos de rascunho dentro da caixa. Manter os rascunhos conforme o comportamento canônico existente; não criar uma segunda persistência baseada no protótipo.

**Aceite:** todos os modos funcionam com uma ação principal coerente, anexos corretos e mensagens de validação legíveis. Nenhum caminho do carrossel usa acidentalmente o botão genérico de geração da peça única.

## Etapa 3 — conectar Inspirações e Produção

1. Manter `useCreativeInspirations(clientProfileId)` como fonte de inspirações e o handler canônico de adicionar referência.
2. Implementar a leitura paginada de produção usando vínculos reais de workspace, marca e campanha. Não inferir campanha pelo texto da URL nem usar o fallback de marca/estúdio de `CampaignPiecesOccupancy` como prova de vínculo.
3. Proposta mínima de contrato: adicionar uma visualização de leitura em `GET /api/creative-work?view=production`, com `clientProfileId`, `campaignId` opcional, `limit` e `cursor`. Preservar o retorno padrão atual.
4. Resposta proposta: itens com identificador estável, identificador do trabalho, tipo de origem, campanha, título, prévia autorizada, formato/dimensões, data e destino de revisão; para slides, identificador do deck e posição. Paginação com `nextCursor`. Não expor chaves privadas de storage nem prompts internos.
5. Reutilizar repositórios, projeções de mídia e autorização existentes. Validar acesso ao filtro e ao resultado. Não criar tabelas, migrar dados ou fazer uma chamada de detalhes por cartaz.
6. Mostrar outputs concluídos e versões atuais dos slides concluídos, agrupando carrosséis visualmente. Não confundir uploads de referência com peças produzidas.
7. Cachear por workspace/marca/campanha e invalidar com os mecanismos existentes quando a produção mudar. Respostas atrasadas de outro filtro não podem preencher a mesa atual.
8. Acrescentar carregamento, erro com tentar novamente, vazio e acesso ao restante da produção. Preservar a composição de cartazes; com poucas peças, não duplicá-las para sugerir quantidade maior.

**Decisão para execução:** essa etapa inclui uma extensão de contrato HTTP, sujeita à aprovação prevista nas instruções do repositório. O contrato acima é a proposta concreta; não está autorizado nem implementado por este documento. Etapas de interface podem avançar independentemente quando houver pedido de implementação. Nenhuma mudança de schema é prevista.

**Aceite:** produção corresponde estritamente ao escopo indicado, contempla peças e carrosséis, não mistura referências e abre os trabalhos corretos. Alternar a mesa preserva o rascunho.

## Etapa 4 — movimento, responsividade e acessibilidade

- Reutilizar `ShineBorder` e CSS; nenhuma dependência nova. Animação sugerida de 280–360 ms, ajustada pela comparação com o protótipo.
- Aplicar desfoque à mesa, não ao ancestral da caixa. Evitar brilho, desfoque ou movimento que prejudiquem leitura e fluidez.
- Caixa limitada à altura disponível, com rolagem interna e ação principal alcançável. No celular, usar altura dinâmica da viewport e safe area; testar com teclado aberto.
- Respeitar `prefers-reduced-motion`. Não animar a reorganização inteira dos cartazes a cada caractere digitado.
- No foco, o fundo visualmente indisponível também deve sair da navegação por teclado. Restaurar foco ao recolher. Menus e diálogos renderizados em portal devem continuar utilizáveis.
- Manter labels, estados selecionados, erros e anúncios acessíveis. Preservar limite de três anexos e suas restrições atuais, inclusive no arrastar e soltar.

**Aceite:** desktop amplo, notebook e celular sem conteúdo inacessível; navegação integral por teclado; nenhum foco perdido em elementos escondidos; recolhimento sem perda de dados.

## Etapa 5 — verificação e entrega

Usar testes e infraestrutura existentes. Não executar E2E contra produção nem provedores pagos para validar esta alteração.

1. Estender testes de `DashboardHomeActions`, `CreativeComposer` e `CarouselComposer` apenas para os novos comportamentos e regressões relevantes. Incluir integração que renderize os componentes reais para detectar textarea duplicado — mocks isolados não provam isso.
2. Cobrir: expandir/recolher com preservação; troca de modo e confirmação; papéis dos anexos; uma ação por fase do carrossel; troca de mesa sem geração; resultados após conclusão.
3. Para a leitura de produção, verificar isolamento de workspace/campanha, filtros, paginação estável, ausência de duplicação e inclusão dos slides atuais. Validar que a resposta padrão da rota não mudou.
4. Rodar Vitest nos arquivos afetados, `npm run typecheck`, ESLint nos arquivos alterados e `git diff --check`, a partir de `app` quando aplicável.
5. Executar os cenários relevantes de `frictionless-home.spec.ts` e `creative-work-carousel.spec.ts` no ambiente local controlado existente. Confirmar banco de teste e `E2E_CONTROLLED_PROVIDER=true` antes da execução; os scripts não garantem isolamento por si só.
6. Inspecionar no navegador: repouso, foco em cada modo, produção vazia/preenchida, upload/erro, troca de protocolo, retomar trabalho, carrossel, viewport compacta e movimento reduzido. Capturar comparativos com o protótipo aprovado.
7. Executar `graphify update .` após alterações de código. Revisar o diff e preservar todo WIP alheio; usar staging explícito dos arquivos da tarefa.

**Conclusão local:** critérios acima atendidos, testes pertinentes passando e evidências visuais disponíveis. Aprovação visual final e publicação são etapas posteriores e distintas. Não incluir chamadas pagas ou deploy nesta implementação sem autorização específica.

## Ordem de execução e limites

Implementar na ordem 1 → 2 → 3 → 4 → 5, verificando cada trecho enquanto avança. Primeiro concluir uma passagem vertical de peça única na caixa; em seguida integrar os demais modos, com atenção especial ao carrossel. A integração de dados de produção depende da decisão sobre o contrato proposto.

Usar uma branch dedicada, sugerida `codex/studio-caixa-unificada`, e uma única implementação de negócio. Não criar outra rota de estúdio, outro motor de geração, outra persistência de rascunho ou uma cópia do protótipo em produção. O escopo não inclui redesenhar sidebar, biblioteca, marca ou editor de resultados.

Este plano foi baseado em leitura do código atual e no protótipo aprovado. Nenhum código de aplicação foi alterado e os testes da aplicação não foram executados nesta etapa de planejamento. O check do protótipo valida somente sua simulação local.
