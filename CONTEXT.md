# CONTEXT — ADScale

> **Fonte canônica do "o que é o ADScale, em que acredita, e como opera."**
> Tudo passa pelo crivo da tese central **inteligência criativa em escala** (antes chamada "Curator > operator", reformulada em 2026-06-27).
> Última atualização: 2026-10-08 (marca ativa e uma Conta por marca, caminho único 2B).

---

## 1. Visão geral (uma frase)

ADScale é a infraestrutura da **inteligência criativa em escala** pra produção de criativos de performance. O humano deixa de ser **operator** (quem executa cada variação manualmente) e vira **quem decide**: define a intenção e o resultado desejado em um pedido, supervisiona a geração, aprova/descarta e itera. A IA infere o briefing operacional e os detalhes de produção a partir desse pedido, da marca e das referências; revisar esses dados é uma opção, não uma etapa obrigatória.

A IA **reposiciona** o humano. Não substitui. [isso ficou vago e pouco rescritivo. tá muito lúdico]

### Vocabulário operacional

- **Generation Settlement (liquidação de geração):** ciclo que garante cobrança, reserva do trabalho, dispatch, compensação quando o dispatch falha, reativação em retry e refund terminal. Não inclui definir preço, produzir a imagem ou avaliar sua qualidade.
- **Contexto autorizado:** pedido do operador, marca ativa e fontes explicitamente ligadas ao Creative Work; histórico amplo do workspace não entra por padrão.
- **Fonte factual:** origem que pode sustentar produto, oferta, benefício, preço ou outro claim da peça — pedido, fonte marcada como conteúdo ou identidade da marca.
- **Referência visual:** ativo aprovado usado para orientar linguagem visual, composição e repertório; não sustenta fatos de campanha.
- **Direção inferida:** hipótese operacional sobre objetivo, público, mensagem ou tom, criada a partir do contexto autorizado; não é fato confirmado.
- **Briefing inferido:** projeção versionada da intenção e da direção criativa, com cada campo marcado como sustentado, inferido ou desconhecido.
- **Prontidão do briefing:** estado que distingue direção pronta para geração normal (`ready`), teste visual sem claims factuais (`exploratory`) e ausência de direção segura ou conflito aberto (`blocked`).
- **Briefing inferido:** visão editável que combina a direção da peça com fatos sustentados pelo contexto autorizado. Cada campo permanece distinguível como sustentado, inferido ou desconhecido; desconhecidos não recebem valores genéricos.
- **Prontidão do briefing:** estado que distingue direção pronta para geração normal, direção apenas exploratória sem claims e ausência de direção segura para gerar. Oferta, benefício, preço e outros fatos desconhecidos nunca são preenchidos para alcançar prontidão.
- **Avaliação inconclusiva:** resultado pós-geração em que a integridade da peça não pôde ser confirmada nem refutada. A peça permanece disponível para decisão humana, mas não conta como aprovação automática.
- **Veredito objetivo:** avaliação automática de integridade expressa como aprovado, reprovado ou inconclusivo. Não deriva do score subjetivo.
- **Aprovação humana:** decisão explícita do operador de selecionar uma Peça. Pode confirmar um veredito inconclusivo ou ausente, mas nunca substituir uma reprovação objetiva. Seleção feita por um agente via MCP não é Aprovação humana.
- **Seleção por agente:** ato de um agente, via MCP, de selecionar uma Peça em nome de um operador. Respeita a reprovação objetiva. Não conta como Aprovação humana em métricas nem na Calibração da marca até o operador confirmar.
- **Dono da plataforma:** operador autorizado a acessar dados e ferramentas globais do ADScale entre workspaces. Não equivale a owner ou admin de um workspace.

### Modelo de produto canônico

**Trabalho**:
Unidade criativa retomável que reúne intenção, briefing, fontes, estado e resultados sob uma marca.
_Evitar_: Campanha como sinônimo, job, projeto.

**Campanha**:
Agrupamento opcional de Trabalhos que compartilham uma iniciativa, objetivo ou período.
_Evitar_: Trabalho, pasta.

**Protocolo**:
Modo de criação aplicado a um Trabalho, como Variações, Peça única, Adaptar formatos ou Mudar estilo.
_Evitar_: ferramenta, fluxo, tipo de campanha.

**Rascunho**:
Estado editável e retomável de um Trabalho, sempre vinculado a um único Protocolo. Trocar de Protocolo preserva o Rascunho atual em vez de convertê-lo.
_Evitar_: sessão temporária, formulário descartável.

**Peça**:
Resultado visual produzido por um Trabalho, independentemente do Protocolo usado.
_Evitar_: output, asset gerado, derivação.

**Seleção por agente**:
Ato de um agente, via MCP, de selecionar uma Peça em nome de um operador. Fica registrada como seleção por agente, distinta da Aprovação humana. Respeita a reprovação objetiva e não alimenta métricas nem a Calibração da marca até o operador confirmar.
_Evitar_: Aprovação humana, aprovação automática.

**Direção de arte**:
Disciplina que interpreta o problema de comunicação, identifica oportunidades de composição e conduz criação, crítica e refinamento de uma Peça com julgamento contextual e repertório da marca.
_Evitar_: execução literal de regras, mera aplicação de estilo.

**Pessoa da marca**:
Pessoa identificada pelo operador por um nome e referências visuais, que pode ser citada no briefing para aparecer em uma Peça com sua identidade e características anatômicas preservadas.
_Evitar_: mascote, persona de público, usuário da plataforma.

**Linguagem visual da marca**:
Conjunto de escolhas e padrões visuais adequado a um contexto de comunicação, que compartilha a identidade comum da marca e pode ser citado no briefing. Uma marca pode ter várias linguagens, cuja aplicação depende do pedido.
_Evitar_: identidade inteira da marca, template fixo.

**Calibração da marca**:
Etapa do treinamento em que o operador avalia Peças de teste para aferir e ajustar como o sistema compreende e aplica o repertório da marca. O julgamento dessas Peças orienta o aprendizado destinado a trabalhos futuros.
_Evitar_: aprovação de publicação, refinamento de uma única Peça.

**Variação**:
Peça criada como alternativa relacionada a uma base, direção ou Peça anterior.
_Evitar_: versão, derivação.

**Estúdio**:
Superfície operacional para começar ou retomar um Trabalho.
_Evitar_: Início, Dashboard como nome visível.

**Visão geral**:
Superfície gerencial secundária para acompanhar indicadores, atividade e itens que exigem atenção.
_Evitar_: Dashboard como nome visível.

**Anúncios veiculados**:
Superfície de leitura da marca ativa para os Anúncios veiculados das Contas de anúncios vinculadas. Destino próprio da navegação principal, distinto de Estúdio, Trabalhos, Biblioteca e Marcas.
_Evitar_: Relatório, Insights, Criativos, Performance, Visão geral.

**Conexão Meta**:
Login autorizado de um workspace junto ao Meta, que expõe as contas de anúncios acessíveis ao operador. Pertence ao workspace, não a uma marca; estados: ativa, expirada, revogada, com erro. Criada e desfeita por owner ou admin.
_Evitar_: integração (nome da aba, não do objeto), conta conectada.

**Conta de anúncios**:
Conta do Meta Ads exposta por uma Conexão Meta. Pode ser vinculada a no máximo uma marca; uma marca pode ter várias. O vínculo é feito por owner ou admin; membros leem o que a marca enxerga.
_Evitar_: ad account, conta do cliente.

**Ditado**:
Entrada do pedido por fala na caixa do Estúdio: o que o operador diz vira texto editável, com limpeza leve (remover hesitações e repetições, pontuar, capitalizar) que preserva toda palavra de conteúdo na mesma ordem. Não reescreve, não resume, não estrutura em briefing. O texto ditado é palavra do operador e integra o Contexto autorizado como qualquer texto digitado.
_Evitar_: voz (reservado para voz da marca), input de voz, comando de voz, speech-to-text.

**Anúncio veiculado**:
Criativo que rodou de fato numa Conta de anúncios, com gasto e métricas reais, trazido para o ADScale para leitura e análise. A identidade é a spec completa (mídia, texto e CTA): a mesma peça reutilizada em vários ads da Meta é um só; a mesma mídia com texto diferente são Anúncios veiculados distintos. Um carrossel é um Anúncio veiculado; cada card não é uma linha. Um anúncio com variação dinâmica de assets na Meta também é um só; combinações de asset não viram linhas. Campanha e conjunto não são a unidade de análise. Pertence à Conta de anúncios e é visto pela marca vinculada. Não é Peça (não foi produzido por um Trabalho) nem Referência visual (não orienta geração).
_Evitar_: criativo importado, ad, asset do Meta, campanha, conjunto.

### ADScale Equipe — operação de marketing (ADR 0019)

A Equipe **opera sobre** Trabalhos e Peças. Não é outro produto nem outro pipeline criativo: toda Peça continua nascendo de um Trabalho, por um Protocolo.

#### Plano do workspace × status da Conta — decisão aceita em 2026-10-07

A etapa 2A do Caminho único, cuja execução foi autorizada pelo dono, separa o **plano do workspace** das **capacidades da Conta**. Este é o registro canônico dessa decisão; os planos de execução continuam propostas e não comprovam entrega.

- O teto vitalício de IA de US$ 1, a reserva do diagnóstico, o card do plano, a recusa de anexos e as ferramentas reduzidas do Estrategista valem para uma Conta `free` somente enquanto seu workspace não paga.
- O workspace paga quando tem outra Conta em um dos status pagos da Equipe ou acesso pago clássico vigente. O acesso clássico conserva a regra existente: assinatura ativa; `past_due` na carência de sete dias com fatura paga em dinheiro; testador vigente; ou dono da plataforma entre os membros. Trial, beta e assinatura ainda `trialing`/`checkout_completed` não bastam. Não se redefine cobrança nem conversão nesta etapa.
- Uma Conta `free` nesse workspace continua `free`, sem serviço de produção contratado. Usa o teto mensal por Conta (`EQUIPE_AI_MONTHLY_BUDGET_USD_CENTS`, mês civil de São Paulo), aceita imagens autorizadas e conversa com o contexto da marca no modo `talk`, apenas com `sugerir_proximos_passos` e sem oferta de plano. Comandos, delegação de produção, crons e staff continuam sujeitos ao status da Conta.
- A regra de pagamento é consultada por chamada, no HTTP, nos jobs e no worker. Sem evidência de pagamento, os limites grátis permanecem. O teto mensal também deve ser conferido antes da leitura visual; seu esgotamento é temporário, enquanto o teto vitalício do grátis continua definitivo.

Esta decisão não aprova, por si, as decisões da etapa 2B (registradas na seção seguinte); tampouco criação pela conversa, uma nova reserva mensal transacional ou mudanças de dinheiro. O [plano 2A](docs/superpowers/plans/2026-10-07-caminho-unico-etapa-2a-plano-gratis-por-workspace.md) é a receita de implementação, e a [spec, seção 3](docs/superpowers/specs/2026-10-07-caminho-unico-design.md) registra o desenho aprovado. Aceitar a regra não comprova merge, deploy ou uso real.

#### Marca ativa e uma Conta por marca — decisão aceita em 2026-10-08

A etapa 2B do Caminho único, com as decisões confirmadas pelo dono em 2026-10-08, faz a casca nova trabalhar por marca. Este é o registro canônico dessa decisão; o plano de execução continua proposta e não comprova entrega.

- A marca ativa vem de um cookie que o servidor confere contra as marcas do workspace. Sem cookie válido (ou com uma marca de outro workspace) vale a marca da Conta viva mais antiga do workspace, isto é, a mais antiga que não está encerrada, e, se não houver nenhuma, a marca mais antiga (decisão do dono em 2026-10-08, para que a primeira visita depois do deploy não abra Conta nova para quem já tem conversa). No plano grátis vale sempre a marca da Conta grátis, mesmo encerrada.
- Cada marca abre a própria Conta na primeira visita, sob a mesma trava por workspace: uma Conta por marca. No plano grátis há uma marca só; outra marca pede o plano, e criar outra marca é recusado. Uma Conta grátis encerrada pela operação continua sendo a do workspace, nunca uma Conta nova.
- Num workspace que paga, uma marca com Brand Kit (logo ou cores) abre a Conta com o handoff concluído por importação e uma conversa principal nova; a conversa antiga do Assistente clássico não é adotada. No plano grátis toda marca passa pelo handoff, porque a leitura e o diagnóstico são o que o plano oferece; o resumo grava a identidade confirmada no Brand Kit. Marca sem identidade passa pelo handoff do zero em qualquer plano.
- Toda Conta nova de uma marca que já existe começa com uma conversa principal nova, não só na importação: a conversa antiga do Assistente clássico dessa marca não é adotada e continua no banco.
- O seletor de marca fica no topo do trilho, no lugar do botão de nova conversa; a conversa paralela nasce no painel de conversas. Biblioteca, Criações, Pipeline, Ideias, Metas e o composer seguem a marca ativa, e um link para a Conta de outra marca troca a marca ativa.
- Em Criações, as campanhas sem marca (antigas, do Estúdio clássico) aparecem em todas as marcas do workspace, como os arquivos sem marca na Biblioteca; os Trabalhos sempre têm marca.
- No trilho, Pipeline, Ideias e Metas de uma marca que ainda não tem Conta mostram a tela vazia, cujas sugestões abrem a conversa da marca (e, com ela, a Conta).
- Uma marca com Conta não pode ser apagada.

Esta decisão não aprova a leitura opcional do site e do Instagram para uma marca importada, a passagem dos pagantes sem Conta para o caminho único (etapa 3) nem mudanças de dinheiro. O [plano 2B](docs/superpowers/plans/2026-10-07-caminho-unico-etapa-2b-marca-ativa.md) é a receita de implementação.

#### Caminho único para todos — decisão aceita em 2026-10-08

O ADScale não tem clientes pagantes (dono, 2026-10-08). A etapa 3 do Caminho único deixa de ser uma virada com convivência e junta a limpeza da etapa 4. Este é o registro canônico; o [plano da etapa 3](docs/superpowers/plans/2026-10-08-caminho-unico-etapa-3-para-todos.md) é a receita.

- Todo workspace, pague ou não, vê a casca nova e a conversa em `/`. Não existe mais a regra que deixava um workspace que paga, sem Conta viva, no produto clássico.
- Um workspace que paga e abre a primeira Conta segue a regra da importação: marca com Brand Kit entra sem handoff, com conversa nova.
- Não há interruptor do produto. Parar as publicações é a parada global da operação; voltar atrás é reverter o deploy.
- A casca clássica, o `/assistant` clássico e a home do Estúdio em `/` saem. O composer continua em `/creative-work/new`.
- Um link para a conversa de outra marca troca a marca ativa, como o `?account=`. No plano grátis, preso a uma marca, ele volta para `/`.
- A conversa de uma Conta encerrada abre só para leitura, com "Falar com uma pessoa".
- Fica um e-mail de boas-vindas, o da primeira abertura. O trial de 500 créditos do cadastro continua (decisão do subprojeto 3).

**Equipe**:
Serviço de operação de marketing de uma conta, conduzido por uma equipe de IA, com pessoas nossas só na calibração, nos escalonamentos e nas exceções. Vive no mesmo app, sem switch.
_Evitar_: produto separado, agência (como nome de produto), "modo Equipe".

**Estrategista IA**:
Agente que conduz a conta: guia a Implantação, propõe o Plano e as Ideias, distribui o trabalho aos especialistas, cobra pendências e fala com o cliente na conversa. Abre Exceção de atendimento quando não resolve. Nunca aprova nem altera o próprio Mandato.
_Evitar_: estrategista (sem "IA", reservado a pessoa), assistente, bot.

**Especialista IA**:
Agente com um papel de produção: Pesquisa, Redação, Direção de arte (usa o motor do ADScale) ou Mídia e mensuração. Aparece pelo papel, com selo IA, sem nome nem foto.
_Evitar_: persona, colaborador, nomes próprios para agentes.

**Revisor IA**:
Agente que confere texto ou imagem antes do cliente e aponta problemas. O revisor de texto usa um modelo diferente do autor. Detecta; não reescreve nem aprova.
_Evitar_: aprovador, validador automático.

**Aprovador**:
Pessoa do cliente indicada no contrato, com um **Substituto**, que dá a Aprovação humana de Itens, Plano e Mandatos e confirma fatos do negócio. Membros do cliente veem e comentam, mas não aprovam.
_Evitar_: operador (no contexto da Equipe), usuário (genérico), admin.

**Custodiante**:
Pessoa do cliente que conecta uma conta externa (Instagram, Meta Ads, analytics). Conectar não dá acesso a aprovações nem liga nenhuma ação.
_Evitar_: dono da conta, admin.

**Implantação**:
Caminho do contrato assinado até a Conta ativa, guiado pelo Estrategista IA: Escopo, Coleta, Contexto de marketing, Marca criativa, Conexões, Plano e mandatos, e Calibração da frente. Lembretes com teto; parada longa vira "implantação pausada".
_Evitar_: onboarding (na UI), setup.

**Contexto de marketing**:
Registro versionado do negócio do cliente (o que vende, público, posicionamento, canais, políticas), aprovado por seção. Cada campo é sustentado, inferido ou desconhecido, e desconhecidos não recebem valor. Oferta e preço vêm do catálogo do ADScale, nunca do Contexto.
_Evitar_: briefing (reservado ao Trabalho), persona, documento-base.

**Frente**:
Linha de trabalho contratada numa conta, como Social · Instagram ou Mídia paga. Calibração, liberação e pausa valem por Frente.
_Evitar_: canal (uma Frente pode usar mais de um), campanha.

**Plano**:
Plano do ciclo de uma conta: metas, Frentes e ritmo do calendário. Proposto pelo Estrategista IA e versionado. Só vale com Aprovação humana e Recibo. "Todo o marketing" vive no Plano; o que é executado é só o contratado.
_Evitar_: estratégia (genérico), roadmap, plano de mídia.

**Mandato**:
Regra aprovada pelo Aprovador que autoriza a Equipe a agir sozinha dentro de limites (ação, conta, formatos, versão, quantidade, janela, validade, condição de parada). Regras de desempenho nascem em **modo sombra**, que mostra o que faria sem efeito real.
_Evitar_: automação, permissão, regra (sozinho, na UI técnica).

**Item**:
Unidade que pode sair para fora: um post (imagem + legenda + conta + data e hora) ou a Peça escolhida por ângulo num lote de criativos. Cada Item tem um estado só, e o mais restritivo vence.
_Evitar_: post (quando for criativo de mídia), tarefa, card.

**Versão (de Item)**:
Estado imutável de um Item. Editar a legenda ou pedir ajuste cria uma Versão nova, e uma aprovação vale só para a Versão vista.
_Evitar_: revisão (na UI), Variação (reservado a alternativas de Peça).

**Lote**:
Conjunto de Itens entregue para decisão de uma vez, com prazo. "Aprovar todos os prontos" aprova só uma lista fechada de Itens e Versões.
_Evitar_: pacote, batch.

**Recibo**:
Registro imutável de uma Aprovação humana: pessoa, papel (Aprovador ou Substituto), objeto e Versão, data e hora. Depois da publicação, guarda também o resultado. "Aprovado" só aparece com Recibo.
_Evitar_: log, confirmação (genérico).

**Calibração da frente**:
Rodadas semanais em que as primeiras entregas reais de uma Frente são pontuadas pela qualidade humana antes de chegar ao cliente. A nota que vale é a da primeira versão da IA. Três rodadas seguidas no critério liberam a Frente; falha crítica depois disso reabre a calibração.
_Evitar_: Calibração da marca (é outra coisa: Peças de teste avaliadas pelo operador no treinamento da marca), aprovação.

**Frente liberada**:
Frente que passou na Calibração da frente. A revisão de rotina passa a ser só dos Revisores IA, com um monitor automático. A primeira Frente liberada torna a conta **ativa**.
_Evitar_: conta liberada, go-live.

**Escalonamento**:
Exceção de conteúdo, técnica ou de segurança, com responsável humano (qualidade ou operação), gravidade e prazo. O que está em risco fica bloqueado até a resolução; fechar, retomar a Frente e recalibrar são decisões separadas.
_Evitar_: ticket, incidente (reservado ao Escalonamento crítico), bug.

**Exceção de atendimento**:
Caso em que uma pessoa do atendimento entra na conversa porque a IA não levou a conta adiante ou o cliente pediu uma pessoa. Tem motivo registrado e prazo, e termina devolvendo a conta ao Estrategista IA.
_Evitar_: suporte (genérico), chamado, atendimento (como rotina).

**Pausa**:
Interrupção com três níveis:
- **publicação:** nada externo sai, e os Itens agendados ficam **segurados**;
- **execução:** em segurança ou incidente entre contas, a IA, a recuperação de contexto e as entregas afetadas param;
- **inadimplência:** o trabalho futuro para; exportação e revogação continuam.

Retomar revalida cada Item segurado antes de enviar.
_Evitar_: desligar, congelar (reservado ao congelamento de módulos).

**Despacho de publicação**:
Passo que envia um Item aprovado para fora. Só envia se valerem, no momento do envio: Mandato, conexão verificada, Recibo da Versão, conferência (na calibração), janela, limites e ausência de Pausa ou bloqueio. Persiste a intenção antes de enviar, usa chave de idempotência e reconcilia quando o resultado é incerto.
_Evitar_: postar, disparo, automação de publicação.

---

## 2. Tese central

> **Inteligência criativa em escala.**

Worldview-level, não feature-level — é o que diferencia ADScale de AdCreative.ai / Pencil / Madgicx (que vendem "IA gera"). A IA faz o operacional; o humano decide o estratégico; os dois viram hábito.

Detalhe completo: `[marketing/brand/conceituacao.md](marketing/brand/conceituacao.md)` (Pacote Conceitual v0, 2026-06-24).

---



## 3. ICP (público-alvo)

- **ICP raiz:** qualquer pessoa/time que produz criativos pra ads pagos (Meta, TikTok, Google) e sente gargalo de produção.
- **Sub-ICP rotativo:** designer freelancer / time interno / agência (5–30) / e-com ou SaaS.
- **Anti-ICP:** quem quer "IA que faz tudo", quem produz criativo artesanal de marca, quem prefere contratar +1 designer.
- **Escala = Volume + Velocidade + Variedade** (sem destaque a uma dimensão).

Detalhe: `[marketing/social-media/canais/_shared.md](marketing/social-media/canais/_shared.md)` §1.

---



## 4. Os 3 pilares Lab Notes (canônico a partir de 2026-06-25)


| Pilar | Nome                        | Peso    | O que defende                                                                                                                                | Esqueleto                                                                 |
| ----- | --------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **A** | **Lab Notes — Tese**        | **40%** | Opinião fundamentada. Defende a tese da **inteligência criativa em escala**: IA reposiciona, não substitui. Mercado, hype, polêmica. {{ status: 2026-06-27 — claim reformulado de "Curator > operator" pra "inteligência criativa em escala" }} | Provocação → argumento → prova, ou Mito → realidade → como                |
| **B** | **Lab Notes — Experimento** | **40%** | Processo, números, throughput. Bastidor técnico. Como o ADScale funciona. Educação prática.                                                  | Premissa → gargalo → tese → demo → evidência, ou Passo a passo imperativo |
| **C** | **Lab Notes — Bastidor**    | **20%** | Pegada pessoal do Jhonatan. O que aprendeu construindo. Decisões técnicas. Build in public.                                                  | Essa semana → o que aprendi, ou Antes/depois + número                     |


**Vocabulário unificador:** paper, hipótese, grupo de controle, grupo experimental, anomalia, significância estatística, double-blind, lab notebook. Copy concreta (sem pseudo-ciência), mas PERSONA verbal de laboratório.

Detalhes: `[marketing/brand/mensagens-chave.md](marketing/brand/mensagens-chave.md)` v2 + ADR `[0001-pilares-3-lab-notes.md](docs/adr/0001-pilares-3-lab-notes.md)`.

---



## 5. Tom de voz (resumo)


| Adjetivo     | O que significa                                                 | O que **não** é                         |
| ------------ | --------------------------------------------------------------- | --------------------------------------- |
| **Expert**   | Domínio técnico do problema. Números, modelos, casos.           | Não é pedante, não é coach, não é guru. |
| **Fast**     | Respeita o tempo do leitor. Copy curta, sem enrolação.          | Não é raso, não é clickbait.            |
| **Creative** | A forma acompanha o conteúdo. Visual bem feito, copy com ritmo. | Não é "diferentão", não é performático. |


**Pesos da pegada pessoal (ADR 0008):** 80% founder-pessoal / 20% pessoal-profissional / 0% íntimo.

**Humor:** obrigatório, deadpan britânico (Monty Python / Black Books / Mitchell & Webb / Peep Show / Detectorists / Fawlty Towers / Rick & Morty / Silicon Valley / Sheldon / Hitchhiker's Guide). Metalinguagem permitida.

**Vedado:** "enfim, esse tipo de coisa", tom blasé, vocabulário sneaker/RAD (drop, hype, cool, streetwear, limited edition), "TL;DR" no fim.

Detalhes: `[marketing/brand/conceituacao.md](marketing/brand/conceituacao.md)` Parte 3 + ADR `[0008-tom-founder-pessoal.md](docs/adr/0008-tom-founder-pessoal.md)`.

---



## 6. Cadência semanal — Q3 (YouTube congelado + Brasil-only + Threads)

**Efetiva no Q3 (até set/2026):** 3 IG + 3 LI = **6 peças com criação original/semana** + Threads reaproveita (~3 posts/sem adicionais, ~5 min cada = ~15 min total/sem).


| Dia     | Pilar           | Canal                    | Formato                                | Tempo  |
| ------- | --------------- | ------------------------ | -------------------------------------- | ------ |
| **Seg** | A — Tese        | Instagram                | Carrossel híbrido 7 slides (1080×1350) | 60 min |
| **Ter** | A — Tese        | LinkedIn                 | Post longo PT-BR (1.200–1.500 chars)   | 45 min |
| **Qua** | B — Experimento | Instagram                | Reels Lab Notes (60–90s)               | 60 min |
| **Qui** | C — Bastidor    | LinkedIn                 | Post texto PT-BR (micro 200–400 ou long) | 45 min |
| **Sex** | B + C           | IG Reels curto + LI post | 2 peças                                | 60 min |
| Todos   | (reaproveitamento) | Threads                | Texto curto + link (recap do LI/IG)    | 5 min/dia útil |


**Total mensal:** ~24 posts IG+LI + ~12 posts Threads (reaproveitados) = ~36 publicações, ~24 com criação original.

**Cadência "framework" original (com YouTube no escopo):** 7 peças/sem com Short na sexta. Voltava a valer se ADR 0009 fosse desativado, mas **YouTube EN trilha sai também** (ADR 0010 — Brasil-only).

Detalhes: [`marketing/social-media/calendario/semanal-v2.md`](marketing/social-media/calendario/semanal-v2.md) + ADRs:
- [`0002-cadencia-semanal.md`](docs/adr/0002-cadencia-semanal.md) (framework original)
- [`0009-youtube-congelado-q3.md`](docs/adr/0009-youtube-congelado-q3.md) (Q3 corta YouTube inteiro)
- [`0010-brasil-only-suspende-bilingue.md`](docs/adr/0010-brasil-only-suspende-bilingue.md) (LinkedIn vira PT-BR, EN sai)
- [`0011-threads-como-canal-novo.md`](docs/adr/0011-threads-como-canal-novo.md) (Threads substitui YouTube)

---



## 7. Ritual semanal (âncora domingo)


| Quando              | O quê                                                                                                                          | Duração       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| **DOM 19h–21h**     | Sessão-âncora: Banco de Teses + Fontes Tier 1 + `01-ideias.md` → 7 briefs no `02-briefs.md` (no Q3, **6 briefs** com ADR 0009) | **2h**        |
| **SEG 8h**          | Checkpoint Mavis (revisão automatizada de 3 briefs)                                                                            | 30 min        |
| **SEX 17h**         | Review semanal: métricas, retroalimentar Banco de Teses                                                                        | 30 min        |
| **Produção diária** | Executar peça do dia conforme `02-briefs.md`                                                                                   | 45–60 min/dia |


**Total semanal:** ~~3h gestão + ~4h produção = **~~7h/semana** (Q3 sem Short).

Detalhes: `[marketing/2026-Q3/ritual-semanal.md](marketing/2026-Q3/ritual-semanal.md)` + ADR `[0003-ritual-semanal-ancora-domingo.md](docs/adr/0003-ritual-semanal-ancora-domingo.md)`.

---



## 8. Stack de qualidade (4 blocos)


| #     | Bloco              | Frequência                    | Função                                               |
| ----- | ------------------ | ----------------------------- | ---------------------------------------------------- |
| **1** | **Consumo**        | Diário (30 min)               | Ler/assistir referências do ICP. Banco de inputs.    |
| **2** | **Pesquisa**       | Semanal (60 min DOM)          | Concorrentes + SEO + trends.                         |
| **3** | **Banco de Teses** | Contínuo                      | Toda ideia vira 1 tese (claim + prova + implicação). |
| **4** | **Revisão Mavis**  | Toda peça (antes de publicar) | Gatekeeper de tom, pilares, anti-padrões.            |


Stack de produção entra **depois**, quando a cadência travar.

Detalhes: `[marketing/2026-Q3/stack-qualidade.md](marketing/2026-Q3/stack-qualidade.md)` + ADR `[0004-stack-qualidade.md](docs/adr/0004-stack-qualidade.md)`.

---



## 9. Fontes de pauta (Tier 1/2/3)


| Tier         | Peso                 | Fontes                                                                                                                                                                         |
| ------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Tier 1**   | **60%**              | Perguntas reais do ICP (DMs, comentários, e-mails) + Bastidor ADScale + Trends do nicho                                                                                        |
| **Tier 2**   | **30%**              | Concorrência (AdCreative.ai, Pencil, Madgicx, Canva, Adobe Firefly, Midjourney) + SEO (palavras-chave que o ICP busca)                                                         |
| **Tier 3**   | **10%**              | Newsletters (Lenny's, Marketing Brew, The Verge AI, Benedict Evans, Casey Winters) — leitura, não cópia                                                                        |
| **Tier 3.5** | 8 perfis (ciclo W26) | Top perfis que Jhonatan acompanha pra kibar — ver lista em `fontes-pauta.md` [§4.5](marketing/2026-Q3/fontes-pauta.md#45-tier-35--top-perfis-que-jhonatan-acompanha-pra-kibar) |


Detalhes: `[marketing/2026-Q3/fontes-pauta.md](marketing/2026-Q3/fontes-pauta.md)` + ADR `[0005-fontes-pauta.md](docs/adr/0005-fontes-pauta.md)`.

---



## 10. Estado atual (2026-06-27)


| Status         | Item                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------- |
| ✅ Trava        | 3 pilares Lab Notes definidos                                                                 |
| ✅ Trava        | Cadência semanal framework aprovada (ADR 0002)                                                |
| ✅ Trava        | YouTube congelado Q3 (ADR 0009) — cadência efetiva vira 6 peças/sem                           |
| ✅ Trava        | Stack de qualidade definido                                                                   |
| ✅ Trava        | Fontes de pauta Tier 1/2/3 aprovadas + Tier 3.5 ativo (ciclo W26)                             |
| ✅ Trava        | Regra do Reel: tela liberada quando faz sentido narrativo (sem dogma)                         |
| ✅ Trava        | Brasil-only (ADR 0010) — LinkedIn vira PT-BR, EN sai                                          |
| ✅ Trava        | Threads entra como canal novo (ADR 0011) — substitui YouTube, reaproveita LI/IG               |
| ✅ Trava        | Tese central reformulada: "inteligência criativa em escala" (2026-06-27) — substituiu "Curator > operator" na conceituação, CONTEXT, canais, ADRs e teses |
| ✅ Trava        | Copy de produto (i18n `app/messages/` + testes) não usa "Curator"; a tese visível é inteligência criativa em escala |
| 🟡 Em execução | Reescrita da documentação v2 (CONTEXT + ADRs + canais + calendário + ritual + stack + fontes) |
| 🟡 Em execução | Banco de Teses seed (10 teses) + Kanban alinhado                                              |
| ⏸ Congelado    | Produção de copy/execução (até documentação ser aprovada)                                     |
| ⏸ Sem data     | Primeira peça concreta (Jhonatan quer fechar tudo antes)                                      |


---



## 10b. Nota canônica — Estúdio peça na caixa (2026-09-10)

Revisão obrigatória aqui é a confirmação operacional de uma geração cobrada, não um wizard obrigatório para editar briefing. "Versões" designa histórico de revisão e "Criar variação" mantém a base no mesmo Trabalho. A UI não muda o protocolo do rascunho para produzir um filho.

## 10c. Decisão restrita — piloto Jev de revisão semântica (2026-09-22)

O piloto da [spec #465](https://github.com/jhowtkd/adscale/issues/465) observa somente texto de Trabalhos preparados no Protocolo Peça única (`single`), fora do caminho de criação. A primeira etapa (#466) usa snapshots e respostas sintéticos em CLI local, sem rede, banco, dados reais ou efeito em prontidão, geração, cobrança, seleção e exportação. Fatos, briefing e copy vêm do snapshot congelado do Trabalho; fontes só visuais não sustentam alegações. Resultado controlado não autoriza ativação nem equivale a evidência humana.

Uma etapa posterior exige política própria e consentimento para fornecedor, finalidade, marcas, prazo e gasto; a allowlist do ICE-05B (ADR 0018) não concede essa autorização. Quando houver chamada real, a observação usa o journal e o contexto de diagnóstico existentes com `operationKind=semantic_review`, eventos `operation.*` e `model.call.*` sem `stage` e sem texto. `observeModelCall` exige `stage` e não deve ser chamado junto com essa sequência. O contrato v1 congelado pelo ADR 0017 continua intacto; a observação persistida será a autoridade de processamento e o journal será auxiliar. Nenhum destino primário ou módulo de IA paralelo nasce deste piloto.

Na avaliação offline, famílias inteiras ficam em calibração ou holdout, com representante principal escolhido antes dos resultados. Qualquer referência humana futura exige dois revisores distintos e cegos para candidato e baseline; divergências são adjudicadas e ambiguidades continuam explícitas. Rótulos sintéticos de fixture testam instrumentação, não substituem essa referência.

## 11. Links canônicos


| O quê                                    | Onde                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Crença central + tom + identidade verbal | `[marketing/brand/conceituacao.md](marketing/brand/conceituacao.md)`                                 |
| 3 pilares Lab Notes (canônico)           | `[marketing/brand/mensagens-chave.md](marketing/brand/mensagens-chave.md)` v2                        |
| Decisões estratégicas (ADRs)             | `[docs/adr/](docs/adr/)`                                                                             |
| Plano de redes (estratégia)              | `[marketing/social-media/plano-redes-sociais.md](marketing/social-media/plano-redes-sociais.md)`     |
| Cadência semanal Q3                      | `[marketing/social-media/calendario/semanal-v2.md](marketing/social-media/calendario/semanal-v2.md)` |
| Boilerplate cross-canal                  | `[marketing/social-media/canais/_shared.md](marketing/social-media/canais/_shared.md)`               |
| Estratégia Instagram                     | `[marketing/social-media/canais/instagram.md](marketing/social-media/canais/instagram.md)` v2        |
| Estratégia LinkedIn                      | `[marketing/social-media/canais/linkedin.md](marketing/social-media/canais/linkedin.md)` v3          |
| Estratégia Threads                       | `[marketing/social-media/canais/threads.md](marketing/social-media/canais/threads.md)` v1            |
| Estratégia YouTube (congelado Q3)        | `[marketing/social-media/canais/youtube.md](marketing/social-media/canais/youtube.md)` v2 (referência histórica) |
| Plano Q3 unificado                       | `[marketing/2026-Q3/plano-marketing-completo.md](marketing/2026-Q3/plano-marketing-completo.md)` v2  |
| Kanban 4 colunas                         | `[marketing/2026-Q3/kanban/](marketing/2026-Q3/kanban/)`                                             |
| Ritual semanal                           | `[marketing/2026-Q3/ritual-semanal.md](marketing/2026-Q3/ritual-semanal.md)`                         |
| Stack de qualidade                       | `[marketing/2026-Q3/stack-qualidade.md](marketing/2026-Q3/stack-qualidade.md)`                       |
| Fontes de pauta                          | `[marketing/2026-Q3/fontes-pauta.md](marketing/2026-Q3/fontes-pauta.md)`                             |
| Banco de Teses (seed)                    | `[marketing/2026-Q3/banco-teses/](marketing/2026-Q3/banco-teses/)`                                   |
| Identidade visual (tokens)               | `[design.md](design.md)` + `[app/src/app/globals.css](app/src/app/globals.css)`                      |


---

*Mantenido em raiz · PT-BR (EN quando indicado) · Última atualização: 2026-07-18 · Owner: Jhonatan Soares*
