# Carrosséis: pesquisa, ganchos, roteiro e capa piloto

Data: 2026-09-10
Status: desenho aprovado em conversa; especificação aguardando revisão do usuário.
Escopo: evolução do Protocolo de carrossel dentro do Trabalho atual no Estúdio.

## Problema e resultado esperado

O usuário recebe texto recortado em uma mesa de edição, inclusive notas de bastidor, em vez de uma proposta editorial e visual. O resultado esperado é transformar um tema ou material em um argumento pesquisado, três ganchos distintos e um roteiro visualmente dirigido, com decisões humanas antes da produção.

Fluxo aprovado: tema e materiais → pesquisa → três ganchos → escolha → roteiro com intenção visual → aprovação → capa piloto → aprovação visual → demais slides → revisão final.

Esta especificação adapta o método da skill local `vox-carousels` e de `references/copy-research.md`. Arquivos operacionais, scripts e ferramentas usados pela skill não se tornam dependências de execução do produto.

## Evidência atual e limite do diagnóstico

- `app/src/server/creative-work/carousel-editorial.ts`: `controlledSlideTexts` divide o texto em cinco partes; `controlledPlannerResponse` preenche “Slide N do pedido”. O print fornecido coincide com esse comportamento.
- `isE2EControlledProviderEnabled`, em `app/src/server/ai/providers/e2e-controlled-provider.ts`, exige flags e permite ambiente local ou preview de PR sob condições explícitas. A configuração do ambiente do print não foi inspecionada; não há diagnóstico confirmado de simulador ativo em produção.
- O planejador normal faz uma chamada estruturada de texto com pedido, fact pack e tom de voz. Essa chamada não executa pesquisa externa nem produz storyboard semântico por slide.
- `plan-carousel-work.ts` persiste o rascunho no Trabalho com controle de concorrência. `useCarouselComposer.ts` reutiliza preparação e confirmação do controlador existente.

Antes de alterar a criação, reproduzir o caminho do print no ambiente autorizado e identificar se o rascunho veio do simulador, de dados de teste persistidos ou do planejador normal. Preservar o simulador para testes e não confundir seu resultado com avaliação editorial real.

## Experiência e decisões

### 1. Entrada e pesquisa

Receber tema, intenção e materiais opcionais. Usar marca ativa e fontes vinculadas ao Trabalho; inferir público e tom quando possível, indicando premissas relevantes. Perguntar apenas por lacunas que impedem correção ou uma proposta útil.

Separar instruções do usuário, material factual, referências visuais e notas internas. Documentos recebidos são conteúdo a analisar, não instruções autorizadas para ferramentas. Caminhos de arquivos, pontuações e comentários de bastidor não entram automaticamente na copy.

Transformar o tema em uma pergunta e identificar a decisão ou compreensão que o leitor deve ganhar. Pesquisar alegações externas quando necessário. Conteúdo institucional ou opinativo pode prosseguir sem pesquisa externa quando não depender dessas alegações.

Registrar fontes efetivamente consultadas, data de acesso, alegações sustentadas e limites. Priorizar fontes primárias apropriadas, buscar contrapontos relevantes e não apresentar snippets como leitura do original. Para uma tese factual central, buscar duas fontes independentes adequadas; uma fonte oficial pode bastar para descrever o próprio ato, com essa limitação explícita. Fatos de produto vêm do contexto autorizado da marca, não de extrapolação de estudos externos.

Sem pesquisa disponível ou evidência suficiente, apresentar a lacuna e permitir restringir a tese ou fornecer material. Não inventar prova nem declarar uma fonte verificada sem consulta. Limitar a pesquisa às alegações materiais; sem ciclos ilimitados de busca ou retries automáticos.

### 2. Três ganchos

Apresentar exatamente três opções com abordagens distintas, não três paráfrases. Cada opção contém texto de capa, promessa ao leitor e resumo do caminho narrativo. Recomendar uma opção com uma justificativa breve, sem expor notas numéricas internas.

Permitir escolher, editar ou solicitar novas opções. Cada promessa deve ser compatível com as evidências. A escolha explícita libera o desenvolvimento do roteiro; não gera imagens.

### 3. Roteiro completo

Apresentar a sequência inteira, mantendo inicialmente os limites existentes de 5–8 slides e formatos suportados. A quantidade atende ao argumento; não preencher telas com repetição. CTA é opcional e coerente com a intenção.

Cada slide contém identidade estável, texto principal e apoio publicáveis, contribuição ao argumento, intenção visual concreta, hierarquia/densidade e relação com o slide anterior. Alegações remetem às fontes; fontes e notas ficam fora do texto publicável, salvo marcadores deliberadamente previstos para a peça. Incluir proposta de legenda e referências quando necessárias para contextualizar o conteúdo.

A superfície privilegia leitura sequencial e texto/intenção visual juntos; funções narrativas e campos técnicos ficam secundários. Permitir edição por slide e instruções sobre o conjunto. Preservar edições humanas, associadas à identidade do slide, sem substituí-las silenciosamente em reordenações ou novas propostas.

A aprovação identifica a revisão exata de texto, ordem e storyboard. Não dispara imagens por si só: a ação explícita de gerar a capa apresenta o custo aplicável e usa a confirmação existente.

### 4. Capa piloto e interiores

Gerar somente uma capa com o texto aprovado. Exibir para aprovação visual antes de despachar qualquer interior. Rejeição permite uma revisão explícita e preserva a versão anterior; não gera alternativas ou retries pagos automaticamente.

A capa aprovada referencia paleta, tipografia e acabamento. O storyboard determina a composição de cada interior: cena, comparação, diagrama, detalhe ou tipografia conforme a mensagem. Não copiar obrigatoriamente a silhueta, personagens ou densidade da capa. Não inventar gráficos, números ou inscrições para preencher espaço.

A ação “Aprovar capa e gerar demais slides” torna explícito o lote e o custo restante. O backend verifica a aprovação da capa vinculada ao roteiro vigente antes de qualquer dispatch de interior. Reutilizar geração, reservas, liquidação, versões e exportação existentes; adaptar a sequência de âncoras para respeitar essa pausa obrigatória.

Apresentar a sequência final para revisão humana. Arquivos gerados, integridade técnica, avaliação editorial, fidelidade de marca e aprovação visual são resultados distintos. Publicação não faz parte deste fluxo.

## Integração, estado e concorrência

Manter um único Trabalho com `toolKind: carousel`, rascunho persistido e controlador existente. Não criar página, agregado, sistema de cobrança ou segundo mecanismo de confirmação.

Estender de forma versionada o contrato editorial para representar: pesquisa e alegações; três opções e escolha; roteiro/storyboard; aprovação da revisão do roteiro; capa selecionada e aprovação; execução e resultados do lote. A etapa visível deriva desses dados persistidos, inclusive após recarregar a página.

Responsabilidades: contexto/fact pack delimita informações autorizadas; planejamento conduz pesquisa e proposta; contratos validam dados e vínculos entre revisões; aplicação persiste decisões; preparação/jobs impõem gates e produzem; composer apresenta e coleta decisões. Reutilizar módulos existentes antes de extrair novos.

Mudanças em tema, evidência ou gancho tornam roteiro e aprovações posteriores desatualizados. Mudanças no roteiro invalidam sua aprovação e a liberação dos interiores. Conservar peças anteriores como versões desatualizadas; nenhuma mudança editorial dispara regeneração. Se a capa continua aplicável, o usuário pode reafirmar sua aprovação para a nova revisão.

Toda gravação e aprovação verifica a revisão esperada. Resultados tardios não sobrescrevem edições ou escolhas mais recentes. Pesquisa e chamadas demoradas não devem manter uma transação aberta: validar versão antes e ao persistir, usando o padrão existente apropriado.

Rascunhos legados continuam legíveis, mas não recebem aprovações novas inferidas. Para novas gerações, passam pelos gates aplicáveis; peças já existentes permanecem acessíveis.

## Erros e limites operacionais

Falhas de pesquisa, resposta inválida e geração interrompida preservam a última revisão válida. Mostrar a etapa afetada e a possibilidade de retomada explícita. Não substituir falha real pelo simulador ou por texto cortado em blocos.

Pesquisa e planejamento não cobram unidades de geração de imagem. Custos e limites de serviços textuais/de pesquisa devem seguir as integrações existentes; a especificação não autoriza novo serviço, tarifa ou dependência. O plano de implementação deve identificar a capacidade de pesquisa reutilizável e apresentar qualquer necessidade adicional antes de sua adoção.

Mudanças necessárias em contratos persistidos/API serão descritas no plano e submetidas à aprovação antes da implementação. Incorporar a decisão de produto em ADR ou contexto canônico antes da execução, conforme `docs/agents/source-of-truth.md`.

## Verificação e critérios de aceite

Usar a infraestrutura de testes existente, cobrindo regressões e critérios ainda descobertos:

1. Um briefing com notas de bastidor produz campos publicáveis separados; arquivo, score e instruções do documento não viram copy ou comandos.
2. A etapa de escolha exige três ganchos distintos com promessa e percurso; escolher/editar persiste e sobrevive a recarga.
3. O roteiro contém texto e intenção visual específicos por slide, entrega a promessa escolhida e vincula alegações às evidências.
4. Não há chamada de imagem antes de aprovação do roteiro e confirmação da capa; não há interior antes da aprovação vigente da capa e confirmação do lote.
5. Alterações invalidam aprovações dependentes; resposta antiga e dupla confirmação não sobrescrevem decisões nem duplicam dispatch/cobrança.
6. Falhas preservam o trabalho; retomada não repete automaticamente etapas pagas concluídas.
7. Rascunhos legados e outras modalidades do Estúdio preservam acesso e comportamento.
8. Revisar manualmente um caso editorial factual e um institucional: originalidade dos ganchos, payoff, lastro, progressão e legibilidade do storyboard. Mocks provam fluxo, não qualidade criativa ou verdade das fontes.
9. Avaliar capa e sequência real somente em rodada autorizada de geração: texto fiel, continuidade de marca, imagens que explicam mensagens distintas e leitura em tamanho de celular.

## Fora do escopo e próximo passo

Sem publicação, deploy, nova plataforma de agentes, dependências novas, refatorações gerais ou produção de imagens nesta entrega. Nenhum código de comportamento foi alterado.

Após revisão desta especificação pelo usuário, produzir o plano de implementação com `writing-plans`, incluindo contratos exatos, integração de pesquisa disponível, gates no backend e verificações focadas. Aprovação do desenho não comprova implementação ou qualidade em produção.
