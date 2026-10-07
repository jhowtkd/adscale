# Caminho único: um ADScale só, com a conversa na home e o composer dentro dela

Data: 2026-10-07. Especificação proposta do subprojeto 1 de 3. Nenhuma alteração de aplicação,
migração ou configuração foi feita nesta etapa.

Revisada no mesmo dia, ao escrever o plano da etapa 1
(`docs/superpowers/plans/2026-10-07-caminho-unico-etapa-1-composer.md`). Mudaram o endereço do rascunho, a regra de
tradução, o redirecionamento em `/`, o "Novo trabalho" e o convidado.

Código de referência: `origin/main` em `4b95bdcc`. Contexto: direção de produto de 29/09 e plano do
fluxo 0 (artefatos Traycer `equipe-plano/direcao-produto-29-09` e `equipe-plano/fluxo-0`),
[jhowtkd/adscale#626](https://github.com/jhowtkd/adscale/pull/626) (ticket 11, parte 2) e o runbook
`docs/runbooks/fluxo-0-lancamento.md`.

## Problema

Em 29/09 ficou decidido que o ADScale é um produto só: a home é a conversa com o orquestrador e o
motor de criação do Estúdio vira capacidade dele. O fluxo 0 entregou a porta de entrada (cadastro,
handoff da marca, Biblioteca, diagnóstico grátis) e deixou a produção de peças pelo orquestrador para
um plano próprio, que não foi feito. Para quem paga não perder a criação, o Estúdio antigo continuou
vivo, e a home passou a escolher entre dois produtos: `app/src/app/(dashboard)/page.tsx:21`, com a
regra `usesEquipeProduct` (`app/src/server/equipe/module/free-plan.ts:87`).

Com `EQUIPE_PILOT_WORKSPACES=*` ligado em produção desde 06/10, 22:57 UTC:

| | Estúdio clássico | Conversa nova |
|---|---|---|
| Quem cai aqui | Workspace sem conta viva e com acesso pago (`workspaceHasActivePaidAccess`: assinatura ativa, `past_due` na carência com fatura paga, testador ou algum membro dono da plataforma) | Todo o resto, inclusive cada cadastro novo |
| Home e casca | `DashboardHomeActions` (palco com composer), `AppShell` e `AppSidebar` | `ConversationScreen` e `RailShell` |
| Cria imagem e texto | Sim: Trabalhos e Peças, com créditos | Não |
| Como vira pago | Stripe e créditos | "Fale com a gente"; a conversão é manual, no banco (ticket 18, item 3) |

Sintomas:

- **Nada cria no caminho novo.** O Estrategista não tem ferramenta de criação. `runArtDirection`
  (`app/src/server/equipe/agents/art-direction.ts:23`) só lê o Trabalho, e nada enfileira as tarefas
  `writing` ou `art_direction` (`agents/runner.ts:281`). A conta paga da Equipe só entrega Peças que já
  existem (`module/items-deliver.ts`).
- **Todo "Criar" volta para a conversa.** O composer só existe em `/`, e no caminho novo `/` ignora os
  parâmetros que o abriam (`?compose=1`, `?workId=`, `?mode=arte`). O trabalho não é retomado.
- **Um caminho vaza no outro.** No novo, Criações é a lista de Trabalhos do Estúdio com outro nome, e
  as ações da conta grátis devolvem 402. No clássico aparecem o rótulo "Criações", as telas vazias da
  v4 e Pipeline, Ideias e Metas no menu do celular, que abrem vazias.
- **O dono vê os dois.** Um membro dono da plataforma conta como pagamento
  (`app/src/server/billing/access.ts:238-251`). A Dev Admin vê o Estúdio; uma conta nova vê a conversa.

## Escopo: três subprojetos

1. **Caminho único** (esta spec): uma regra, uma casca e uma home; o composer dentro da casca nova;
   várias marcas por workspace; limpeza do que sobra dos dois caminhos.
2. **Ponte de criação pelo orquestrador**: o Estrategista aciona Direção de arte e Redação sobre o
   mesmo agregado `creative_work`, e as Peças aparecem como cards na conversa e em Criações. Inclui
   juntar o painel de assistente da campanha ao Estrategista. Spec própria.
3. **Dinheiro único**: o que a conta grátis faz, quantas marcas cabem no grátis, como a conta grátis
   vira paga, créditos do Estúdio × contrato da Equipe e o trial de 500 créditos do cadastro. Spec
   própria.

O subprojeto 1 não depende do 2, porque a pessoa continua criando pelo composer.

## Decisões (Jhonatan, 06 e 07/10)

| Pergunta | Decisão |
|---|---|
| Como se cria imagem e texto no produto único? | **Pelos dois caminhos, no mesmo lugar.** A conversa é a porta principal. Criações tem um "Criar" que abre o composer dentro da casca nova, e o orquestrador passa a usar o mesmo motor no subprojeto 2. O que a pessoa e o ADScale fazem aparece junto em Criações, como na v3 (`docs/design/pen/telas-v3/c4-criacoes.png`) e na v4 (`b2-criacoes-vazia-com-iscas.png`, branch `design/pen-v4-primeira-abertura`). |
| Um workspace pode ter várias marcas? | **Várias, cada uma com sua conversa.** Seletor de marca na barra. Cada marca tem conta, handoff, Biblioteca e conversa próprios, e uma marca que já existe entra sem refazer o handoff. |
| Qual abordagem? | **A casca nova absorve o Estúdio.** O composer muda de endereço para `/creative-work/new` e `/creative-work/[id]`, `/` passa a ser só a conversa, e a casca e a home antigas são apagadas no fim. Descartadas: o Estúdio como modo de `/` (mantém `/` com duas funções e não existe na v3) e o composer dentro da conversa (sem desenho; pode voltar no subprojeto 2). |
| As cinco seções do desenho abaixo | Aprovadas uma a uma em 07/10. |

Decisões anteriores que continuam valendo:

- 29/09: produto único, home = conversa, pen.dev v3 como referência de tela, handoff da marca antes
  de tudo, a palavra "Equipe" nunca aparece para o cliente.
- 30/09: quem chega como convidado segue o cadastro e a abertura normais.
- Regra do handoff: nada vira marca sem confirmação num card, e uma decisão da pessoa nunca muda em
  silêncio.

## Desenho

### 1. Visão geral

Uma regra: todo workspace entra no produto único, com a conversa em `/` e a casca nova (`RailShell`),
depois que a pessoa confirma o e-mail. Vale também para quem paga, para os testadores e para a Dev
Admin.

| Lugar | O que vira |
|---|---|
| `/` | A conversa principal da marca ativa |
| Criações (`/campaigns`) | Os Trabalhos da marca ativa (o modo de lista canônica que a tela já usa por padrão). O "Criar" abre o composer |
| `/creative-work/new` e `/creative-work/[id]` | O composer do Estúdio inteiro, dentro da casca nova |
| Biblioteca, Ideias, Metas e Pipeline | Como hoje, sempre da marca ativa |
| Seletor de marca, na barra | Troca a marca ativa |

Não muda neste subprojeto:

- as regras de dinheiro: a conta grátis continua sem criar e com o card do plano, e quem paga
  continua com créditos e Stripe;
- as ferramentas do Estrategista;
- o painel de assistente dentro de uma campanha (`CampaignAssistantPanel`), que fica como ferramenta
  de criação, igual ao composer;
- os filtros de origem da v3 em Criações ("Feito pelo ADScale" e "Feito por você"), que entram com o
  subprojeto 2, quando houver Peças feitas pelo ADScale.

### 2. O composer fora de `/`

**Endereço.**

- A página que já existe, `app/src/app/(dashboard)/creative-work/[id]/page.tsx`, passa a tratar o id
  `new` como Trabalho novo e monta o composer sem `initialWorkId`, o que `useCreativeComposer` já
  aceita.
- Não entra nenhum `page.tsx` novo: `/creative-work/[id]` já é entrada do destino `creative_work_home`
  em `docs/decisions/allowed-primary-destinations.json`.
- O rascunho nasce no primeiro salvamento (`useCreateCreativeWorkDraft`, `POST /api/creative-work`),
  como hoje na home. O composer grava `?workId=<id>` no endereço sem trocar de página
  (`useComposerLocation.exposeWorkId`): fica `/creative-work/new?workId=<id>`, e recarregar volta ao mesmo palco com o
  Trabalho aberto. `/creative-work/<id>` continua sendo a página da Peça, a retomada canônica de Criações e do mosaico
  de Produção.

**O que muda de endereço: o palco inteiro** de `DashboardHomeActions` e `BrandStageHome`:

- o TalkBox com os objetivos (Variações, Peça única, Adaptar formatos, Mudar estilo, Carrossel), os
  anexos e a entrevista de entrada;
- a revisão do plano (`CreativePlanReview`), os resultados (`CreateCampaignDialog`) e o mosaico de
  Inspirações e Produção;
- o "Continuar de onde parei" e o soltar arquivos;
- o `AccessGatePanel` (créditos, checkout ou card do plano);
- as variantes que já existem: `STUDIO_PROGRESSIVE_ROLLOUT_PERCENT`, `STUDIO_CAROUSEL_ROLLOUT_PERCENT`,
  `STUDIO_ENTRY_INTERVIEW_ROLLOUT_PERCENT` e `CREATIVE_WORK_34_CREATION_ENABLED`.

Na etapa 2, quando a barra ganha o seletor de marca, saem do topo do palco o seletor de marca dele e o "Novo
trabalho". Até lá os dois ficam, porque a home clássica ainda usa o mesmo componente. Os parâmetros que a home lia
(`parseDashboardSearchParams`) passam a valer em `/creative-work/new`.

**Caminhos que mudam.** Inventário em `origin/main`; a lista final sai do plano de implementação.

- Links e botões: `campaigns/page.tsx:259` e `:341`, `useCampaignsPage.ts:105`,
  `CampaignWorkspaceV6View.tsx:49`, `CreativeWorkResumeSurface.tsx:70`, `TopBar.tsx:337` e
  `AssistantStartComposer.tsx:238` (este último sai com o `/assistant` clássico).
- Redirecionamentos: `app/next.config.ts:119-121` (`/quick-tools`, `/restyling` e
  `/quick-tools/restyling`), `campaigns/new/page.tsx:8` e `templates/page.tsx:4`.
- Rota de compatibilidade: `/quick-tools/create-post` (`LegacyCreatePostRedirect.tsx`).
- Voltas: `api/creative-work/[id]/copy/route.ts:28`, `application/generate-social-post-copy.ts:100` e o
  `returnPath: "/"` do checkout em `AccessGatePanel.tsx:25`.

Regra de tradução: `/?<consulta>` vira `/creative-work/new?<mesma consulta>`, inclusive com `workId` (o palco com o
Trabalho aberto, como `/` fazia). Além dos links do código, `/` redireciona sozinho os endereços antigos que não dá
para editar: favoritos, e-mails e a volta do login. Continuam em `/` a `?suggestion=` da conversa, o `?workspaceId=`
do convite e o `?guestDraft=` do convidado, até a etapa 4.

**Guarda no CI.** Um teste falha quando o código monta link ou redirecionamento para `/` com consulta, exceto
`?suggestion=` e `?workspaceId=`. Ele não olha `src/components/guest-home`, que sai na etapa 4.

**Conta grátis.**

- Ela abre o composer, mas o card do plano (`FreePlanCta`, com a frase "Criar peças faz parte do plano.") ocupa o
  lugar da caixa, e o `AccessGatePanel` não se repete acima dele.
- O `POST` do rascunho continua recusado com 402 (`refuseOnFreePlan`).
- O "Abrir a conversa" do card leva para `/`, que passa a ser sempre a conversa, então o loop some.

**Visual.** O acabamento é o da home de hoje, a referência dada em 29/09, dentro da casca da v3. A
página do composer na casca e o seletor de marca são desenhados no pen.dev (etapa 0) e aprovados antes
do código. Cada PR de tela leva prints lado a lado.

### 3. Marcas e contas

**Marca ativa.**

- O seletor da barra grava a marca ativa num cookie que o servidor lê. Hoje a marca ativa só existe no
  navegador (`useAppStore.activeClientProfileId`, `useActiveClientProfile`).
- O servidor confere se a marca é do workspace. Sem cookie, ou com uma marca inválida, vale a marca
  mais antiga do workspace.
- A marca ativa substitui toda leitura que hoje pega a conta mais antiga do workspace: conversa
  principal e conversas paralelas (`NewConversationDialog`), Biblioteca (`library/page.tsx:85-96`),
  Criações, Pipeline, Ideias, Metas e composer.

**Uma conta por marca.** Um comando de sistema abre a conta da marca ativa quando ela ainda não tem,
no lugar de `open_free_account` (`module/open-free-account.ts`). Usa a mesma trava por workspace
(`lockWorkspace`, `pg_advisory_xact_lock`) e é idempotente por marca.

- **Quando:** ao carregar `/` com uma marca ativa sem conta, como a abertura grátis faz hoje. Trocar de
  marca no seletor leva para `/`.
- **Telas sem conta:** Criações e Biblioteca leem a marca, não a conta, e funcionam sem ela. Pipeline,
  Ideias e Metas mostram a tela vazia até a conta existir.

São três casos:

- **Workspace sem marca** (cadastro novo): igual a hoje. Cria "Minha marca", a conta, o aprovador, o
  handoff no passo `source` e a conversa principal.
- **Marca que já existe:** a conta abre com o handoff marcado como concluído por importação.
  - A identidade já está no `client_profile`: o Brand Kit e o `saveHandoffIdentity` gravam no mesmo
    lugar.
  - Os arquivos já estão na Biblioteca da marca pela migração `0133_backfill_asset_brands`; os
    ambíguos ficam visíveis para todas as marcas do workspace.
  - Ler o site e o Instagram vira uma isca opcional.
- **"Adicionar marca"**, no seletor: `client_profile` novo, conta nova e handoff do zero. No plano
  grátis, quem tenta adicionar uma segunda marca vê o card do plano.

**Plano grátis × status da conta.**

- Hoje o teto vitalício de US$ 1, o card do plano, a recusa de anexos e o conjunto reduzido de
  ferramentas do Estrategista olham `account.status === "free"`: `agents/chat-turn.ts:242`, `:313`,
  `:341`, `:364`, `:446` e `:469`, `agents/runner.ts:188` e `agents/strategist.ts:271` e `:388`.
- Passam a olhar a regra do plano grátis do workspace (`findFreePlanAccount`), a mesma que já trava o
  Estúdio.
- Um workspace que paga abre as contas com o mesmo status, mas sem teto vitalício e sem card do plano,
  dentro do teto mensal das contas (`EQUIPE_AI_MONTHLY_BUDGET_USD_CENTS`).
- O Estrategista desse workspace continua só conversando, com o contexto da marca, até o subprojeto 2.

**Casos de borda.**

- Duas abas abrindo a mesma marca sem conta: a trava faz uma esperar a outra, e não nasce conta
  duplicada.
- Um workspace que passa a pagar ou deixa de pagar: a regra é lida a cada chamada, então o teto e o
  card mudam sozinhos.
- Marca com conta: o seletor não oferece apagar. Encerrar a conta continua sendo tarefa da operação.

**Não muda:** as contas pagas da Equipe (implantação, calibração, publicação) e os consoles internos,
que já trabalham por conta.

### 4. Limpeza

**Apagar**, sempre só quando nada mais importar o código:

- a home do Estúdio em `/` e `usesEquipeProduct` com as bifurcações que dependem dela (`page.tsx`,
  `(dashboard)/layout.tsx:20`, `assistant/layout.tsx`, `assistant/page.tsx` e a rota de chat
  `api/assistant/threads/[threadId]/chat/route.ts:149-169`), além do ramo `classic_paid_access` da
  abertura;
- a casca antiga: `AppShell`, `AppSidebar`, `V6ShellLayout`, `MobileMoreSheet` e o que só ela usa;
- o `/assistant` clássico (`AssistantMain`, `AssistantShell` e `AssistantStartComposer`);
- código que já está morto: `DashboardV6View`, `MissionCreditBanner`, `ConversionCta`,
  `SidebarAssistantModeSwitch`, `GuestStudioEntry` e a importação de `guestDraft`.

**Vazamentos e loops.**

- Os rótulos e as telas vazias da v4 valem para todo workspace. Os gates de tela que usam
  `isEquipeEnabledForWorkspace` ou `findFreePlanAccount` onde a regra é a do produto deixam de
  bifurcar, por exemplo `campaigns/page.tsx:122-130` e `EquipeNavLinks`.
- Os erros de `/` (`homeVerifyEmail`, `homeOwnerFirst` e `homeOpenError`) ganham uma saída de verdade:
  reenviar a confirmação, dizer quem é o dono, tentar de novo. Hoje a barra (`rail/Rail.tsx:71-77` e
  `:94-110`) e o "Abrir a conversa" voltam para o mesmo erro.
- Marca com conta encerrada: a conversa abre só para leitura, com "Falar com uma pessoa". Hoje
  `open-free-account.ts:28-31` devolve a conversa da conta mais antiga mesmo encerrada, enquanto o
  `FreePlanCta` diz que ela não reabre.

**Pontas soltas.**

- **E-mail de boas-vindas:** fica um só, o do produto novo (`services/email.ts:232-251`). O do
  Estúdio, que fala de 500 créditos, sai, e `auth/index.ts:98` deixa de bifurcar.
- **`/hi`, o Estúdio de convidado:** vem desligado por padrão (`PUBLIC_STUDIO_HOME_ENABLED=false`).
  Quem vier dele segue o cadastro e o handoff. O rascunho de convidado já se perde hoje e não é
  reconectado: `guest-controller.mjs:147` deixa de montar `/?compose=1…&guestDraft=`.
- **Trial de 500 créditos do cadastro** (`auth/index.ts:153-161`): fica como está, sem uso no plano
  grátis. A decisão é do subprojeto 3.

**Documentos.** Passam a descrever o produto único:

- o `PRODUCT.md` e o `CONTEXT.md`, que ainda tratam o Estúdio como a porta do produto e a "Equipe"
  como um serviço com nome;
- as descrições de `creative_work_home` e `equipe` no manifesto de destinos, sem mudar as entradas;
- o `render.yaml` de referência, que ainda mostra a Equipe desligada.

### 5. Ordem, produção e testes

| Etapa | Conteúdo | Por que nessa ordem |
|---|---|---|
| 0 · pen.dev | Página do composer dentro da casca e seletor de marca, aprovados pelo dono | Nenhuma tela nova sem desenho aprovado |
| 1 · Composer fora de `/` | `/creative-work/new`, o palco movido (ainda com o seletor de marca e o "Novo trabalho" dele), os caminhos repontados, o redirecionamento em `/` e a guarda no CI | Acaba com o loop do "Criar" para quem já está no caminho novo e não depende do resto |
| 2 · Marca ativa e conta por marca | Cookie, seletor na barra (o seletor e o "Novo trabalho" do palco saem), comando por marca e plano grátis pela regra do workspace | A Dev Admin precisa entrar com as três marcas funcionando |
| 3 · A virada | `usesEquipeProduct` some; pagantes, testadores e o dono passam para o caminho único; `EQUIPE_ENABLED` vira interruptor de emergência | Só depois de 1 e 2 ninguém perde nada |
| 4 · Limpeza | Tudo da seção 4. O interruptor sai por último, depois de uma semana sem uso | Só se apaga o que nada mais importa |

Cada etapa é um PR e deixa a produção coerente sozinha. O `*` pode continuar ligado: até a etapa 1,
quem se cadastra fica como hoje. Até a etapa 4, desligar em emergência continua sendo
`EQUIPE_ENABLED=false` ou esvaziar a lista, como diz o runbook.

**Testes.**

- **Regras e comandos:**
  - a regra única;
  - a conta por marca nos três casos (workspace novo, marca que já existe, segunda marca no grátis);
  - um cookie apontando para a marca de outro workspace;
  - o teto e o card seguindo o plano do workspace, não o status da conta.
- **Banco real** (Postgres local, bancos `*_test`): duas conexões abrindo a mesma marca ao mesmo tempo
  terminam com uma conta só.
- **E2E com Playwright, uma por jornada:**
  - cadastro novo até o card do plano no composer;
  - workspace pagante gerando uma Peça que aparece em Criações;
  - três marcas, cada uma com sua conversa e sua Biblioteca;
  - links antigos caindo no composer;
  - erros de `/` com saída.
- Os E2E que exigem o composer em `/` passam a usar `/creative-work/new`.
- **Visual:** prints lado a lado com a v3, a v4 e os quadros do pen.dev em cada PR de tela.

**Pronto quando:**

1. Todo workspace (grátis, pagante, testador ou dono) vê a mesma casca e a conversa em `/`.
2. Todo caminho de criação cai no composer, e a Peça aparece em Criações da marca ativa.
3. Nenhuma tela mostra pedaço do outro caminho, e nenhum link volta para a própria página ou para um
   erro sem saída.
4. O dono, entrando como Dev Admin, vê o mesmo produto que um cliente novo vê, com as três marcas.

## Riscos e pontos de atenção

- **Membro dono da plataforma conta como pagamento.** Se o dono entrar num workspace de cliente
  grátis, esse cliente perde o teto e o card. É comportamento herdado; fica registrado para o
  subprojeto 3.
- **Destinos congelados.** O desenho não pede `page.tsx` nem `route.ts` novos. Se o plano precisar de
  um, a exceção é registrada no manifesto antes do código.
- **Contexto da marca importada.** O contexto grátis do Estrategista (`agents/free-context.ts`) supõe
  handoff e diagnóstico. Para uma marca importada, o contexto vem da identidade e da Biblioteca, e o
  plano de implementação precisa cobrir esse caso.
- **Criações por marca.** Hoje a lista canônica é do workspace inteiro. Filtrar pela marca ativa muda
  o que um workspace com várias marcas vê, e isso precisa de teste próprio.

## Fora desta spec

- Criação pela conversa (subprojeto 2).
- Dinheiro (subprojeto 3): limites do grátis, conversão de grátis para paga, créditos × contrato e o
  trial do cadastro.
- Desenho próprio de celular, além da regra de responsividade da v3.
- Os achados F-1 a F-3 do teste de fumaça de 06/10: diagnóstico preso depois de uma queda da Meta,
  chamadas recusadas lançadas no ledger e a falta de um modelo de reserva.
